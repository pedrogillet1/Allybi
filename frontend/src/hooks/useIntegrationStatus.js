import { useState, useEffect, useCallback, useRef } from 'react';
import { getStatus, startConnect, disconnect, sync } from '../services/integrationsService';

const PROVIDERS = ['gmail', 'outlook', 'slack'];

const DEFAULT_STATE = {
  connected: false,
  expired: false,
  lastSyncAt: null,
  indexedDocuments: 0,
  syncing: false,
  connecting: false,
  error: null,
};

/**
 * Hook to manage integration provider statuses.
 * Fetches real status from the backend via integrationsService,
 * exposes connect / disconnect / syncNow actions,
 * and tracks per-provider UI states (connecting, syncing, error).
 */
export function useIntegrationStatus() {
  const [providers, setProviders] = useState(() => {
    const map = {};
    PROVIDERS.forEach(p => { map[p] = { ...DEFAULT_STATE, provider: p }; });
    return map;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const statusMap = await getStatus();
      if (!mountedRef.current) return;

      setProviders(prev => {
        const next = {};
        PROVIDERS.forEach(p => {
          const remote = statusMap[p] || {};
          next[p] = {
            provider: p,
            connected: Boolean(remote.connected),
            expired: Boolean(remote.expired),
            lastSyncAt: remote.lastSyncAt || null,
            indexedDocuments: remote.indexedDocuments || 0,
            syncing: prev[p]?.syncing || false,
            connecting: prev[p]?.connecting || false,
            error: remote.error || null,
          };
        });
        return next;
      });
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err?.message || 'Failed to fetch integration status');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchStatus();
    return () => { mountedRef.current = false; };
  }, [fetchStatus]);

  const connectProvider = useCallback(async (provider) => {
    setProviders(prev => ({
      ...prev,
      [provider]: { ...prev[provider], connecting: true, error: null },
    }));

    try {
      const { authorizationUrl } = await startConnect(provider);
      // Open OAuth popup
      const popup = window.open(authorizationUrl, `koda_${provider}_oauth`, 'width=600,height=700');
      // Listen for completion
      const onMessage = (event) => {
        if (event.data?.type === 'oauth-callback' || event.data?.type === 'OAUTH_COMPLETE') {
          window.removeEventListener('message', onMessage);
          if (mountedRef.current) {
            setProviders(prev => ({
              ...prev,
              [provider]: { ...prev[provider], connecting: false },
            }));
            fetchStatus();
          }
        }
      };
      window.addEventListener('message', onMessage);

      // Fallback: poll for popup close
      const pollTimer = setInterval(() => {
        if (popup?.closed) {
          clearInterval(pollTimer);
          window.removeEventListener('message', onMessage);
          if (mountedRef.current) {
            setProviders(prev => ({
              ...prev,
              [provider]: { ...prev[provider], connecting: false },
            }));
            // Refetch after a short delay to allow backend to process
            setTimeout(() => { if (mountedRef.current) fetchStatus(); }, 1500);
          }
        }
      }, 500);
    } catch (err) {
      if (!mountedRef.current) return;
      setProviders(prev => ({
        ...prev,
        [provider]: { ...prev[provider], connecting: false, error: err?.message || 'Connection failed' },
      }));
    }
  }, [fetchStatus]);

  const disconnectProvider = useCallback(async (provider) => {
    try {
      await disconnect(provider);
      if (!mountedRef.current) return;
      setProviders(prev => ({
        ...prev,
        [provider]: { ...DEFAULT_STATE, provider },
      }));
    } catch (err) {
      if (!mountedRef.current) return;
      setProviders(prev => ({
        ...prev,
        [provider]: { ...prev[provider], error: err?.message || 'Disconnect failed' },
      }));
    }
  }, []);

  const syncNow = useCallback(async (provider) => {
    setProviders(prev => ({
      ...prev,
      [provider]: { ...prev[provider], syncing: true, error: null },
    }));

    try {
      await sync(provider);
      if (!mountedRef.current) return;
      setProviders(prev => ({
        ...prev,
        [provider]: { ...prev[provider], syncing: false },
      }));
      // TODO: add WebSocket live updates for sync progress
      setTimeout(() => { if (mountedRef.current) fetchStatus(); }, 2000);
    } catch (err) {
      if (!mountedRef.current) return;
      setProviders(prev => ({
        ...prev,
        [provider]: { ...prev[provider], syncing: false, error: err?.message || 'Sync failed' },
      }));
    }
  }, [fetchStatus]);

  return {
    providers,
    loading,
    error,
    refetch: fetchStatus,
    connectProvider,
    disconnectProvider,
    syncNow,
  };
}
