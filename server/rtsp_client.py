import asyncio
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

_executor = ThreadPoolExecutor(max_workers=8)


def _grab(rtsp_url: str) -> Image.Image | None:
    try:
        import cv2
        cap = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 8000)
        cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 8000)
        ret, frame = False, None
        for _ in range(5):
            ret, frame = cap.read()
            if ret:
                break
        cap.release()
        if not ret or frame is None:
            return None
        import numpy as np
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        return Image.fromarray(rgb)
    except Exception:
        return None


async def capture_frame(rtsp_url: str) -> Image.Image | None:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, _grab, rtsp_url)


async def test_rtsp(rtsp_url: str) -> bool:
    img = await capture_frame(rtsp_url)
    return img is not None
