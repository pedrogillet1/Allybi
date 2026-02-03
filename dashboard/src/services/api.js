/**
 * Dashboard API Service
 * Handles all API requests to the admin dashboard backend
 *
 * Backend endpoints: /api/admin/* or /api/dashboard/*
 */

// Use environment variable or default to localhost
const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const ADMIN_BASE = `${API_BASE}/api/admin`;

/**
 * Helper function to get auth headers
 */
const getAuthHeaders = () => {
  const token = localStorage.getItem('admin_token');
  const adminKey = process.env.REACT_APP_ADMIN_KEY || localStorage.getItem('admin_key');
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...(adminKey && { 'X-KODA-ADMIN-KEY': adminKey }),
  };
};

/**
 * Helper for API requests with error handling
 */
const apiRequest = async (endpoint, options = {}) => {
  const url = `${ADMIN_BASE}${endpoint}`;
  const response = await fetch(url, {
    headers: getAuthHeaders(),
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `API Error: ${response.status}`);
  }

  const data = await response.json();
  return data.data || data;
};

// ============================================================================
// OVERVIEW
// ============================================================================

/**
 * Fetches overview data including system health and KPIs
 * @param {string} range - Time range: '24h' | '7d' | '30d' | '90d'
 */
export const getOverview = async (range = '7d') => {
  return apiRequest(`/overview?range=${range}`);
};

// ============================================================================
// USERS
// ============================================================================

/**
 * Fetches users list with activity metrics
 * @param {Object} params - Query parameters
 */
export const getUsers = async (params = {}) => {
  const query = new URLSearchParams({
    range: params.range || '7d',
    limit: params.limit || 50,
    ...(params.cursor && { cursor: params.cursor }),
  }).toString();
  return apiRequest(`/users?${query}`);
};

// ============================================================================
// FILES
// ============================================================================

/**
 * Fetches files/documents analytics
 * @param {Object} params - Query parameters
 */
export const getFiles = async (params = {}) => {
  const query = new URLSearchParams({
    range: params.range || '7d',
    limit: params.limit || 50,
    ...(params.cursor && { cursor: params.cursor }),
  }).toString();
  return apiRequest(`/files?${query}`);
};

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Fetches query/chat analytics
 * @param {Object} params - Query parameters
 */
export const getQueries = async (params = {}) => {
  const query = new URLSearchParams({
    range: params.range || '7d',
    limit: params.limit || 50,
    ...(params.cursor && { cursor: params.cursor }),
  }).toString();
  return apiRequest(`/queries?${query}`);
};

// ============================================================================
// ANSWER QUALITY
// ============================================================================

/**
 * Fetches answer quality metrics (weak evidence, fallbacks, etc.)
 * @param {string} range - Time range
 */
export const getAnswerQuality = async (range = '7d') => {
  return apiRequest(`/answer-quality?range=${range}`);
};

// ============================================================================
// LLM COST
// ============================================================================

/**
 * Fetches LLM cost and token usage analytics
 * @param {Object} params - Query parameters
 */
export const getLlmCost = async (params = {}) => {
  const query = new URLSearchParams({
    range: params.range || '7d',
    limit: params.limit || 50,
    ...(params.cursor && { cursor: params.cursor }),
  }).toString();
  return apiRequest(`/llm-cost?${query}`);
};

// ============================================================================
// RELIABILITY
// ============================================================================

/**
 * Fetches reliability metrics (errors, latency, uptime)
 * @param {string} range - Time range
 */
export const getReliability = async (range = '7d') => {
  return apiRequest(`/reliability?range=${range}`);
};

// ============================================================================
// SECURITY
// ============================================================================

/**
 * Fetches security metrics (auth failures, blocked requests)
 * @param {string} range - Time range
 */
export const getSecurity = async (range = '7d') => {
  return apiRequest(`/security?range=${range}`);
};

// ============================================================================
// MARKETING
// ============================================================================

/**
 * Fetches marketing analytics (domains, intents, keywords)
 * @param {string} range - Time range
 */
export const getMarketing = async (range = '7d') => {
  return apiRequest(`/marketing?range=${range}`);
};

// ============================================================================
// LIVE FEED
// ============================================================================

/**
 * Fetches recent live events
 * @param {number} limit - Number of events to fetch
 */
export const getLiveFeed = async (limit = 50) => {
  return apiRequest(`/live?limit=${limit}`);
};

// ============================================================================
// LEGACY COMPATIBILITY (maps old endpoints to new)
// ============================================================================

/**
 * @deprecated Use getQueries instead
 */
export const getIntentAnalysis = async () => {
  return getQueries({ range: '7d' });
};

/**
 * @deprecated Use getReliability instead
 */
export const getRetrieval = async () => {
  return getReliability('7d');
};

/**
 * @deprecated Use getReliability instead
 */
export const getErrors = async () => {
  return getReliability('7d');
};

/**
 * @deprecated Use getFiles instead
 */
export const getDatabase = async () => {
  return getFiles({ range: '7d' });
};

// ============================================================================
// EXPORT
// ============================================================================

export const dashboardApi = {
  // New endpoints
  getOverview,
  getUsers,
  getFiles,
  getQueries,
  getAnswerQuality,
  getLlmCost,
  getReliability,
  getSecurity,
  getMarketing,
  getLiveFeed,

  // Legacy compatibility
  getIntentAnalysis,
  getRetrieval,
  getErrors,
  getDatabase,
};

export default dashboardApi;
