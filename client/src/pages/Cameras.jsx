import { useEffect, useState } from "react";
import { Plus, Trash2, Edit2, Wifi, X, CheckCircle, XCircle, AlertTriangle, RefreshCw } from "lucide-react";
import { api } from "../services/api";

const MONITOR_OPTIONS = [
  { value:"theft",             label:"Theft Detection" },
  { value:"customer_count",    label:"Customer Count" },
  { value:"cash_drawer",       label:"Cash Drawer Monitor" },
  { value:"staff_misbehavior", label:"Staff Misbehavior" },
  { value:"staff_idle",        label:"Staff Idle Alert" },
];

const SOURCE_OPTIONS = [
  { value:"rtsp",        label:"RTSP (Direct)" },
  { value:"agent",       label:"On-Site Agent" },
  { value:"ezviz_cloud", label:"Ezviz Cloud" },
];

const EMPTY = { serial:"", name:"", location:"", rtsp_url:"", monitor_type:"theft",
                source:"rtsp", ezviz_serial:"", ezviz_channel:1 };

function isLocalIP(url) {
  return /rtsp:\/\/[^@]*@?(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)\d+/.test(url);
}

const SOURCE_LABELS = { rtsp:"RTSP", agent:"On-Site Agent", ezviz_cloud:"Ezviz Cloud" };

