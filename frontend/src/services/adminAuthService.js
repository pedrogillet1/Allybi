import { getApiBaseUrl } from './runtimeConfig';

const API_URL = getApiBaseUrl();

const adminAuthService = {
  async login(username, password) {
    const res = await fetch(`${API_URL}/api/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error(json.error?.message || 'Login failed');
    }
    const { admin, tokens } = json.data;
    localStorage.setItem('adminAccessToken', tokens.accessToken);
    localStorage.setItem('adminRefreshToken', tokens.refreshToken);
    localStorage.setItem('adminUser', JSON.stringify(admin));
    return { admin, tokens };
  },

  async refresh() {
    const refreshToken = localStorage.getItem('adminRefreshToken');
    if (!refreshToken) throw new Error('No admin refresh token');

    const res = await fetch(`${API_URL}/api/auth/admin/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      adminAuthService.clearStorage();
      throw new Error(json.error?.message || 'Refresh failed');
    }
    const { tokens } = json.data;
    localStorage.setItem('adminAccessToken', tokens.accessToken);
    localStorage.setItem('adminRefreshToken', tokens.refreshToken);
    return tokens;
  },

  async logout() {
    const refreshToken = localStorage.getItem('adminRefreshToken');
    try {
      await fetch(`${API_URL}/api/auth/admin/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // ignore network errors on logout
    }
    adminAuthService.clearStorage();
  },

  clearStorage() {
    localStorage.removeItem('adminAccessToken');
    localStorage.removeItem('adminRefreshToken');
    localStorage.removeItem('adminUser');
  },

  getAccessToken() {
    return localStorage.getItem('adminAccessToken');
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
    return !!localStorage.getItem('adminAccessToken') && !!localStorage.getItem('adminUser');
  },
};

export default adminAuthService;
