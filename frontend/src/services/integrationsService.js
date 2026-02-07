import api from './api';

const PROVIDERS = ['gmail', 'outlook', 'slack'];

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
      envConfigured: Boolean(row?.env?.valid),
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

  // Security invariant: OAuth redirect_uri must be server-controlled (env),
  // never derived from an arbitrary frontend URL.
  const response = await api.get(`/api/integrations/${normalized}/start`);
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

export { getStatus, startConnect, disconnect, normalizeProviderStatus, PROVIDERS };
