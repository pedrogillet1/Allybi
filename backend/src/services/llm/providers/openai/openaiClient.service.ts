// src/services/llm/providers/openai/openaiClient.service.ts

/**
 * OpenAIClientService (Allybi, ChatGPT-parity, high-detail)
 * -------------------------------------------------------
 * Role in Allybi (as agreed):
 *   - OpenAI is the *precision finisher* lane.
 *   - Draft model: gpt-5-mini
 *   - Final model: gpt-5.2
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

type OpenAIConfig = {
  apiKey: string;
  baseURL?: string;
  organization?: string;
  project?: string;

  // timeouts
  timeoutMs: number;

  // default models (Allybi plan)
  defaultModelDraft: LlmModelId; // gpt-5-mini
  defaultModelFinal: LlmModelId; // gpt-5.2

  // routing guardrails
  allowedModels: LlmModelId[]; // explicit allowlist for safety + determinism

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

  defaultModelDraft: "gpt-5-mini",
  defaultModelFinal: "gpt-5.2",

  allowedModels: ["gpt-5-mini", "gpt-5.2"],

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

function pickModel(routeModel: string | undefined, cfg: OpenAIConfig): string {
  const m = (routeModel || "").trim();
  if (!m) return cfg.defaultModelFinal;
  if ((cfg.allowedModels as string[]).includes(m)) return m;
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
    if (t?.type === "function" && t.function) return t;

    const name = t?.name || t?.function?.name;
    const description = t?.description || t?.function?.description || "";
    const parameters = t?.parameters ||
      t?.function?.parameters ||
      t?.schema || { type: "object", properties: {} };

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
): Record<string, unknown> {
  const model = pickModel(request.route?.model, cfg);

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
    const payload = buildChatCompletionPayload(request, this.cfg, false);
    const headers = buildRequestHeaders(request);

    const raw = await this.client.chat.completions.create(
      payload as Parameters<typeof this.client.chat.completions.create>[0],
      { signal, headers } as Parameters<typeof this.client.chat.completions.create>[1],
    );

    return {
      response: {
        text: "",
        finishReason: "unknown",
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
    const payload = buildChatCompletionPayload(request, this.cfg, true);
    const headers = buildRequestHeaders(request);

    // OpenAI SDK returns an AsyncIterable for streaming chat completions.
    const rawStream = await this.client.chat.completions.create(
      payload as Parameters<typeof this.client.chat.completions.create>[0],
      { signal, headers } as Parameters<typeof this.client.chat.completions.create>[1],
    );

    // Normalize large deltas into smaller delta chunks (smoother frontend streaming)
    const normalized = normalizeOpenAIStreamChunks(
      rawStream as AsyncIterable<Record<string, unknown>>,
      this.cfg.maxDeltaCharsSoft,
    );

    return {
      stream: normalized,
    };
  }

  // Optional: expose configured model list (useful for debug pages)
  getAllowedModels(): string[] {
    return [...this.cfg.allowedModels];
  }

  getDefaultFinalModel(): string {
    return this.cfg.defaultModelFinal;
  }
}

export default OpenAIClientService;
