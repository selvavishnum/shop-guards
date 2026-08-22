import axios from "axios";

const BASE = import.meta.env.VITE_API_URL || "";
const http = axios.create({ baseURL: BASE });

export const api = {
  getCameras:   ()             => http.get("/api/cameras").then(r => r.data),
  addCamera:    (body)         => http.post("/api/cameras", body).then(r => r.data),
  updateCamera: (serial, body) => http.patch(`/api/cameras/${serial}`, body).then(r => r.data),
  deleteCamera: (serial)       => http.delete(`/api/cameras/${serial}`).then(r => r.data),
  testCamera:   (serial)       => http.post(`/api/cameras/${serial}/test`).then(r => r.data),

  getAlerts: (params) => http.get("/api/alerts", { params }).then(r => r.data),
  getStats:  ()       => http.get("/api/stats").then(r => r.data),

  getSettings:  ()     => http.get("/api/settings").then(r => r.data),
  saveSettings: (body) => http.post("/api/settings", body).then(r => r.data),

  getAgentStatus: () => http.get("/api/agent/status").then(r => r.data),

  getStaffList: ()   => http.get("/api/staff").then(r => r.data),
  addStaff:     (body) => http.post("/api/staff", body).then(r => r.data),
  deleteStaff:  (id)   => http.delete(`/api/staff/${id}`).then(r => r.data),

  getAttendance:        (params) => http.get("/api/attendance", { params }).then(r => r.data),
  getAttendanceSummary: () => http.get("/api/attendance/summary").then(r => r.data),

  testEzviz:    () => http.get("/api/ezviz/test").then(r => r.data),
  getEzvizDevices: () => http.get("/api/ezviz/devices").then(r => r.data),
};

export function openAlertWS(onMessage) {
  const wsBase = (import.meta.env.VITE_API_URL || window.location.origin)
    .replace(/^http/, "ws");
  const ws = new WebSocket(`${wsBase}/ws/alerts`);
  ws.onmessage = (e) => {
    try { onMessage(JSON.parse(e.data)); } catch {}
  };
  return ws;
}
