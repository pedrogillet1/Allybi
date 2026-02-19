/**
 * llmErrors.types.ts
 *
 * Canonical LLM / generation-layer error types for Allybi.
 * Goals:
 * - No user-facing microcopy in types
 * - Stable reason codes (safe for banks/routing/telemetry)
 * - Deterministic + serializable shape
 */

export type LLMProvider =
  | "openai"
  | "google"
  | "anthropic"
  | "ollama"
  | "local"
  | "unknown";

export type LLMErrorLayer =
  | "input"
  | "routing"
  | "retrieval"
  | "compose"
  | "generation"
  | "validation"
  | "streaming"
  | "network"
  | "provider"
  | "unknown";

/**
 * IMPORTANT:
 * These codes are intended to be stable across the codebase and banks.
 * Do not rename existing codes without a migration plan.
 */
export type LLMErrorCode =
  // --- Input / request ---
  | "LLM_INPUT_EMPTY"
  | "LLM_INPUT_TOO_LONG"
  | "LLM_INPUT_UNSUPPORTED_LANGUAGE"
  | "LLM_INPUT_MALFORMED"

  // --- Routing / scope ---
  | "LLM_SCOPE_LOCK_VIOLATION"
  | "LLM_WRONG_DOC_DRIFT"
  | "LLM_OPERATOR_NOT_FOUND"
  | "LLM_INTENT_NOT_FOUND"

  // --- Retrieval ---
  | "LLM_RETRIEVAL_EMPTY"
  | "LLM_RETRIEVAL_WEAK_EVIDENCE"
  | "LLM_RETRIEVAL_TIMEOUT"
  | "LLM_RETRIEVAL_BACKEND_ERROR"

  // --- Compose / prompt registry ---
  | "LLM_PROMPT_TEMPLATE_MISSING"
  | "LLM_PROMPT_RENDER_FAILED"
  | "LLM_PROMPT_REGISTRY_ERROR"

  // --- Provider / network ---
  | "LLM_PROVIDER_TIMEOUT"
  | "LLM_PROVIDER_RATE_LIMIT"
  | "LLM_PROVIDER_AUTH_ERROR"
  | "LLM_PROVIDER_BAD_REQUEST"
  | "LLM_PROVIDER_UNAVAILABLE"
  | "LLM_PROVIDER_OVERLOADED"
  | "LLM_NETWORK_ERROR"

  // --- Generation ---
  | "LLM_GENERATION_FAILED"
  | "LLM_GENERATION_INTERRUPTED"
  | "LLM_STREAM_ABORTED"
  | "LLM_STREAM_CORRUPTED"

  // --- Validation / quality gates ---
  | "LLM_NUMERIC_INTEGRITY_FAILED"
  | "LLM_CITATION_OR_PROVENANCE_FAILED"
  | "LLM_OUTPUT_CONTRACT_VIOLATION"
  | "LLM_BANNED_PHRASE_VIOLATION"
  | "LLM_SAFETY_POLICY_BLOCK"
  | "LLM_PRIVACY_POLICY_BLOCK"

  // --- Unknown fallback ---
  | "LLM_UNKNOWN_ERROR";

export type LLMErrorSeverity = "info" | "warn" | "error" | "fatal";

/**
 * Machine-safe reason codes for bank-driven fallbacks.
 * Keep short and stable; used for selecting fallback microcopy/policies.
 */
export type LLMReasonCode =
  | "NO_EVIDENCE"
  | "WEAK_EVIDENCE"
  | "SCOPE_LOCK"
  | "WRONG_DOC"
  | "TIMEOUT"
  | "RATE_LIMIT"
  | "AUTH"
  | "NETWORK"
  | "PROVIDER_DOWN"
  | "BAD_REQUEST"
  | "VALIDATION_FAIL"
  | "SAFETY_BLOCK"
  | "PRIVACY_BLOCK"
  | "UNKNOWN";

export interface LLMErrorMeta {
  /** Provider-specific HTTP-ish status if available */
  status?: number;
  /** Provider error type string if available */
  providerErrorType?: string;
  /** Provider request id / trace id if available */
  requestId?: string;
  /** Whether this error is retryable */
  retryable?: boolean;
  /** Recommended retry-after in milliseconds (if known) */
  retryAfterMs?: number;

  /** Token counts if available (for diagnostics) */
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;

  /** Model and provider context */
  provider?: LLMProvider;
  model?: string;

  /** Internal diagnostics (never show to user directly) */
  debug?: Record<string, unknown>;
}

/**
 * Canonical error object for anything LLM-related.
 * Safe to log, serialize, and pass between services.
 */
export interface LLMError {
  name: "LLMError";
  code: LLMErrorCode;
  layer: LLMErrorLayer;
  severity: LLMErrorSeverity;

  /** Bank-driven fallback selection */
  reason: LLMReasonCode;

  /** Human-readable internal message (NOT user-facing copy) */
  message: string;

  /** Optional causal chain */
  cause?: unknown;

  /** Timestamp in ISO format for logs */
  at: string;

  meta?: LLMErrorMeta;
}

/**
 * Optional: A lightweight union for return types across services.
 */
export type LLMResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: LLMError };

/**
 * Narrowing helper type (types-only friendly, but safe to use anywhere).
 */
export function isLLMError(x: unknown): x is LLMError {
  if (!x || typeof x !== "object") return false;
  const obj = x as Record<string, unknown>;
  return (
    obj.name === "LLMError" &&
    typeof obj.code === "string" &&
    typeof obj.layer === "string" &&
    typeof obj.severity === "string" &&
    typeof obj.reason === "string" &&
    typeof obj.message === "string" &&
    typeof obj.at === "string"
  );
}
