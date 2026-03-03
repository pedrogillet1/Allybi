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
    if (bankId === "task_plan_generation") {
      return {
        templates: [
          {
            id: "planner_json_contract",
            outputMode: "machine_json",
            when: { operators: ["plan_edit", "plan_docx"] },
            messages: [{ role: "system", content: "Return JSON only." }],
          },
        ],
      };
    }
    if (bankId === "editing_task_prompts") {
      return {
        templates: [
          {
            id: "docx_line_rewrite",
            outputMode: "machine_json",
            when: { operators: ["docx_line_rewrite"] },
            messages: [{ role: "system", content: "Return JSON only." }],
          },
          {
            id: "docx_translate_single",
            when: { operators: ["docx_translate_single"] },
            outputMode: "user_text",
            messages: [{ role: "system", content: "Output only translated text." }],
          },
        ],
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

  test("user-facing promptTask keeps JSON disabled by default", async () => {
    const llmClient: LLMClient = {
      provider: "openai",
      complete: jest.fn(async () => ({
        traceId: "trace-2",
        turnId: "turn-2",
        model: { provider: "openai", model: "gpt-5-mini" },
        content: "ok",
      })),
      stream: jest.fn(async () => ({
        traceId: "trace-2",
        turnId: "turn-2",
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
        messages: [{ role: "system", content: "compose" }],
        options: { stream: false, maxOutputTokens: 256 },
        kodaMeta: {
          promptType: "tool",
          promptTrace: {
            orderedPrompts: [
              {
                bankId: "tool_prompts",
                version: "1.0.0",
                templateId: "rewrite_paragraph",
                hash: "h",
              },
            ],
          },
        },
      })),
    };
    const answerModeRouter: any = {
      decide: () => ({ answerMode: "action_receipt", reasonCodes: [] }),
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

    await gateway.generate({
      traceId: "trace-2",
      userId: "u1",
      conversationId: "c1",
      messages: [{ role: "user", content: "rewrite this paragraph" }],
      meta: {
        promptTask: "rewrite_paragraph",
        operator: "rewrite_paragraph",
      },
    });

    const buildInput = (builder.build as jest.Mock).mock.calls[0]?.[0];
    expect(buildInput?.signals?.disallowJsonOutput).toBe(true);
  });

  test("machine-json planner promptTask enables JSON output when declared by prompt bank", async () => {
    const llmClient: LLMClient = {
      provider: "openai",
      complete: jest.fn(async () => ({
        traceId: "trace-3",
        turnId: "turn-3",
        model: { provider: "openai", model: "gpt-5-mini" },
        content: "{\"plan\":[]}",
      })),
      stream: jest.fn(async () => ({
        traceId: "trace-3",
        turnId: "turn-3",
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
          promptType: "tool",
          promptTrace: {
            orderedPrompts: [
              {
                bankId: "task_plan_generation",
                version: "1.0.0",
                templateId: "planner_json_contract",
                hash: "h",
              },
            ],
          },
        },
      })),
    };
    const answerModeRouter: any = {
      decide: () => ({ answerMode: "action_receipt", reasonCodes: [] }),
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

    await gateway.generate({
      traceId: "trace-3",
      userId: "u1",
      conversationId: "c1",
      messages: [{ role: "user", content: "make a plan" }],
      meta: {
        promptTask: "plan_edit",
        operator: "plan_edit",
      },
    });

    const buildInput = (builder.build as jest.Mock).mock.calls[0]?.[0];
    expect(buildInput?.signals?.disallowJsonOutput).toBe(false);
  });

  test("non-machine-json editing promptTask keeps JSON disabled", async () => {
    const llmClient: LLMClient = {
      provider: "openai",
      complete: jest.fn(async () => ({
        traceId: "trace-4",
        turnId: "turn-4",
        model: { provider: "openai", model: "gpt-5-mini" },
        content: "ok",
      })),
      stream: jest.fn(async () => ({
        traceId: "trace-4",
        turnId: "turn-4",
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
        messages: [{ role: "system", content: "compose" }],
        options: { stream: false, maxOutputTokens: 256 },
        kodaMeta: {
          promptType: "tool",
          promptTrace: {
            orderedPrompts: [
              {
                bankId: "editing_task_prompts",
                version: "1.0.0",
                templateId: "docx_translate_single",
                hash: "h",
              },
            ],
          },
        },
      })),
    };
    const answerModeRouter: any = {
      decide: () => ({ answerMode: "action_receipt", reasonCodes: [] }),
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

    await gateway.generate({
      traceId: "trace-4",
      userId: "u1",
      conversationId: "c1",
      messages: [{ role: "user", content: "translate this line" }],
      meta: {
        promptTask: "docx_translate_single",
        operator: "docx_translate_single",
      },
    });

    const buildInput = (builder.build as jest.Mock).mock.calls[0]?.[0];
    expect(buildInput?.signals?.disallowJsonOutput).toBe(true);
  });

  test("executes routed provider/model instead of static gateway defaults", async () => {
    const openaiClient: LLMClient = {
      provider: "openai",
      complete: jest.fn(async () => ({
        traceId: "trace-5",
        turnId: "turn-5",
        model: { provider: "openai", model: "gpt-5-mini" },
        content: "openai",
      })),
      stream: jest.fn(async () => ({
        traceId: "trace-5",
        turnId: "turn-5",
        model: { provider: "openai", model: "gpt-5-mini" },
        finalText: "",
      })),
    };
    const googleClient: LLMClient = {
      provider: "google",
      complete: jest.fn(async () => ({
        traceId: "trace-5",
        turnId: "turn-5",
        model: { provider: "google", model: "gemini-2.5-flash" },
        content: "google",
      })),
      stream: jest.fn(async () => ({
        traceId: "trace-5",
        turnId: "turn-5",
        model: { provider: "google", model: "gemini-2.5-flash" },
        finalText: "",
      })),
    };
    const router: any = {
      route: jest.fn(() => ({
        provider: "gemini",
        model: "gemini-2.5-flash",
        reason: "fast_path",
        stage: "draft",
        constraints: {},
      })),
      listFallbackTargets: jest.fn(() => []),
    };
    const builder: any = {
      build: jest.fn((input: any) => ({
        route: input.route,
        messages: [{ role: "system", content: "compose" }],
        options: { stream: false, maxOutputTokens: 256 },
        kodaMeta: {
          promptType: "compose_answer",
          promptTrace: {
            orderedPrompts: [
              {
                bankId: "compose_prompt",
                version: "1.0.0",
                templateId: "compose_prompt:templates.en",
                hash: "h",
              },
            ],
          },
        },
      })),
    };

    const gateway = new LlmGatewayService(
      openaiClient,
      router,
      builder,
      {
        env: "local",
        provider: "openai",
        modelId: "gpt-5-mini",
      },
      {
        resolve(provider) {
          if (provider === "google") return googleClient;
          return null;
        },
      },
    );

    const out = await gateway.generate({
      traceId: "trace-5",
      userId: "u1",
      conversationId: "c1",
      messages: [{ role: "user", content: "hello" }],
    });

    expect((googleClient.complete as jest.Mock).mock.calls).toHaveLength(1);
    expect((openaiClient.complete as jest.Mock).mock.calls).toHaveLength(0);
    const req = (googleClient.complete as jest.Mock).mock.calls[0]?.[0];
    expect(req.model.provider).toBe("google");
    expect(req.model.model).toBe("gemini-2.5-flash");
    expect(out.telemetry?.provider).toBe("google");
    expect(out.telemetry?.model).toBe("gemini-2.5-flash");
  });

  test("falls back to next routed candidate when primary provider fails", async () => {
    const openaiClient: LLMClient = {
      provider: "openai",
      complete: jest.fn(async () => {
        throw new Error("openai down");
      }),
      stream: jest.fn(async () => ({
        traceId: "trace-6",
        turnId: "turn-6",
        model: { provider: "openai", model: "gpt-5.2" },
        finalText: "",
      })),
    };
    const googleClient: LLMClient = {
      provider: "google",
      complete: jest.fn(async () => ({
        traceId: "trace-6",
        turnId: "turn-6",
        model: { provider: "google", model: "gemini-2.5-flash" },
        content: "fallback-ok",
      })),
      stream: jest.fn(async () => ({
        traceId: "trace-6",
        turnId: "turn-6",
        model: { provider: "google", model: "gemini-2.5-flash" },
        finalText: "",
      })),
    };
    const router: any = {
      route: jest.fn(() => ({
        provider: "openai",
        model: "gpt-5.2",
        reason: "quality_finish",
        stage: "final",
        constraints: {},
      })),
      listFallbackTargets: jest.fn(() => [
        { provider: "gemini", model: "gemini-2.5-flash" },
      ]),
    };
    const builder: any = {
      build: jest.fn((input: any) => ({
        route: input.route,
        messages: [{ role: "system", content: "compose" }],
        options: { stream: false, maxOutputTokens: 256 },
        kodaMeta: {
          promptType: "compose_answer",
          promptTrace: {
            orderedPrompts: [
              {
                bankId: "compose_prompt",
                version: "1.0.0",
                templateId: "compose_prompt:templates.en",
                hash: "h",
              },
            ],
          },
        },
      })),
    };

    const gateway = new LlmGatewayService(
      openaiClient,
      router,
      builder,
      {
        env: "local",
        provider: "openai",
        modelId: "gpt-5-mini",
      },
      {
        resolve(provider) {
          if (provider === "google") return googleClient;
          return null;
        },
      },
    );

    const out = await gateway.generate({
      traceId: "trace-6",
      userId: "u1",
      conversationId: "c1",
      messages: [{ role: "user", content: "hello" }],
    });

    expect((openaiClient.complete as jest.Mock).mock.calls).toHaveLength(1);
    expect((googleClient.complete as jest.Mock).mock.calls).toHaveLength(1);
    expect(out.text).toBe("fallback-ok");
    expect(out.telemetry?.fallbackUsed).toBe(true);
    expect(out.telemetry?.executedProvider).toBe("google");
    expect(out.telemetry?.executedModel).toBe("gemini-2.5-flash");
    expect(out.telemetry?.attemptCount).toBe(2);
  });

  test("stream falls back when primary fails before emitting events", async () => {
    const openaiClient: LLMClient = {
      provider: "openai",
      complete: jest.fn(async () => ({
        traceId: "trace-7",
        turnId: "turn-7",
        model: { provider: "openai", model: "gpt-5.2" },
        content: "unused",
      })),
      stream: jest.fn(async () => {
        throw new Error("openai stream down");
      }),
    };
    const googleClient: LLMClient = {
      provider: "google",
      complete: jest.fn(async () => ({
        traceId: "trace-7",
        turnId: "turn-7",
        model: { provider: "google", model: "gemini-2.5-flash" },
        content: "unused",
      })),
      stream: jest.fn(async () => ({
        traceId: "trace-7",
        turnId: "turn-7",
        model: { provider: "google", model: "gemini-2.5-flash" },
        finalText: "stream-fallback-ok",
        finishReason: "stop",
      })),
    };
    const router: any = {
      route: jest.fn(() => ({
        provider: "openai",
        model: "gpt-5.2",
        reason: "quality_finish",
        stage: "final",
        constraints: { requireStreaming: true },
      })),
      listFallbackTargets: jest.fn(() => [
        { provider: "gemini", model: "gemini-2.5-flash" },
      ]),
    };
    const builder: any = {
      build: jest.fn((input: any) => ({
        route: input.route,
        messages: [{ role: "system", content: "compose" }],
        options: { stream: true, maxOutputTokens: 256 },
        kodaMeta: {
          promptType: "compose_answer",
          promptTrace: {
            orderedPrompts: [
              {
                bankId: "compose_prompt",
                version: "1.0.0",
                templateId: "compose_prompt:templates.en",
                hash: "h",
              },
            ],
          },
        },
      })),
    };

    const gateway = new LlmGatewayService(
      openaiClient,
      router,
      builder,
      {
        env: "local",
        provider: "openai",
        modelId: "gpt-5-mini",
      },
      {
        resolve(provider) {
          if (provider === "google") return googleClient;
          return null;
        },
      },
    );

    const sinkEvents: unknown[] = [];
    let sinkClosed = false;
    const out = await gateway.stream({
      traceId: "trace-7",
      userId: "u1",
      conversationId: "c1",
      messages: [{ role: "user", content: "hello stream" }],
      sink: {
        transport: "inproc",
        write(event) {
          sinkEvents.push(event);
        },
        close() {
          sinkClosed = true;
        },
        isOpen() {
          return !sinkClosed;
        },
      },
      streamingConfig: {
        markerHold: { enabled: true, flushAt: "final", maxBufferedMarkers: 16 },
      },
    });

    expect((openaiClient.stream as jest.Mock).mock.calls).toHaveLength(1);
    expect((googleClient.stream as jest.Mock).mock.calls).toHaveLength(1);
    expect(out.finalText).toBe("stream-fallback-ok");
    expect(out.telemetry?.fallbackUsed).toBe(true);
    expect(out.telemetry?.executedProvider).toBe("google");
    expect(out.telemetry?.attemptCount).toBe(2);
    expect(sinkEvents).toHaveLength(0);
  });

  test("stream does not retry after emitting any stream events", async () => {
    const openaiClient: LLMClient = {
      provider: "openai",
      complete: jest.fn(async () => ({
        traceId: "trace-8",
        turnId: "turn-8",
        model: { provider: "openai", model: "gpt-5.2" },
        content: "unused",
      })),
      stream: jest.fn(async ({ sink }) => {
        sink.write({
          event: "start",
          data: { kind: "answer", t: Date.now(), traceId: "trace-8" },
        });
        throw new Error("openai stream interrupted");
      }),
    };
    const googleClient: LLMClient = {
      provider: "google",
      complete: jest.fn(async () => ({
        traceId: "trace-8",
        turnId: "turn-8",
        model: { provider: "google", model: "gemini-2.5-flash" },
        content: "unused",
      })),
      stream: jest.fn(async () => ({
        traceId: "trace-8",
        turnId: "turn-8",
        model: { provider: "google", model: "gemini-2.5-flash" },
        finalText: "should-not-run",
      })),
    };
    const router: any = {
      route: jest.fn(() => ({
        provider: "openai",
        model: "gpt-5.2",
        reason: "quality_finish",
        stage: "final",
        constraints: { requireStreaming: true },
      })),
      listFallbackTargets: jest.fn(() => [
        { provider: "gemini", model: "gemini-2.5-flash" },
      ]),
    };
    const builder: any = {
      build: jest.fn((input: any) => ({
        route: input.route,
        messages: [{ role: "system", content: "compose" }],
        options: { stream: true, maxOutputTokens: 256 },
        kodaMeta: {
          promptType: "compose_answer",
          promptTrace: {
            orderedPrompts: [
              {
                bankId: "compose_prompt",
                version: "1.0.0",
                templateId: "compose_prompt:templates.en",
                hash: "h",
              },
            ],
          },
        },
      })),
    };

    const gateway = new LlmGatewayService(
      openaiClient,
      router,
      builder,
      {
        env: "local",
        provider: "openai",
        modelId: "gpt-5-mini",
      },
      {
        resolve(provider) {
          if (provider === "google") return googleClient;
          return null;
        },
      },
    );

    await expect(
      gateway.stream({
        traceId: "trace-8",
        userId: "u1",
        conversationId: "c1",
        messages: [{ role: "user", content: "hello stream" }],
        sink: {
          transport: "inproc",
          write() {},
          close() {},
          isOpen() {
            return true;
          },
        },
        streamingConfig: {
          markerHold: { enabled: true, flushAt: "final", maxBufferedMarkers: 16 },
        },
      }),
    ).rejects.toThrow("openai stream interrupted");
    expect((openaiClient.stream as jest.Mock).mock.calls).toHaveLength(1);
    expect((googleClient.stream as jest.Mock).mock.calls).toHaveLength(0);
  });
});
