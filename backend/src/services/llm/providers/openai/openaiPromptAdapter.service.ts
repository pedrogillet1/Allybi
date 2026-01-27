// src/services/llm/providers/openai/openaiPromptAdapter.service.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * OpenAIPromptAdapterService (Koda, ChatGPT-parity)
 * ------------------------------------------------
 * This adapter is the “shape + compatibility” layer between Koda’s provider-agnostic
 * LlmRequest and OpenAI’s API payload formats.
 *
 * Why this exists (and what “ChatGPT-parity” means here):
 *  - Deterministic, validated request shaping (same inputs => same payload)
 *  - Streaming-friendly (no giant deltas caused by payload mistakes)
 *  - No accidental feature drift (tools/images/roles) when providers differ
 *  - Strict model allowlist (Koda uses OpenAI primarily as the *precision finisher*)
 *
 * OpenAI lane in Koda (as agreed):
 *  - Primary model: gpt-5.2
 *  - Use cases: “final pass” correctness, numeric/quote strictness, hallucination recovery, policy retries
 *
 * Output of this adapter:
 *  - A fully-formed OpenAI request payload + headers for either:
 *      (A) Responses API   (preferred if enabled)
 *      (B) Chat Completions (fallback for broader compatibility)
 *
 * This adapter does NOT:
 *  - decide which model to use (llmRouter.service.ts does)
 *  - enforce output contracts (outputContract/quality gates do)
 *  - perform safety filtering (policy layer does)
 *
 * This adapter DOES:
 *  - validate route/model is allowed for OpenAI provider
 *  - map roles and content safely
 *  - map Koda tool schema -> OpenAI tools
 *  - map tool choice -> OpenAI tool_choice
 *  - attach correlation id via headers
 */

import type {
  LlmRequest,
  LlmMessage,
  LlmMessagePart,
  LlmToolCall,
  LlmProviderId,
  LlmModelId,
  LlmGenerationOptions,
} from "../../types/llm.types";

export type OpenAITransportApi = "responses" | "chat_completions";

export interface OpenAIAdaptedRequest {
  api: OpenAITransportApi;
  model: string;
  stream: boolean;
  payload: any;
  headers: Record<string, string>;

  // Non-user-visible hints for downstream logging/telemetry (optional)
  meta: {
    correlationId?: string;
    stage?: "draft" | "final";
    toolsEnabled: boolean;
  };
}

export interface OpenAIPromptAdapterConfig {
  /**
   * Choose which OpenAI API to use.
   * - "responses" is the modern path and matches ChatGPT backend behavior more closely.
   * - "chat_completions" is a compatibility fallback.
   */
  preferredApi: OpenAITransportApi;

  /**
   * Strict allowlist so Koda doesn’t silently drift to unknown models.
   */
  allowedModels: string[];

  /**
   * If a request uses a model not in allowlist, either:
   *  - throw (strict)
   *  - or fallback to defaultModelFinal
   */
  strictModelAllowlist: boolean;

  /**
   * Koda’s OpenAI default model (precision lane)
   */
  defaultModelFinal: string;

  /**
   * Whether to include "developer" role.
   * Some older paths don’t accept "developer".
   * If false, developer messages get merged into system.
   */
  supportsDeveloperRole: boolean;

  /**
   * Koda policy normally disallows sending images to OpenAI (handled by extraction pipeline).
   * If an image part is encountered:
   *  - if strict: throw
   *  - else: drop image parts
   */
  strictNoImages: boolean;

  /**
   * Tools:
   * - Allow tools in OpenAI requests when Koda supplies tools
   */
  allowTools: boolean;

  /**
   * Streaming:
   * - Include usage in stream where supported.
   * - Some SDKs accept stream_options for chat completions.
   */
  includeUsageInStream: boolean;

  /**
   * Default generation baselines (adapter-level safety).
   * Request builder can override.
   */
  defaults: {
    temperatureFinal: number;
    topP: number;
    maxOutputTokensFinal: number;
    maxOutputTokensNav: number;
    maxOutputTokensDisambiguation: number;
  };

  /**
   * Correlation id header name
   */
  correlationHeaderName: string;
}

const DEFAULT_CONFIG: OpenAIPromptAdapterConfig = {
  preferredApi: (process.env.OPENAI_PREFERRED_API as OpenAITransportApi) || "chat_completions",
  allowedModels: ["gpt-5.2"],
  strictModelAllowlist: true,
  defaultModelFinal: "gpt-5.2",
  supportsDeveloperRole: true,
  strictNoImages: true,
  allowTools: true,
  includeUsageInStream: true,
  defaults: {
    temperatureFinal: 0.2,
    topP: 0.9,
    maxOutputTokensFinal: 900,
    maxOutputTokensNav: 220,
    maxOutputTokensDisambiguation: 220,
  },
  correlationHeaderName: "X-Correlation-Id",
};

// ------------------------------
// Helpers
// ------------------------------

function safeString(x: any): string {
  if (typeof x === "string") return x;
  if (x == null) return "";
  return String(x);
}

