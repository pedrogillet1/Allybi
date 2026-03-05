// src/services/llm/providers/openai/openaiClient.service.ts

/**
 * OpenAIClientService (Allybi, ChatGPT-parity, high-detail)
 * -------------------------------------------------------
 * Role in Allybi (as agreed):
 *   - OpenAI is the *precision finisher* lane.
 *   - Single model: gpt-5.2 (all OpenAI lanes)
 *   - Used when:
 *       - numeric integrity / quote strictness / hallucination guard / policy retry
 *       - final-pass “clean + correct” composition
 *
 * Streaming requirements:
 *   - Must stream deltas in small chunks (ChatGPT-like feel)
 *   - Must support AbortSignal and stop cleanly
 *   - Must preserve tool call deltas (if tools are enabled)
 *
 * Integration:
 *   - This client returns provider-native chat.completions streaming chunks.
 *   - LlmStreamAdapterService normalizes those chunks into LlmStreamEvent.
 *
 * IMPORTANT:
 *   - This client is transport-only. No policy logic. No output contract enforcement.
 *   - It never logs secrets.
 */

import OpenAI from "openai";
import type {
  LlmClient,
  LlmRequest,
  LlmCallResult,
  LlmStreamResult,
  LlmMessage,
  LlmProviderId,
  LlmModelId,
} from "../../types/llm.types";
import { toCostFamilyModel } from "../../core/llmCostCalculator";

type OpenAIConfig = {
  apiKey: string;
  baseURL?: string;
  organization?: string;
  project?: string;

  // timeouts
  timeoutMs: number;

  // default models (Allybi plan)
  defaultModelDraft: LlmModelId; // gpt-5.2
  defaultModelFinal: LlmModelId; // gpt-5.2

  // routing guardrails
  allowedModels: LlmModelId[]; // explicit allowlist for safety + determinism
  strictModelAllowlist: boolean;

  // streaming
  includeUsageInStream: boolean;
  maxDeltaCharsSoft: number; // server-side delta chunking to avoid huge bursts

  // tools
  allowTools: boolean; // can be disabled globally for OpenAI provider
};

const DEFAULT_CONFIG: OpenAIConfig = {
  apiKey: process.env.OPENAI_API_KEY || "",
  baseURL: process.env.OPENAI_BASE_URL || undefined,
  organization: process.env.OPENAI_ORG_ID || undefined,
  project: process.env.OPENAI_PROJECT_ID || undefined,

  timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS || 30000),

  defaultModelDraft: "gpt-5.2",
  defaultModelFinal: "gpt-5.2",

  allowedModels: ["gpt-5.2"],
  strictModelAllowlist: true,

  includeUsageInStream: true,
  maxDeltaCharsSoft: 64,

  allowTools: true,
};

// ------------------------------
// Helpers
// ------------------------------

function safeString(x: unknown): string {
  if (typeof x === "string") return x;
  if (x == null) return "";
  return String(x);
}

function capDelta(text: string, maxChars: number): string[] {
  if (!text) return [];
  const max = Math.max(16, Math.min(256, Number(maxChars) || 64));
  if (text.length <= max) return [text];
  const out: string[] = [];
  for (let i = 0; i < text.length; i += max) out.push(text.slice(i, i + max));
  return out;
}

export function resolveOpenAIModel(
  routeModel: string | undefined,
  cfg: Pick<
    OpenAIConfig,
    "allowedModels" | "defaultModelFinal" | "strictModelAllowlist"
  >,
): string {
  const m = (routeModel || "").trim();
  if (!m) return cfg.defaultModelFinal;
  if (cfg.strictModelAllowlist === false) return m;

  const allowed =
    Array.isArray(cfg.allowedModels) && cfg.allowedModels.length > 0
      ? (cfg.allowedModels as string[])
      : [cfg.defaultModelFinal];
  if (allowed.includes(m)) return m;
  const family = toCostFamilyModel(m);
  if (family && allowed.includes(family)) return m;
  // Deterministic fallback: default final
  return cfg.defaultModelFinal;
}

