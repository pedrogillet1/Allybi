// src/services/llm/providers/openai/openaiErrorMapper.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * OpenAI Error Mapper (Allybi, ChatGPT-parity)
 * -----------------------------------------
 * Converts OpenAI SDK / HTTP errors into Allybi's normalized error shape.
 *
 * Goals:
 *  - Stable error codes for downstream handling (retry, fallback, user-safe error)
 *  - Correct retryability classification (transient vs fatal)
 *  - No secret leakage (never include API keys)
 *  - No path leakage in messages
 *
 * Used by:
 *  - openaiClient.service.ts
 *  - llmRouter.service.ts (fallback decisions)
 *  - llmStreamAdapter.service.ts (error events)
 */

export type OpenAIErrorCode =
  | "openai_unauthorized"
  | "openai_forbidden"
  | "openai_rate_limited"
  | "openai_timeout"
  | "openai_bad_request"
  | "openai_model_not_found"
  | "openai_context_length"
  | "openai_server_error"
  | "openai_network_error"
  | "openai_stream_error"
  | "openai_unknown_error";

export interface MappedOpenAIError {
  code: OpenAIErrorCode;
  message: string;
  status?: number;
  retryable: boolean;
  detail?: any; // dev only
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

function errorTypeString(err: any): string {
  return String(err?.name ?? err?.type ?? "").toLowerCase();
}

function messageFrom(err: any): string {
  return sanitizeMessage(
    err?.message ??
      err?.response?.data?.error?.message ??
      err?.response?.data?.message ??
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

export function mapOpenAIError(err: any): MappedOpenAIError {
  const status = statusFrom(err);
  const msg = messageFrom(err);
  const t = errorTypeString(err);

  // Rate limit
  if (status === 429) {
    return {
      code: "openai_rate_limited",
      message: msg,
      status,
      retryable: true,
      detail: isProd() ? undefined : err,
    };
  }

  // Auth errors
  if (status === 401) {
    return {
      code: "openai_unauthorized",
      message: msg,
      status,
      retryable: false,
      detail: isProd() ? undefined : err,
    };
  }
  if (status === 403) {
    return {
      code: "openai_forbidden",
      message: msg,
      status,
      retryable: false,
      detail: isProd() ? undefined : err,
    };
  }

  // Timeout / network
  if (isNetworkish(err) || t.includes("timeout")) {
    return {
      code: "openai_timeout",
      message: msg,
      status,
      retryable: true,
      detail: isProd() ? undefined : err,
    };
  }

  // Bad request
  if (status === 400) {
    // model not found / invalid request / tool schema mismatch, etc.
    const lower = msg.toLowerCase();
    if (lower.includes("model") && lower.includes("not found")) {
      return {
        code: "openai_model_not_found",
        message: msg,
        status,
        retryable: false,
        detail: isProd() ? undefined : err,
      };
    }
    if (
      lower.includes("maximum context length") ||
      lower.includes("context length") ||
      lower.includes("too many tokens")
    ) {
      return {
        code: "openai_context_length",
        message: msg,
        status,
        retryable: false,
        detail: isProd() ? undefined : err,
      };
    }
    return {
      code: "openai_bad_request",
      message: msg,
      status,
      retryable: false,
      detail: isProd() ? undefined : err,
    };
  }

  // Server errors
  if (typeof status === "number" && status >= 500 && status <= 599) {
    return {
      code: "openai_server_error",
      message: msg,
      status,
      retryable: true,
      detail: isProd() ? undefined : err,
    };
  }

  // Explicit stream errors
  if (t.includes("stream")) {
    return {
      code: "openai_stream_error",
      message: msg,
      status,
      retryable: true,
      detail: isProd() ? undefined : err,
    };
  }

  // Generic network error
  if (isNetworkish(err)) {
    return {
      code: "openai_network_error",
      message: msg,
      status,
      retryable: true,
      detail: isProd() ? undefined : err,
    };
  }

  return {
    code: "openai_unknown_error",
    message: msg,
    status,
    retryable: false,
    detail: isProd() ? undefined : err,
  };
}

export default mapOpenAIError;
