import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../../services/api';
import { getApiBaseUrl } from '../../../services/runtimeConfig';

const POLL_INTERVAL = 3000;
const MAX_POLLS = 60;

/**
 * Hook to fetch and manage PPTX slide data.
 *
 * Handles:
 *  - Initial fetch from /api/documents/:id/slides
 *  - URL normalization (prepend API_BASE for relative paths)
 *  - Polling when slides are still generating
 *  - Error / retry
 *
 * @param {string} documentId
 * @param {number} version — bumped on edits to refetch
 * @returns {{ slides, totalSlides, loading, error, refetch }}
 */
export default function usePptxSlides(documentId, version = 0) {
  const API_BASE = getApiBaseUrl();

  const [slides, setSlides] = useState([]);
  const [totalSlides, setTotalSlides] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const pollRef = useRef(null);
  const pollCount = useRef(0);
  const mountedRef = useRef(true);

  const normalizeUrl = useCallback((url) => {
    const u = String(url || '').trim();
    if (!u) return null;
    if (u.startsWith('/api/')) return `${API_BASE}${u}`;
    return u;
  }, [API_BASE]);

  const normalizeSlides = useCallback((arr) => {
    return (Array.isArray(arr) ? arr : []).map((s) =>
      s && s.imageUrl ? { ...s, imageUrl: normalizeUrl(s.imageUrl) } : s,
    );
  }, [normalizeUrl]);

  const fetchSlides = useCallback(async () => {
    if (!documentId) return;
    try {
      const res = await api.get(`/api/documents/${documentId}/slides?page=1&pageSize=200`);
      if (!mountedRef.current) return;

      const data = res.data;
      const normalized = normalizeSlides(data.slides || []);
      const hasImages = normalized.some((s) => s.hasImage);

      setSlides(normalized);
      setTotalSlides(data.totalSlides || normalized.length);
      setError(null);

      if (data.isGenerating || (!hasImages && normalized.length > 0)) {
        // Still generating — start polling
        startPolling();
      } else {
        stopPolling();
        setLoading(false);
      }

      if (hasImages) {
        setLoading(false);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setError('Failed to load slides');
      setLoading(false);
      stopPolling();
    }
  }, [documentId, normalizeSlides]); // eslint-disable-line react-hooks/exhaustive-deps

  const startPolling = useCallback(() => {
    stopPolling();
    pollCount.current = 0;

    pollRef.current = setInterval(async () => {
      pollCount.current += 1;
      if (pollCount.current >= MAX_POLLS) {
        stopPolling();
        if (mountedRef.current) {
          setError('Slide generation timed out. Try refreshing.');
          setLoading(false);
        }
        return;
      }

      try {
        const res = await api.get(`/api/documents/${documentId}/slides?page=1&pageSize=200`);
        if (!mountedRef.current) return;

        const data = res.data;
        const normalized = normalizeSlides(data.slides || []);
        const hasImages = normalized.some((s) => s.hasImage);

        setSlides(normalized);
        setTotalSlides(data.totalSlides || normalized.length);

        if (hasImages && !data.isGenerating) {
          stopPolling();
          setLoading(false);
          setError(null);
        }
      } catch {
        // Ignore transient poll errors
      }
    }, POLL_INTERVAL);
  }, [documentId, normalizeSlides]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Initial fetch + refetch on version change
  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    setError(null);
    setSlides([]);
    pollCount.current = 0;
    fetchSlides();

    return () => {
      mountedRef.current = false;
      stopPolling();
    };
  }, [documentId, version]); // eslint-disable-line react-hooks/exhaustive-deps

  return { slides, totalSlides, loading, error, refetch: fetchSlides };
}
