import io
import base64
import numpy as np
from PIL import Image, ImageDraw

_model = None
_prev_frames: dict[str, np.ndarray] = {}


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


def _annotate(image: Image.Image, persons: list) -> str:
    draw = ImageDraw.Draw(image)
    for p in persons:
        x1, y1, x2, y2 = p["bbox"]
        color = "#ef4444" if p.get("in_zone") else "#22c55e"
        draw.rectangle([x1, y1, x2, y2], outline=color, width=3)
        draw.text((x1 + 2, max(0, y1 - 14)), f"{p['confidence']:.0%}", fill=color)
    buf = io.BytesIO()
    image.save(buf, format="JPEG", quality=75)
    return base64.b64encode(buf.getvalue()).decode()


def _motion_score(serial: str, image: Image.Image) -> float:
    small = np.array(image.resize((160, 90)).convert("L"), dtype=float)
    prev = _prev_frames.get(serial)
    _prev_frames[serial] = small
    if prev is None:
        return 0.0
    return float(np.abs(small - prev).mean() / 255.0)


def analyze(serial: str, image: Image.Image, zones: list, monitor_type: str) -> dict:
    model = _get_model()
    results = model(image, classes=[0], verbose=False, conf=0.4)

    persons, w, h = [], *image.size,
    for box in results[0].boxes:
        x1, y1, x2, y2 = [float(v) for v in box.xyxy[0]]
        conf = float(box.conf[0])
        cx, cy = (x1 + x2) / 2 / w, (y1 + y2) / 2 / h
        persons.append({
            "bbox": [x1, y1, x2, y2],
            "confidence": conf,
            "in_zone": _in_zone(cx, cy, zones),
        })

    motion = _motion_score(serial, image)
    b64 = _annotate(image.copy(), persons) if persons else ""

    return {
        "person_count": len(persons),
        "persons": persons,
        "in_zone_count": sum(1 for p in persons if p["in_zone"]),
        "motion_score": motion,
        "annotated_b64": b64,
        "monitor_type": monitor_type,
    }
