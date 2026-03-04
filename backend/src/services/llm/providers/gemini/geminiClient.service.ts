/**
 * geminiClient.service.ts
 *
 * Gemini (Google) LLM client for Allybi, aligned with the README "Gemini fast worker" guidance:
 * - Gemini 3.0 Flash: low-latency intent/routing/scope/discovery/first-pass answers
 *
 * This file:
 * - Implements the provider-agnostic LLMClient interface
 * - Supports non-streamed + streamed generation
 * - Supports (basic) tool calling normalization
 * - Emits StreamEvents via StreamSink to achieve ChatGPT-parity streaming feel
 *
 * IMPORTANT:
 * - No user-facing microcopy here.
 * - No hardcoded policy logic here (trust gates live elsewhere).
 * - Deterministic behaviors where possible (stable chunking, stable parsing).
 */

import crypto from "crypto";

import type {
  LLMClient,
  LLMRequest,
  LLMCompletionResponse,
  LLMStreamResponse,
} from "./llmClient.interface";

import type { LLMProvider } from "./llmErrors.types";
import type { ProviderToolCall } from "./llmTools.types";

import type {
  LLMStreamingConfig,
  StreamSink,
  StreamState,
  StreamEvent,
  StreamDelta,
  StreamingHooks,
} from "./llmStreaming.types";

type GeminiRole = "user" | "model";

/**
 * Gemini REST payload (Generative Language API).
 * We keep this minimal and provider-agnostic.
 */
interface GeminiPartText {
  text: string;
}

interface GeminiPartFunctionCall {
  functionCall: {
    name: string;
    args?: Record<string, unknown>;
  };
}

interface GeminiPartFunctionResponse {
  functionResponse: {
    name: string;
    response: Record<string, unknown>;
  };
}

type GeminiPart =
  | GeminiPartText
  | GeminiPartFunctionCall
  | GeminiPartFunctionResponse;

interface GeminiContent {
  role: GeminiRole;
  parts: GeminiPart[];
}

interface GeminiToolSchema {
  functionDeclarations: Array<{
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  }>;
}

interface GeminiGenerateRequest {
  contents: GeminiContent[];
  systemInstruction?: { parts: Array<{ text: string }> };
  tools?: GeminiToolSchema[];
  generationConfig?: {
    temperature?: number;
    topP?: number;
    maxOutputTokens?: number;
  };
  // safetySettings intentionally not forced here; handled by safety gate elsewhere
}

interface GeminiCandidate {
  content?: GeminiContent;
  finishReason?: string;
}

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

interface GeminiGenerateResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
}

export interface GeminiClientConfig {
  /**
   * Google Generative Language API key.
   * Keep in env/config, never hardcode.
   */
  apiKey: string;

  /**
   * Base URL for the Generative Language API.
   * Example: https://generativelanguage.googleapis.com/v1beta
   */
  baseUrl: string;

  /**
   * Default model names used by the router (bank-driven upstream).
   * You can still pass any model through LLMRequest.model.model.
   */
  defaults?: {
    gemini3?: string;
    gemini3Flash?: string;
  };

  /**
   * Hard timeout for provider calls (ms).
   */
  timeoutMs: number;

  /**
   * Timeout for ping() health check (ms).
   */
  pingTimeoutMs?: number;
}

export class GeminiClientService implements LLMClient {
  public readonly provider: LLMProvider = "google";

  constructor(private readonly cfg: GeminiClientConfig) {}

