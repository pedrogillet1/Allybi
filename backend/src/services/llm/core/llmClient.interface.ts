/**
 * llmClient.interface.ts
 *
 * Provider-agnostic LLM client contract for Allybi.
 * Goals:
 * - Deterministic request/response shapes
 * - Streaming-first (ChatGPT-parity feel)
 * - Tool-call aware (provider-neutral)
 * - No user-facing microcopy
 */

import type { LLMProvider } from './llmErrors.types';
import type { ToolRegistry, ProviderToolCall, ToolResult } from './llmTools.types';
import type {
  LLMStreamingConfig,
  StreamEvent,
  StreamSink,
  StreamState,
  StreamingHooks,
} from './llmStreaming.types';

/** LLM role types (provider-neutral) */
export type LLMRole = 'system' | 'developer' | 'user' | 'assistant' | 'tool';

/** A single chat message (normalized) */
export interface LLMMessage {
  role: LLMRole;

  /**
   * Text content (markdown-safe). For role='tool', this may be empty if toolPayload is used.
   */
  content?: string;

  /**
   * Tool-call structure emitted by assistant (provider-normalized).
   * Some providers emit tool calls as structured blocks. Adapter should map them here.
   */
  toolCalls?: ProviderToolCall[];

  /**
   * Tool result payload for role='tool' messages.
   * This matches the callId from ToolCall/ProviderToolCall mapping.
   */
  toolResult?: ToolResult;

  /** Optional per-message metadata */
  meta?: {
    /** Used for tracing or internal annotations; never shown to users */
    name?: string;
    /** Timestamp epoch ms */
    t?: number;
  };
}

/** Sampling controls (keep minimal + provider-neutral) */
export interface LLMSampling {
  temperature?: number; // default chosen by config
  topP?: number;
  maxOutputTokens?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  seed?: number; // determinism (if provider supports)
}

/** Model selection */
export interface LLMModelSpec {
  provider: LLMProvider;
  model: string;
}

/** Request-level constraints (policy gates enforce elsewhere) */
export interface LLMRequestConstraints {
  /** Hard cap for prompt bytes/tokens upstream */
  maxPromptTokens?: number;
  /** Hard cap for tool calls in this request (post-registry filter) */
  maxToolCalls?: number;
  /** Enable/disable tool calls for this request */
  toolsEnabled?: boolean;
}

/** High-level request intent (optional signal for routing) */
export type LLMRequestPurpose =
  | 'intent_routing'
  | 'retrieval_planning'
  | 'answer_compose'
  | 'validation_pass'
  | 'other';

/** Core request payload */
export interface LLMRequest {
  traceId: string;
  turnId: string;

  model: LLMModelSpec;

  /** Normalized chat messages */
  messages: LLMMessage[];

  /** Sampling controls */
  sampling?: LLMSampling;

  /** Tool availability */
  tools?: {
    registry?: ToolRegistry;
    /** If true, model is allowed to call tools */
    enabled: boolean;
  };

  /** Constraints */
  constraints?: LLMRequestConstraints;

  /** Optional purpose hint for telemetry/routing (not user-facing) */
  purpose?: LLMRequestPurpose;

  /** Optional opaque metadata (safe for logs only) */
  meta?: Record<string, unknown>;
}

/** Token usage accounting (if provider returns it) */
export interface LLMUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

/** Tool call request from the model (normalized) */
export interface LLMToolCallRequest {
  /** Provider-normalized tool calls */
  toolCalls: ProviderToolCall[];
}

/** Non-streamed completion response */
export interface LLMCompletionResponse {
  traceId: string;
  turnId: string;

  model: LLMModelSpec;

  /** Assistant message content */
  content: string;

  /** Tool calls if the model decided to call tools instead of producing final text */
  toolCallRequest?: LLMToolCallRequest;

  usage?: LLMUsage;

  /** Provider request id for traceability */
  requestId?: string;

  /** Raw provider payload (optional, internal only) */
  raw?: unknown;
}

/**
 * Streaming response:
 * - The client will emit StreamEvents into the provided StreamSink.
 * - Final content (and tool calls, if any) are also returned for server-side orchestration.
 */
export interface LLMStreamResponse {
  traceId: string;
  turnId: string;

  model: LLMModelSpec;

  /** Final accumulated text (what was streamed) */
  finalText: string;

  /** Tool calls if the model requested tools */
  toolCallRequest?: LLMToolCallRequest;

  usage?: LLMUsage;
  requestId?: string;
}

/**
 * Client interface:
 * - complete(): non-streamed call
 * - stream(): streamed call with ChatGPT-parity behavior controlled by LLMStreamingConfig
 */
export interface LLMClient {
  readonly provider: LLMProvider;

  /** Quick health check; should not throw */
  ping?(): Promise<{ ok: boolean; provider: LLMProvider; t: number }>;

  /** Non-streamed completion */
  complete(req: LLMRequest): Promise<LLMCompletionResponse>;

  /**
   * Streamed completion:
   * Implementations must:
   * - emit a 'start' event
   * - emit 'delta' events steadily (chunking)
   * - honor marker holding policy if used upstream
   * - emit exactly one 'final' event or one 'error'/'abort'
   */
  stream(params: {
    req: LLMRequest;

    /** Where to write StreamEvents (SSE writer, WS, etc.) */
    sink: StreamSink;

    /** Streaming behavior knobs */
    config: LLMStreamingConfig;

    /** Optional streaming hooks for telemetry/metrics */
    hooks?: StreamingHooks;

    /** Optional: initial stream state, if orchestrator pre-allocates */
    initialState?: Partial<StreamState>;
  }): Promise<LLMStreamResponse>;

  /**
   * Optional: Convert provider-native tool calls into ProviderToolCall (normalized).
   * Useful if adapters parse raw payloads outside complete/stream.
   */
  normalizeToolCalls?(raw: unknown): ProviderToolCall[];
}

/**
 * Helper type: something that can emit events (used by stream implementations).
 * This is optional, but helps keep stream logic consistent.
 */
export interface StreamEmitter {
  emit(event: StreamEvent): void;
  close(): void;
  isOpen(): boolean;
}
