export interface CanaryHealthSnapshot {
  sampleSize: number;
  errorRate: number;
  p95LatencyMs: number;
  weakEvidenceRate: number;
}

export interface CanaryHealthThresholds {
  minSampleSize: number;
  maxErrorRate: number;
  maxP95LatencyMs: number;
  maxWeakEvidenceRate: number;
}

export type CanaryRecommendation = "continue" | "pause" | "rollback";

export interface CanaryAssessment {
  recommendation: CanaryRecommendation;
  violations: string[];
  thresholds: CanaryHealthThresholds;
  snapshot: CanaryHealthSnapshot;
}

function toFinite(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeCanaryThresholds(
  input: Partial<CanaryHealthThresholds> | null | undefined,
): CanaryHealthThresholds {
  return {
    minSampleSize: Math.max(1, Math.floor(toFinite(input?.minSampleSize, 20))),
    maxErrorRate: Math.max(0, Math.min(1, toFinite(input?.maxErrorRate, 0.02))),
    maxP95LatencyMs: Math.max(1, toFinite(input?.maxP95LatencyMs, 12000)),
    maxWeakEvidenceRate: Math.max(
      0,
      Math.min(1, toFinite(input?.maxWeakEvidenceRate, 0.15)),
    ),
  };
}

export function assessCanaryHealth(
  snapshotInput: Partial<CanaryHealthSnapshot> | null | undefined,
  thresholdsInput: Partial<CanaryHealthThresholds> | null | undefined,
): CanaryAssessment {
  const thresholds = normalizeCanaryThresholds(thresholdsInput);
  const snapshot: CanaryHealthSnapshot = {
    sampleSize: Math.max(0, Math.floor(toFinite(snapshotInput?.sampleSize, 0))),
    errorRate: Math.max(0, toFinite(snapshotInput?.errorRate, 0)),
    p95LatencyMs: Math.max(0, toFinite(snapshotInput?.p95LatencyMs, 0)),
    weakEvidenceRate: Math.max(0, toFinite(snapshotInput?.weakEvidenceRate, 0)),
  };

  const violations: string[] = [];
  if (snapshot.sampleSize < thresholds.minSampleSize) {
    violations.push("SAMPLE_SIZE_TOO_LOW");
  }
  if (snapshot.errorRate > thresholds.maxErrorRate) {
    violations.push("ERROR_RATE_EXCEEDED");
  }
  if (snapshot.p95LatencyMs > thresholds.maxP95LatencyMs) {
    violations.push("P95_LATENCY_EXCEEDED");
  }
  if (snapshot.weakEvidenceRate > thresholds.maxWeakEvidenceRate) {
    violations.push("WEAK_EVIDENCE_RATE_EXCEEDED");
  }

  let recommendation: CanaryRecommendation = "continue";
  if (violations.includes("SAMPLE_SIZE_TOO_LOW")) {
    recommendation = "pause";
  }
  if (
    violations.includes("ERROR_RATE_EXCEEDED") ||
    violations.includes("P95_LATENCY_EXCEEDED") ||
    violations.includes("WEAK_EVIDENCE_RATE_EXCEEDED")
  ) {
    recommendation = "rollback";
  }

  return {
    recommendation,
    violations,
    thresholds,
    snapshot,
  };
}
