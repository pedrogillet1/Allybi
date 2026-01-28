import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAdminAuth } from '../context/AdminAuthContext';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

export const useTelemetry = (endpoint, options = {}) => {
  const { accessToken } = useAdminAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const {
    params = {},
    enabled = true,
    autoRefresh = false,
    refreshInterval = 60000,
  } = options;

  // Stable serialization of params to detect changes
  const paramsKey = useMemo(() => JSON.stringify(params), [params]);

  const fetchData = useCallback(async () => {
    if (!accessToken || !enabled) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null) qs.set(k, String(v));
      });
      const query = qs.toString();
      const url = `${API_BASE}/admin/telemetry/${endpoint}${query ? `?${query}` : ''}`;

      const headers = {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      };

      // Add admin key for production security
      const adminKey = process.env.REACT_APP_ADMIN_KEY;
      if (adminKey) {
        headers['X-KODA-ADMIN-KEY'] = adminKey;
      }

      const response = await fetch(url, { headers });

      if (!response.ok) {
        if (response.status === 403) throw new Error('Admin access required');
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();

      // Backend returns { ok: true, range, ...data } format
      if (result.ok) {
        // Data is spread at top level (items, nextCursor, etc.)
        setData(result);
      } else {
        throw new Error(result.error || 'Failed to fetch telemetry');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [accessToken, endpoint, enabled, paramsKey, params]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh || !enabled) return;
    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchData, enabled]);

  return { data, loading, error, refetch: fetchData };
};

// Wrapper hooks must memoize their options to prevent infinite loops
export const useTelemetryOverview = (range = '7d') => {
  const options = useMemo(() => ({ params: { range } }), [range]);
  return useTelemetry('overview', options);
};

export const useTelemetryTimeseries = (metric = 'messages', range = '7d') => {
  const options = useMemo(() => ({ params: { metric, range } }), [metric, range]);
  return useTelemetry('timeseries', options);
};

export const useTelemetryUsers = (opts = {}) => {
  const { range = '7d', cursor, limit } = opts;
  const options = useMemo(() => ({ params: { range, cursor, limit } }), [range, cursor, limit]);
  return useTelemetry('users', options);
};

export const useTelemetryFiles = (opts = {}) => {
  const { range = '7d', cursor, limit } = opts;
  const options = useMemo(() => ({ params: { range, cursor, limit } }), [range, cursor, limit]);
  return useTelemetry('files', options);
};

export const useTelemetryQueries = (opts = {}) => {
  const { range = '7d', cursor, limit } = opts;
  const options = useMemo(() => ({ params: { range, cursor, limit } }), [range, cursor, limit]);
  return useTelemetry('queries', options);
};

export const useTelemetryQuality = (opts = {}) => {
  const { range = '7d', cursor, limit } = opts;
  const options = useMemo(() => ({ params: { range, cursor, limit } }), [range, cursor, limit]);
  return useTelemetry('quality', options);
};

export const useTelemetryLLM = (opts = {}) => {
  const { range = '7d', cursor, limit } = opts;
  const options = useMemo(() => ({ params: { range, cursor, limit } }), [range, cursor, limit]);
  return useTelemetry('llm', options);
};

export const useTelemetryLLMProviders = (range = '7d') => {
  const options = useMemo(() => ({ params: { range } }), [range]);
  return useTelemetry('llm/providers', options);
};

export const useTelemetryErrors = (opts = {}) => {
  const { range = '7d', cursor, limit } = opts;
  const options = useMemo(() => ({ params: { range, cursor, limit } }), [range, cursor, limit]);
  return useTelemetry('errors', options);
};

export default useTelemetry;
