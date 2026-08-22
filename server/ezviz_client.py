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


async def _fetch_token_raw(app_key: str, app_secret: str, base: str) -> tuple[bool, dict]:
    """Low-level token fetch that reports WHY it failed — wrong key, wrong
    secret, wrong region, or unreachable — instead of just True/False.
    Used both by get_access_token() and by test_credentials() for diagnostics."""
    url = f"{base}/api/lapp/token/get"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(url, data={"appKey": app_key, "appSecret": app_secret})
    except Exception as e:
        return False, {"error": f"Could not reach {base} ({e.__class__.__name__}: {e})"}

    try:
        data = r.json()
    except Exception:
        snippet = r.text[:150].replace("\n", " ") if hasattr(r, "text") else ""
        return False, {"error": f"{base} did not return JSON (HTTP {r.status_code}): {snippet!r} — likely the wrong API region"}

    code = str(data.get("code", ""))
    if code == "200":
        inner = data.get("data") or {}
        token = inner.get("accessToken")
        if not token:
            return False, {"error": f"Ezviz returned code 200 but no accessToken: {data}"}
        return True, {"accessToken": token, "expireTime": inner.get("expireTime", 0)}

    return False, {"error": f"Ezviz error {code}: {data.get('msg', 'unknown error')}", "code": code}


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

    ok, info = await _fetch_token_raw(app_key, app_secret, _base())
    if not ok:
        return None

    set_setting("ezviz_access_token", info["accessToken"])
    set_setting("ezviz_token_expiry", str(int(info["expireTime"] / 1000)))
    return info["accessToken"]


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
    """Used by the Settings 'Test Connection' button — returns WHY it failed,
    not just True/False, so a wrong key/secret/region can actually be told apart."""
    app_key    = get_setting("ezviz_app_key")
    app_secret = get_setting("ezviz_app_secret")
    if not app_key or not app_secret:
        return {"ok": False, "error": "App Key and App Secret are required."}

    ok, info = await _fetch_token_raw(app_key, app_secret, _base())
    if ok:
        set_setting("ezviz_access_token", info["accessToken"])
        set_setting("ezviz_token_expiry", str(int(info["expireTime"] / 1000)))
        return {"ok": True}
    return {"ok": False, "error": info.get("error", "unknown failure")}


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
