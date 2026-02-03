// src/analytics/cache/cacheKeys.ts
/**
 * Cache key builders for analytics dashboard.
 * All keys follow the pattern: koda:analytics:{env}:{endpoint}:{hash}
 *
 * SECURITY: Keys contain only safe identifiers, never PII or content.
 */

import { config } from '../../config/env';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type TimeRange =
  | '1h'
  | '6h'
  | '24h'
  | '7d'
  | '14d'
  | '30d'
  | '90d'
  | 'all'
  | { start: string; end: string }; // ISO date strings

export interface BaseFilters {
  domain?: string;
  provider?: string;
  model?: string;
  intent?: string;
  route?: string;
  status?: string;
  tier?: string;
  [key: string]: unknown;
}

export interface UserFilters extends BaseFilters {
  isActive?: boolean;
  hasDocuments?: boolean;
}

export interface FileFilters extends BaseFilters {
  mimeType?: string;
  sizeRange?: 'small' | 'medium' | 'large';
  processingStatus?: string;
}

export interface QueryFilters extends BaseFilters {
  hasResponse?: boolean;
  responseTime?: 'fast' | 'medium' | 'slow';
}

export interface CostFilters extends BaseFilters {
  costRange?: 'low' | 'medium' | 'high';
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const ENV = config.NODE_ENV || 'development';
const PREFIX = `koda:analytics:${ENV}`;

/**
 * Normalize filters into a stable, deterministic string.
 * - Sorts keys alphabetically
 * - Sorts array values
 * - Removes undefined/null values
 * - Converts booleans/numbers to strings
 * - Returns URL-safe encoded string
 */
export function normalizeFilters(filters: Record<string, unknown> | undefined): string {
  if (!filters || Object.keys(filters).length === 0) {
    return '';
  }

  const normalized: Record<string, string> = {};

  // Get sorted keys
  const sortedKeys = Object.keys(filters).sort();

  for (const key of sortedKeys) {
    const value = filters[key];

    // Skip undefined/null
    if (value === undefined || value === null) {
      continue;
    }

    // Handle arrays - sort and join
    if (Array.isArray(value)) {
      const sorted = [...value]
        .filter((v) => v !== undefined && v !== null)
        .map(String)
        .sort();
      if (sorted.length > 0) {
        normalized[key] = sorted.join(',');
      }
      continue;
    }

    // Handle objects - recursively normalize
    if (typeof value === 'object') {
      const nested = normalizeFilters(value as Record<string, unknown>);
      if (nested) {
        normalized[key] = nested;
      }
      continue;
    }

    // Convert primitives to string
    normalized[key] = String(value);
  }

  if (Object.keys(normalized).length === 0) {
    return '';
  }

  // Create stable query string
  const parts = Object.entries(normalized)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  return parts;
}

/**
 * Convert TimeRange to a stable string representation
 */
function normalizeRange(range: TimeRange): string {
  if (typeof range === 'string') {
    return range;
  }
  // Custom date range - use ISO strings
  return `${range.start}_${range.end}`;
}

/**
 * Build a cache key from parts
 */
function buildKey(endpoint: string, range: TimeRange, filters?: Record<string, unknown>): string {
  const rangeStr = normalizeRange(range);
  const filterStr = normalizeFilters(filters);
  const parts = [PREFIX, endpoint, rangeStr];
  if (filterStr) {
    parts.push(filterStr);
  }
  return parts.join(':');
}

// ─────────────────────────────────────────────────────────────
// Cache Key Builders
// ─────────────────────────────────────────────────────────────

export const cacheKeys = {
  /**
   * Overview dashboard metrics (total users, queries, files, etc.)
   */
  overview(range: TimeRange): string {
    return buildKey('overview', range);
  },

  /**
   * User analytics (DAU, WAU, retention, etc.)
   */
  users(range: TimeRange, filters?: UserFilters): string {
    return buildKey('users', range, filters);
  },

  /**
   * File analytics (uploads, processing, storage)
   */
  files(range: TimeRange, filters?: FileFilters): string {
    return buildKey('files', range, filters);
  },

  /**
   * Query analytics (volume, latency, patterns)
   */
  queries(range: TimeRange, filters?: QueryFilters): string {
    return buildKey('queries', range, filters);
  },

  /**
   * Answer quality metrics (format scores, weak evidence, etc.)
   */
  answerQuality(range: TimeRange): string {
    return buildKey('answer-quality', range);
  },

  /**
   * LLM cost breakdown by provider/model
   */
  llmCost(range: TimeRange, filters?: CostFilters): string {
    return buildKey('llm-cost', range, filters);
  },

  /**
   * Reliability metrics (error rates, latency percentiles)
   */
  reliability(range: TimeRange): string {
    return buildKey('reliability', range);
  },

  /**
   * Security metrics (auth failures, rate limits, anomalies)
   */
  security(range: TimeRange): string {
    return buildKey('security', range);
  },

  /**
   * Live feed snapshot (recent activity)
   */
  liveFeed(range: TimeRange | 'now' = 'now'): string {
    return buildKey('live-feed', range === 'now' ? '1h' : range);
  },

  /**
   * Retention cohort data
   */
  retention(range: TimeRange): string {
    return buildKey('retention', range);
  },

  /**
   * Daily rollup aggregates
   */
  dailyRollup(date: string): string {
    return `${PREFIX}:rollup:daily:${date}`;
  },

  /**
   * Hourly rollup aggregates
   */
  hourlyRollup(hour: string): string {
    return `${PREFIX}:rollup:hourly:${hour}`;
  },
};

/**
 * Validate that a key is safe to use (starts with our prefix)
 */
export function isSafeKey(key: string): boolean {
  return key.startsWith('koda:analytics:');
}

export default cacheKeys;
