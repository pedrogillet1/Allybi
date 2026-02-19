// src/types/common.types.ts
/**
 * Common, shared types used across the backend.
 * Keep this file free of domain logic. No imports from services.
 */

export type ISODateString = string;

export type LanguageCode = "en" | "pt" | "es";
export type EnvName = "production" | "staging" | "dev" | "local";

export type UUID = string;
export type ID = string;

export type Dict<T = unknown> = Record<string, T>;

export type Maybe<T> = T | null | undefined;

export type OneOrMany<T> = T | T[];

export interface PaginationInput {
  limit?: number; // default chosen at route layer
  cursor?: string | null;
}

export interface PaginationOutput {
  limit: number;
  nextCursor?: string | null;
  hasMore?: boolean;
}

export type SortDirection = "asc" | "desc";

export interface SortInput {
  field: string;
  direction: SortDirection;
}

export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export interface ServiceErrorShape {
  code: string; // stable machine-readable code
  message: string; // safe, user-facing-ish message (no secrets)
  details?: Dict; // optional diagnostic info (safe)
  cause?: string; // optional short internal hint (safe)
}

export class ServiceError extends Error {
  public readonly code: string;
  public readonly details?: Dict;
  public readonly causeHint?: string;

  constructor(
    code: string,
    message: string,
    opts?: { details?: Dict; causeHint?: string },
  ) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
    this.details = opts?.details;
    this.causeHint = opts?.causeHint;
  }

  toJSON(): ServiceErrorShape {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      cause: this.causeHint,
    };
  }
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface TraceContext {
  requestId?: string;
  correlationId?: string;
  userId?: string;
  sessionId?: string;
  conversationId?: string;
  turnId?: string;
}

export interface WithTrace<T> {
  trace?: TraceContext;
  data: T;
}

export type Confidence = number; // 0..1

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Minimal runtime helpers (safe, tiny).
 * Avoid adding “business logic” here — keep it utilities-level.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
