// src/services/llm/tests/geminiAdapter.test.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * geminiAdapter.test.ts (Allybi, ChatGPT-parity)
 * -------------------------------------------
 * Contract tests for Gemini provider integration (no real API keys).
 *
 * Ensures:
 *  - Gemini “draft” lane uses gemini-3-flash (routing intent)
 *  - Gemini streaming chunks are normalized into:
 *      meta -> delta(s) -> final
 *  - Gemini tool-call deltas (if present) are handled (best effort)
 *
 * NOTE:
 * Adjust import paths to match your repo.
 */

import { describe, it, expect } from "vitest";
import type { LlmRequest, LlmStreamEvent } from "../types/llm.types";
import LlmRouterService from "../core/llmRouter.service";
import LlmStreamAdapterService from "../core/llmStreamAdapter.service";
import LlmResponseParserService from "../core/llmResponseParser.service";

// ---------------------------
// Stubs
// ---------------------------

class StubBankLoader {
  getBank() {
    throw new Error("bank not found");
  }
}

class StubGeminiClient {
  provider = "gemini";

  async call() {
    return { response: { text: "ok", finishReason: "stop" } };
  }

  async stream(_req: LlmRequest) {
    // Gemini-like stream: candidates[0].content.parts[].text
    async function* gen() {
      yield { candidates: [{ content: { parts: [{ text: "Hello" }] } }] };
      yield { candidates: [{ content: { parts: [{ text: " from" }] } }] };
      yield { candidates: [{ content: { parts: [{ text: " Gemini" }] }, finishReason: "STOP" }] };
    }
    return { stream: gen() };
  }
}

// ---------------------------
// Tests
// ---------------------------

describe("Gemini Adapter (Allybi)", () => {
  it("router selects Gemini Flash for draft / fast_path lane", () => {
    const router = new LlmRouterService(new StubBankLoader() as any);

    const plan = router.route({
      env: "production",
      stage: "draft",
      answerMode: "doc_grounded_single",
      reasonCodes: [],
      requireStreaming: true,
      allowTools: false,
    } as any);

    expect(plan.provider).toBe("gemini");
    expect(plan.model).toBe("gemini-3-flash");
    expect(plan.stage).toBe("draft");
  });

  it("stream adapter emits meta -> delta(s) -> final for Gemini-shaped chunks", async () => {
    const parser = new LlmResponseParserService();
    const adapter = new LlmStreamAdapterService(new StubGeminiClient() as any, parser);

    const req: LlmRequest = {
      route: { provider: "gemini", model: "gemini-3-flash", reason: "fast_path", stage: "draft" } as any,
      messages: [{ role: "user", content: "hi" }],
      options: { stream: true },
    };

    const stream = await adapter.stream(req, undefined, { maxDeltaChars: 8, flushOnNewline: false });

    const events: LlmStreamEvent[] = [];
    for await (const e of stream) events.push(e);

    expect(events[0].type).toBe("meta");
    expect(events.some((e) => e.type === "delta")).toBe(true);
    expect(events[events.length - 1].type).toBe("final");

    const final = events[events.length - 1] as any;
    expect(final.response.text.toLowerCase()).toContain("hello");
  });

  it("best-effort tool call delta support does not crash on unknown fields", async () => {
    const parser = new LlmResponseParserService();

    class ToolishGeminiClient extends StubGeminiClient {
      async stream(_req: LlmRequest) {
        async function* gen() {
          // unknown tool-ish chunk (should be ignored safely)
          yield { tool_calls: [{ id: "t1", name: "open", arguments: { docId: "x" } }] };
          yield { candidates: [{ content: { parts: [{ text: "Done" }] }, finishReason: "STOP" }] };
        }
        return { stream: gen() };
      }
    }

    const adapter = new LlmStreamAdapterService(new ToolishGeminiClient() as any, parser);

    const req: LlmRequest = {
      route: { provider: "gemini", model: "gemini-3-flash", reason: "fast_path", stage: "draft" } as any,
      messages: [{ role: "user", content: "open something" }],
      options: { stream: true },
    };

    const stream = await adapter.stream(req);

    let sawFinal = false;
    for await (const e of stream) {
      if (e.type === "final") sawFinal = true;
    }

    expect(sawFinal).toBe(true);
  });
});
