import type {
  StreamSink,
  LLMStreamingConfig,
} from "../../../services/llm/types/llmStreaming.types";

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
  truncationRetry?: boolean;
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
  | "doc_grounded_table"
  | "nav_pills"
  | "fallback"
  | "general_answer"
  | "help_steps"
  | "action_confirmation"
  | "action_receipt";

export type AnswerClass = "DOCUMENT" | "NAVIGATION" | "GENERAL";
export type NavType = "open" | "discover" | "where" | null;
export type ChatResultStatus =
  | "success"
  | "partial"
  | "clarification_required"
  | "blocked"
  | "failed";

export interface ChatCompletionState {
  answered: boolean;
  missingSlots: string[];
  nextAction?: string | null;
}

export interface ChatTruncationState {
  occurred: boolean;
  reason?: string | null;
  resumeToken?: string | null;
  providerOccurred?: boolean;
  providerReason?: string | null;
  detectorVersion?: string | null;
}

export interface ChatEvidenceState {
  required: boolean;
  provided: boolean;
  sourceIds: string[];
}

export interface ChatProvenanceSnippetRefDTO {
  evidenceId: string;
  documentId: string;
  locationKey: string;
  snippetHash: string;
  coverageScore: number;
}

export interface ChatProvenanceDTO {
  mode: "hidden_map";
  required: boolean;
  validated: boolean;
  failureCode?: string | null;
  evidenceIdsUsed: string[];
  sourceDocumentIds: string[];
  snippetRefs: ChatProvenanceSnippetRefDTO[];
  coverageScore: number;
}

export interface ChatResult {
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  traceId?: string;
  assistantText: string;
  attachmentsPayload?: unknown;
  assistantTelemetry?: Record<string, unknown>;
  provenance?: ChatProvenanceDTO;
  sources?: Array<{
    documentId: string;
    filename: string;
    mimeType: string | null;
    page: number | null;
  }>;
  listing?: Array<{
    kind: "file" | "folder";
    id: string;
    title: string;
    mimeType?: string;
    itemCount?: number;
    depth?: number;
  }>;
  breadcrumb?: Array<{ id: string; name: string }>;
  followups?: Array<{ label: string; query: string }>;
  answerMode?: AnswerMode;
  answerClass?: AnswerClass;
  navType?: NavType;
  generatedTitle?: string;
  status?: ChatResultStatus;
  failureCode?: string | null;
  completion?: ChatCompletionState;
  truncation?: ChatTruncationState;
  evidence?: ChatEvidenceState;
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
  locale: "en" | "pt" | "es";
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

export type TurnRouteDecision =
  | "CONNECTOR"
  | "KNOWLEDGE"
  | "GENERAL"
  | "CLARIFY";

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
