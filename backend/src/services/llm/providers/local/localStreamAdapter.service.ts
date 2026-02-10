// src/services/llm/providers/local/localStreamAdapter.service.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * LocalStreamAdapterService (Allybi, ChatGPT-parity)
 * -----------------------------------------------
 * Normalizes local provider streaming (e.g., Ollama) into Allybi's LlmStreamEvent stream.
 *
 * Why this exists:
 *  - Local providers vary widely in streaming shapes:
 *      - Ollama: { response: "text", done: boolean, ... }
 *      - Custom: newline-delimited JSON with { token } or { delta }
 *  - We want consistent behavior:
 *      - meta -> delta -> final/error
 *      - small deltas, newline-friendly
 *      - abortable
 *
 * This adapter does NOT enforce policy/output contracts.
 */

import type {
  LlmStreamEvent,
  LlmResponse,
  LlmFinishReason,
  LlmUsage,
  LlmProviderId,
  LlmModelId,
} from "../../types/llm.types";

export interface LocalStreamAdapterOptions {
  maxDeltaChars: number;
  flushOnNewline: boolean;
  includeHeartbeat: boolean;
  heartbeatEveryMs: number;
}

const DEFAULT_OPTS: LocalStreamAdapterOptions = {
  maxDeltaChars: 64,
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

function chunkText(text: string, opts: LocalStreamAdapterOptions): string[] {
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

function normalizeFinishReason(done: boolean, raw?: any): LlmFinishReason {
  if (raw?.error) return "error";
  if (done) return "stop";
  return "unknown";
}

/**
 * Extract delta text from local provider stream chunk.
 * Ollama typical:
 *  - { response: "text", done: false }
 * Some custom:
 *  - { delta: "text" }
 *  - { token: "text" }
 */
function extractDelta(chunk: any): string {
  if (!chunk) return "";
  if (typeof chunk.response === "string") return chunk.response;
  if (typeof chunk.delta === "string") return chunk.delta;
  if (typeof chunk.token === "string") return chunk.token;
  if (typeof chunk.text === "string") return chunk.text;
  return "";
}

function extractDone(chunk: any): boolean {
  if (!chunk) return false;
  if (chunk.done === true) return true;
  if (chunk.is_done === true) return true;
  if (chunk.completed === true) return true;
  return false;
}

function extractUsage(chunk: any): LlmUsage | undefined {
  // Local providers often don't provide usage. Keep best-effort.
  const u = chunk?.usage;
  if (!u || typeof u !== "object") return undefined;

  const inputTokens = Number.isFinite(u.inputTokens) ? Math.max(0, Math.floor(u.inputTokens)) : undefined;
  const outputTokens = Number.isFinite(u.outputTokens) ? Math.max(0, Math.floor(u.outputTokens)) : undefined;
  const totalTokens =
    Number.isFinite(u.totalTokens)
      ? Math.max(0, Math.floor(u.totalTokens))
      : inputTokens != null && outputTokens != null
      ? inputTokens + outputTokens
      : undefined;

  if (inputTokens == null && outputTokens == null && totalTokens == null) return undefined;
  return { inputTokens, outputTokens, totalTokens, providerUsage: u };
}

export class LocalStreamAdapterService {
  async *normalizeStream(args: {
    provider: LlmProviderId; // "local"
    model: LlmModelId;
    correlationId?: string;
    requestId?: string;

    nativeStream: AsyncIterable<any>;
    signal?: AbortSignal;
    opts?: Partial<LocalStreamAdapterOptions>;
  }): AsyncIterable<LlmStreamEvent> {
    const opts: LocalStreamAdapterOptions = { ...DEFAULT_OPTS, ...(args.opts || {}) };

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
      for await (const chunk of args.nativeStream) {
        if (args.signal?.aborted) {
          finishReason = "cancelled";
          ended = true;
          break;
        }

        if (opts.includeHeartbeat && nowMs() >= nextHeartbeatAt) {
          yield { type: "heartbeat", ts: nowMs() };
          nextHeartbeatAt = nowMs() + opts.heartbeatEveryMs;
        }

        const delta = extractDelta(chunk);
        if (delta) {
          const pieces = chunkText(delta, opts);
          for (const p of pieces) {
            accumulatedText += p;
            yield { type: "delta", text: p };
          }
        }

        const u = extractUsage(chunk);
        if (u) usage = u;

        if (extractDone(chunk)) {
          finishReason = normalizeFinishReason(true, chunk);
          finalRaw = chunk;
          ended = true;
          break;
        }

        // If local provider sends explicit error object mid-stream
        if (chunk?.error) {
          finishReason = "error";
          finalRaw = chunk;
          ended = true;
          yield {
            type: "error",
            code: "local_stream_error",
            message: safeString(chunk.error?.message || chunk.error || "Local stream error"),
            retryable: true,
            detail: process.env.NODE_ENV === "production" ? undefined : chunk.error,
          };
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
        code: "local_stream_error",
        message: safeString(err?.message || "Stream failed"),
        retryable: true,
        detail: process.env.NODE_ENV === "production" ? undefined : { stack: err?.stack },
      };

      // still emit final so pipeline can close cleanly
      yield {
        type: "final",
        response: {
          text: accumulatedText,
          finishReason: "error",
          raw: { accumulatedText, error: safeString(err?.message) },
        },
      };
    } finally {
      // If aborted without final, still emit a final response
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

export default LocalStreamAdapterService;
