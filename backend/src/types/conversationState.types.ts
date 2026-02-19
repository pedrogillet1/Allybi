// src/types/chat.types.ts

/**
 * Chat types aligned to a ChatGPT-style UX:
 * - threads (conversations) with titles
 * - messages with roles, streaming states, regenCount
 * - attachments + follow-up suggestions
 * - metadata for routing / answer modes / sources UI
 */

import type { Attachment } from "./attachments.types";

// -----------------------------
// Core enums / unions
// -----------------------------

export type ChatRole = "user" | "assistant" | "system";

export type MessageStatus =
  | "queued"
  | "streaming"
  | "done"
  | "error"
  | "cancelled";

export type AnswerMode =
  | "no_docs"
  | "scoped_not_found"
  | "refusal"
  | "nav_pills"
  | "rank_disambiguate"
  | "rank_autopick"
  | "doc_grounded_single"
  | "doc_grounded_table"
  | "doc_grounded_quote"
  | "doc_grounded_multi"
  | "doc_discovery_list"
  | "help_steps"
  | "general_answer"
  | string;

// -----------------------------
// Thread / Conversation
// -----------------------------

export type ChatThread = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;

  /**
   * Optional: used for quick list preview.
   */
  lastMessageSnippet?: string;

  /**
   * Optional: pinned/starred UX.
   */
  pinned?: boolean;
  archived?: boolean;
};

// -----------------------------
// Message metadata
// -----------------------------

export type ChatMessageMeta = {
  /**
   * ChatGPT-like: determines UI rules:
   * - nav_pills: hide actions, show pills-only attachments, minimal body
   */
  answerMode?: AnswerMode;

  /**
   * Convenience flags for frontend.
   */
  isNavPills?: boolean;
  hideActions?: boolean;

  /**
   * Routing / confidence context (optional; safe to show in debug only).
   */
  operator?: string;
  intentFamily?: string;
  domain?: string;
  confidence?: number; // 0..1

  /**
   * Source doc context (optional).
   */
  activeDocId?: string;
  explicitDocRef?: string;

  /**
   * Quality + debug (should be hidden in prod UI unless debug mode).
   */
  qualityGateTrace?: string[];
  warnings?: string[];
};

// -----------------------------
// Message
// -----------------------------

export type ChatMessage = {
  id: string;
  threadId: string;
  role: ChatRole;

  /**
   * Rendered text to display in the chat bubble.
   * For streaming: partial content accumulates here.
   */
  content: string;

  createdAt: string;

  /**
   * Streaming state.
   */
  status: MessageStatus;
  error?: {
    code?: string;
    message: string;
    retryable?: boolean;
  };

  /**
   * Regenerate behavior:
   * - regenCount increments each time user hits regenerate on this assistant message
   * - originalContent stores the first completed answer for "restore" / comparison UX (optional)
   */
  regenCount?: number;
  originalContent?: string;
  isRegenerating?: boolean;

  /**
   * Attachments (sources, file lists, etc).
   */
  attachments?: Attachment[];

  /**
   * Follow-up suggestions shown as plain text (NOT pills) per your render_policy.
   */
  followUpSuggestions?: string[];

  /**
   * Extra data for UI / routing.
   */
  meta?: ChatMessageMeta;

  /**
   * Raw backend fields you might want to preserve without breaking UI contract.
   * Keep optional and namespaced.
   */
  raw?: Record<string, any>;
};

// -----------------------------
// Chat send / stream contracts
// -----------------------------

export type ChatSendRequest = {
  threadId?: string;

  /**
   * User text to send.
   */
  message: string;

  /**
   * Optional doc selection context from UI.
   */
  attachedDocumentId?: string | null;

  /**
   * Regenerate:
   * - regenerateMessageId tells backend which assistant message is being regenerated
   * - regenCount increments for variation seed / cache bypass
   */
  regenerateMessageId?: string;
  regenCount?: number;

  /**
   * Optional feature switches.
   */
  researchMode?: boolean;

  /**
   * Client correlation id (recommended).
   */
  requestId?: string;
};

export type ChatStreamEventType = "meta" | "delta" | "done" | "error" | "stage";

export type ChatStreamMeta = {
  threadId: string;
  assistantMessageId: string;
  requestId?: string;

  answerMode?: AnswerMode;
  operator?: string;
  intentFamily?: string;
  domain?: string;
  confidence?: number;

  followUpSuggestions?: string[];
};

export type ChatStreamEvent =
  | {
      type: "meta";
      data: ChatStreamMeta;
    }
  | {
      type: "stage";
      data: {
        stage:
          | "routing"
          | "searching"
          | "reading"
          | "thinking"
          | "writing"
          | string;
        message?: string;
      };
    }
  | {
      type: "delta";
      data: { text: string };
    }
  | {
      type: "done";
      data: {
        threadId: string;
        assistantMessageId: string;
        text: string;
        attachments?: Attachment[];
        meta?: ChatMessageMeta;
      };
    }
  | {
      type: "error";
      data: {
        threadId?: string;
        assistantMessageId?: string;
        code?: string;
        message: string;
        retryable?: boolean;
      };
    };

// -----------------------------
// History endpoints
// -----------------------------

export type ChatHistoryListResponse = {
  threads: ChatThread[];
  nextCursor?: string | null;
};

export type ChatThreadMessagesResponse = {
  thread: ChatThread;
  messages: ChatMessage[];
  nextCursor?: string | null;
};

// -----------------------------
// Helpers
// -----------------------------

export function isAssistantMessage(m: ChatMessage): boolean {
  return m.role === "assistant";
}

export function isNavPillsMessage(m: ChatMessage): boolean {
  const mode = m.meta?.answerMode || (m as any).answerMode;
  const hasNavPillAttachment = (m.attachments || []).some(
    (a) =>
      a?.type === "source_buttons" &&
      (a as any).answerMode?.startsWith("nav_pill"),
  );
  return (
    mode === "nav_pills" ||
    mode === "nav_pill" ||
    m.meta?.isNavPills === true ||
    hasNavPillAttachment
  );
}
