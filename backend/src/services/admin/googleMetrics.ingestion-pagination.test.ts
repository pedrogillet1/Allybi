import { getIngestionSloMetricsForWindow } from "./googleMetrics.service";

describe("googleMetrics ingestion pagination", () => {
  test("collects ingestion events across multiple pages", async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 1,
          at: new Date("2026-03-05T00:00:01.000Z"),
          status: "ok",
          mimeType: "application/pdf",
          durationMs: 1000,
          meta: { sizeBucket: "1_to_10mb", peakRssMb: 500 },
        },
        {
          id: 2,
          at: new Date("2026-03-05T00:00:02.000Z"),
          status: "fail",
          mimeType: "application/pdf",
          durationMs: 1200,
          meta: { sizeBucket: "1_to_10mb", peakRssMb: 650 },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 3,
          at: new Date("2026-03-05T00:00:03.000Z"),
          status: "ok",
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          durationMs: 900,
          meta: { sizeBucket: "lt_1mb", peakRssMb: 320 },
        },
      ])
      .mockResolvedValueOnce([]);

    const prisma = {
      ingestionEvent: { findMany },
    } as any;

    const out = await getIngestionSloMetricsForWindow(prisma, {
      from: new Date("2026-03-05T00:00:00.000Z"),
      to: new Date("2026-03-05T01:00:00.000Z"),
    }, { pageSize: 2 });

    expect(findMany).toHaveBeenCalledTimes(2);
    expect(out.pagesFetched).toBe(2);
    expect(out.metrics.docsProcessed).toBe(3);
    expect(out.metrics.byMimeSize.length).toBeGreaterThanOrEqual(2);
  });
});
