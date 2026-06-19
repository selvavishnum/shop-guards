import { useEffect, useState } from "react";
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { api } from "../services/api";

const TIP = { backgroundColor:"#111", border:"1px solid rgba(255,255,255,0.1)", borderRadius:2, fontSize:11 };

export default function Analytics() {
  const [stats, setStats] = useState(null);

  useEffect(() => { api.getStats().then(setStats).catch(()=>{}); }, []);

  if (!stats) return (
    <div style={{textAlign:"center",padding:"48px 0",color:"var(--muted)",fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase"}}>
      Loading…
    </div>
  );

  const hourlyData = Array.from({length:24},(_,h) => {
    const hh   = String(h).padStart(2,"0");
    const found = stats.hourly?.find(x => x.hour === hh);
    return { hour:`${hh}:00`, alerts: found?.cnt || 0 };
  });

  const STAT_ITEMS = [
    { label:"Total Cameras",   value: stats.total_cameras       ?? 0 },
    { label:"Alerts Today",    value: stats.today_alerts        ?? 0 },
    { label:"Customers",       value: stats.customer_count_today ?? 0 },
    { label:"Vehicles",        value: stats.vehicle_count_today  ?? 0 },
    { label:"Drawer Opens",    value: stats.drawer_opens_today   ?? 0 },
    { label:"Active Cameras",  value: stats.active_cameras      ?? 0 },
  ];

  return (
    <>
      <div className="page-header">
        <div className="page-title">Analytics</div>
      </div>

      <div className="stats-grid" style={{marginBottom:20}}>
        {STAT_ITEMS.map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
        <div className="card">
          <div style={{fontSize:10,fontWeight:500,letterSpacing:"0.1em",textTransform:"uppercase",color:"var(--muted)",marginBottom:14}}>
            Alerts by Hour — Today
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="hour" tick={{fill:"rgba(255,255,255,0.3)",fontSize:10}} interval={3} />
                <YAxis tick={{fill:"rgba(255,255,255,0.3)",fontSize:10}} allowDecimals={false} />
                <Tooltip contentStyle={TIP} labelStyle={{color:"#fff"}} />
                <Line type="monotone" dataKey="alerts" stroke="#fff" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div style={{fontSize:10,fontWeight:500,letterSpacing:"0.1em",textTransform:"uppercase",color:"var(--muted)",marginBottom:14}}>
            Alerts by Type — Today
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.by_alert_type || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="alert_type" tick={{fill:"rgba(255,255,255,0.3)",fontSize:9}} />
                <YAxis tick={{fill:"rgba(255,255,255,0.3)",fontSize:10}} allowDecimals={false} />
                <Tooltip contentStyle={TIP} />
                <Bar dataKey="cnt" fill="rgba(255,255,255,0.7)" radius={[2,2,0,0]} name="Alerts" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {stats.top_cameras?.length > 0 && (
        <div className="card">
          <div style={{fontSize:10,fontWeight:500,letterSpacing:"0.1em",textTransform:"uppercase",color:"var(--muted)",marginBottom:14}}>
            Top Cameras by Alerts — Today
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.top_cameras} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" tick={{fill:"rgba(255,255,255,0.3)",fontSize:10}} allowDecimals={false} />
                <YAxis type="category" dataKey="camera_name" tick={{fill:"rgba(255,255,255,0.3)",fontSize:10}} width={110} />
                <Tooltip contentStyle={TIP} />
                <Bar dataKey="cnt" fill="rgba(255,255,255,0.5)" radius={[0,2,2,0]} name="Alerts" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </>
  );
}
