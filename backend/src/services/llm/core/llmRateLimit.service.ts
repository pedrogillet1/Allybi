/**
 * llmRateLimit.service.ts
 *
 * Deterministic rate limiting for LLM usage (requests + tokens) with:
 * - Sliding-window counters (per minute / per hour / per day)
 * - Per-tenant + per-user + per-provider/model buckets
 * - In-memory by default, pluggable external backend (e.g., Redis)
 * - No user-facing microcopy (reason codes only)
 */

import crypto from "crypto";
import type { LLMProvider } from "./llmErrors.types";

export type RateLimitScope =
  | "global"
  | "tenant"
  | "user"
  | "tenant_provider"
  | "user_provider"
  | "tenant_model"
  | "user_model";

export type RateLimitMetric =
  | "requests" // count of LLM calls
  | "tokens"; // total tokens (prompt+completion)

export type RateLimitWindow = "10s" | "1m" | "5m" | "15m" | "1h" | "1d";

export interface RateLimitRule {
  enabled: boolean;

  /** What we’re limiting */
  metric: RateLimitMetric;

  /** How to bucket (who shares the limit) */
  scope: RateLimitScope;

  /** Window size */
  window: RateLimitWindow;

  /** Allowed units per window (requests or tokens) */
  limit: number;

  /** If true, this rule is enforced as hard block; else it can be advisory */
  hard: boolean;
}

export interface RateLimitConfig {
  enabled: boolean;

  /**
   * Default rules. In Allybi, these should come from banks/overlays;
   * this service just executes deterministically.
   */
  rules: RateLimitRule[];

  /**
   * Small safety to avoid huge cardinality in memory store.
   * External backends should handle scale better.
   */
  memory?: {
    maxKeys: number;
    sweepIntervalMs: number;
  };

  /** Optional stable salt for key hashing */
  keySalt?: string;

  /**
   * The precision of sliding windows:
   * - 1m window with granularity 1s -> 60 buckets
   * Larger granularity = fewer buckets, less precision.
   */
  granularitySeconds: number;
}

export interface RateLimitIdentity {
  tenantId?: string;
  userId?: string;

  provider?: LLMProvider;
  model?: string;
}

/** Rate limit request payload */
export interface RateLimitCheckRequest {
  traceId: string;

  identity: RateLimitIdentity;

  /**
   * Units consumed by this action.
   * - For requests: typically 1
   * - For tokens: typically prompt+completion or predicted pre-call
   */
  units: number;

  /** Optional override rules for this call (already bank-resolved) */
  rulesOverride?: RateLimitRule[];
}

/** Deterministic decision (no microcopy) */
export interface RateLimitDecision {
  allowed: boolean;

  /** If blocked, what caused it */
  reason?:
    | "RATE_LIMIT_DISABLED"
    | "RULES_EMPTY"
    | "LIMIT_EXCEEDED"
    | "BACKEND_ERROR";

  /** The rule that triggered the block (if any) */
  violatedRule?: RateLimitRule;

  /** When caller should retry (epoch ms), best-effort */
  retryAtMs?: number;

  /** Current usage snapshot (best-effort) */
  snapshot?: {
    used: number;
    limit: number;
    window: RateLimitWindow;
  };

  /** For diagnostics */
  meta?: {
    traceId: string;
    key?: string;
    backend: "memory" | "external";
  };
}

export interface ExternalRateLimitBackend {
  /**
   * Increment a sliding-window counter and return current total.
   * Must be atomic for correctness.
   */
  incrSlidingWindow(params: {
    key: string;
    nowMs: number;
    windowMs: number;
    granularityMs: number;
    delta: number;
    ttlMs: number;
  }): Promise<{ total: number; resetAtMs: number }>;
}

/**
 * In-memory sliding window backend.
 * Uses time-bucket counters with TTL-like sweeping.
 */
class MemorySlidingWindowBackend {
  private store = new Map<
    string,
    {
      buckets: Map<number, number>; // bucketStartMs -> count
      lastSeenMs: number;
    }
  >();

  private maxKeys: number;
  private evictions = 0;

  constructor(params: { maxKeys: number }) {
    this.maxKeys = params.maxKeys;
  }