/**
 * Convert Allybi messages into OpenAI chat messages.
 * Notes:
 *  - We support: system, developer, user, assistant, tool
 *  - For multimodal parts, we currently only pass text; images are disallowed by Allybi constraints
 */
function toOpenAIChatMessages(messages: LlmMessage[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];

  for (const m of messages) {
    const role = m.role;

    // Tool result message
    if (role === "tool") {
      out.push({
        role: "tool",
        tool_call_id: m.toolCallId || "",
        content:
          m.content ??
          (m.parts?.find((p) => p.type === "text") as { type: "text"; text: string } | undefined)?.text ??
          "",
      });
      continue;
    }

    // Other roles
    const content =
      m.content ??
      (Array.isArray(m.parts)
        ? m.parts
            .map((p) => (p.type === "text" ? p.text : ""))
            .filter(Boolean)
            .join("")
        : "");

    // OpenAI chat supports "developer" role (newer models), but if your account/library doesn’t,
    // you can map it to "system". We keep it as "developer" for parity.
    out.push({ role, content });
  }

  return out;
}

/**
 * Tool normalization:
 * Allybi tool schemas are provider-agnostic. OpenAI expects:
 *  { type: "function", function: { name, description, parameters } }
 */
function toOpenAITools(tools: Array<Record<string, unknown>> | undefined): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(tools) || tools.length === 0) return undefined;

  // If tools are already in OpenAI shape, pass through.
  // Otherwise, attempt to map minimal fields.
  return tools.map((t) => {
    const toolRecord = t as Record<string, any>;
    const fn = (toolRecord.function as Record<string, any> | undefined) ?? {};
    if (toolRecord.type === "function" && toolRecord.function) return toolRecord;

    const name = toolRecord.name || fn.name;
    const description = toolRecord.description || fn.description || "";
    const parameters = toolRecord.parameters ||
      fn.parameters ||
      toolRecord.schema || { type: "object", properties: {} };

    return {
      type: "function",
      function: {
        name,
        description,
        parameters,
      },
    };
  });
}

/**
 * OpenAI tool_choice normalization:
 * - "auto" | "none" | { name: string }
 */
function toOpenAIToolChoice(toolChoice: unknown): Record<string, unknown> | string | undefined {
  if (!toolChoice) return undefined;
  if (toolChoice === "auto" || toolChoice === "none") return toolChoice;
  if (typeof toolChoice === "object" && (toolChoice as Record<string, unknown>).name) {
    return { type: "function", function: { name: (toolChoice as Record<string, unknown>).name } };
  }
  return undefined;
}

/**
 * Build OpenAI chat completion payload.
 * We intentionally keep a provider-level payload small; Allybi behavior is in banks.
 */
function buildChatCompletionPayload(
  request: LlmRequest,
  cfg: OpenAIConfig,
  streaming: boolean,
  resolvedModel?: string,
): Record<string, unknown> {
  const model = resolvedModel || resolveOpenAIModel(request.route?.model, cfg);

  const messages = toOpenAIChatMessages(request.messages);

  const temperature = request.options?.temperature;
  const top_p = request.options?.topP;
  const stop = request.options?.stop;

  const maxOut = request.options?.maxOutputTokens;

  const tools = cfg.allowTools ? toOpenAITools(request.tools as Array<Record<string, unknown>> | undefined) : undefined;
  const tool_choice = cfg.allowTools
    ? toOpenAIToolChoice(request.toolChoice)
    : "none";

  const payload: Record<string, unknown> = {
    model,
    messages,
    stream: streaming,
    temperature,
    top_p,
    stop,

    // GPT-5+ models require max_completion_tokens (max_tokens is deprecated for these models).
    ...(typeof maxOut === "number"
      ? { max_completion_tokens: Math.max(1, Math.floor(maxOut)) }
      : {}),

    // Tools (function calling)
    ...(tools ? { tools } : {}),
    ...(tool_choice ? { tool_choice } : {}),

    // Stream usage (if supported)
    ...(streaming && cfg.includeUsageInStream
      ? { stream_options: { include_usage: true } }
      : {}),
  };

  return payload;
}

