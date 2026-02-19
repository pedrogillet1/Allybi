/**
 * openaiAdapter.test.ts
 *
 * Jest tests for the OpenAI prompt/tool/stream adapter layer.
 *
 * These tests are intentionally “contract-focused”:
 * - Deterministic role mapping
 * - Deterministic tool declaration ordering
 * - Strict JSON serialization for tool call arguments
 * - Safe parsing of tool calls and assistant text
 *
 * NOTE:
 * This test assumes you have an adapter with the following surface:
 *   - toOpenAIRequest(req: LLMRequest): OpenAIRequestPayload
 *   - parseOpenAIResponse(resp: any): { text: string; toolCalls: ProviderToolCall[]; usage?: ... }
 *   - buildTools(registry?: ToolRegistry): any[] | null
 *
 * If your adapter method names differ, rename imports accordingly.
 */

import { describe, expect, test } from "@jest/globals";

// Adjust this import to your actual adapter path/name.
import { OpenAIPromptAdapterService } from "../src/services/llm/openai/openaiPromptAdapter.service";

import type {
  LLMRequest,
  LLMMessage,
} from "../src/services/llm/llmClient.interface";
import type { ToolRegistry } from "../src/services/llm/llmTools.types";

function mkReq(partial: Partial<LLMRequest> = {}): LLMRequest {
  const messages: LLMMessage[] = partial.messages ?? [
    { role: "system", content: "SYSTEM" },
    { role: "developer", content: "DEVELOPER" },
    { role: "user", content: "Hello" },
  ];

  return {
    traceId: partial.traceId ?? "trace_1",
    turnId: partial.turnId ?? "turn_1",
    model: partial.model ?? { provider: "openai", model: "gpt-5.2" },
    messages,
    tools: partial.tools,
    sampling: partial.sampling,
    constraints: partial.constraints,
    purpose: partial.purpose,
    meta: partial.meta,
  };
}

function mkToolRegistry(): ToolRegistry {
  return {
    tools: [
      {
        id: "DOC_SEARCH",
        name: "doc_search",
        category: "retrieval",
        description: "Search indexed docs",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["query"],
          properties: { query: { type: "string" } },
        },
        outputSchema: { type: "object" },
        inputType: "json",
        outputType: "json",
        policy: {
          enabled: true,
          maxCallsPerTurn: 5,
          timeoutMs: 5000,
          allowedUnderDocLock: true,
          discoveryException: true,
          requiresMasking: false,
        },
        version: "1.0.0",
      },
      {
        id: "DOC_OPEN",
        name: "doc_open",
        category: "documents",
        description: "Open a doc",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["docId"],
          properties: { docId: { type: "string" } },
        },
        outputSchema: { type: "object" },
        inputType: "json",
        outputType: "json",
        policy: {
          enabled: true,
          maxCallsPerTurn: 3,
          timeoutMs: 5000,
          allowedUnderDocLock: true,
          discoveryException: false,
          requiresMasking: false,
        },
        version: "1.0.0",
      },
    ],
    provider: "openai",
  };
}

