/**
 * localErrorMapper.ts
 *
 * Deterministic error mapper for local LLM backends (Ollama / generic HTTP)
 * into Allybi’s canonical LLMError shape.
 *
 * Goals:
 * - No user-facing copy
 * - Stable error codes + reason codes
 * - Provider-agnostic mapping with best-effort classification
 */

import type {
  LLMError,
  LLMErrorCode,
  LLMErrorLayer,
  LLMReasonCode,
  LLMProvider,
} from "./llmErrors.types";

export interface LocalErrorContext {
  traceId: string;
  turnId?: string;

  provider?: LLMProvider; // usually 'local' or 'unknown'
  model?: string;

  layer?: LLMErrorLayer;

  /** Optional: HTTP status if available */
  status?: number;

  /** Optional provider request id */
  requestId?: string;

  /** Optional: which endpoint was hit */
  endpoint?: string;
}

export function mapLocalError(err: unknown, ctx: LocalErrorContext): LLMError {
  const at = new Date().toISOString();

  // Default assumptions
  let code: LLMErrorCode = "LLM_UNKNOWN_ERROR";
  let reason: LLMReasonCode = "UNKNOWN";
  let severity: LLMError["severity"] = "error";
  let layer: LLMErrorLayer = ctx.layer ?? "provider";

  const provider: LLMProvider = ctx.provider ?? "local";

  const message = toSafeMessage(err);
  const lower = message.toLowerCase();

  // --- Abort / timeout ---
  if (
    isAbortError(err) ||
    lower.includes("timeout") ||
    lower.includes("timed out")
  ) {
    code = "LLM_PROVIDER_TIMEOUT";
    reason = "TIMEOUT";
    layer = ctx.layer ?? "network";
  }

  // --- Rate limit ---
  if (
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    ctx.status === 429
  ) {
    code = "LLM_PROVIDER_RATE_LIMIT";
    reason = "RATE_LIMIT";
    layer = ctx.layer ?? "provider";
  }

  // --- Auth ---
  if (
    ctx.status === 401 ||
    ctx.status === 403 ||
    lower.includes("unauthorized") ||
    lower.includes("forbidden")
  ) {
    code = "LLM_PROVIDER_AUTH_ERROR";
    reason = "AUTH";
    layer = ctx.layer ?? "provider";
  }

  // --- Bad request / invalid payload ---
  if (
    ctx.status === 400 ||
    lower.includes("bad request") ||
    lower.includes("invalid") ||
    lower.includes("malformed")
  ) {
    code = "LLM_PROVIDER_BAD_REQUEST";
    reason = "BAD_REQUEST";
    layer = ctx.layer ?? "input";
  }

  // --- Provider down / unavailable ---
  if (
    ctx.status === 502 ||
    ctx.status === 503 ||
    ctx.status === 504 ||
    lower.includes("service unavailable") ||
    lower.includes("overloaded") ||
    lower.includes("gateway") ||
    lower.includes("connection refused")
  ) {
    code = "LLM_PROVIDER_UNAVAILABLE";
    reason = "PROVIDER_DOWN";
    layer = ctx.layer ?? "provider";
  }

  // --- Network errors ---
  if (
    lower.includes("network") ||
    lower.includes("fetch failed") ||
    lower.includes("econnreset") ||
    lower.includes("enotfound") ||
    lower.includes("socket") ||
    lower.includes("tls")
  ) {
    code = "LLM_NETWORK_ERROR";
    reason = "NETWORK";
    layer = ctx.layer ?? "network";
  }

  // --- Streaming corruption / parse errors ---
  if (
    lower.includes("stream") &&
    (lower.includes("parse") || lower.includes("json"))
  ) {
    code = "LLM_STREAM_CORRUPTED";
    reason = "UNKNOWN";
    layer = ctx.layer ?? "streaming";
  }

  // --- Generation failure fallback ---
  if (
    code === "LLM_UNKNOWN_ERROR" &&
    (lower.includes("generate") || lower.includes("completion"))
  ) {
    code = "LLM_GENERATION_FAILED";
    reason = "UNKNOWN";
    layer = ctx.layer ?? "generation";
  }

  // Retryability heuristic (best-effort)
  const retryable = isRetryable(code);

  return {
    name: "LLMError",
    code,
    layer,
    severity,
    reason,
    message,
    at,
    cause: err,
    meta: {
      status: ctx.status,
      requestId: ctx.requestId,
      retryable,
      provider,
      model: ctx.model,
      debug: {
        endpoint: ctx.endpoint,
        traceId: ctx.traceId,
        turnId: ctx.turnId,
      },
    },
  };
}

/* ------------------------- helpers ------------------------- */

function toSafeMessage(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === "AbortError" || /abort/i.test(err.message))
  );
}

function isRetryable(code: LLMErrorCode): boolean {
  switch (code) {
    case "LLM_PROVIDER_TIMEOUT":
    case "LLM_PROVIDER_UNAVAILABLE":
    case "LLM_PROVIDER_OVERLOADED":
    case "LLM_NETWORK_ERROR":
    case "LLM_STREAM_CORRUPTED":
      return true;
    case "LLM_PROVIDER_RATE_LIMIT":
      return true; // usually retry after window
    case "LLM_PROVIDER_AUTH_ERROR":
    case "LLM_PROVIDER_BAD_REQUEST":
      return false;
    default:
      return false;
  }
}
