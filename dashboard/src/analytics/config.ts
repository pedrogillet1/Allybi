/**
 * analytics/config.ts (Koda)
 * --------------------------
 * Central configuration for analytics rollups, caching, and ranges.
 *
 * Goals:
 *  - Keep admin dashboard queries fast (prefer rollups)
 *  - Keep defaults safe (bounded ranges)
 *  - Make cadences explicit (hourly/daily)
 */

export interface AnalyticsConfig {
  env: "production" | "staging" | "dev" | "local";

  // Default date windows for dashboard
  defaultRangeDays: number; // e.g. 7
  maxRangeDays: number;     // e.g. 31

  // Pagination defaults
  defaultPageSize: number;  // e.g. 50
  maxPageSize: number;      // e.g. 200

  // Rollup scheduling (in minutes)
  hourlyRollupEveryMinutes: number; // e.g. 60
  dailyRollupEveryMinutes: number;  // e.g. 1440

  // Cache TTLs (seconds)
  cache: {
    overviewTtlSec: number;
    tablesTtlSec: number;
    chartsTtlSec: number;
    liveCountersTtlSec: number;
  };

  // Sampling / retention
  retention: {
    telemetryDays: number;      // keep raw telemetry for N days
    liveFeedMaxEvents: number;  // for redis live view
  };

  // Thresholds (used for "status badges" in admin)
  thresholds: {
    slowEndpointMsWarn: number;
    slowEndpointMsError: number;

    ttftMsWarn: number;
    ttftMsError: number;

    totalMsWarn: number;
    totalMsError: number;

    errorRateWarn: number;   // e.g. 0.02 = 2%
    errorRateError: number;  // e.g. 0.05 = 5%

    fallbackRateWarn: number;
    sourcesMissingRateWarn: number;

    retrievalThinDocsWarn: number; // distinct docs below this triggers warning
  };
}

export const DEFAULT_ANALYTICS_CONFIG: AnalyticsConfig = {
  env: (process.env.NODE_ENV as any) || "dev",

  defaultRangeDays: 7,
  maxRangeDays: 31,

  defaultPageSize: 50,
  maxPageSize: 200,

  hourlyRollupEveryMinutes: 60,
  dailyRollupEveryMinutes: 1440,

  cache: {
    overviewTtlSec: 30,
    tablesTtlSec: 20,
    chartsTtlSec: 45,
    liveCountersTtlSec: 10,
  },

  retention: {
    telemetryDays: 30,
    liveFeedMaxEvents: 1000,
  },

  thresholds: {
    slowEndpointMsWarn: 5000,
    slowEndpointMsError: 20000,

    ttftMsWarn: 2500,
    ttftMsError: 6000,

    totalMsWarn: 20000,
    totalMsError: 60000,

    errorRateWarn: 0.02,
    errorRateError: 0.05,

    fallbackRateWarn: 0.08,
    sourcesMissingRateWarn: 0.05,

    retrievalThinDocsWarn: 1,
  },
};

export default DEFAULT_ANALYTICS_CONFIG;