  getEvictions(): number {
    return this.evictions;
  }

  sweep(nowMs: number, ttlMs: number): void {
    // Remove keys not seen recently
    for (const [k, v] of Array.from(this.store.entries())) {
      if (nowMs - v.lastSeenMs > ttlMs) {
        this.store.delete(k);
      }
    }
  }

  incrSlidingWindow(params: {
    key: string;
    nowMs: number;
    windowMs: number;
    granularityMs: number;
    delta: number;
    ttlMs: number;
  }): { total: number; resetAtMs: number } {
    const { key, nowMs, windowMs, granularityMs, delta, ttlMs } = params;

    // soft cap on number of keys
    if (!this.store.has(key) && this.store.size >= this.maxKeys) {
      // Evict an arbitrary oldest-ish key deterministically: first inserted
      const oldestKey = this.store.keys().next().value as string | undefined;
      if (oldestKey) {
        this.store.delete(oldestKey);
        this.evictions++;
      }
    }

    const bucketStartMs = Math.floor(nowMs / granularityMs) * granularityMs;
    const windowStartMs = nowMs - windowMs + granularityMs; // include current bucket
    const resetAtMs = bucketStartMs + granularityMs;

    let entry = this.store.get(key);
    if (!entry) {
      entry = { buckets: new Map(), lastSeenMs: nowMs };
      this.store.set(key, entry);
    }
    entry.lastSeenMs = nowMs;

    // Add delta to current bucket
    const prev = entry.buckets.get(bucketStartMs) ?? 0;
    entry.buckets.set(bucketStartMs, prev + delta);

    // Drop buckets outside window
    for (const b of Array.from(entry.buckets.keys())) {
      if (b < windowStartMs) entry.buckets.delete(b);
    }

    // Sum total in window
    let total = 0;
    for (const v of entry.buckets.values()) total += v;

    // Best-effort sweep of dead keys
    if (this.store.size > this.maxKeys * 0.9) {
      this.sweep(nowMs, ttlMs);
    }

    return { total, resetAtMs };
  }
}

export class LLMRateLimitService {
  private readonly config: RateLimitConfig;
  private readonly external?: ExternalRateLimitBackend;
  private readonly memory?: MemorySlidingWindowBackend;
  private sweepTimer?: NodeJS.Timeout;

  constructor(params: {
    config: RateLimitConfig;
    externalBackend?: ExternalRateLimitBackend;
  }) {
    this.config = params.config;
    this.external = params.externalBackend;

    if (!this.external && this.config.memory) {
      this.memory = new MemorySlidingWindowBackend({
        maxKeys: this.config.memory.maxKeys,
      });
      this.sweepTimer = setInterval(() => {
        try {
          this.memory?.sweep(Date.now(), 60 * 60 * 1000);
        } catch {
          // no-op
        }
      }, this.config.memory.sweepIntervalMs);
      this.sweepTimer.unref?.();
    }
  }

