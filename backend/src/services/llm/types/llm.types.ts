// src/services/llm/types/llm.types.ts

/**
 * LLM Core Types (Allybi, ChatGPT-parity)
 * ------------------------------------
 * This file defines the *provider-agnostic* contracts used across Allybi’s LLM layer:
 *
 *  - llmRequestBuilder.service.ts
 *  - llmRouter.service.ts (multi-provider / multi-model routing)
 *  - llmStreamAdapter.service.ts (token streaming)
 *  - llmSafetyAdapter.service.ts (safety + policy shaping)
 *  - llmResponseParser.service.ts (turn raw output into structured result)
 *  - llmTelemetry.service.ts (latency/usage/correlation)
 *
 * Important design goals:
 *  - Provider-agnostic (OpenAI/Gemini/Local/etc) with stable internal semantics
 *  - Streaming-first (ChatGPT-like): small deltas + final envelope
 *  - Deterministic: the pipeline relies on stable “reason codes” and stage tags
 *  - Safe: do not require raw HTML or user-visible JSON output
 *
 * NOTE:
 * More specific stream event shapes and tool schemas can live in:
 *  - llmStreaming.types.ts
 *  - llmTools.types.ts
 *  - llmErrors.types.ts
 *
 * This file focuses on the core request/response and shared enums.
 */

export type EnvName = "production" | "staging" | "dev" | "local";

/**
 * Providers are intentionally open-ended. Keep known providers as literals,
 * but allow custom strings for new providers.
 */
export type LlmProviderId = "openai" | "gemini" | (string & {});

/**
 * Model id is provider-specific but treated as a string across Allybi.
 * Example: "gpt-5.2", "gemini-2.5-flash", etc.
 */
export type LlmModelId = string;

/**
 * Allybi uses role-based message histories for prompt assembly.
 * We keep "developer" separate from "system" since some providers support both.
 */
export type LlmRole = "system" | "developer" | "user" | "assistant" | "tool";

/**
 * Canonical message part format (provider-agnostic).
 * You can expand to multimodal later without breaking callers.
 */
export type LlmMessagePart =
  | { type: "text"; text: string }
  | { type: "image_url"; url: string; detail?: "low" | "high" };

/**
 * Canonical message format.
 * - Use either `content` (simple) or `parts` (structured).
 * - Prefer parts when you need images or explicit chunking.
 */
export interface LlmMessage {
  role: LlmRole;
  content?: string;
  parts?: LlmMessagePart[];

  /**
   * Tool messages:
   * - toolName identifies which tool produced the message
   * - toolCallId links a tool result to its call (if your provider supports it)
   */
  toolName?: string;
  toolCallId?: string;

  /**
   * Non-user-visible metadata for tracing/debug
   */
  meta?: Record<string, unknown>;
}

/**
 * Standard token usage shape across providers.
 * When a provider does not supply usage (streaming often), fill what you can.
 */
export interface LlmUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;

  /**
   * Optional provider-specific usage (kept non-breaking)
   */
  providerUsage?: Record<string, unknown>;
}

/**
 * Why the model stopped.
 * (Providers vary; this normalizes to a stable internal enum.)
 */
export type LlmFinishReason =
  | "stop"
  | "length"
  | "tool_calls"
  | "content_filter"
  | "error"
  | "cancelled"
  | "unknown";

/**
 * Safety assessment emitted by safety adapters.
 * Allybi policies may route/refuse or request a safer retry.
 */
export interface LlmSafetyReport {
  flagged: boolean;

  /**
   * High-level category flags (provider-agnostic)
   */
  categories?: {
    selfHarm?: boolean;
    violence?: boolean;
    sexual?: boolean;
    hate?: boolean;
    harassment?: boolean;
    illegal?: boolean;
    privacy?: boolean;
    other?: boolean;
  };

  /**
   * Optional severity in [0..1]
   */
  severity?: number;

  /**
   * Provider-native block details (kept server-side)
   */
  providerDetail?: unknown;
}

/**
 * Telemetry captured per request for tracing and cost control.
 */
export interface LlmTelemetry {
  correlationId?: string;
  requestId?: string;

  provider: LlmProviderId;
  model: LlmModelId;

  env?: EnvName;

  /**
   * Timing (ms)
   */
  timings?: {
    queuedMs?: number;
    firstTokenMs?: number; // important for ChatGPT-like UX
    totalMs?: number;
  };

  /**
   * Cache info (if your llmCache.service.ts is used)
   */
  cache?: {
    enabled?: boolean;
    hit?: boolean;
    key?: string;
  };

  usage?: LlmUsage;

  /**
   * Non-user-visible debug crumbs
   */
  debug?: Record<string, unknown>;
}

/**
 * Tool call contract (provider-agnostic).
 * The detailed tool schema usually lives in llmTools.types.ts.
 */
export interface LlmToolCall {
  id: string;
  name: string;
  argumentsJson: string; // always JSON string (even if provider returns object)
}

/**
 * LLM response payload produced by llmResponseParser.service.ts.
 * Allybi downstream does not want raw provider objects; it wants stable fields.
 */
export interface LlmResponse {
  /**
   * Primary assistant content (text).
   * Allybi generally avoids user-visible JSON; if the model returns JSON,
   * the output/quality gates will transform it.
   */
  text: string;

