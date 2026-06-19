import { useEffect, useState } from "react";
import { Plus, Trash2, Edit2, Wifi, X, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { api } from "../services/api";

const MONITOR_OPTIONS = [
  { value:"theft",             label:"Theft Detection" },
  { value:"customer_count",    label:"Customer Count" },
  { value:"cash_drawer",       label:"Cash Drawer Monitor" },
  { value:"staff_misbehavior", label:"Staff Misbehavior" },
  { value:"staff_idle",        label:"Staff Idle Alert" },
];

const EMPTY = { serial:"", name:"", location:"", rtsp_url:"", monitor_type:"theft" };

function isLocalIP(url) {
  return /rtsp:\/\/[^@]*@?(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)\d+/.test(url);
}

export default function CamerasPage() {
  const [cameras,  setCameras]   = useState([]);
  const [form,     setForm]      = useState(EMPTY);
  const [editing,  setEditing]   = useState(null);
  const [saving,   setSaving]    = useState(false);
  const [tests,    setTests]     = useState({});
  const [testing,  setTesting]   = useState(null);
  const [error,    setError]     = useState("");
  const [loading,  setLoading]   = useState(true);

  const load = async () => {
    setLoading(true);
    try { const d = await api.getCameras(); setCameras(d.cameras||[]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const set = (k,v) => setForm(f => ({...f,[k]:v}));

  const handleSubmit = async (e) => {
    e.preventDefault(); setError("");
    if (!form.serial || !form.name || !form.rtsp_url) { setError("Serial, name and RTSP URL are required."); return; }
    setSaving(true);
    try {
      if (editing) await api.updateCamera(editing, { name:form.name, location:form.location, rtsp_url:form.rtsp_url, monitor_type:form.monitor_type });
      else         await api.addCamera(form);
      setForm(EMPTY); setEditing(null); await load();
    } catch(err) { setError(err?.response?.data?.detail || "Failed to save."); }
    finally { setSaving(false); }
  };

  const startEdit = (cam) => {
    setEditing(cam.serial);
    setForm({ serial:cam.serial, name:cam.name, location:cam.location||"", rtsp_url:cam.rtsp_url||"", monitor_type:cam.monitor_type||"theft" });
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
              <label className="form-label">RTSP URL *</label>
              <input className="form-input" value={form.rtsp_url} onChange={e=>set("rtsp_url",e.target.value)}
                placeholder="rtsp://admin:PASSWORD@PUBLIC_IP:554/Streaming/Channels/101" />
              <div style={{fontSize:10,color:"var(--muted)",marginTop:5}}>
                Hikvision DVR: /Streaming/Channels/101 (cam1) · 201 (cam2 main) · Mi: /stream1
              </div>
            </div>
          </div>

          {isLocalIP(form.rtsp_url) && (
            <div className="warn-banner" style={{marginTop:12}}>
              <AlertTriangle size={14} strokeWidth={1.5} style={{flexShrink:0,marginTop:1}} />
              <div>
                <strong>Local IP detected — camera unreachable from cloud.</strong><br/>
                <span style={{fontSize:11}}>
                  192.168.x.x addresses are only visible inside your shop WiFi.
                  The server runs on Render.com and cannot reach your local network.<br/>
                  <strong>Fix:</strong> On your Mi router (192.168.31.1) → Port Forwarding:<br/>
                  &nbsp;• DVR (Hikvision): external <strong>554</strong> → 192.168.31.36:554<br/>
                  &nbsp;• Ezviz CS-C6N: external <strong>5541</strong> → 192.168.31.92:554<br/>
                  &nbsp;• Mi Camera: external <strong>5542</strong> → 192.168.31.72:554<br/>
                  Then use your public IP in the RTSP URL, e.g. <code>rtsp://admin:PASS@PUBLIC_IP:5542/stream1</code>
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
          <div className="empty-sub">Use the form above to add your first RTSP camera.</div>
        </div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {cameras.map(cam => (
            <div key={cam.serial} className="card card-sm" style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:400,fontSize:13,marginBottom:3,display:"flex",alignItems:"center",gap:8}}>
                  {cam.name}
                  {isLocalIP(cam.rtsp_url||"") && (
                    <span title="Local IP — unreachable from cloud. Set up port forwarding."
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
                <div style={{fontSize:10,color:"var(--dim)",wordBreak:"break-all"}}>{cam.rtsp_url}</div>
                {tests[cam.serial]===false && isLocalIP(cam.rtsp_url||"") && (
                  <div style={{fontSize:10,color:"#f59e0b",marginTop:4}}>
                    Connection failed — local IP unreachable from cloud. Port-forward on your Mi router (192.168.31.1) first.
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
    </>
  );
}
