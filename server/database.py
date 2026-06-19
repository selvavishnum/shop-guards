import sqlite3
import os
from datetime import date

DB_PATH = os.environ.get("DB_PATH", "shopguard.db")

DEFAULT_FEATURES = '{"theft":true,"vehicle":false,"human_tracking":false,"staff":false,"face":false,"product":false,"behavior":false}'


def get_conn():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS cameras (
            serial          TEXT PRIMARY KEY,
            name            TEXT NOT NULL,
            location        TEXT DEFAULT '',
            rtsp_url        TEXT NOT NULL DEFAULT '',
            monitor_type    TEXT NOT NULL DEFAULT 'theft',
            enabled         INTEGER NOT NULL DEFAULT 1,
            zones           TEXT DEFAULT '[]',
            features        TEXT DEFAULT '{"theft":true,"vehicle":false,"human_tracking":false,"staff":false,"face":false,"product":false,"behavior":false}',
            last_snapshot   TEXT DEFAULT '',
            empty_scans     INTEGER DEFAULT 0,
            created_at      TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS alerts (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            camera_serial   TEXT NOT NULL,
            camera_name     TEXT NOT NULL,
            alert_type      TEXT NOT NULL,
            monitor_type    TEXT NOT NULL DEFAULT 'theft',
            person_count    INTEGER DEFAULT 0,
            vehicle_count   INTEGER DEFAULT 0,
            confidence      REAL DEFAULT 0.0,
            annotated_b64   TEXT DEFAULT '',
            created_at      TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS daily_counts (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            camera_serial   TEXT NOT NULL,
            date            TEXT NOT NULL,
            customer_count  INTEGER DEFAULT 0,
            drawer_count    INTEGER DEFAULT 0,
            vehicle_count   INTEGER DEFAULT 0,
            UNIQUE(camera_serial, date)
        );

        CREATE TABLE IF NOT EXISTS staff (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            role        TEXT DEFAULT 'staff',
            face_b64    TEXT DEFAULT '',
            active      INTEGER DEFAULT 1,
            created_at  TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS settings (
            key     TEXT PRIMARY KEY,
            value   TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_alerts_time   ON alerts(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_alerts_camera ON alerts(camera_serial);

        INSERT OR IGNORE INTO settings VALUES ('scan_interval',   '60');
        INSERT OR IGNORE INTO settings VALUES ('crowd_threshold', '5');
        INSERT OR IGNORE INTO settings VALUES ('shop_open',       '08:00');
        INSERT OR IGNORE INTO settings VALUES ('shop_close',      '22:00');
        INSERT OR IGNORE INTO settings VALUES ('email_to',        '');
        INSERT OR IGNORE INTO settings VALUES ('email_from',      '');
        INSERT OR IGNORE INTO settings VALUES ('email_password',  '');
        INSERT OR IGNORE INTO settings VALUES ('alert_cooldown',  '180');
        INSERT OR IGNORE INTO settings VALUES ('idle_threshold',  '5');
        INSERT OR IGNORE INTO settings VALUES ('whatsapp_to',     '');
        INSERT OR IGNORE INTO settings VALUES ('twilio_sid',      '');
        INSERT OR IGNORE INTO settings VALUES ('twilio_token',    '');
    """)
    conn.commit()
    # Migrate existing tables
    for col, dflt in [
        ("features",      DEFAULT_FEATURES),
        ("vehicle_count", "0"),
    ]:
        try:
            conn.execute(f"ALTER TABLE cameras ADD COLUMN {col} TEXT DEFAULT '{dflt}'")
            conn.commit()
        except Exception:
            pass
    try:
        conn.execute("ALTER TABLE alerts ADD COLUMN vehicle_count INTEGER DEFAULT 0")
        conn.commit()
    except Exception:
        pass
    conn.close()


def get_setting(key, default=""):
    conn = get_conn()
    row = conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    conn.close()
    return row["value"] if row else default


def set_setting(key, value):
    conn = get_conn()
    conn.execute("INSERT OR REPLACE INTO settings VALUES (?,?)", (key, value))
    conn.commit()
    conn.close()


def get_all_settings():
    conn = get_conn()
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    conn.close()
    return {r["key"]: r["value"] for r in rows}


def add_camera(serial, name, location, rtsp_url, monitor_type, features=None):
    conn = get_conn()
    conn.execute(
        "INSERT OR REPLACE INTO cameras (serial,name,location,rtsp_url,monitor_type,features) VALUES (?,?,?,?,?,?)",
        (serial, name, location, rtsp_url, monitor_type, features or DEFAULT_FEATURES),
    )
    conn.commit()
    conn.close()


def get_cameras():
    conn = get_conn()
    rows = conn.execute("SELECT * FROM cameras ORDER BY name").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_camera(serial):
    conn = get_conn()
    row = conn.execute("SELECT * FROM cameras WHERE serial=?", (serial,)).fetchone()
    conn.close()
    return dict(row) if row else None


def update_camera(serial, **kwargs):
    conn = get_conn()
    allowed = {"name","location","rtsp_url","monitor_type","enabled","zones","features"}
    for k, v in kwargs.items():
        if k in allowed and v is not None:
            conn.execute(f"UPDATE cameras SET {k}=? WHERE serial=?", (v, serial))
    conn.commit()
    conn.close()


def delete_camera(serial):
    conn = get_conn()
    conn.execute("DELETE FROM cameras WHERE serial=?", (serial,))
    conn.commit()
    conn.close()


def update_snapshot(serial, b64):
    conn = get_conn()
    conn.execute("UPDATE cameras SET last_snapshot=? WHERE serial=?", (b64, serial))
    conn.commit()
    conn.close()


def inc_empty_scans(serial):
    conn = get_conn()
    conn.execute("UPDATE cameras SET empty_scans=empty_scans+1 WHERE serial=?", (serial,))
    conn.commit()
    conn.close()


def reset_empty_scans(serial):
    conn = get_conn()
    conn.execute("UPDATE cameras SET empty_scans=0 WHERE serial=?", (serial,))
    conn.commit()
    conn.close()


def inc_daily(serial, kind="customer"):
    conn = get_conn()
    today = date.today().isoformat()
    conn.execute(
        "INSERT OR IGNORE INTO daily_counts (camera_serial,date) VALUES (?,?)", (serial, today)
    )
    col_map = {"customer": "customer_count", "drawer": "drawer_count", "vehicle": "vehicle_count"}
    col = col_map.get(kind, "customer_count")
    conn.execute(f"UPDATE daily_counts SET {col}={col}+1 WHERE camera_serial=? AND date=?", (serial, today))
    conn.commit()
    conn.close()


def save_alert(serial, name, alert_type, monitor_type, person_count, confidence, b64="", vehicle_count=0):
    conn = get_conn()
    conn.execute(
        "INSERT INTO alerts (camera_serial,camera_name,alert_type,monitor_type,person_count,vehicle_count,confidence,annotated_b64) VALUES (?,?,?,?,?,?,?,?)",
        (serial, name, alert_type, monitor_type, person_count, vehicle_count, confidence, b64),
    )
    conn.commit()
    conn.close()


def get_alerts(page=0, page_size=20, camera_serial=None, alert_type=None, monitor_type=None):
    conn = get_conn()
    where, params = ["1=1"], []
    if camera_serial:
        where.append("camera_serial=?"); params.append(camera_serial)
    if alert_type:
        where.append("alert_type=?"); params.append(alert_type)
    if monitor_type:
        where.append("monitor_type=?"); params.append(monitor_type)
    ws = " AND ".join(where)
    total = conn.execute(f"SELECT COUNT(*) FROM alerts WHERE {ws}", params).fetchone()[0]
    rows  = conn.execute(
        f"SELECT * FROM alerts WHERE {ws} ORDER BY created_at DESC LIMIT ? OFFSET ?",
        params + [page_size, page * page_size],
    ).fetchall()
    conn.close()
    return {"total": total, "alerts": [dict(r) for r in rows]}


def get_stats():
    conn = get_conn()
    today_alerts = conn.execute(
        "SELECT COUNT(*) FROM alerts WHERE date(created_at)=date('now')"
    ).fetchone()[0]
    by_monitor = conn.execute(
        "SELECT monitor_type, COUNT(*) as cnt FROM alerts WHERE date(created_at)=date('now') GROUP BY monitor_type"
    ).fetchall()
    by_alert_type = conn.execute(
        "SELECT alert_type, COUNT(*) as cnt FROM alerts WHERE date(created_at)=date('now') GROUP BY alert_type ORDER BY cnt DESC"
    ).fetchall()
    hourly = conn.execute(
        "SELECT strftime('%H',created_at) as hour, COUNT(*) as cnt FROM alerts WHERE date(created_at)=date('now') GROUP BY hour ORDER BY hour"
    ).fetchall()
    top_cameras = conn.execute(
        "SELECT camera_name, COUNT(*) as cnt FROM alerts WHERE date(created_at)=date('now') GROUP BY camera_serial ORDER BY cnt DESC LIMIT 10"
    ).fetchall()
    customers = conn.execute(
        "SELECT COALESCE(SUM(customer_count),0) FROM daily_counts WHERE date=date('now')"
    ).fetchone()[0]
    drawers = conn.execute(
        "SELECT COALESCE(SUM(drawer_count),0) FROM daily_counts WHERE date=date('now')"
    ).fetchone()[0]
    vehicles = conn.execute(
        "SELECT COALESCE(SUM(vehicle_count),0) FROM daily_counts WHERE date=date('now')"
    ).fetchone()[0]
    cams = get_cameras()
    conn.close()
    return {
        "today_alerts":        today_alerts,
        "customer_count_today": customers,
        "drawer_opens_today":  drawers,
        "vehicle_count_today": vehicles,
        "total_cameras":       len(cams),
        "active_cameras":      sum(1 for c in cams if c.get("enabled", 1)),
        "by_monitor":          [dict(r) for r in by_monitor],
        "by_alert_type":       [dict(r) for r in by_alert_type],
        "hourly":              [dict(r) for r in hourly],
        "top_cameras":         [dict(r) for r in top_cameras],
    }
