import { useEffect, useState } from "react";
import { Copy, Check, Lock } from "lucide-react";
import { api } from "../services/api";

export default function SettingsPage() {
  const [form, setForm] = useState({
    scan_interval:"60", crowd_threshold:"5", idle_threshold:"5",
    alert_cooldown:"180", shop_open:"08:00", shop_close:"22:00",
    email_to:"", email_from:"", email_password:"",
    ezviz_app_key:"", ezviz_app_secret:"", ezviz_api_base:"",
  });
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [agent,  setAgent]  = useState(null);
  const [copied, setCopied] = useState(false);
  const [ezvizConfigured, setEzvizConfigured] = useState(false);
  const [ezvizTesting,    setEzvizTesting]    = useState(false);
  const [ezvizTestOk,     setEzvizTestOk]     = useState(null);
  const [ezvizTestError,  setEzvizTestError]  = useState("");
  const [ezvizEnv, setEzvizEnv] = useState({ key:false, secret:false, base:false });

  useEffect(() => {
    api.getSettings().then(s => {
      setForm(f => ({...f,...s}));
      setEzvizConfigured(!!s.ezviz_configured);
      setEzvizEnv({
        key:    !!s.ezviz_key_env_managed,
        secret: !!s.ezviz_secret_env_managed,
        base:   !!s.ezviz_base_env_managed,
      });
    }).catch(()=>{});
    const loadAgent = () => api.getAgentStatus().then(setAgent).catch(()=>{});
    loadAgent();
    const t = setInterval(loadAgent, 15000);
    return () => clearInterval(t);
  }, []);

  const handleEzvizTest = async () => {
    setEzvizTesting(true); setEzvizTestOk(null); setEzvizTestError("");
    try {
      const payload = {};
      if (!ezvizEnv.key)    payload.ezviz_app_key    = form.ezviz_app_key;
      if (!ezvizEnv.secret) payload.ezviz_app_secret = form.ezviz_app_secret;
      if (!ezvizEnv.base)   payload.ezviz_api_base   = form.ezviz_api_base;
      if (Object.keys(payload).length) await api.saveSettings(payload);
      const r = await api.testEzviz();
      setEzvizTestOk(r.ok);
      setEzvizTestError(r.ok ? "" : (r.error || "Unknown failure"));
      if (r.ok) setEzvizConfigured(true);
    } catch (err) {
      setEzvizTestOk(false);
      const status = err?.response?.status;
      const data   = err?.response?.data;
      const detail = (data && (data.error || data.detail)) || err?.message;
      setEzvizTestError(detail || (status ? `Server returned HTTP ${status}` : "Request to the server failed — check your internet connection."));
    }
    finally { setEzvizTesting(false); }
  };

  const copyKey = () => {
    if (!agent?.agent_key) return;
    navigator.clipboard?.writeText(agent.agent_key);
    setCopied(true); setTimeout(()=>setCopied(false), 2000);
  };

  const set = (k,v) => setForm(f => ({...f,[k]:v}));

  const handleSave = async () => {
    setSaving(true); setSaved(false);
    try { await api.saveSettings(form); setSaved(true); setTimeout(()=>setSaved(false),3000); }
    finally { setSaving(false); }
  };

  const Field = ({ k, label, type="text", ...rest }) => (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input className="form-input" type={type} value={form[k]} onChange={e=>set(k,e.target.value)} {...rest} />
    </div>
  );

  return (
    <>
      <div className="page-header">
        <div className="page-title">Settings</div>
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
          {saving?"Saving…":saved?"Saved ✓":"Save"}
        </button>
      </div>

      <div className="card" style={{marginBottom:8,borderTop:"2px solid var(--accent)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <div style={{fontSize:10,fontWeight:500,letterSpacing:"0.1em",textTransform:"uppercase",color:"var(--muted)"}}>
            On-Site AI Agent
          </div>
          <span className={`badge${agent?.online ? "" : " badge-muted"}`} style={agent?.online ? {background:"var(--green)"} : {}}>
            {agent?.online ? "● Online" : "○ Offline"}
          </span>
        </div>
        <div style={{fontSize:11,color:"var(--muted)",lineHeight:1.7,marginBottom:14}}>
          Run AI on the cameras from inside your shop — no port-forwarding, passwords stay local.
          Install the agent on a shop PC/Raspberry Pi (see <code style={{fontSize:10}}>agent/README.md</code>),
          then paste the key below into its <code style={{fontSize:10}}>config.yaml</code>.
        </div>
        <label className="form-label">Agent Key</label>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <input className="form-input" readOnly value={agent?.agent_key || "loading…"}
            style={{fontFamily:"monospace",fontSize:11}} onFocus={e=>e.target.select()} />
          <button className="btn btn-outline btn-sm" onClick={copyKey} style={{flexShrink:0}}>
            {copied ? <><Check size={12} strokeWidth={1.5}/> Copied</> : <><Copy size={12} strokeWidth={1.5}/> Copy</>}
          </button>
        </div>
        {agent?.last_seen ? (
          <div style={{fontSize:10,color:"var(--muted)",marginTop:8}}>
            Last data received {agent.seconds_ago != null ? `${agent.seconds_ago}s ago` : "—"}.
          </div>
        ) : (
          <div style={{fontSize:10,color:"var(--muted)",marginTop:8}}>
            No agent has connected yet. Start the agent on your shop machine.
          </div>
        )}
      </div>

      <div className="card" style={{marginBottom:8,borderTop:"2px solid var(--accent)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <div style={{fontSize:10,fontWeight:500,letterSpacing:"0.1em",textTransform:"uppercase",color:"var(--muted)"}}>
            Ezviz Cloud
          </div>
          <span className={`badge${ezvizConfigured ? "" : " badge-muted"}`} style={ezvizConfigured ? {background:"var(--green)"} : {}}>
            {ezvizConfigured ? "● Connected" : "○ Not Set Up"}
          </span>
        </div>
        <div style={{fontSize:11,color:"var(--muted)",lineHeight:1.7,marginBottom:14}}>
          For Ezviz cameras, pull live snapshots directly from Ezviz's cloud — no RTSP,
          no port forwarding, no on-site PC needed for this camera. Get an App Key + App Secret
          from the Ezviz Open Platform developer console, paste them below, then add the camera
          on the Cameras page with connection type "Ezviz Cloud".
        </div>

        {(ezvizEnv.key || ezvizEnv.secret) && (
          <div className="warn-banner" style={{marginBottom:12,background:"var(--accent-s)",borderLeftColor:"var(--accent)"}}>
            <Lock size={14} strokeWidth={1.5} style={{flexShrink:0,marginTop:1,color:"var(--accent-d)"}} />
            <div style={{fontSize:11,color:"var(--text)",lineHeight:1.6}}>
              <strong>Managed via Render environment variables</strong> — set on Render, not here, for security.
              Change them in your Render dashboard (<code style={{fontSize:10}}>EZVIZ_APP_KEY</code> /
              <code style={{fontSize:10}}> EZVIZ_APP_SECRET</code>) and they take effect on the next restart.
              They never pass through this website.
            </div>
          </div>
        )}

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">App Key {ezvizEnv.key && <Lock size={9} strokeWidth={2} style={{verticalAlign:"middle",marginLeft:3}} />}</label>
            {ezvizEnv.key ? (
              <input className="form-input" disabled value="•••• set via Render ••••" style={{color:"var(--muted)"}} />
            ) : (
              <input className="form-input" value={form.ezviz_app_key} onChange={e=>set("ezviz_app_key",e.target.value)} placeholder="from open.ezvizlife.com" />
            )}
          </div>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">App Secret {ezvizEnv.secret && <Lock size={9} strokeWidth={2} style={{verticalAlign:"middle",marginLeft:3}} />}</label>
            {ezvizEnv.secret ? (
              <input className="form-input" disabled value="•••• set via Render ••••" style={{color:"var(--muted)"}} />
            ) : (
              <input className="form-input" type="password" value={form.ezviz_app_secret} onChange={e=>set("ezviz_app_secret",e.target.value)}
                placeholder={ezvizConfigured ? "Saved — leave blank to keep" : "your app secret"} />
            )}
          </div>
        </div>
        <div style={{fontSize:10,color:"var(--muted)",marginTop:10,marginBottom:10}}>
          If Test Connection fails with an "invalid key" error, your account may be on a
          different Ezviz region. Try one of these in "API Region" below:{" "}
          <code style={{fontSize:9}}>isgpopen.ezvizlife.com</code> (international, default) ·{" "}
          <code style={{fontSize:9}}>open.ezvizlife.com</code> (China) ·{" "}
          <code style={{fontSize:9}}>openeu.ezvizlife.com</code> (Europe)
        </div>
        <div className="form-group" style={{marginBottom:12}}>
          <label className="form-label">API Region (optional override) {ezvizEnv.base && <Lock size={9} strokeWidth={2} style={{verticalAlign:"middle",marginLeft:3}} />}</label>
          {ezvizEnv.base ? (
            <input className="form-input" disabled value="•••• set via Render (EZVIZ_API_BASE) ••••" style={{color:"var(--muted)"}} />
          ) : (
            <input className="form-input" value={form.ezviz_api_base} onChange={e=>set("ezviz_api_base",e.target.value)}
              placeholder="https://isgpopen.ezvizlife.com (default)" />
          )}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button className="btn btn-outline btn-sm" onClick={handleEzvizTest} disabled={ezvizTesting}>
            {ezvizTesting ? "Testing…" : "Test Connection"}
          </button>
          {ezvizTestOk === true  && <span style={{fontSize:11,color:"var(--green)"}}>✓ Connected successfully</span>}
        </div>
        {ezvizTestOk === false && (
          <div style={{fontSize:11,color:"#dc2626",marginTop:8,lineHeight:1.6}}>
            ✗ {ezvizTestError}
          </div>
        )}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <div className="card">
          <div style={{fontSize:10,fontWeight:500,letterSpacing:"0.1em",textTransform:"uppercase",color:"var(--muted)",marginBottom:16}}>
            AI Detection
          </div>
          <div className="form-group">
            <label className="form-label">Scan Interval</label>
            <select className="form-input" value={form.scan_interval} onChange={e=>set("scan_interval",e.target.value)}>
              <option value="30">30 seconds</option>
              <option value="60">60 seconds</option>
              <option value="120">2 minutes</option>
              <option value="300">5 minutes</option>
            </select>
          </div>
          <Field k="crowd_threshold" label="Crowd Threshold (persons)" type="number" min="2" max="50" />
          <Field k="idle_threshold"  label="Staff Idle Threshold (empty scans)" type="number" min="1" max="60" />
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">Alert Cooldown (seconds)</label>
            <input className="form-input" type="number" min="30" max="3600" value={form.alert_cooldown} onChange={e=>set("alert_cooldown",e.target.value)} />
          </div>
        </div>

        <div className="card">
          <div style={{fontSize:10,fontWeight:500,letterSpacing:"0.1em",textTransform:"uppercase",color:"var(--muted)",marginBottom:16}}>
            Shop Schedule
          </div>
          <div style={{fontSize:11,color:"var(--muted)",marginBottom:14,lineHeight:1.6}}>
            After-hours alerts fire outside these times.<br/>
            Staff idle detection only runs during open hours.
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <Field k="shop_open"  label="Open Time"  type="time" />
            <Field k="shop_close" label="Close Time" type="time" />
          </div>
        </div>

        <div className="card">
          <div style={{fontSize:10,fontWeight:500,letterSpacing:"0.1em",textTransform:"uppercase",color:"var(--muted)",marginBottom:16}}>
            Email Alerts
          </div>
          <Field k="email_to"       label="Send Alerts To"       type="email" placeholder="your@email.com" />
          <Field k="email_from"     label="Gmail Sender"         type="email" placeholder="shopguard@gmail.com" />
          <div className="form-group" style={{marginBottom:8}}>
            <label className="form-label">Gmail App Password</label>
            <input className="form-input" type="password" value={form.email_password} onChange={e=>set("email_password",e.target.value)} placeholder="16-char app password" />
          </div>
          <div style={{fontSize:10,color:"var(--muted)"}}>Google Account → Security → 2FA → App Passwords</div>
        </div>

        <div className="card">
          <div style={{fontSize:10,fontWeight:500,letterSpacing:"0.1em",textTransform:"uppercase",color:"var(--muted)",marginBottom:14}}>
            RTSP Reference
          </div>
          <div style={{fontSize:11,color:"var(--muted)",lineHeight:1.8}}>
            <div style={{marginBottom:10}}>
              <div style={{color:"var(--text)",marginBottom:4}}>Hikvision / EZVIZ DVR</div>
              <code style={{fontSize:10,background:"var(--bg)",padding:"4px 8px",borderRadius:1,display:"block",lineHeight:1.6}}>
                rtsp://admin:PASS@PUBLIC_IP:554/Streaming/Channels/101
              </code>
            </div>
            <div style={{marginBottom:10}}>
              <div style={{color:"var(--text)",marginBottom:4}}>Mi Camera</div>
              <code style={{fontSize:10,background:"var(--bg)",padding:"4px 8px",borderRadius:1,display:"block"}}>
                rtsp://admin:PASS@PUBLIC_IP:PORT/stream1
              </code>
            </div>
            <div style={{fontSize:10}}>
              Channel IDs: 101=cam1 main · 102=cam1 sub · 201=cam2 main · 202=cam2 sub
            </div>
          </div>
        </div>
      </div>

      <div style={{marginTop:12,textAlign:"right"}}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving?"Saving…":saved?"Saved ✓":"Save All Settings"}
        </button>
      </div>
    </>
  );
}
