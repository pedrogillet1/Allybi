import { describe, expect, test } from "@jest/globals";

import {
  assessCanaryHealth,
  normalizeCanaryThresholds,
} from "./canaryHealthCheck.service";

describe("canaryHealthCheck.service", () => {
  test("normalizes missing thresholds to safe defaults", () => {
    const out = normalizeCanaryThresholds({});
    expect(out.minSampleSize).toBe(20);
    expect(out.maxErrorRate).toBe(0.02);
    expect(out.maxP95LatencyMs).toBe(12000);
    expect(out.maxWeakEvidenceRate).toBe(0.15);
  });

  test("returns continue when canary metrics are healthy", () => {
    const out = assessCanaryHealth(
      {
        sampleSize: 80,
        errorRate: 0.01,
        p95LatencyMs: 4000,
        weakEvidenceRate: 0.05,
      },
      {
        minSampleSize: 20,
        maxErrorRate: 0.02,
        maxP95LatencyMs: 12000,
        maxWeakEvidenceRate: 0.15,
      },
    );
    expect(out.recommendation).toBe("continue");
    expect(out.violations).toEqual([]);
  });

  test("returns pause when sample size is too low", () => {
    const out = assessCanaryHealth(
      {
        sampleSize: 3,
        errorRate: 0,
        p95LatencyMs: 1000,
        weakEvidenceRate: 0,
      },
      {
        minSampleSize: 20,
        maxErrorRate: 0.02,
        maxP95LatencyMs: 12000,
        maxWeakEvidenceRate: 0.15,
      },
    );
    expect(out.recommendation).toBe("pause");
    expect(out.violations).toContain("SAMPLE_SIZE_TOO_LOW");
  });

  test("returns rollback when canary breaches quality or latency thresholds", () => {
    const out = assessCanaryHealth(
      {
        sampleSize: 200,
        errorRate: 0.05,
        p95LatencyMs: 15000,
        weakEvidenceRate: 0.21,
      },
      {
        minSampleSize: 20,
        maxErrorRate: 0.02,
        maxP95LatencyMs: 12000,
        maxWeakEvidenceRate: 0.15,
      },
    );
    expect(out.recommendation).toBe("rollback");
    expect(out.violations).toContain("ERROR_RATE_EXCEEDED");
    expect(out.violations).toContain("P95_LATENCY_EXCEEDED");
    expect(out.violations).toContain("WEAK_EVIDENCE_RATE_EXCEEDED");
  });
});
