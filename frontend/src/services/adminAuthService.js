import { getApiBaseUrl } from './runtimeConfig';

const API_URL = getApiBaseUrl();

const adminAuthService = {
  async login(username, password) {
    const res = await fetch(`${API_URL}/api/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error(json.error?.message || 'Login failed');
    }
    const { admin } = json.data;
    localStorage.setItem('adminUser', JSON.stringify(admin));
    return { admin };
  },

  async refresh() {
    const res = await fetch(`${API_URL}/api/auth/admin/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({}),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      adminAuthService.clearStorage();
      throw new Error(json.error?.message || 'Refresh failed');
    }
    return { refreshed: true };
  },

  async logout() {
    try {
      await fetch(`${API_URL}/api/auth/admin/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
    } catch {
      // ignore network errors on logout
    }
    adminAuthService.clearStorage();
  },

  clearStorage() {
    localStorage.removeItem('adminUser');
  },

  getAccessToken() {
    return null;
  },

  getCurrentAdmin() {
    try {
      const stored = localStorage.getItem('adminUser');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  },

  isAuthenticated() {
    return !!localStorage.getItem('adminUser');
  },
};

export default adminAuthService;
