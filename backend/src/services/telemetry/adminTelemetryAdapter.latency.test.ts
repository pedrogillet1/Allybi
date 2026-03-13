import { describe, expect, test } from "@jest/globals";

import { createAdminTelemetryAdapter } from "./adminTelemetryAdapter";

function buildPrismaMock(rows: any[]) {
  return {
    queryTelemetry: {
      findMany: async () => rows,
      findFirst: async ({ where }: any) =>
        rows.find((row) => row.queryId === where.queryId) || null,
    },
  } as any;
}

describe("adminTelemetryAdapter latency", () => {
  test("returns summary buckets and slow turns", async () => {
    const now = new Date();
    const rows = [
      {
        id: "1",
        queryId: "trace-fast-nav",
        queryText: "open the file",
        timestamp: now,
        answerMode: "nav_listing",
        operatorFamily: "open",
        distinctDocs: 0,
        retrievalAdequate: false,
        navOpenRequested: true,
        navWhereRequested: false,
        navDiscoverRequested: false,
        ttft: 280,
        retrievalMs: 0,
        llmMs: 140,
        formattingMs: 0,
        totalMs: 700,
        constraints: { latency: { ackMs: 90, firstUsefulContentMs: 420 } },
        streamStarted: true,
        firstTokenReceived: true,
        streamEnded: true,
        wasAborted: false,
        clientDisconnected: false,
        chunksSent: 4,
        hadFallback: false,
        fallbackScenario: null,
        totalTokens: 100,
        estimatedCostUsd: 0.001,
        isUseful: true,
        domain: "general",
        intent: "open",
        conversationId: "conv1",
        userId: "user1",
        model: "google-gemini",
      },
      {
        id: "2",
        queryId: "trace-slow-doc",
        queryText: "compare the two reports",
        timestamp: now,
        answerMode: "doc_grounded_compare",
        operatorFamily: "compare",
        distinctDocs: 2,
        retrievalAdequate: true,
        navOpenRequested: false,
        navWhereRequested: false,
        navDiscoverRequested: false,
        ttft: 3100,
        retrievalMs: 1600,
        llmMs: 7200,
        formattingMs: 300,
        totalMs: 15400,
        constraints: { latency: { ackMs: 180, firstUsefulContentMs: 4300 } },
        streamStarted: true,
        firstTokenReceived: true,
        streamEnded: true,
        wasAborted: false,
        clientDisconnected: false,
        chunksSent: 6,
        hadFallback: true,
        fallbackScenario: "THIN_RETRIEVAL",
        totalTokens: 600,
        estimatedCostUsd: 0.02,
        isUseful: true,
        domain: "documents",
        intent: "compare",
        conversationId: "conv2",
        userId: "user2",
        model: "openai-gpt",
      },
    ];

    const adapter = createAdminTelemetryAdapter(buildPrismaMock(rows));
    const result = await adapter.latency({ range: "7d", limit: 20 });

    expect(result.summary.count).toBe(2);
    expect(result.buckets.navigation.count).toBe(1);
    expect(result.buckets.multi_doc.count).toBe(1);
    expect(result.slowest[0].traceId).toBe("trace-slow-doc");
  });
});
