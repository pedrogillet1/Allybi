/**
 * Global Rate Limiter for Claude API
 * Uses Upstash Redis for serverless-compatible distributed rate limiting
 *
 * Implements token bucket algorithm with:
 * - Request rate limiting
 * - Token (input + output) rate limiting
 * - Proper retry-after handling
 */

import { Redis } from '@upstash/redis';

// Initialize Redis client (uses UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN)
let redis = null;

function getRedis() {
  if (!redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      console.warn('Upstash Redis not configured - falling back to local rate limiting');
      return null;
    }

    redis = new Redis({ url, token });
  }
  return redis;
}

// Rate limit configuration - Based on Anthropic's ACTUAL limits
// CRITICAL: OUTPUT TPM is the binding constraint, not INPUT TPM!
// Using 85% of actual limits as safety margin
const RATE_LIMITS = {
  // Haiku 3.5 - 80K OUTPUT TPM is the binding constraint
  'claude-3-5-haiku-20241022': {
    requestsPerMinute: 3400,       // 85% of 4000 RPM
    inputTokensPerMinute: 340000,  // 85% of 400K input TPM
    outputTokensPerMinute: 68000,  // 85% of 80K OUTPUT TPM - THE BINDING LIMIT!
    maxConcurrent: 8               // Low due to output TPM limit
  },
  // Haiku 4 - 800K OUTPUT TPM allows much higher throughput
  'claude-haiku-4-20250514': {
    requestsPerMinute: 3400,       // 85% of 4000 RPM
    inputTokensPerMinute: 340000,  // 85% of 400K input TPM
    outputTokensPerMinute: 680000, // 85% of 800K OUTPUT TPM
    maxConcurrent: 25              // Higher due to better output limits
  },
  // Haiku 4.5 - Latest, highest throughput
  'claude-haiku-4-5-20250514': {
    requestsPerMinute: 3400,       // 85% of 4000 RPM
    inputTokensPerMinute: 340000,  // 85% of 400K input TPM
    outputTokensPerMinute: 680000, // 85% of 800K OUTPUT TPM
    maxConcurrent: 30              // Slightly faster model
  },
  // Sonnet 4
  'claude-sonnet-4-20250514': {
    requestsPerMinute: 3400,       // 85% of 4000 RPM
    inputTokensPerMinute: 340000,  // 85% of 400K input TPM
    outputTokensPerMinute: 68000,  // 85% of 80K OUTPUT TPM
    maxConcurrent: 8
  }
};

// Keys for Redis - separate input and output token tracking
const KEYS = {
  requestCount: (model) => `claude:${model}:requests`,
  inputTokenCount: (model) => `claude:${model}:input_tokens`,
  outputTokenCount: (model) => `claude:${model}:output_tokens`,  // THE BINDING CONSTRAINT
  activeWorkers: (model) => `claude:${model}:active`,
  metrics: (model) => `claude:${model}:metrics`,
  lastReset: (model) => `claude:${model}:reset`
};

/**
 * Token bucket rate limiter with Redis
 */
