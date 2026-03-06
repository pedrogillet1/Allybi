import api, { resetAuthDead } from './api';
import { getApiBaseUrl } from './runtimeConfig';

const authService = {
  /**
   * Register a new user (creates pending user, requires verification)
   * @param {Object} userData - { name, email, password }
   * @returns {Promise<Object>} - { message, email, requiresVerification }
   */
  async register(userData) {
    try {
      const response = await api.post('/api/auth/register', userData);

      // New flow: no tokens returned, user must verify email and phone first
      // Store email temporarily for verification flow
      if (response.data.requiresVerification) {
        localStorage.setItem('pendingEmail', response.data.email);
      }

      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * Verify email code for pending user (now completes registration)
   * @param {Object} data - { email, code }
   * @returns {Promise<Object>} - User data with tokens
   */
  async verifyPendingEmail(data) {
    try {
      const response = await api.post('/api/auth/pending/verify-email', data);

      // Email verification now completes registration and returns tokens
      if (response.data.tokens && response.data.tokens.accessToken) {
        localStorage.setItem('user', JSON.stringify(response.data.user));
        localStorage.removeItem('pendingEmail'); // Clean up
      }

      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * Resend email verification code for pending user
   * @param {Object} data - { email }
   * @returns {Promise<Object>} - Success response
   */
  async resendPendingEmail(data) {
    try {
      const response = await api.post('/api/auth/pending/resend-email', data);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * Add phone number to pending user
   * @param {Object} data - { email, phoneNumber }
   * @returns {Promise<Object>} - Success response
   */
  async addPendingPhone(data) {
    try {
      const response = await api.post('/api/auth/pending/add-phone', data);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * Verify phone code and complete registration
   * @param {Object} data - { email, code }
   * @returns {Promise<Object>} - User data with tokens
   */
  async verifyPendingPhone(data) {
    try {
      const response = await api.post('/api/auth/pending/verify-phone', data);

      // Registration complete, store tokens and user data
      // Backend returns { user, tokens: { accessToken, refreshToken } }
      const tokens = response.data.tokens;
      if (tokens && tokens.accessToken) {
        localStorage.setItem('user', JSON.stringify(response.data.user));
        localStorage.removeItem('pendingEmail'); // Clean up
      }

      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * Login user
   * @param {Object} credentials - { email, password, rememberMe }
   * @returns {Promise<Object>} - User data or 2FA requirement
   */
  async login(credentials) {
    try {
      const response = await api.post('/api/auth/login', credentials);

      // Canonical backend shape: requiresTwoFactor + challengeToken.
      // Keep legacy alias support for backward compatibility during migration.
      const requiresTwoFactor = Boolean(
        response.data.requiresTwoFactor || response.data.requires2FA
      );
      if (requiresTwoFactor) {
        const challengeToken =
          response.data.challengeToken || response.data.tempToken || null;
        const user = response.data.user || null;
        return {
          requiresTwoFactor: true,
          requires2FA: true,
          userId: user?.id || response.data.userId || null,
          challengeToken,
          tempToken: challengeToken,
          user,
        };
      }

      // Otherwise, store tokens and user data
      if (response.data.accessToken) {
        localStorage.setItem('user', JSON.stringify(response.data.user));
        resetAuthDead(); // allow interceptor to retry requests again
      }

      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * Verify 2FA code during login
   * @param {Object} data - { token, challengeToken }
   * @returns {Promise<Object>} - User data with tokens
   */
  async verify2FALogin(data) {
    try {
      const payload = {
        ...data,
        challengeToken: data?.challengeToken || data?.tempToken,
      };
      const response = await api.post('/api/auth/2fa/verify-login', payload);

      if (response.data.accessToken) {
        localStorage.setItem('user', JSON.stringify(response.data.user));
      }

      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * Logout user
   * @returns {Promise<void>}
   */
  async logout() {
    try {
      const payload = {};
      await api.post('/api/auth/logout', payload);
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear local storage regardless of API call success
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
    }
  },

  /**
   * Enable 2FA for the current user
   * @returns {Promise<Object>} - { secret, qrCodeUrl, backupCodes }
   */
  async enable2FA() {
    try {
      const response = await api.post('/api/auth/2fa/enable');
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * Verify 2FA setup with a token
   * @param {Object} data - { token }
   * @returns {Promise<Object>} - Success confirmation
   */
  async verify2FA(data) {
    try {
      const response = await api.post('/api/auth/2fa/verify', data);

      // Update user data to reflect 2FA is enabled
      const userStr = localStorage.getItem('user');
      const user = (userStr && userStr !== 'undefined') ? JSON.parse(userStr) : {};
      user.twoFactorEnabled = true;
      localStorage.setItem('user', JSON.stringify(user));

      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * Disable 2FA
   * @param {Object} data - { token }
   * @returns {Promise<Object>} - Success confirmation
   */
  async disable2FA(data) {
    try {
      const response = await api.post('/api/auth/2fa/disable', data);

      // Update user data to reflect 2FA is disabled
      const userStr = localStorage.getItem('user');
      const user = (userStr && userStr !== 'undefined') ? JSON.parse(userStr) : {};
      user.twoFactorEnabled = false;
      localStorage.setItem('user', JSON.stringify(user));

      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * Get 2FA backup codes
   * @returns {Promise<Object>} - { backupCodes }
   */
  async getBackupCodes() {
    try {
      const response = await api.get('/api/auth/2fa/backup-codes');
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * Login with Google OAuth
   * Redirects to Google OAuth page
   */
  loginWithGoogle() {
    window.location.href = `${getApiBaseUrl()}/api/auth/google`;
  },

  /**
   * Login with Apple OAuth
   * Redirects to Apple OAuth page
   */
  loginWithApple() {
    window.location.href = `${getApiBaseUrl()}/api/auth/apple`;
  },

  /**
   * Get current user from localStorage
   * @returns {Object|null} - User data or null
   */
  getCurrentUser() {
    try {
      const userStr = localStorage.getItem('user');
      return userStr ? JSON.parse(userStr) : null;
    } catch (error) {
      console.error('Error getting current user:', error);
      return null;
    }
  },

  /**
   * Check if user is authenticated
   * Returns true if we have valid tokens (user data can be fetched via /me if needed)
   * @returns {boolean}
   */
  isAuthenticated() {
    const user = this.getCurrentUser();
    if (user) return true;
    return false;
  },

  /**
   * Handle API errors
   * @param {Error} error - Axios error
   * @returns {Error} - Formatted error
   */
  handleError(error) {
    if (error.response) {
      // Server responded with error - extract message from response
      const data = error.response.data;
      // Support both flat { message } and structured { error: { code, message } } formats
      const serverMessage =
        data?.message ||
        (typeof data?.error === 'string' ? data.error : data?.error?.message) ||
        null;
      const errorCode = data?.error?.code || null;
      const err = new Error(serverMessage || 'errors.genericError');
      err.status = error.response.status;
      err.code = errorCode;
      err.data = data;
      err.isTranslationKey = !serverMessage;
      return err;
    } else if (error.request) {
      // Request made but no response
      const err = new Error('errors.noServerResponse');
      err.isTranslationKey = true;
      return err;
    } else {
      // Something else happened
      const err = new Error(error.message || 'errors.unexpectedError');
      err.isTranslationKey = !error.message;
      return err;
    }
  },
};

export default authService;

