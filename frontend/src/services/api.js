import axios from 'axios';
import { emitAuthModalOpen } from '../utils/authModalBus';
import { getApiBaseUrl } from './runtimeConfig';

// Centralized API origin selection (defaults to production unless overridden).
const API_URL = getApiBaseUrl();
const AUTH_LOCALSTORAGE_COMPAT = process.env.REACT_APP_AUTH_LOCALSTORAGE_COMPAT === 'true';
const CSRF_COOKIE_NAME = 'koda_csrf';

function getCookieValue(name) {
  if (typeof document === 'undefined') return null;
  const needle = `${name}=`;
  const parts = document.cookie.split(';');
  for (const raw of parts) {
    const entry = raw.trim();
    if (entry.startsWith(needle)) {
      return decodeURIComponent(entry.slice(needle.length));
    }
  }
  return null;
}

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Generate UUID for correlation ID
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : ((r & 0x3) | 0x8);
    return v.toString(16);
  });
};

// Request interceptor - attach access token and correlation ID to every request
api.interceptors.request.use(
  (config) => {
    if (AUTH_LOCALSTORAGE_COMPAT) {
      const accessToken = localStorage.getItem('accessToken');
      if (accessToken) {
        config.headers.Authorization = `Bearer ${accessToken}`;
      }
    }

    // If we're sending FormData, do not force application/json.
    // The browser must set multipart boundaries; a wrong content-type causes multer to see "no files".
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
      // Axios lower/upper-cases vary depending on version/env.
      try {
        delete config.headers['Content-Type'];
        delete config.headers['content-type'];
      } catch {
        // Best-effort; if AxiosHeaders is in use, delete may no-op.
        config.headers['Content-Type'] = undefined;
      }
    }

    // Add correlation ID for request tracing
    if (!config.headers['x-request-id']) {
      config.headers['x-request-id'] = generateUUID();
    }

    // Send CSRF token for mutating requests when cookie-auth is used.
    const method = String(config.method || 'get').toUpperCase();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const csrfToken = getCookieValue(CSRF_COOKIE_NAME);
      if (csrfToken && !config.headers['x-csrf-token']) {
        config.headers['x-csrf-token'] = csrfToken;
      }
    }

    // Log correlation ID in development
    if (process.env.NODE_ENV === 'development' && config.url?.includes('/slides')) {
      console.log(`[API] Request ID: ${config.headers['x-request-id']} - ${config.url}`);
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// ---------------------------------------------------------------------------
// Global refresh lock — prevents 401 retry storms when many requests fire at
// once and the session is dead.  Only the first 401 triggers a refresh; all
// others queue behind it.  Once auth is confirmed dead we set _authDead so
// subsequent 401s reject instantly without network calls or console spam.
// ---------------------------------------------------------------------------
let _refreshPromise = null;   // in-flight refresh promise (shared by all 401s)
let _authDead = false;        // true once we know there's no valid session

function clearAuthStorage() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  localStorage.removeItem('token');
}

function markAuthDead(reason) {
  if (_authDead) return;       // already handled
  _authDead = true;
  clearAuthStorage();
  console.log('🔒 Session expired. Please log in again.');
  emitAuthModalOpen({
    mode: 'login',
    returnTo: `${window.location.pathname}${window.location.search || ''}`,
    reason,
  });
}

// Allow other modules (e.g. login handler) to resurrect auth after a
// successful login so new requests go through normally.
export function resetAuthDead() {
  _authDead = false;
  _refreshPromise = null;
}

// Response interceptor - unwrap { ok, data } envelope + handle token refresh
api.interceptors.response.use(
  (response) => {
    // Unwrap backend's { ok: true, data: ... } envelope so callers get the payload directly
    if (response.data && response.data.ok === true && 'data' in response.data) {
      const unwrapped = response.data.data;
      // Add backward-compat aliases: backend returns { items } but frontend expects { documents } or { folders }
      if (unwrapped && Array.isArray(unwrapped.items)) {
        if (!unwrapped.documents) unwrapped.documents = unwrapped.items;
        if (!unwrapped.folders) unwrapped.folders = unwrapped.items;
      }
      response.data = unwrapped;
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Don't try to refresh token for auth endpoints (login, register, refresh)
    const isAuthEndpoint = originalRequest.url?.includes('/api/auth/login') ||
                          originalRequest.url?.includes('/api/auth/register') ||
                          originalRequest.url?.includes('/api/auth/refresh') ||
                          originalRequest.url?.includes('/api/auth/google') ||
                          originalRequest.url?.includes('/api/auth/pending') ||
                          originalRequest.url?.includes('/api/auth/forgot-password') ||
                          originalRequest.url?.includes('/api/auth/reset-password') ||
                          originalRequest.url?.includes('/api/auth/send-reset-link');

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;

      // Auth already confirmed dead — reject immediately, no spam.
      if (_authDead) {
        return Promise.reject(new Error('Session expired'));
      }

      // If a refresh is already in-flight, piggy-back on it.
      if (_refreshPromise) {
        try {
          const newToken = await _refreshPromise;
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        } catch {
          return Promise.reject(new Error('Session expired'));
        }
      }

      // We're the first 401 — attempt refresh.
      _refreshPromise = (async () => {
        try {
          const refreshPayload = AUTH_LOCALSTORAGE_COMPAT
            ? { refreshToken: localStorage.getItem('refreshToken') || undefined }
            : {};
          const response = await axios.post(
            `${API_URL}/api/auth/refresh`,
            refreshPayload,
            { withCredentials: true }
          );
          const { accessToken: newAccessToken } = response.data;
          if (AUTH_LOCALSTORAGE_COMPAT && newAccessToken) {
            localStorage.setItem('accessToken', newAccessToken);
          }
          return newAccessToken;
        } catch (refreshError) {
          markAuthDead('refresh_failed');
          throw refreshError;
        } finally {
          _refreshPromise = null;
        }
      })();

      try {
        const newToken = await _refreshPromise;
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (e) {
        return Promise.reject(e);
      }
    }

    // For auth endpoints or other errors, reject without trying to refresh
    return Promise.reject(error);
  }
);

export default api;
