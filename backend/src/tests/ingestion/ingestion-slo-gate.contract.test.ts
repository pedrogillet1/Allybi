import {
  evaluateIngestionSlo,
  summarizeIngestionLatencyByMimeSize,
} from "../../services/admin/googleMetrics.service";

describe("ingestion SLO gate contract", () => {
  test("passes when global and bucket thresholds are satisfied", () => {
    const summary = summarizeIngestionLatencyByMimeSize([
      {
        status: "ok",
        mimeType: "application/pdf",
        durationMs: 1200,
        meta: { sizeBucket: "1_to_10mb", peakRssMb: 760 },
      },
      {
        status: "ok",
        mimeType: "application/pdf",
        durationMs: 1500,
        meta: { sizeBucket: "1_to_10mb", peakRssMb: 810 },
      },
      {
        status: "ok",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        durationMs: 800,
        meta: { sizeBucket: "lt_1mb", peakRssMb: 420 },
      },
    ]);

    const result = evaluateIngestionSlo(summary, {
      minDocsProcessed: 3,
      maxGlobalP95LatencyMs: 2000,
      maxGlobalFailureRatePct: 5,
      maxGlobalP95PeakRssMb: 1000,
      maxBucketP95LatencyMsByKey: {
        "application/pdf||1_to_10mb": 2000,
      },
      maxBucketFailureRatePctByKey: {
        "application/pdf||1_to_10mb": 10,
      },
    });

    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
  });

  test("fails on global p95 and bucket failure-rate breaches", () => {
    const summary = summarizeIngestionLatencyByMimeSize([
      {
        status: "ok",
        mimeType: "application/pdf",
        durationMs: 3200,
        meta: { sizeBucket: "1_to_10mb", peakRssMb: 1000 },
      },
      {
        status: "fail",
        mimeType: "application/pdf",
        durationMs: 3400,
        meta: { sizeBucket: "1_to_10mb", peakRssMb: 1200 },
      },
      {
        status: "ok",
        mimeType: "application/pdf",
        durationMs: 3600,
        meta: { sizeBucket: "1_to_10mb", peakRssMb: 1600 },
      },
    ]);

    const result = evaluateIngestionSlo(summary, {
      minDocsProcessed: 3,
      maxGlobalP95LatencyMs: 2000,
      maxGlobalFailureRatePct: 10,
      maxGlobalP95PeakRssMb: 1500,
      maxBucketFailureRatePctByKey: {
        "application/pdf||1_to_10mb": 20,
      },
    });

    expect(result.passed).toBe(false);
    expect(result.failures.join(" | ")).toContain("GLOBAL_P95_EXCEEDED");
    expect(result.failures.join(" | ")).toContain(
      "BUCKET_FAILURE_RATE_EXCEEDED:application/pdf||1_to_10mb",
    );
    expect(result.failures.join(" | ")).toContain(
      "GLOBAL_P95_PEAK_RSS_EXCEEDED",
    );
  });
});
