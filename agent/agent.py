#!/usr/bin/env python3
"""
ShopGuard On-Site AI Agent
==========================

Runs INSIDE your shop on a mini-PC / laptop / Raspberry Pi. It:

  1. Connects to your cameras over the LOCAL network (192.168.x.x works here,
     so NO port-forwarding is needed and RTSP passwords never leave the shop).
  2. Keeps each camera connection open continuously for a smooth, always-on feed.
  3. Runs YOLO object detection locally (uses your machine's CPU/GPU, not the cloud).
  4. Pushes only the results + a snapshot JPEG to your cloud dashboard.

The dashboard (Render) shows live snapshots, fires alerts, and stores analytics —
exactly as before — but the heavy AI work happens here, for free.

Usage:
    python agent.py --config config.yaml
"""
import argparse
import base64
import json
import threading
import time
import sys

import yaml
import requests

from detector import Detector


# ── Logging ──────────────────────────────────────────────────────────────────
def log(msg, cam=""):
    ts = time.strftime("%H:%M:%S")
    tag = f"[{cam}] " if cam else ""
    print(f"{ts} {tag}{msg}", flush=True)


# ── Attendance cooldown (shared across all camera workers) ──────────────────
# Prevents the same staff member being logged twice in quick succession —
# whether from one camera scanning repeatedly, or several cameras seeing the
# same face at once.
_attendance_lock      = threading.Lock()
_attendance_last_seen = {}  # staff_id -> unix time


def _attendance_cooldown_ok(staff_id, secs):
    now = time.time()
    with _attendance_lock:
        last = _attendance_last_seen.get(staff_id, 0)
        if now - last < secs:
            return False
        _attendance_last_seen[staff_id] = now
        return True


# ── Staff directory sync ─────────────────────────────────────────────────────
class StaffDirectory:
    """Enrolls staff photos uploaded from the dashboard (computes their ArcFace
    embedding locally) and caches enrolled embeddings for matching."""

    def __init__(self, cloud_url, agent_key, face_engine, interval=30):
        self.base     = cloud_url.rstrip("/")
        self.headers  = {"X-Agent-Key": agent_key}
        self.engine   = face_engine
        self.interval = interval
        self._lock     = threading.Lock()
        self._enrolled = []
        self._last     = 0

    def enrolled(self):
        with self._lock:
            return list(self._enrolled)

    def maybe_refresh(self):
        if time.time() - self._last < self.interval:
            return
        self._last = time.time()
        self._enroll_pending()
        self._refresh_enrolled()

    def _enroll_pending(self):
        try:
            r = requests.get(f"{self.base}/api/staff/pending", headers=self.headers, timeout=10)
            r.raise_for_status()
            pending = r.json().get("staff", [])
        except Exception as e:
            log(f"staff sync failed: {e}")
            return

        if not pending:
            return

        import cv2
        import numpy as np

        for person in pending:
            try:
                raw = base64.b64decode(person["face_b64"])
                arr = np.frombuffer(raw, dtype=np.uint8)
                img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                faces = self.engine.detect(img) if img is not None else []
                if not faces:
                    log(f"no face found in enrollment photo for '{person['name']}' — use a clearer front-facing photo")
                    continue
                faces.sort(key=lambda f: f["det_score"], reverse=True)
                embedding = faces[0]["embedding"].tolist()
                requests.post(
                    f"{self.base}/api/staff/{person['id']}/embedding",
                    json={"embedding": embedding}, headers=self.headers, timeout=10,
                )
                log(f"enrolled face for '{person['name']}'")
            except Exception as e:
                log(f"enrollment failed for '{person.get('name')}': {e}")

    def _refresh_enrolled(self):
        try:
            r = requests.get(f"{self.base}/api/staff/enrolled", headers=self.headers, timeout=10)
            r.raise_for_status()
            with self._lock:
                self._enrolled = r.json().get("staff", [])
        except Exception as e:
            log(f"enrolled staff fetch failed: {e}")


