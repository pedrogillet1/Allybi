// src/analytics/cache/analytics.cache.ts
/**
 * Analytics cache layer with Redis-first, memory fallback strategy.
 *
 * Features:
 * - Upstash Redis REST API as primary store
 * - In-memory LRU fallback when Redis unavailable
 * - TTL support with stale-while-revalidate
 * - Singleflight to prevent cache stampede
 * - Safe serialization with error handling
 *
 * SECURITY:
 * - No PII or plaintext content cached
 * - Only derived metrics and safe labels
 * - Keys validated before operations
 */

import { Redis } from "@upstash/redis";
import { config } from "../../config/env";
import { isSafeKey } from "./cacheKeys";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type CacheStatus = "hit" | "miss" | "stale";

export interface WrapOptions {
  /** Additional TTL for serving stale data while revalidating */
  staleTtlSeconds?: number;
  /** Max time to wait for singleflight lock */
  maxWaitMs?: number;
  /** Serve stale data if compute function throws */
  allowStaleOnError?: boolean;
}

export interface WrapResult<T> {
  value: T;
  cache: CacheStatus;
}

export interface AnalyticsCache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  wrap<T>(
    key: string,
    ttlSeconds: number,
    fn: () => Promise<T>,
    opts?: WrapOptions,
  ): Promise<WrapResult<T>>;
}

// ─────────────────────────────────────────────────────────────
// Cache Envelope (stored in Redis/memory)
// ─────────────────────────────────────────────────────────────

interface CacheEnvelope<T> {
  v: 1; // Version for future migrations
  createdAt: string; // ISO timestamp
  ttlSeconds: number;
  value: T;
}

// ─────────────────────────────────────────────────────────────
// Singleflight Map (prevents stampede)
// ─────────────────────────────────────────────────────────────

const inflightRequests = new Map<string, Promise<unknown>>();

async function singleflight<T>(
  key: string,
  fn: () => Promise<T>,
  maxWaitMs = 5000,
): Promise<T> {
  const existing = inflightRequests.get(key);
  if (existing) {
    // Wait for existing request with timeout
    return Promise.race([
      existing as Promise<T>,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error("Singleflight timeout")), maxWaitMs),
      ),
    ]);
  }

  const promise = fn();
  inflightRequests.set(key, promise);

  try {
    return await promise;
  } finally {
    inflightRequests.delete(key);
  }
}

// ─────────────────────────────────────────────────────────────
// Memory Cache Implementation (LRU fallback)
// ─────────────────────────────────────────────────────────────

interface MemoryEntry {
  envelope: CacheEnvelope<unknown>;
  hardExpireAt: number;
}

const MAX_MEMORY_ENTRIES = 500;

export class MemoryAnalyticsCache implements AnalyticsCache {
  private cache = new Map<string, MemoryEntry>();
  private accessOrder: string[] = [];

  private evictIfNeeded(): void {
    while (
      this.cache.size >= MAX_MEMORY_ENTRIES &&
      this.accessOrder.length > 0
    ) {
      const oldest = this.accessOrder.shift();
      if (oldest) {
        this.cache.delete(oldest);
      }
    }
  }

  private touch(key: string): void {
    const idx = this.accessOrder.indexOf(key);
    if (idx > -1) {
      this.accessOrder.splice(idx, 1);
    }
    this.accessOrder.push(key);
  }

  private isExpired(entry: MemoryEntry): boolean {
    return Date.now() > entry.hardExpireAt;
  }

  private isStale(entry: MemoryEntry): boolean {
    const age = Date.now() - new Date(entry.envelope.createdAt).getTime();
    return age > entry.envelope.ttlSeconds * 1000;
  }

  async get<T>(key: string): Promise<T | null> {
    if (!isSafeKey(key)) {
      return null;
    }

    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return null;
    }

    this.touch(key);
    return entry.envelope.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    if (!isSafeKey(key)) {
      return;
    }

    this.evictIfNeeded();

    const envelope: CacheEnvelope<T> = {
      v: 1,
      createdAt: new Date().toISOString(),
      ttlSeconds,
      value,
    };

    // Hard expire includes stale buffer (2x TTL for safety)
    const hardExpireAt = Date.now() + ttlSeconds * 2000;

