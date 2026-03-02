import type {
  StreamSink,
  LLMStreamingConfig,
} from "../../../services/llm/types/llmStreaming.types";
import type { ChatAnswerMode } from "./answerModes";

export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessageDTO {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  updatedAt: string;
  attachments?: unknown | null;
  telemetry?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

export interface ConversationDTO {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationWithMessagesDTO extends ConversationDTO {
  messages: ChatMessageDTO[];
}

export interface ConversationListOptions {
  limit?: number;
  cursor?: string;
}

export interface ConversationMessagesOptions {
  limit?: number;
  order?: "asc" | "desc";
}

export interface CreateMessageParams {
  conversationId: string;
  role: ChatRole;
  content: string;
  userId: string;
  attachments?: unknown | null;
  telemetry?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

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

export type AnswerMode = ChatAnswerMode;

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

export interface ChatWarningState {
  code: string;
  message: string;
  severity: "warning" | "error";
  source?: "runtime" | "quality_gate" | "enforcer" | "provenance";
}

export interface ChatSourceDTO {
  documentId: string;
  docId?: string;
  filename: string;
  mimeType: string | null;
  page: number | null;
  slide?: number | null;
  sheet?: string | null;
  cell?: string | null;
  section?: string | null;
  locationKey?: string | null;
  locationLabel?: string | null;
  snippet?: string | null;
}

export interface ChatProvenanceSnippetRefDTO {
  evidenceId: string;
  documentId: string;
  locationKey: string;
  snippetHash: string;
  coverageScore: number;
  anchorCoverage?: number;
  semanticCoverage?: number;
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
  anchorCoverage?: number;
  semanticCoverage?: number;
  minimumCoverage?: number;
}

export interface ChatQualityGateFailure {
  gateName: string;
  severity: "warn" | "block";
  reason?: string | null;
}

export interface ChatQualityGateState {
  allPassed: boolean;
  failed: ChatQualityGateFailure[];
}

export interface ChatResult {
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  traceId?: string;
  assistantText: string;

  attachmentsPayload?: unknown;
  assistantTelemetry?: Record<string, unknown>;

  sources?: ChatSourceDTO[];
  provenance?: ChatProvenanceDTO;
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

  answerProvisional?: boolean;
  answerSourceMode?: "chunk" | "fallback_raw_text" | "global_relaxed";
  indexingInProgress?: boolean;
  scopeRelaxed?: boolean;
  scopeRelaxReason?: string;
  scopeEnforced?: boolean;
  fallbackReasonCode?: string;

  // v2 strict envelope (compatible: optional for old producers)
  status?: ChatResultStatus;
  failureCode?: string | null;
  completion?: ChatCompletionState;
  truncation?: ChatTruncationState;
  evidence?: ChatEvidenceState;
  qualityGates?: ChatQualityGateState;
  userWarning?: ChatWarningState | null;
  warnings?: ChatWarningState[];
}

export interface ChatEngine {
  generate(params: {
    traceId: string;
    userId: string;
    conversationId: string;
    messages: Array<{
      role: ChatRole;
      content: string;
      attachments?: unknown | null;
    }>;
    evidencePack?: {
      query?: { original?: string; normalized?: string };
      scope?: { activeDocId?: string | null; explicitDocLock?: boolean };
      stats?: {
        evidenceItems?: number;
        uniqueDocsInEvidence?: number;
        topScore?: number | null;
        scoreGap?: number | null;
      };
      evidence: Array<{
        docId: string;
        title?: string | null;
        filename?: string | null;
        location?: {
          page?: number | null;
          sheet?: string | null;
          slide?: number | null;
          sectionKey?: string | null;
        };
        locationKey?: string;
        snippet?: string;
        score?: { finalScore?: number };
        evidenceType?: "text" | "table" | "image";
      }>;
    } | null;
    context?: Record<string, unknown>;
    meta?: Record<string, unknown>;
  }): Promise<{
    text: string;
    attachmentsPayload?: unknown;
    telemetry?: Record<string, unknown>;
  }>;

  generateRetrievalPlan?(params: {
    traceId: string;
    userId: string;
    conversationId: string;
    messages: Array<{
      role: ChatRole;
      content: string;
      attachments?: unknown | null;
    }>;
    evidencePack?: {
      query?: { original?: string; normalized?: string };
      scope?: { activeDocId?: string | null; explicitDocLock?: boolean };
      stats?: {
        evidenceItems?: number;
        uniqueDocsInEvidence?: number;
        topScore?: number | null;
        scoreGap?: number | null;
      };
      evidence: Array<{
        docId: string;
        title?: string | null;
        filename?: string | null;
        location?: {
          page?: number | null;
          sheet?: string | null;
          slide?: number | null;
          sectionKey?: string | null;
        };
        locationKey?: string;
        snippet?: string;
        score?: { finalScore?: number };
        evidenceType?: "text" | "table" | "image";
      }>;
    } | null;
    context?: Record<string, unknown>;
    meta?: Record<string, unknown>;
  }): Promise<{
    text: string;
    attachmentsPayload?: unknown;
    telemetry?: Record<string, unknown>;
  }>;

  stream(params: {
    traceId: string;
    userId: string;
    conversationId: string;
    messages: Array<{
      role: ChatRole;
      content: string;
      attachments?: unknown | null;
    }>;
    evidencePack?: {
      query?: { original?: string; normalized?: string };
      scope?: { activeDocId?: string | null; explicitDocLock?: boolean };
      stats?: {
        evidenceItems?: number;
        uniqueDocsInEvidence?: number;
        topScore?: number | null;
        scoreGap?: number | null;
      };
      evidence: Array<{
        docId: string;
        title?: string | null;
        filename?: string | null;
        location?: {
          page?: number | null;
          sheet?: string | null;
          slide?: number | null;
          sectionKey?: string | null;
        };
        locationKey?: string;
        snippet?: string;
        score?: { finalScore?: number };
        evidenceType?: "text" | "table" | "image";
      }>;
    } | null;
    context?: Record<string, unknown>;
    meta?: Record<string, unknown>;
    sink: StreamSink;
    streamingConfig: LLMStreamingConfig;
  }): Promise<{
    finalText: string;
    attachmentsPayload?: unknown;
    telemetry?: Record<string, unknown>;
  }>;
}

export class ConversationNotFoundError extends Error {
  readonly code = "CONVERSATION_NOT_FOUND";

  constructor(message = "Conversation not found.") {
    super(message);
    this.name = "ConversationNotFoundError";
  }
}

export interface PrismaChatServicePort {
  chat(req: ChatRequest): Promise<ChatResult>;
  streamChat(params: {
    req: ChatRequest;
    sink: StreamSink;
    streamingConfig: LLMStreamingConfig;
  }): Promise<ChatResult>;
  createConversation(params: {
    userId: string;
    title?: string;
  }): Promise<ConversationDTO>;
  listConversations(
    userId: string,
    opts?: ConversationListOptions,
  ): Promise<ConversationDTO[]>;
  getConversation(
    userId: string,
    conversationId: string,
  ): Promise<ConversationDTO | null>;
  getConversationWithMessages(
    userId: string,
    conversationId: string,
    opts?: ConversationMessagesOptions,
  ): Promise<ConversationWithMessagesDTO | null>;
  updateTitle(
    userId: string,
    conversationId: string,
    title: string,
  ): Promise<ConversationDTO | null>;
  deleteConversation(
    userId: string,
    conversationId: string,
  ): Promise<{ ok: boolean }>;
  deleteAllConversations(
    userId: string,
  ): Promise<{ ok: boolean; deleted: number }>;
  listMessages(
    userId: string,
    conversationId: string,
    opts?: ConversationMessagesOptions,
  ): Promise<ChatMessageDTO[]>;
  createMessage(params: CreateMessageParams): Promise<ChatMessageDTO>;
}
