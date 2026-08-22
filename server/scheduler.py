import asyncio
import io
import json
import base64
import time
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from database import get_cameras, get_setting, update_snapshot
import rtsp_client
import ezviz_client
import ai_detector
import alert_manager

_scheduler: AsyncIOScheduler | None = None


async def _scan_camera(cam: dict):
    serial  = cam["serial"]
    name    = cam.get("name", serial)
    source  = cam.get("source", "rtsp")

    # Cameras driven by the on-site agent push to /api/ingest instead — skip here.
    if source == "agent":
        return

    zones    = json.loads(cam.get("zones", "[]"))
    monitor  = cam.get("monitor_type", "theft")
    features = json.loads(cam.get("features") or "{}") or {"theft": True}

    try:
        if source == "ezviz_cloud":
            ezviz_serial = cam.get("ezviz_serial", "")
            if not ezviz_serial:
                return
            image = await ezviz_client.capture_frame(ezviz_serial, int(cam.get("ezviz_channel", 1)))
        else:
            rtsp = cam.get("rtsp_url", "")
            if not rtsp or not rtsp.startswith("rtsp://"):
                return
            image = await rtsp_client.capture_frame(rtsp)

        if image is None:
            return

        detection = ai_detector.analyze(serial, image, zones, monitor, features)

        snap_b64 = detection["annotated_b64"]
        if not snap_b64:
            buf = io.BytesIO()
            image.save(buf, format="JPEG", quality=60)
            snap_b64 = base64.b64encode(buf.getvalue()).decode()

        update_snapshot(serial, snap_b64)

        await alert_manager.broadcast({
            "type":          "snapshot",
            "camera_serial": serial,
            "camera_name":   name,
            "b64":           snap_b64,
            "person_count":  detection["person_count"],
            "vehicle_count": detection["vehicle_count"],
            "timestamp":     time.strftime("%H:%M:%S"),
        })

        await alert_manager.process(serial, name, detection, cam)

    except Exception:
        pass


async def _scan_all():
    cameras = [c for c in get_cameras() if c.get("enabled", 1)]
    if not cameras:
        return
    for i in range(0, len(cameras), 5):
        batch = cameras[i:i + 5]
        await asyncio.gather(*[_scan_camera(c) for c in batch])
        if i + 5 < len(cameras):
            await asyncio.sleep(1)


def start_scheduler():
    global _scheduler
    interval = int(get_setting("scan_interval") or 60)
    _scheduler = AsyncIOScheduler()
    _scheduler.add_job(_scan_all, "interval", seconds=interval, id="scan_all", replace_existing=True)
    _scheduler.start()


def stop_scheduler():
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)


def update_interval(seconds: int):
    global _scheduler
    if _scheduler:
        _scheduler.reschedule_job("scan_all", trigger="interval", seconds=seconds)
