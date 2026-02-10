import axios from 'axios';
import adminAuthService from './adminAuthService';
import { ROUTES } from '../constants/routes';
import { getApiBaseUrl } from './runtimeConfig';

const API_URL = getApiBaseUrl();

const adminApi = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

// Attach admin access token and admin key
adminApi.interceptors.request.use((config) => {
  const token = adminAuthService.getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Attach X-KODA-ADMIN-KEY for /api/admin/* routes (not /api/auth/admin/*)
  const adminKey = process.env.REACT_APP_ADMIN_KEY;
  if (adminKey && config.url?.includes('/api/admin/') && !config.url?.includes('/api/auth/admin/')) {
    config.headers['X-KODA-ADMIN-KEY'] = adminKey;
  }

  return config;
});

// Handle 401 — try refresh, then redirect to /admin/login
adminApi.interceptors.response.use(
  (response) => {
    // Unwrap { ok, data } envelope
    if (response.data && response.data.ok === true && 'data' in response.data) {
      response.data = response.data.data;
    }
    return response;
  },
  async (error) => {
    const original = error.config;

    if (
      error.response?.status === 401 &&
      !original._retry &&
      !original.url?.includes('/api/auth/admin/')
    ) {
      original._retry = true;
      try {
        const tokens = await adminAuthService.refresh();
        original.headers.Authorization = `Bearer ${tokens.accessToken}`;
        return adminApi(original);
      } catch {
        adminAuthService.clearStorage();
        window.location.href = ROUTES.ADMIN_LOGIN;
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export default adminApi;