  async ping(): Promise<{ ok: boolean; provider: LLMProvider; t: number }> {
    const t = Date.now();
    try {
      const base = this.cfg.baseUrl.replace(/\/$/, "");
      const url = `${base}/models`;
      const ac = new AbortController();
      const timeout = setTimeout(() => ac.abort(), this.cfg.pingTimeoutMs ?? 5000);
      try {
        const res = await fetch(url, { signal: ac.signal, headers: this.headers() });
        return { ok: res.ok, provider: "google", t };
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      return { ok: false, provider: "google", t };
    }
  }

  async complete(req: LLMRequest, signal?: AbortSignal): Promise<LLMCompletionResponse> {
    const ac = new AbortController();
    if (signal) signal.addEventListener("abort", () => ac.abort(), { once: true });
    const timeout = setTimeout(() => ac.abort(), this.cfg.timeoutMs);

    try {
      const url = this.buildGenerateUrl(req.model.model);
      const body = this.buildGeminiRequest(req);

      const res = await fetch(url, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: ac.signal,
      });

      const requestId = res.headers.get("x-request-id") ?? undefined;

      if (!res.ok) {
        const errText = await safeReadText(res);
        throw new Error(
          JSON.stringify({
            code: "GEMINI_HTTP_ERROR",
            status: res.status,
            body: truncate(errText, 2000),
          }),
        );
      }

      const json = (await res.json()) as GeminiGenerateResponse;

      const parsed = this.parseGeminiResponse(json);
      return {
        traceId: req.traceId,
        turnId: req.turnId,
        model: req.model,
        content: parsed.text,
        finishReason: normalizeFinishReason(parsed.finishReason),
        toolCallRequest: parsed.toolCalls?.length
          ? { toolCalls: parsed.toolCalls }
          : undefined,
        usage: {
          promptTokens: json.usageMetadata?.promptTokenCount,
          completionTokens: json.usageMetadata?.candidatesTokenCount,
          totalTokens: json.usageMetadata?.totalTokenCount,
        },
        requestId,
        raw: undefined, // keep off by default; add via config if you want
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async stream(params: {
    req: LLMRequest;
    sink: StreamSink;
    config: LLMStreamingConfig;
    hooks?: StreamingHooks;
    initialState?: Partial<StreamState>;
    signal?: AbortSignal;
  }): Promise<LLMStreamResponse> {
    const { req, sink, config, hooks, initialState, signal } = params;

    const state: StreamState = {
      phase: "init",
      kind: this.inferKind(req),
      traceId: req.traceId,
      startedAtMs: Date.now(),
      accumulatedText: "",
      markers: [],
      heldMarkers: [],
      abortRequested: false,
      ...initialState,
    };

    // Emit start
    this.emit(sink, {
      event: "start",
      data: { kind: state.kind, t: Date.now(), traceId: state.traceId },
    });
    hooks?.onStart?.(state);

    const ac = new AbortController();
    if (signal) signal.addEventListener("abort", () => ac.abort(), { once: true });
    const timeout = setTimeout(() => ac.abort(), this.cfg.timeoutMs);

    try {
      const url = this.buildStreamUrl(req.model.model);
      const body = this.buildGeminiRequest(req);

      // Gemini streaming endpoint returns a stream of JSON objects (often NDJSON-ish).
      const res = await fetch(url, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: ac.signal,
      });

      const requestId = res.headers.get("x-request-id") ?? undefined;

      if (!res.ok || !res.body) {
        const errText = await safeReadText(res);
        throw new Error(
          JSON.stringify({
            code: "LLM_PROVIDER_BAD_REQUEST",
            status: res.status,
            body: truncate(errText, 2000),
          }),
        );
      }

      state.phase = "preamble";

      // Stream parse — SSE (alt=sse) returns "data: {json}\n\n" events incrementally
      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");

      let buffer = "";
      let firstTokenEmitted = false;
      let usageMetadata: GeminiUsageMetadata | undefined;
      let finishReason = "unknown";

      while (sink.isOpen()) {
        const { value, done } = await reader.read();
        if (done) break;

        // Normalize \r\n → \n (Gemini API sometimes returns \r\n line endings)
        buffer += decoder
          .decode(value, { stream: true })
          .replace(/\r\n/g, "\n");

        // Process complete SSE events as they arrive
        let boundary: number;
        while ((boundary = buffer.indexOf("\n\n")) >= 0) {
          const eventBlock = buffer.slice(0, boundary).trim();
          buffer = buffer.slice(boundary + 2);

          if (!eventBlock) continue;

          // Extract JSON from "data: {...}" line(s)
          const dataLines = eventBlock
            .split("\n")
            .filter((line) => line.startsWith("data: "))
            .map((line) => line.slice(6));
          const jsonStr = dataLines.join("");
          if (!jsonStr) continue;

          const chunkResp = safeJsonParse(
            jsonStr,
          ) as GeminiGenerateResponse | null;
          if (!chunkResp) continue;

          const parsed = this.parseGeminiResponse(chunkResp);
          if (parsed.finishReason) {
            finishReason = normalizeFinishReason(parsed.finishReason);
          }

          // Capture usage from the last chunk that has it
          if (chunkResp.usageMetadata) {
            usageMetadata = chunkResp.usageMetadata;
          }

          if (parsed.text) {
            if (!firstTokenEmitted) {
              firstTokenEmitted = true;
              state.firstTokenAtMs = Date.now();
              this.emit(sink, {
                event: "progress",
                data: { stage: "generation", t: Date.now() },
              });
              hooks?.onFirstToken?.(state);
            }

            // Chunking for smooth output
            const deltas = chunkText(
              parsed.text,
              config.chunking?.maxCharsPerDelta ?? 64,
            );

            for (const dText of deltas) {
              if (!sink.isOpen()) break;

              const delta: StreamDelta = { text: dText };
              state.phase = "delta";
              state.accumulatedText += dText;

              this.emit(sink, { event: "delta", data: delta });
              hooks?.onDelta?.(delta, state);
            }
          }
        }
      }

      // Final event
      state.phase = "finalizing";

      const finalEvent: StreamEvent = {
        event: "final",
        data: {
          text: state.accumulatedText,
          kind: state.kind,
          llm: {
            provider: "google",
            model: req.model.model,
          },
          markers: state.markers,
          traceId: state.traceId,
          timings: {
            startMs: state.startedAtMs,
            firstTokenMs: state.firstTokenAtMs,
            endMs: Date.now(),
          },
        },
      };

      this.emit(sink, finalEvent);
      hooks?.onFinal?.(finalEvent.data, state);

      sink.close();

      return {
        traceId: req.traceId,
        turnId: req.turnId,
        model: req.model,
        finalText: state.accumulatedText,
        usage: usageMetadata
          ? {
              promptTokens: usageMetadata.promptTokenCount,
              completionTokens: usageMetadata.candidatesTokenCount,
              totalTokens: usageMetadata.totalTokenCount,
            }
          : undefined,
        finishReason,
        requestId,
      };
    } catch (e) {
      // Abort vs error
      if (!sink.isOpen()) {
        clearTimeout(timeout);
        return {
          traceId: req.traceId,
          turnId: req.turnId,
          model: req.model,
          finalText: state.accumulatedText,
        };
      }

      // Let gateway-level fallback handle failures before any visible output.
      if (!state.accumulatedText) throw e;

      const isAbort =
        e instanceof Error &&
        (e.name === "AbortError" || /abort/i.test(e.message));
      if (isAbort) {
        state.phase = "aborted";
        const abortEvent: StreamEvent = {
          event: "abort",
          data: { reason: "timeout", t: Date.now(), traceId: state.traceId },
        };
        this.emit(sink, abortEvent);
        hooks?.onAbort?.(abortEvent.data, state);
      } else {
        state.phase = "error";
        const errEvent: StreamEvent = {
          event: "error",
          data: {
            code: "LLM_GENERATION_FAILED",
            message: sanitizeErrMessage(e),
            traceId: state.traceId,
            t: Date.now(),
          },
        };
        this.emit(sink, errEvent);
        hooks?.onError?.(errEvent.data, state);
      }

      sink.close();
      return {
        traceId: req.traceId,
        turnId: req.turnId,
        model: req.model,
        finalText: state.accumulatedText,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  normalizeToolCalls(raw: unknown): ProviderToolCall[] {
    // Best-effort normalization if you parse tool calls outside complete/stream.
    const resp = raw as GeminiGenerateResponse;
    const parsed = this.parseGeminiResponse(resp);
    return parsed.toolCalls ?? [];
  }

  /* ----------------------- internal helpers ----------------------- */

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": this.cfg.apiKey,
    };
  }

  private buildGenerateUrl(model: string): string {
    // v1beta/models/{model}:generateContent
    const base = this.cfg.baseUrl.replace(/\/$/, "");
    return `${base}/models/${encodeURIComponent(model)}:generateContent`;
  }

  private buildStreamUrl(model: string): string {
    // v1beta/models/{model}:streamGenerateContent?alt=sse
    // alt=sse enables Server-Sent Events for true incremental streaming
    const base = this.cfg.baseUrl.replace(/\/$/, "");
    return `${base}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
  }

  private inferKind(req: LLMRequest): "answer" | "nav_pills" | "system" {
    // Keep simple and deterministic: upstream routing should set this in a bank signal.
    // If you have a purpose hint you can map it; otherwise default to answer.
    if (
      req.purpose === "intent_routing" ||
      req.purpose === "retrieval_planning"
    )
      return "system";
    return "answer";
  }

  private buildGeminiRequest(req: LLMRequest): GeminiGenerateRequest {
    const contents: GeminiContent[] = [];
    const systemParts: string[] = [];

    for (const m of req.messages) {
      // Map roles -> Gemini roles.
      // - system/developer -> top-level systemInstruction
      // - assistant -> model
      // - tool -> user (functionResponse part)
      if (m.role === "system" || m.role === "developer") {
        const text = (m.content ?? "").trim();
        if (text) systemParts.push(text);
        continue;
      }

      if (m.role === "user") {
        contents.push({
          role: "user",
          parts: [{ text: m.content ?? "" }],
        });
        continue;
      }

      if (m.role === "assistant") {
        // If toolCalls exist, represent as functionCall parts (Gemini format)
        const parts: GeminiPart[] = [];
        if (m.content) parts.push({ text: m.content });

        if (m.toolCalls?.length) {
          for (const tc of m.toolCalls) {
            // ProviderToolCall union: map into functionCall
            parts.push({
              functionCall: {
                name: tc.name,
                args:
                  "args" in tc
                    ? (tc.args as Record<string, unknown>)
                    : (safeJsonParse(tc.argumentsJson) ?? {}),
              },
            } as GeminiPartFunctionCall);
          }
        }

        contents.push({ role: "model", parts });
        continue;
      }

      if (m.role === "tool") {
        // Function response part
        if (m.toolResult) {
          contents.push({
            role: "user",
            parts: [
              {
                functionResponse: {
                  name: m.toolResult.toolName,
                  response: {
                    ok: m.toolResult.ok,
                    output: m.toolResult.output ?? null,
                    error: m.toolResult.error ?? null,
                  },
                },
              } as GeminiPartFunctionResponse,
            ],
          });
        }
        continue;
      }
    }

    const out: GeminiGenerateRequest = {
      contents,
      generationConfig: {
        temperature: req.sampling?.temperature,
        topP: req.sampling?.topP,
        maxOutputTokens: req.sampling?.maxOutputTokens,
      },
    };

    // Use top-level systemInstruction for system/developer messages
    if (systemParts.length > 0) {
      out.systemInstruction = {
        parts: systemParts.map((text) => ({ text })),
      };
    }

    // Tools: Gemini uses functionDeclarations
    if (req.tools?.enabled && req.tools.registry?.tools?.length) {
      out.tools = [
        {
          functionDeclarations: req.tools.registry.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.inputSchema ?? {},
          })),
        },
      ];
    }

    return out;
  }

  private parseGeminiResponse(resp: GeminiGenerateResponse): {
    text: string;
    toolCalls?: ProviderToolCall[];
    finishReason?: string;
  } {
    const candidates = resp.candidates ?? [];
    if (candidates.length === 0) return { text: "" };

    // Deterministic: use first candidate only
    const c0 = candidates[0];
    const content = c0.content;
    if (!content?.parts?.length)
      return { text: "", finishReason: c0.finishReason };

    let text = "";
    const toolCalls: ProviderToolCall[] = [];

    for (const p of content.parts) {
      // Skip thinking/thought parts — only include actual response text
      if ((p as unknown as Record<string, unknown>).thought === true) continue;
      if ("text" in p && typeof p.text === "string") {
        text += p.text;
      } else if ("functionCall" in p && p.functionCall?.name) {
        // Normalize Gemini functionCall into ProviderToolCall
        const callId = makeDeterministicCallId(
          p.functionCall.name,
          p.functionCall.args,
        );
        toolCalls.push({
          provider: "google",
          callId,
          name: p.functionCall.name,
          args: p.functionCall.args ?? {},
        });
      }
    }

    return toolCalls.length
      ? { text, toolCalls, finishReason: c0.finishReason }
      : { text, finishReason: c0.finishReason };
  }

  private emit(sink: StreamSink, event: StreamEvent): void {
    if (!sink.isOpen()) return;
    sink.write(event);
    sink.flush?.();
  }
}

/* ----------------------------- utils ----------------------------- */

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + "…";
}

function sanitizeErrMessage(e: unknown): string {
  if (e instanceof Error) return truncate(e.message, 800);
  return "unknown_error";
}

function normalizeFinishReason(raw: unknown): string {
  const value = String(raw || "").toLowerCase();
  if (!value) return "unknown";
  if (value.includes("stop")) return "stop";
  if (value.includes("max_token") || value.includes("length")) return "length";
  if (value.includes("safety") || value.includes("content_filter"))
    return "content_filter";
  if (value.includes("tool")) return "tool_calls";
  if (value.includes("cancel")) return "cancelled";
  if (value.includes("error")) return "error";
  return value;
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

function makeDeterministicCallId(name: string, args: unknown): string {
  const h = crypto.createHash("sha256");
  h.update(String(name));
  h.update("|");
  h.update(JSON.stringify(sortKeysDeep(args ?? {})));
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
