import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { api } from "../services/api";
import AlertCard from "../components/AlertCard";

const ALERT_TYPES = [
  { value: "",               label: "All Types" },
  { value: "intrusion",      label: "Zone Intrusion" },
  { value: "after_hours",    label: "After-Hours" },
  { value: "crowd",          label: "Crowd Alert" },
  { value: "customer_entry", label: "Customer Entry" },
  { value: "drawer_open",    label: "Cash Drawer" },
  { value: "misbehavior",    label: "Staff Misbehavior" },
  { value: "staff_idle",     label: "Staff Idle" },
];

const MONITOR_TYPES = [
  { value: "",                 label: "All Modes" },
  { value: "theft",            label: "Theft" },
  { value: "customer_count",   label: "Customer Count" },
  { value: "cash_drawer",      label: "Cash Drawer" },
  { value: "staff_misbehavior",label: "Staff Misbehavior" },
  { value: "staff_idle",       label: "Staff Idle" },
];

const PAGE_SIZE = 20;

export default function Alerts() {
  const [alerts, setAlerts]   = useState([]);
  const [total,  setTotal]    = useState(0);
  const [page,   setPage]     = useState(0);
  const [filters, setFilters] = useState({ alert_type: "", monitor_type: "", camera_serial: "" });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const params = { page, page_size: PAGE_SIZE };
      if (filters.alert_type)    params.alert_type    = filters.alert_type;
      if (filters.monitor_type)  params.monitor_type  = filters.monitor_type;
      if (filters.camera_serial) params.camera_serial = filters.camera_serial;
      const data = await api.getAlerts(params);
      setAlerts(data.alerts || []);
      setTotal(data.total   || 0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page, filters]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const set = (k, v) => { setFilters(f => ({ ...f, [k]: v })); setPage(0); };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Alerts</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{total} total</div>
        </div>
      </div>

      <div className="filter-bar">
        <select className="form-input" style={{ maxWidth: 160 }} value={filters.alert_type} onChange={e => set("alert_type", e.target.value)}>
          {ALERT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select className="form-input" style={{ maxWidth: 160 }} value={filters.monitor_type} onChange={e => set("monitor_type", e.target.value)}>
          {MONITOR_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <input
          className="form-input"
          style={{ maxWidth: 200 }}
          placeholder="Camera serial…"
          value={filters.camera_serial}
          onChange={e => set("camera_serial", e.target.value)}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--muted)" }}>Loading…</div>
      ) : alerts.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <Bell size={36} color="var(--border)" style={{ margin: "0 auto 12px" }} />
          <div style={{ fontWeight: 600, marginBottom: 4 }}>No alerts</div>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            Alerts appear here when the AI detects suspicious activity.
          </div>
        </div>
      ) : (
        <>
          <div className="alert-list">
            {alerts.map(a => <AlertCard key={a.id} alert={a} />)}
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button className="page-btn" onClick={() => setPage(p => p - 1)} disabled={page === 0}>‹</button>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>Page {page + 1} of {totalPages}</span>
              <button className="page-btn" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>›</button>
            </div>
          )}
        </>
      )}
    </>
  );
}
