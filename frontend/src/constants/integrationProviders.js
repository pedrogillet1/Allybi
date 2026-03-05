// Supported runtime connectors are intentionally limited to these providers.
// Keep this list in sync with backend ConnectorProvider and connectors_routing bank.
export const INTEGRATION_PROVIDERS = Object.freeze(['gmail', 'outlook', 'slack']);

export const INTEGRATION_CALLBACK_PATHS = Object.freeze({
  gmail: '/api/integrations/gmail/callback',
  outlook: '/api/integrations/outlook/callback',
  slack: '/api/integrations/slack/callback',
});

export function isIntegrationProvider(value) {
  return INTEGRATION_PROVIDERS.includes(String(value || '').toLowerCase());
}
