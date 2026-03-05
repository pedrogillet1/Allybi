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

  // Initialize from cookie-backed admin session.
  useEffect(() => {
    const initAuth = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/admin/overview?range=7d`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });

        if (response.ok) {
          const adminData: Admin = {
            id: "session-admin",
            username: "admin",
            name: "Admin",
            role: "admin",
          };
          setAdmin(adminData);
          setToken("cookie-session");
        }
      } catch {
      // API not accessible - require manual login
      }

      setIsLoading(false);
    };

    initAuth();
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

    const { admin: adminData } = data.data;
    setToken("cookie-session");
    setAdmin(adminData);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setAdmin(null);
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
