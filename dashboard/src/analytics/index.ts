/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * analytics/index.ts (Koda)
 * ------------------------
 * initAnalytics() wires analytics aggregators and cache.
 * This layer is "derived": it reads telemetry tables and returns dashboard-ready KPIs.
 *
 * Philosophy:
 *  - Admin endpoints should call analytics services/aggregators, not raw Prisma models.
 *  - Keep ranges bounded for safety (defaultRangeDays/maxRangeDays).
 */

import DEFAULT_ANALYTICS_CONFIG, { AnalyticsConfig } from "./config";

export interface AnalyticsInitOptions {
  prisma: any;
  redis?: any;
  config?: Partial<AnalyticsConfig>;
}

let _initialized = false;
let _prisma: any = null;
let _redis: any = null;
let _cfg: AnalyticsConfig = DEFAULT_ANALYTICS_CONFIG;

export function initAnalytics(opts: AnalyticsInitOptions) {
  _prisma = opts.prisma;
  _redis = opts.redis || null;
  _cfg = { ...DEFAULT_ANALYTICS_CONFIG, ...(opts.config || {}) };
  _initialized = true;
}

export function getAnalyticsContext() {
  if (!_initialized) {
    throw new Error("Analytics not initialized. Call initAnalytics({ prisma, redis }) at startup.");
  }
  return { prisma: _prisma, redis: _redis, config: _cfg };
}

export default { initAnalytics, getAnalyticsContext };
