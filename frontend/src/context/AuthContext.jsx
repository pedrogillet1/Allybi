import React, { createContext, useState, useContext, useEffect } from 'react';
import authService from '../services/authService';
import { setEncryptionPassword as setChatEncryptionPassword, clearEncryptionPassword as clearChatEncryptionPassword } from '../services/chatService';
import { generateRecoveryKey, encryptMasterKeyWithRecovery, isSecureContextAvailable } from '../utils/security/encryption';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // ⚡ ZERO-KNOWLEDGE ENCRYPTION: Store password in memory for encryption/decryption
  // Password is NEVER sent to server, NEVER stored in localStorage
  // Only stored in React state (memory) during the session
  const [encryptionPassword, setEncryptionPassword] = useState(null);

  // Initialize auth state from localStorage or try session restore
  useEffect(() => {
    const initAuth = async () => {
      const storedUser = authService.getCurrentUser();
      const authenticated = authService.isAuthenticated();

      if (storedUser && authenticated) {
        setUser(storedUser);
        setIsAuthenticated(true);
        setLoading(false);
        return;
      }

      // OAuth race condition: we have tokens but user data isn't in localStorage yet
      // This can happen during rapid OAuth redirect - fetch user from /me endpoint
      const accessToken = localStorage.getItem('accessToken');
      if (accessToken && !storedUser) {
        try {
          console.log('🔄 Tokens found but no user - fetching from /me...');
          const meResponse = await fetch(`${process.env.REACT_APP_API_URL}/api/auth/me`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
            credentials: 'include',
          });

          if (meResponse.ok) {
            const meData = await meResponse.json();
            if (meData.user) {
              localStorage.setItem('user', JSON.stringify(meData.user));
              setUser(meData.user);
              setIsAuthenticated(true);
              console.log('✅ User data restored from /me');
              setLoading(false);
              return;
            }
          }
        } catch (error) {
          console.warn('⚠️ Failed to fetch user with accessToken:', error);
        }
      }

      // If localStorage is empty but we have a refreshToken, try to restore
      // This handles the case where accessToken/user was cleared but refreshToken remains
      try {
        const refreshToken = localStorage.getItem('refreshToken');

        if (refreshToken) {
          console.log('🔄 Attempting session restore with refresh token...');

          const response = await fetch(`${process.env.REACT_APP_API_URL}/api/auth/refresh`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ refreshToken }),
            credentials: 'include',
          });

          if (response.ok) {
            const data = await response.json();

            if (data.accessToken && data.user) {
              // Restore full session
              localStorage.setItem('accessToken', data.accessToken);
              localStorage.setItem('refreshToken', data.refreshToken);
              localStorage.setItem('user', JSON.stringify(data.user));

              setUser(data.user);
              setIsAuthenticated(true);
              console.log('✅ Session restored successfully');
              setLoading(false);
              return;
            } else {
              // Incomplete response, clear stale tokens
              localStorage.removeItem('refreshToken');
            }
          } else {
            // Refresh failed, clear invalid token
            localStorage.removeItem('refreshToken');
          }
        }

        // Safari fallback: localStorage may have been cleared by ITP, but HTTP-only
        // cookies persist. Try cookie-based restore via /api/auth/me (cookie is sent
        // automatically by the browser with credentials: 'include').
        const meResponse = await fetch(`${process.env.REACT_APP_API_URL}/api/auth/me`, {
          credentials: 'include',
        });

        if (meResponse.ok) {
          const meData = await meResponse.json();
          if (meData.user) {
            setUser(meData.user);
            setIsAuthenticated(true);
            // Re-sync localStorage for fast checks on next load
            localStorage.setItem('user', JSON.stringify(meData.user));
            console.log('✅ Cookie-based session restored (Safari fallback)');
            setLoading(false);
            return;
          }
        }
      } catch (error) {
        console.warn('⚠️ Session restore failed:', error);
        localStorage.removeItem('refreshToken');
      }

      setLoading(false);
    };

    initAuth();
  }, []);

  /**
   * Register a new user (creates pending user, requires verification)
   */
  const register = async (userData) => {
    try {
      let registrationData = { ...userData };
      let recoveryKey = null;

      // ⚡ ZERO-KNOWLEDGE ENCRYPTION: Generate recovery key and encrypt master password
      // Only if WebCrypto is available (requires HTTPS or localhost)
      if (isSecureContextAvailable()) {
        console.log('🔐 [Recovery] Generating recovery key...');
        recoveryKey = generateRecoveryKey();

        console.log('🔐 [Recovery] Encrypting master password with recovery key...');
        const encryptedMasterKey = await encryptMasterKeyWithRecovery(userData.password, recoveryKey);

        // Add recovery key data to registration
        registrationData = {
          ...userData,
          recoveryKeyHash: recoveryKey, // Will be hashed on backend
          masterKeyEncrypted: JSON.stringify(encryptedMasterKey),
        };
        console.log('✅ [Recovery] Recovery key generated successfully');
      } else {
        console.warn('⚠️ [Recovery] WebCrypto not available (insecure context). Skipping encryption for dev testing.');
      }

      const response = await authService.register(registrationData);

      // Return response with recovery key for user to save
      return {
        ...response,
        recoveryKey, // User MUST save this! (null if crypto unavailable)
      };
    } catch (error) {
      throw error;
    }
  };

  /**
   * Verify email code for pending user (now completes registration and logs user in)
   */
  const verifyPendingEmail = async (data) => {
    try {
      const response = await authService.verifyPendingEmail(data);

      // Email verification now completes registration and returns tokens
      if (response.user && response.tokens) {
        setUser(response.user);
        setIsAuthenticated(true);
      }

      return response;
    } catch (error) {
      throw error;
    }
  };

  /**
   * Resend email verification code for pending user
   */
  const resendPendingEmail = async (data) => {
    try {
      const response = await authService.resendPendingEmail(data);
      return response;
    } catch (error) {
      throw error;
    }
  };

  /**
   * Add phone number to pending user
   */
  const addPendingPhone = async (data) => {
    try {
      const response = await authService.addPendingPhone(data);
      return response;
    } catch (error) {
      throw error;
    }
  };

  /**
   * Verify phone code and complete registration
   */
  const verifyPendingPhone = async (data) => {
    try {
      const response = await authService.verifyPendingPhone(data);

      // Registration complete, set user and auth state
      if (response.user && response.accessToken) {
        setUser(response.user);
        setIsAuthenticated(true);
      }

      return response;
    } catch (error) {
      throw error;
    }
  };

  /**
   * Login user
   */
  const login = async (credentials) => {
    try {
      const response = await authService.login(credentials);

      // If 2FA is required, don't set user yet
      if (response.requires2FA) {
        return response;
      }

      // Otherwise, set user and auth state
      setUser(response.user);
      setIsAuthenticated(true);

      // ⚡ ZERO-KNOWLEDGE ENCRYPTION: Store password in memory for encryption/decryption
      // Password is stored ONLY in React state (memory), never sent to server or localStorage
      setEncryptionPassword(credentials.password);
      setChatEncryptionPassword(credentials.password); // Also set in chatService

      return response;
    } catch (error) {
      throw error;
    }
  };

  /**
   * Verify 2FA during login
   */
  const verify2FALogin = async (data) => {
    try {
      const response = await authService.verify2FALogin(data);
      setUser(response.user);
      setIsAuthenticated(true);
      return response;
    } catch (error) {
      throw error;
    }
  };

  /**
   * Logout user
   */
  const logout = async () => {
    try {
      await authService.logout();
    } finally {
      setUser(null);
      setIsAuthenticated(false);

      // ⚡ ZERO-KNOWLEDGE ENCRYPTION: Clear encryption password from memory
      setEncryptionPassword(null);
      clearChatEncryptionPassword(); // Also clear in chatService
    }
  };

  /**
   * Enable 2FA
   */
  const enable2FA = async () => {
    try {
      const response = await authService.enable2FA();
      return response;
    } catch (error) {
      throw error;
    }
  };

  /**
   * Verify 2FA setup
   */
  const verify2FA = async (data) => {
    try {
      const response = await authService.verify2FA(data);

      // Update user state
      setUser((prevUser) => ({
        ...prevUser,
        twoFactorEnabled: true,
      }));

      return response;
    } catch (error) {
      throw error;
    }
  };

  /**
   * Disable 2FA
   */
  const disable2FA = async (data) => {
    try {
      const response = await authService.disable2FA(data);

      // Update user state
      setUser((prevUser) => ({
        ...prevUser,
        twoFactorEnabled: false,
      }));

      return response;
    } catch (error) {
      throw error;
    }
  };

  /**
   * Get backup codes
   */
  const getBackupCodes = async () => {
    try {
      const response = await authService.getBackupCodes();
      return response;
    } catch (error) {
      throw error;
    }
  };

  /**
   * Login with Google
   */
  const loginWithGoogle = () => {
    authService.loginWithGoogle();
  };

  /**
   * Login with Apple
   */
  const loginWithApple = () => {
    authService.loginWithApple();
  };

  /**
   * Update user data in state
   */
  const updateUser = (userData) => {
    setUser((prevUser) => ({
      ...prevUser,
      ...userData,
    }));

    // Also update localStorage
    const currentUser = authService.getCurrentUser();
    if (currentUser) {
      localStorage.setItem('user', JSON.stringify({ ...currentUser, ...userData }));
    }
  };

  /**
   * Set authentication state (for OAuth callback)
   * Persists to localStorage to ensure auth state survives immediate navigation/re-renders
   */
  const setAuthState = (userData) => {
    // Persist to localStorage FIRST to prevent race condition during navigation
    // This ensures authService.isAuthenticated() returns true even if React state
    // hasn't propagated yet (e.g., during OAuth redirect to chat)
    if (userData) {
      localStorage.setItem('user', JSON.stringify(userData));
    }
    setUser(userData);
    setIsAuthenticated(true);
  };

  const value = {
    user,
    loading,
    isAuthenticated,
    encryptionPassword, // ⚡ ZERO-KNOWLEDGE ENCRYPTION: Password for client-side encryption
    register,
    verifyPendingEmail,
    resendPendingEmail,
    addPendingPhone,
    verifyPendingPhone,
    login,
    logout,
    verify2FALogin,
    enable2FA,
    verify2FA,
    disable2FA,
    getBackupCodes,
    loginWithGoogle,
    loginWithApple,
    updateUser,
    setAuthState,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/**
 * Custom hook to use auth context
 */
export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
};

export default AuthContext;
