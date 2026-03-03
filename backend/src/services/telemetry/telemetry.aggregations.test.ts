import { describe, expect, test, jest } from "@jest/globals";
import type { PrismaClient } from "@prisma/client";

import { TelemetryAggregations } from "./telemetry.aggregations";

type MockModel = {
  count: jest.Mock<(...args: unknown[]) => Promise<number>>;
  findMany: jest.Mock<(...args: unknown[]) => Promise<Record<string, unknown>[]>>;
  findFirst: jest.Mock<
    (...args: unknown[]) => Promise<Record<string, unknown> | null>
  >;
  aggregate: jest.Mock<
    (...args: unknown[]) => Promise<{ _sum?: Record<string, unknown> }>
  >;
  countDistinct: jest.Mock<(...args: unknown[]) => Promise<number>>;
};

function createMockModel(): MockModel {
  return {
    count: jest.fn(async () => 0),
    findMany: jest.fn(async () => []),
    findFirst: jest.fn(async () => null),
    aggregate: jest.fn(async () => ({ _sum: {} })),
    countDistinct: jest.fn(async () => 0),
  };
}

function createAggregationsMock(params?: {
  usage?: Partial<MockModel>;
  modelCall?: Partial<MockModel>;
  retrieval?: Partial<MockModel>;
  ingestion?: Partial<MockModel>;
}): TelemetryAggregations {
  const usageEvent = { ...createMockModel(), ...(params?.usage || {}) };
  const modelCall = { ...createMockModel(), ...(params?.modelCall || {}) };
  const retrievalEvent = { ...createMockModel(), ...(params?.retrieval || {}) };
  const ingestionEvent = { ...createMockModel(), ...(params?.ingestion || {}) };

  const prisma = {
    usageEvent,
    modelCall,
    retrievalEvent,
    ingestionEvent,
  } as unknown as PrismaClient;

  return new TelemetryAggregations(prisma);
}

describe("TelemetryAggregations", () => {
  test("overview computes deterministic usage, quality, llm, and ingestion metrics", async () => {
    const service = createAggregationsMock({
      usage: {
        countDistinct: jest.fn(async () => 4),
        count: jest.fn(async ({ where }: { where?: Record<string, unknown> }) => {
          const eventType = String(where?.eventType || "");
          if (eventType === "CHAT_MESSAGE_SENT") return 11;
          if (eventType === "CONVERSATION_CREATED") return 3;
          if (eventType === "DOCUMENT_UPLOADED") return 5;
          return 0;
        }),
      },
      modelCall: {
        count: jest.fn(async ({ where }: { where?: Record<string, unknown> }) => {
          return where?.status === "fail" ? 2 : 10;
        }),
        aggregate: jest.fn(async () => ({ _sum: { totalTokens: 4200 } })),
        findMany: jest.fn(async () => [
          { durationMs: 100 },
          { durationMs: 200 },
          { durationMs: 600 },
        ]),
      },
      retrieval: {
        count: jest.fn(async ({ where }: { where?: Record<string, unknown> }) => {
          if (!where?.OR) return 8;
          const serialized = JSON.stringify(where.OR);
          if (serialized.includes("WEAK_EVIDENCE")) return 2;
          if (serialized.includes("NO_EVIDENCE")) return 1;
          return 0;
        }),
      },
      ingestion: {
        count: jest.fn(async () => 3),
      },
    });

    const result = await service.overview("7d");

    expect(result.dau).toBe(4);
    expect(result.messages).toBe(11);
    expect(result.uploads).toBe(5);
    expect(result.llmCalls).toBe(10);
    expect(result.tokensTotal).toBe(4200);
    expect(result.llmErrorRate).toBeCloseTo(0.2, 6);
    expect(result.weakEvidenceRate).toBeCloseTo(0.25, 6);
    expect(result.noEvidenceRate).toBeCloseTo(0.125, 6);
    expect(result.ingestionFailures).toBe(3);
    expect(result.latencyMsP50).not.toBeNull();
    expect(result.latencyMsP95).not.toBeNull();
  });

  test("queries applies domain filter and maps rows with stable pagination cursor", async () => {
    const retrievalFindMany = jest.fn(async () => [
      {
        id: "evt-2",
        at: new Date("2026-03-01T10:00:00.000Z"),
        userId: "u-2",
        intent: "documents",
        operator: "extract",
        domain: "finance",
        docLockEnabled: true,
        strategy: "semantic",
        evidenceStrength: 0.7,
        refined: false,
        fallbackReasonCode: null,
        sourcesCount: 2,
        navPillsUsed: false,
        traceId: "tr-2",
        turnId: "turn-2",
        conversationId: "conv-2",
      },
      {
        id: "evt-1",
        at: new Date("2026-03-01T09:00:00.000Z"),
        userId: "u-1",
        intent: "documents",
        operator: "extract",
        domain: "finance",
        docLockEnabled: false,
        strategy: "structural",
        evidenceStrength: 0.3,
        refined: true,
        fallbackReasonCode: "WEAK_EVIDENCE",
        sourcesCount: 1,
        navPillsUsed: true,
        traceId: "tr-1",
        turnId: "turn-1",
        conversationId: "conv-1",
      },
    ]);

    const service = createAggregationsMock({
      retrieval: {
        findMany: retrievalFindMany,
      },
    });

    const result = await service.queries({ range: "7d", limit: 1, domain: "finance" });

    expect(retrievalFindMany).toHaveBeenCalledTimes(1);
    const queryArgs = retrievalFindMany.mock.calls[0]?.[0] as {
      where?: Record<string, unknown>;
    };
    expect(queryArgs.where?.domain).toBe("finance");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].traceId).toBe("tr-2");
    expect(result.nextCursor).toBe("evt-1");
  });
});
