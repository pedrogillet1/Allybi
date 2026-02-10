// src/services/llm/core/llmStreamAdapter.service.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * LlmStreamAdapterService (Allybi, ChatGPT-parity)
 * ---------------------------------------------
 * Converts provider-native streaming into Allybi's normalized LlmStreamEvent stream.
 *
 * Requirements (ChatGPT-like streaming):
 *  - Emit META quickly (before first token whenever possible)
 *  - Emit small DELTA chunks frequently (avoid huge bursts)
 *  - Provide FIRST_TOKEN timing signal support (telemetry can consume)
 *  - Support AbortSignal cancellation cleanly
 *  - Always end with FINAL or ERROR
 *
 * This adapter is intentionally provider-agnostic:
 *  - Each provider client can expose a provider-native AsyncIterable
 *  - This service normalizes it into LlmStreamEvent (meta/delta/final/error)
 *
 * Providers supported by normalization:
 *  - OpenAI (SSE-like chunks; "delta" text)
 *  - Gemini (chunked parts)
 *  - Local (Ollama stream tokens)
 *
 * If your provider clients already yield LlmStreamEvent, this adapter can be a passthrough.
 */

import type {
  LlmRequest,
  LlmStreamEvent,
  LlmResponse,
  LlmToolCall,
  LlmUsage,
  LlmFinishReason,
  LlmProviderId,
  LlmModelId,
} from "../types/llm.types";

export interface ProviderStreamResult {
  stream: AsyncIterable<any>;
}

export interface LlmClient {
  provider: LlmProviderId;
  stream(request: LlmRequest, signal?: AbortSignal): Promise<ProviderStreamResult>;
}

export interface LlmResponseParserService {
  parse(args: { provider: LlmProviderId; model: LlmModelId; raw: any }): LlmResponse;
}

export interface LlmTelemetryService {
  start(args: { provider: LlmProviderId; model: LlmModelId; correlationId?: string }): { markFirstToken: () => void; finish: (usage?: LlmUsage) => any };
}

/**
 * Options to control delta chunking cadence:
 * The frontend also does smoothing, but backends should avoid sending giant chunks.
 */
export interface StreamNormalizationOptions {
  maxDeltaChars: number;         // cap per delta event
  flushOnNewline: boolean;       // split deltas on newlines where possible
  heartbeatEveryMs: number;      // optional keepalive events
}

const DEFAULT_STREAM_OPTS: StreamNormalizationOptions = {
  maxDeltaChars: 48,
  flushOnNewline: true,
  heartbeatEveryMs: 0,
};

function safeString(x: any): string {
  if (typeof x === "string") return x;
  if (x == null) return "";
  return String(x);
}

function nowMs(): number {
  return Date.now();
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

function chunkTextByRules(text: string, opts: StreamNormalizationOptions): string[] {
  const t = text ?? "";
  if (!t) return [];

  const max = Math.max(8, opts.maxDeltaChars);

  // If we can flush on newline, split, then cap chunks
  const parts = opts.flushOnNewline ? splitKeepNewlines(t) : [t];

  const out: string[] = [];
  for (const p of parts) {
    if (p.length <= max) {
      out.push(p);
      continue;
    }
    // hard chunk
    for (let i = 0; i < p.length; i += max) {
      out.push(p.slice(i, i + max));
    }
  }
  return out;
}

function splitKeepNewlines(s: string): string[] {
  const out: string[] = [];
  let buf = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    buf += ch;
    if (ch === "\n") {
      out.push(buf);
      buf = "";
    }
  }
  if (buf) out.push(buf);
  return out;
}

/**
 * Attempt to extract a delta text from common provider stream chunk shapes.
 * If you already normalize provider outputs in provider clients, keep this simple.
 */
function extractDeltaText(provider: LlmProviderId, chunk: any): string {
  if (!chunk) return "";

  // OpenAI streaming style (common):
  // chunk.choices[0].delta.content
  const oaiDelta = chunk?.choices?.[0]?.delta?.content;
  if (typeof oaiDelta === "string") return oaiDelta;

  // Some OpenAI variants:
  const oaiText = chunk?.delta?.text ?? chunk?.output_text_delta ?? chunk?.text;
  if (typeof oaiText === "string") return oaiText;

  // Gemini streaming style:
  // chunk.candidates[0].content.parts[].text
  const parts = chunk?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    const t = parts.map((p: any) => p?.text).filter((x: any) => typeof x === "string").join("");
    if (t) return t;
  }

  // Gemini alt:
  if (typeof chunk?.candidates?.[0]?.output === "string") return chunk.candidates[0].output;

  // Ollama:
  // chunk.response
  if (typeof chunk?.response === "string") return chunk.response;

  return "";
}

/**
 * Attempt to detect tool calls from provider stream chunks (optional).
 * Many providers only provide tool call details at the final response.
 */
function extractToolCallDelta(provider: LlmProviderId, chunk: any): { toolCallId: string; deltaJson: string } | null {
  // OpenAI: choices[0].delta.tool_calls[].function.arguments
  const tc = chunk?.choices?.[0]?.delta?.tool_calls;
  if (Array.isArray(tc) && tc.length) {
    const t0 = tc[0];
    const id = String(t0.id ?? "toolcall_0");
    const args = t0.function?.arguments;
    if (typeof args === "string" && args.length) {
      return { toolCallId: id, deltaJson: args };
    }
  }
  return null;
}