    this.cache.set(key, { envelope, hardExpireAt });
    this.touch(key);
  }

  async del(key: string): Promise<void> {
    if (!isSafeKey(key)) {
      return;
    }
    this.cache.delete(key);
    const idx = this.accessOrder.indexOf(key);
    if (idx > -1) {
      this.accessOrder.splice(idx, 1);
    }
  }

  async wrap<T>(
    key: string,
    ttlSeconds: number,
    fn: () => Promise<T>,
    opts?: WrapOptions,
  ): Promise<WrapResult<T>> {
    if (!isSafeKey(key)) {
      const value = await fn();
      return { value, cache: "miss" };
    }

    const entry = this.cache.get(key);
    const staleTtl = opts?.staleTtlSeconds ?? 0;
    const totalTtl = ttlSeconds + staleTtl;

    // Check if we have a valid cached value
    if (entry && !this.isExpired(entry)) {
      const isStale = this.isStale(entry);

      if (!isStale) {
        this.touch(key);
        return { value: entry.envelope.value as T, cache: "hit" };
      }

      // Stale value - return it and refresh in background if stale-while-revalidate enabled
      if (staleTtl > 0) {
        // Trigger background refresh (don't await)
        singleflight(
          key,
          async () => {
            try {
              const freshValue = await fn();
              await this.set(key, freshValue, totalTtl);
            } catch {
              // Silently fail background refresh
            }
          },
          opts?.maxWaitMs,
        ).catch(() => {});

        return { value: entry.envelope.value as T, cache: "stale" };
      }
    }

    // Cache miss or expired - compute fresh value
    try {
      const value = await singleflight(
        key,
        async () => {
          const freshValue = await fn();
          await this.set(key, freshValue, totalTtl > 0 ? totalTtl : ttlSeconds);
          return freshValue;
        },
        opts?.maxWaitMs,
      );

      return { value, cache: "miss" };
    } catch (error) {
      // If compute fails and we have stale data, serve it
      if (opts?.allowStaleOnError && entry) {
        return { value: entry.envelope.value as T, cache: "stale" };
      }
      throw error;
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Redis Cache Implementation (Upstash)
// ─────────────────────────────────────────────────────────────

export class RedisAnalyticsCache implements AnalyticsCache {
  private redis: Redis;
  private fallback: MemoryAnalyticsCache;

  constructor(redis: Redis) {
    this.redis = redis;
    this.fallback = new MemoryAnalyticsCache();
  }

  async get<T>(key: string): Promise<T | null> {
    if (!isSafeKey(key)) {
      return null;
    }

    try {
      const raw = await this.redis.get<string>(key);
      if (!raw) {
        return null;
      }

      // Parse envelope
      let envelope: CacheEnvelope<T>;
      try {
        envelope = typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch {
        // Corrupted data - delete and return miss
        await this.redis.del(key);
        return null;
      }

      if (!envelope || envelope.v !== 1) {
        await this.redis.del(key);
        return null;
      }

      return envelope.value;
    } catch {
      // Redis error - try fallback
      return this.fallback.get<T>(key);
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    if (!isSafeKey(key)) {
      return;
    }

    const envelope: CacheEnvelope<T> = {
      v: 1,
      createdAt: new Date().toISOString(),
      ttlSeconds,
      value,
    };

    try {
      const serialized = JSON.stringify(envelope);
      // Store with TTL (Redis handles expiration)
      await this.redis.set(key, serialized, { ex: ttlSeconds * 2 });
    } catch {
      // Redis error - use fallback
      await this.fallback.set(key, value, ttlSeconds);
    }
  }

  async del(key: string): Promise<void> {
    if (!isSafeKey(key)) {
      return;
    }

    try {
      await this.redis.del(key);
    } catch {
      // Silently fail
    }
    await this.fallback.del(key);
  }

  async wrap<T>(
    key: string,
    ttlSeconds: number,
    fn: () => Promise<T>,
    opts?: WrapOptions,
  ): Promise<WrapResult<T>> {
    if (!isSafeKey(key)) {
      const value = await fn();
      return { value, cache: "miss" };
    }

    const staleTtl = opts?.staleTtlSeconds ?? 0;
    const totalTtl = ttlSeconds + staleTtl;

    // Try to get from cache
    let envelope: CacheEnvelope<T> | null = null;
    let redisAvailable = true;

    try {
      const raw = await this.redis.get<string>(key);
      if (raw) {
        try {
          envelope = typeof raw === "string" ? JSON.parse(raw) : raw;
          if (!envelope || envelope.v !== 1) {
            envelope = null;
            await this.redis.del(key);
          }
        } catch {
          await this.redis.del(key);
        }
      }
    } catch {
      redisAvailable = false;
      // Fall through to fallback
    }

    // If Redis is down, use memory fallback entirely
    if (!redisAvailable) {
      return this.fallback.wrap(key, ttlSeconds, fn, opts);
    }

    // Check if cached value is valid
    if (envelope) {
      const age = Date.now() - new Date(envelope.createdAt).getTime();
      const isStale = age > envelope.ttlSeconds * 1000;

      if (!isStale) {
        return { value: envelope.value, cache: "hit" };
      }

      // Stale value - serve and refresh in background
      if (staleTtl > 0 && age <= totalTtl * 1000) {
        // Background refresh
        singleflight(
          key,
          async () => {
            try {
              const freshValue = await fn();
              await this.set(key, freshValue, totalTtl);
            } catch {
              // Silently fail
            }
          },
          opts?.maxWaitMs,
        ).catch(() => {});

        return { value: envelope.value, cache: "stale" };
      }
    }

    // Cache miss - compute fresh value
    try {
      const value = await singleflight(
        key,
        async () => {
          const freshValue = await fn();
          await this.set(key, freshValue, totalTtl > 0 ? totalTtl : ttlSeconds);
          return freshValue;
        },
        opts?.maxWaitMs,
      );

      return { value, cache: "miss" };
    } catch (error) {
      // If compute fails and we have stale data, serve it
      if (opts?.allowStaleOnError && envelope) {
        return { value: envelope.value, cache: "stale" };
      }
      throw error;
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────

let cacheInstance: AnalyticsCache | null = null;

/**
 * Create or return singleton analytics cache.
 * Uses Redis if available, falls back to memory.
 */
export function createAnalyticsCache(): AnalyticsCache {
  if (cacheInstance) {
    return cacheInstance;
  }

  // Try to use Upstash Redis
  if (config.UPSTASH_REDIS_REST_URL && config.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const redis = new Redis({
        url: config.UPSTASH_REDIS_REST_URL,
        token: config.UPSTASH_REDIS_REST_TOKEN,
      });
      console.log("📊 Analytics cache: Using Upstash Redis");
      cacheInstance = new RedisAnalyticsCache(redis);
      return cacheInstance;
    } catch (error) {
      console.warn(
        "⚠️  Analytics cache: Redis init failed, using memory fallback",
      );
    }
  }

  console.log("📊 Analytics cache: Using in-memory fallback");
  cacheInstance = new MemoryAnalyticsCache();
  return cacheInstance;
}

/**
 * Get the analytics cache instance (creates if needed)
 */
export function getAnalyticsCache(): AnalyticsCache {
  return createAnalyticsCache();
}

// Default export
export default getAnalyticsCache;
