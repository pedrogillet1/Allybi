import { getApiBaseUrl } from '../../services/runtimeConfig';

const API_URL = getApiBaseUrl();
const AUTH_LOCALSTORAGE_COMPAT = process.env.REACT_APP_AUTH_LOCALSTORAGE_COMPAT === 'true';

/**
 * Check if token is expired and refresh if needed
 * Returns a valid authentication token
 */
export async function getValidToken() {
  if (!AUTH_LOCALSTORAGE_COMPAT) return null;
  return localStorage.getItem('accessToken') || localStorage.getItem('token');
}

/**
 * Make authenticated API request with automatic token handling.
 * Prefer passing absolute URLs; when a relative /api/... path is passed,
 * we prepend the configured API base.
 */
export async function fetchWithAuth(url, options = {}) {
  const token = await getValidToken();
  const fullUrl = typeof url === 'string' && url.startsWith('/api/') ? `${API_URL}${url}` : url;

  const headers = {
    ...options.headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const response = await fetch(fullUrl, {
    ...options,
    credentials: 'include',
    headers,
  });

  if (response.status === 401) {
    throw new Error('Session expired. Please log in again.');
  }

  return response;
}

/**
 * Handle authentication errors in a user-friendly way
 */
export function handleAuthError(error) {
  if (error?.message?.includes('expired') || error?.message?.includes('log in')) {
    return true;
  }
  return false;
}
