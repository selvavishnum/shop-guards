import time
import json
import smtplib
import base64
import threading
import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage

from database import get_setting, save_alert, inc_daily, inc_empty_scans, reset_empty_scans, get_camera

_cooldowns: dict[str, float] = {}
_ws_listeners: list = []

ALERT_LABELS = {
    "intrusion":         "Zone Intrusion",
    "after_hours":       "After-Hours Alert",
    "crowd":             "Crowd Alert",
    "customer_entry":    "Customer Entry",
    "drawer_open":       "Cash Drawer Opened",
    "drawer_no_customer":"Drawer Opened — No Customer",
    "misbehavior":       "Staff Misbehavior",
    "staff_idle":        "Staff Idle Alert",
    "vehicle_detected":  "Vehicle Detected",
    "phone_use":         "Phone Use Detected",
    "bag_suspicious":    "Suspicious Bag",
    "print_failed":      "Bill Print Failed",
}


def register_ws(q):   _ws_listeners.append(q)
def unregister_ws(q):
    try: _ws_listeners.remove(q)
    except ValueError: pass


async def broadcast(event: dict):
    for q in list(_ws_listeners):
        try: await q.put(event)
        except Exception: pass


def _cooled(key: str, secs: int) -> bool:
    return time.time() - _cooldowns.get(key, 0) < secs

def _mark(key: str):
    _cooldowns[key] = time.time()


async def process(serial: str, name: str, detection: dict, cam: dict):
    monitor  = cam.get("monitor_type", "theft")
    features = json.loads(cam.get("features") or "{}") or {"theft": True}
    zones    = json.loads(cam.get("zones", "[]"))

    settings   = {k: get_setting(k) for k in
                  ["shop_open","shop_close","alert_cooldown","crowd_threshold","idle_threshold"]}
    shop_open  = settings["shop_open"]  or "08:00"
    shop_close = settings["shop_close"] or "22:00"
    cooldown   = int(settings["alert_cooldown"]  or 180)
    crowd_th   = int(settings["crowd_threshold"] or 5)
    idle_th    = int(settings["idle_threshold"]  or 5)

    count         = detection["person_count"]
    vehicle_count = detection["vehicle_count"]
    phone_count   = detection["phone_count"]
    bag_count     = detection["bag_count"]
    in_zone       = detection["in_zone_count"]
    vehicle_zone  = detection["vehicle_in_zone"]
    motion        = detection["motion_score"]
    b64           = detection["annotated_b64"]
    conf          = max((p["confidence"] for p in detection["persons"]), default=0.0)

    now_t    = datetime.datetime.now().strftime("%H:%M")
    in_hours = shop_open <= now_t <= shop_close

    triggered = []

    if features.get("theft", True):
        if in_zone > 0 and not _cooled(f"{serial}:intrusion", cooldown):
            triggered.append("intrusion"); _mark(f"{serial}:intrusion")
        if count > 0 and not in_hours and not _cooled(f"{serial}:after_hours", cooldown):
            triggered.append("after_hours"); _mark(f"{serial}:after_hours")
        if count >= crowd_th and not _cooled(f"{serial}:crowd", cooldown * 2):
            triggered.append("crowd"); _mark(f"{serial}:crowd")

    if features.get("vehicle") and vehicle_count > 0:
        if not _cooled(f"{serial}:vehicle", cooldown):
            triggered.append("vehicle_detected"); _mark(f"{serial}:vehicle")
            inc_daily(serial, "vehicle")

    if features.get("staff"):
        if phone_count > 0 and not _cooled(f"{serial}:phone", cooldown):
            triggered.append("phone_use"); _mark(f"{serial}:phone")
        if count >= 2 and motion > 0.10 and not _cooled(f"{serial}:misbehavior", cooldown):
            triggered.append("misbehavior"); _mark(f"{serial}:misbehavior")
        if count == 0 and in_hours:
            inc_empty_scans(serial)
            cam_row = get_camera(serial)
            if cam_row and cam_row["empty_scans"] >= idle_th:
                if not _cooled(f"{serial}:staff_idle", cooldown * 2):
                    triggered.append("staff_idle"); _mark(f"{serial}:staff_idle")
        elif count > 0:
            reset_empty_scans(serial)

    if features.get("product") and bag_count > 0 and in_zone:
        if not _cooled(f"{serial}:bag", cooldown):
            triggered.append("bag_suspicious"); _mark(f"{serial}:bag")

    if monitor == "customer_count":
        if count > 0 and not _cooled(f"{serial}:customer_entry", 30):
            inc_daily(serial, "customer"); _mark(f"{serial}:customer_entry")
            triggered.append("customer_entry")

    if monitor == "cash_drawer":
        if in_zone > 0 and motion > 0.06 and not _cooled(f"{serial}:drawer_open", 30):
            inc_daily(serial, "drawer"); _mark(f"{serial}:drawer_open")
            # <=1 person means only the cashier — drawer opened with no customer
            # at the counter is the suspicious case owners care about most.
            if count <= 1:
                triggered.append("drawer_no_customer")
            else:
                triggered.append("drawer_open")
        if in_zone > 0 and not in_hours and not _cooled(f"{serial}:after_hours", cooldown):
            triggered.append("after_hours"); _mark(f"{serial}:after_hours")

    for alert_type in triggered:
        save_alert(serial, name, alert_type, monitor, count, conf, b64, vehicle_count)
        event = {
            "type":          "alert",
            "camera_serial": serial,
            "camera_name":   name,
            "alert_type":    alert_type,
            "monitor_type":  monitor,
            "person_count":  count,
            "vehicle_count": vehicle_count,
            "time":          time.strftime("%Y-%m-%d %H:%M:%S"),
        }
        await broadcast(event)
        threading.Thread(target=_send_email, args=(event, b64), daemon=True).start()


