// src/types/streaming.types.ts
/**
 * STREAMING TYPES (ChatGPT-style SSE)
 *
 * Goals:
 * - Support token streaming (delta text)
 * - Support structured “attachments” (source buttons / file lists)
 * - Support message lifecycle (start → delta → done / error)
 * - Support regeneration (regenCount) so backend can vary phrasing
 *
 * Transport: Server-Sent Events (SSE)
 * - Content-Type: text/event-stream
 * - Each event has: event: <type>\n data: <json>\n\n
 */

import type { Attachment } from "./attachments.types";
import type { ChatRole as ChatMessageRole } from "./chat.types";

// ----------------------------------------------------------------------------
// Core IDs / Status
// ----------------------------------------------------------------------------

export type ConversationId = string;
export type MessageId = string;
export type RequestId = string;

export type StreamStatus =
  | "queued"
  | "streaming"
  | "done"
  | "error"
  | "canceled";

// ----------------------------------------------------------------------------
// Streaming “stage” (optional UX: Thinking / Searching / Composing)
// ----------------------------------------------------------------------------

export type StreamStage =
  | "thinking"
  | "routing"
  | "scoping"
  | "retrieving"
  | "reading"
  | "composing"
  | "validating"
  | "finalizing";

export interface StreamStageUpdate {
  stage: StreamStage;
  message?: string; // small UX string
  progress?: number; // 0..1
  at?: string; // ISO timestamp
}

// ----------------------------------------------------------------------------
// SSE Event Names (wire protocol)
// ----------------------------------------------------------------------------

export type SseEventType =
  | "chat.start"
  | "chat.stage"
  | "chat.delta"
  | "chat.attachments"
  | "chat.meta"
  | "chat.done"
  | "chat.error"
  | "chat.ping";

// ----------------------------------------------------------------------------
// Base Event
// ----------------------------------------------------------------------------

export interface SseBaseEvent<TType extends SseEventType, TPayload> {
  event: TType;
  data: TPayload;
}

// ----------------------------------------------------------------------------
// Start Event
// ----------------------------------------------------------------------------

export interface ChatStartPayload {
  requestId: RequestId;
  conversationId: ConversationId;
  messageId: MessageId;

  role: ChatMessageRole; // usually 'assistant'
  status: StreamStatus; // 'streaming'

  // optional: allow frontend to render optimistically
  createdAt?: string; // ISO
}

export type ChatStartEvent = SseBaseEvent<"chat.start", ChatStartPayload>;

// ----------------------------------------------------------------------------
// Stage Event
// ----------------------------------------------------------------------------

export interface ChatStagePayload extends StreamStageUpdate {
  requestId: RequestId;
  conversationId: ConversationId;
  messageId: MessageId;
}

export type ChatStageEvent = SseBaseEvent<"chat.stage", ChatStagePayload>;

// ----------------------------------------------------------------------------
// Delta Event (token streaming)
// ----------------------------------------------------------------------------

export interface ChatDeltaPayload {
  requestId: RequestId;
  conversationId: ConversationId;
  messageId: MessageId;

  // Token delta (append to assistant message)
  delta: string;

  // Optional: chunk index (for debugging / ordering)
  index?: number;
}

export type ChatDeltaEvent = SseBaseEvent<"chat.delta", ChatDeltaPayload>;

// ----------------------------------------------------------------------------
// Attachments Event
// ----------------------------------------------------------------------------

export interface ChatAttachmentsPayload {
  requestId: RequestId;
  conversationId: ConversationId;
  messageId: MessageId;

  // Replace or append attachments
  mode?: "replace" | "append";
  attachments: Attachment[];
}

export type ChatAttachmentsEvent = SseBaseEvent<
  "chat.attachments",
  ChatAttachmentsPayload
>;

// ----------------------------------------------------------------------------
// Meta Event (answerMode, confidence, followups, domain, etc.)
// ----------------------------------------------------------------------------

export interface ChatMetaPayload {
  requestId: RequestId;
  conversationId: ConversationId;
  messageId: MessageId;

  answerMode?: string | null; // e.g. nav_pills, doc_grounded_single, scoped_not_found
  domainId?: string | null; // e.g. finance_markets
  confidence?: number | null; // 0..1

  // Used for regenerate variety
  regenCount?: number;

  // Follow-up suggestions (plain text questions)
  followUpSuggestions?: string[];

  // Optional: debug trace key (only if enabled)
  traceKey?: string;
}

export type ChatMetaEvent = SseBaseEvent<"chat.meta", ChatMetaPayload>;

// ----------------------------------------------------------------------------
// Done Event
// ----------------------------------------------------------------------------

export interface ChatDonePayload {
  requestId: RequestId;
  conversationId: ConversationId;
  messageId: MessageId;

  status: "done";

  // Final assistant content (optional).
  // Many implementations stream all content via delta and leave this empty.
  finalText?: string;

  // Final attachments (optional) in case they weren’t sent earlier
  attachments?: Attachment[];

  // Final meta snapshot
  meta?: Omit<ChatMetaPayload, "requestId" | "conversationId" | "messageId">;

  finishedAt?: string; // ISO
}

export type ChatDoneEvent = SseBaseEvent<"chat.done", ChatDonePayload>;

// ----------------------------------------------------------------------------
// Error Event
// ----------------------------------------------------------------------------

export type ChatErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "SCOPE_EMPTY"
  | "NO_DOCS"
  | "EXTRACTION_FAILED"
  | "RETRIEVAL_FAILED"
  | "COMPOSE_FAILED"
  | "INTERNAL_ERROR";

export interface ChatErrorPayload {
  requestId?: RequestId;
  conversationId?: ConversationId;
  messageId?: MessageId;

  status: "error";
  code: ChatErrorCode;
  message: string;

  // Optional: structured details for UI
  details?: Record<string, unknown>;

  // Helpful for retry UX
  retryable?: boolean;
}

export type ChatErrorEvent = SseBaseEvent<"chat.error", ChatErrorPayload>;

// ----------------------------------------------------------------------------
// Ping / Keep-alive
// ----------------------------------------------------------------------------

export interface ChatPingPayload {
  at: string; // ISO
}

export type ChatPingEvent = SseBaseEvent<"chat.ping", ChatPingPayload>;

// ----------------------------------------------------------------------------
// Union Types
// ----------------------------------------------------------------------------

export type ChatSseEvent =
  | ChatStartEvent
  | ChatStageEvent
  | ChatDeltaEvent
  | ChatAttachmentsEvent
  | ChatMetaEvent
  | ChatDoneEvent
  | ChatErrorEvent
  | ChatPingEvent;

// ----------------------------------------------------------------------------
// Streaming Request Types (frontend → backend)
// ----------------------------------------------------------------------------

export interface ChatStreamRequest {
  conversationId?: ConversationId;

  // user message
  userText: string;

  // optional context flags
  language?: "en" | "pt" | "es";
  userRequestedShort?: boolean;

  // doc scope hints
  attachedDocumentId?: string | null;

  // regeneration
  regenerateMessageId?: MessageId;
  regenCount?: number;

  // optional UX
  clientRequestId?: string;
}
