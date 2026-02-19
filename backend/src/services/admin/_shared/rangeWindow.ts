/**
 * Range Window Utilities
 * Parse date ranges and calculate time windows for analytics queries
 */

export type RangeKey = "24h" | "7d" | "30d" | "90d";

export interface TimeWindow {
  from: Date;
  to: Date;
}

const RANGE_MS: Record<RangeKey, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
};

const RANGE_ALIASES: Record<string, RangeKey> = {
  "1d": "24h",
  "24h": "24h",
  "7d": "7d",
  "30d": "30d",
  "90d": "90d",
};

/**
 * Normalize range string to canonical form
 */
export function normalizeRange(
  range: unknown,
  fallback: RangeKey = "7d",
): RangeKey {
  if (typeof range !== "string") return fallback;
  const key = range.toLowerCase().trim();
  return RANGE_ALIASES[key] ?? fallback;
}

/**
 * Parse range into time window {from, to}
 */
export function parseRange(
  range: unknown,
  fallback: RangeKey = "7d",
): TimeWindow {
  const key = normalizeRange(range, fallback);
  const ms = RANGE_MS[key];
  const to = new Date();
  const from = new Date(to.getTime() - ms);
  return { from, to };
}

/**
 * Get previous period window for trend/delta calculations
 */
export function previousWindow(
  range: unknown,
  fallback: RangeKey = "7d",
): TimeWindow {
  const key = normalizeRange(range, fallback);
  const ms = RANGE_MS[key];
  const to = new Date(Date.now() - ms);
  const from = new Date(to.getTime() - ms);
  return { from, to };
}

/**
 * Get range in days
 */
export function rangeToDays(range: unknown, fallback: RangeKey = "7d"): number {
  const key = normalizeRange(range, fallback);
  return RANGE_MS[key] / (24 * 60 * 60 * 1000);
}

/**
 * Get range in hours
 */
export function rangeToHours(
  range: unknown,
  fallback: RangeKey = "7d",
): number {
  const key = normalizeRange(range, fallback);
  return RANGE_MS[key] / (60 * 60 * 1000);
}

/**
 * Format window to ISO strings for API responses
 */
export function formatWindow(window: TimeWindow): { from: string; to: string } {
  return {
    from: window.from.toISOString(),
    to: window.to.toISOString(),
  };
}
