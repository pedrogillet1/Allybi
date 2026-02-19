// file: src/analytics/calculators/errorRate.calculator.ts
// API error rate calculator - pure function, no DB/IO

export type ApiPerfEvent = {
  ts: string;
  route: string;
  statusCode: number;
  latencyMs?: number;
  ttftMs?: number;
};

export type ErrorRateOptions = {
  include429?: boolean; // Default: true (rate limiting counts as error)
};

export type RouteErrorRate = {
  route: string;
  total: number;
  errors: number;
  errorRate: number;
};

export type ErrorRateResult = {
  total: number;
  errors: number;
  errorRate: number;
  byRoute: RouteErrorRate[];
};

/**
 * Determines if a status code is an error
 * - 5xx = server error
 * - 429 = rate limited (configurable)
 */
function isError(statusCode: number, include429: boolean): boolean {
  if (statusCode >= 500) return true;
  if (include429 && statusCode === 429) return true;
  return false;
}

/**
 * Calculate API error rate
 *
 * Error = statusCode >= 500 OR statusCode == 429 (configurable)
 * Rate = errors / total requests
 *
 * @param apiEvents - Array of API performance events
 * @param opts - Options including whether to count 429 as errors
 * @returns Error rate statistics overall and by route
 */
export function calculateErrorRate(
  apiEvents: ApiPerfEvent[],
  opts?: ErrorRateOptions,
): ErrorRateResult {
  const include429 = opts?.include429 !== false; // Default true

  const emptyResult: ErrorRateResult = {
    total: 0,
    errors: 0,
    errorRate: 0,
    byRoute: [],
  };

  if (!apiEvents || apiEvents.length === 0) {
    return emptyResult;
  }

  // Aggregate by route
  const routeStats = new Map<string, { total: number; errors: number }>();
  let totalCount = 0;
  let totalErrors = 0;

  for (const event of apiEvents) {
    const route = event.route || "unknown";
    const statusCode = event.statusCode ?? 0;

    if (!routeStats.has(route)) {
      routeStats.set(route, { total: 0, errors: 0 });
    }

    const stats = routeStats.get(route)!;
    stats.total++;
    totalCount++;

    if (isError(statusCode, include429)) {
      stats.errors++;
      totalErrors++;
    }
  }

  // Build byRoute array
  const byRoute: RouteErrorRate[] = [];

  for (const [route, stats] of Array.from(routeStats.entries())) {
    byRoute.push({
      route,
      total: stats.total,
      errors: stats.errors,
      errorRate: stats.total > 0 ? stats.errors / stats.total : 0,
    });
  }

  // Sort by error count descending
  byRoute.sort((a, b) => b.errors - a.errors);

  return {
    total: totalCount,
    errors: totalErrors,
    errorRate: totalCount > 0 ? totalErrors / totalCount : 0,
    byRoute,
  };
}

/**
 * Calculate error rate over time series (by day)
 */
export function calculateErrorRateSeries(
  apiEvents: ApiPerfEvent[],
  opts?: ErrorRateOptions,
): Array<{ day: string; total: number; errors: number; errorRate: number }> {
  const include429 = opts?.include429 !== false;

  if (!apiEvents || apiEvents.length === 0) {
    return [];
  }

  // Group by day
  const byDay = new Map<string, { total: number; errors: number }>();

  for (const event of apiEvents) {
    const d = new Date(event.ts);
    if (isNaN(d.getTime())) continue;

    const day = d.toISOString().slice(0, 10);

    if (!byDay.has(day)) {
      byDay.set(day, { total: 0, errors: 0 });
    }

    const stats = byDay.get(day)!;
    stats.total++;

    if (isError(event.statusCode ?? 0, include429)) {
      stats.errors++;
    }
  }

  // Build sorted series
  const days = Array.from(byDay.keys()).sort();

  return days.map((day) => {
    const stats = byDay.get(day)!;
    return {
      day,
      total: stats.total,
      errors: stats.errors,
      errorRate: stats.total > 0 ? stats.errors / stats.total : 0,
    };
  });
}

// Test vectors
// Input: [
//   { ts: "2024-01-15T10:00:00Z", route: "/api/chat", statusCode: 200 },
//   { ts: "2024-01-15T10:01:00Z", route: "/api/chat", statusCode: 500 },
//   { ts: "2024-01-15T10:02:00Z", route: "/api/upload", statusCode: 429 },
//   { ts: "2024-01-15T10:03:00Z", route: "/api/upload", statusCode: 200 }
// ]
// opts: { include429: true }
// Expected: { total: 4, errors: 2, errorRate: 0.5, byRoute: [...] }
