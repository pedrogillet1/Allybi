// frontend/src/services/runtimeConfig.js
//
// Centralized runtime-ish defaults for API/WS origins.
// CRA env vars are compile-time, but we still want safe fallbacks:
// - Localhost frontend should never silently hit production.
// - Deployed app should prefer same-origin to avoid cross-site cookie/CORS issues.

function trimTrailingSlash(url) {
  return String(url || '').replace(/\/+$/, '');
}

function isLocalHost(host) {
  return host === 'localhost' || host === '127.0.0.1';
}

function isPrivateLanHost(host) {
  return /^(10|172\.(1[6-9]|2\d|3[01])|192\.168)\./.test(host);
}

function isKnownProdWebHost(host) {
  return [
    'allybi.co',
    'www.allybi.co',
    'app.allybi.co',
    'getkoda.ai',
    'www.getkoda.ai',
    'app.getkoda.ai',
  ].includes(String(host || '').toLowerCase());
}

export function getApiBaseUrl() {
  const env = trimTrailingSlash(process.env.REACT_APP_API_URL);

  // Browser context: choose a safe default based on hostname.
  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname;
    const origin = trimTrailingSlash(window.location.origin);

    // In production web hosts, always use same-origin to avoid CORS/cookie redirects.
    if (isKnownProdWebHost(host)) return origin;

    // If env is explicitly set for non-prod hosts, honor it.
    if (env) return env;

    // Local dev & LAN: use same-origin so requests go through the CRA dev proxy
    // (/api → backend:5000). This ensures cookies work (same origin) and avoids
    // self-signed cert issues on mobile devices.
    if (isLocalHost(host) || isPrivateLanHost(host)) return '';
    return origin;
  }

  if (env) return env;

  // Node/tests fallback.
  return 'http://localhost:5000';
}

export function getWsBaseUrl() {
  const env = trimTrailingSlash(process.env.REACT_APP_WS_URL);

  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

    // In production web hosts, always use same-origin websocket endpoint.
    if (isKnownProdWebHost(host)) return `${proto}//${window.location.host}`;

    if (env) return env;

    // Local dev & LAN: use same-origin websocket via CRA proxy.
    if (isLocalHost(host) || isPrivateLanHost(host)) {
      const port = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
      return `ws://${host}:${port}`;
    }
    return `${proto}//${window.location.host}`;
  }

  if (env) return env;

  return 'ws://localhost:5000';
}
