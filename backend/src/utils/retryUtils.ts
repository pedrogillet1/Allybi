/**
 * Retry Utilities for LLM API Calls
 *
 * Implements exponential backoff retry logic to handle transient API failures.
 * Particularly useful for Gemini API overload errors (503, 429, etc.)
 */

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableErrors?: string[];
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 8000,
  backoffMultiplier: 2,
  retryableErrors: [
    "RESOURCE_EXHAUSTED",
    "UNAVAILABLE",
    "DEADLINE_EXCEEDED",
    "INTERNAL",
    "503",
    "429",
    "overload",
    "quota",
    "rate limit",
  ],
};

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if error is retryable based on error message/code
 */
function isRetryableError(error: any, retryableErrors: string[]): boolean {
  const errorString = JSON.stringify(error).toLowerCase();
  const errorMessage = error?.message?.toLowerCase() || "";
  const errorCode = error?.code?.toString() || "";

  return retryableErrors.some((retryableError) => {
    const searchTerm = retryableError.toLowerCase();
    return (
      errorString.includes(searchTerm) ||
      errorMessage.includes(searchTerm) ||
      errorCode.includes(searchTerm)
    );
  });
}

/**
 * Execute async function with exponential backoff retry
 *
 * @param fn - Async function to execute
 * @param options - Retry configuration
 * @returns Result of successful execution
 * @throws Error if all retry attempts fail
 *
 * @example
 * ```typescript
 * const result = await retryWithBackoff(
 *   async () => await geminiAPI.generateContent(prompt),
 *   { maxAttempts: 3, initialDelayMs: 1000 }
 * );
 * ```
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: any;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      console.log(`🔄 [RETRY] Attempt ${attempt}/${config.maxAttempts}`);
      const result = await fn();

      if (attempt > 1) {
        console.log(`✅ [RETRY] Succeeded on attempt ${attempt}`);
      }

      return result;
    } catch (error) {
      lastError = error;

      // Check if error is retryable
      if (!isRetryableError(error, config.retryableErrors)) {
        console.error(
          `❌ [RETRY] Non-retryable error on attempt ${attempt}:`,
          error,
        );
        throw error;
      }

      // Don't retry if this was the last attempt
      if (attempt === config.maxAttempts) {
        console.error(`❌ [RETRY] All ${config.maxAttempts} attempts failed`);
        break;
      }

      // Calculate delay with exponential backoff
      const delayMs = Math.min(
        config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1),
        config.maxDelayMs,
      );

      console.warn(
        `⚠️ [RETRY] Attempt ${attempt} failed (retryable error). ` +
          `Retrying in ${delayMs}ms...`,
        (error as any)?.message || error,
      );

      await sleep(delayMs);
    }
  }

  // All attempts failed
  throw lastError;
}

/**
 * Retry specifically for streaming operations
 * Handles chunk callbacks and ensures streaming state is reset between retries
 */
export async function retryStreamingWithBackoff<T>(
  fn: (onChunk: (chunk: string) => void) => Promise<T>,
  onChunk: (chunk: string) => void,
  options: RetryOptions = {},
): Promise<T> {
  const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: any;
  let accumulatedChunks: string[] = [];

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      console.log(`🔄 [RETRY-STREAM] Attempt ${attempt}/${config.maxAttempts}`);

      // Reset accumulated chunks for this attempt
      const attemptChunks: string[] = [];

      const result = await fn((chunk: string) => {
        attemptChunks.push(chunk);

        // Only forward chunks to client on first attempt or after previous failures
        // This prevents duplicate chunks from being sent
        if (attempt === 1 || accumulatedChunks.length === 0) {
          onChunk(chunk);
        }
      });

      if (attempt > 1) {
        console.log(`✅ [RETRY-STREAM] Succeeded on attempt ${attempt}`);

        // If we retried, we need to send all chunks from this successful attempt
        // (only if we didn't already send them)
        if (accumulatedChunks.length === 0) {
          attemptChunks.forEach((chunk) => onChunk(chunk));
        }
      }

      return result;
    } catch (error) {
      lastError = error;

      // Store chunks from failed attempt
      accumulatedChunks = [];

      // Check if error is retryable
      if (!isRetryableError(error, config.retryableErrors)) {
        console.error(
          `❌ [RETRY-STREAM] Non-retryable error on attempt ${attempt}:`,
          error,
        );
        throw error;
      }

      // Don't retry if this was the last attempt
      if (attempt === config.maxAttempts) {
        console.error(
          `❌ [RETRY-STREAM] All ${config.maxAttempts} attempts failed`,
        );
        break;
      }

      // Calculate delay with exponential backoff
      const delayMs = Math.min(
        config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1),
        config.maxDelayMs,
      );

      console.warn(
        `⚠️ [RETRY-STREAM] Attempt ${attempt} failed (retryable error). ` +
          `Retrying in ${delayMs}ms...`,
        (error as any)?.message || error,
      );

      await sleep(delayMs);
    }
  }

  // All attempts failed
  throw lastError;
}
