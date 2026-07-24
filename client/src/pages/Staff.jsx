import { useEffect, useRef, useState } from "react";
import { UserPlus, Trash2, User } from "lucide-react";
import { api } from "../services/api";

const ROLE_OPTIONS = [
  { value: "staff",   label: "Staff" },
  { value: "cashier", label: "Cashier" },
  { value: "manager", label: "Manager" },
];

export default function StaffPage() {
  const [list,    setList]    = useState([]);
  const [name,    setName]    = useState("");
  const [role,    setRole]    = useState("staff");
  const [photo,   setPhoto]   = useState(null);   // base64, no data: prefix
  const [preview, setPreview] = useState("");
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(true);
  const fileRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try { const d = await api.getStaffList(); setList(d.staff || []); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    // Poll — reflects the on-site agent's enrollment (Pending -> Enrolled) automatically.
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      setPreview(dataUrl);
      setPhoto(dataUrl.split(",")[1] || "");
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setError("");
    if (!name || !photo) { setError("Name and a clear face photo are required."); return; }
    setSaving(true);
    try {
      await api.addStaff({ name, role, face_b64: photo });
      setName(""); setRole("staff"); setPhoto(null); setPreview("");
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to save.");
    } finally { setSaving(false); }
  };

  const handleDelete = async (id, personName) => {
    if (!confirm(`Remove ${personName} from staff?`)) return;
    await api.deleteStaff(id); await load();
  };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Staff</div>
          <div className="page-sub">{list.length} enrolled for face-recognition attendance</div>
        </div>
      </div>

      <div className="card" style={{marginBottom:16}}>
        <div style={{fontSize:10,fontWeight:500,letterSpacing:"0.1em",textTransform:"uppercase",color:"var(--muted)",marginBottom:16}}>
          Add Staff Member
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div className="form-group" style={{marginBottom:0}}>
              <label className="form-label">Name *</label>
              <input className="form-input" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Kumar" />
            </div>
            <div className="form-group" style={{marginBottom:0}}>
              <label className="form-label">Role</label>
              <select className="form-input" value={role} onChange={e=>setRole(e.target.value)}>
                {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="form-group" style={{gridColumn:"1/-1",marginBottom:0}}>
              <label className="form-label">Face Photo *</label>
              <input ref={fileRef} type="file" accept="image/*" className="form-input" onChange={handleFile} />
              <div style={{fontSize:10,color:"var(--muted)",marginTop:5}}>
                One clear, front-facing photo. The on-site agent computes the face embedding automatically within ~30s of saving.
              </div>
            </div>
          </div>

          {preview && (
            <div style={{marginTop:12,width:100,height:100,borderRadius:4,overflow:"hidden",border:"1px solid var(--border)"}}>
              <img src={preview} alt="preview" style={{width:"100%",height:"100%",objectFit:"cover"}} />
            </div>
          )}

          {error && <div style={{marginTop:10,fontSize:12,color:"var(--muted)"}}>{error}</div>}
          <div style={{display:"flex",gap:8,marginTop:14}}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              <UserPlus size={12} strokeWidth={1.5} /> {saving?"Saving…":"Add Staff"}
            </button>
          </div>
        </form>
      </div>

      {loading ? (
        <div style={{textAlign:"center",padding:40,color:"var(--muted)",fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase"}}>Loading…</div>
      ) : list.length === 0 ? (
        <div className="card empty-state">
          <User size={36} strokeWidth={0.8} />
          <div className="empty-title">No Staff Yet</div>
          <div className="empty-sub">Add staff above to enable face-recognition attendance.</div>
        </div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {list.map(p => (
            <div key={p.id} className="card card-sm" style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:400,fontSize:13,marginBottom:3}}>{p.name}</div>
                <div style={{fontSize:11,color:"var(--muted)"}}>{p.role}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:7,flexShrink:0}}>
                <span className={`badge${p.enrolled ? "" : " badge-muted"}`}>
                  {p.enrolled ? "Enrolled" : "Pending"}
                </span>
                <button className="btn btn-danger btn-xs" onClick={()=>handleDelete(p.id, p.name)}>
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
