import { getApiBaseUrl } from "../../../../services/runtimeConfig";

const API_BASE = getApiBaseUrl();
const AUTH_LOCALSTORAGE_COMPAT = process.env.REACT_APP_AUTH_LOCALSTORAGE_COMPAT === "true";

export const CHAT_STREAM_ENDPOINT =
  process.env.REACT_APP_CHAT_STREAM_ENDPOINT || `${API_BASE}/api/chat/stream`;

export const CHAT_VIEWER_STREAM_ENDPOINT =
  process.env.REACT_APP_EDITOR_ASSISTANT_STREAM_ENDPOINT ||
  process.env.REACT_APP_CHAT_VIEWER_STREAM_ENDPOINT ||
  `${API_BASE}/api/editor-session/assistant/stream`;

export function getCompatAccessToken() {
  if (!AUTH_LOCALSTORAGE_COMPAT) return null;
  return localStorage.getItem("accessToken") || localStorage.getItem("token");
}

export function getCsrfToken() {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("koda_csrf="));
  return match ? decodeURIComponent(match.slice("koda_csrf=".length)) : null;
}