  shutdown(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  /**
   * Checks + consumes units if allowed (atomic at backend boundary).
   * If blocked, it does not consume (except in best-effort memory mode, which is still deterministic).
   */
  async checkAndConsume(
    req: RateLimitCheckRequest,
  ): Promise<RateLimitDecision> {
    if (!this.config.enabled) {
      return {
        allowed: true,
        reason: "RATE_LIMIT_DISABLED",
        meta: {
          traceId: req.traceId,
          backend: this.external ? "external" : "memory",
        },
      };
    }

    const rules = (req.rulesOverride ?? this.config.rules).filter(
      (r) => r.enabled,
    );
    if (rules.length === 0) {
      return {
        allowed: true,
        reason: "RULES_EMPTY",
        meta: {
          traceId: req.traceId,
          backend: this.external ? "external" : "memory",
        },
      };
    }

    // Evaluate rules deterministically in a stable order
    const ordered = [...rules].sort(ruleSort);

    for (const rule of ordered) {
      const key = this.buildKey({
        rule,
        identity: req.identity,
      });

      const windowMs = windowToMs(rule.window);
      const granularityMs = Math.max(
        1000,
        this.config.granularitySeconds * 1000,
      );
      const ttlMs = windowMs + 2 * granularityMs; // keep a bit beyond window
      const nowMs = Date.now();

      try {
        const { total, resetAtMs } = await this.incrAndGet({
          key,
          nowMs,
          windowMs,
          granularityMs,
          delta: req.units,
          ttlMs,
        });

        if (total > rule.limit) {
          // Over limit: block only if hard. If not hard, we allow but still return snapshot.
          if (rule.hard) {
            // Best-effort: "undo" is not supported in most backends; we rely on caller not spamming.
            // In practice, set your rules so hard limits are checked BEFORE you call the provider
            // (use predicted tokens for tokens metric).
            return {
              allowed: false,
              reason: "LIMIT_EXCEEDED",
              violatedRule: rule,
              retryAtMs: resetAtMs,
              snapshot: { used: total, limit: rule.limit, window: rule.window },
              meta: {
                traceId: req.traceId,
                key,
                backend: this.external ? "external" : "memory",
              },
            };
          }
        }
      } catch {
        return {
          allowed: true, // fail-open to avoid taking system down; banks decide fallback behavior
          reason: "BACKEND_ERROR",
          meta: {
            traceId: req.traceId,
            key,
            backend: this.external ? "external" : "memory",
          },
        };
      }
    }

    return {
      allowed: true,
      meta: {
        traceId: req.traceId,
        backend: this.external ? "external" : "memory",
      },
    };
  }

  /**
   * Build a deterministic key for a specific rule+identity bucket.
   */
  buildKey(params: {
    rule: RateLimitRule;
    identity: RateLimitIdentity;
  }): string {
    const salt = this.config.keySalt ?? "";

    const stable = {
      metric: params.rule.metric,
      scope: params.rule.scope,
      window: params.rule.window,

      tenantId: params.identity.tenantId ?? null,
      userId: params.identity.userId ?? null,
      provider: params.identity.provider ?? null,
      model: params.identity.model ?? null,

      salt,
    };

    const json = JSON.stringify(sortKeysDeep(stable));
    const hash = sha256(json);

    return `koda:rl:${params.rule.metric}:${params.rule.scope}:${params.rule.window}:${hash}`;
  }

  private async incrAndGet(params: {
    key: string;
    nowMs: number;
    windowMs: number;
    granularityMs: number;
    delta: number;
    ttlMs: number;
  }): Promise<{ total: number; resetAtMs: number }> {
    if (this.external) {
      const out = await this.external.incrSlidingWindow(params);
      return { total: out.total, resetAtMs: out.resetAtMs };
    }
    if (!this.memory) {
      // No backend configured: behave as unlimited
      return { total: 0, resetAtMs: params.nowMs };
    }
    const out = this.memory.incrSlidingWindow(params);
    return { total: out.total, resetAtMs: out.resetAtMs };
  }
}

/* ------------------------- helpers ------------------------- */

function ruleSort(a: RateLimitRule, b: RateLimitRule): number {
  // Hard rules first, then smaller windows first, then lower limits first (more restrictive first)
  const hardA = a.hard ? 0 : 1;
  const hardB = b.hard ? 0 : 1;
  if (hardA !== hardB) return hardA - hardB;

  const wA = windowToMs(a.window);
  const wB = windowToMs(b.window);
  if (wA !== wB) return wA - wB;

  if (a.limit !== b.limit) return a.limit - b.limit;

  // Stable tie-breakers
  const m = a.metric.localeCompare(b.metric);
  if (m !== 0) return m;

  return a.scope.localeCompare(b.scope);
}

function windowToMs(w: RateLimitWindow): number {
  switch (w) {
    case "10s":
      return 10_000;
    case "1m":
      return 60_000;
    case "5m":
      return 5 * 60_000;
    case "15m":
      return 15 * 60_000;
    case "1h":
      return 60 * 60_000;
    case "1d":
      return 24 * 60 * 60_000;
    default:
      return 60_000;
  }
}

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

function sortKeysDeep<T>(x: T): T {
  if (x === null || typeof x !== "object") return x;
  if (Array.isArray(x)) return x.map(sortKeysDeep) as unknown as T;

  const obj = x as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) out[k] = sortKeysDeep(obj[k]);
  return out as T;
}
