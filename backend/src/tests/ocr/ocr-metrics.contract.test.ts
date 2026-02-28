import { describe, expect, test } from "@jest/globals";

import { summarizeOcrEvents } from "../../services/admin/googleMetrics.service";

describe("OCR metrics contract", () => {
  test("aggregates attempt/apply/skip/error outcomes", () => {
    const summary = summarizeOcrEvents([
      {
        status: "ok",
        ocrUsed: true,
        ocrConfidence: 0.82,
        meta: { ocrAttempted: true, ocrOutcome: "applied" },
      },
      {
        status: "ok",
        ocrUsed: false,
        ocrConfidence: null,
        meta: { ocrAttempted: true, ocrOutcome: "no_text" },
      },
      {
        status: "ok",
        ocrUsed: false,
        ocrConfidence: null,
        meta: { ocrAttempted: false, ocrOutcome: "skipped_heuristic" },
      },
      {
        status: "ok",
        ocrUsed: false,
        ocrConfidence: null,
        meta: { ocrAttempted: true, ocrOutcome: "provider_unavailable" },
      },
      {
        status: "fail",
        ocrUsed: false,
        ocrConfidence: null,
        meta: { ocrAttempted: true, ocrOutcome: "runtime_error" },
      },
    ]);

    expect(summary.docsProcessed).toBe(5);
    expect(summary.ocrAttempted).toBe(4);
    expect(summary.ocrUsed).toBe(1);
    expect(summary.ocrAttemptRate).toBe(80);
    expect(summary.ocrAppliedRate).toBe(20);
    expect(summary.ocrSkipRate).toBe(40);
    expect(summary.ocrErrorRate).toBe(40);
    expect(summary.ocrCoverageRate).toBe(20);
    expect(summary.avgConfidence).toBe(82);
    expect(summary.failures).toBe(1);
  });

  test("falls back to ocrUsed when ocrAttempted meta flag is absent", () => {
    const summary = summarizeOcrEvents([
      {
        status: "ok",
        ocrUsed: true,
        ocrConfidence: 0.5,
        meta: { ocrOutcome: "applied" },
      },
      {
        status: "ok",
        ocrUsed: false,
        ocrConfidence: null,
        meta: { ocrOutcome: "not_attempted" },
      },
    ]);

    expect(summary.docsProcessed).toBe(2);
    expect(summary.ocrAttempted).toBe(1);
    expect(summary.ocrAttemptRate).toBe(50);
    expect(summary.ocrAppliedRate).toBe(50);
    expect(summary.avgConfidence).toBe(50);
    expect(summary.ocrSkipRate).toBe(0);
    expect(summary.ocrErrorRate).toBe(0);
  });
});
