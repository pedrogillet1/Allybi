import { useState, useEffect, useCallback, useRef } from 'react';
import { getStatus, startConnect, disconnect, sync } from '../services/integrationsService';
import { getApiBaseUrl } from '../services/runtimeConfig';
import { INTEGRATION_PROVIDERS } from '../constants/integrationProviders';

const PROVIDERS = INTEGRATION_PROVIDERS;

/** Extract the most useful error message from an Axios error or generic Error. */
function extractErrorMessage(err, fallback = 'Operation failed') {
  // Axios response error: prefer the backend's error message
  const respMsg =
    err?.response?.data?.error?.message ||
    err?.response?.data?.error ||
    err?.response?.data?.message;
  if (typeof respMsg === 'string' && respMsg.trim()) return respMsg.trim();
  // Generic error
  const msg = err?.message;
  if (typeof msg === 'string' && msg.trim() && !msg.includes('status code')) return msg.trim();
  return fallback;
}

const DEFAULT_STATE = {
  connected: false,
  expired: false,
  lastSyncAt: null,
  indexedDocuments: 0,
  ingestionEnabled: false,
  syncing: false,
  connecting: false,
  error: null,
};

function resolveTrustedOAuthMessageOrigins() {
  const origins = new Set();

  if (typeof window !== 'undefined' && window.location?.origin) {
    origins.add(window.location.origin);
    try {
      const apiBase = getApiBaseUrl();
      if (apiBase) {
        origins.add(new URL(apiBase, window.location.origin).origin);
      }
    } catch {
      // Ignore invalid runtime URL values.
    }
  }

  return origins;
}

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
            ingestionEnabled: Boolean(remote.ingestionEnabled),
            syncing: prev[p]?.syncing || false,
            connecting: prev[p]?.connecting || false,
            error: remote.error || null,
          };
        });
        return next;
      });
    } catch (err) {
      if (!mountedRef.current) return;
      setError(extractErrorMessage(err, 'Failed to fetch integration status'));
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

    let popup = null;
    let pollTimer = null;
    let timeoutTimer = null;
    let statusPollTimer = null;
    let onMessage = null;
    let cleaned = false;
    const trustedOrigins = resolveTrustedOAuthMessageOrigins();

    // Shared cleanup for all completion signals.
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null; }
      if (statusPollTimer) { clearInterval(statusPollTimer); statusPollTimer = null; }
      if (onMessage) window.removeEventListener('message', onMessage);
    };

    const handleOAuthDone = () => {
      cleanup();
      // Close the popup from the opener. This is more reliable than the popup
      // closing itself after cross-origin OAuth navigation.
      try { if (popup && !popup.closed) popup.close(); } catch {}
      if (mountedRef.current) {
        setProviders(prev => ({
          ...prev,
          [provider]: { ...prev[provider], connecting: false },
        }));
        fetchStatus();
      }
    };

    const handleOAuthFail = (message = 'OAuth did not complete. Please try again.') => {
      cleanup();
      try { if (popup && !popup.closed) popup.close(); } catch {}
      if (!mountedRef.current) return;
      setProviders(prev => ({
        ...prev,
        [provider]: {
          ...prev[provider],
          connecting: false,
          error: message,
        },
      }));
    };

    const confirmProviderConnected = async () => {
      try {
        const statusMap = await getStatus();
        return Boolean(statusMap?.[provider]?.connected);
      } catch {
        return false;
      }
    };

    try {
      // Open a placeholder popup synchronously from the click event to avoid popup blockers.
      popup = window.open('', `koda_${provider}_oauth`, 'width=600,height=700');
      if (popup && !popup.closed) {
        try {
          popup.document.title = 'Connecting...';
          popup.document.body.style.margin = '0';
          popup.document.body.style.fontFamily = 'Plus Jakarta Sans, sans-serif';
          popup.document.body.style.display = 'flex';
          popup.document.body.style.alignItems = 'center';
          popup.document.body.style.justifyContent = 'center';
          popup.document.body.style.height = '100vh';
          popup.document.body.style.color = '#32302C';
          popup.document.body.innerHTML = '<div>Opening connector authorization...</div>';
        } catch {
          // Best effort only; cross-window document writes can fail in some browsers.
        }
      }

      const { authorizationUrl } = await startConnect(provider);

      if (popup && !popup.closed) {
        try {
          popup.location.href = authorizationUrl;
        } catch {
          window.location.href = authorizationUrl;
          return;
        }
      } else {
        // Popup blocked: fallback to full-page OAuth redirect.
        window.location.href = authorizationUrl;
        return;
      }

      // 1) Listen for completion from OAuth callback window via postMessage.
      onMessage = (event) => {
        if (!trustedOrigins.has(String(event?.origin || ''))) return;
        if (popup && event?.source && event.source !== popup) return;

        const data = event?.data;
        if (!data || typeof data !== 'object') return;
        const eventType = String(data.type || '');
        const eventProvider = String(data.provider || '').toLowerCase();
        const doneType =
          eventType === 'koda_oauth_done' ||
          eventType === 'oauth-callback' ||
          eventType === 'OAUTH_COMPLETE';
        if (!doneType) return;
        if (eventProvider && eventProvider !== String(provider).toLowerCase()) return;
        if (data.ok === false) {
          handleOAuthFail('Connection failed. Please try again.');
          return;
        }

        Promise.resolve(confirmProviderConnected())
          .then((connected) => {
            if (!connected) return;
            handleOAuthDone();
          })
          .catch(() => {});
      };
      window.addEventListener('message', onMessage);

      // 2) Fallback: poll backend status every 3s.
      // This remains reliable even when popup cross-origin behavior blocks opener APIs.
      statusPollTimer = setInterval(async () => {
        try {
          if (await confirmProviderConnected()) {
            handleOAuthDone();
          }
        } catch {}
      }, 3000);

      // 3) Fallback: poll for popup close.
      // Wrapped in try-catch because Cross-Origin-Opener-Policy can block
      // access to popup.closed after cross-origin navigation.
      pollTimer = setInterval(() => {
        try {
          if (popup?.closed) {
            cleanup();
            if (mountedRef.current) {
              setProviders(prev => ({
                ...prev,
                [provider]: { ...prev[provider], connecting: false },
              }));
              setTimeout(() => { if (mountedRef.current) fetchStatus(); }, 1500);
            }
          }
        } catch {
          // COOP blocks popup.closed. Stop polling and rely on statusPoll instead.
          if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        }
      }, 500);

      // Hard timeout so UI cannot get stuck in Connecting...
      timeoutTimer = setTimeout(() => {
        handleOAuthFail('OAuth did not complete. Please try again.');
      }, 120000);
    } catch (err) {
      cleanup();
      try {
        if (popup && !popup.closed) popup.close();
      } catch {
        // ignore
      }
      if (!mountedRef.current) return;
      setProviders(prev => ({
        ...prev,
        [provider]: { ...prev[provider], connecting: false, error: extractErrorMessage(err, 'Connection failed') },
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
        [provider]: { ...prev[provider], error: extractErrorMessage(err, 'Disconnect failed') },
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
      setTimeout(() => { if (mountedRef.current) fetchStatus(); }, 2000);
    } catch (err) {
      if (!mountedRef.current) return;
      setProviders(prev => ({
        ...prev,
        [provider]: { ...prev[provider], syncing: false, error: extractErrorMessage(err, 'Sync failed') },
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