function buildRequestHeaders(request: LlmRequest): Record<string, string> {
  const headers: Record<string, string> = {};
  if (request.correlationId)
    headers["X-Correlation-Id"] = request.correlationId;
  return headers;
}

/**
 * Some OpenAI SDK stream items can contain large deltas.
 * We pass them through but also provide an optional normalization hook:
 * yield smaller "chunk-like" objects with choices[0].delta.content sliced.
 */
async function* normalizeOpenAIStreamChunks(
  rawStream: AsyncIterable<Record<string, unknown>>,
  maxDeltaCharsSoft: number,
): AsyncIterable<Record<string, unknown>> {
  for await (const chunk of rawStream) {
    const choices = chunk?.choices as Array<Record<string, unknown>> | undefined;
    const delta = (choices?.[0]?.delta as Record<string, unknown> | undefined)?.content;
    if (typeof delta === "string" && delta.length > maxDeltaCharsSoft) {
      const pieces = capDelta(delta, maxDeltaCharsSoft);
      for (const p of pieces) {
        // clone chunk but replace delta content with smaller piece
        const choices = chunk.choices as Array<Record<string, unknown>>;
        const cloned = {
          ...chunk,
          choices: choices.map((c: Record<string, unknown>, idx: number) =>
            idx === 0 ? { ...c, delta: { ...((c.delta as Record<string, unknown>) || {}), content: p } } : c,
          ),
        };
        yield cloned;
      }
      continue;
    }
    yield chunk;
  }
}

// ------------------------------
// Service
// ------------------------------

export class OpenAIClientService implements LlmClient {
  public readonly provider: LlmProviderId = "openai";

  private readonly cfg: OpenAIConfig;
  private readonly client: OpenAI;

  constructor(cfg: Partial<OpenAIConfig> = {}) {
    this.cfg = { ...DEFAULT_CONFIG, ...cfg };

    if (!this.cfg.apiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    this.client = new OpenAI({
      apiKey: this.cfg.apiKey,
      baseURL: this.cfg.baseURL,
      organization: this.cfg.organization,
      project: this.cfg.project,
      timeout: this.cfg.timeoutMs,
    });
  }

  /**
   * Non-streaming completion.
   * Downstream LlmResponseParserService will parse `raw`.
   */
  async call(
    request: LlmRequest,
    signal?: AbortSignal,
  ): Promise<LlmCallResult> {
    const resolvedModel = this.resolveRequestedModel(request.route?.model);
    const payload = buildChatCompletionPayload(
      request,
      this.cfg,
      false,
      resolvedModel,
    );
    const headers = buildRequestHeaders(request);

    const raw = await this.client.chat.completions.create(
      payload as unknown as Parameters<typeof this.client.chat.completions.create>[0],
      { signal, headers } as Parameters<typeof this.client.chat.completions.create>[1],
    );

    // Parse text and finishReason from response
    const rawObj = raw as unknown as Record<string, unknown>;
    const choices = rawObj.choices as Array<Record<string, unknown>> | undefined;
    const firstChoice = choices?.[0];
    const msg = firstChoice?.message as Record<string, unknown> | undefined;
    const text = typeof msg?.content === "string" ? msg.content : "";
    const finishReason = (typeof firstChoice?.finish_reason === "string"
      ? firstChoice.finish_reason
      : "unknown") as import("../../types/llm.types").LlmFinishReason;

    return {
      response: {
        text,
        finishReason,
        raw,
      },
    };
  }

  /**
   * Streaming completion.
   * Returns provider-native chunks (ChatCompletionChunk-like).
   * LlmStreamAdapterService will normalize into internal events.
   */
  async stream(
    request: LlmRequest,
    signal?: AbortSignal,
  ): Promise<LlmStreamResult> {
    const resolvedModel = this.resolveRequestedModel(request.route?.model);
    const payload = buildChatCompletionPayload(
      request,
      this.cfg,
      true,
      resolvedModel,
    );
    const headers = buildRequestHeaders(request);

    // OpenAI SDK returns an AsyncIterable for streaming chat completions.
    const rawStream = await this.client.chat.completions.create(
      payload as unknown as Parameters<typeof this.client.chat.completions.create>[0],
      { signal, headers } as Parameters<typeof this.client.chat.completions.create>[1],
    );

    // Normalize large deltas into smaller delta chunks (smoother frontend streaming)
    const normalized = normalizeOpenAIStreamChunks(
      rawStream as AsyncIterable<Record<string, unknown>>,
      this.cfg.maxDeltaCharsSoft,
    );

    return {
      stream:
        normalized as unknown as AsyncIterable<
          import("../../types/llm.types").LlmStreamEvent
        >,
    };
  }

  /** Quick health check using models.list */
  async ping(): Promise<{ ok: boolean; t: number }> {
    const t = Date.now();
    try {
      await this.client.models.list();
      return { ok: true, t };
    } catch {
      return { ok: false, t };
    }
  }

  // Optional: expose configured model list (useful for debug pages)
  getAllowedModels(): string[] {
    return [...this.cfg.allowedModels];
  }

  getDefaultFinalModel(): string {
    return this.cfg.defaultModelFinal;
  }

  resolveRequestedModel(routeModel: string | undefined): string {
    return resolveOpenAIModel(routeModel, this.cfg);
  }
}

export default OpenAIClientService;

// ---------------------------------------------------------------------------
// Adapter: bridges OpenAIClientService (LlmClient) → LLMClient (core interface)
// ---------------------------------------------------------------------------

import type {
  LLMClient,
  LLMRequest as LLMRequestCore,
  LLMCompletionResponse,
  LLMStreamResponse,
} from "../../core/llmClient.interface";
import type { LLMProvider } from "../../core/llmErrors.types";
import type {
  LLMStreamingConfig,
  StreamSink,
  StreamState,
  StreamingHooks,
} from "../../types/llmStreaming.types";

export class OpenAILLMClientAdapter implements LLMClient {
  readonly provider: LLMProvider = "openai";

