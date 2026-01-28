import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'https://getkoda.ai';

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
    const accessToken = localStorage.getItem('accessToken');
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    // Add correlation ID for request tracing
    if (!config.headers['x-request-id']) {
      config.headers['x-request-id'] = generateUUID();
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

    // ✅ Don't try to refresh token for auth endpoints (login, register, refresh)
    const isAuthEndpoint = originalRequest.url?.includes('/api/auth/login') ||
                          originalRequest.url?.includes('/api/auth/register') ||
                          originalRequest.url?.includes('/api/auth/refresh') ||
                          originalRequest.url?.includes('/api/auth/google') ||
                          originalRequest.url?.includes('/api/auth/pending') ||
                          originalRequest.url?.includes('/api/auth/forgot-password') ||
                          originalRequest.url?.includes('/api/auth/reset-password') ||
                          originalRequest.url?.includes('/api/auth/send-reset-link');

    // If error is 401 and we haven't tried to refresh yet AND it's not an auth endpoint
    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');

        if (!refreshToken) {
          // No refresh token - clear all auth data and redirect to login
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('user');
          localStorage.removeItem('token');

          console.log('🔒 No refresh token found. Redirecting to login...');

          // Don't redirect if on password reset or auth pages
          const publicPaths = ['/login', '/signup', '/register', '/set-new-password', '/forgot-password', '/recover-access', '/password-changed', '/auth', '/verify-email', '/verification'];
          const isPublicPath = publicPaths.some(path => window.location.pathname.includes(path));

          // Redirect to login page
          if (!isPublicPath) {
            window.location.href = '/login';
          }

          return Promise.reject(new Error('No refresh token available'));
        }

        // Call refresh endpoint
        const response = await axios.post(
          `${API_URL}/api/auth/refresh`,
          { refreshToken },
          { withCredentials: true }
        );

        const { accessToken: newAccessToken } = response.data;

        // Store new access token
        localStorage.setItem('accessToken', newAccessToken);

        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed - clear tokens
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        localStorage.removeItem('token');

        console.log('🔒 Session expired. Please log in again.');

        // Don't redirect if on password reset or auth pages
        const publicPaths = ['/login', '/signup', '/register', '/set-new-password', '/forgot-password', '/recover-access', '/password-changed', '/auth', '/verify-email', '/verification'];
        const isPublicPath = publicPaths.some(path => window.location.pathname.includes(path));

        // Redirect to login page
        if (!isPublicPath) {
          window.location.href = '/login';
        }

        return Promise.reject(refreshError);
      }
    }

    // ✅ For auth endpoints or other errors, reject without trying to refresh
    return Promise.reject(error);
  }
);

export default api;
