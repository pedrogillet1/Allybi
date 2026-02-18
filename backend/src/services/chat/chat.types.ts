import type { StreamSink, LLMStreamingConfig } from "../llm/types/llmStreaming.types";

export type ChatRole = "user" | "assistant" | "system";

export interface ChatRequest {
  userId: string;
  conversationId?: string;
  message: string;
  attachedDocumentIds?: string[];
  preferredLanguage?: "en" | "pt" | "es";
  confirmationToken?: string;
  context?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  isRegenerate?: boolean;
  connectorContext?: {
    activeProvider?: "gmail" | "outlook" | "slack" | null;
    gmail?: { connected: boolean; canSend?: boolean };
    outlook?: { connected: boolean; canSend?: boolean };
    slack?: { connected: boolean; canSend?: boolean };
  };
}

export type AnswerMode =
  | "doc_grounded_single"
  | "doc_grounded_multi"
  | "doc_grounded_quote"
  | "nav_pills"
  | "fallback"
  | "general_answer"
  | "help_steps"
  | "action_confirmation"
  | "action_receipt";

export type AnswerClass = "DOCUMENT" | "NAVIGATION" | "GENERAL";
export type NavType = "open" | "discover" | "where" | null;

export interface ChatResult {
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  assistantText: string;
  attachmentsPayload?: unknown;
  assistantTelemetry?: Record<string, unknown>;
  sources?: Array<{ documentId: string; filename: string; mimeType: string | null; page: number | null }>;
  listing?: Array<{ kind: "file" | "folder"; id: string; title: string; mimeType?: string; itemCount?: number; depth?: number }>;
  breadcrumb?: Array<{ id: string; name: string }>;
  answerMode?: AnswerMode;
  answerClass?: AnswerClass;
  navType?: NavType;
  generatedTitle?: string;
}

export type EditorSelectionRange = {
  paragraphId?: string;
  a1?: string;
  sheetName?: string;
  start?: number;
  end?: number;
  text?: string;
};

export type TurnContext = {
  userId: string;
  orgId?: string;
  conversationId?: string;
  messageText: string;
  locale: "en" | "pt";
  now: Date;
  activeDocument?: { id: string; mime: string; title?: string };
  attachedDocuments: Array<{ id: string; mime: string; title?: string }>;
  viewer?: {
    mode: "viewer" | "editor";
    documentId: string;
    fileType: "docx" | "xlsx" | "pptx" | "pdf" | "unknown";
    selection?: {
      isFrozen: boolean;
      ranges: EditorSelectionRange[];
    };
  };
  connectors: {
    activeConnector?: "gmail" | "outlook" | "slack" | "calendar" | null;
    connected: Record<string, boolean>;
  };
  capabilities?: unknown;
  request: ChatRequest;
};

export type TurnRouteDecision = "EDITOR" | "CONNECTOR" | "KNOWLEDGE" | "GENERAL" | "CLARIFY";

export type TurnRequest = {
  req: ChatRequest;
  sink?: StreamSink;
  streamingConfig?: LLMStreamingConfig;
};

export type TurnResult = {
  ok: boolean;
  route: TurnRouteDecision;
  result?: ChatResult;
  errorCode?: string;
  message?: string;
};
