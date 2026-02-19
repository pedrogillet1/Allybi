// file: src/analytics/calculators/latency.calculator.ts
// API latency metrics calculator - pure function, no DB/IO

export type ApiPerfEvent = {
  ts: string;
  route: string;
  statusCode: number;
  latencyMs?: number;
  ttftMs?: number;
};

export type LatencyOptions = {
  field: "latencyMs" | "ttftMs";
  routePrefix?: string;
};

export type LatencyResult = {
  count: number;
  avgMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
};

/**
 * Calculate percentile from sorted array
 * Uses linear interpolation for non-integer indices
 */
export function percentile(sortedValues: number[], p: number): number | null {
  if (!sortedValues || sortedValues.length === 0) return null;
  if (p < 0 || p > 100) return null;

  if (sortedValues.length === 1) return sortedValues[0];

  const index = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const fraction = index - lower;

  if (lower === upper) {
    return sortedValues[lower];
  }

  return sortedValues[lower] * (1 - fraction) + sortedValues[upper] * fraction;
}

/**
 * Calculate latency metrics (avg, p50, p95, p99)
 *
 * @param apiEvents - Array of API performance events
 * @param opts - Field to measure (latencyMs or ttftMs) and optional route filter
 * @returns Latency statistics
 */
export function calculateLatencyMetrics(
  apiEvents: ApiPerfEvent[],
  opts: LatencyOptions,
): LatencyResult {
  const emptyResult: LatencyResult = {
    count: 0,
    avgMs: null,
    p50Ms: null,
    p95Ms: null,
    p99Ms: null,
  };

  if (!apiEvents || apiEvents.length === 0) {
    return emptyResult;
  }

  const { field, routePrefix } = opts;

  // Filter and extract valid latency values
  const values: number[] = [];

  for (const event of apiEvents) {
    // Filter by route prefix if provided
    if (routePrefix && !event.route?.startsWith(routePrefix)) {
      continue;
    }

    const value = event[field];

    // Skip null, undefined, NaN, negative values
    if (
      value == null ||
      typeof value !== "number" ||
      isNaN(value) ||
      value < 0
    ) {
      continue;
    }

    values.push(value);
  }

  if (values.length === 0) {
    return emptyResult;
  }

  // Sort for percentile calculation
  values.sort((a, b) => a - b);

  // Calculate average
  const sum = values.reduce((acc, v) => acc + v, 0);
  const avgMs = sum / values.length;

  return {
    count: values.length,
    avgMs: Math.round(avgMs * 100) / 100,
    p50Ms: Math.round(percentile(values, 50)! * 100) / 100,
    p95Ms: Math.round(percentile(values, 95)! * 100) / 100,
    p99Ms: Math.round(percentile(values, 99)! * 100) / 100,
  };
}

/**
 * Calculate latency metrics grouped by route
 */
export function calculateLatencyByRoute(
  apiEvents: ApiPerfEvent[],
  opts: Omit<LatencyOptions, "routePrefix">,
): Array<{ route: string } & LatencyResult> {
  if (!apiEvents || apiEvents.length === 0) {
    return [];
  }

  // Group events by route
  const byRoute = new Map<string, ApiPerfEvent[]>();

  for (const event of apiEvents) {
    const route = event.route || "unknown";
    if (!byRoute.has(route)) {
      byRoute.set(route, []);
    }
    byRoute.get(route)!.push(event);
  }

  // Calculate metrics per route
  const results: Array<{ route: string } & LatencyResult> = [];

  for (const [route, events] of Array.from(byRoute.entries())) {
    const metrics = calculateLatencyMetrics(events, {
      ...opts,
      routePrefix: undefined,
    });
    results.push({ route, ...metrics });
  }

  // Sort by count descending
  results.sort((a, b) => b.count - a.count);

  return results;
}

// Test vectors
// Input: [{ ts: "2024-01-15T10:00:00Z", route: "/api/chat", statusCode: 200, latencyMs: 100 }, { ts: "2024-01-15T10:01:00Z", route: "/api/chat", statusCode: 200, latencyMs: 200 }, { ts: "2024-01-15T10:02:00Z", route: "/api/chat", statusCode: 200, latencyMs: 150 }]
// opts: { field: "latencyMs" }
// Expected: { count: 3, avgMs: 150, p50Ms: 150, p95Ms: ~195, p99Ms: ~199 }
