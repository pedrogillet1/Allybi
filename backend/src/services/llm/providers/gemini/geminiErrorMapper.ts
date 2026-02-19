// src/services/llm/providers/gemini/geminiErrorMapper.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Gemini Error Mapper (Allybi, ChatGPT-parity)
 * -----------------------------------------
 * Converts Google Gemini SDK / HTTP errors into Allybi's normalized error shape.
 *
 * Goals:
 *  - Stable error codes for downstream handling (retry, fallback, user-safe error)
 *  - Correct retryability classification (transient vs fatal)
 *  - No secret leakage (never include API keys)
 *  - No internal path leakage in messages
 *
 * Used by:
 *  - geminiClient.service.ts
 *  - llmRouter.service.ts (fallback decisions)
 *  - llmStreamAdapter.service.ts (error events)
 */

export type GeminiErrorCode =
  | "gemini_unauthorized"
  | "gemini_forbidden"
  | "gemini_rate_limited"
  | "gemini_timeout"
  | "gemini_bad_request"
  | "gemini_model_not_found"
  | "gemini_context_length"
  | "gemini_server_error"
  | "gemini_network_error"
  | "gemini_stream_error"
  | "gemini_safety_blocked"
  | "gemini_unknown_error";

export interface MappedGeminiError {
  code: GeminiErrorCode;
  message: string;
  status?: number;
  retryable: boolean;
  detail?: any; // non-prod only
}

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

function sanitizeMessage(msg: any): string {
  const s = typeof msg === "string" ? msg : "Request failed";
  return s.trim().replace(/([A-Z]:\\|\/home\/|\/Users\/)[^\s"]+/g, "[path]");
}

function statusFrom(err: any): number | undefined {
  const status = err?.status ?? err?.response?.status ?? err?.statusCode;
  return typeof status === "number" && Number.isFinite(status)
    ? status
    : undefined;
}

function messageFrom(err: any): string {
  return sanitizeMessage(
    err?.message ??
      err?.response?.data?.error?.message ??
      err?.response?.data?.message ??
      err?.error?.message ??
      "Request failed",
  );
}

function isNetworkish(err: any): boolean {
  const code = String(err?.code ?? "").toUpperCase();
  return [
    "ECONNABORTED",
    "ECONNRESET",
    "ETIMEDOUT",
    "ENOTFOUND",
    "EAI_AGAIN",
  ].includes(code);
}

export function mapGeminiError(err: any): MappedGeminiError {
  const status = statusFrom(err);
  const msg = messageFrom(err);
  const lower = msg.toLowerCase();

  // Rate limit
  if (
    status === 429 ||
    lower.includes("rate limit") ||
    lower.includes("quota")
  ) {
    return {
      code: "gemini_rate_limited",
      message: msg,
      status,
      retryable: true,
      detail: isProd() ? undefined : err,
    };
  }

  // Auth
  if (status === 401) {
    return {
      code: "gemini_unauthorized",
      message: msg,
      status,
      retryable: false,
      detail: isProd() ? undefined : err,
    };
  }
  if (status === 403) {
    // Gemini safety blocks sometimes appear as 403 with policy wording
    if (
      lower.includes("safety") ||
      lower.includes("blocked") ||
      lower.includes("policy")
    ) {
      return {
        code: "gemini_safety_blocked",
        message: msg,
        status,
        retryable: false,
        detail: isProd() ? undefined : err,
      };
    }
    return {
      code: "gemini_forbidden",
      message: msg,
      status,
      retryable: false,
      detail: isProd() ? undefined : err,
    };
  }

  // Timeout/network
  if (
    isNetworkish(err) ||
    lower.includes("timeout") ||
    lower.includes("timed out")
  ) {
    return {
      code: "gemini_timeout",
      message: msg,
      status,
      retryable: true,
      detail: isProd() ? undefined : err,
    };
  }

  // Bad request
  if (status === 400) {
    if (
      lower.includes("model") &&
      (lower.includes("not found") || lower.includes("unknown"))
    ) {
      return {
        code: "gemini_model_not_found",
        message: msg,
        status,
        retryable: false,
        detail: isProd() ? undefined : err,
      };
    }
    if (
      lower.includes("context") &&
      (lower.includes("length") ||
        lower.includes("too long") ||
        lower.includes("tokens"))
    ) {
      return {
        code: "gemini_context_length",
        message: msg,
        status,
        retryable: false,
        detail: isProd() ? undefined : err,
      };
    }
    return {
      code: "gemini_bad_request",
      message: msg,
      status,
      retryable: false,
      detail: isProd() ? undefined : err,
    };
  }

  // Server
  if (typeof status === "number" && status >= 500 && status <= 599) {
    return {
      code: "gemini_server_error",
      message: msg,
      status,
      retryable: true,
      detail: isProd() ? undefined : err,
    };
  }

  // Stream
  if (lower.includes("stream")) {
    return {
      code: "gemini_stream_error",
      message: msg,
      status,
      retryable: true,
      detail: isProd() ? undefined : err,
    };
  }

  // Network
  if (isNetworkish(err)) {
    return {
      code: "gemini_network_error",
      message: msg,
      status,
      retryable: true,
      detail: isProd() ? undefined : err,
    };
  }

  return {
    code: "gemini_unknown_error",
    message: msg,
    status,
    retryable: false,
    detail: isProd() ? undefined : err,
  };
}

export default mapGeminiError;