/**
 * Attempt to detect stream end and produce final raw response.
 * Some providers send a distinct terminal chunk; others require a separate final call result.
 * In our design, provider clients should return an iterable that ends naturally and provide a final raw object
 * either as the last chunk or embedded in a terminal chunk. If not available, we still emit FINAL using accumulated text.
 */
function isTerminalChunk(provider: LlmProviderId, chunk: any): boolean {
  if (!chunk) return false;
  // OpenAI: choices[0].finish_reason
  const fr = chunk?.choices?.[0]?.finish_reason;
  if (fr) return true;

  // Ollama: done=true
  if (chunk?.done === true) return true;

  // Gemini: may send a final candidate with finishReason
  if (chunk?.candidates?.[0]?.finishReason) return true;

  return false;
}

function extractFinishReason(provider: LlmProviderId, chunk: any): LlmFinishReason {
  const fr =
    chunk?.choices?.[0]?.finish_reason ??
    chunk?.candidates?.[0]?.finishReason ??
    chunk?.done_reason ??
    chunk?.finish_reason ??
    null;
  return normalizeFinishReason(fr);
}

export class LlmStreamAdapterService {
  constructor(
    private readonly llmClient: LlmClient,
    private readonly responseParser: LlmResponseParserService,
    private readonly telemetry?: LlmTelemetryService
  ) {}

  /**
   * Create a normalized stream.
   */
  async stream(request: LlmRequest, signal?: AbortSignal, opts?: Partial<StreamNormalizationOptions>): Promise<AsyncIterable<LlmStreamEvent>> {
    const options: StreamNormalizationOptions = { ...DEFAULT_STREAM_OPTS, ...(opts || {}) };

    const provider = request.route.provider;
    const model = request.route.model;

    const telem = this.telemetry?.start({ provider, model, correlationId: request.correlationId });

    const result = await this.llmClient.stream(request, signal);

    // Normalize provider-native stream -> LlmStreamEvent
    const self = this;

    async function* iterator(): AsyncIterable<LlmStreamEvent> {
      // META first (early)
      yield {
        type: "meta",
        provider,
        model,
        requestId: request.kodaMeta?.requestId,
        correlationId: request.correlationId,
        cached: false,
      };

      const heartbeatMs = Math.max(0, options.heartbeatEveryMs);
      let nextHeartbeatAt = heartbeatMs ? nowMs() + heartbeatMs : 0;

      let accumulatedText = "";
      let finished = false;
      let finishReason: LlmFinishReason = "unknown";
      let finalRaw: any | null = null;

      try {
        for await (const chunk of result.stream) {
          if (signal?.aborted) {
            finished = true;
            finishReason = "cancelled";
            break;
          }

          // heartbeats
          if (heartbeatMs && nowMs() >= nextHeartbeatAt) {
            yield { type: "heartbeat", ts: nowMs() };
            nextHeartbeatAt = nowMs() + heartbeatMs;
          }

          // Tool call delta (optional)
          const toolDelta = extractToolCallDelta(provider, chunk);
          if (toolDelta) {
            yield { type: "tool_call_delta", toolCallId: toolDelta.toolCallId, deltaJson: toolDelta.deltaJson };
          }

          // Delta text
          const delta = extractDeltaText(provider, chunk);
          if (delta) {
            if (telem) telem.markFirstToken();
            const pieces = chunkTextByRules(delta, options);
            for (const p of pieces) {
              accumulatedText += p;
              yield { type: "delta", text: p };
            }
          }

          // Terminal chunk capture
          if (isTerminalChunk(provider, chunk)) {
            finished = true;
            finishReason = extractFinishReason(provider, chunk);
            finalRaw = chunk; // might not be complete provider response, but keep it
            break;
          }
        }

        // Emit FINAL
        // If finalRaw is a full response, parse it. Otherwise build minimal raw for parser.
        const rawForParser = finalRaw ?? { response: accumulatedText, done: true, finish_reason: finishReason };
        const parsed = self.responseParser.parse({ provider, model, raw: rawForParser });

        // Ensure we at least have the accumulated stream text
        const finalText = parsed.text && parsed.text.length ? parsed.text : accumulatedText;

        const response: LlmResponse = {
          ...parsed,
          text: finalText,
          finishReason: parsed.finishReason && parsed.finishReason !== "unknown" ? parsed.finishReason : finishReason,
        };

        // Telemetry finish
        if (telem) {
          const t = telem.finish(response.usage);
          // optionally attach telemetry to response (kept internal)
          response.telemetry = { ...(response.telemetry || {}), ...t };
        }

        yield { type: "final", response };
      } catch (err: any) {
        const retryable = false;
        yield {
          type: "error",
          code: "llm_stream_error",
          message: safeString(err?.message || "Stream failed"),
          retryable,
          detail: process.env.NODE_ENV === "production" ? undefined : { stack: err?.stack },
        };
      } finally {
        // If aborted and no final emitted, emit a final “cancelled” response
        if (signal?.aborted && !finished) {
          const response: LlmResponse = {
            text: accumulatedText,
            finishReason: "cancelled",
          };
          yield { type: "final", response };
        }
      }
    }

    return iterator();
  }
}

export default LlmStreamAdapterService;
