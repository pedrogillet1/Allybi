import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

interface Admin {
  id: string;
  username: string;
  name: string | null;
  role: string;
}

interface AuthContextType {
  admin: Admin | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize from localStorage
  useEffect(() => {
    const storedToken = localStorage.getItem("auth_token");
    const storedAdmin = localStorage.getItem("auth_admin");

    if (storedToken && storedAdmin) {
      try {
        setToken(storedToken);
        setAdmin(JSON.parse(storedAdmin));
      } catch {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("auth_admin");
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const response = await fetch(`${API_BASE_URL}/auth/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error?.message || "Login failed");
    }

    const { admin: adminData, tokens } = data.data;

    setToken(tokens.accessToken);
    setAdmin(adminData);
    localStorage.setItem("auth_token", tokens.accessToken);
    localStorage.setItem("auth_admin", JSON.stringify(adminData));
    localStorage.setItem("refresh_token", tokens.refreshToken);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setAdmin(null);
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_admin");
    localStorage.removeItem("refresh_token");
  }, []);

  return (
    <AuthContext.Provider
      value={{
        admin,
        token,
        isAuthenticated: !!token,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
