export type ConnectorProvider = 'gmail' | 'outlook' | 'slack';

export interface ConnectorCapabilities {
  oauth: boolean;
  sync: boolean;
  search: boolean;
  realtime?: boolean;
}

export interface ConnectorModule {
  provider: ConnectorProvider;
  capabilities: ConnectorCapabilities;
  oauthService?: unknown;
  clientService?: unknown;
  syncService?: unknown;
}

export interface ConnectorEnvCheck {
  provider: ConnectorProvider;
  required: string[];
  missing: string[];
  ok: boolean;
}

export class ConnectorRegistryError extends Error {
  public readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'ConnectorRegistryError';
    this.code = code;
  }
}

const PROVIDERS: ConnectorProvider[] = ['gmail', 'outlook', 'slack'];

const CAPABILITIES: Record<ConnectorProvider, ConnectorCapabilities> = {
  gmail: { oauth: true, sync: true, search: true, realtime: false },
  outlook: { oauth: true, sync: true, search: true, realtime: false },
  slack: { oauth: true, sync: true, search: true, realtime: true },
};

const ENV_REQUIREMENTS: Record<ConnectorProvider, string[]> = {
  gmail: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CALLBACK_URL'],
  // Require MICROSOFT_TENANT_ID so single-tenant apps don't accidentally use /common.
  // If you intentionally support multi-tenant, set MICROSOFT_TENANT_ID=common.
  outlook: ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_CALLBACK_URL', 'MICROSOFT_TENANT_ID'],
  slack: ['SLACK_CLIENT_ID', 'SLACK_CLIENT_SECRET', 'SLACK_REDIRECT_URI'],
};

function assertProvider(provider: string): asserts provider is ConnectorProvider {
  if (!PROVIDERS.includes(provider as ConnectorProvider)) {
    throw new ConnectorRegistryError(`Unsupported connector provider: ${provider}`, 'UNSUPPORTED_PROVIDER');
  }
}

const moduleCache = new Map<ConnectorProvider, ConnectorModule>();
const registeredModules = new Map<ConnectorProvider, ConnectorModule>();

export function listConnectorProviders(): ConnectorProvider[] {
  return [...PROVIDERS];
}

export function getConnectorCapabilities(provider: ConnectorProvider): ConnectorCapabilities {
  return CAPABILITIES[provider];
}

export function getConnectorEnvRequirements(provider: ConnectorProvider): string[] {
  return [...ENV_REQUIREMENTS[provider]];
}

export async function getConnector(provider: ConnectorProvider): Promise<ConnectorModule> {
  assertProvider(provider);

  const cached = moduleCache.get(provider);
  if (cached) return cached;

  const registered = registeredModules.get(provider);
  if (!registered) {
    throw new ConnectorRegistryError(
      `Connector provider ${provider} is not registered. Register provider services at bootstrap.`,
      'PROVIDER_NOT_REGISTERED',
    );
  }

  const normalized: ConnectorModule = {
    provider,
    capabilities: registered.capabilities ?? CAPABILITIES[provider],
    oauthService: registered.oauthService,
    clientService: registered.clientService,
    syncService: registered.syncService,
  };

  moduleCache.set(provider, normalized);
  return normalized;
}

export function isConnectorProvider(value: string): value is ConnectorProvider {
  return PROVIDERS.includes(value as ConnectorProvider);
}

export function registerConnector(provider: ConnectorProvider, module: Omit<ConnectorModule, 'provider'>): void {
  assertProvider(provider);

  registeredModules.set(provider, {
    provider,
    capabilities: module.capabilities ?? CAPABILITIES[provider],
    oauthService: module.oauthService,
    clientService: module.clientService,
    syncService: module.syncService,
  });

  moduleCache.delete(provider);
}

export function validateConnectorEnv(provider: ConnectorProvider): ConnectorEnvCheck {
  assertProvider(provider);

  const required = ENV_REQUIREMENTS[provider];
  const missing = required.filter((name) => {
    const value = process.env[name];
    return !value || !value.trim();
  });

  return {
    provider,
    required: [...required],
    missing,
    ok: missing.length === 0,
  };
}
