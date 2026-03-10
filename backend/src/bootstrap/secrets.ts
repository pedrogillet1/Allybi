import { getSecret } from "../services/security/secretManager.service";
import { logger } from "../utils/logger";

/**
 * Bootstrap secrets from Secret Manager (production) or .env (development).
 * Called once at startup before other services initialize.
 */
const MANAGED_SECRETS = [
  "KODA_MASTER_KEY_BASE64",
  "KODA_ADMIN_KEY",
  "CLOUDCONVERT_API_KEY",
  "GOOGLE_VISION_CREDENTIALS_B64",
  "MICROSOFT_CLIENT_SECRET",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "SENTRY_DSN",
];

export async function bootstrapSecrets(): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    logger.info("[Secrets] Development mode — using .env values");
    return;
  }

  const loaded: string[] = [];
  const failed: string[] = [];

  for (const name of MANAGED_SECRETS) {
    try {
      const value = await getSecret(name);
      if (value && !process.env[name]) {
        process.env[name] = value;
        loaded.push(name);
      }
    } catch {
      failed.push(name);
    }
  }

  logger.info(
    `[Secrets] Loaded ${loaded.length} secrets from Secret Manager: ${loaded.join(", ")}`,
  );
  if (failed.length > 0) {
    logger.warn(`[Secrets] Failed to load: ${failed.join(", ")}`);
  }
}
