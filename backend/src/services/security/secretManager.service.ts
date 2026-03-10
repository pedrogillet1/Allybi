/**
 * GCP Secret Manager integration for production secret management.
 * Falls back to environment variables for local development.
 */
import { logger } from "../../utils/logger";

interface SecretManagerClient {
  accessSecretVersion(request: {
    name: string;
  }): Promise<[{ payload: { data: Buffer | string } }]>;
}

let _client: SecretManagerClient | null = null;

async function getClient(): Promise<SecretManagerClient> {
  if (!_client) {
    // Lazy require keeps local/dev installs working without forcing the package.
    let SecretManagerServiceClient: any;
    try {
      ({ SecretManagerServiceClient } = require("@google-cloud/secret-manager"));
    } catch {
      throw new Error(
        "Missing @google-cloud/secret-manager package. Install it to enable Secret Manager integration.",
      );
    }
    _client = new SecretManagerServiceClient() as SecretManagerClient;
  }
  return _client;
}

const secretCache = new Map<string, string>();

/**
 * Fetch a secret from GCP Secret Manager (cached after first fetch).
 * In development, returns the env var value directly.
 */
export async function getSecret(
  name: string,
  envFallback?: string,
): Promise<string | undefined> {
  // Development: use env vars
  if (process.env.NODE_ENV !== "production" || !process.env.GCP_PROJECT_ID) {
    return process.env[name] || envFallback;
  }

  // Check cache
  if (secretCache.has(name)) {
    return secretCache.get(name);
  }

  try {
    const client = await getClient();
    const projectId = process.env.GCP_PROJECT_ID;
    const [version] = await client.accessSecretVersion({
      name: `projects/${projectId}/secrets/${name}/versions/latest`,
    });

    const value =
      typeof version.payload.data === "string"
        ? version.payload.data
        : version.payload.data.toString("utf8");

    secretCache.set(name, value);
    logger.info(`[SecretManager] Loaded secret: ${name}`);
    return value;
  } catch (err) {
    logger.error(`[SecretManager] Failed to fetch secret: ${name}`, {
      error: err instanceof Error ? err.message : String(err),
    });
    // Fallback to env var
    return process.env[name] || envFallback;
  }
}

/**
 * Clear the secret cache (used during key rotation).
 */
export function clearSecretCache(): void {
  secretCache.clear();
}

/**
 * List loaded secret names (not values).
 */
export function getLoadedSecretNames(): string[] {
  return Array.from(secretCache.keys());
}
