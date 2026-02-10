/**
 * llmTools.types.ts
 *
 * Canonical tool-calling types for Allybi.
 * Goals:
 * - Deterministic, serializable contracts (safe for banks/routing)
 * - No user-facing copy
 * - Provider-agnostic (OpenAI/Google/etc.)
 * - Supports: tool registry, calls, results, tracing, and policies
 */

import type { LLMProvider } from './llmErrors.types';

/** Stable tool ids used across the system (banks + routing + telemetry). */
export type ToolId =
  | 'DOC_SEARCH'
  | 'DOC_OPEN'
  | 'DOC_LOCATE'
  | 'DOC_LIST'
  | 'DOC_GET_CHUNK'
  | 'DOC_EXTRACT_TABLE'
  | 'DOC_EXTRACT_IMAGE_TEXT'
  | 'SECURITY_MASK'
  | 'MATH_EVAL'
  | 'UNKNOWN_TOOL';

/** High-level tool categories for routing and logging. */
export type ToolCategory =
  | 'documents'
  | 'retrieval'
  | 'extraction'
  | 'security'
  | 'utilities'
  | 'unknown';

/**
 * Tool execution policy knobs (bank-driven elsewhere; types are stable).
 * No UI strings here.
 */
export interface ToolPolicy {
  enabled: boolean;

  /** Maximum number of times this tool may be called in one request lifecycle. */
  maxCallsPerTurn: number;

  /** Hard timeout in ms for execution. */
  timeoutMs: number;

  /**
   * Whether tool calls are allowed while a doc lock is active.
   * Example: discovery/search may be allowed; cross-doc open may not.
   */
  allowedUnderDocLock: boolean;

  /**
   * Whether this tool is allowed to operate corpus-wide even when doc lock exists.
   * Use for discovery-style tools only.
   */
  discoveryException: boolean;

  /**
   * If true, tool inputs/outputs must be sanitized or masked before returning.
   * (Actual masking logic elsewhere.)
   */
  requiresMasking: boolean;
}

/** Tool I/O content types (simple but extensible). */
export type ToolIOType = 'json' | 'text' | 'binary' | 'unknown';

/** JSON Schema (kept lightweight to avoid extra deps; use your schema banks in implementation). */
export type JsonSchema = Record<string, unknown>;

/**
 * Tool definition: what the LLM can call.
 * Keep descriptions short and non-user-facing (for internal prompting).
 */
export interface ToolDefinition {
  id: ToolId;
  name: string; // stable function-like name (e.g., "doc_search")
  category: ToolCategory;

  /** Internal description for prompt registry (not shown to users). */
  description: string;

  /** Input / output schemas for validation at the tool boundary. */
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;

  /** Declared IO types */
  inputType: ToolIOType;
  outputType: ToolIOType;

  /** Default policy (can be overridden by banks/overlays). */
  policy: ToolPolicy;

  /** Optional versioning */
  version?: string;
}

/** A registry of tools available for a given request. */
export interface ToolRegistry {
  tools: ToolDefinition[];

  /**
   * Provider context for tool-call formatting compatibility.
   * (Different providers serialize tool calls differently; adapter layer handles it.)
   */
  provider?: LLMProvider;

  /** Optional: tools allowed in this specific request (pre-filtered). */
  allowedToolIds?: ToolId[];
}

/**
 * Standard tool call envelope.
 * `args` must match ToolDefinition.inputSchema (validated at runtime).
 */
export interface ToolCall<TArgs = unknown> {
  /** Unique id for this tool call instance (traceable). */
  callId: string;

  toolId: ToolId;
  toolName: string;

  /** Deterministic ordering index within a turn. */
  index: number;

  /** Arguments for the tool. */
  args: TArgs;

  /** Tool call metadata for tracing/debug. */
  meta?: {
    provider?: LLMProvider;
    model?: string;
    /** Timestamp (epoch ms) when LLM requested the tool call. */
    requestedAtMs?: number;
  };
}

