/**
 * Dashboard API Service
 * Handles all API requests to the monitoring dashboard backend
 */

const API_BASE = 'http://localhost:5000/api/dashboard';

/**
 * Helper function to get auth headers
 */
const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
  };
};

/**
 * Fetches overview data including system health and metrics
 * @returns {Promise<import('../types/telemetry').OverviewData>}
 */
export const getOverview = async () => {
  const response = await fetch(`${API_BASE}/overview`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error('Failed to fetch overview data');
  const data = await response.json();
  return data.data || data;
};

/**
 * Fetches intent analysis data including classification metrics
 * @returns {Promise<import('../types/telemetry').IntentAnalysisData>}
 */
export const getIntentAnalysis = async () => {
  const response = await fetch(`${API_BASE}/intent-analysis`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error('Failed to fetch intent analysis data');
  const data = await response.json();
  return data.data || data;
};

/**
 * Fetches retrieval data including RAG performance metrics
 * @returns {Promise<import('../types/telemetry').RetrievalData>}
 */
export const getRetrieval = async () => {
  const response = await fetch(`${API_BASE}/retrieval`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error('Failed to fetch retrieval data');
  const data = await response.json();
  return data.data || data;
};

/**
 * Fetches errors data including error tracking and fallback triggers
 * @returns {Promise<import('../types/telemetry').ErrorsData>}
 */
export const getErrors = async () => {
  const response = await fetch(`${API_BASE}/errors`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error('Failed to fetch errors data');
  const data = await response.json();
  return data.data || data;
};

/**
 * Fetches users data including activity and engagement metrics
 * @returns {Promise<import('../types/telemetry').UsersData>}
 */
export const getUsers = async () => {
  const response = await fetch(`${API_BASE}/users`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error('Failed to fetch users data');
  const data = await response.json();
  return data.data || data;
};

/**
 * Fetches database data including encryption status and storage
 * @returns {Promise<import('../types/telemetry').DatabaseData>}
 */
export const getDatabase = async () => {
  const response = await fetch(`${API_BASE}/database`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error('Failed to fetch database data');
  const data = await response.json();
  return data.data || data;
};

export const dashboardApi = {
  getOverview,
  getIntentAnalysis,
  getRetrieval,
  getErrors,
  getUsers,
  getDatabase,
};