# ── Cloud config sync ────────────────────────────────────────────────────────
class ConfigSync:
    """Periodically pulls camera features/zones/monitor_type from the dashboard so
    toggles you flip in the web UI take effect on the agent automatically."""

    def __init__(self, cloud_url, interval=30):
        self.url      = cloud_url.rstrip("/") + "/api/cameras"
        self.interval = interval
        self._lock    = threading.Lock()
        self._by_serial = {}
        self._last    = 0

    def overrides_for(self, serial):
        with self._lock:
            return self._by_serial.get(serial)

    def maybe_refresh(self):
        if time.time() - self._last < self.interval:
            return
        self._last = time.time()
        try:
            r = requests.get(self.url, timeout=8)
            r.raise_for_status()
            cams = r.json().get("cameras", [])
            mapping = {}
            for c in cams:
                try:
                    feats = json.loads(c.get("features") or "{}")
                except Exception:
                    feats = {}
                try:
                    zones = json.loads(c.get("zones") or "[]")
                except Exception:
                    zones = []
                mapping[c["serial"]] = {
                    "features":     feats,
                    "zones":        zones,
                    "monitor_type": c.get("monitor_type"),
                    "enabled":      c.get("enabled", 1),
                }
            with self._lock:
                self._by_serial = mapping
        except Exception as e:
            log(f"config sync failed: {e}")


# ── Per-camera worker ────────────────────────────────────────────────────────
class CameraWorker(threading.Thread):
    def __init__(self, cam, cfg, detector, sync, face_engine=None, staff_dir=None):
        super().__init__(daemon=True)
        self.cam         = cam
        self.cfg         = cfg
        self.detector    = detector
        self.sync        = sync
        self.face_engine = face_engine
        self.staff_dir   = staff_dir
        self.serial      = cam["serial"]
        self.rtsp        = cam["rtsp_url"]
        self._cap        = None
        self._stop       = threading.Event()

    # ---- camera connection (kept open for a smooth feed) --------------------
    def _open(self):
        import cv2
        self._release()
        cap = cv2.VideoCapture(self.rtsp, cv2.CAP_FFMPEG)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        try:
            cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 8000)
            cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 8000)
        except Exception:
            pass
        if cap.isOpened():
            self._cap = cap
            log("connected", self.serial)
            return True
        cap.release()
        return False

    def _release(self):
        if self._cap is not None:
            try: self._cap.release()
            except Exception: pass
            self._cap = None

    def _grab_latest(self):
        """Read the freshest frame, draining any buffered/stale frames."""
        if self._cap is None:
            return None
        frame = None
        for _ in range(3):              # drain buffer -> low latency
            ok, f = self._cap.read()
            if ok:
                frame = f
            else:
                return None
        return frame

    # ---- effective settings (cloud overrides local config) ------------------
    def _effective(self):
        ov = self.sync.overrides_for(self.serial) or {}
        features = ov.get("features") or self.cam.get("features") or {"theft": True}
        zones    = ov.get("zones")    if ov.get("zones") is not None else self.cam.get("zones", [])
        monitor  = ov.get("monitor_type") or self.cam.get("monitor_type", "theft")
        enabled  = ov.get("enabled", 1)
        return features, zones, monitor, enabled

    # ---- upload -------------------------------------------------------------
    def _upload(self, result, monitor, features):
        payload = {
            "serial":       self.serial,
            "name":         self.cam.get("name", self.serial),
            "location":     self.cam.get("location", ""),
            "monitor_type": monitor,
            "features":     json.dumps(features),
            "snapshot_b64": result["snapshot_b64"],
            "detection":    result["detection"],
        }
        url     = self.cfg["cloud_url"].rstrip("/") + "/api/ingest"
        headers = {"X-Agent-Key": self.cfg["agent_key"]}
        delay = 2
        for attempt in range(3):
            try:
                r = requests.post(url, json=payload, headers=headers, timeout=15)
                if r.status_code == 401:
                    log("UPLOAD REJECTED — agent_key does not match dashboard", self.serial)
                    return
                r.raise_for_status()
                return
            except Exception as e:
                if attempt == 2:
                    log(f"upload failed: {e}", self.serial)
                else:
                    time.sleep(delay); delay *= 2

    # ---- face recognition -> attendance --------------------------------------
    def _process_faces(self, frame):
        if self.face_engine is None or self.staff_dir is None:
            return
        try:
            faces = self.face_engine.detect(frame)
        except Exception as e:
            log(f"face detect error: {e}", self.serial)
            return
        if not faces:
            return

        enrolled = self.staff_dir.enrolled()
        if not enrolled:
            return

        threshold = float(self.cfg.get("face_threshold", 0.40))
        cooldown  = int(self.cfg.get("attendance_cooldown", 120))

        from face_engine import FaceEngine
        for f in faces:
            staff, score = FaceEngine.best_match(f["embedding"], enrolled, threshold)
            if staff and _attendance_cooldown_ok(staff["id"], cooldown):
                self._log_attendance(staff, score)

    def _log_attendance(self, staff, score):
        payload = {
            "staff_id":      staff["id"],
            "staff_name":    staff["name"],
            "camera_serial": self.serial,
            "confidence":    round(score, 3),
        }
        url     = self.cfg["cloud_url"].rstrip("/") + "/api/attendance/log"
        headers = {"X-Agent-Key": self.cfg["agent_key"]}
        try:
            r = requests.post(url, json=payload, headers=headers, timeout=10)
            r.raise_for_status()
            event = r.json().get("event_type", "?")
            log(f"attendance: {staff['name']} -> {event} ({score:.2f})", self.serial)
        except Exception as e:
            log(f"attendance upload failed: {e}", self.serial)

    # ---- main loop ----------------------------------------------------------
    def run(self):
        interval     = float(self.cfg.get("scan_interval", 5))
        jpeg_quality = int(self.cfg.get("jpeg_quality", 70))
        backoff      = 3

        while not self._stop.is_set():
            if self._cap is None:
                if not self._open():
                    log(f"connect failed, retry in {backoff}s", self.serial)
                    self._stop.wait(backoff)
                    backoff = min(backoff * 2, 60)
                    continue
                backoff = 3

            self.sync.maybe_refresh()
            if self.staff_dir is not None:
                self.staff_dir.maybe_refresh()
            features, zones, monitor, enabled = self._effective()

            if not enabled:
                self._stop.wait(interval)
                continue

            frame = self._grab_latest()
            if frame is None:
                log("stream dropped, reconnecting", self.serial)
                self._release()
                continue

            try:
                result = self.detector.analyze(self.serial, frame, zones, features, jpeg_quality)
                self._upload(result, monitor, features)
                d = result["detection"]
                if d["person_count"] or d["vehicle_count"]:
                    log(f"{d['person_count']}P {d['vehicle_count']}V", self.serial)
                if features.get("face"):
                    self._process_faces(frame)
            except Exception as e:
                log(f"analyze error: {e}", self.serial)

            self._stop.wait(interval)

        self._release()

    def stop(self):
        self._stop.set()


