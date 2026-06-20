# ShopGuard On-Site AI Agent

Run AI on your cameras **from inside the shop** — no port-forwarding, no cloud GPU bill,
and your camera passwords never leave the building.

```
   ┌─────────────── YOUR SHOP (local WiFi) ───────────────┐
   │                                                       │
   │   Cameras (192.168.x.x)                               │
   │   Hikvision · Ezviz · Mi                              │
   │        │ RTSP (local, no port-forward needed)         │
   │        ▼                                              │
   │   This Agent  ──► runs YOLO on a mini-PC/laptop       │
   │        │                                              │
   └────────┼──────────────────────────────────────────────┘
            │  HTTPS: results + snapshot only
            ▼
     ShopGuard Dashboard (Render cloud)  ──►  your phone, anywhere
```

## Why this is the right architecture

| Problem (cloud-only) | Solved by the agent |
|---|---|
| Cloud can't reach `192.168.x.x` cameras | Agent is on the same WiFi — it can |
| Need risky port-forwarding | Not needed at all |
| Camera passwords stored in the cloud | Stay on-site only |
| Cloud free tier can't run YOLO 24/7 | Your local machine does the AI |
| Laggy snapshots | Persistent connection = smooth |

---

## What you need

- A computer that stays ON in the shop on the same WiFi as the cameras:
  - Any Windows/Mac/Linux laptop or mini-PC (cheapest reliable option), **or**
  - A Raspberry Pi 4/5 (use `yolov8n.pt`).
- Python 3.9+.

## Setup (5 steps)

**1. Copy this `agent/` folder onto the shop machine** (USB stick or `git clone`).

**2. Install Python dependencies:**
```bash
cd agent
pip install -r requirements.txt
```
> On a Raspberry Pi / headless box, first edit `requirements.txt` and change
> `opencv-python` → `opencv-python-headless`.

**3. Get your Agent Key** from the dashboard:
- Open `https://YOUR-APP.onrender.com/api/agent/status` in a browser, copy the
  `agent_key` value, **or** find it in **Dashboard → Settings → On-Site Agent**.

**4. Create your config:**
```bash
cp config.example.yaml config.yaml
```
Edit `config.yaml`:
- set `cloud_url` to your dashboard URL,
- paste your `agent_key`,
- list your cameras with their **local** RTSP URLs (see formats below).

**5. Run it:**
```bash
python agent.py --config config.yaml
```
You should see `connected` lines, and within seconds the camera tiles on your
dashboard start showing live snapshots. Done. 🎉

---

## Camera RTSP URL formats (local IPs are fine here!)

| Camera | URL |
|---|---|
| **Hikvision DVR** cam 1 | `rtsp://admin:PASS@192.168.31.36:554/Streaming/Channels/101` |
| Hikvision DVR cam 2 | `rtsp://admin:PASS@192.168.31.36:554/Streaming/Channels/201` |
| Hikvision sub-stream (lighter) | `…/Streaming/Channels/102` |
| **Ezviz CS-C6N** | `rtsp://admin:VERIFY_CODE@192.168.31.92:554/h264/ch1/main/av_stream` |
| **Mi / Xiaomi** | `rtsp://admin:PASS@192.168.31.72/stream1` |

> Channel IDs are `XY` where `X` = camera number, `Y` = stream (1 = main HD,
> 2 = sub/low-bandwidth). So `301` = camera 3, main stream.

---

## Run it permanently (auto-start, survives reboots)

### Windows
Create `start-agent.bat`:
```bat
cd C:\shopguard\agent
python agent.py --config config.yaml
```
Add it to **Task Scheduler** → "At log on" → restart if it fails.

### Linux / Raspberry Pi (systemd)
Create `/etc/systemd/system/shopguard-agent.service`:
```ini
[Unit]
Description=ShopGuard On-Site AI Agent
After=network-online.target

[Service]
WorkingDirectory=/home/pi/shopguard/agent
ExecStart=/usr/bin/python3 agent.py --config config.yaml
Restart=always
RestartSec=10
User=pi

[Install]
WantedBy=multi-user.target
```
Then:
```bash
sudo systemctl enable --now shopguard-agent
journalctl -u shopguard-agent -f      # watch logs
```

---

## How feature toggles work

Cameras **auto-appear** on the dashboard the first time the agent sends data.
When you open a camera in the dashboard and flip features (theft / vehicle /
staff / product), the agent picks up the change within `config_sync_interval`
seconds (default 30s) — no restart needed. The dashboard is the source of truth
for *what to alert on*; the agent's `config.yaml` controls *which cameras exist*
and their RTSP URLs.

## Performance tips

- **CPU only?** Use `model: yolov8n.pt` and `scan_interval: 5` or higher.
- **Many cameras?** Each camera is its own thread; raise `scan_interval` to keep
  CPU sane, or run a second agent on another machine (same key) for other cameras.
- **Bandwidth tight?** Lower `jpeg_quality` to 50 and raise `scan_interval`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `UPLOAD REJECTED — agent_key does not match` | Re-copy the key from the dashboard into `config.yaml`. |
| `connect failed, retry` | Wrong RTSP URL / password, or camera not on this WiFi. Test the URL in [VLC](https://www.videolan.org) → Open Network Stream. |
| Snapshots not updating on dashboard | Check the agent terminal for errors; confirm `cloud_url` is correct and reachable. |
| High CPU | Increase `scan_interval`, use `yolov8n.pt`. |
