"""
Ezviz Open Platform client.

Uses your Ezviz "App Key" + "App Secret" (from the Ezviz Open Platform
developer console) to pull snapshots directly from Ezviz's own cloud — no
RTSP, no port forwarding, and no on-site agent needed for cameras connected
this way. Ezviz's servers do the relaying between the camera and us; we just
ask for a fresh snapshot / live-view link over HTTPS.

This solves the exact problem this shop hit: Jio CGNAT makes port
forwarding impossible, but Ezviz's cloud already has a path to the camera
(the Ezviz app uses it too) — we're just asking for it directly instead of
through their app.

Region note: Ezviz Open Platform has multiple regional API domains. If
requests fail with an "invalid appKey"-style error, try switching
`ezviz_api_base` in Settings between:
  - https://isgpopen.ezvizlife.com   (international / most non-China accounts)
  - https://open.ezvizlife.com       (China mainland accounts)
  - https://openeu.ezvizlife.com     (Europe accounts)
The correct one depends on which region you registered your Ezviz developer
account in — this is a genuine ambiguity we can't resolve without you trying it.
"""
import io
import time

import httpx
from PIL import Image

from database import get_setting, set_setting

DEFAULT_BASE = "https://isgpopen.ezvizlife.com"


def _base() -> str:
    return (get_setting("ezviz_api_base") or DEFAULT_BASE).rstrip("/")


async def get_access_token(force: bool = False) -> str | None:
    if not force:
        token  = get_setting("ezviz_access_token")
        expiry = get_setting("ezviz_token_expiry")
        if token and expiry.isdigit() and int(expiry) > time.time() + 60:
            return token

    app_key    = get_setting("ezviz_app_key")
    app_secret = get_setting("ezviz_app_secret")
    if not app_key or not app_secret:
        return None

    url = f"{_base()}/api/lapp/token/get"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(url, data={"appKey": app_key, "appSecret": app_secret})
            data = r.json()
    except Exception:
        return None

    if str(data.get("code")) != "200":
        return None

    token     = data["data"]["accessToken"]
    expire_ms = data["data"].get("expireTime", 0)
    set_setting("ezviz_access_token", token)
    set_setting("ezviz_token_expiry", str(int(expire_ms / 1000)))
    return token


async def _post(path: str, **params) -> dict | None:
    token = await get_access_token()
    if not token:
        return None

    url = f"{_base()}{path}"
    payload = {**params, "accessToken": token}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(url, data=payload)
            data = r.json()
    except Exception:
        return None

    if str(data.get("code")) == "10002":  # token expired mid-flight — refresh once and retry
        token = await get_access_token(force=True)
        if not token:
            return None
        payload["accessToken"] = token
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.post(url, data=payload)
                data = r.json()
        except Exception:
            return None

    return data if str(data.get("code")) == "200" else None


async def test_credentials() -> dict:
    """Used by the Settings 'Test Connection' button — attempts a fresh token fetch."""
    token = await get_access_token(force=True)
    return {"ok": token is not None}


async def list_devices() -> list[dict]:
    data = await _post("/api/lapp/device/list")
    if not data:
        return []
    return data.get("data", []) or []


async def capture_picture(serial: str, channel: int = 1) -> str | None:
    """Returns a JPG URL hosted on Ezviz's CDN, or None on failure."""
    data = await _post("/api/lapp/device/capture", deviceSerial=serial, channelNo=channel)
    if not data:
        return None
    return (data.get("data") or {}).get("picUrl")


async def get_live_address(serial: str, channel: int = 1, protocol: int = 2) -> str | None:
    """protocol: 1=ezopen 2=hls 3=rtmp 4=flv. HLS (2) plays in most modern browsers."""
    data = await _post("/api/lapp/live/address/get", deviceSerial=serial, channelNo=channel, protocol=protocol)
    if not data:
        return None
    return (data.get("data") or {}).get("url")


async def capture_frame(serial: str, channel: int = 1) -> Image.Image | None:
    """Downloads the current snapshot as a PIL Image — drop-in replacement for
    rtsp_client.capture_frame() for cameras connected via Ezviz Cloud."""
    pic_url = await capture_picture(serial, channel)
    if not pic_url:
        return None
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(pic_url)
            r.raise_for_status()
        return Image.open(io.BytesIO(r.content)).convert("RGB")
    except Exception:
        return None
