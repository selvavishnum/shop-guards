import { X, Wifi, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import { api } from "../services/api";

const FEATURES = [
  { key: "theft",          label: "Theft",    desc: "Intrusion, after-hours, crowd" },
  { key: "vehicle",        label: "Vehicle",  desc: "Cars, bikes, trucks" },
  { key: "human_tracking", label: "Tracking", desc: "Track persons by ID" },
  { key: "staff",          label: "Staff",    desc: "Phone use, idle, behavior" },
  { key: "face",           label: "Face",     desc: "Known vs unknown persons" },
  { key: "product",        label: "Product",  desc: "Bags, backpacks in zone" },
];

export default function FeaturePanel({ camera, liveCams, onClose, onUpdate, onDelete }) {
  const [features, setFeatures] = useState({});
  const [saving,   setSaving]   = useState(false);
  const [testing,  setTesting]  = useState(false);
  const [testOk,   setTestOk]   = useState(null);

  useEffect(() => {
    if (!camera) return;
    try {
      setFeatures(JSON.parse(camera.features || "{}"));
    } catch {
      setFeatures({ theft: true });
    }
    setTestOk(null);
  }, [camera?.serial]);

  if (!camera) return null;

  const live    = liveCams?.[camera.serial];
  const imgSrc  = live?.b64
    ? `data:image/jpeg;base64,${live.b64}`
    : camera.last_snapshot
      ? `data:image/jpeg;base64,${camera.last_snapshot}`
      : null;

  const toggle = (key) => setFeatures(f => ({ ...f, [key]: !f[key] }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateCamera(camera.serial, { features: JSON.stringify(features) });
      onUpdate?.();
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true); setTestOk(null);
    try {
      const r = await api.testCamera(camera.serial);
      setTestOk(r.ok);
    } catch { setTestOk(false); }
    finally { setTesting(false); }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${camera.name}"?`)) return;
    await api.deleteCamera(camera.serial);
    onClose();
    onUpdate?.();
  };

  return (
    <div className={`feature-panel open`}>
      <div className="fp-header">
        <div>
          <div className="fp-title">{camera.name}</div>
          <div className="fp-sub">{camera.location || camera.serial}</div>
        </div>
        <button className="fp-close" onClick={onClose}><X size={13} strokeWidth={1.5} /></button>
      </div>

      <div className="fp-snapshot">
        {imgSrc
          ? <img src={imgSrc} alt={camera.name} />
          : <div className="fp-empty-snap">No Snapshot Yet</div>
        }
      </div>

      {live && (
        <div style={{ padding: "8px 18px", borderBottom: "1px solid var(--border)", display: "flex", gap: 12, fontSize: 10, color: "var(--muted)", letterSpacing: "0.06em" }}>
          {live.person_count > 0  && <span>{live.person_count} PERSON{live.person_count !== 1 ? "S" : ""}</span>}
          {live.vehicle_count > 0 && <span>{live.vehicle_count} VEHICLE{live.vehicle_count !== 1 ? "S" : ""}</span>}
          <span style={{ marginLeft: "auto" }}>{live.timestamp}</span>
        </div>
      )}

      <div className="fp-section">
        <div className="fp-sec-title">Monitoring Features</div>
        <div className="feature-grid">
          {FEATURES.map(f => (
            <div
              key={f.key}
              className={`feature-toggle${features[f.key] ? " on" : ""}`}
              onClick={() => toggle(f.key)}
            >
              <div>
                <div className="ft-label">{f.label}</div>
                <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 2 }}>{f.desc}</div>
              </div>
              <div className="ft-dot" />
            </div>
          ))}
        </div>
      </div>

      <div className="fp-section" style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.6 }}>
        <div className="fp-sec-title">Camera Info</div>
        <div style={{ marginBottom: 4 }}>Serial: <span style={{ color: "var(--text)", fontFamily: "monospace" }}>{camera.serial}</span></div>
        <div style={{ marginBottom: 4 }}>Mode: <span style={{ color: "var(--text)" }}>{camera.monitor_type}</span></div>
        <div style={{ wordBreak: "break-all", fontSize: 10 }}>{camera.rtsp_url}</div>
      </div>

      <div className="fp-actions">
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save Features"}
        </button>
        <button className="btn btn-outline btn-sm" onClick={handleTest} disabled={testing}>
          <Wifi size={12} strokeWidth={1.5} />
          {testing ? "Testing…" : testOk === true ? "Connected ✓" : testOk === false ? "Failed ✗" : "Test Connection"}
        </button>
        <button className="btn btn-danger btn-sm" onClick={handleDelete}>
          <Trash2 size={12} strokeWidth={1.5} /> Delete Camera
        </button>
      </div>
    </div>
  );
}
