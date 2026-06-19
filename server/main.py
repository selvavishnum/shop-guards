import asyncio
import json
import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

load_dotenv()

import database
import rtsp_client
import scheduler
import alert_manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    database.init_db()
    _seed_env_settings()
    try:
        scheduler.start_scheduler()
    except Exception:
        pass
    yield
    scheduler.stop_scheduler()


def _seed_env_settings():
    for key, env in [
        ("email_from",     "EMAIL_FROM"),
        ("email_password", "EMAIL_PASSWORD"),
        ("email_to",       "EMAIL_TO"),
    ]:
        val = os.environ.get(env, "")
        if val:
            database.set_setting(key, val)


app = FastAPI(title="ShopGuard AI", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {"app": "ShopGuard AI", "status": "running", "docs": "/docs"}


@app.get("/health")
async def health():
    return {"status": "ok"}


# ── Cameras ───────────────────────────────────────────────────────────────────

@app.get("/api/cameras")
async def get_cameras():
    return {"cameras": database.get_cameras()}


class CameraCreate(BaseModel):
    serial: str
    name: str
    location: str = ""
    rtsp_url: str
    monitor_type: str = "theft"
    features: str | None = None


@app.post("/api/cameras")
async def add_camera(body: CameraCreate):
    database.add_camera(body.serial, body.name, body.location, body.rtsp_url, body.monitor_type, body.features)
    return {"ok": True}


class CameraUpdate(BaseModel):
    name: str | None = None
    location: str | None = None
    rtsp_url: str | None = None
    monitor_type: str | None = None
    enabled: int | None = None
    zones: str | None = None
    features: str | None = None


@app.patch("/api/cameras/{serial}")
async def update_camera(serial: str, body: CameraUpdate):
    database.update_camera(serial, **{k: v for k, v in body.model_dump().items() if v is not None})
    return {"ok": True}


@app.delete("/api/cameras/{serial}")
async def delete_camera(serial: str):
    database.delete_camera(serial)
    return {"ok": True}


@app.post("/api/cameras/{serial}/test")
async def test_camera(serial: str):
    cam = database.get_camera(serial)
    if not cam:
        return JSONResponse({"error": "Camera not found"}, status_code=404)
    ok = await rtsp_client.test_rtsp(cam["rtsp_url"])
    return {"ok": ok}


@app.get("/api/cameras/{serial}/snapshot")
async def get_snapshot(serial: str):
    cam = database.get_camera(serial)
    if not cam:
        return JSONResponse({"error": "Not found"}, status_code=404)
    return {"b64": cam.get("last_snapshot", "")}


# ── Alerts ────────────────────────────────────────────────────────────────────

@app.get("/api/alerts")
async def get_alerts(
    page: int = Query(0, ge=0),
    page_size: int = Query(20, ge=1, le=100),
    camera_serial: str | None = None,
    alert_type: str | None = None,
    monitor_type: str | None = None,
):
    return database.get_alerts(page, page_size, camera_serial, alert_type, monitor_type)


# ── Stats ─────────────────────────────────────────────────────────────────────

@app.get("/api/stats")
async def get_stats():
    return database.get_stats()


# ── Settings ──────────────────────────────────────────────────────────────────

@app.get("/api/settings")
async def get_settings():
    s = database.get_all_settings()
    s.pop("email_password", None)
    return s


class SettingsBody(BaseModel):
    scan_interval:    str | None = None
    crowd_threshold:  str | None = None
    idle_threshold:   str | None = None
    shop_open:        str | None = None
    shop_close:       str | None = None
    email_to:         str | None = None
    email_from:       str | None = None
    email_password:   str | None = None
    alert_cooldown:   str | None = None


@app.post("/api/settings")
async def save_settings(body: SettingsBody):
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    for k, v in data.items():
        database.set_setting(k, v)
    if "scan_interval" in data:
        try:
            scheduler.update_interval(int(data["scan_interval"]))
        except Exception:
            pass
    return {"ok": True}


# ── WebSocket ─────────────────────────────────────────────────────────────────

@app.websocket("/ws/alerts")
async def ws_alerts(websocket: WebSocket):
    await websocket.accept()
    queue: asyncio.Queue = asyncio.Queue()
    alert_manager.register_ws(queue)
    try:
        while True:
            event = await asyncio.wait_for(queue.get(), timeout=30)
            await websocket.send_text(json.dumps(event))
    except (WebSocketDisconnect, asyncio.TimeoutError):
        pass
    finally:
        alert_manager.unregister_ws(queue)
