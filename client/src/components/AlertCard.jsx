import { Clock, Camera, Users, Car } from "lucide-react";

export const ALERT_LABELS = {
  intrusion:         "Zone Intrusion",
  after_hours:       "After-Hours Alert",
  crowd:             "Crowd Alert",
  customer_entry:    "Customer Entry",
  drawer_open:       "Cash Drawer Opened",
  drawer_no_customer:"Drawer Opened — No Customer",
  misbehavior:       "Staff Misbehavior",
  staff_idle:        "Staff Idle Alert",
  vehicle_detected:  "Vehicle Detected",
  phone_use:         "Phone Use Detected",
  bag_suspicious:    "Suspicious Bag",
  print_failed:      "Bill Print Failed",
};

export default function AlertCard({ alert }) {
  const label = ALERT_LABELS[alert.alert_type] || alert.alert_type;
  const thumb = alert.annotated_b64 ? `data:image/jpeg;base64,${alert.annotated_b64}` : null;

  return (
    <div className={`alert-item ${alert.alert_type}`}>
      {thumb && (
        <div className="alert-thumb"><img src={thumb} alt="snapshot" /></div>
      )}
      <div className="alert-meta">
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
          <span className="badge">{label}</span>
          {alert.person_count > 0 && (
            <span className="badge badge-muted">
              <Users size={9} strokeWidth={1.5} /> {alert.person_count}
            </span>
          )}
          {alert.vehicle_count > 0 && (
            <span className="badge badge-muted">
              <Car size={9} strokeWidth={1.5} /> {alert.vehicle_count}
            </span>
          )}
        </div>
        <div className="alert-title">{alert.camera_name}</div>
        <div className="alert-sub">
          <span style={{ display:"flex", alignItems:"center", gap:3 }}>
            <Camera size={10} strokeWidth={1.5} /> {alert.camera_serial}
          </span>
          <span style={{ display:"flex", alignItems:"center", gap:3 }}>
            <Clock size={10} strokeWidth={1.5} /> {alert.created_at?.slice(0,16).replace("T"," ")}
          </span>
        </div>
      </div>
    </div>
  );
}
