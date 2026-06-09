import { Clock, Camera, Users } from "lucide-react";

export const ALERT_LABELS = {
  intrusion:      "Zone Intrusion",
  after_hours:    "After-Hours Alert",
  crowd:          "Crowd Alert",
  customer_entry: "Customer Entry",
  drawer_open:    "Cash Drawer Opened",
  misbehavior:    "Staff Misbehavior",
  staff_idle:     "Staff Idle Alert",
};

const TYPE_META = {
  intrusion:      { cls: "badge-red" },
  after_hours:    { cls: "badge-yellow" },
  crowd:          { cls: "badge-orange" },
  customer_entry: { cls: "badge-green" },
  drawer_open:    { cls: "badge-blue" },
  misbehavior:    { cls: "badge-red" },
  staff_idle:     { cls: "badge-gray" },
};

export default function AlertCard({ alert }) {
  const label = ALERT_LABELS[alert.alert_type] || alert.alert_type;
  const meta  = TYPE_META[alert.alert_type]    || { cls: "badge-gray" };
  const thumb = alert.annotated_b64 ? `data:image/jpeg;base64,${alert.annotated_b64}` : null;

  return (
    <div className={`alert-item ${alert.alert_type}`}>
      {thumb && (
        <div className="alert-thumb">
          <img src={thumb} alt="snapshot" />
        </div>
      )}
      <div className="alert-meta">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span className={`badge ${meta.cls}`}>{label}</span>
          {alert.person_count > 0 && (
            <span className="badge badge-gray">
              <Users size={10} /> {alert.person_count}
            </span>
          )}
        </div>
        <div className="alert-title">{alert.camera_name}</div>
        <div className="alert-sub" style={{ display: "flex", gap: 12, marginTop: 4 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Camera size={11} /> {alert.camera_serial}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Clock size={11} /> {alert.created_at?.slice(0, 16).replace("T", " ")}
          </span>
        </div>
      </div>
    </div>
  );
}
