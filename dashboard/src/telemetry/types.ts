/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Telemetry Types (Koda)
 * ----------------------
 * Single source of truth for:
 *  - event names
 *  - payload contracts
 *  - severity/category enums
 *
 * Design rules:
 *  - Events are append-only and immutable once emitted.
 *  - Payloads must be JSON-serializable.
 *  - Never include secrets (tokens, raw keys, passwords).
 */

export type TelemetryEnv = "production" | "staging" | "dev" | "local";
export type TelemetrySeverity = "debug" | "info" | "warn" | "error" | "fatal";

export type TelemetryCategory =
  | "auth"
  | "files"
  | "folders"
  | "documents"
  | "chat"
  | "rag"
  | "routing"
  | "retrieval"
  | "llm"
  | "security"
  | "admin"
  | "billing"
  | "system";

/**
 * Canonical event envelope for all telemetry.
 */
export interface TelemetryEvent<TName extends string = string, TPayload = any> {
  id: string;                 // cuid/uuid (generated at emit time)
  name: TName;                // event name
  category: TelemetryCategory;
  severity: TelemetrySeverity;

  ts: string;                 // ISO timestamp (UTC)
  env: TelemetryEnv;

  // Request context
  correlationId?: string;
  requestId?: string;
  sessionId?: string;

  // Actor context
  userId?: string;
  ip?: string;
  userAgent?: string;

  // Target context (optional)
  conversationId?: string;
  messageId?: string;
  documentId?: string;
  folderId?: string;

  // Main event payload
  payload: TPayload;
}

/**
 * Core payload building blocks
 */
export interface TelemetryTiming {
  ms?: number;
  ttftMs?: number;
  totalMs?: number;
}

export interface TelemetryErrorShape {
  code?: string;
  message: string;
  stack?: string; // should be redacted in prod sinks
  where?: string;
  meta?: Record<string, any>;
}

export interface TelemetrySourceRef {
  docId: string;
  title?: string;
  filename?: string;
  mimeType?: string;
  page?: number;
  slide?: number;
  sheet?: string;
  score?: number;
}

export interface TelemetryAttachmentRef {
  kind: "file" | "folder" | "source";
  id: string;
  title?: string;
  filename?: string;
  mimeType?: string;
  folderPath?: string;
  page?: number;
  meta?: Record<string, any>;
}

/**
 * Event payloads by category (minimal but extensible)
 */

export type AuthEventName =
  | "auth.login.success"
  | "auth.login.failed"
  | "auth.logout"
  | "auth.register"
  | "auth.session.created"
  | "auth.session.revoked"
  | "auth.2fa.setup.started"
  | "auth.2fa.setup.enabled"
  | "auth.2fa.challenge.failed"
  | "auth.2fa.challenge.passed";

export interface AuthEventPayload {
  method?: "password" | "google" | "apple" | "refresh";
  reason?: string; // failure reason
  deviceId?: string;
  isSuspicious?: boolean;
  country?: string;
  city?: string;
}

export type FilesEventName =
  | "files.upload.started"
  | "files.upload.completed"
  | "files.upload.failed"
  | "files.move"
  | "files.rename"
  | "files.delete"
  | "files.restore";

export interface FilesEventPayload {
  uploadSessionId?: string;
  filename?: string;
  mimeType?: string;
  sizeBytes?: number;
  fromFolderId?: string | null;
  toFolderId?: string | null;
  result?: "success" | "failed";
  error?: TelemetryErrorShape;
}

export type RetrievalEventName =
  | "retrieval.started"
  | "retrieval.completed"
  | "retrieval.retry"
  | "retrieval.failed";

export interface RetrievalEventPayload {
  query?: string;
  retrievalMethod?: string; // "hybrid"|"bm25"|"vector"
  vectorTopK?: number;
  bm25TopK?: number;
  fusedTopK?: number;
  finalK?: number;

  chunksReturned?: number;
  distinctDocs?: number;
  topScore?: number;
  avgScore?: number;

  sources?: TelemetrySourceRef[];
  error?: TelemetryErrorShape;
}

export type LlmEventName =
  | "llm.request"
  | "llm.first_token"
  | "llm.stream.done"
  | "llm.response"
  | "llm.error";

export interface LlmEventPayload {
  provider?: "openai" | "google" | "anthropic" | "local";
  model?: string;
  requestType?: string; // "chat"|"retrieval"|"tool"|"summary"
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;

  ttftMs?: number;
  totalMs?: number;
  cached?: boolean;
  error?: TelemetryErrorShape;
}

export type RoutingEventName =
  | "routing.classified"
  | "routing.disambiguation"
  | "routing.blocked"
  | "routing.fallback";

export interface RoutingEventPayload {
  intent?: string;
  confidence?: number;
  operator?: string;
  answerMode?: string;
  navType?: string | null;
  reasonCodes?: string[];
  blockedByNegatives?: boolean;
}

export type ChatEventName =
  | "chat.message.received"
  | "chat.message.saved"
  | "chat.stream.started"
  | "chat.stream.done"
  | "chat.stream.aborted"
  | "chat.stream.error";

export interface ChatEventPayload {
  answerMode?: string;
  navType?: string | null;
  sourcesCount?: number;
  attachmentsCount?: number;
  hadFallback?: boolean;
  error?: TelemetryErrorShape;
}

/**
 * Union of all known event names
 * (Add as you expand coverage)
 */
export type TelemetryEventName =
  | AuthEventName
  | FilesEventName
  | RetrievalEventName
  | LlmEventName
  | RoutingEventName
  | ChatEventName
  | string;

/**
 * Helper: type-safe emit signature for known events
 */
export type TelemetryEmitInput<TName extends TelemetryEventName, TPayload> = Omit<
  TelemetryEvent<TName, TPayload>,
  "id" | "ts" | "env" | "category" | "severity"
> & {
  category: TelemetryCategory;
  severity: TelemetrySeverity;
};
