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
  EvidenceCheckResult,
  EvidenceItem,
  EvidencePack,
} from "../../retrieval/application";

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
  turnKey: string;
  timing: {
    turnStartedAt: number;
    retrievalMs: number;
    llmMs: number;
    stream: boolean;
  };
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

export function buildEvidenceItemsForQualityGate(
  pack: (Pick<EvidencePack, "evidence"> & { resolvedDocId?: string | null }) | null,
): Array<Pick<EvidenceItem, "docId" | "snippet">> {
  if (!pack || !Array.isArray(pack.evidence)) return [];
  return pack.evidence.map((item) => ({
    docId: item.docId,
    snippet: item.snippet,
  }));
}
