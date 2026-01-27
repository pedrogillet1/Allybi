const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

/**
 * Check if token is expired and refresh if needed
 * Returns a valid authentication token
 */
export async function getValidToken() {
  // Use 'accessToken' to match your existing api.js setup
  const token = localStorage.getItem('accessToken') || localStorage.getItem('token');

  if (!token) {
    throw new Error('No token found. Please log in.');
  }

  // For now, just return the token
  // Token refresh is handled by api.js interceptor
  return token;
}

/**
 * Make authenticated API request with automatic token handling
 * Automatically adds Authorization header and handles 401 errors
 */
export async function fetchWithAuth(url, options = {}) {
  const token = await getValidToken();

  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (response.status === 401) {
    // Token expired or invalid - just throw error, let axios interceptor handle it
    throw new Error('Session expired. Please log in again.');
  }

  return response;
}

/**
 * Handle authentication errors in a user-friendly way
 */
export function handleAuthError(error) {
  if (error.message.includes('expired') || error.message.includes('log in')) {
    // Just return true to indicate auth error
    // Don't clear storage or redirect - let AuthContext/ProtectedRoute handle it
    return true; // Error was handled
  }

  return false; // Error was not an auth error
}
