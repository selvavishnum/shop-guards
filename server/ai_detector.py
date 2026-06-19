import io
import json
import base64
import numpy as np
from PIL import Image, ImageDraw

_model = None
_prev_frames: dict[str, np.ndarray] = {}

_PERSON  = [0]
_VEHICLE = [1, 2, 3, 5, 7]   # bicycle, car, motorcycle, bus, truck
_BAG     = [24, 26, 28]       # backpack, handbag, suitcase
_PHONE   = [67]               # cell phone

_VEHICLE_NAMES = {1:"Bicycle",2:"Car",3:"Motorcycle",5:"Bus",7:"Truck"}
_BAG_NAMES     = {24:"Backpack",26:"Handbag",28:"Suitcase"}


def _get_model():
    global _model
    if _model is None:
        from ultralytics import YOLO
        _model = YOLO("yolov8n.pt")
    return _model


def _in_zone(cx: float, cy: float, zones: list) -> bool:
    for z in zones:
        if z["x1"] <= cx <= z["x2"] and z["y1"] <= cy <= z["y2"]:
            return True
    return False


def _motion_score(serial: str, image: Image.Image) -> float:
    small = np.array(image.resize((160, 90)).convert("L"), dtype=float)
    prev  = _prev_frames.get(serial)
    _prev_frames[serial] = small
    if prev is None:
        return 0.0
    return float(np.abs(small - prev).mean() / 255.0)


def _annotate(image: Image.Image, persons, vehicles, bags, phones) -> str:
    draw = ImageDraw.Draw(image)

    def _box(det, color, label):
        x1, y1, x2, y2 = det["bbox"]
        draw.rectangle([x1, y1, x2, y2], outline=color, width=2)
        draw.text((x1 + 2, max(0, y1 - 13)), f"{label} {det['confidence']:.0%}", fill=color)

    for p in persons:
        _box(p, "#ffffff" if p.get("in_zone") else "#909090", "Person")
    for v in vehicles:
        _box(v, "#c0c0c0", v.get("label", "Vehicle"))
    for b in bags:
        _box(b, "#a0a0a0", b.get("label", "Bag"))
    for ph in phones:
        _box(ph, "#808080", "Phone")

    buf = io.BytesIO()
    image.save(buf, format="JPEG", quality=75)
    return base64.b64encode(buf.getvalue()).decode()


def analyze(serial: str, image: Image.Image, zones: list, monitor_type: str,
            features: dict | None = None) -> dict:
    if features is None:
        features = {"theft": True}

    active_classes = list(_PERSON)
    if features.get("vehicle"):         active_classes += _VEHICLE
    if features.get("product"):         active_classes += _BAG
    if features.get("staff"):           active_classes += _PHONE
    active_classes = list(set(active_classes))

    model   = _get_model()
    results = model(image, classes=active_classes, verbose=False, conf=0.4)

    persons, vehicles, bags, phones = [], [], [], []
    w, h = image.size

    for box in results[0].boxes:
        cls  = int(box.cls[0])
        conf = float(box.conf[0])
        x1, y1, x2, y2 = [float(v) for v in box.xyxy[0]]
        cx, cy = (x1 + x2) / 2 / w, (y1 + y2) / 2 / h
        det = {"bbox": [x1,y1,x2,y2], "confidence": conf,
               "in_zone": _in_zone(cx, cy, zones), "cx": cx, "cy": cy}
        if cls in _PERSON:
            persons.append(det)
        elif cls in _VEHICLE:
            det["label"] = _VEHICLE_NAMES.get(cls, "Vehicle")
            vehicles.append(det)
        elif cls in _BAG:
            det["label"] = _BAG_NAMES.get(cls, "Bag")
            bags.append(det)
        elif cls in _PHONE:
            phones.append(det)

    motion = _motion_score(serial, image)
    b64    = _annotate(image.copy(), persons, vehicles, bags, phones) if (persons or vehicles or bags or phones) else ""

    return {
        "person_count":    len(persons),
        "vehicle_count":   len(vehicles),
        "bag_count":       len(bags),
        "phone_count":     len(phones),
        "persons":         persons,
        "vehicles":        vehicles,
        "bags":            bags,
        "phones":          phones,
        "in_zone_count":   sum(1 for p in persons if p["in_zone"]),
        "vehicle_in_zone": sum(1 for v in vehicles if v["in_zone"]),
        "motion_score":    motion,
        "annotated_b64":   b64,
        "monitor_type":    monitor_type,
    }
