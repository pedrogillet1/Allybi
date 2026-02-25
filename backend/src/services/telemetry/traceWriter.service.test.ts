import { TraceWriterService } from "./traceWriter.service";

function createPrismaMocks() {
  return {
    traceSpan: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    bankUsageEvent: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    queryKeyword: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    queryEntity: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    queryTelemetry: { upsert: jest.fn().mockResolvedValue({}) },
    retrievalEvent: { create: jest.fn().mockResolvedValue({}) },
  };
}

describe("TraceWriterService", () => {
  it("persists buffered trace artifacts when sampled", async () => {
    const prisma = createPrismaMocks();
    const service = new TraceWriterService(prisma as any, {
      successSamplePercent: 100,
    });
    const traceId = "tr_trace_writer_success";

    const spanId = service.startSpan(traceId, "retrieval");
    service.endSpan(traceId, spanId, { status: "ok" });
    service.recordBankUsage({
      traceId,
      bankType: "policy_bank",
      bankId: "memory_policy",
      stageUsed: "retrieval",
    });
    service.recordKeywords(traceId, ["revenue", "forecast"]);
    service.recordEntities(traceId, [
      { type: "year", value: "2025", confidence: 0.8 },
    ]);

    const persisted = await service.flush(traceId, { status: "success" });

    expect(persisted).toBe(true);
    expect(prisma.traceSpan.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.bankUsageEvent.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.queryKeyword.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.queryEntity.createMany).toHaveBeenCalledTimes(1);
  });

  it("skips successful traces when sample percent is zero", async () => {
    const prisma = createPrismaMocks();
    const service = new TraceWriterService(prisma as any, {
      successSamplePercent: 0,
    });
    const traceId = "tr_trace_writer_unsampled";

    const spanId = service.startSpan(traceId, "compose");
    service.endSpan(traceId, spanId, { status: "ok" });

    const persisted = await service.flush(traceId, { status: "success" });

    expect(persisted).toBe(false);
    expect(prisma.traceSpan.createMany).not.toHaveBeenCalled();
  });

  it("always persists failed traces even when success sampling is disabled", async () => {
    const prisma = createPrismaMocks();
    const service = new TraceWriterService(prisma as any, {
      successSamplePercent: 0,
    });
    const traceId = "tr_trace_writer_failure";

    const spanId = service.startSpan(traceId, "compose");
    service.endSpan(traceId, spanId, { status: "error", errorCode: "E_TEST" });

    const persisted = await service.flush(traceId, { status: "failed" });

    expect(persisted).toBe(true);
    expect(prisma.traceSpan.createMany).toHaveBeenCalledTimes(1);
  });

  it("is fail-open when query telemetry and retrieval writes throw", async () => {
    const prisma = createPrismaMocks();
    prisma.queryTelemetry.upsert.mockRejectedValue(new Error("db-down"));
    prisma.retrievalEvent.create.mockRejectedValue(new Error("db-down"));
    const service = new TraceWriterService(prisma as any, {
      successSamplePercent: 100,
    });

    await expect(
      service.upsertQueryTelemetry({
        traceId: "tr_fail_open",
        userId: "u1",
        intent: "documents",
      }),
    ).resolves.toBeUndefined();
    await expect(
      service.writeRetrievalEvent({
        traceId: "tr_fail_open",
        userId: "u1",
        intent: "documents",
      }),
    ).resolves.toBeUndefined();
  });
});