# ── Entry point ──────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(description="ShopGuard On-Site AI Agent")
    ap.add_argument("--config", default="config.yaml", help="path to config.yaml")
    args = ap.parse_args()

    with open(args.config) as f:
        cfg = yaml.safe_load(f)

    for required in ("cloud_url", "agent_key", "cameras"):
        if not cfg.get(required):
            log(f"FATAL: '{required}' missing in {args.config}")
            sys.exit(1)

    if cfg["agent_key"] in ("CHANGE_ME", "", None):
        log("FATAL: set 'agent_key' in config.yaml (copy it from the dashboard).")
        sys.exit(1)

    log(f"Loading model '{cfg.get('model', 'yolov8n.pt')}' …")
    detector = Detector(cfg.get("model", "yolov8n.pt"), conf=float(cfg.get("conf", 0.4)))
    sync     = ConfigSync(cfg["cloud_url"], int(cfg.get("config_sync_interval", 30)))
    sync.maybe_refresh()

    face_engine = None
    staff_dir   = None
    if cfg.get("enable_face"):
        try:
            log("Loading face recognition engine (first run downloads ~300MB models)…")
            from face_engine import FaceEngine
            face_engine = FaceEngine()
            staff_dir = StaffDirectory(
                cfg["cloud_url"], cfg["agent_key"], face_engine,
                int(cfg.get("staff_sync_interval", 30)),
            )
            staff_dir.maybe_refresh()
            log(f"Face recognition ready — {len(staff_dir.enrolled())} staff enrolled")
        except Exception as e:
            log(f"Face engine failed to load, continuing without attendance: {e}")
            face_engine, staff_dir = None, None

    log(f"Cloud: {cfg['cloud_url']}")
    log(f"Cameras: {len(cfg['cameras'])} · scan every {cfg.get('scan_interval', 5)}s")

    workers = []
    for cam in cfg["cameras"]:
        if not cam.get("rtsp_url"):
            log(f"skipping '{cam.get('serial')}' — no rtsp_url")
            continue
        cam.setdefault("features", {"theft": True})
        cam.setdefault("zones", [])
        w = CameraWorker(cam, cfg, detector, sync, face_engine, staff_dir)
        w.start()
        workers.append(w)

    if not workers:
        log("No valid cameras configured. Exiting.")
        sys.exit(1)

    log("Agent running. Press Ctrl+C to stop.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        log("Shutting down …")
        for w in workers:
            w.stop()
        for w in workers:
            w.join(timeout=5)
        log("Stopped.")


if __name__ == "__main__":
    main()