  /**
   * Tool calls (if any). If tools are not used, omit or empty array.
   */
  toolCalls?: LlmToolCall[];

  /**
   * Normalized finish reason.
   */
  finishReason: LlmFinishReason;

  /**
   * Usage and telemetry.
   */
  usage?: LlmUsage;
  telemetry?: LlmTelemetry;

  /**
   * Safety report.
   */
  safety?: LlmSafetyReport;

  /**
   * Provider-native raw response (optional, NEVER user-visible).
   */
  raw?: unknown;
}

/**
 * Streaming delta event (internal).
 * Adapters convert provider streams into these events.
 * Downstream (controller/orchestrator) can map them to SSE events.
 */
export type LlmStreamEvent =
  | {
      type: "meta";
      provider: LlmProviderId;
      model: LlmModelId;
      requestId?: string;
      correlationId?: string;
      cached?: boolean;
    }
  | {
      type: "delta";
      text: string; // small token chunk
      index?: number; // for multi-choice providers (usually 0)
    }
  | {
      type: "tool_call";
      toolCall: LlmToolCall; // full tool call once known
    }
  | {
      type: "tool_call_delta";
      toolCallId: string;
      deltaJson: string; // incremental args JSON chunk if provider supports it
    }
  | {
      type: "final";
      response: LlmResponse;
    }
  | {
      type: "error";
      code: string;
      message: string;
      retryable?: boolean;
      detail?: unknown;
    }
  | {
      type: "heartbeat";
      ts: number;
    };

/**
 * Provider-agnostic generation options.
 * Keep this compact: most “behavior” is decided upstream by Allybi banks/services.
 */
export interface LlmGenerationOptions {
  temperature?: number;
  topP?: number;

  /**
   * Max output tokens. Providers vary; adapters normalize.
   */
  maxOutputTokens?: number;

  /**
   * Stop sequences. Rarely used in Allybi; prefer output contract enforcement instead.
   */
  stop?: string[];

  /**
   * Enables streaming mode (ChatGPT-like).
   */
  stream?: boolean;

  /**
   * If true, provider should return best-effort deterministic output
   * (low temperature + stable prompts). Allybi still uses microcopy variation elsewhere.
   */
  deterministic?: boolean;
}

/**
 * “Why was this model chosen?” — supports multi-model routing (Flash vs Mini, etc.)
 */
export type LlmRouteReason =
  | "fast_path"
  | "quality_finish"
  | "numeric_strict"
  | "quote_strict"
  | "hallucination_guard"
  | "policy_retry"
  | "fallback_only"
  | "unknown";

/**
 * Route plan produced by llmRouter.service.ts.
 * Helps explain and audit model/provider selection.
 */
export interface LlmRoutePlan {
  provider: LlmProviderId;
  model: LlmModelId;
  modelFamily?: string;

  reason: LlmRouteReason;
  lane?: string;
  policyRuleId?: string;
  qualityReason?: string;

  /**
   * Optional stage tag for orchestration:
   * - "draft" (fast) vs "final" (precision)
   */
  stage?: "draft" | "final";

  /**
   * Optional hard constraints passed to adapters (non-user-visible).
   */
  constraints?: {
    requireStreaming?: boolean;
    disallowTools?: boolean;
    disallowImages?: boolean;
    maxLatencyMs?: number;
  };
}

/**
 * LLM request built by llmRequestBuilder.service.ts.
 * This is the central object that providers consume.
 */
export interface LlmRequest {
  route: LlmRoutePlan;

  messages: LlmMessage[];

  options?: LlmGenerationOptions;

  /**
   * Tools are defined in llmTools.types.ts — we keep it open-ended here
   * to avoid import cycles.
   */
  tools?: unknown[];

  /**
   * Tool choice hint. Provider adapters map this to native APIs.
   */
  toolChoice?: "auto" | "none" | { name: string };

  /**
   * If present, can be used by cache keys (LLM cache layer).
   */
  cacheKeyHint?: string;

  /**
   * Correlation id for logs/tracing.
   */
  correlationId?: string;

  /**
   * Allybi-level metadata (never user-visible).
   * Example: pipeline stage, reason codes, active doc lock state.
   */
  kodaMeta?: Record<string, unknown>;
}

/**
 * Result returned by a provider client for non-stream calls.
 * Streaming uses LlmStreamEvent stream instead.
 */
export interface LlmCallResult {
  response: LlmResponse;
}

/**
 * Streaming result contract for provider clients.
 * The adapter should yield LlmStreamEvent events in order.
 */
export interface LlmStreamResult {
  stream: AsyncIterable<LlmStreamEvent>;
}

/**
 * Provider client interface (minimal).
 * Implemented by providers/openai/* and providers/gemini/*.
 */
export interface LlmClient {
  provider: LlmProviderId;

  /**
   * Non-stream request.
   */
  call(request: LlmRequest, signal?: AbortSignal): Promise<LlmCallResult>;

  /**
   * Stream request (ChatGPT-like).
   * Must yield:
   *  - meta (early)
   *  - many delta events
   *  - final OR error
   */
  stream(request: LlmRequest, signal?: AbortSignal): Promise<LlmStreamResult>;
}
