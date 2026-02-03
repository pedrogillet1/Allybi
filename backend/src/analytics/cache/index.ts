// src/analytics/cache/index.ts
/**
 * Analytics cache module exports
 */

export { cacheKeys, normalizeFilters, isSafeKey } from './cacheKeys';
export type {
  TimeRange,
  BaseFilters,
  UserFilters,
  FileFilters,
  QueryFilters,
  CostFilters,
} from './cacheKeys';

export {
  createAnalyticsCache,
  getAnalyticsCache,
  MemoryAnalyticsCache,
  RedisAnalyticsCache,
} from './analytics.cache';
export type {
  AnalyticsCache,
  CacheStatus,
  WrapOptions,
  WrapResult,
} from './analytics.cache';
