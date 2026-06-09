import { VideoOff, Video, Users } from "lucide-react";

const MONITOR_LABELS = {
  theft:            { label: "Theft",       cls: "badge-red" },
  customer_count:   { label: "Customers",   cls: "badge-green" },
  cash_drawer:      { label: "Cash Drawer", cls: "badge-blue" },
  staff_misbehavior:{ label: "Behavior",    cls: "badge-orange" },
  staff_idle:       { label: "Idle Check",  cls: "badge-gray" },
};

export function CameraCard({ camera, onOpen }) {
  const b64     = camera.last_snapshot;
  const imgSrc  = b64 ? `data:image/jpeg;base64,${b64}` : null;
  const monMeta = MONITOR_LABELS[camera.monitor_type] || { label: camera.monitor_type, cls: "badge-gray" };

  return (
    <div
      className={`cam-card${camera._alert ? " alert" : ""}`}
      onClick={() => onOpen(camera)}
    >
      <div className="cam-img-wrap">
        {imgSrc ? (
          <img src={imgSrc} alt={camera.name} />
        ) : (
          <div className="cam-img-placeholder">
            <Video size={28} />
          </div>
        )}
        <span className="cam-live-badge">RTSP</span>
        {camera._alert && (
          <span style={{ position: "absolute", top: 8, right: 8, background: "var(--red)", borderRadius: 4, fontSize: 10, fontWeight: 700, padding: "2px 6px", color: "white" }}>
            ALERT
          </span>
        )}
      </div>
      <div className="cam-info">
        <div>
          <div className="cam-name">{camera.name}</div>
          <div className="cam-location">{camera.location || camera.serial}</div>
        </div>
        <span className={`badge ${monMeta.cls}`} style={{ fontSize: 10, whiteSpace: "nowrap" }}>
          {monMeta.label}
        </span>
      </div>
    </div>
  );
}

export function SnapshotModal({ camera, onClose }) {
  if (!camera) return null;
  const b64    = camera.last_snapshot;
  const imgSrc = b64 ? `data:image/jpeg;base64,${b64}` : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div style={{ fontWeight: 700 }}>{camera.name}</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>{camera.location || camera.serial}</div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ background: "#000", aspectRatio: "16/9", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {imgSrc ? (
            <img src={imgSrc} alt={camera.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          ) : (
            <span style={{ color: "var(--muted)", fontSize: 13 }}>No snapshot yet — waiting for first scan.</span>
          )}
        </div>
        <div style={{ padding: "10px 20px", fontSize: 12, color: "var(--muted)", display: "flex", gap: 16 }}>
          <span>Serial: {camera.serial}</span>
          <span>Mode: {MONITOR_LABELS[camera.monitor_type]?.label || camera.monitor_type}</span>
          <span style={{ marginLeft: "auto" }}>Snapshots update every scan cycle</span>
        </div>
      </div>
    </div>
  );
}
