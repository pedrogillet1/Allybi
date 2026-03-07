/**
 * Parse an integer from a string, returning a fallback when the result is NaN.
 * Prevents `NaN * 1024 * 1024 = NaN` from silently disabling size validation.
 */
export function safeParseInt(value: string | undefined, fallback: number, radix = 10): number {
  if (value === undefined || value === "") return fallback;
  const parsed = parseInt(value, radix);
  return Number.isNaN(parsed) ? fallback : parsed;
}
