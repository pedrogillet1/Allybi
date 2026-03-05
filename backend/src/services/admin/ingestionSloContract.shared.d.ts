export interface IngestionSloSummaryBucket {
  mimeType: string;
  sizeBucket: string;
  count: number;
  p95LatencyMs: number;
  p95PeakRssMb: number;
  failureRate: number;
}

export interface IngestionSloSummary {
  docsProcessed: number;
  p95LatencyMs: number;
  p95PeakRssMb: number;
  byMimeSize: IngestionSloSummaryBucket[];
}

export interface IngestionSloThresholdsShared {
  maxGlobalP95LatencyMs: number;
  maxGlobalFailureRatePct: number;
  minDocsProcessed?: number;
  maxGlobalP95PeakRssMb?: number;
  maxBucketP95LatencyMsByKey?: Record<string, number>;
  maxBucketFailureRatePctByKey?: Record<string, number>;
  maxBucketP95PeakRssMbByKey?: Record<string, number>;
}

export interface IngestionSloEvaluationShared {
  passed: boolean;
  failures: string[];
  globalFailureRatePct: number;
}

export function summarizeIngestionSloEvents(
  events: Array<{
    status?: string | null;
    mimeType?: string | null;
    durationMs?: number | null;
    meta?: unknown;
  }>,
): IngestionSloSummary;

export function evaluateIngestionSloMetrics(
  metrics: IngestionSloSummary,
  thresholds: IngestionSloThresholdsShared,
): IngestionSloEvaluationShared;
