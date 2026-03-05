import { describe, expect, test } from "@jest/globals";

import { createAdminTelemetryAdapter } from "./adminTelemetryAdapter";

describe("adminTelemetryAdapter evidence strength mapping", () => {
  test("queries endpoint prefers topRelevanceScore and clamps it to [0,1]", async () => {
    const prisma = {
      queryTelemetry: {
        findMany: async () => [
          {
            id: "q1",
            queryId: "tr_1",
            queryText: "first",
            userId: "user_1",
            conversationId: "c1",
            intent: "answer",
            domain: "finance",
            timestamp: new Date("2026-03-05T18:00:00.000Z"),
            totalMs: 1000,
            retrievalMs: 250,
            llmMs: 600,
            totalTokens: 400,
            estimatedCostUsd: 0.01,
            isUseful: true,
            hadFallback: false,
            topRelevanceScore: 1.4,
            retrievalAdequate: false,
            distinctDocs: 2,
            evidenceGateAction: "answer",
            model: "openai-gpt",
            fallbackScenario: null,
          },
          {
            id: "q2",
            queryId: "tr_2",
            queryText: "second",
            userId: "user_2",
            conversationId: "c2",
            intent: "answer",
            domain: "finance",
            timestamp: new Date("2026-03-05T18:10:00.000Z"),
            totalMs: 900,
            retrievalMs: 220,
            llmMs: 520,
            totalTokens: 350,
            estimatedCostUsd: 0.02,
            isUseful: true,
            hadFallback: false,
            topRelevanceScore: null,
            retrievalAdequate: true,
            distinctDocs: 1,
            evidenceGateAction: "answer",
            model: "openai-gpt",
            fallbackScenario: null,
          },
        ],
      },
    } as any;

    const adapter = createAdminTelemetryAdapter(prisma);
    const out = await adapter.queries({ range: "7d", limit: 10 });

    expect(out.items[0].evidenceStrength).toBe(1);
    expect(out.items[1].evidenceStrength).toBe(0.85);
  });

  test("quality endpoint uses same evidence strength fallback as queries", async () => {
    const prisma = {
      queryTelemetry: {
        findMany: async () => [
          {
            id: "qa",
            queryId: "tr_qa",
            queryText: "a",
            userId: "user_a",
            timestamp: new Date("2026-03-05T18:20:00.000Z"),
            isUseful: true,
            hadFallback: false,
            failureCategory: null,
            citationCount: 1,
            answerLength: 100,
            topRelevanceScore: 0.73,
            retrievalAdequate: false,
          },
          {
            id: "qb",
            queryId: "tr_qb",
            queryText: "b",
            userId: "user_b",
            timestamp: new Date("2026-03-05T18:25:00.000Z"),
            isUseful: false,
            hadFallback: true,
            failureCategory: "missing_provenance",
            citationCount: 0,
            answerLength: 40,
            topRelevanceScore: null,
            retrievalAdequate: false,
          },
        ],
      },
    } as any;

    const adapter = createAdminTelemetryAdapter(prisma);
    const out = await adapter.quality({ range: "7d", limit: 10 });

    expect(out.items[0].evidenceStrength).toBe(0.73);
    expect(out.items[1].evidenceStrength).toBe(0.4);
  });
});

