import { describe, expect, test } from "@jest/globals";

import { summarizeIngestionLatencyByMimeSize } from "../../services/admin/googleMetrics.service";

describe("ingestion slo metrics contract", () => {
  test("aggregates p95 latency by mime + size bucket", () => {
    const summary = summarizeIngestionLatencyByMimeSize([
      {
        status: "ok",
        mimeType: "application/pdf",
        durationMs: 1200,
        meta: { sizeBucket: "1_to_10mb", peakRssMb: 820 },
      },
      {
        status: "ok",
        mimeType: "application/pdf",
        durationMs: 2100,
        meta: { sizeBucket: "1_to_10mb", peakRssMb: 910 },
      },
      {
        status: "fail",
        mimeType: "application/pdf",
        durationMs: 1800,
        meta: { sizeBucket: "1_to_10mb", peakRssMb: 970 },
      },
      {
        status: "ok",
        mimeType: "image/png",
        durationMs: 900,
        meta: { sizeBucket: "lt_1mb", peakRssMb: 350 },
      },
    ]);

    expect(summary.docsProcessed).toBe(4);
    expect(summary.p95LatencyMs).toBeGreaterThan(0);
    expect(summary.p95PeakRssMb).toBeGreaterThan(0);

    const pdfBucket = summary.byMimeSize.find(
      (entry) =>
        entry.mimeType === "application/pdf" &&
        entry.sizeBucket === "1_to_10mb",
    );
    expect(pdfBucket).toBeDefined();
    expect(pdfBucket!.count).toBe(3);
    expect(pdfBucket!.failureRate).toBeCloseTo(33.33, 1);
    expect(pdfBucket!.p95LatencyMs).toBeGreaterThanOrEqual(1800);
    expect(pdfBucket!.p95PeakRssMb).toBeGreaterThanOrEqual(910);
  });
});
