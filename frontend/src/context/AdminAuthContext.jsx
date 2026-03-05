import React, { createContext, useState, useContext, useEffect } from 'react';
import adminAuthService from '../services/adminAuthService';

const AdminAuthContext = createContext(null);

export const AdminAuthProvider = ({ children }) => {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accessToken, setAccessToken] = useState(null);

  useEffect(() => {
    const stored = adminAuthService.getCurrentAdmin();
    const authed = adminAuthService.isAuthenticated();
    if (stored && authed) {
      setAdmin(stored);
      setIsAuthenticated(true);
      setAccessToken("cookie-session");
    }
    setLoading(false);
  }, []);

  const login = async (username, password) => {
    const { admin: adminData } = await adminAuthService.login(username, password);
    setAdmin(adminData);
    setAccessToken("cookie-session");
    setIsAuthenticated(true);
    return adminData;
  };

  const logout = async () => {
    await adminAuthService.logout();
    setAdmin(null);
    setAccessToken(null);
    setIsAuthenticated(false);
  };

  const value = {
    admin,
    loading,
    isAuthenticated,
    accessToken,
    login,
    logout,
  };

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
};

export const useAdminAuth = () => {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) {
    throw new Error('useAdminAuth must be used within AdminAuthProvider');
  }
  return ctx;
};

export default AdminAuthContext;
