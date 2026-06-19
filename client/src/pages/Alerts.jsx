import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { api } from "../services/api";
import AlertCard, { ALERT_LABELS } from "../components/AlertCard";

const TYPES = Object.entries(ALERT_LABELS).map(([v,l]) => ({ value:v, label:l }));
const PAGE_SIZE = 20;

export default function Alerts() {
  const [alerts, setAlerts] = useState([]);
  const [total,  setTotal]  = useState(0);
  const [page,   setPage]   = useState(0);
  const [fType,  setFType]  = useState("");
  const [fCam,   setFCam]   = useState("");
  const [loading,setLoading]= useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const p = { page, page_size: PAGE_SIZE };
      if (fType) p.alert_type    = fType;
      if (fCam)  p.camera_serial = fCam;
      const d = await api.getAlerts(p);
      setAlerts(d.alerts || []); setTotal(d.total || 0);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [page, fType, fCam]);
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const setF = (fn) => { fn(); setPage(0); };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Alerts</div>
          <div className="page-sub">{total} total events</div>
        </div>
      </div>

      <div className="toolbar">
        <select className="form-input" style={{maxWidth:170}} value={fType}
          onChange={e => setF(()=>setFType(e.target.value))}>
          <option value="">All Alert Types</option>
          {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <input className="form-input" style={{maxWidth:200}} placeholder="Camera serial…"
          value={fCam} onChange={e => setF(()=>setFCam(e.target.value))} />
      </div>

      {loading ? (
        <div style={{textAlign:"center",padding:"40px 0",color:"var(--muted)",fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase"}}>Loading…</div>
      ) : alerts.length === 0 ? (
        <div className="card empty-state">
          <Bell size={36} strokeWidth={0.8} />
          <div className="empty-title">No Alerts</div>
          <div className="empty-sub">Alerts appear here when the AI detects suspicious activity.</div>
        </div>
      ) : (
        <>
          <div className="alert-list">
            {alerts.map(a => <AlertCard key={a.id} alert={a} />)}
          </div>
          {totalPages > 1 && (
            <div className="pagination">
              <button className="page-btn" onClick={()=>setPage(p=>p-1)} disabled={page===0}>‹</button>
              <span style={{fontSize:11,color:"var(--muted)"}}>Page {page+1} of {totalPages}</span>
              <button className="page-btn" onClick={()=>setPage(p=>p+1)} disabled={page>=totalPages-1}>›</button>
            </div>
          )}
        </>
      )}
    </>
  );
}