/**
 * Standard tool result envelope.
 * `output` must match ToolDefinition.outputSchema when provided.
 */
export interface ToolResult<TOutput = unknown> {
  callId: string;
  toolId: ToolId;
  toolName: string;
  index: number;

  ok: boolean;

  /** Tool output (only present if ok=true). */
  output?: TOutput;

  /**
   * Tool error (internal only; caller maps to bank-driven fallback).
   * Avoid user-facing copy here.
   */
  error?: {
    code:
      | 'TOOL_TIMEOUT'
      | 'TOOL_DISABLED'
      | 'TOOL_POLICY_BLOCK'
      | 'TOOL_BAD_ARGS'
      | 'TOOL_EXECUTION_FAILED'
      | 'TOOL_NOT_FOUND'
      | 'TOOL_UNKNOWN_ERROR';
    message: string;
    /** Underlying cause (never serialize to client directly). */
    cause?: unknown;
  };

  /** Execution timing + trace */
  timing?: {
    startedAtMs: number;
    finishedAtMs: number;
    durationMs: number;
  };

  meta?: {
    provider?: LLMProvider;
    model?: string;
  };
}

/** Batch of tool calls requested by the model in one step. */
export interface ToolCallBatch {
  traceId: string;
  turnId: string;

  calls: ToolCall[];

  /** Total calls seen so far in this turn (for policy enforcement). */
  callsSoFar: number;
}

/** Batch of tool results produced by the executor. */
export interface ToolResultBatch {
  traceId: string;
  turnId: string;

  results: ToolResult[];

  /** Whether any tool call failed (ok=false). */
  hasFailures: boolean;
}

/**
 * Deterministic tool execution contract.
 * Implementations should enforce policy and validate schema at boundaries.
 */
export interface ToolExecutor {
  /**
   * Execute a single tool call.
   * Must be deterministic given same args + same state.
   */
  execute(call: ToolCall, ctx: ToolExecutionContext): Promise<ToolResult>;

  /** Execute a batch (ordered) */
  executeBatch?(batch: ToolCallBatch, ctx: ToolExecutionContext): Promise<ToolResultBatch>;
}

/**
 * Execution context: passed to tools for consistent behavior.
 * Keep it minimal and serializable where possible.
 */
export interface ToolExecutionContext {
  traceId: string;
  turnId: string;

  /** Active doc lock (if any). */
  docLock?: {
    enabled: boolean;
    /** Canonical doc id or filename chosen by scope resolution. */
    docId?: string;
    filename?: string;
  };

  /** Runtime policy overrides from banks/overlays. */
  policyOverrides?: Partial<Record<ToolId, Partial<ToolPolicy>>>;

  /** Optional shared cache handle keying (implementation-specific). */
  cacheKey?: string;

  /** For logging/telemetry */
  provider?: LLMProvider;
  model?: string;
}

/**
 * Adapter-friendly representation of tool calls for provider messages.
 * Useful if your provider adapters want a normalized intermediate form.
 */
export type ProviderToolCall =
  | {
      provider: 'openai';
      toolCallId: string;
      name: string;
      argumentsJson: string; // provider expects JSON-string arguments
    }
  | {
      provider: 'google';
      name: string;
      args: unknown;
    }
  | {
      provider: 'anthropic';
      name: string;
      args: unknown;
    }
  | {
      provider: 'unknown';
      name: string;
      args: unknown;
    };

/**
 * Optional: helpers for narrowing / sanity checking (kept lightweight).
 */
export function isToolCall(x: unknown): x is ToolCall {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.callId === 'string' &&
    typeof o.toolId === 'string' &&
    typeof o.toolName === 'string' &&
    typeof o.index === 'number' &&
    'args' in o
  );
}

export function isToolResult(x: unknown): x is ToolResult {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.callId === 'string' &&
    typeof o.toolId === 'string' &&
    typeof o.toolName === 'string' &&
    typeof o.index === 'number' &&
    typeof o.ok === 'boolean'
  );
}
