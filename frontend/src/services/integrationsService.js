import api from './api';
import { getApiBaseUrl } from './runtimeConfig';

const PROVIDERS = ['gmail', 'outlook', 'slack'];
const CALLBACK_PATHS = {
  gmail: '/api/integrations/gmail/callback',
  outlook: '/api/integrations/outlook/callback',
  slack: '/api/integrations/slack/callback',
};

function shouldSendCallbackUrlOverride() {
  // Always send the connector callback URL derived from the configured API base.
  // Backend still validates allowlisted redirect URIs before using it.
  return true;
}

function getBaseOrigin() {
  return getApiBaseUrl();
}

function normalizeProviderStatus(payload) {
  const rows = Array.isArray(payload?.providers) ? payload.providers : [];
  const map = {};

  for (const provider of PROVIDERS) {
    map[provider] = {
      provider,
      connected: false,
      expired: false,
      indexedDocuments: 0,
      lastSyncAt: null,
      ok: false,
      envConfigured: false,
      capabilities: { oauth: true, sync: false, search: false, realtime: false },
      error: null,
    };
  }

  for (const row of rows) {
    const provider = typeof row?.provider === 'string' ? row.provider.toLowerCase() : '';
    if (!PROVIDERS.includes(provider)) continue;

    map[provider] = {
      ...map[provider],
      ok: Boolean(row?.ok),
      // backend validateConnectorEnv() returns { ok, missing, required }
      envConfigured: Boolean(row?.env?.ok),
      capabilities: row?.capabilities || row?.status?.capabilities || map[provider].capabilities,
      connected: Boolean(row?.status?.connected || row?.data?.connected),
      expired: Boolean(row?.status?.expired || row?.data?.expired),
      indexedDocuments: Number(row?.status?.indexedDocuments || row?.data?.indexedDocuments || 0),
      lastSyncAt: row?.status?.lastSyncAt || row?.data?.lastSyncAt || null,
      error: row?.error || null,
    };
  }

  return map;
}

async function getStatus() {
  const response = await api.get('/api/integrations/status');
  return normalizeProviderStatus(response.data);
}

async function startConnect(provider) {
  const normalized = String(provider || '').toLowerCase();
  if (!PROVIDERS.includes(normalized)) {
    throw new Error(`Unsupported connector provider: ${provider}`);
  }

  // Send connector callback URL explicitly to avoid accidental routing to
  // generic auth callbacks. Backend enforces redirect URI allowlist checks.
  const params = {};
  if (shouldSendCallbackUrlOverride() && CALLBACK_PATHS[normalized]) {
    params.callbackUrl = `${getBaseOrigin()}${CALLBACK_PATHS[normalized]}`;
  }

  const response = await api.get(`/api/integrations/${normalized}/start`, { params });
  const authorizationUrl = response?.data?.authorizationUrl;
  if (!authorizationUrl || typeof authorizationUrl !== 'string') {
    throw new Error('Connector authorization URL was not returned by the server.');
  }

  return {
    provider: normalized,
    authorizationUrl,
    state: response?.data?.state || null,
  };
}

async function disconnect(provider) {
  const normalized = String(provider || '').toLowerCase();
  await api.post(`/api/integrations/${normalized}/disconnect`);
}

async function sync(provider, opts = {}) {
  const normalized = String(provider || '').toLowerCase();
  if (!PROVIDERS.includes(normalized)) {
    throw new Error(`Unsupported connector provider: ${provider}`);
  }
  const forceResync = Boolean(opts?.forceResync);
  const response = await api.post(`/api/integrations/${normalized}/sync`, { forceResync });
  return response?.data ?? null;
}

export { getStatus, startConnect, disconnect, sync, normalizeProviderStatus, PROVIDERS };
