/**
 * Centralized route constants for the application
 * This ensures consistency across all components and makes route changes easier
 */

// Public routes (no authentication required)
export const ROUTES = {
  // Auth routes
  AUTH: '/a/x7k2m9',
  LOGIN: '/a/r9p3q1',
  SIGNUP: '/a/t4w8n6',
  AUTH_CALLBACK: '/a/x7k2m9/c3b',

  // Verification routes
  AUTHENTICATION: '/a/v2j6f8',
  VERIFY_EMAIL: '/v/e3h8k2',
  VERIFY_PHONE: '/v/p5m2r7',
  PHONE_NUMBER: '/a/n8q4w3',
  PHONE_NUMBER_PENDING: '/a/d6f9k1',
  VERIFICATION_PENDING: '/v/g4j7n5',
  TWO_FACTOR_LOGIN: '/a/m2f7x9',
  VERIFY_RECOVERY_EMAIL: '/v/b8m3q6',
  VERIFY_RECOVERY_PHONE: '/v/w2k7f4',

  // Password recovery routes
  RECOVER_ACCESS: '/r/a4d7k9',
  FORGOT_PASSWORD: '/r/f8j3m2',
  FORGOT_PASSWORD_CODE: '/r/h5n9q7',
  FORGOT_PASSWORD_EMAIL_SENT: '/r/c3p6t1',
  FORGOT_PASSWORD_VERIFICATION: '/r/e7r2w8',
  SET_NEW_PASSWORD: '/r/s5n9p4',
  PASSWORD_CHANGED: '/r/k2v6d3',

  // Protected routes
  CHAT: '/c/k4r8f5',
  CHAT_CONVERSATION: '/c/k4r8f5/:conversationId?',
  HOME: '/h/m7t3j9',
  DOCUMENTS: '/d/b9v2n6',
  DASHBOARD: '/d/g5x8k1',
  UPLOAD: '/u/j3p7r4',
  UPLOAD_HUB: '/p/8f3a2b',
  SETTINGS: '/s/w6d4h8',
  UPGRADE: '/u/q8f2m7',

  // Onboarding
  FIRST_UPLOAD: '/o/f7u3k9',

  // Integrations
  INTEGRATIONS: '/i/n4k8p2',
  INTEGRATIONS_GMAIL: '/i/n4k8p2/gmail',

  // Dynamic routes (use with parameters)
  CATEGORY: '/c/t5k9n3/:categoryName',
  FOLDER: '/f/h2r6p8/:folderId',
  DOCUMENT: '/d/m4w8j2/:documentId',
  DOCUMENT_STUDIO: '/d/m4w8j2/:documentId/studio',
  FILE_TYPE: '/f/v7q3k5/:fileType',

  // Legal pages
  TERMS_OF_USE: '/legal/terms',
  PRIVACY_POLICY: '/legal/privacy',

  // Public pages
  LANDING: '/l/k7m9p3',

  // Admin routes
  ADMIN_LOGIN: '/x/l9m3k6',
  ADMIN: '/x/a5d8f2',
  ADMIN_USERS: '/x/a5d8f2/u4',
  ADMIN_FILES: '/x/a5d8f2/f7',
  ADMIN_QUERIES: '/x/a5d8f2/q2',
  ADMIN_QUALITY: '/x/a5d8f2/l5',
  ADMIN_LLM: '/x/a5d8f2/m8',
  ADMIN_RELIABILITY: '/x/a5d8f2/r3',
  ADMIN_SECURITY: '/x/a5d8f2/s1',
  ADMIN_API_METRICS: '/x/a5d8f2/p9',
};

// Auth mode query parameters
export const AUTH_MODES = {
  LOGIN: 'login',
  SIGNUP: 'signup',
};

// Helper functions for building routes with parameters
export const buildRoute = {
  auth: (mode) => `${ROUTES.AUTH}?mode=${mode}`,
  chat: (conversationId) => conversationId && conversationId !== 'new'
    ? `/c/k4r8f5/${conversationId}` : '/c/k4r8f5',
  category: (categoryName) => `/c/t5k9n3/${categoryName}`,
  folder: (folderId) => `/f/h2r6p8/${folderId}`,
  document: (documentId) => `/d/m4w8j2/${documentId}`,
  documentStudio: (documentId) => `/d/m4w8j2/${documentId}/studio`,
  fileType: (fileType) => `/f/v7q3k5/${fileType}`,
};

// Default post-auth redirect
export const DEFAULT_AUTH_REDIRECT = ROUTES.HOME;

// LocalStorage keys for first-time user detection
export const STORAGE_KEYS = {
  HAS_VISITED: 'koda_has_visited',
  LAST_AUTH_MODE: 'koda_last_auth_mode',
  PENDING_FIRST_UPLOAD: 'koda_pending_first_upload',
  FIRST_UPLOAD_DONE: 'koda_first_upload_done',
};
