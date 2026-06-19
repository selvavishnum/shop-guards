import { useEffect, useState } from "react";
import { LayoutGrid, List, Plus, RefreshCw, Video } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import FeaturePanel from "../components/FeaturePanel";

const PAGE_SIZE = 12;

function parseFeat(str) {
  try { return JSON.parse(str || "{}"); } catch { return {}; }
}

const FEAT_KEYS = ["theft","vehicle","human_tracking","staff","face","product"];
const FEAT_LABELS = { theft:"THEFT", vehicle:"VEH", human_tracking:"TRACK", staff:"STAFF", face:"FACE", product:"PROD" };

function CameraCard({ camera, live, selected, onClick }) {
  const feat   = parseFeat(camera.features);
  const imgSrc = live?.b64
    ? `data:image/jpeg;base64,${live.b64}`
    : camera.last_snapshot
      ? `data:image/jpeg;base64,${camera.last_snapshot}`
      : null;

  return (
    <div className={`cam-card${selected ? " selected" : ""}`} onClick={onClick}>
      <div className="cam-img-wrap">
        {imgSrc ? <img src={imgSrc} alt={camera.name} /> : (
          <div className="cam-img-placeholder"><Video size={28} strokeWidth={1} /></div>
        )}
        <div className={`cam-dot${camera.enabled ? "" : " off"}`} />
        {(live?.person_count > 0 || live?.vehicle_count > 0) && (
          <div className="cam-badge">
            {live.person_count > 0  && `${live.person_count}P`}
            {live.vehicle_count > 0 && ` ${live.vehicle_count}V`}
          </div>
        )}
      </div>
      <div className="cam-info">
        <div className="cam-name">{camera.name}</div>
        <div className="cam-location">{camera.location || camera.serial}</div>
        <div className="cam-features">
          {FEAT_KEYS.map(k => feat[k]
            ? <span key={k} className="feat-pill on">{FEAT_LABELS[k]}</span>
            : null
          )}
        </div>
      </div>
    </div>
  );
}

function CameraRow({ camera, live, selected, onClick }) {
  const feat   = parseFeat(camera.features);
  const imgSrc = live?.b64
    ? `data:image/jpeg;base64,${live.b64}`
    : camera.last_snapshot
      ? `data:image/jpeg;base64,${camera.last_snapshot}`
      : null;

  return (
    <div className={`cam-row${selected ? " selected" : ""}`} onClick={onClick}>
      <div className="cam-row-thumb">
        {imgSrc ? <img src={imgSrc} alt="" /> : null}
        <div className={`cam-dot${camera.enabled ? "" : " off"}`} style={{ position:"absolute", top:5, left:5 }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 400, marginBottom: 3 }}>{camera.name}</div>
        <div style={{ fontSize: 10, color: "var(--muted)" }}>{camera.location || camera.serial}</div>
      </div>
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        {FEAT_KEYS.filter(k => feat[k]).map(k =>
          <span key={k} className="feat-pill on">{FEAT_LABELS[k]}</span>
        )}
      </div>
      {live?.person_count > 0 && (
        <div className="cam-badge" style={{ position:"static", marginLeft:4 }}>{live.person_count}P</div>
      )}
    </div>
  );
}

export default function Dashboard({ liveCams = {} }) {
  const [cameras,  setCameras]  = useState([]);
  const [stats,    setStats]    = useState({});
  const [page,     setPage]     = useState(0);
  const [view,     setView]     = useState("grid");
  const [selected, setSelected] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const [camData, statsData] = await Promise.all([api.getCameras(), api.getStats()]);
      setCameras(camData.cameras || []);
      setStats(statsData);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const totalPages = Math.ceil(cameras.length / PAGE_SIZE);
  const pageCams   = cameras.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const selCam     = cameras.find(c => c.serial === selected) || null;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Live Dashboard</div>
          <div className="page-sub">{cameras.length} cameras · updates every scan cycle</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div className="view-toggle">
            <button className={`view-btn${view==="grid"?" active":""}`} onClick={() => setView("grid")}>
              <LayoutGrid size={14} strokeWidth={1.5} />
            </button>
            <button className={`view-btn${view==="list"?" active":""}`} onClick={() => setView("list")}>
              <List size={14} strokeWidth={1.5} />
            </button>
          </div>
          <button className="btn btn-outline btn-sm" onClick={load} disabled={loading}>
            <RefreshCw size={12} strokeWidth={1.5} className={loading ? "spin" : ""} />
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => navigate("/cameras")}>
            <Plus size={12} strokeWidth={1.5} /> Add Camera
          </button>
        </div>
      </div>

      <div className="stats-grid">
        {[
          { label: "Cameras",   value: stats.total_cameras   ?? cameras.length },
          { label: "Active",    value: stats.active_cameras  ?? cameras.filter(c=>c.enabled).length },
          { label: "Alerts",    value: stats.today_alerts    ?? 0 },
          { label: "Customers", value: stats.customer_count_today ?? 0 },
          { label: "Vehicles",  value: stats.vehicle_count_today  ?? 0 },
          { label: "Drawers",   value: stats.drawer_opens_today   ?? 0 },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign:"center", padding:"48px 0", color:"var(--muted)", fontSize:11, letterSpacing:"0.08em", textTransform:"uppercase" }}>
          Loading…
        </div>
      ) : cameras.length === 0 ? (
        <div className="card empty-state">
          <Video size={40} strokeWidth={0.8} />
          <div className="empty-title">No Cameras Added</div>
          <div className="empty-sub">Add your first RTSP camera to start AI monitoring.</div>
          <button className="btn btn-primary btn-sm" onClick={() => navigate("/cameras")}>
            <Plus size={12} strokeWidth={1.5} /> Add Camera
          </button>
        </div>
      ) : (
        <>
          <div className={view === "grid" ? "camera-grid" : "camera-list"}>
            {pageCams.map(cam => view === "grid"
              ? <CameraCard key={cam.serial} camera={cam} live={liveCams[cam.serial]} selected={cam.serial===selected} onClick={() => setSelected(cam.serial===selected?null:cam.serial)} />
              : <CameraRow  key={cam.serial} camera={cam} live={liveCams[cam.serial]} selected={cam.serial===selected} onClick={() => setSelected(cam.serial===selected?null:cam.serial)} />
            )}
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button className="page-btn" onClick={() => setPage(p=>p-1)} disabled={page===0}>‹</button>
              {Array.from({ length: totalPages }, (_, i) => (
                <button key={i} className={`page-btn${page===i?" active":""}`} onClick={() => setPage(i)}>{i+1}</button>
              ))}
              <button className="page-btn" onClick={() => setPage(p=>p+1)} disabled={page===totalPages-1}>›</button>
            </div>
          )}
        </>
      )}

      <FeaturePanel
        camera={selCam}
        liveCams={liveCams}
        onClose={() => setSelected(null)}
        onUpdate={load}
        onDelete={() => { setSelected(null); load(); }}
      />

      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}
