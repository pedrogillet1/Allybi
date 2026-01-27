// src/services/llm/providers/openai/openaiStreamAdapter.service.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * OpenAIStreamAdapterService (Koda, ChatGPT-parity)
 * ------------------------------------------------
 * Normalizes OpenAI provider-native streaming into Koda's LlmStreamEvent stream.
 *
 * Why a provider-specific stream adapter exists (even though we have a generic one):
 *  - OpenAI emits multiple stream “shapes” depending on API:
 *      - Responses API events
 *      - Chat Completions chunks
 *  - We want maximum determinism and best “first token” UX.
 *  - We want clean handling of:
 *      - delta text
 *      - tool call deltas
 *      - usage (if included)
 *      - finish reason
 *
 * Output contract:
 *  - Emit:
 *      1) meta
 *      2) delta events (small chunks)
 *      3) final (with raw + normalized fields)
 *    or error
 *
 * This adapter does NOT:
 *  - enforce Koda policies
 *  - enforce output formatting
 */

import type {
  LlmStreamEvent,
  LlmResponse,
  LlmFinishReason,
  LlmUsage,
  LlmToolCall,
  LlmProviderId,
  LlmModelId,
} from "../../types/llm.types";

export interface OpenAIStreamAdapterOptions {
  maxDeltaChars: number;
  flushOnNewline: boolean;
  includeHeartbeat: boolean;
  heartbeatEveryMs: number;
}

const DEFAULT_OPTS: OpenAIStreamAdapterOptions = {
  maxDeltaChars: 48,
  flushOnNewline: true,
  includeHeartbeat: false,
  heartbeatEveryMs: 15000,
};

function nowMs() {
  return Date.now();
}

function safeString(x: any): string {
  if (typeof x === "string") return x;
  if (x == null) return "";
  return String(x);
}

function normalizeFinishReason(raw: any): LlmFinishReason {
  const s = String(raw ?? "").toLowerCase();
  if (s.includes("stop")) return "stop";
  if (s.includes("length") || s.includes("max_tokens")) return "length";
  if (s.includes("tool")) return "tool_calls";
  if (s.includes("content_filter") || s.includes("safety")) return "content_filter";
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("error")) return "error";
  return "unknown";
}

function chunkText(text: string, opts: OpenAIStreamAdapterOptions): string[] {
  if (!text) return [];
  const max = Math.max(12, Math.min(256, opts.maxDeltaChars));
  const parts = opts.flushOnNewline ? splitKeepNewlines(text) : [text];

  const out: string[] = [];
  for (const p of parts) {
    if (p.length <= max) {
      out.push(p);
      continue;
    }
    for (let i = 0; i < p.length; i += max) out.push(p.slice(i, i + max));
  }
  return out;
}

function splitKeepNewlines(s: string): string[] {
  const out: string[] = [];
  let buf = "";
  for (let i = 0; i < s.length; i++) {
    buf += s[i];
    if (s[i] === "\n") {
      out.push(buf);
      buf = "";
    }
  }
  if (buf) out.push(buf);
  return out;
}

/**
 * Extract delta text from OpenAI Responses API events or Chat Completions chunks.
 */
function extractDeltaText(evt: any): string {
  if (!evt) return "";

  // Chat Completions chunk
  const cc = evt?.choices?.[0]?.delta?.content;
  if (typeof cc === "string") return cc;

  // Responses API events often have:
  // - type: "response.output_text.delta", delta: "..."
  if (typeof evt?.delta === "string") return evt.delta;

  // Sometimes: output_text delta field
  if (typeof evt?.output_text_delta === "string") return evt.output_text_delta;

  return "";
}

/**
 * Extract tool call deltas (Chat Completions).
 */
function extractToolCallDelta(evt: any): { toolCallId: string; deltaJson: string } | null {
  const tc = evt?.choices?.[0]?.delta?.tool_calls;
  if (Array.isArray(tc) && tc.length) {
    const t0 = tc[0];
    const id = String(t0.id ?? "toolcall_0");
    const args = t0.function?.arguments;
    if (typeof args === "string" && args.length) return { toolCallId: id, deltaJson: args };
  }
  return null;
}

