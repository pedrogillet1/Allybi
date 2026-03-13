import { describe, expect, jest, test } from "@jest/globals";
import type { PrismaClient } from "@prisma/client";

import { TraceWriterService } from "./traceWriter.service";

function makePrismaMocks() {
  return {
    queryTelemetry: {
      upsert: jest.fn(),
    },
    retrievalEvent: {
      create: jest.fn(),
    },
    traceSpan: {
      createMany: jest.fn(),
    },
    bankUsageEvent: {
      createMany: jest.fn(),
    },
    queryKeyword: {
      createMany: jest.fn(),
    },
    queryEntity: {
      createMany: jest.fn(),
    },
  };
}

function buildTelemetryInput() {
  return {
    traceId: "tr_test_trace",
    userId: "user_test",
    queryText: "hello",
  };
}

describe("TraceWriterService", () => {
  test("keeps fail-open behavior by default when telemetry write fails", async () => {
    const prisma = makePrismaMocks();
    prisma.queryTelemetry.upsert.mockRejectedValue(new Error("db down"));

    const service = new TraceWriterService(prisma as unknown as PrismaClient, {
      enabled: true,
      strictWriteFailures: false,
    });

    await expect(
      service.upsertQueryTelemetry(buildTelemetryInput()),
    ).resolves.toBeUndefined();
    expect(prisma.queryTelemetry.upsert).toHaveBeenCalledTimes(1);
  });

  test("throws deterministic strict failure when strictWriteFailures=true", async () => {
    const prisma = makePrismaMocks();
    prisma.queryTelemetry.upsert.mockRejectedValue(new Error("db down"));

    const service = new TraceWriterService(prisma as unknown as PrismaClient, {
      enabled: true,
      strictWriteFailures: true,
    });

    await expect(
      service.upsertQueryTelemetry(buildTelemetryInput()),
    ).rejects.toMatchObject({
      message: expect.stringContaining("query telemetry upsert failed"),
      code: "TRACE_WRITER_STRICT_FAILURE",
    });
  });

  test("flush throws in strict mode when createMany fails", async () => {
    const prisma = makePrismaMocks();
    prisma.traceSpan.createMany.mockRejectedValue(new Error("insert failed"));
    prisma.bankUsageEvent.createMany.mockResolvedValue({ count: 0 });
    prisma.queryKeyword.createMany.mockResolvedValue({ count: 0 });
    prisma.queryEntity.createMany.mockResolvedValue({ count: 0 });

    const service = new TraceWriterService(prisma as unknown as PrismaClient, {
      enabled: true,
      strictWriteFailures: true,
      successSamplePercent: 100,
    });

    const spanId = service.startSpan("tr_flush", "compose");
    service.endSpan("tr_flush", spanId, { status: "ok" });

    await expect(
      service.flush("tr_flush", { status: "failed" }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("createMany failed"),
      code: "TRACE_WRITER_STRICT_FAILURE",
    });
  });

  test("persists latency metrics inside constraints and stream fields", async () => {
    const prisma = makePrismaMocks();
    prisma.queryTelemetry.upsert.mockResolvedValue({});

    const service = new TraceWriterService(prisma as unknown as PrismaClient, {
      enabled: true,
    });

    await service.upsertQueryTelemetry({
      ...buildTelemetryInput(),
      ackMs: 120,
      ttft: 640,
      firstUsefulContentMs: 1280,
      totalMs: 4200,
      streamStarted: true,
      firstTokenReceived: true,
      streamEnded: true,
      clientDisconnected: false,
      wasAborted: false,
      chunksSent: 11,
      streamDurationMs: 4100,
      sseErrors: ["timeout_recovered"],
    });

    expect(prisma.queryTelemetry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          ttft: 640,
          totalMs: 4200,
          streamStarted: true,
          firstTokenReceived: true,
          streamEnded: true,
          chunksSent: 11,
          streamDurationMs: 4100,
          sseErrors: ["timeout_recovered"],
          constraints: {
            latency: {
              ackMs: 120,
              firstUsefulContentMs: 1280,
            },
          },
        }),
      }),
    );
  });
});
