/**
 * Centralized route constants for the application
 * This ensures consistency across all components and makes route changes easier
 */

// Public routes (no authentication required)
export const ROUTES = {
  // Auth routes
  AUTH: '/auth',
  LOGIN: '/login',      // Legacy - redirects to /auth?mode=login
  SIGNUP: '/signup',    // Legacy - redirects to /auth?mode=signup
  AUTH_CALLBACK: '/auth/callback',

  // Verification routes
  AUTHENTICATION: '/authentication',
  VERIFY_EMAIL: '/verify-email',
  VERIFY_PHONE: '/verification',
  PHONE_NUMBER: '/phone-number',
  PHONE_NUMBER_PENDING: '/phone-number-pending',
  VERIFICATION_PENDING: '/verification-pending',
  VERIFY_RECOVERY_EMAIL: '/verify-recovery-email',
  VERIFY_RECOVERY_PHONE: '/verify-recovery-phone',

  // Password recovery routes
  RECOVER_ACCESS: '/recover-access',
  FORGOT_PASSWORD: '/forgot-password',
  FORGOT_PASSWORD_CODE: '/forgot-password-code',
  FORGOT_PASSWORD_EMAIL_SENT: '/forgot-password-email-sent',
  FORGOT_PASSWORD_VERIFICATION: '/forgot-password-verification',
  SET_NEW_PASSWORD: '/set-new-password',
  PASSWORD_CHANGED: '/password-changed',

  // Protected routes
  CHAT: '/chat',
  HOME: '/home',
  DOCUMENTS: '/documents',
  DASHBOARD: '/dashboard',
  UPLOAD: '/upload',
  UPLOAD_HUB: '/upload-hub',
  SETTINGS: '/settings',
  UPGRADE: '/upgrade',

  // Dynamic routes (use with parameters)
  CATEGORY: '/category/:categoryName',
  FOLDER: '/folder/:folderId',
  DOCUMENT: '/document/:documentId',
  FILE_TYPE: '/filetype/:fileType',

  // Admin routes
  ADMIN_LOGIN: '/admin/login',
  ADMIN: '/admin',
  ADMIN_USERS: '/admin/users',
  ADMIN_FILES: '/admin/files',
  ADMIN_QUERIES: '/admin/queries',
  ADMIN_QUALITY: '/admin/quality',
  ADMIN_LLM: '/admin/llm',
  ADMIN_RELIABILITY: '/admin/reliability',
  ADMIN_SECURITY: '/admin/security',
  ADMIN_API_METRICS: '/admin/api-metrics',
};

// Auth mode query parameters
export const AUTH_MODES = {
  LOGIN: 'login',
  SIGNUP: 'signup',
};

// Helper functions for building routes with parameters
export const buildRoute = {
  auth: (mode) => `${ROUTES.AUTH}?mode=${mode}`,
  category: (categoryName) => `/category/${categoryName}`,
  folder: (folderId) => `/folder/${folderId}`,
  document: (documentId) => `/document/${documentId}`,
  fileType: (fileType) => `/filetype/${fileType}`,
};

// Default post-auth redirect
export const DEFAULT_AUTH_REDIRECT = ROUTES.CHAT;

// LocalStorage keys for first-time user detection
export const STORAGE_KEYS = {
  HAS_VISITED: 'koda_has_visited',
  LAST_AUTH_MODE: 'koda_last_auth_mode',
};
