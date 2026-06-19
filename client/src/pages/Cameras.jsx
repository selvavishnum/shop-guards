import { useEffect, useState } from "react";
import { Plus, Trash2, Edit2, Wifi, X, CheckCircle, XCircle } from "lucide-react";
import { api } from "../services/api";

const MONITOR_OPTIONS = [
  { value:"theft",             label:"Theft Detection" },
  { value:"customer_count",    label:"Customer Count" },
  { value:"cash_drawer",       label:"Cash Drawer Monitor" },
  { value:"staff_misbehavior", label:"Staff Misbehavior" },
  { value:"staff_idle",        label:"Staff Idle Alert" },
];

const EMPTY = { serial:"", name:"", location:"", rtsp_url:"", monitor_type:"theft" };

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
                Hikvision DVR: /Streaming/Channels/101 (cam1) · 201 (cam2) · Mi: /stream1
              </div>
            </div>
          </div>
          {error && <div style={{marginTop:10,fontSize:12,color:"rgba(255,255,255,0.6)"}}>{error}</div>}
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
                <div style={{fontWeight:400,fontSize:13,marginBottom:3}}>{cam.name}</div>
                <div style={{fontSize:11,color:"var(--muted)",marginBottom:2}}>
                  {cam.location && <span>{cam.location} · </span>}
                  <span style={{fontFamily:"monospace"}}>{cam.serial}</span>
                  {" · "}{cam.monitor_type}
                </div>
                <div style={{fontSize:10,color:"rgba(255,255,255,0.2)",wordBreak:"break-all"}}>{cam.rtsp_url}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:7,flexShrink:0}}>
                <span className={`badge${cam.enabled ? "" : " badge-muted"}`}>
                  {cam.enabled ? "ON" : "OFF"}
                </span>
                {tests[cam.serial]===true  && <CheckCircle size={14} strokeWidth={1.5} style={{color:"var(--text)"}} />}
                {tests[cam.serial]===false && <XCircle     size={14} strokeWidth={1.5} style={{color:"rgba(255,255,255,0.35)"}} />}
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