async def raise_custom(serial: str, name: str, alert_type: str, monitor_type: str, extra: dict | None = None):
    """For alerts not tied to a camera-frame detection — e.g. a billing
    printer that failed to print a bill. Saves + broadcasts + emails exactly
    like a detection alert, just without person/vehicle counts or a snapshot."""
    save_alert(serial, name, alert_type, monitor_type, 0, 1.0, "", 0)
    event = {
        "type":          "alert",
        "camera_serial": serial,
        "camera_name":   name,
        "alert_type":    alert_type,
        "monitor_type":  monitor_type,
        "person_count":  0,
        "vehicle_count": 0,
        "time":          time.strftime("%Y-%m-%d %H:%M:%S"),
        **(extra or {}),
    }
    await broadcast(event)
    threading.Thread(target=_send_email, args=(event, ""), daemon=True).start()


def _send_email(event: dict, b64: str):
    efrom = get_setting("email_from")
    epw   = get_setting("email_password")
    eto   = get_setting("email_to")
    if not all([efrom, epw, eto]):
        return
    label   = ALERT_LABELS.get(event["alert_type"], event["alert_type"])
    subject = f"[ShopGuard] {label} — {event['camera_name']}"
    lines   = [
        f"Alert:    {label}",
        f"Camera:   {event['camera_name']}",
    ]
    if event["alert_type"] == "print_failed":
        if event.get("print_document"):
            lines.append(f"Bill:     {event['print_document']}")
        if event.get("print_reason"):
            lines.append(f"Reason:   {event['print_reason']}")
    else:
        lines.append(f"Persons:  {event['person_count']}")
        lines.append(f"Vehicles: {event.get('vehicle_count', 0)}")
    lines.append(f"Time:     {event['time']}")
    body = "\n".join(lines) + "\n"
    msg = MIMEMultipart()
    msg["From"], msg["To"], msg["Subject"] = efrom, eto, subject
    msg.attach(MIMEText(body))
    if b64:
        try: msg.attach(MIMEImage(base64.b64decode(b64), name="snapshot.jpg"))
        except Exception: pass
    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=10) as s:
            s.login(efrom, epw)
            s.sendmail(efrom, eto, msg.as_string())
    except Exception:
        pass
