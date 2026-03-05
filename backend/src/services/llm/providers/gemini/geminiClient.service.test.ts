import { afterEach, describe, expect, test } from "@jest/globals";

import type { LLMRequest } from "../../core/llmClient.interface";
import {
  GeminiClientService,
  normalizeGeminiBaseUrl,
  resolveGeminiModel,
} from "./geminiClient.service";

const originalFetch = globalThis.fetch;

function makeRequest(overrides?: Partial<LLMRequest>): LLMRequest {
  return {
    traceId: "trace-1",
    turnId: "turn-1",
    model: { provider: "google", model: "gemini-2.5-flash-001" },
    messages: [{ role: "user", content: "hello" }],
    ...overrides,
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("GeminiClientService", () => {
  describe("normalizeGeminiBaseUrl", () => {
    test("normalizes whitespace and trailing slash", () => {
      expect(
        normalizeGeminiBaseUrl("  https://generativelanguage.googleapis.com/v1beta/  "),
      ).toBe("https://generativelanguage.googleapis.com/v1beta");
    });

    test("rejects invalid URL, credentials, and query params", () => {
      expect(() => normalizeGeminiBaseUrl("")).toThrow("Gemini baseUrl is required.");
      expect(() => normalizeGeminiBaseUrl("not-a-url")).toThrow(
        "Gemini baseUrl is invalid.",
      );
      expect(() => normalizeGeminiBaseUrl("ftp://example.com")).toThrow(
        "Gemini baseUrl must use http or https.",
      );
      expect(() => normalizeGeminiBaseUrl("https://u:p@example.com/v1beta")).toThrow(
        "Gemini baseUrl must not contain credentials.",
      );
      expect(() =>
        normalizeGeminiBaseUrl("https://example.com/v1beta?key=abc"),
      ).toThrow("Gemini baseUrl must not include query parameters.");
    });
  });

  describe("resolveGeminiModel", () => {
    const cfg = {
      allowedModels: ["gemini-2.5-flash"],
      strictModelAllowlist: true,
      defaultModelFinal: "gemini-2.5-flash",
      defaults: { gemini3Flash: "gemini-2.5-flash" },
    };

    it("keeps pinned model version when family is allowlisted", () => {
      const out = resolveGeminiModel("gemini-2.5-flash-001", cfg);
      expect(out).toBe("gemini-2.5-flash-001");
    });

    it("falls back to default model for disallowed ids", () => {
      const out = resolveGeminiModel("gemini-legacy-model", cfg);
      expect(out).toBe("gemini-2.5-flash");
    });

    it("allows any model when strict allowlist is disabled", () => {
      const out = resolveGeminiModel("gemini-experimental", {
        ...cfg,
        strictModelAllowlist: false,
      });
      expect(out).toBe("gemini-experimental");
    });
  });

  describe("constructor validation", () => {
    test("rejects missing API key", () => {
      expect(
        () =>
          new GeminiClientService({
            apiKey: "  ",
            baseUrl: "https://generativelanguage.googleapis.com/v1beta",
            timeoutMs: 1000,
          }),
      ).toThrow("Gemini API key is required.");
    });
  });

  describe("ping()", () => {
    it("should not include API key as a URL query parameter", async () => {
      const calls: { url: string; init?: RequestInit }[] = [];
      const originalFetch = globalThis.fetch;

      // Mock fetch to capture the URL
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), init });
        return new Response(JSON.stringify({ models: [] }), { status: 200 });
      };

      try {
        const client = new GeminiClientService({
          apiKey: "test-secret-key-12345",
          baseUrl: "https://generativelanguage.googleapis.com/v1beta",
          timeoutMs: 5000,
        });

        await client.ping();

        expect(calls.length).toBe(1);
        expect(calls[0].url).not.toContain("?key=");
        expect(calls[0].url).not.toContain("test-secret-key");
        // API key should be in headers instead
        const headers = calls[0].init?.headers as Record<string, string>;
        expect(headers?.["X-Goog-Api-Key"]).toBe("test-secret-key-12345");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("complete()", () => {
    test("uses header auth, model URL, and normalizes tool calls", async () => {
      const calls: { url: string; init?: RequestInit }[] = [];
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), init });
        return new Response(
          JSON.stringify({
            candidates: [
              {
                finishReason: "STOP",
                content: {
                  role: "model",
                  parts: [
                    { text: "Result: " },
                    { text: "42" },
                    { functionCall: { name: "doc_search", args: { b: 2, a: 1 } } },
                  ],
                },
              },
            ],
            usageMetadata: {
              promptTokenCount: 10,
              candidatesTokenCount: 5,
              totalTokenCount: 15,
            },
          }),
          { status: 200, headers: { "x-request-id": "req-123" } },
        );
      };

      const client = new GeminiClientService({
        apiKey: "secret-key",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        timeoutMs: 5000,
        allowedModels: ["gemini-2.5-flash"],
        defaultModelFinal: "gemini-2.5-flash",
      });

      const request = makeRequest({
        messages: [
          { role: "system", content: "You are strict." },
          { role: "user", content: "Find docs" },
        ],
        sampling: { temperature: 0.1, topP: 0.9, maxOutputTokens: 64 },
        tools: {
          enabled: true,
          registry: {
            tools: [
              {
                id: "DOC_SEARCH",
                name: "doc_search",
                category: "retrieval",
                description: "Search docs",
                inputSchema: { type: "object" },
                inputType: "json",
                outputType: "json",
                policy: {
                  enabled: true,
                  maxCallsPerTurn: 2,
                  timeoutMs: 1000,
                  allowedUnderDocLock: true,
                  discoveryException: false,
                  requiresMasking: false,
                },
              },
            ],
          },
        },
      });

      const out = await client.complete(request);

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toContain(
        "/models/gemini-2.5-flash-001:generateContent",
      );
      expect(calls[0].url).not.toContain("?key=");
      expect(calls[0].url).not.toContain("secret-key");
      expect((calls[0].init?.headers as Record<string, string>)["X-Goog-Api-Key"]).toBe(
        "secret-key",
      );

      const posted = JSON.parse(String(calls[0].init?.body));
      expect(posted.systemInstruction.parts).toEqual([{ text: "You are strict." }]);
      expect(posted.contents).toEqual([
        { role: "user", parts: [{ text: "Find docs" }] },
      ]);

      expect(out.content).toBe("Result: 42");
      expect(out.finishReason).toBe("stop");
      expect(out.requestId).toBe("req-123");
      expect(out.usage).toEqual({
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      });
      expect(out.toolCallRequest?.toolCalls).toHaveLength(1);
      expect(out.toolCallRequest?.toolCalls[0]).toEqual(
        expect.objectContaining({
          provider: "google",
          name: "doc_search",
          args: { b: 2, a: 1 },
        }),
      );
      expect((out.toolCallRequest?.toolCalls[0] as any).callId).toMatch(
        /^[a-f0-9]{24}$/,
      );
    });
  });

  describe("stream()", () => {
    test("parses SSE events, emits deltas, and reports usage", async () => {
      const calls: { url: string; init?: RequestInit }[] = [];
      const sse =
        'data: {"candidates":[{"content":{"role":"model","parts":[{"text":"Hel"}]}}]}\n\n' +
        'data: {"candidates":[{"finishReason":"STOP","content":{"role":"model","parts":[{"text":"lo"}]}}],"usageMetadata":{"promptTokenCount":3,"candidatesTokenCount":2,"totalTokenCount":5}}\n\n';

      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), init });
        return new Response(sse, {
          status: 200,
          headers: { "x-request-id": "req-stream-1" },
        });
      };

      const client = new GeminiClientService({
        apiKey: "secret-key",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        timeoutMs: 5000,
      });

      const events: any[] = [];
      let open = true;
      const sink = {
        transport: "inproc" as const,
        write(event: any) {
          events.push(event);
        },
        flush() {},
        close() {
          open = false;
        },
        isOpen() {
          return open;
        },
      };

      const out = await client.stream({
        req: makeRequest(),
        sink,
        config: {
          markerHold: { enabled: true, flushAt: "final", maxBufferedMarkers: 8 },
          chunking: { maxCharsPerDelta: 2 },
        },
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toContain(":streamGenerateContent?alt=sse");
      expect(calls[0].url).not.toContain("?key=");

      const deltaText = events
        .filter((e) => e.event === "delta")
        .map((e) => e.data.text)
        .join("");
      expect(deltaText).toBe("Hello");
      expect(events[0].event).toBe("start");
      expect(events.some((e) => e.event === "progress")).toBe(true);
      expect(events[events.length - 1].event).toBe("final");
      expect(events[events.length - 1].data.text).toBe("Hello");

      expect(out.finalText).toBe("Hello");
      expect(out.finishReason).toBe("stop");
      expect(out.requestId).toBe("req-stream-1");
      expect(out.usage).toEqual({
        promptTokens: 3,
        completionTokens: 2,
        totalTokens: 5,
      });
    });
  });

  describe("normalizeToolCalls()", () => {
    test("emits deterministic call ids for equivalent args", () => {
      const client = new GeminiClientService({
        apiKey: "secret-key",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        timeoutMs: 5000,
      });

      const a = client.normalizeToolCalls({
        candidates: [
          {
            content: {
              role: "model",
              parts: [{ functionCall: { name: "doc_open", args: { b: 2, a: 1 } } }],
            },
          },
        ],
      });
      const b = client.normalizeToolCalls({
        candidates: [
          {
            content: {
              role: "model",
              parts: [{ functionCall: { name: "doc_open", args: { a: 1, b: 2 } } }],
            },
          },
        ],
      });

      expect(a).toHaveLength(1);
      expect(b).toHaveLength(1);
      expect((a[0] as any).callId).toBe((b[0] as any).callId);
      expect((a[0] as any).callId).toMatch(/^[a-f0-9]{24}$/);
    });
  });
});
