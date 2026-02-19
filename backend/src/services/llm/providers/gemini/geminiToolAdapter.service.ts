/**
 * geminiStreamAdapter.service.ts
 *
 * High-quality streaming adapter for Gemini (Google) responses.
 *
 * Purpose:
 * - Parse Gemini streaming HTTP response bodies (newline-delimited JSON chunks, best-effort)
 * - Extract incremental text deltas + function/tool calls
 * - Emit Allybi StreamEvents via StreamSink with ChatGPT-parity "steady stream" behavior
 * - Support marker holding / buffering (avoid UI flicker) via LLMStreamingConfig.markerHold
 *
 * This adapter is intentionally separated from geminiClient.service.ts so you can:
 * - Unit test parsing + chunking independently
 * - Reuse in multiple client implementations
 *
 * Non-responsibilities:
 * - No trust/safety decisions
 * - No tool execution
 * - No user-facing microcopy
 */

import crypto from "crypto";
import type {
  StreamSink,
  StreamEvent,
  StreamDelta,
  StreamMarker,
  StreamState,
  LLMStreamingConfig,
} from "./llmStreaming.types";
import type { ProviderToolCall } from "./llmTools.types";
import type { LLMProvider } from "./llmErrors.types";

/** Gemini stream chunk (best-effort minimal shape) */
interface GeminiStreamChunk {
  candidates?: Array<{
    content?: {
      role?: string;
      parts?: Array<
        | { text?: string }
        | { functionCall?: { name?: string; args?: Record<string, unknown> } }
      >;
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

/** Output collected while streaming */
export interface GeminiStreamCollected {
  text: string;
  toolCalls: ProviderToolCall[];
  finishReason?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface GeminiStreamAdapterConfig {
  /**
   * How to split stream chunks:
   * - 'newline_json' expects JSON objects separated by newlines (common Gemini behavior)
   * - 'json_array' expects the body is a JSON array of objects (rare)
   */
  framing: "newline_json" | "json_array";

  /**
   * Deterministic tool call ids:
   * Gemini doesn't provide call IDs consistently; we optionally embed one under __callId in args.
   */
  deterministicToolCallIds: boolean;
  toolCallIdSalt?: string;

  /**
   * Optional max buffer size (bytes) to prevent runaway if upstream sends unexpected content.
   */
  maxBufferBytes: number;
}

export class GeminiStreamAdapterService {
  constructor(private readonly cfg: GeminiStreamAdapterConfig) {}

  /**
   * Consume a streaming response body and emit StreamEvents.
   *
   * Returns final collected text + tool calls. Tool calls are NOT emitted as deltas.
   */
  async consume(params: {
    provider: LLMProvider; // should be 'google'
    model: string;
    traceId: string;
    kind: "answer" | "nav_pills" | "system";

    sink: StreamSink;
    streamingConfig: LLMStreamingConfig;

    state: StreamState;

    body: ReadableStream<Uint8Array>;
    /** Optional abort signal */
    signal?: AbortSignal;

    /** Optional hooks */
    onFirstToken?: () => void;
  }): Promise<GeminiStreamCollected> {
    const {
      provider,
      model,
      traceId,
      kind,
      sink,
      streamingConfig,
      state,
      body,
      signal,
      onFirstToken,
    } = params;

    const collected: GeminiStreamCollected = {
      text: "",
      toolCalls: [],
    };

    // Start event is emitted by the caller (geminiClient). This adapter only emits deltas/markers/final if requested.
    // We will only emit deltas and markers here.

    const reader = body.getReader();
    const decoder = new TextDecoder("utf-8");

    let buffer = "";
    let firstToken = false;

    const maxCharsPerDelta = streamingConfig.chunking?.maxCharsPerDelta ?? 64;
    const targetDeltaEveryMs =
      streamingConfig.chunking?.targetDeltaEveryMs ?? 0;

    // Marker hold
    const holdPolicy = streamingConfig.markerHold;
    const shouldHoldMarkers = !!holdPolicy?.enabled;
    const maxHeldMarkers = holdPolicy?.maxBufferedMarkers ?? 100;

    while (sink.isOpen()) {
      if (signal?.aborted) break;

      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Guard
      if (Buffer.byteLength(buffer, "utf8") > this.cfg.maxBufferBytes) {
        // Hard stop: avoid runaway memory; caller will handle as error.
        throw new Error("GEMINI_STREAM_BUFFER_OVERFLOW");
      }

      if (this.cfg.framing === "newline_json") {
        // Parse line-by-line
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          const chunk = safeJsonParse<GeminiStreamChunk>(trimmed);
          if (!chunk) continue;

          const parsed = this.extractFromChunk(chunk);

          // Tool calls (collect only)
          if (parsed.toolCalls.length) {
            for (const tc of parsed.toolCalls) {
              collected.toolCalls.push(tc);
              // Also store marker if you want, but do not emit to UI
            }
          }

          // Text delta (stream)
          if (parsed.text) {
            if (!firstToken) {
              firstToken = true;
              state.firstTokenAtMs = Date.now();
              onFirstToken?.();
            }

            collected.text += parsed.text;
            state.accumulatedText += parsed.text;

            // Chunk into steady deltas
            const chunks = chunkText(parsed.text, maxCharsPerDelta);
            for (const cText of chunks) {
              if (!sink.isOpen()) break;

              const delta: StreamDelta = { text: cText };
              sink.write({ event: "delta", data: delta });

              if (targetDeltaEveryMs > 0) await sleep(targetDeltaEveryMs);
            }
          }

          // Finish reason (collect)
          if (parsed.finishReason) collected.finishReason = parsed.finishReason;

          // Usage (collect if present)
          if (parsed.usage) collected.usage = parsed.usage;

          // Markers: this adapter can optionally detect markers inside text (lightweight).
          // IMPORTANT: Real marker generation should be done by your pipeline services.
          // Here we only do a safe minimal pass: **Filename.ext** tokens.
          if (parsed.text) {
            const markers = detectBoldFilenameMarkers(parsed.text);
            if (markers.length) {
              for (const m of markers) {
                if (shouldHoldMarkers) {
                  if (state.heldMarkers.length < maxHeldMarkers)
                    state.heldMarkers.push(m);
                } else {
                  state.markers.push(m);
                  sink.write({ event: "marker", data: m });
                }
              }
            }
          }

          // If marker holding is on + flushAt paragraph boundaries, flush when we see "\n\n"
          if (
            shouldHoldMarkers &&
            holdPolicy.flushAt === "paragraph_boundary" &&
            parsed.text.includes("\n\n")
          ) {
            this.flushHeldMarkers(state, sink);
          }
        }
      } else {
        // json_array framing (rare): wait until buffer is complete JSON
        const trimmed = buffer.trim();
        const arr = safeJsonParse<GeminiStreamChunk[]>(trimmed);
        if (!arr) continue;

        for (const chunk of arr) {
          const parsed = this.extractFromChunk(chunk);

          if (parsed.toolCalls.length)
            collected.toolCalls.push(...parsed.toolCalls);

          if (parsed.text) {
            if (!firstToken) {
              firstToken = true;
              state.firstTokenAtMs = Date.now();
              onFirstToken?.();
            }

            collected.text += parsed.text;
            state.accumulatedText += parsed.text;

            const chunks = chunkText(parsed.text, maxCharsPerDelta);
            for (const cText of chunks) {
              if (!sink.isOpen()) break;
              sink.write({ event: "delta", data: { text: cText } });
              if (targetDeltaEveryMs > 0) await sleep(targetDeltaEveryMs);
            }
          }

          if (parsed.finishReason) collected.finishReason = parsed.finishReason;
          if (parsed.usage) collected.usage = parsed.usage;
        }

        // consume buffer completely
        buffer = "";
      }
    }

    // Final marker flush if policy says flush at final
    if (shouldHoldMarkers && holdPolicy.flushAt === "final") {
      this.flushHeldMarkers(state, sink);
    }

    // Keep state markers consistent
    if (state.heldMarkers.length) {
      // If still held (flushAt=never), keep them only in heldMarkers.
      // Orchestrator may attach them to final payload instead.
    }

    return collected;
  }

  /* ------------------------- parsing helpers ------------------------- */

  private extractFromChunk(chunk: GeminiStreamChunk): {
    text: string;
    toolCalls: ProviderToolCall[];
    finishReason?: string;
    usage?: GeminiStreamCollected["usage"];
  } {
    const candidates = chunk.candidates ?? [];
    const c0 = candidates[0];
    const parts = c0?.content?.parts ?? [];

    let text = "";
    const toolCalls: ProviderToolCall[] = [];

    for (const p of parts) {
      if (typeof (p as any)?.text === "string") {
        text += (p as any).text;
      } else if (typeof (p as any)?.functionCall?.name === "string") {
        const fc = (p as any).functionCall as {
          name: string;
          args?: Record<string, unknown>;
        };
        const normalized = this.normalizeToolCall(fc.name, fc.args ?? {});
        toolCalls.push(normalized);
      }
    }

    const usage = chunk.usageMetadata
      ? {
          promptTokens: chunk.usageMetadata.promptTokenCount,
          completionTokens: chunk.usageMetadata.candidatesTokenCount,
          totalTokens: chunk.usageMetadata.totalTokenCount,
        }
      : undefined;

    return {
      text,
      toolCalls,
      finishReason: c0?.finishReason,
      usage,
    };
  }

  private normalizeToolCall(
    name: string,
    args: Record<string, unknown>,
  ): ProviderToolCall {
    let safeArgs = args;

    if (this.cfg.deterministicToolCallIds) {
      const callId = deterministicToolCallId(
        name,
        safeArgs,
        this.cfg.toolCallIdSalt ?? "",
      );
      if (!Object.prototype.hasOwnProperty.call(safeArgs, "__callId")) {
        safeArgs = { ...safeArgs, __callId: callId };
      }
    }

    return {
      provider: "google",
      name,
      args: safeArgs,
    };
  }

  private flushHeldMarkers(state: StreamState, sink: StreamSink): void {
    if (!sink.isOpen()) return;
    if (!state.heldMarkers.length) return;

    // Move held -> markers, emit
    const toFlush = state.heldMarkers.splice(0, state.heldMarkers.length);
    for (const m of toFlush) {
      state.markers.push(m);
      sink.write({ event: "marker", data: m });
    }
  }
}

/* ----------------------------- utilities ----------------------------- */

function safeJsonParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function chunkText(text: string, maxChars: number): string[] {
  if (!text) return [];
  if (maxChars <= 0) return [text];

  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    out.push(text.slice(i, i + maxChars));
    i += maxChars;
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

/**
 * Minimal marker detector:
 * Detects **Filename.ext** patterns (frontend clickable contract).
 * This is NOT a substitute for pipeline marker generation.
 */
function detectBoldFilenameMarkers(deltaText: string): StreamMarker[] {
  const markers: StreamMarker[] = [];
  // Match **something.ext** where ext is 2-6 letters/numbers
  const re = /\*\*([^\*\n]{1,160}\.[a-z0-9]{2,6})\*\*/gi;

  let m: RegExpExecArray | null;
  while ((m = re.exec(deltaText)) !== null) {
    const filename = m[1];
    markers.push({
      type: "doc_ref",
      raw: `**${filename}**`,
      meta: { filename },
    });
  }
  return markers;
}

function deterministicToolCallId(
  name: string,
  args: Record<string, unknown>,
  salt: string,
): string {
  const stableArgs = sortKeysDeep(args);
  const h = crypto.createHash("sha256");
  h.update(salt);
  h.update("|");
  h.update(name);
  h.update("|");
  h.update(JSON.stringify(stableArgs));
  return h.digest("hex").slice(0, 24);
}

function sortKeysDeep<T>(x: T): T {
  if (x === null || typeof x !== "object") return x;
  if (Array.isArray(x)) return x.map(sortKeysDeep) as unknown as T;

  const obj = x as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) out[k] = sortKeysDeep(obj[k]);
  return out as T;
}