function clampInt(x: any, min: number, max: number, fallback: number): number {
  const n = Number(x);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function isNonEmptyArray(a: any): boolean {
  return Array.isArray(a) && a.length > 0;
}

function normalizeModel(requested: string, cfg: OpenAIPromptAdapterConfig): string {
  const m = (requested || "").trim();
  if (!m) return cfg.defaultModelFinal;

  if (cfg.allowedModels.includes(m)) return m;

  if (cfg.strictModelAllowlist) {
    throw new Error(`OpenAI model not allowed: ${m}`);
  }

  return cfg.defaultModelFinal;
}

function mergeSystemAndDeveloper(messages: LlmMessage[]): LlmMessage[] {
  // If developer role is not supported, merge developer content into system.
  const systemParts: string[] = [];
  const out: LlmMessage[] = [];

  for (const m of messages) {
    if (m.role === "system" || m.role === "developer") {
      const text = messageToText(m);
      if (text) systemParts.push(text);
      continue;
    }
    out.push(m);
  }

  if (systemParts.length) {
    out.unshift({ role: "system", content: systemParts.join("\n\n") });
  }

  return out;
}

function messageToText(m: LlmMessage): string {
  if (typeof m.content === "string" && m.content.length) return m.content;

  if (isNonEmptyArray(m.parts)) {
    return m.parts
      .map((p: LlmMessagePart) => (p.type === "text" ? p.text : ""))
      .filter(Boolean)
      .join("");
  }

  return "";
}

function assertNoImageParts(messages: LlmMessage[], cfg: OpenAIPromptAdapterConfig) {
  for (const m of messages) {
    if (!m.parts) continue;
    for (const p of m.parts) {
      if (p.type === "image_url") {
        if (cfg.strictNoImages) {
          throw new Error("OpenAI prompt adapter: image parts are not allowed in this lane");
        }
      }
    }
  }
}

function stripImageParts(messages: LlmMessage[]): LlmMessage[] {
  return messages.map((m) => {
    if (!m.parts) return m;
    const parts = m.parts.filter((p) => p.type !== "image_url");
    return { ...m, parts };
  });
}

/**
 * Koda tool schema -> OpenAI tool schema.
 * We support both already-normalized OpenAI tools and generic function tools.
 */
function toOpenAITools(tools: any[] | undefined): any[] | undefined {
  if (!Array.isArray(tools) || tools.length === 0) return undefined;

  // Stable ordering by function name helps determinism/debuggability
  const normalized = tools.map((t) => {
    if (t?.type === "function" && t.function) return t;

    const name = t?.name || t?.function?.name;
    const description = t?.description || t?.function?.description || "";
    const parameters = t?.parameters || t?.function?.parameters || t?.schema || { type: "object", properties: {} };

    return {
      type: "function",
      function: { name, description, parameters },
    };
  });

  normalized.sort((a, b) => String(a.function?.name || "").localeCompare(String(b.function?.name || "")));
  return normalized;
}

function toOpenAIToolChoice(toolChoice: any): any {
  if (!toolChoice) return undefined;
  if (toolChoice === "auto" || toolChoice === "none") return toolChoice;

  if (typeof toolChoice === "object" && toolChoice.name) {
    return { type: "function", function: { name: String(toolChoice.name) } };
  }

  return undefined;
}

/**
 * OpenAI “chat.completions” messages mapping.
 * Koda uses system/developer/user/assistant/tool.
 */
function toOpenAIChatMessages(messages: LlmMessage[]): any[] {
  const out: any[] = [];

  for (const m of messages) {
    if (m.role === "tool") {
      out.push({
        role: "tool",
        tool_call_id: m.toolCallId || "",
        content: messageToText(m),
      });
      continue;
    }

    const role = m.role; // "system" | "developer" | "user" | "assistant"
    out.push({
      role,
      content: messageToText(m),
    });
  }

  return out;
}

/**
 * OpenAI “responses” input mapping.
 * Responses API expects "input" array with items that contain role and content parts.
 * We keep it conservative: text-only unless you allow images elsewhere.
 */
function toOpenAIResponsesInput(messages: LlmMessage[]): any[] {
  return messages.map((m) => {
    if (m.role === "tool") {
      return {
        role: "tool",
        tool_call_id: m.toolCallId || "",
        content: [{ type: "output_text", text: messageToText(m) }],
      };
    }

    const role = m.role === "developer" ? "developer" : m.role;
    return {
      role,
      content: [{ type: "input_text", text: messageToText(m) }],
    };
  });
}

function buildHeaders(request: LlmRequest, cfg: OpenAIPromptAdapterConfig): Record<string, string> {
  const headers: Record<string, string> = {};
  if (request.correlationId) headers[cfg.correlationHeaderName] = request.correlationId;
  return headers;
}

function inferStage(request: LlmRequest): "draft" | "final" {
  const st = request.route?.stage;
  return st === "final" ? "final" : "draft";
}

function resolveGenerationDefaults(req: LlmRequest, cfg: OpenAIPromptAdapterConfig): LlmGenerationOptions {
  // Koda always streams unless caller explicitly disables
  const stream = req.options?.stream !== false;

  const stage = inferStage(req);
  const answerMode = safeString(req.kodaMeta?.answerMode);

  const isNav = answerMode === "nav_pills";
  const promptType = safeString(req.kodaMeta?.promptType);
  const isDisambiguation = promptType === "disambiguation";

  const maxOutputTokens =
    typeof req.options?.maxOutputTokens === "number"
      ? Math.max(1, Math.floor(req.options.maxOutputTokens))
      : isNav
      ? cfg.defaults.maxOutputTokensNav
      : isDisambiguation
      ? cfg.defaults.maxOutputTokensDisambiguation
      : cfg.defaults.maxOutputTokensFinal;

  const temperature =
    typeof req.options?.temperature === "number"
      ? req.options.temperature
      : stage === "final"
      ? cfg.defaults.temperatureFinal
      : cfg.defaults.temperatureFinal;

  const topP =
    typeof req.options?.topP === "number"
      ? req.options.topP
      : cfg.defaults.topP;

  return {
    stream,
    temperature,
    topP,
    maxOutputTokens,
    stop: req.options?.stop,
    deterministic: req.options?.deterministic ?? (stage === "final"),
  };
}

// ------------------------------
// Service
// ------------------------------

export class OpenAIPromptAdapterService {
  private readonly cfg: OpenAIPromptAdapterConfig;

  constructor(cfg: Partial<OpenAIPromptAdapterConfig> = {}) {
    this.cfg = {
      ...DEFAULT_CONFIG,
      ...cfg,
      defaults: { ...DEFAULT_CONFIG.defaults, ...(cfg.defaults || {}) },
      allowedModels: cfg.allowedModels ?? DEFAULT_CONFIG.allowedModels,
    };
  }

  /**
   * Build an OpenAI request (payload + headers) from a Koda LlmRequest.
   * This is the only entrypoint most callers need.
   */
  adapt(request: LlmRequest): OpenAIAdaptedRequest {
    const stage = inferStage(request);

    // 1) Validate model and pick fallback deterministically
    const model = normalizeModel(request.route?.model || this.cfg.defaultModelFinal, this.cfg);

    // 2) Validate message parts (images disallowed in this lane by default)
    let messages = request.messages || [];
    assertNoImageParts(messages, this.cfg);
    if (!this.cfg.strictNoImages) messages = stripImageParts(messages);

    // 3) Developer role compatibility
    if (!this.cfg.supportsDeveloperRole) {
      messages = mergeSystemAndDeveloper(messages);
    }

    // 4) Tools (optional)
    const toolsEnabled = this.cfg.allowTools && Array.isArray(request.tools) && request.tools.length > 0;
    const tools = toolsEnabled ? toOpenAITools(request.tools) : undefined;
    const tool_choice = toolsEnabled ? toOpenAIToolChoice(request.toolChoice) : "none";

    // 5) Generation defaults (stage + answerMode aware)
    const gen = resolveGenerationDefaults(request, this.cfg);

    // 6) Headers
    const headers = buildHeaders(request, this.cfg);

    // 7) Build payload for chosen API
    if (this.cfg.preferredApi === "responses") {
      const input = toOpenAIResponsesInput(messages);

      // Responses API is strict about fields; keep it lean and compatible.
      const payload: any = {
        model,
        input,
        stream: gen.stream,
        temperature: gen.temperature,
        top_p: gen.topP,
        max_output_tokens: gen.maxOutputTokens,
        ...(gen.stop ? { stop: gen.stop } : {}),
        ...(tools ? { tools } : {}),
        ...(tool_choice ? { tool_choice } : {}),
        // Keep meta internal: do not rely on OpenAI accepting arbitrary metadata in all environments
      };

      return {
        api: "responses",
        model,
        stream: gen.stream ?? true,
        payload,
        headers,
        meta: {
          correlationId: request.correlationId,
          stage,
          toolsEnabled: Boolean(tools),
        },
      };
    }

    // chat.completions
    const chatMessages = toOpenAIChatMessages(messages);
    const payload: any = {
      model,
      messages: chatMessages,
      stream: gen.stream,
      temperature: gen.temperature,
      top_p: gen.topP,
      ...(typeof gen.maxOutputTokens === "number" ? { max_tokens: clampInt(gen.maxOutputTokens, 1, 8192, this.cfg.defaults.maxOutputTokensFinal) } : {}),
      ...(gen.stop ? { stop: gen.stop } : {}),
      ...(tools ? { tools } : {}),
      ...(tool_choice ? { tool_choice } : {}),
      ...(gen.stream && this.cfg.includeUsageInStream ? { stream_options: { include_usage: true } } : {}),
    };

    return {
      api: "chat_completions",
      model,
      stream: gen.stream ?? true,
      payload,
      headers,
      meta: {
        correlationId: request.correlationId,
        stage,
        toolsEnabled: Boolean(tools),
      },
    };
  }
}

export default OpenAIPromptAdapterService;
