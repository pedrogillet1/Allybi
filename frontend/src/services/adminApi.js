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

adminApi.interceptors.request.use((config) => {
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
        await adminAuthService.refresh();
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
