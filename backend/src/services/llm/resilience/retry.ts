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

/**
 * Determines whether an error is retryable.
 * Retryable: HTTP 429 (rate limited), HTTP 5xx, network errors.
 * Non-retryable: CircuitOpenError, HTTP 4xx (except 429), AbortError.
 */
export function isRetryableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;

  const e = err as Record<string, unknown>;

  // Never retry circuit-open or aborts
  if (e.name === "CircuitOpenError" || e.name === "AbortError") return false;
  if (err instanceof Error && /abort/i.test(err.message)) return false;

  // Check for HTTP status codes embedded in error
  const status =
    typeof e.status === "number"
      ? e.status
      : typeof e.statusCode === "number"
        ? e.statusCode
        : extractStatusFromMessage(e);

  if (status !== null) {
    if (status === 429) return true; // rate limited
    if (status >= 500) return true; // server error
    if (status >= 400) return false; // client error (not 429)
  }

  // Network errors
  if (err instanceof TypeError) return true; // fetch network failure
  if (
    typeof e.code === "string" &&
    (e.code === "ECONNRESET" || e.code === "ETIMEDOUT" || e.code === "ECONNREFUSED")
  ) {
    return true;
  }

  return false;
}

function extractStatusFromMessage(e: Record<string, unknown>): number | null {
  if (typeof e.message !== "string") return null;
  try {
    const parsed = JSON.parse(e.message);
    if (typeof parsed?.status === "number") return parsed.status;
  } catch {
    // Not JSON — try regex
    const match = e.message.match(/"status"\s*:\s*(\d{3})/);
    if (match) return Number(match[1]);
  }
  return null;
}
