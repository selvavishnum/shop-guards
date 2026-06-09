import { useEffect, useState } from "react";
import { Trash2, CheckCircle, XCircle, Wifi, WifiOff, Plus, Edit2, X } from "lucide-react";
import { api } from "../services/api";

const MONITOR_OPTIONS = [
  { value: "theft",             label: "Theft Detection" },
  { value: "customer_count",    label: "Customer Count" },
  { value: "cash_drawer",       label: "Cash Drawer Monitor" },
  { value: "staff_misbehavior", label: "Staff Misbehavior" },
  { value: "staff_idle",        label: "Staff Idle Alert" },
];

const EMPTY_FORM = {
  serial: "", name: "", location: "", rtsp_url: "", monitor_type: "theft",
};

export default function CamerasPage() {
  const [cameras, setCameras]     = useState([]);
  const [form,    setForm]        = useState(EMPTY_FORM);
  const [editing, setEditing]     = useState(null);
  const [saving,  setSaving]      = useState(false);
  const [testing, setTesting]     = useState(null);
  const [testResult, setTestResult] = useState({});
  const [loading, setLoading]     = useState(true);
  const [error,   setError]       = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getCameras();
      setCameras(data.cameras || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.serial || !form.name || !form.rtsp_url) {
      setError("Serial, name and RTSP URL are required.");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.updateCamera(editing, {
          name: form.name, location: form.location,
          rtsp_url: form.rtsp_url, monitor_type: form.monitor_type,
        });
      } else {
        await api.addCamera(form);
      }
      setForm(EMPTY_FORM);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to save camera.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (cam) => {
    setEditing(cam.serial);
    setForm({ serial: cam.serial, name: cam.name, location: cam.location || "", rtsp_url: cam.rtsp_url || "", monitor_type: cam.monitor_type || "theft" });
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (serial) => {
    if (!confirm(`Delete camera ${serial}?`)) return;
    await api.deleteCamera(serial);
    await load();
  };

  const handleTest = async (serial) => {
    setTesting(serial);
    setTestResult(r => ({ ...r, [serial]: null }));
    try {
      const res = await api.testCamera(serial);
      setTestResult(r => ({ ...r, [serial]: res.ok }));
    } catch {
      setTestResult(r => ({ ...r, [serial]: false }));
    } finally {
      setTesting(null);
    }
  };

  const handleToggle = async (cam) => {
    await api.updateCamera(cam.serial, { enabled: cam.enabled ? 0 : 1 });
    await load();
  };

  const cancelEdit = () => { setEditing(null); setForm(EMPTY_FORM); setError(""); };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Camera Management</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
            {cameras.length} cameras configured
          </div>
        </div>
      </div>

      {/* Add / Edit form */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 16 }}>
          {editing ? `Edit Camera — ${editing}` : "Add New Camera"}
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Camera Serial / ID *</label>
              <input
                className="form-input"
                value={form.serial}
                onChange={e => set("serial", e.target.value)}
                placeholder="e.g. CAM01 or GH1343029-CH1"
                disabled={!!editing}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Display Name *</label>
              <input className="form-input" value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Shop Front" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Location</label>
              <input className="form-input" value={form.location} onChange={e => set("location", e.target.value)} placeholder="e.g. Entrance" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Monitor Mode</label>
              <select className="form-input" value={form.monitor_type} onChange={e => set("monitor_type", e.target.value)}>
                {MONITOR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: "1/-1", marginBottom: 0 }}>
              <label className="form-label">RTSP URL *</label>
              <input
                className="form-input"
                value={form.rtsp_url}
                onChange={e => set("rtsp_url", e.target.value)}
                placeholder="rtsp://admin:PASSWORD@PUBLIC_IP:554/Streaming/Channels/101"
              />
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                Hikvision: rtsp://admin:PASS@IP:554/Streaming/Channels/101 &nbsp;|&nbsp;
                Channel suffix: 101=cam1, 201=cam2, 301=cam3…
              </div>
            </div>
          </div>

          {error && (
            <div style={{ marginTop: 12, color: "var(--red)", fontSize: 13 }}>{error}</div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              <Plus size={13} /> {saving ? "Saving…" : editing ? "Update Camera" : "Add Camera"}
            </button>
            {editing && (
              <button type="button" className="btn btn-outline btn-sm" onClick={cancelEdit}>
                <X size={13} /> Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Camera list */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>Loading…</div>
      ) : cameras.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>
          No cameras added yet. Use the form above to add your first camera.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {cameras.map(cam => {
            const tested = testResult[cam.serial];
            return (
              <div key={cam.serial} className="card card-sm" style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>{cam.name}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 2 }}>
                    {cam.location && <span>{cam.location} · </span>}
                    <span style={{ fontFamily: "monospace" }}>{cam.serial}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)", wordBreak: "break-all" }}>
                    {cam.rtsp_url || <em>No RTSP URL</em>}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <span className={`badge ${cam.enabled ? "badge-green" : "badge-gray"}`}>
                    {cam.enabled ? "Enabled" : "Disabled"}
                  </span>

                  {tested === true  && <CheckCircle size={16} color="var(--green)" />}
                  {tested === false && <XCircle     size={16} color="var(--red)" />}

                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => handleTest(cam.serial)}
                    disabled={testing === cam.serial}
                    title="Test RTSP connection"
                  >
                    {testing === cam.serial ? <Wifi size={13} className="pulse" /> : <Wifi size={13} />}
                    {testing === cam.serial ? "Testing…" : "Test"}
                  </button>

                  <button className="btn btn-outline btn-sm" onClick={() => handleToggle(cam)}>
                    {cam.enabled ? <WifiOff size={13} /> : <Wifi size={13} />}
                    {cam.enabled ? "Disable" : "Enable"}
                  </button>

                  <button className="btn btn-outline btn-sm" onClick={() => handleEdit(cam)}>
                    <Edit2 size={13} /> Edit
                  </button>

                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(cam.serial)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        .pulse { animation: pulse-anim 1s ease-in-out infinite; }
        @keyframes pulse-anim { 0%,100%{opacity:1} 50%{opacity:.4} }
      `}</style>
    </>
  );
}
