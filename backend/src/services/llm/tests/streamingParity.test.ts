// src/services/llm/tests/streamingParity.test.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * streamingParity.test.ts (Allybi, ChatGPT-parity)
 * ---------------------------------------------
 * Ensures streaming behavior feels consistent across providers:
 *  - meta arrives before first delta
 *  - deltas are reasonably small (no huge bursts)
 *  - a final event is always emitted (even on abort)
 *  - no forbidden "bad fallback phrase" leaks through stream
 *
 * This test does NOT require real provider keys. It uses stubs.
 */

import { describe, it, expect } from "vitest";
import type { LlmRequest, LlmStreamEvent } from "../types/llm.types";
import LlmStreamAdapterService from "../core/llmStreamAdapter.service";
import LlmResponseParserService from "../core/llmResponseParser.service";

// ---------------------------
// Stub clients
// ---------------------------

class StubOpenAIClient {
  provider = "openai";
  async stream(_req: LlmRequest) {
    async function* gen() {
      yield { choices: [{ delta: { content: "Hello" } }] };
      yield { choices: [{ delta: { content: " world\n" } }] };
      yield { choices: [{ finish_reason: "stop", delta: {} }] };
    }
    return { stream: gen() };
  }
}

class StubGeminiClient {
  provider = "gemini";
  async stream(_req: LlmRequest) {
    async function* gen() {
      yield { candidates: [{ content: { parts: [{ text: "Hello" }] } }] };
      yield { candidates: [{ content: { parts: [{ text: " world\n" }] } }] };
      yield { candidates: [{ content: { parts: [{ text: "" }] }, finishReason: "STOP" }] };
    }
    return { stream: gen() };
  }
}

class StubLocalClient {
  provider = "local";
  async stream(_req: LlmRequest) {
    async function* gen() {
      yield { response: "Hello", done: false };
      yield { response: " world\n", done: false };
      yield { response: "", done: true };
    }
    return { stream: gen() };
  }
}

// ---------------------------
// Helpers
// ---------------------------

async function collectEvents(adapter: any, req: LlmRequest) {
  const iterable = await adapter.stream(req, undefined, { maxDeltaChars: 8, flushOnNewline: true });
  const events: LlmStreamEvent[] = [];
  for await (const e of iterable) events.push(e);
  return events;
}

function firstIndex(events: LlmStreamEvent[], type: LlmStreamEvent["type"]) {
  return events.findIndex((e) => e.type === type);
}

// ---------------------------
// Tests
// ---------------------------

describe("Streaming parity across providers", () => {
  it("meta comes before delta and final exists (OpenAI)", async () => {
    const parser = new LlmResponseParserService();
    const adapter = new LlmStreamAdapterService(new StubOpenAIClient() as any, parser);

    const events = await collectEvents(adapter, {
      route: { provider: "openai", model: "gpt-5.2", reason: "quality_finish", stage: "final" } as any,
      messages: [{ role: "user", content: "hi" }],
      options: { stream: true },
    });

    expect(events[0].type).toBe("meta");
    expect(firstIndex(events, "delta")).toBeGreaterThan(-1);
    expect(events[events.length - 1].type).toBe("final");
  });

  it("meta comes before delta and final exists (Gemini)", async () => {
    const parser = new LlmResponseParserService();
    const adapter = new LlmStreamAdapterService(new StubGeminiClient() as any, parser);

    const events = await collectEvents(adapter, {
      route: { provider: "gemini", model: "gemini-3-flash", reason: "fast_path", stage: "draft" } as any,
      messages: [{ role: "user", content: "hi" }],
      options: { stream: true },
    });

    expect(events[0].type).toBe("meta");
    expect(firstIndex(events, "delta")).toBeGreaterThan(-1);
    expect(events[events.length - 1].type).toBe("final");
  });

  it("meta comes before delta and final exists (Local)", async () => {
    const parser = new LlmResponseParserService();
    const adapter = new LlmStreamAdapterService(new StubLocalClient() as any, parser);

    const events = await collectEvents(adapter, {
      route: { provider: "local", model: "local-default", reason: "fallback_only", stage: "draft" } as any,
      messages: [{ role: "user", content: "hi" }],
      options: { stream: true },
    });

    expect(events[0].type).toBe("meta");
    expect(firstIndex(events, "delta")).toBeGreaterThan(-1);
    expect(events[events.length - 1].type).toBe("final");
  });

  it("delta chunks are small (no giant bursts)", async () => {
    const parser = new LlmResponseParserService();
    const adapter = new LlmStreamAdapterService(new StubOpenAIClient() as any, parser);

    const events = await collectEvents(adapter, {
      route: { provider: "openai", model: "gpt-5.2", reason: "quality_finish", stage: "final" } as any,
      messages: [{ role: "user", content: "hi" }],
      options: { stream: true },
    });

    const deltas = events.filter((e) => e.type === "delta") as any[];
    expect(deltas.length).toBeGreaterThan(0);

    // maxDeltaChars=8 in collectEvents()
    for (const d of deltas) {
      expect(String(d.text).length).toBeLessThanOrEqual(8);
    }
  });

  it("forbidden phrase does not appear (best-effort parity check)", async () => {
    const parser = new LlmResponseParserService();

    class BadClient {
      provider = "openai";
      async stream(_req: LlmRequest) {
        async function* gen() {
          yield { choices: [{ delta: { content: "No relevant information found." } }] };
          yield { choices: [{ finish_reason: "stop", delta: {} }] };
        }
        return { stream: gen() };
      }
    }

    const adapter = new LlmStreamAdapterService(new BadClient() as any, parser);
    const events = await collectEvents(adapter, {
      route: { provider: "openai", model: "gpt-5.2", reason: "quality_finish", stage: "final" } as any,
      messages: [{ role: "user", content: "hi" }],
      options: { stream: true },
    });

    let full = "";
    for (const e of events) {
      if (e.type === "delta") full += (e as any).text;
      if (e.type === "final") full += (e as any).response?.text || "";
    }

    expect(full.toLowerCase()).not.toContain("no relevant information found");
  });
});
