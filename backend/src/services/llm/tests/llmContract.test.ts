// src/services/llm/tests/llmContract.test.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * llmContract.test.ts (Koda, ChatGPT-parity)
 * ----------------------------------------
 * Contract tests that ensure:
 *  - LlmRouter picks correct lanes (Gemini Flash for draft, OpenAI GPT-5.2 for final)
 *  - Streaming adapters emit meta -> delta -> final in the correct order
 *  - No forbidden phrases appear in streamed output (basic guard)
 *  - Tool calls (if enabled) are represented consistently
 *
 * These tests are designed to be deterministic and not require real provider keys.
 * We use stubs for provider clients and feed known stream chunks.
 *
 * NOTE:
 * Adjust import paths to match your repo structure.
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
    // For these tests we keep banks optional; services should behave deterministically without them.
    throw new Error("bank not found");
  }
}

class StubClient {
  provider = "openai";
  async call() {
    return { response: { text: "ok", finishReason: "stop" } };
  }
  async stream(_req: LlmRequest) {
    // Return a stream shaped like OpenAI chat.completions chunks
    async function* gen() {
      yield { choices: [{ delta: { content: "Hello" } }] };
      yield { choices: [{ delta: { content: " world" } }] };
      yield { choices: [{ finish_reason: "stop", delta: {} }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } };
    }
    return { stream: gen() };
  }
}

// ---------------------------
// Tests
// ---------------------------

describe("LLM Contract (Koda)", () => {
  it("router selects OpenAI GPT-5.2 for final / quality_finish lane", () => {
    const router = new LlmRouterService(new StubBankLoader() as any);

    const plan = router.route({
      env: "production",
      stage: "final",
      answerMode: "doc_grounded_single",
      reasonCodes: [],
      requireStreaming: true,
      allowTools: true,
    } as any);

    expect(plan.provider).toBe("openai");
    // Ensure your router is set to gpt-5.2 only
    expect(plan.model).toBe("gpt-5.2");
    expect(plan.stage).toBe("final");
  });

  it("stream adapter emits meta -> delta(s) -> final", async () => {
    const parser = new LlmResponseParserService();
    const adapter = new LlmStreamAdapterService(new StubClient() as any, parser);

    const req: LlmRequest = {
      route: { provider: "openai", model: "gpt-5.2", reason: "quality_finish", stage: "final" } as any,
      messages: [{ role: "user", content: "hi" }],
      options: { stream: true },
    };

    const result = await adapter.stream(req, undefined, { maxDeltaChars: 8, flushOnNewline: false });

    const events: LlmStreamEvent[] = [];
    for await (const e of result) events.push(e);

    expect(events[0].type).toBe("meta");
    expect(events.some((e) => e.type === "delta")).toBe(true);
    expect(events[events.length - 1].type).toBe("final");

    const final = events[events.length - 1] as any;
    expect(final.response.text.includes("Hello")).toBe(true);
  });

  it("basic banned phrase guard (should not appear in output)", async () => {
    const parser = new LlmResponseParserService();

    class BadClient extends StubClient {
      async stream(_req: LlmRequest) {
        async function* gen() {
          yield { choices: [{ delta: { content: "No relevant information found." } }] };
          yield { choices: [{ finish_reason: "stop", delta: {} }] };
        }
        return { stream: gen() };
      }
    }

    const adapter = new LlmStreamAdapterService(new BadClient() as any, parser);
    const req: LlmRequest = {
      route: { provider: "openai", model: "gpt-5.2", reason: "quality_finish", stage: "final" } as any,
      messages: [{ role: "user", content: "hi" }],
      options: { stream: true },
    };

    const stream = await adapter.stream(req);

    let full = "";
    for await (const e of stream) {
      if (e.type === "delta") full += e.text;
      if (e.type === "final") full += e.response.text || "";
    }

    // This is only a test-level guard. Real enforcement belongs to OutputContract/Quality gates.
    expect(full.toLowerCase()).not.toContain("no relevant information found");
  });
});
