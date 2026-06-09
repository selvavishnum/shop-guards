import { useEffect, useState } from "react";
import { api } from "../services/api";

export default function SettingsPage() {
  const [form, setForm] = useState({
    scan_interval:   "60",
    crowd_threshold: "5",
    idle_threshold:  "5",
    alert_cooldown:  "180",
    shop_open:       "08:00",
    shop_close:      "22:00",
    email_to:        "",
    email_from:      "",
    email_password:  "",
  });
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  useEffect(() => {
    api.getSettings().then(s => setForm(f => ({ ...f, ...s }))).catch(() => {});
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await api.saveSettings(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div className="page-title">Settings</div>
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : saved ? "Saved!" : "Save Settings"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* AI settings */}
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 16 }}>AI & Monitoring</div>
          <div className="form-group">
            <label className="form-label">Scan Interval</label>
            <select className="form-input" value={form.scan_interval} onChange={e => set("scan_interval", e.target.value)}>
              <option value="30">30 seconds</option>
              <option value="60">60 seconds</option>
              <option value="120">2 minutes</option>
              <option value="300">5 minutes</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Crowd Alert Threshold (persons)</label>
            <input className="form-input" type="number" min="2" max="50" value={form.crowd_threshold} onChange={e => set("crowd_threshold", e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Staff Idle Threshold (consecutive empty scans)</label>
            <input className="form-input" type="number" min="1" max="60" value={form.idle_threshold} onChange={e => set("idle_threshold", e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Alert Cooldown (seconds)</label>
            <input className="form-input" type="number" min="30" max="3600" value={form.alert_cooldown} onChange={e => set("alert_cooldown", e.target.value)} />
          </div>
        </div>

        {/* Shop schedule */}
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 16 }}>Shop Schedule</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>
            After-hours alerts fire when a person is detected outside these times.
            Staff-idle alerts only run during open hours.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Open Time</label>
              <input className="form-input" type="time" value={form.shop_open} onChange={e => set("shop_open", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Close Time</label>
              <input className="form-input" type="time" value={form.shop_close} onChange={e => set("shop_close", e.target.value)} />
            </div>
          </div>
        </div>

        {/* Email */}
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 16 }}>Email Notifications</div>
          <div className="form-group">
            <label className="form-label">Send Alerts To</label>
            <input className="form-input" type="email" value={form.email_to} onChange={e => set("email_to", e.target.value)} placeholder="your@email.com" />
          </div>
          <div className="form-group">
            <label className="form-label">Gmail Address (sender)</label>
            <input className="form-input" type="email" value={form.email_from} onChange={e => set("email_from", e.target.value)} placeholder="shopguard@gmail.com" />
          </div>
          <div className="form-group" style={{ marginBottom: 8 }}>
            <label className="form-label">Gmail App Password</label>
            <input className="form-input" type="password" value={form.email_password} onChange={e => set("email_password", e.target.value)} placeholder="16-char app password" />
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            Use a Gmail App Password (Google Account → Security → 2FA → App Passwords).
          </div>
        </div>

        {/* RTSP tip */}
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 12 }}>RTSP Connection Tips</div>
          <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7 }}>
            <div style={{ marginBottom: 8 }}>
              <strong style={{ color: "var(--text)" }}>Hikvision DVR format:</strong><br />
              <code style={{ background: "var(--bg)", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>
                rtsp://admin:PASSWORD@PUBLIC_IP:554/Streaming/Channels/101
              </code>
            </div>
            <div style={{ marginBottom: 8 }}>
              Channel IDs: <strong style={{ color: "var(--text)" }}>101</strong> = cam 1 mainstream &nbsp;
              <strong style={{ color: "var(--text)" }}>102</strong> = cam 1 sub-stream &nbsp;
              <strong style={{ color: "var(--text)" }}>201</strong> = cam 2 mainstream &nbsp;
              <strong style={{ color: "var(--text)" }}>202</strong> = cam 2 sub-stream, and so on.
            </div>
            <div>
              Enable <strong style={{ color: "var(--text)" }}>WAN Access / Remote View</strong> in your DVR network settings.
              Port 554 must be forwarded on your router.
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16, textAlign: "right" }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : saved ? "Saved!" : "Save All Settings"}
        </button>
      </div>
    </>
  );
}
