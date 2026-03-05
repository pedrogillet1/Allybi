/**
 * useAnalytics Hook
 *
 * PURPOSE: Fetch and manage analytics data from the admin API
 * FEATURES: Caching, auto-refresh, error handling
 */

import { useState, useEffect, useCallback } from 'react';
import { useAdminAuth } from '../context/AdminAuthContext';

import { getApiBaseUrl } from '../services/runtimeConfig';

const API_BASE = getApiBaseUrl() + '/api';

export const useAnalytics = (endpoint, options = {}) => {
  const { accessToken } = useAdminAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cached, setCached] = useState(false);
  const [lastFetched, setLastFetched] = useState(null);

  const {
    autoRefresh = false,
    refreshInterval = 60000, // 1 minute default
    enabled = true
  } = options;

  const fetchData = useCallback(async () => {
    if (!accessToken || !enabled) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE}/admin/analytics/${endpoint}`, {
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Admin access required');
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        setData(result.data);
        setCached(result.cached || false);
        setLastFetched(new Date());
      } else {
        throw new Error(result.error || 'Failed to fetch analytics');
      }
    } catch (err) {
      console.error(`[useAnalytics] Error fetching ${endpoint}:`, err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [accessToken, endpoint, enabled]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh || !enabled) return;

    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchData, enabled]);

  return {
    data,
    loading,
    error,
    cached,
    lastFetched,
    refetch: fetchData
  };
};

// Specialized hooks for each analytics type
export const useOverviewAnalytics = (options = {}) => {
  return useAnalytics('overview', options);
};

export const useQuickStats = (options = {}) => {
  return useAnalytics('quick-stats', { autoRefresh: true, refreshInterval: 60000, ...options });
};

export const useUserAnalytics = (options = {}) => {
  return useAnalytics('users', options);
};

export const useConversationAnalytics = (options = {}) => {
  return useAnalytics('conversations', options);
};

export const useDocumentAnalytics = (options = {}) => {
  return useAnalytics('documents', options);
};

export const useSystemHealth = (options = {}) => {
  return useAnalytics('system-health', { autoRefresh: true, refreshInterval: 30000, ...options });
};

export const useCostAnalytics = (options = {}) => {
  return useAnalytics('costs', options);
};

export const useFeatureUsage = (options = {}) => {
  return useAnalytics('feature-usage', options);
};

// Utility functions
export const refreshAnalyticsCache = async (_accessToken, key = null) => {
  try {
    const response = await fetch(`${API_BASE}/admin/analytics/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ key })
    });

    const result = await response.json();
    return result;
  } catch (err) {
    console.error('[refreshAnalyticsCache] Error:', err);
    throw err;
  }
};

export const exportAnalyticsData = async (_accessToken, type, format = 'json', options = {}) => {
  try {
    const params = new URLSearchParams({ type, format, ...options });
    const response = await fetch(`${API_BASE}/admin/analytics/export?${params}`, {
      credentials: 'include',
    });

    if (format === 'csv') {
      const blob = await response.blob();
      return blob;
    }

    const result = await response.json();
    return result;
  } catch (err) {
    console.error('[exportAnalyticsData] Error:', err);
    throw err;
  }
};

export default useAnalytics;
