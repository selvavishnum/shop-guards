import { Routes, Route, NavLink } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { LayoutGrid, Bell, BarChart2, Settings, Shield, Video, Users, Clock } from "lucide-react";
import Dashboard   from "./pages/Dashboard";
import Alerts      from "./pages/Alerts";
import Analytics   from "./pages/Analytics";
import SettingsPage from "./pages/Settings";
import CamerasPage from "./pages/Cameras";
import StaffPage   from "./pages/Staff";
import AttendancePage from "./pages/Attendance";
import { openAlertWS } from "./services/api";

const ALERT_LABELS = {
  intrusion:         "Zone Intrusion",
  after_hours:       "After-Hours",
  crowd:             "Crowd Alert",
  customer_entry:    "Customer Entry",
  drawer_open:       "Cash Drawer",
  drawer_no_customer:"Drawer — No Customer",
  misbehavior:       "Misbehavior",
  staff_idle:        "Staff Idle",
  vehicle_detected:  "Vehicle",
  phone_use:         "Phone Use",
  bag_suspicious:    "Suspicious Bag",
  print_failed:      "Bill Print Failed",
};

export default function App() {
  const [toasts, setToasts] = useState([]);
  const [wsOk,   setWsOk]   = useState(false);
  const wsRef = useRef(null);

  // cameras state for live snapshot updates
  const [liveCams, setLiveCams] = useState({});

  useEffect(() => {
    function connect() {
      const ws = openAlertWS((event) => {
        if (event.type === "snapshot") {
          setLiveCams(prev => ({
            ...prev,
            [event.camera_serial]: {
              b64:          event.b64,
              person_count: event.person_count,
              vehicle_count:event.vehicle_count,
              timestamp:    event.timestamp,
            }
          }));
          return;
        }
        if (event.type === "alert" || event.type === "attendance") {
          const id = Date.now();
          setToasts(t => [...t.slice(-4), { id, event }]);
          setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5000);
        }
      });
      ws.onopen  = () => setWsOk(true);
      ws.onclose = () => { setWsOk(false); setTimeout(connect, 3000); };
      ws.onerror = () => ws.close();
      wsRef.current = ws;
    }
    connect();
    return () => wsRef.current?.close();
  }, []);

  return (
    <div className="layout">
      <header className="topbar">
        <div className="topbar-logo">
          <Shield size={16} strokeWidth={1.5} />
          ShopGuard AI
        </div>
        <div className="topbar-status">
          <div className={`status-dot${wsOk ? "" : " offline"}`} />
          {wsOk ? "Live" : "Reconnecting"}
        </div>
      </header>

      <nav className="sidebar">
        <div className="nav-section">Monitor</div>
        <NavLink to="/" end className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
          <LayoutGrid size={14} strokeWidth={1.5} /> Dashboard
        </NavLink>
        <NavLink to="/alerts" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
          <Bell size={14} strokeWidth={1.5} /> Alerts
        </NavLink>

        <div className="nav-section">Insights</div>
        <NavLink to="/analytics" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
          <BarChart2 size={14} strokeWidth={1.5} /> Analytics
        </NavLink>
        <NavLink to="/attendance" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
          <Clock size={14} strokeWidth={1.5} /> Attendance
        </NavLink>

        <div className="nav-section">System</div>
        <NavLink to="/cameras" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
          <Video size={14} strokeWidth={1.5} /> Cameras
        </NavLink>
        <NavLink to="/staff" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
          <Users size={14} strokeWidth={1.5} /> Staff
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
          <Settings size={14} strokeWidth={1.5} /> Settings
        </NavLink>
      </nav>

      <main className="main">
        <Routes>
          <Route path="/"          element={<Dashboard liveCams={liveCams} />} />
          <Route path="/alerts"    element={<Alerts />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/attendance" element={<AttendancePage />} />
          <Route path="/cameras"   element={<CamerasPage />} />
          <Route path="/staff"    element={<StaffPage />} />
          <Route path="/settings"  element={<SettingsPage />} />
        </Routes>
      </main>

      <div className="toast-container">
        {toasts.map(({ id, event }) => (
          <div key={id} className="toast">
            {event.type === "attendance" ? (
              <>
                <div className="toast-title">
                  {event.staff_name} — {event.event_type === "in" ? "Checked In" : "Checked Out"}
                </div>
                <div className="toast-body">
                  {event.camera_serial}{" · "}{event.time?.slice(11, 16)}
                </div>
              </>
            ) : event.alert_type === "print_failed" ? (
              <>
                <div className="toast-title">
                  {ALERT_LABELS.print_failed} — {event.camera_name}
                </div>
                <div className="toast-body">
                  {event.print_reason && `${event.print_reason}`}
                  {event.print_document && ` · ${event.print_document}`}
                  {" · "}{event.time?.slice(11, 16)}
                </div>
              </>
            ) : (
              <>
                <div className="toast-title">
                  {ALERT_LABELS[event.alert_type] || event.alert_type} — {event.camera_name}
                </div>
                <div className="toast-body">
                  {event.person_count > 0 && `${event.person_count} person${event.person_count !== 1 ? "s" : ""}`}
                  {event.vehicle_count > 0 && ` · ${event.vehicle_count} vehicle${event.vehicle_count !== 1 ? "s" : ""}`}
                  {" · "}{event.time?.slice(11, 16)}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
