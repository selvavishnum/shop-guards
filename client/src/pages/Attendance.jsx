import { useEffect, useState } from "react";
import { Clock, LogIn, LogOut } from "lucide-react";
import { api } from "../services/api";

const PAGE_SIZE = 20;

export default function AttendancePage() {
  const [summary, setSummary] = useState([]);
  const [events,  setEvents]  = useState([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(0);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [s, e] = await Promise.all([
        api.getAttendanceSummary(),
        api.getAttendance({ page, page_size: PAGE_SIZE }),
      ]);
      setSummary(s.summary || []);
      setEvents(e.events || []); setTotal(e.total || 0);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [page]);
  useEffect(() => {
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [page]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Attendance</div>
          <div className="page-sub">Face-recognition staff check-in / check-out</div>
        </div>
      </div>

      <div style={{fontSize:10,fontWeight:500,letterSpacing:"0.1em",textTransform:"uppercase",color:"var(--muted)",marginBottom:10}}>
        Today
      </div>
      {summary.length === 0 ? (
        <div className="card empty-state" style={{marginBottom:20}}>
          <Clock size={32} strokeWidth={0.8} />
          <div className="empty-title">No Attendance Yet Today</div>
          <div className="empty-sub">Enrolled staff will appear here once recognized by a camera.</div>
        </div>
      ) : (
        <div className="camera-grid" style={{marginBottom:20}}>
          {summary.map(s => (
            <div key={s.staff_id} className="card card-sm" style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div>
                <div style={{fontWeight:400,fontSize:13,marginBottom:3}}>{s.staff_name}</div>
                <div style={{fontSize:10,color:"var(--muted)"}}>
                  First in {s.first_in?.slice(11,16) || "—"} · Last {s.last_time?.slice(11,16)}
                </div>
              </div>
              <span className={`badge${s.status==="in" ? "" : " badge-muted"}`}>
                {s.status === "in" ? <><LogIn size={10} strokeWidth={2}/> IN</> : <><LogOut size={10} strokeWidth={2}/> OUT</>}
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{fontSize:10,fontWeight:500,letterSpacing:"0.1em",textTransform:"uppercase",color:"var(--muted)",marginBottom:10}}>
        Recent Events
      </div>
      {loading ? (
        <div style={{textAlign:"center",padding:"40px 0",color:"var(--muted)",fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase"}}>Loading…</div>
      ) : events.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-title">No Events</div>
        </div>
      ) : (
        <>
          <div className="alert-list">
            {events.map(ev => (
              <div key={ev.id} className={`alert-item ${ev.event_type === "in" ? "customer_entry" : "staff_idle"}`}>
                <div className="alert-meta">
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                    <span className="badge">{ev.event_type === "in" ? "Checked In" : "Checked Out"}</span>
                  </div>
                  <div className="alert-title">{ev.staff_name}</div>
                  <div className="alert-sub">
                    <span>{ev.camera_serial}</span>
                    <span style={{display:"flex",alignItems:"center",gap:3}}>
                      <Clock size={10} strokeWidth={1.5} /> {ev.created_at?.slice(0,16).replace("T"," ")}
                    </span>
                  </div>
                </div>
              </div>
            ))}
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
