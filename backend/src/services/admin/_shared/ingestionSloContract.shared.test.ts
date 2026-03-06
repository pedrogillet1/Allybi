const {
  isIngestionFailureStatus,
  summarizeIngestionSloEvents,
} = require("../ingestionSloContract.shared.js");

describe("ingestionSloContract.shared", () => {
  test("treats queue and *_fail statuses as failures", () => {
    expect(isIngestionFailureStatus("fail")).toBe(true);
    expect(isIngestionFailureStatus("queue_fail")).toBe(true);
    expect(isIngestionFailureStatus("runtime_fail")).toBe(true);
    expect(isIngestionFailureStatus("ok")).toBe(false);
    expect(isIngestionFailureStatus("skipped")).toBe(false);
  });

  test("includes queue_fail and *_fail in bucket failure rate", () => {
    const summary = summarizeIngestionSloEvents([
      {
        status: "ok",
        mimeType: "application/pdf",
        durationMs: 1200,
        meta: { sizeBucket: "1_to_10mb", peakRssMb: 512 },
      },
      {
        status: "queue_fail",
        mimeType: "application/pdf",
        durationMs: 1500,
        meta: { sizeBucket: "1_to_10mb", peakRssMb: 640 },
      },
      {
        status: "runtime_fail",
        mimeType: "application/pdf",
        durationMs: 1800,
        meta: { sizeBucket: "1_to_10mb", peakRssMb: 768 },
      },
      {
        status: "skipped",
        mimeType: "application/pdf",
        durationMs: 900,
        meta: { sizeBucket: "1_to_10mb", peakRssMb: 384 },
      },
    ]);

    expect(summary.docsProcessed).toBe(4);
    expect(summary.byMimeSize).toHaveLength(1);
    expect(summary.byMimeSize[0].failureRate).toBe(50);
  });
});
