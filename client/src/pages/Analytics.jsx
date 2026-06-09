import { useEffect, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { api } from "../services/api";

const CHART_STYLE = {
  backgroundColor: "#1e293b",
  border: "1px solid #475569",
  borderRadius: 8,
  fontSize: 12,
};

const MONITOR_COLORS = {
  theft:             "#ef4444",
  customer_count:    "#22c55e",
  cash_drawer:       "#3b82f6",
  staff_misbehavior: "#f97316",
  staff_idle:        "#94a3b8",
};

export default function Analytics() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.getStats().then(setStats).catch(() => {});
  }, []);

  if (!stats) return (
    <div style={{ textAlign: "center", padding: "40px 0", color: "var(--muted)" }}>Loading…</div>
  );

  const hourlyData = Array.from({ length: 24 }, (_, h) => {
    const hh = String(h).padStart(2, "0");
    const found = stats.hourly?.find(x => x.hour === hh);
    return { hour: `${hh}:00`, alerts: found?.cnt || 0 };
  });

  const byMonitorData = (stats.by_monitor || []).map(r => ({
    name: r.monitor_type,
    count: r.cnt,
    fill: MONITOR_COLORS[r.monitor_type] || "#94a3b8",
  }));

  return (
    <>
      <div className="page-header">
        <div className="page-title">Analytics</div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">Total Cameras</div>
          <div className="stat-value blue">{stats.total_cameras ?? "—"}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Alerts Today</div>
          <div className="stat-value red">{stats.today_alerts ?? 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Customers Today</div>
          <div className="stat-value green">{stats.customer_count_today ?? 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Drawer Opens</div>
          <div className="stat-value" style={{ color: "var(--orange)" }}>{stats.drawer_opens_today ?? 0}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 14 }}>Alerts by Hour (Today)</div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="hour" tick={{ fill: "#94a3b8", fontSize: 11 }} interval={3} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={CHART_STYLE} />
                <Line type="monotone" dataKey="alerts" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 14 }}>Alerts by Monitor Mode</div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byMonitorData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={CHART_STYLE} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Alerts"
                  fill="#3b82f6"
                  label={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {stats.top_cameras?.length > 0 && (
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 14 }}>Top Cameras by Alerts Today</div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.top_cameras} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="camera_name" tick={{ fill: "#94a3b8", fontSize: 11 }} width={120} />
                <Tooltip contentStyle={CHART_STYLE} />
                <Bar dataKey="cnt" fill="#f97316" radius={[0, 4, 4, 0]} name="Alerts" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </>
  );
}