export class ClaudeRateLimiter {
  constructor(model = 'claude-3-5-haiku-20241022') {
    this.model = model;
    this.limits = RATE_LIMITS[model] || RATE_LIMITS['claude-3-5-haiku-20241022'];
    this.redis = getRedis();
    this.workerId = `worker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Local metrics tracking
    this.metrics = {
      totalRequests: 0,
      totalTokensIn: 0,
      totalTokensOut: 0,
      total429s: 0,
      avgDuration: 0
    };
  }

  /**
   * Reserve capacity before making a Claude API call
   * Returns: { allowed: boolean, waitMs: number, reason: string }
   *
   * IMPORTANT: estimatedOutputTokens is the binding constraint for most models!
   * Haiku 3.5: 80K output TPM vs 400K input TPM
   * Haiku 4: 800K output TPM vs 4M input TPM
   */
  async reserveCapacity(estimatedInputTokens = 2000, estimatedOutputTokens = 2000) {
    if (!this.redis) {
      // Fallback: simple local delay
      return { allowed: true, waitMs: 0, reason: 'no-redis' };
    }

    const now = Date.now();
    const windowStart = Math.floor(now / 60000) * 60000; // Current minute window

    try {
      // Use Redis pipeline for atomic operations
      const pipe = this.redis.pipeline();

      // Get current counts
      pipe.get(KEYS.requestCount(this.model));
      pipe.get(KEYS.inputTokenCount(this.model));
      pipe.get(KEYS.outputTokenCount(this.model));
      pipe.scard(KEYS.activeWorkers(this.model));
      pipe.get(KEYS.lastReset(this.model));

      const [requestCount, inputTokenCount, outputTokenCount, activeWorkers, lastReset] = await pipe.exec();

      const currentRequests = parseInt(requestCount) || 0;
      const currentInputTokens = parseInt(inputTokenCount) || 0;
      const currentOutputTokens = parseInt(outputTokenCount) || 0;
      const currentActive = parseInt(activeWorkers) || 0;
      const lastResetTime = parseInt(lastReset) || 0;

      // Check if we need to reset (new minute window)
      if (lastResetTime < windowStart) {
        await this.redis.pipeline()
          .set(KEYS.requestCount(this.model), 0)
          .set(KEYS.inputTokenCount(this.model), 0)
          .set(KEYS.outputTokenCount(this.model), 0)
          .set(KEYS.lastReset(this.model), windowStart)
          .expire(KEYS.requestCount(this.model), 120)
          .expire(KEYS.inputTokenCount(this.model), 120)
          .expire(KEYS.outputTokenCount(this.model), 120)
          .exec();
      }

      // Check limits - OUTPUT TOKENS IS THE BINDING CONSTRAINT!
      const requestsRemaining = this.limits.requestsPerMinute - currentRequests;
      const inputTokensRemaining = this.limits.inputTokensPerMinute - currentInputTokens;
      const outputTokensRemaining = this.limits.outputTokensPerMinute - currentOutputTokens;
      const concurrencyAvailable = this.limits.maxConcurrent - currentActive;

      // Determine if we can proceed
      if (concurrencyAvailable <= 0) {
        const waitMs = 1000 + Math.random() * 2000; // Wait 1-3 seconds
        return { allowed: false, waitMs, reason: 'max-concurrent' };
      }

      if (requestsRemaining <= 0) {
        const msUntilReset = 60000 - (now % 60000);
        return { allowed: false, waitMs: msUntilReset + Math.random() * 1000, reason: 'requests-exhausted' };
      }

      // Check OUTPUT tokens first (usually the binding constraint!)
      if (outputTokensRemaining < estimatedOutputTokens) {
        const msUntilReset = 60000 - (now % 60000);
        console.log(`[RateLimiter] Output TPM limit: ${currentOutputTokens}/${this.limits.outputTokensPerMinute}`);
        return { allowed: false, waitMs: msUntilReset + Math.random() * 1000, reason: 'output-tokens-exhausted' };
      }

      if (inputTokensRemaining < estimatedInputTokens) {
        const msUntilReset = 60000 - (now % 60000);
        return { allowed: false, waitMs: msUntilReset + Math.random() * 1000, reason: 'input-tokens-exhausted' };
      }

      // Reserve capacity
      await this.redis.pipeline()
        .incr(KEYS.requestCount(this.model))
        .incrby(KEYS.inputTokenCount(this.model), estimatedInputTokens)
        .incrby(KEYS.outputTokenCount(this.model), estimatedOutputTokens)
        .sadd(KEYS.activeWorkers(this.model), this.workerId)
        .expire(KEYS.activeWorkers(this.model), 300) // 5 min expiry for stale workers
        .exec();

      return { allowed: true, waitMs: 0, reason: 'ok' };

    } catch (error) {
      console.error('Redis error:', error.message);
      // On Redis error, allow with small delay to prevent total blockage
      return { allowed: true, waitMs: 100, reason: 'redis-error' };
    }
  }

  /**
   * Release capacity after a call completes
   * Adjusts token counts based on actual vs estimated usage
   */
  async releaseCapacity(actualInputTokens = 0, actualOutputTokens = 0, estimatedInputTokens = 2000, estimatedOutputTokens = 2000) {
    if (!this.redis) return;

    try {
      const inputDiff = actualInputTokens - estimatedInputTokens;
      const outputDiff = actualOutputTokens - estimatedOutputTokens;

      await this.redis.pipeline()
        .srem(KEYS.activeWorkers(this.model), this.workerId)
        .incrby(KEYS.inputTokenCount(this.model), inputDiff)
        .incrby(KEYS.outputTokenCount(this.model), outputDiff)
        .exec();

    } catch (error) {
      console.error('Release error:', error.message);
    }
  }

  /**
   * Handle 429 response - extract retry-after and update limits
   */
  async handle429(headers, retryAfterMs = null) {
    this.metrics.total429s++;

    // Extract retry-after from headers
    let waitMs = retryAfterMs || 5000;

    if (headers) {
      const retryAfter = headers['retry-after'];
      if (retryAfter) {
        waitMs = parseFloat(retryAfter) * 1000;
      }

      // Log rate limit headers for debugging
      console.log('Rate limit headers:', {
        requestsLimit: headers['anthropic-ratelimit-requests-limit'],
        requestsRemaining: headers['anthropic-ratelimit-requests-remaining'],
        requestsReset: headers['anthropic-ratelimit-requests-reset'],
        tokensLimit: headers['anthropic-ratelimit-tokens-limit'],
        tokensRemaining: headers['anthropic-ratelimit-tokens-remaining'],
        tokensReset: headers['anthropic-ratelimit-tokens-reset']
      });
    }

    // Add jitter to prevent thundering herd
    waitMs += Math.random() * 1000;

    // Release our capacity reservation
    await this.releaseCapacity(0, 0);

    return waitMs;
  }

  /**
   * Update metrics after successful call
   */
  updateMetrics(inputTokens, outputTokens, durationMs) {
    this.metrics.totalRequests++;
    this.metrics.totalTokensIn += inputTokens;
    this.metrics.totalTokensOut += outputTokens;

    // Rolling average for duration
    this.metrics.avgDuration =
      (this.metrics.avgDuration * (this.metrics.totalRequests - 1) + durationMs) /
      this.metrics.totalRequests;
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      avgTokensPerRequest: this.metrics.totalRequests > 0
        ? (this.metrics.totalTokensIn + this.metrics.totalTokensOut) / this.metrics.totalRequests
        : 0
    };
  }

  /**
   * Calculate optimal concurrency based on observed metrics
   * Uses OUTPUT tokens as the binding constraint
   */
  calculateOptimalConcurrency() {
    const metrics = this.getMetrics();

    if (metrics.totalRequests < 10) {
      return this.limits.maxConcurrent; // Start with configured limit
    }

    const avgOutputTokens = metrics.totalRequests > 0
      ? metrics.totalTokensOut / metrics.totalRequests
      : 2000;
    const avgDurationSec = metrics.avgDuration / 1000;

    // Max jobs per minute based on OUTPUT token limit (the binding constraint!)
    const maxJobsPerMin = this.limits.outputTokensPerMinute / Math.max(avgOutputTokens, 500);

    // Optimal concurrent workers
    // If avg latency is 3s and we can do 340 jobs/min, we need ~17 concurrent workers
    const optimal = Math.floor((maxJobsPerMin * avgDurationSec) / 60);

    // Clamp to reasonable range
    return Math.min(Math.max(optimal, 3), this.limits.maxConcurrent);
  }
}

/**
 * Simple wait helper with jitter
 */
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export const sleepWithJitter = (baseMs, jitterMs = 1000) =>
  sleep(baseMs + Math.random() * jitterMs);

/**
 * Get global rate limiter instance
 * Default to Haiku 4.5 for best throughput (800K output TPM vs 80K for 3.5)
 */
let globalLimiter = null;

export function getRateLimiter(model = 'claude-haiku-4-5-20250514') {
  if (!globalLimiter || globalLimiter.model !== model) {
    globalLimiter = new ClaudeRateLimiter(model);
  }
  return globalLimiter;
}