  constructor(private readonly inner: OpenAIClientService) {}

  async ping(): Promise<{ ok: boolean; provider: LLMProvider; t: number }> {
    const result = await this.inner.ping();
    return { ok: result.ok, provider: "openai", t: result.t };
  }

  async complete(req: LLMRequestCore, signal?: AbortSignal): Promise<LLMCompletionResponse> {
    const requestedModel = req.model.model;
    const llmReq: LlmRequest = {
      messages: req.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      options: {
        temperature: req.sampling?.temperature,
        topP: req.sampling?.topP,
        maxOutputTokens: req.sampling?.maxOutputTokens,
      },
      route: {
        provider: "openai" as LlmProviderId,
        model: req.model.model as LlmModelId,
        reason: "unknown" as const,
      },
      correlationId: req.traceId,
    };

    const result = await this.inner.call(llmReq, signal);
    const raw = result.response.raw as Record<string, unknown> | undefined;
    const usage = raw?.usage as Record<string, number> | undefined;
    const rawModel = typeof raw?.model === "string" ? raw.model : null;
    const executedModel = rawModel || this.inner.resolveRequestedModel(requestedModel);

    return {
      traceId: req.traceId,
      turnId: req.turnId,
      model: req.model,
      requestedModel: req.model,
      executedModel: {
        provider: "openai",
        model: executedModel,
      },
      content: result.response.text || "",
      finishReason: result.response.finishReason || "unknown",
      usage: usage
        ? {
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
            totalTokens: usage.total_tokens,
          }
        : undefined,
    };
  }