function extractUsage(evt: any): LlmUsage | undefined {
  const u = evt?.usage;
  if (!u || typeof u !== "object") return undefined;

  const inputTokens =
    Number.isFinite(u.prompt_tokens) ? Math.max(0, Math.floor(u.prompt_tokens)) : undefined;
  const outputTokens =
    Number.isFinite(u.completion_tokens) ? Math.max(0, Math.floor(u.completion_tokens)) : undefined;
  const totalTokens =
    Number.isFinite(u.total_tokens)
      ? Math.max(0, Math.floor(u.total_tokens))
      : inputTokens != null && outputTokens != null
      ? inputTokens + outputTokens
      : undefined;

  return { inputTokens, outputTokens, totalTokens, providerUsage: u };
}

function isTerminalOpenAIEvent(evt: any): boolean {
  if (!evt) return false;

  // Chat Completions terminal chunk
  if (evt?.choices?.[0]?.finish_reason) return true;

  // Responses API terminal events:
  // - type: "response.completed"
  // - type: "response.failed"
  const t = String(evt?.type ?? "");
  if (t === "response.completed" || t === "response.failed") return true;

  // Ollama-like done flag won't be here, but keep a generic check
  if (evt?.done === true) return true;

  return false;
}

function extractFinishReason(evt: any): LlmFinishReason {
  const fr = evt?.choices?.[0]?.finish_reason ?? evt?.finish_reason ?? evt?.done_reason ?? null;
  return normalizeFinishReason(fr);
}

export class OpenAIStreamAdapterService {
  /**
   * Normalize an OpenAI-native stream into LlmStreamEvent.
   */
  async *normalizeStream(args: {
    provider: LlmProviderId; // "openai"
    model: LlmModelId;
    correlationId?: string;
    requestId?: string;

    nativeStream: AsyncIterable<any>;
    signal?: AbortSignal;
    opts?: Partial<OpenAIStreamAdapterOptions>;
  }): AsyncIterable<LlmStreamEvent> {
    const opts: OpenAIStreamAdapterOptions = { ...DEFAULT_OPTS, ...(args.opts || {}) };

    // META early
    yield {
      type: "meta",
      provider: args.provider,
      model: args.model,
      requestId: args.requestId,
      correlationId: args.correlationId,
      cached: false,
    };

    let nextHeartbeatAt = opts.includeHeartbeat ? nowMs() + opts.heartbeatEveryMs : 0;

    let accumulatedText = "";
    let finishReason: LlmFinishReason = "unknown";
    let usage: LlmUsage | undefined;
    let finalRaw: any | null = null;
    let ended = false;

    try {
      for await (const evt of args.nativeStream) {
        if (args.signal?.aborted) {
          finishReason = "cancelled";
          ended = true;
          break;
        }

        if (opts.includeHeartbeat && nowMs() >= nextHeartbeatAt) {
          yield { type: "heartbeat", ts: nowMs() };
          nextHeartbeatAt = nowMs() + opts.heartbeatEveryMs;
        }

        // Tool deltas
        const tcd = extractToolCallDelta(evt);
        if (tcd) yield { type: "tool_call_delta", toolCallId: tcd.toolCallId, deltaJson: tcd.deltaJson };

        // Text deltas
        const delta = extractDeltaText(evt);
        if (delta) {
          const pieces = chunkText(delta, opts);
          for (const p of pieces) {
            accumulatedText += p;
            yield { type: "delta", text: p };
          }
        }

        // Usage (often appears at the end or in special events)
        const u = extractUsage(evt);
        if (u) usage = u;

        // Terminal detection
        if (isTerminalOpenAIEvent(evt)) {
          finishReason = extractFinishReason(evt);
          finalRaw = evt;
          ended = true;
          break;
        }
      }

      // FINAL event
      const response: LlmResponse = {
        text: accumulatedText,
        finishReason: finishReason,
        usage,
        raw: finalRaw ?? { accumulatedText, finishReason },
      };

      yield { type: "final", response };
    } catch (err: any) {
      yield {
        type: "error",
        code: "openai_stream_error",
        message: safeString(err?.message || "Stream failed"),
        retryable: false,
        detail: process.env.NODE_ENV === "production" ? undefined : { stack: err?.stack },
      };
    } finally {
      // If aborted without final, still emit a final response so downstream can close streams cleanly.
      if (args.signal?.aborted && !ended) {
        yield {
          type: "final",
          response: {
            text: accumulatedText,
            finishReason: "cancelled",
            raw: { accumulatedText, finishReason: "cancelled" },
          },
        };
      }
    }
  }
}

export default OpenAIStreamAdapterService;
