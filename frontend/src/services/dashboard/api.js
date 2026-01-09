/**
 * Dashboard API Service
 * Handles all API requests to the monitoring dashboard backend
 */

const API_BASE = '/api/dashboard';

/**
 * Fetches overview data including system health and metrics
 * @returns {Promise<import('../../types/telemetry').OverviewData>}
 */
export const getOverview = async () => {
  const response = await fetch(`${API_BASE}/overview`);
  if (!response.ok) throw new Error('Failed to fetch overview data');
  return response.json();
};

/**
 * Fetches intent analysis data including classification metrics
 * @returns {Promise<import('../../types/telemetry').IntentAnalysisData>}
 */
export const getIntentAnalysis = async () => {
  const response = await fetch(`${API_BASE}/intent-analysis`);
  if (!response.ok) throw new Error('Failed to fetch intent analysis data');
  return response.json();
};

/**
 * Fetches retrieval data including RAG performance metrics
 * @returns {Promise<import('../../types/telemetry').RetrievalData>}
 */
export const getRetrieval = async () => {
  const response = await fetch(`${API_BASE}/retrieval`);
  if (!response.ok) throw new Error('Failed to fetch retrieval data');
  return response.json();
};

/**
 * Fetches errors data including error tracking and fallback triggers
 * @returns {Promise<import('../../types/telemetry').ErrorsData>}
 */
export const getErrors = async () => {
  const response = await fetch(`${API_BASE}/errors`);
  if (!response.ok) throw new Error('Failed to fetch errors data');
  return response.json();
};

/**
 * Fetches users data including activity and engagement metrics
 * @returns {Promise<import('../../types/telemetry').UsersData>}
 */
export const getUsers = async () => {
  const response = await fetch(`${API_BASE}/users`);
  if (!response.ok) throw new Error('Failed to fetch users data');
  return response.json();
};

/**
 * Fetches database data including encryption status and storage
 * @returns {Promise<import('../../types/telemetry').DatabaseData>}
 */
export const getDatabase = async () => {
  const response = await fetch(`${API_BASE}/database`);
  if (!response.ok) throw new Error('Failed to fetch database data');
  return response.json();
};

export const dashboardApi = {
  getOverview,
  getIntentAnalysis,
  getRetrieval,
  getErrors,
  getUsers,
  getDatabase,
};
