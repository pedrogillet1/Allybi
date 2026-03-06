describe("ingestion-slo-cert-gate script helpers", () => {
  const mod = require("../../services/admin/ingestionSloCertGatePolicy.shared.js");

  test("collectEventsPaginated reads all pages without 100k hard cap", async () => {

    const page1 = [
      {
        id: 1,
        at: new Date("2026-03-05T00:00:01.000Z"),
        status: "ok",
        mimeType: "application/pdf",
        durationMs: 100,
        meta: { sizeBucket: "lt_1mb" },
      },
      {
        id: 2,
        at: new Date("2026-03-05T00:00:02.000Z"),
        status: "ok",
        mimeType: "application/pdf",
        durationMs: 110,
        meta: { sizeBucket: "lt_1mb" },
      },
    ];
    const page2 = [
      {
        id: 3,
        at: new Date("2026-03-05T00:00:03.000Z"),
        status: "fail",
        mimeType: "application/pdf",
        durationMs: 120,
        meta: { sizeBucket: "lt_1mb" },
      },
    ];

    const findMany = jest
      .fn()
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2)
      .mockResolvedValueOnce([]);
    const prisma = { ingestionEvent: { findMany } } as any;

    const out = await mod.collectEventsPaginated({
      prisma,
      from: new Date("2026-03-05T00:00:00.000Z"),
      to: new Date("2026-03-05T01:00:00.000Z"),
      pageSize: 2,
    });

    expect(out.capped).toBe(false);
    expect(out.pagesFetched).toBe(2);
    expect(out.events).toHaveLength(3);
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany.mock.calls[1]?.[0]?.where?.OR).toBeDefined();
  });

  test("evaluateEvidenceCompliance blocks non-live evidence in required mode", () => {
    const result = mod.evaluateEvidenceCompliance({
      required: true,
      evidenceMode: "hermetic_override",
      collectionCapped: false,
    });

    expect(result.failures).toContain(
      "NON_LIVE_EVIDENCE_NOT_ALLOWED_IN_REQUIRED_MODE",
    );
  });
});
