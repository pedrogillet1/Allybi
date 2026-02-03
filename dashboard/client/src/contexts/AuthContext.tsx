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
  loginWithApiKey: (apiKey: string) => Promise<void>;
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

  // Initialize from localStorage or auto-detect nginx-injected auth
  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem("auth_token");
      const storedAdmin = localStorage.getItem("auth_admin");
      const storedApiKey = localStorage.getItem("admin_key");

      if (storedToken && storedAdmin) {
        try {
          setToken(storedToken);
          setAdmin(JSON.parse(storedAdmin));
          setIsLoading(false);
          return;
        } catch {
          localStorage.removeItem("auth_token");
          localStorage.removeItem("auth_admin");
        }
      } else if (storedApiKey) {
        // API key auth - set placeholder values
        setToken("api-key-auth");
        setAdmin({
          id: "api-key-admin",
          username: "admin",
          name: "API Key Admin",
          role: "admin",
        });
        setIsLoading(false);
        return;
      }

      // Try auto-detect: nginx may be injecting admin key
      try {
        const response = await fetch(`${API_BASE_URL}/admin/overview?range=7d`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });

        if (response.ok) {
          // Nginx is injecting the admin key - auto-authenticate
          const adminData: Admin = {
            id: "nginx-admin",
            username: "admin",
            name: "Admin",
            role: "admin",
          };
          setAdmin(adminData);
          setToken("nginx-injected");
          localStorage.setItem("auth_token", "nginx-injected");
          localStorage.setItem("auth_admin", JSON.stringify(adminData));
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

    const { admin: adminData, tokens } = data.data;

    setToken(tokens.accessToken);
    setAdmin(adminData);
    localStorage.setItem("auth_token", tokens.accessToken);
    localStorage.setItem("auth_admin", JSON.stringify(adminData));
    localStorage.setItem("refresh_token", tokens.refreshToken);
  }, []);

  const loginWithApiKey = useCallback(async (apiKey: string) => {
    // Validate the API key by making a test request to the admin API
    const response = await fetch(`${API_BASE_URL}/admin/overview?range=7d`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Key": apiKey,
      },
    });

    if (!response.ok) {
      throw new Error("Invalid API key");
    }

    // API key is valid - store it and set authenticated state
    localStorage.setItem("admin_key", apiKey);
    // Set a placeholder admin for API key auth
    const adminData: Admin = {
      id: "api-key-admin",
      username: "admin",
      name: "API Key Admin",
      role: "admin",
    };
    setAdmin(adminData);
    setToken("api-key-auth"); // Placeholder token to indicate authenticated
    localStorage.setItem("auth_token", "api-key-auth");
    localStorage.setItem("auth_admin", JSON.stringify(adminData));
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setAdmin(null);
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_admin");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("admin_key");
  }, []);

  return (
    <AuthContext.Provider
      value={{
        admin,
        token,
        isAuthenticated: !!token || !!localStorage.getItem("admin_key"),
        isLoading,
        login,
        loginWithApiKey,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
