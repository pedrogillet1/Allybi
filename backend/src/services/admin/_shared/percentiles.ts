/**
 * Percentile Calculation Utilities
 * Calculate p50, p95, p99 from arrays of numbers
 */

/**
 * Calculate a specific percentile from sorted array
 */
export function percentile(sortedValues: number[], p: number): number {
  if (!sortedValues.length) return 0;
  if (sortedValues.length === 1) return sortedValues[0];

  const index = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sortedValues[lower];
  }

  // Linear interpolation
  const fraction = index - lower;
  return (
    sortedValues[lower] + fraction * (sortedValues[upper] - sortedValues[lower])
  );
}

/**
 * Calculate p50 (median)
 */
export function p50(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(percentile(sorted, 50));
}

/**
 * Calculate p95
 */
export function p95(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(percentile(sorted, 95));
}

/**
 * Calculate p99
 */
export function p99(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(percentile(sorted, 99));
}

/**
 * Calculate multiple percentiles at once (more efficient for large arrays)
 */
export function calculatePercentiles(
  values: number[],
  percentiles: number[] = [50, 95, 99],
): Record<string, number> {
  if (!values.length) {
    return percentiles.reduce((acc, p) => ({ ...acc, [`p${p}`]: 0 }), {});
  }

  const sorted = [...values].sort((a, b) => a - b);

  return percentiles.reduce(
    (acc, p) => ({
      ...acc,
      [`p${p}`]: Math.round(percentile(sorted, p)),
    }),
    {},
  );
}

/**
 * Calculate basic stats including mean and percentiles
 */
export function calculateStats(values: number[]): {
  count: number;
  sum: number;
  mean: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
} {
  if (!values.length) {
    return {
      count: 0,
      sum: 0,
      mean: 0,
      min: 0,
      max: 0,
      p50: 0,
      p95: 0,
      p99: 0,
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);

  return {
    count: values.length,
    sum,
    mean: Math.round(sum / values.length),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p50: Math.round(percentile(sorted, 50)),
    p95: Math.round(percentile(sorted, 95)),
    p99: Math.round(percentile(sorted, 99)),
  };
}