  async stream(params: {
    req: LLMRequestCore;
    sink: StreamSink;
    config: LLMStreamingConfig;
    hooks?: StreamingHooks;
    initialState?: Partial<StreamState>;
    signal?: AbortSignal;
  }): Promise<LLMStreamResponse> {
    const { req, sink, config, hooks, initialState, signal } = params;
    const requestedModel = req.model.model;
    const executedModel = this.inner.resolveRequestedModel(requestedModel);

    const state: StreamState = {
      phase: "init",
      kind: "answer",
      traceId: req.traceId,
      startedAtMs: Date.now(),
      accumulatedText: "",
      markers: [],
      heldMarkers: [],
      abortRequested: false,
      ...initialState,
    };

    // Emit start
    if (sink.isOpen()) {
      sink.write({ event: "start", data: { kind: state.kind, t: Date.now(), traceId: state.traceId } });
      sink.flush?.();
    }
    hooks?.onStart?.(state);

    const llmReq: LlmRequest = {
      messages: req.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      options: {
        temperature: req.sampling?.temperature,
        topP: req.sampling?.topP,
        maxOutputTokens: req.sampling?.maxOutputTokens,
      },
      route: {
        provider: "openai" as LlmProviderId,
        model: req.model.model as LlmModelId,
        reason: "unknown" as const,
      },
      correlationId: req.traceId,
    };

    try {
      const streamResult = await this.inner.stream(llmReq, signal);
      const maxChars = config.chunking?.maxCharsPerDelta ?? 64;

      for await (const chunk of streamResult.stream as AsyncIterable<Record<string, unknown>>) {
        if (!sink.isOpen()) break;

        const choices = chunk.choices as Array<Record<string, unknown>> | undefined;
        const delta = (choices?.[0]?.delta as Record<string, unknown> | undefined)?.content;

        if (typeof delta === "string" && delta) {
          if (!state.firstTokenAtMs) {
            state.firstTokenAtMs = Date.now();
            sink.write({ event: "progress", data: { stage: "generation", t: Date.now() } });
            sink.flush?.();
            hooks?.onFirstToken?.(state);
          }

          // Chunk the text
          for (let i = 0; i < delta.length; i += maxChars) {
            if (!sink.isOpen()) break;
            const piece = delta.slice(i, i + maxChars);
            state.phase = "delta";
            state.accumulatedText += piece;
            sink.write({ event: "delta", data: { text: piece } });
            sink.flush?.();
            hooks?.onDelta?.({ text: piece }, state);
          }
        }
      }

      // Final event
      state.phase = "finalizing";
      if (sink.isOpen()) {
        const finalEvent = {
          event: "final" as const,
          data: {
            text: state.accumulatedText,
            kind: state.kind,
            llm: { provider: "openai" as LLMProvider, model: executedModel },
            markers: state.markers,
            traceId: state.traceId,
            timings: {
              startMs: state.startedAtMs,
              firstTokenMs: state.firstTokenAtMs,
              endMs: Date.now(),
            },
          },
        };
        sink.write(finalEvent);
        sink.flush?.();
        hooks?.onFinal?.(finalEvent.data, state);
        sink.close();
      }

      return {
        traceId: req.traceId,
        turnId: req.turnId,
        model: req.model,
        requestedModel: req.model,
        executedModel: {
          provider: "openai",
          model: executedModel,
        },
        finalText: state.accumulatedText,
        finishReason: "stop",
      };
    } catch (e) {
      // Let gateway-level fallback handle failures before any visible output.
      if (!state.accumulatedText) throw e;

      if (sink.isOpen()) {
        const isAbort = e instanceof Error && (e.name === "AbortError" || /abort/i.test(e.message));
        if (isAbort) {
          sink.write({ event: "abort", data: { reason: "timeout", t: Date.now(), traceId: state.traceId } });
        } else {
          sink.write({
            event: "error",
            data: {
              code: "LLM_GENERATION_FAILED",
              message: e instanceof Error ? e.message.slice(0, 800) : "unknown_error",
              traceId: state.traceId,
              t: Date.now(),
            },
          });
        }
        sink.flush?.();
        sink.close();
      }
      return {
        traceId: req.traceId,
        turnId: req.turnId,
        model: req.model,
        requestedModel: req.model,
        executedModel: {
          provider: "openai",
          model: executedModel,
        },
        finalText: state.accumulatedText,
      };
    }
  }
}
