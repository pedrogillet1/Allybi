// src/types/api.types.ts

import type { LanguageCode } from "./intents.types";

/**
 * Generic API response shape (non-streaming).
 */
export type ApiSuccess<T> = {
  ok: true;
  data: T;
  meta?: Record<string, any>;
};

export type ApiError = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: Record<string, any>;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

/**
 * Common pagination (for history, documents lists, etc.)
 */
export type Pagination = {
  page?: number;
  pageSize?: number;
  total?: number;
  nextCursor?: string | null;
};

/**
 * Sources + Attachments contract (what backend returns, what frontend renders).
 * “source_buttons” is the ChatGPT-like pill attachment.
 */
export type AttachmentType =
  | "source_buttons"
  | "file_list"
  | "grouped_files"
  | "select_file"
  | "options"
  | "debug"
  | string;

export type SourceLocation =
  | { type: "page"; value: number; label?: string }
  | { type: "slide"; value: number; label?: string }
  | { type: "sheet"; value: string; label?: string }
  | { type: "cell"; value: string; label?: string }
  | { type: "section"; value: string; label?: string };

export type SourceButton = {
  documentId: string;
  title: string;
  filename?: string;
  mimeType?: string;
  location?: SourceLocation;
};

export type SeeAllMeta = {
  label: string;
  totalCount: number;
  remainingCount: number;
  filterExtensions?: string[]; // e.g. ["pdf","xlsx"]
  filterDomain?: string; // optional: "finance", "legal", etc.
};

export type SourceButtonsAttachment = {
  type: "source_buttons";
  answerMode?: "nav_pill" | "nav_pills" | string; // frontend uses this to hide actions/labels
  buttons: SourceButton[];
  seeAll?: SeeAllMeta;
};

export type FileItem = {
  documentId: string;
  title?: string;
  filename: string;
  mimeType?: string;
  folderPath?: string;
  sizeBytes?: number;
  uploadedAt?: string;
};

export type FileListAttachment = {
  type: "file_list";
  items: FileItem[];
  totalCount: number;
  seeAll?: SeeAllMeta;
  seeAllLabel?: string; // legacy support
};

export type GroupedFilesAttachment = {
  type: "grouped_files";
  totalCount: number;
  groups: Array<{
    groupKey: string; // e.g. folder name / extension / domain
    label?: string;
    count: number;
    items: FileItem[];
  }>;
  seeAll?: SeeAllMeta;
};

export type SelectFileAttachment = {
  type: "select_file";
  prompt?: string;
  options: FileItem[];
};

export type Attachment =
  | SourceButtonsAttachment
  | FileListAttachment
  | GroupedFilesAttachment
  | SelectFileAttachment
  | {
      type: AttachmentType;
      [k: string]: any;
    };

/**
 * Chat message payload (what frontend stores + renders).
 * Note: answerMode is top-level AND duplicated into meta by messageUtils normalization.
 */
export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;

  // Optional UI hints
  answerMode?: string | null; // e.g. "nav_pills", "doc_grounded_single"
  regenCount?: number;

  // Attachments rendered below message
  attachments?: Attachment[];

  // Optional meta (safe to expose to UI)
  meta?: {
    answerMode?: string | null;
    isNavPills?: boolean;
    hideActions?: boolean;

    intent?: string | null;
    operator?: string | null;
    domain?: string | null;

    confidence?: number | null;

    followUpSuggestions?: string[];
    requestId?: string;
    traceId?: string;

    [k: string]: any;
  };
};

/**
 * Streaming protocol (SSE) payloads.
 * Backend can send incremental chunks and a final “done”.
 */
export type ChatStreamEventType =
  | "meta"
  | "delta"
  | "attachments"
  | "done"
  | "error"
  | string;

export type ChatStreamMeta = {
  requestId?: string;
  conversationId?: string;
  messageId?: string; // assistant message id
  language?: LanguageCode | "en" | "pt" | "es";
  answerMode?: string | null;
  operator?: string | null;
  domain?: string | null;
  confidence?: number | null;
  followUpSuggestions?: string[];
  [k: string]: any;
};

export type ChatStreamDelta = {
  text: string; // appended
};

export type ChatStreamAttachments = {
  attachments: Attachment[];
};

export type ChatStreamDone = {
  content: string;
  attachments?: Attachment[];
  meta?: ChatStreamMeta;
};

export type ChatStreamError = {
  code: string;
  message: string;
  details?: any;
};

export type ChatStreamEvent =
  | { type: "meta"; data: ChatStreamMeta }
  | { type: "delta"; data: ChatStreamDelta }
  | { type: "attachments"; data: ChatStreamAttachments }
  | { type: "done"; data: ChatStreamDone }
  | { type: "error"; data: ChatStreamError }
  | { type: ChatStreamEventType; data: any };

/**
 * Chat request bodies (REST or SSE).
 */
export type ChatAskRequest = {
  conversationId?: string | null;
  message: string;

  // optional: user intent hints
  language?: LanguageCode | "en" | "pt" | "es";
  attachedDocumentId?: string | null;

  // regenerate controls
  regenerateMessageId?: string | null;
  regenCount?: number;

  // UI preferences
  researchMode?: boolean;

  // Optional: frontend can pass any metadata (will be ignored if not used)
  clientMeta?: Record<string, any>;
};

export type ChatAskResponse = ApiResponse<{
  conversationId: string;
  message: ChatMessage;
}>;

/**
 * Document browse endpoints (Documents screen + "See all").
 */
export type DocumentListQuery = {
  q?: string;
  extensions?: string[];
  domain?: string;
  folderPath?: string;
  cursor?: string;
  pageSize?: number;
};

export type DocumentListResponse = ApiResponse<{
  items: FileItem[];
  pagination: Pagination;
}>;

/**
 * Conversation history endpoints.
 */
export type ConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
  lastMessageSnippet?: string;
};

export type ConversationListResponse = ApiResponse<{
  items: ConversationSummary[];
  pagination: Pagination;
}>;
