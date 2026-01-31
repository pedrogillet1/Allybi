/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Redis Telemetry Sink (Koda)
 * ---------------------------
 * Purpose:
 *  - Power the /admin/live realtime feed
 *  - Store a rolling window of recent events
 *  - Maintain lightweight counters for quick dashboard stats
 *
 * Requirements:
 *  - Works even if Redis is down (best-effort)
 *  - Uses small payloads and caps list sizes
 *
 * Redis keys (recommended):
 *  - telemetry:live              -> LIST of JSON events (LPUSH)
 *  - telemetry:live:byCategory:* -> LIST per category
 *  - telemetry:counters:*        -> HASH counters by day/hour
 */

import type { TelemetryEvent } from "../types";

export interface TelemetrySink {
  write(event: TelemetryEvent): Promise<void>;
}

export interface RedisSinkOptions {
  redis: any; // ioredis or node-redis client
  liveListMax?: number; // default 1000
  perCategoryMax?: number; // default 500
  countersEnabled?: boolean; // default true
}

function safeJsonStringify(obj: any) {
  try {
    return JSON.stringify(obj);
  } catch {
    return null;
  }
}

function dayKey(d = new Date()) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function createRedisSink(opts: RedisSinkOptions): TelemetrySink {
  const redis = opts.redis;
  const liveMax = opts.liveListMax ?? 1000;
  const catMax = opts.perCategoryMax ?? 500;
  const countersEnabled = opts.countersEnabled !== false;

  return {
    async write(event: TelemetryEvent) {
      try {
        const json = safeJsonStringify(event);
        if (!json) return;

        // Global live feed
        await redis.lpush("telemetry:live", json);
        await redis.ltrim("telemetry:live", 0, liveMax - 1);

        // Per-category feed
        const cat = String(event.category || "unknown");
        const catKey = `telemetry:live:byCategory:${cat}`;
        await redis.lpush(catKey, json);
        await redis.ltrim(catKey, 0, catMax - 1);

        if (countersEnabled) {
          const day = dayKey(new Date(event.ts));
          const counterKey = `telemetry:counters:${day}`;

          // Increment category + severity counts
          await redis.hincrby(counterKey, `category.${cat}`, 1);
          await redis.hincrby(counterKey, `severity.${event.severity}`, 1);

          // Increment event-specific count
          const name = String(event.name || "unknown");
          await redis.hincrby(counterKey, `event.${name}`, 1);

          // Optional: set TTL (keep 30 days)
          await redis.expire(counterKey, 60 * 60 * 24 * 30);
        }
      } catch {
        // best-effort: never throw
      }
    },
  };
}

export default createRedisSink;
