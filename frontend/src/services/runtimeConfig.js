// frontend/src/services/runtimeConfig.js
//
// Centralized runtime-ish defaults for API/WS origins.
// CRA env vars are compile-time, but we still want safe fallbacks:
// - Localhost frontend should never silently hit production.
// - Deployed app should prefer same-origin to avoid cross-site cookie/CORS issues.

function trimTrailingSlash(url) {
  return String(url || '').replace(/\/+$/, '');
}

export function getApiBaseUrl() {
  const env = trimTrailingSlash(process.env.REACT_APP_API_URL);
  if (env) return env;

  // Browser context: choose a safe default based on hostname.
  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname;
    // Local dev default: use HTTP to avoid self-signed cert issues (ERR_CERT_AUTHORITY_INVALID).
    // If you have trusted local TLS, override with REACT_APP_API_URL=https://localhost:5000.
    if (host === 'localhost' || host === '127.0.0.1') return `http://${host}:5000`;
    return trimTrailingSlash(window.location.origin);
  }

  // Node/tests fallback.
  return 'http://localhost:5000';
}

export function getWsBaseUrl() {
  const env = trimTrailingSlash(process.env.REACT_APP_WS_URL);
  if (env) return env;

  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Local dev default: use WS (not WSS) to match the HTTP API default.
    // Override with REACT_APP_WS_URL=wss://localhost:5000 if using trusted local TLS.
    if (host === 'localhost' || host === '127.0.0.1') return `ws://${host}:5000`;
    return `${proto}//${window.location.host}`;
  }

  return 'ws://localhost:5000';
}
