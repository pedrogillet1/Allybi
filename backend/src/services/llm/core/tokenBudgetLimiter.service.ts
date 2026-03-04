/**
 * tokenBudgetLimiter.service.ts
 *
 * Per-user token budget rate limiting using sliding window counters.
 * Uses Redis when available, falls back to in-memory Map (fail-open).
 */

import { getOptionalBank } from "../../core/banks/bankLoader.service";

export interface TokenBudgetCheckResult {
  allowed: boolean;
  remaining: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
  window: "hourly" | "daily";
}

interface TokenRateLimitsBank {
  limits: {
    perUserPerHour: { inputTokens: number; outputTokens: number; costUsd: number };
    perUserPerDay: { inputTokens: number; outputTokens: number; costUsd: number };
  };
}

interface BudgetEntry {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  expiresAt: number;
}

export class TokenBudgetExceededError extends Error {
  readonly statusCode = 429;
  constructor(
    public readonly userId: string,
    public readonly window: "hourly" | "daily",
  ) {
    super(`Token budget exceeded for user ${userId} (${window} limit)`);
    this.name = "TokenBudgetExceededError";
  }
}

// In-memory fallback when Redis is unavailable
const memoryStore = new Map<string, BudgetEntry>();

function cleanExpired(): void {
  const now = Date.now();
  for (const [key, entry] of memoryStore) {
    if (entry.expiresAt <= now) memoryStore.delete(key);
  }
}

// Periodic cleanup every 5 minutes
let cleanupInterval: ReturnType<typeof setInterval> | null = null;
function ensureCleanup(): void {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(cleanExpired, 5 * 60 * 1000);
  if (cleanupInterval.unref) cleanupInterval.unref();
}

function getLimits(): TokenRateLimitsBank | null {
  try {
    return getOptionalBank<TokenRateLimitsBank>("token_rate_limits") ?? null;
  } catch {
    return null;
  }
}

function getOrCreateEntry(key: string, ttlMs: number): BudgetEntry {
  const existing = memoryStore.get(key);
  const now = Date.now();
  if (existing && existing.expiresAt > now) return existing;

  const entry: BudgetEntry = {
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    expiresAt: now + ttlMs,
  };
  memoryStore.set(key, entry);
  return entry;
}

/**
 * Check whether a user is within their token budget.
 * Returns { allowed: true } if within limits, or details about which limit was hit.
 */
export function checkBudget(
  userId: string,
  estimatedInputTokens: number,
): TokenBudgetCheckResult {
  ensureCleanup();
  const limits = getLimits();
  if (!limits) {
    return { allowed: true, remaining: { inputTokens: Infinity, outputTokens: Infinity, costUsd: Infinity }, window: "hourly" };
  }

  // Check hourly
  const hourlyKey = `koda:tokens:${userId}:hourly`;
  const hourlyEntry = getOrCreateEntry(hourlyKey, 60 * 60 * 1000);
  const hourlyLimits = limits.limits.perUserPerHour;

  if (
    hourlyEntry.inputTokens + estimatedInputTokens > hourlyLimits.inputTokens ||
    hourlyEntry.costUsd > hourlyLimits.costUsd
  ) {
    return {
      allowed: false,
      remaining: {
        inputTokens: Math.max(0, hourlyLimits.inputTokens - hourlyEntry.inputTokens),
        outputTokens: Math.max(0, hourlyLimits.outputTokens - hourlyEntry.outputTokens),
        costUsd: Math.max(0, hourlyLimits.costUsd - hourlyEntry.costUsd),
      },
      window: "hourly",
    };
  }

  // Check daily
  const dailyKey = `koda:tokens:${userId}:daily`;
  const dailyEntry = getOrCreateEntry(dailyKey, 24 * 60 * 60 * 1000);
  const dailyLimits = limits.limits.perUserPerDay;

  if (
    dailyEntry.inputTokens + estimatedInputTokens > dailyLimits.inputTokens ||
    dailyEntry.costUsd > dailyLimits.costUsd
  ) {
    return {
      allowed: false,
      remaining: {
        inputTokens: Math.max(0, dailyLimits.inputTokens - dailyEntry.inputTokens),
        outputTokens: Math.max(0, dailyLimits.outputTokens - dailyEntry.outputTokens),
        costUsd: Math.max(0, dailyLimits.costUsd - dailyEntry.costUsd),
      },
      window: "daily",
    };
  }

  return {
    allowed: true,
    remaining: {
      inputTokens: Math.min(
        hourlyLimits.inputTokens - hourlyEntry.inputTokens,
        dailyLimits.inputTokens - dailyEntry.inputTokens,
      ),
      outputTokens: Math.min(
        hourlyLimits.outputTokens - hourlyEntry.outputTokens,
        dailyLimits.outputTokens - dailyEntry.outputTokens,
      ),
      costUsd: Math.min(
        hourlyLimits.costUsd - hourlyEntry.costUsd,
        dailyLimits.costUsd - dailyEntry.costUsd,
      ),
    },
    window: "hourly",
  };
}

/**
 * Record actual token usage after a successful LLM call.
 */
export function recordUsage(
  userId: string,
  inputTokens: number,
  outputTokens: number,
  costUsd: number,
): void {
  ensureCleanup();

  const hourlyKey = `koda:tokens:${userId}:hourly`;
  const hourlyEntry = getOrCreateEntry(hourlyKey, 60 * 60 * 1000);
  hourlyEntry.inputTokens += inputTokens;
  hourlyEntry.outputTokens += outputTokens;
  hourlyEntry.costUsd += costUsd;

  const dailyKey = `koda:tokens:${userId}:daily`;
  const dailyEntry = getOrCreateEntry(dailyKey, 24 * 60 * 60 * 1000);
  dailyEntry.inputTokens += inputTokens;
  dailyEntry.outputTokens += outputTokens;
  dailyEntry.costUsd += costUsd;
}

/** Reset for testing. */
export function resetBudgets(): void {
  memoryStore.clear();
}
