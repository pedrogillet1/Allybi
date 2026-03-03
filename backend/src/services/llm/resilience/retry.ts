/**
 * retry.ts — Shared retry with exponential backoff + jitter.
 *
 * Unifies the ad-hoc retry patterns previously scattered across
 * Gemini and OpenAI provider implementations.
 */

export interface RetryConfig {
  /** Maximum number of retry attempts (0 = no retries). */
  maxRetries: number;
  /** Base delay in ms before first retry. Default 500. */
  baseDelayMs?: number;
  /** Maximum delay cap in ms. Default 10_000. */
  maxDelayMs?: number;
  /** Optional predicate — return false to abort retries early. */
  shouldRetry?: (err: unknown, attempt: number) => boolean;
}

const DEFAULT_BASE_DELAY = 500;
const DEFAULT_MAX_DELAY = 10_000;

/**
 * Execute `fn` with retry logic.  On failure the call is retried up to
 * `config.maxRetries` times using exponential backoff with full jitter.
 *
 * Returns the successful result or throws the last error.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig,
): Promise<{ result: T; attempts: number }> {
  const {
    maxRetries,
    baseDelayMs = DEFAULT_BASE_DELAY,
    maxDelayMs = DEFAULT_MAX_DELAY,
    shouldRetry,
  } = config;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      return { result, attempts: attempt + 1 };
    } catch (err) {
      lastErr = err;
      if (attempt === maxRetries) break;
      if (shouldRetry && !shouldRetry(err, attempt)) break;

      // Exponential backoff with full jitter
      const expDelay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      const jitter = Math.random() * expDelay;
      await sleep(jitter);
    }
  }
  throw lastErr;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
