import { describe, expect, jest, test } from "@jest/globals";

import { LLMChatEngine } from "./llmChatEngine";

describe("LLMChatEngine retrieval planner delegation", () => {
  test("generateRetrievalPlan delegates to gateway retrieval-plan producer", async () => {
    const gateway: any = {
      generate: jest.fn(),
      stream: jest.fn(),
      generateRetrievalPlan: jest.fn(async () => ({
        text: '{"schemaVersion":"koda_retrieval_plan_v1","queryVariants":["revenue"]}',
        telemetry: { finishReason: "stop" },
      })),
    };

    const engine = new LLMChatEngine(gateway, {
      provider: "openai",
      modelId: "gpt-5.2",
    });

    const out = await engine.generateRetrievalPlan({
      traceId: "tr-1",
      userId: "user-1",
      conversationId: "conv-1",
      messages: [{ role: "user", content: "find revenue trends" }],
      meta: { operator: "extract" },
    });

    expect(gateway.generateRetrievalPlan).toHaveBeenCalledTimes(1);
    expect(gateway.generateRetrievalPlan).toHaveBeenCalledWith({
      traceId: "tr-1",
      userId: "user-1",
      conversationId: "conv-1",
      messages: [{ role: "user", content: "find revenue trends" }],
      evidencePack: undefined,
      context: undefined,
      meta: { operator: "extract" },
    });
    expect(out.text).toContain("schemaVersion");
    expect((out.telemetry as any)?.provider).toBe("openai");
    expect((out.telemetry as any)?.model).toBe("gpt-5.2");
  });
});
