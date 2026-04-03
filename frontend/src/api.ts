import axios from "axios";

const base = import.meta.env.VITE_API_URL || "";

export const api = axios.create({
  baseURL: base || undefined,
  headers: { "Content-Type": "application/json" },
});

export function setAuthToken(token: string | null) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
    localStorage.setItem("token", token);
  } else {
    delete api.defaults.headers.common.Authorization;
    localStorage.removeItem("token");
  }
}

export function loadStoredToken() {
  const t = localStorage.getItem("token");
  if (t) api.defaults.headers.common.Authorization = `Bearer ${t}`;
  return t;
}

export function wsInterviewUrl(token: string) {
  if (import.meta.env.VITE_API_URL) {
    const u = new URL(import.meta.env.VITE_API_URL);
    const wsProto = u.protocol === "https:" ? "wss:" : "ws:";
    return `${wsProto}//${u.host}/ws/interview?token=${encodeURIComponent(token)}`;
  }
  const wsProto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${wsProto}//${location.host}/ws/interview?token=${encodeURIComponent(token)}`;
}
