"""
Local YOLO detector for the ShopGuard on-site agent.

Runs entirely on the shop machine (mini-PC / laptop / Raspberry Pi). Produces a
detection dict in the SAME shape the cloud expects, so the cloud just stores the
result and decides which alerts to fire.
"""
import io
import base64
import numpy as np

# COCO class ids
_PERSON  = [0]
_VEHICLE = [1, 2, 3, 5, 7]    # bicycle, car, motorcycle, bus, truck
_BAG     = [24, 26, 28]        # backpack, handbag, suitcase
_PHONE   = [67]               # cell phone

_VEHICLE_NAMES = {1: "Bicycle", 2: "Car", 3: "Motorcycle", 5: "Bus", 7: "Truck"}
_BAG_NAMES     = {24: "Backpack", 26: "Handbag", 28: "Suitcase"}

_COLORS = {
    "person_zone": (255, 255, 255),
    "person":      (140, 140, 140),
    "vehicle":     (74, 151, 201),   # gold-ish BGR
    "bag":         (160, 160, 160),
    "phone":       (90, 90, 200),
}


class Detector:
    def __init__(self, model_path="yolov8n.pt", conf=0.4):
        from ultralytics import YOLO
        self.model = YOLO(model_path)
        self.conf  = conf
        self._prev = {}  # serial -> small grayscale frame, for motion scoring

    # ── helpers ────────────────────────────────────────────────────────────────
    @staticmethod
    def _in_zone(cx, cy, zones):
        for z in zones:
            if z["x1"] <= cx <= z["x2"] and z["y1"] <= cy <= z["y2"]:
                return True
        return False

    def _motion(self, serial, frame_bgr):
        import cv2
        small = cv2.resize(cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY), (160, 90)).astype(float)
        prev  = self._prev.get(serial)
        self._prev[serial] = small
        if prev is None:
            return 0.0
        return float(np.abs(small - prev).mean() / 255.0)

    @staticmethod
    def _encode(frame_bgr, quality):
        import cv2
        ok, buf = cv2.imencode(".jpg", frame_bgr, [cv2.IMWRITE_JPEG_QUALITY, quality])
        if not ok:
            return ""
        return base64.b64encode(buf.tobytes()).decode()

    # ── main ───────────────────────────────────────────────────────────────────
    def analyze(self, serial, frame_bgr, zones, features, jpeg_quality=70):
        import cv2

        active = list(_PERSON)
        if features.get("vehicle"): active += _VEHICLE
        if features.get("product"): active += _BAG
        if features.get("staff"):   active += _PHONE
        active = list(set(active))

        h, w = frame_bgr.shape[:2]
        results = self.model(frame_bgr, classes=active, verbose=False, conf=self.conf)

        persons, vehicles, bags, phones = [], [], [], []
        for box in results[0].boxes:
            cls  = int(box.cls[0])
            conf = float(box.conf[0])
            x1, y1, x2, y2 = [float(v) for v in box.xyxy[0]]
            cx, cy = (x1 + x2) / 2 / w, (y1 + y2) / 2 / h
            det = {"bbox": [x1, y1, x2, y2], "confidence": conf,
                   "in_zone": self._in_zone(cx, cy, zones)}
            if cls in _PERSON:
                persons.append(det)
            elif cls in _VEHICLE:
                det["label"] = _VEHICLE_NAMES.get(cls, "Vehicle"); vehicles.append(det)
            elif cls in _BAG:
                det["label"] = _BAG_NAMES.get(cls, "Bag"); bags.append(det)
            elif cls in _PHONE:
                phones.append(det)

        annotated = frame_bgr.copy()
        self._draw(annotated, persons, vehicles, bags, phones)
        annotated_b64 = self._encode(annotated, jpeg_quality) if (persons or vehicles or bags or phones) else ""
        snapshot_b64  = self._encode(frame_bgr, jpeg_quality)

        return {
            "detection": {
                "person_count":    len(persons),
                "vehicle_count":   len(vehicles),
                "bag_count":       len(bags),
                "phone_count":     len(phones),
                "persons":         [{"confidence": p["confidence"], "in_zone": p["in_zone"]} for p in persons],
                "vehicles":        [{"confidence": v["confidence"], "label": v["label"]} for v in vehicles],
                "bags":            [{"confidence": b["confidence"]} for b in bags],
                "phones":          [{"confidence": p["confidence"]} for p in phones],
                "in_zone_count":   sum(1 for p in persons if p["in_zone"]),
                "vehicle_in_zone": sum(1 for v in vehicles if v["in_zone"]),
                "motion_score":    self._motion(serial, frame_bgr),
                "annotated_b64":   annotated_b64,
            },
            "snapshot_b64": annotated_b64 or snapshot_b64,
        }

    @staticmethod
    def _draw(img, persons, vehicles, bags, phones):
        import cv2

        def box(d, color, label):
            x1, y1, x2, y2 = [int(v) for v in d["bbox"]]
            cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)
            cv2.putText(img, f"{label} {d['confidence']:.0%}", (x1 + 2, max(12, y1 - 6)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1, cv2.LINE_AA)

        for p in persons:
            box(p, _COLORS["person_zone"] if p["in_zone"] else _COLORS["person"], "Person")
        for v in vehicles:
            box(v, _COLORS["vehicle"], v.get("label", "Vehicle"))
        for b in bags:
            box(b, _COLORS["bag"], b.get("label", "Bag"))
        for ph in phones:
            box(ph, _COLORS["phone"], "Phone")
