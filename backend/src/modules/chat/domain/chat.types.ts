/**
 * CHAT TYPES
 *
 * Shared types are canonically defined in chat.contracts.ts and re-exported here.
 * This file defines only turn-level types unique to the chat execution layer.
 */

import type {
  StreamSink,
  LLMStreamingConfig,
} from "../../../services/llm/types/llmStreaming.types";

// ---------------------------------------------------------------------------
// Re-export canonical types from chat.contracts.ts (SSOT)
// ---------------------------------------------------------------------------
export type {
  ChatRole,
  ChatRequest,
  AnswerMode,
  AnswerClass,
  NavType,
  ChatResultStatus,
  ChatCompletionState,
  ChatTruncationState,
  ChatEvidenceState,
  ChatWarningState,
  ChatSourceDTO,
  ChatProvenanceSnippetRefDTO,
  ChatProvenanceDTO,
  ChatQualityGateFailure,
  ChatQualityGateState,
  ChatResult,
} from "./chat.contracts";

// Import types used by the unique types below
import type { ChatRequest, ChatResult } from "./chat.contracts";

// ---------------------------------------------------------------------------
// Turn-level types (unique to this file)
// ---------------------------------------------------------------------------

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