export default function CamerasPage() {
  const [cameras,  setCameras]   = useState([]);
  const [form,     setForm]      = useState(EMPTY);
  const [editing,  setEditing]   = useState(null);
  const [saving,   setSaving]    = useState(false);
  const [tests,    setTests]     = useState({});
  const [testing,  setTesting]   = useState(null);
  const [error,    setError]     = useState("");
  const [loading,  setLoading]   = useState(true);
  const [ezvizDevices,   setEzvizDevices]   = useState([]);
  const [ezvizLoading,   setEzvizLoading]   = useState(false);
  const [ezvizError,     setEzvizError]     = useState("");

  const load = async () => {
    setLoading(true);
    try { const d = await api.getCameras(); setCameras(d.cameras||[]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const loadEzvizDevices = async () => {
    setEzvizLoading(true); setEzvizError("");
    try {
      const d = await api.getEzvizDevices();
      setEzvizDevices(d.devices || []);
      if (!d.devices?.length) setEzvizError("No devices found — check App Key/Secret in Settings.");
    } catch {
      setEzvizError("Could not reach Ezviz Cloud — set up App Key/Secret in Settings first.");
    } finally { setEzvizLoading(false); }
  };

  useEffect(() => {
    if (form.source === "ezviz_cloud" && ezvizDevices.length === 0 && !ezvizLoading) {
      loadEzvizDevices();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.source]);

  const set = (k,v) => setForm(f => ({...f,[k]:v}));

  const handleSubmit = async (e) => {
    e.preventDefault(); setError("");
    if (!form.serial || !form.name) { setError("Serial and name are required."); return; }
    if (form.source === "rtsp" && !form.rtsp_url) { setError("RTSP URL is required."); return; }
    if (form.source === "ezviz_cloud" && !form.ezviz_serial) { setError("Pick an Ezviz device."); return; }
    setSaving(true);
    try {
      const payload = {
        name:form.name, location:form.location, monitor_type:form.monitor_type,
        source:form.source, rtsp_url:form.rtsp_url,
        ezviz_serial:form.ezviz_serial, ezviz_channel:Number(form.ezviz_channel)||1,
      };
      if (editing) await api.updateCamera(editing, payload);
      else         await api.addCamera({ serial:form.serial, ...payload });
      setForm(EMPTY); setEditing(null); await load();
    } catch(err) { setError(err?.response?.data?.detail || err?.response?.data?.error || "Failed to save."); }
    finally { setSaving(false); }
  };

  const startEdit = (cam) => {
    setEditing(cam.serial);
    setForm({
      serial:cam.serial, name:cam.name, location:cam.location||"", rtsp_url:cam.rtsp_url||"",
      monitor_type:cam.monitor_type||"theft", source:cam.source||"rtsp",
      ezviz_serial:cam.ezviz_serial||"", ezviz_channel:cam.ezviz_channel||1,
    });
    setError(""); window.scrollTo({top:0,behavior:"smooth"});
  };

  const handleDelete = async (serial) => {
    if (!confirm(`Delete camera ${serial}?`)) return;
    await api.deleteCamera(serial); await load();
  };

  const handleTest = async (serial) => {
    setTesting(serial); setTests(t=>({...t,[serial]:null}));
    try { const r = await api.testCamera(serial); setTests(t=>({...t,[serial]:r.ok})); }
    catch { setTests(t=>({...t,[serial]:false})); }
    finally { setTesting(null); }
  };

  const handleToggle = async (cam) => {
    await api.updateCamera(cam.serial, { enabled: cam.enabled ? 0 : 1 }); await load();
  };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Cameras</div>
          <div className="page-sub">{cameras.length} configured</div>
        </div>
      </div>

      <div className="card" style={{marginBottom:16}}>
        <div style={{fontSize:10,fontWeight:500,letterSpacing:"0.1em",textTransform:"uppercase",color:"var(--muted)",marginBottom:16}}>
          {editing ? `Edit — ${editing}` : "Add New Camera"}
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div className="form-group" style={{marginBottom:0}}>
              <label className="form-label">Serial / ID *</label>
              <input className="form-input" value={form.serial} onChange={e=>set("serial",e.target.value)}
                placeholder="e.g. CAM01" disabled={!!editing} />
            </div>
            <div className="form-group" style={{marginBottom:0}}>
              <label className="form-label">Display Name *</label>
              <input className="form-input" value={form.name} onChange={e=>set("name",e.target.value)} placeholder="e.g. Shop Front" />
            </div>
            <div className="form-group" style={{marginBottom:0}}>
              <label className="form-label">Location</label>
              <input className="form-input" value={form.location} onChange={e=>set("location",e.target.value)} placeholder="e.g. Entrance" />
            </div>
            <div className="form-group" style={{marginBottom:0}}>
              <label className="form-label">Monitor Mode</label>
              <select className="form-input" value={form.monitor_type} onChange={e=>set("monitor_type",e.target.value)}>
                {MONITOR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div className="form-group" style={{gridColumn:"1/-1",marginBottom:0}}>
              <label className="form-label">Connection Type</label>
              <select className="form-input" value={form.source} onChange={e=>set("source",e.target.value)}>
                {SOURCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <div style={{fontSize:10,color:"var(--muted)",marginTop:5}}>
                {form.source === "rtsp" && "Cloud connects directly via RTSP — needs a public IP + port forwarding."}
                {form.source === "agent" && "A PC/Raspberry Pi in your shop runs AI locally and pushes results here — no port forwarding needed."}
                {form.source === "ezviz_cloud" && "Snapshots pulled from Ezviz's own cloud — no RTSP, no port forwarding, no on-site PC needed."}
              </div>
            </div>

            {form.source === "rtsp" && (
              <div className="form-group" style={{gridColumn:"1/-1",marginBottom:0}}>
                <label className="form-label">RTSP URL *</label>
                <input className="form-input" value={form.rtsp_url} onChange={e=>set("rtsp_url",e.target.value)}
                  placeholder="rtsp://admin:PASSWORD@PUBLIC_IP:554/Streaming/Channels/101" />
                <div style={{fontSize:10,color:"var(--muted)",marginTop:5}}>
                  Hikvision DVR: /Streaming/Channels/101 (cam1) · 201 (cam2 main) · Mi: /stream1
                </div>
              </div>
            )}

            {form.source === "agent" && (
              <div className="form-group" style={{gridColumn:"1/-1",marginBottom:0}}>
                <label className="form-label">RTSP URL (optional — local, for reference)</label>
                <input className="form-input" value={form.rtsp_url} onChange={e=>set("rtsp_url",e.target.value)}
                  placeholder="rtsp://admin:PASSWORD@192.168.x.x:554/Streaming/Channels/101" />
                <div style={{fontSize:10,color:"var(--muted)",marginTop:5}}>
                  Cameras added by the agent (agent/config.yaml) appear here automatically — this manual form is optional.
                </div>
              </div>
            )}

            {form.source === "ezviz_cloud" && (
              <div className="form-group" style={{gridColumn:"1/-1",marginBottom:0}}>
                <label className="form-label">Ezviz Device *</label>
                <div style={{display:"flex",gap:8}}>
                  <select className="form-input" value={form.ezviz_serial} onChange={e=>set("ezviz_serial",e.target.value)} disabled={ezvizLoading}>
                    <option value="">{ezvizLoading ? "Loading devices…" : "Select a device…"}</option>
                    {ezvizDevices.map(d => (
                      <option key={d.deviceSerial} value={d.deviceSerial}>{d.deviceName || d.deviceSerial} ({d.deviceSerial})</option>
                    ))}
                  </select>
                  <button type="button" className="btn btn-outline btn-sm" onClick={loadEzvizDevices} disabled={ezvizLoading} style={{flexShrink:0}}>
                    <RefreshCw size={12} strokeWidth={1.5} className={ezvizLoading?"spin":""} />
                  </button>
                </div>
                {ezvizError && <div style={{fontSize:10,color:"#dc2626",marginTop:5}}>{ezvizError}</div>}
                <div style={{marginTop:10}}>
                  <label className="form-label">Channel</label>
                  <input className="form-input" type="number" min="1" style={{maxWidth:100}}
                    value={form.ezviz_channel} onChange={e=>set("ezviz_channel",e.target.value)} />
                  <div style={{fontSize:10,color:"var(--muted)",marginTop:5}}>
                    1 for a single-lens camera; DVR/NVR devices use channel 2, 3… per camera.
                  </div>
                </div>
              </div>
            )}
          </div>

          {form.source === "rtsp" && isLocalIP(form.rtsp_url) && (
            <div className="warn-banner" style={{marginTop:12}}>
              <AlertTriangle size={14} strokeWidth={1.5} style={{flexShrink:0,marginTop:1}} />
              <div>
                <strong>Local IP detected — camera unreachable from cloud.</strong><br/>
                <span style={{fontSize:11}}>
                  192.168.x.x addresses are only visible inside your shop WiFi.
                  The server runs on Render.com and cannot reach your local network.<br/>
                  <strong>Fix:</strong> use "On-Site Agent" or "Ezviz Cloud" connection type above,
                  or set up port forwarding on your router and use your public IP here instead.
                </span>
              </div>
            </div>
          )}

          {error && <div style={{marginTop:10,fontSize:12,color:"var(--muted)"}}>{error}</div>}
          <div style={{display:"flex",gap:8,marginTop:14}}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              <Plus size={12} strokeWidth={1.5} /> {saving?"Saving…":editing?"Update":"Add Camera"}
            </button>
            {editing && (
              <button type="button" className="btn btn-outline btn-sm" onClick={()=>{setEditing(null);setForm(EMPTY);setError("");}}>
                <X size={12} strokeWidth={1.5} /> Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {loading ? (
        <div style={{textAlign:"center",padding:40,color:"var(--muted)",fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase"}}>Loading…</div>
      ) : cameras.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-title">No Cameras Yet</div>
          <div className="empty-sub">Use the form above to add your first camera.</div>
        </div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {cameras.map(cam => (
            <div key={cam.serial} className="card card-sm" style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:400,fontSize:13,marginBottom:3,display:"flex",alignItems:"center",gap:8}}>
                  {cam.name}
                  <span style={{fontSize:9,background:"var(--accent-s)",color:"var(--accent-d)",padding:"1px 5px",borderRadius:2,fontWeight:600,letterSpacing:"0.05em"}}>
                    {SOURCE_LABELS[cam.source] || "RTSP"}
                  </span>
                  {cam.source === "rtsp" && isLocalIP(cam.rtsp_url||"") && (
                    <span title="Local IP — unreachable from cloud. Use On-Site Agent / Ezviz Cloud, or set up port forwarding."
                      style={{fontSize:9,background:"#f59e0b",color:"#000",padding:"1px 5px",borderRadius:2,fontWeight:600,letterSpacing:"0.05em"}}>
                      LOCAL IP
                    </span>
                  )}
                </div>
                <div style={{fontSize:11,color:"var(--muted)",marginBottom:2}}>
                  {cam.location && <span>{cam.location} · </span>}
                  <span style={{fontFamily:"monospace"}}>{cam.serial}</span>
                  {" · "}{cam.monitor_type}
                </div>
                <div style={{fontSize:10,color:"var(--dim)",wordBreak:"break-all"}}>
                  {cam.source === "ezviz_cloud" ? `Ezviz device ${cam.ezviz_serial} · channel ${cam.ezviz_channel}` : cam.rtsp_url}
                </div>
                {tests[cam.serial]===false && cam.source==="rtsp" && isLocalIP(cam.rtsp_url||"") && (
                  <div style={{fontSize:10,color:"#f59e0b",marginTop:4}}>
                    Connection failed — local IP unreachable from cloud. Use On-Site Agent / Ezviz Cloud, or set up port forwarding.
                  </div>
                )}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:7,flexShrink:0}}>
                <span className={`badge${cam.enabled ? "" : " badge-muted"}`}>
                  {cam.enabled ? "ON" : "OFF"}
                </span>
                {tests[cam.serial]===true  && <CheckCircle size={14} strokeWidth={1.5} style={{color:"#22c55e"}} />}
                {tests[cam.serial]===false && <XCircle     size={14} strokeWidth={1.5} style={{color:"#f59e0b"}} />}
                <button className="btn btn-outline btn-xs" onClick={()=>handleTest(cam.serial)} disabled={testing===cam.serial}>
                  <Wifi size={11} strokeWidth={1.5} /> {testing===cam.serial?"…":"Test"}
                </button>
                <button className="btn btn-outline btn-xs" onClick={()=>handleToggle(cam)}>
                  {cam.enabled?"Disable":"Enable"}
                </button>
                <button className="btn btn-outline btn-xs" onClick={()=>startEdit(cam)}>
                  <Edit2 size={11} strokeWidth={1.5} />
                </button>
                <button className="btn btn-danger btn-xs" onClick={()=>handleDelete(cam.serial)}>
                  <Trash2 size={11} strokeWidth={1.5} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}
