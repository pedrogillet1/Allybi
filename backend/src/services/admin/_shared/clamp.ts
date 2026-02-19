/**
 * Clamp Utilities
 * Safe number clamping for pagination limits and other bounded values
 */

const MIN_LIMIT = 1;
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

/**
 * Clamp limit to valid range [1, 200]
 */
export function clampLimit(
  value: unknown,
  fallback: number = DEFAULT_LIMIT,
): number {
  if (value === undefined || value === null) return fallback;

  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;

  return Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, Math.floor(num)));
}

/**
 * Clamp any number to a range
 */
export function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  if (value === undefined || value === null) return fallback;

  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;

  return Math.max(min, Math.min(max, num));
}

/**
 * Clamp integer to a range
 */
export function clampInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  return Math.floor(clampNumber(value, min, max, fallback));
}

/**
 * Safe BigInt to number conversion with max cap
 */
export function bigIntToNumber(
  value: unknown,
  max: number = Number.MAX_SAFE_INTEGER,
): number {
  if (typeof value === "bigint") {
    const capped = value > BigInt(max) ? max : Number(value);
    return capped;
  }
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.min(num, max);
}

/**
 * Ensure a value is a non-negative number
 */
export function ensureNonNegative(
  value: unknown,
  fallback: number = 0,
): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return fallback;
  return num;
}