describe("OpenAI Adapter", () => {
  const adapter = new OpenAIPromptAdapterService({
    foldSystemAndDeveloperIntoSystem: true,
    toolDeclarationOrder: "alpha",
    deterministicToolCallIds: true,
    toolCallIdSalt: "test_salt",
    dropEmptyMessages: true,
    maxRequestBytes: 1_000_000,
  });

  test("maps roles deterministically (system+developer folded into system)", () => {
    const req = mkReq({
      messages: [
        { role: "system", content: "SYS" },
        { role: "developer", content: "DEV" },
        { role: "user", content: "U1" },
        { role: "assistant", content: "A1" },
      ],
    });

    const out = adapter.toOpenAIRequest(req);

    // Expect first message role is system and contains both SYS + DEV
    expect(out.messages[0].role).toBe("system");
    expect(out.messages[0].content).toContain("SYS");
    expect(out.messages[0].content).toContain("DEV");

    // User + assistant preserved
    expect(
      out.messages.some((m: any) => m.role === "user" && m.content === "U1"),
    ).toBe(true);
    expect(
      out.messages.some(
        (m: any) => m.role === "assistant" && m.content === "A1",
      ),
    ).toBe(true);
  });

  test("drops empty messages deterministically", () => {
    const req = mkReq({
      messages: [
        { role: "system", content: "SYS" },
        { role: "user", content: "   " },
        { role: "assistant", content: "" },
        { role: "user", content: "Hello" },
      ],
    });

    const out = adapter.toOpenAIRequest(req);
    const contents = out.messages.map((m: any) => (m.content ?? "").trim());
    expect(contents.includes("")).toBe(false);
    expect(
      out.messages.some((m: any) => m.role === "user" && m.content === "Hello"),
    ).toBe(true);
  });

  test("builds tool declarations in deterministic alpha order", () => {
    const tools = mkToolRegistry();

    const outTools = adapter.buildTools(tools);

    // toolDeclarationOrder: 'alpha' => doc_open should come before doc_search
    expect(Array.isArray(outTools)).toBe(true);
    expect(outTools.length).toBe(2);
    expect(outTools[0].function.name).toBe("doc_open");
    expect(outTools[1].function.name).toBe("doc_search");
  });

  test("serializes tool call arguments as JSON string (OpenAI tool-call contract)", () => {
    const req = mkReq({
      messages: [
        { role: "system", content: "SYS" },
        {
          role: "assistant",
          content: "Calling tool",
          toolCalls: [
            {
              provider: "openai",
              toolCallId: "tc_1",
              name: "doc_search",
              argumentsJson: JSON.stringify({ query: "foo" }),
            } as any,
          ],
        },
      ],
      tools: { enabled: true, registry: mkToolRegistry() },
    });

    const out = adapter.toOpenAIRequest(req);

    // Ensure adapter does not corrupt arguments
    const assistantMsg = out.messages.find((m: any) => m.role === "assistant");
    expect(assistantMsg).toBeTruthy();
    expect(Array.isArray(assistantMsg.tool_calls)).toBe(true);
    expect(assistantMsg.tool_calls[0].function.name).toBe("doc_search");

    // Must remain valid JSON string
    expect(() =>
      JSON.parse(assistantMsg.tool_calls[0].function.arguments),
    ).not.toThrow();
    expect(JSON.parse(assistantMsg.tool_calls[0].function.arguments)).toEqual({
      query: "foo",
    });
  });

  test("parses assistant text output from OpenAI response", () => {
    const resp = {
      id: "r1",
      model: "gpt-5.2",
      choices: [
        {
          message: {
            role: "assistant",
            content: "Hello world",
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };

    const parsed = adapter.parseOpenAIResponse(resp);

    expect(parsed.text).toBe("Hello world");
    expect(parsed.toolCalls.length).toBe(0);
    expect(parsed.usage?.totalTokens).toBe(15);
  });

  test("parses tool calls from OpenAI response", () => {
    const resp = {
      id: "r2",
      model: "gpt-5.2",
      choices: [
        {
          message: {
            role: "assistant",
            content: "",
            tool_calls: [
              {
                id: "call_123",
                type: "function",
                function: {
                  name: "doc_search",
                  arguments: JSON.stringify({ query: "earn-out clause" }),
                },
              },
            ],
          },
        },
      ],
    };

    const parsed = adapter.parseOpenAIResponse(resp);

    expect(parsed.toolCalls.length).toBe(1);
    expect(parsed.toolCalls[0].provider).toBe("openai");
    expect((parsed.toolCalls[0] as any).name).toBe("doc_search");

    // Ensure args JSON survived
    const args = (parsed.toolCalls[0] as any).argumentsJson
      ? JSON.parse((parsed.toolCalls[0] as any).argumentsJson)
      : (parsed.toolCalls[0] as any).args;
    expect(args.query).toBe("earn-out clause");
  });

  test("deterministic tool call ids are stable for same name+args", () => {
    // If adapter embeds deterministic IDs, ensure stability
    const tc1 = adapter.normalizeToolCall({
      id: undefined,
      name: "doc_search",
      arguments: JSON.stringify({ query: "x" }),
    });

    const tc2 = adapter.normalizeToolCall({
      id: undefined,
      name: "doc_search",
      arguments: JSON.stringify({ query: "x" }),
    });

    expect((tc1 as any).toolCallId ?? (tc1 as any).toolCallId).toBe(
      (tc2 as any).toolCallId ?? (tc2 as any).toolCallId,
    );
  });
});
