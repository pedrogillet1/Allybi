// backend/src/types/errors.types.ts

/**
 * Error Types (ChatGPT-parity, stable envelopes)
 * ----------------------------------------------
 * Centralizes:
 *  - standardized API error envelope
 *  - error codes used across controllers/services
 *  - typed error classes (ApiError) compatible with error.middleware.ts
 *
 * Goals:
 *  - Never leak sensitive details in production
 *  - Always include correlationId when available
 *  - Keep error codes stable so frontend can map them to UX states
 */

export type EnvName = "production" | "staging" | "dev" | "local";

/**
 * Canonical error codes used throughout the API.
 * Keep these stable (front-end can switch on them).
 */
export type ErrorCode =
  | "bad_request"
  | "validation_error"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "timeout"
  | "network_error"
  | "read_failed"
  | "write_failed"
  | "missing_storage_pointer"
  | "invalid_path"
  | "doc_index_too_large"
  | "internal_error";

/**
 * Standard API error envelope.
 */
export type ApiErrorEnvelope = {
  ok: false;
  error: {
    code: ErrorCode | string;
    message: string;
    correlationId?: string | null;
    details?: any; // non-prod only
  };
};

/**
 * Standard API ok envelope.
 */
export type ApiOk<T extends object> = {
  ok: true;
} & T;

/**
 * ApiError class that can be thrown from services/controllers
 * and rendered by error.middleware.ts.
 */
export class ApiError extends Error {
  status: number;
  code: ErrorCode | string;
  details?: any;
  expose?: boolean;

  constructor(args: {
    code: ErrorCode | string;
    message: string;
    status?: number;
    details?: any;
    expose?: boolean;
  }) {
    super(args.message);
    this.name = "ApiError";
    this.code = args.code;
    this.status = args.status ?? 500;
    this.details = args.details;
    this.expose = args.expose ?? false;
  }
}

/**
 * Helper constructors for common statuses.
 */
export const Errors = {
  badRequest: (message = "Bad request", details?: any) =>
    new ApiError({ code: "bad_request", message, status: 400, details, expose: true }),

  validation: (message = "Validation error", details?: any) =>
    new ApiError({ code: "validation_error", message, status: 400, details, expose: true }),

  unauthorized: (message = "Unauthorized") =>
    new ApiError({ code: "unauthorized", message, status: 401, expose: true }),

  forbidden: (message = "Forbidden") =>
    new ApiError({ code: "forbidden", message, status: 403, expose: true }),

  notFound: (message = "Not found", details?: any) =>
    new ApiError({ code: "not_found", message, status: 404, details, expose: true }),

  conflict: (message = "Conflict", details?: any) =>
    new ApiError({ code: "conflict", message, status: 409, details, expose: true }),

  rateLimited: (message = "Rate limited", details?: any) =>
    new ApiError({ code: "rate_limited", message, status: 429, details, expose: true }),

  internal: (message = "Request failed", details?: any) =>
    new ApiError({ code: "internal_error", message, status: 500, details, expose: false }),
};
