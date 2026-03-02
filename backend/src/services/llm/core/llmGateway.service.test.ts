import { describe, expect, jest, test } from "@jest/globals";
import type { LLMClient } from "./llmClient.interface";
import { LlmGatewayService, type LlmGatewayRequest } from "./llmGateway.service";

jest.mock("../../core/banks/bankLoader.service", () => ({
  getOptionalBank: jest.fn((bankId: string) => {
    if (bankId === "memory_policy") {
      return {
        config: {
          runtimeTuning: {
            gateway: {
              userTextCharCap: 8000,
              systemBlockCharCap: 4000,
              dialogueTurnLimit: 10,
              dialogueMessageCharCap: 1200,
              dialogueCharBudget: 6000,
              memoryPackCharCap: 8000,
            },
          },
        },
      };
    }
    return null;
  }),
}));

jest.mock("../../chat/productHelp.service", () => ({
  getProductHelpService: () => ({
    resolve: () => null,
  }),
}));

describe("LlmGatewayService retrieval-plan producer", () => {
  test("generateRetrievalPlan enforces retrieval prompt mode and purpose", async () => {
    const llmClient: LLMClient = {
      provider: "openai",
      complete: jest.fn(async () => ({
        traceId: "trace-1",
        turnId: "turn-1",
        model: { provider: "openai", model: "gpt-5-mini" },
        content: "queryVariants:\n- revenue",
      })),
      stream: jest.fn(async () => ({
        traceId: "trace-1",
        turnId: "turn-1",
        model: { provider: "openai", model: "gpt-5-mini" },
        finalText: "",
      })),
    };

    const router: any = {
      route: jest.fn(() => ({
        provider: "openai",
        model: "gpt-5-mini",
        reason: "quality_finish",
        stage: "final",
        constraints: {},
      })),
    };

    const builder: any = {
      build: jest.fn((input: any) => ({
        route: input.route,
        messages: [{ role: "system", content: "planner" }],
        options: { stream: false, maxOutputTokens: 256 },
        kodaMeta: {
          promptType:
            input?.signals?.promptMode === "retrieval_plan"
              ? "retrieval"
              : "compose_answer",
          promptTrace: {
            orderedPrompts: [
              {
                bankId: "retrieval_prompt",
                version: "1.0.0",
                templateId: "retrieval_prompt:templates.en",
                hash: "h",
              },
            ],
          },
        },
      })),
    };

    const answerModeRouter: any = {
      decide: () => ({ answerMode: "doc_grounded_single", reasonCodes: [] }),
    };

    const gateway = new LlmGatewayService(
      llmClient,
      router,
      builder,
      {
        env: "local",
        provider: "openai",
        modelId: "gpt-5-mini",
      },
      answerModeRouter,
    );

    const req: LlmGatewayRequest = {
      traceId: "trace-1",
      userId: "u1",
      conversationId: "c1",
      messages: [{ role: "user", content: "find revenue doc" }],
      meta: { operator: "locate_docs", intentFamily: "retrieval" },
    };

    await gateway.generateRetrievalPlan(req);

    const buildInput = (builder.build as jest.Mock).mock.calls[0]?.[0];
    expect(buildInput?.signals?.promptMode).toBe("retrieval_plan");
    expect(buildInput?.signals?.retrievalPlanning).toBe(true);
    expect(buildInput?.signals?.disallowJsonOutput).toBe(false);

    const llmReq = (llmClient.complete as jest.Mock).mock.calls[0]?.[0];
    expect(llmReq?.purpose).toBe("retrieval_planning");
  });
});
