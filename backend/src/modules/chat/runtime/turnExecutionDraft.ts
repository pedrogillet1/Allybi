import type {
  AnswerClass,
  AnswerMode,
  ChatMessageDTO,
  ChatProvenanceDTO,
  ChatQualityGateState,
  ChatRequest,
  ChatResult,
  ChatSourceDTO,
  NavType,
} from "../domain/chat.contracts";
import type {
  EvidenceItem,
  EvidencePack,
} from "../../../services/core/retrieval/retrieval.types";
import type { EvidenceCheckResult } from "../../../services/core/retrieval/evidenceGate.service";
import type { RuntimeContext, RuntimeMeta } from "./chatCompose.types";

export type ChatOutputContract =
  | "USER_VISIBLE_TEXT"
  | "NAVIGATION_PAYLOAD"
  | "FILE_ACTIONS"
  | "MACHINE_JSON"
  | "STREAMING_TEXT";

export type TurnExecutionDraft = {
  traceId: string;
  request: ChatRequest;
  conversationId: string;
  userMessage: ChatMessageDTO;
  generatedConversationTitle?: string | null;
  outputContract: ChatOutputContract;
  answerMode: AnswerMode;
  answerClass: AnswerClass;
  navType: NavType;
  retrievalPack: (EvidencePack & { resolvedDocId?: string | null }) | null;
  evidenceGateDecision: EvidenceCheckResult | null;
  sources: ChatSourceDTO[];
  sourceButtonsAttachment?: unknown | null;
  assistantTextRaw: string;
  draftResult: Omit<ChatResult, "assistantMessageId"> & {
    assistantMessageId?: string;
    provenance?: ChatProvenanceDTO;
    qualityGates?: ChatQualityGateState;
  };
  telemetry: Record<string, unknown> | null;
  fallbackReasonCode?: string;
  fallbackReasonCodeTelemetry?: string;
  fallbackPolicyMeta?: Record<string, unknown> | null;
  priorAssistantMessageId?: string | null;
  runtimeContext?: RuntimeContext | null;
  runtimeMeta?: RuntimeMeta | null;
  turnKey: string;
  timing: {
    turnStartedAt: number;
    retrievalMs: number;
    llmMs: number;
    stream: boolean;
  };
};

export type PreparedTurnIdentity = {
  traceId: string;
  turnStartedAt: number;
  conversationId: string;
  lastDocumentId: string | null;
  generatedConversationTitle: string | null;
  userMessage: ChatMessageDTO;
  priorAssistantMessageId: string | null;
};

export function resolveOutputContract(params: {
  answerMode?: string | null;
  listing?: unknown;
  breadcrumb?: unknown;
  attachmentsPayload?: unknown;
  assistantText?: string | null;
}): ChatOutputContract {
  const answerMode = String(params.answerMode || "").trim().toLowerCase();
  if (answerMode === "nav_pills" || answerMode === "nav_pill") {
    return "NAVIGATION_PAYLOAD";
  }
  if (Array.isArray(params.listing) && params.listing.length > 0) {
    return "NAVIGATION_PAYLOAD";
  }
  if (Array.isArray(params.breadcrumb) && params.breadcrumb.length > 0) {
    return "NAVIGATION_PAYLOAD";
  }
  const attachments = params.attachmentsPayload;
  if (Array.isArray(attachments)) {
    const hasFileAction = attachments.some((item) => {
      if (!item || typeof item !== "object") return false;
      return String((item as Record<string, unknown>).type || "").trim() === "file_action";
    });
    if (hasFileAction) return "FILE_ACTIONS";
  }
  if (!String(params.assistantText || "").trim()) {
    return "STREAMING_TEXT";
  }
  return "USER_VISIBLE_TEXT";
}

export function buildTurnKey(
  conversationId: string,
  userMessageId: string,
): string {
  return `${String(conversationId || "").trim()}:${String(userMessageId || "").trim()}`;
}

export function buildTurnExecutionDraft(params: {
  traceId: string;
  req: ChatRequest;
  conversationId: string;
  userMessage: ChatMessageDTO;
  generatedConversationTitle?: string | null;
  outputContract: TurnExecutionDraft["outputContract"];
  answerMode: TurnExecutionDraft["answerMode"];
  answerClass: TurnExecutionDraft["answerClass"];
  navType: TurnExecutionDraft["navType"];
  retrievalPack: TurnExecutionDraft["retrievalPack"];
  evidenceGateDecision: TurnExecutionDraft["evidenceGateDecision"];
  sources: TurnExecutionDraft["sources"];
  sourceButtonsAttachment?: unknown | null;
  assistantTextRaw: string;
  draftResult: TurnExecutionDraft["draftResult"];
  telemetry: TurnExecutionDraft["telemetry"];
  fallbackReasonCode?: string;
  fallbackReasonCodeTelemetry?: string;
  fallbackPolicyMeta?: Record<string, unknown> | null;
  priorAssistantMessageId?: string | null;
  runtimeContext?: RuntimeContext | null;
  runtimeMeta?: RuntimeMeta | null;
  timing: TurnExecutionDraft["timing"];
}): TurnExecutionDraft {
  return {
    traceId: params.traceId,
    request: params.req,
    conversationId: params.conversationId,
    userMessage: params.userMessage,
    generatedConversationTitle: params.generatedConversationTitle || null,
    outputContract: params.outputContract,
    answerMode: params.answerMode,
    answerClass: params.answerClass,
    navType: params.navType,
    retrievalPack: params.retrievalPack,
    evidenceGateDecision: params.evidenceGateDecision,
    sources: params.sources,
    sourceButtonsAttachment: params.sourceButtonsAttachment,
    assistantTextRaw: params.assistantTextRaw,
    draftResult: params.draftResult,
    telemetry: params.telemetry,
    fallbackReasonCode: params.fallbackReasonCode,
    fallbackReasonCodeTelemetry: params.fallbackReasonCodeTelemetry,
    fallbackPolicyMeta: params.fallbackPolicyMeta || null,
    priorAssistantMessageId: params.priorAssistantMessageId || null,
    runtimeContext: params.runtimeContext || null,
    runtimeMeta: params.runtimeMeta || null,
    turnKey: buildTurnKey(params.conversationId, params.userMessage.id),
    timing: params.timing,
  };
}

export function buildEvidenceItemsForQualityGate(
  pack: (Pick<EvidencePack, "evidence"> & { resolvedDocId?: string | null }) | null,
): Array<Pick<EvidenceItem, "docId" | "snippet">> {
  if (!pack || !Array.isArray(pack.evidence)) return [];
  return pack.evidence.map((item) => ({
    docId: item.docId,
    snippet: item.snippet,
  }));
}
