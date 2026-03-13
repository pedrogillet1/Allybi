import type {
  AnswerClass,
  AnswerMode,
  ChatRequest,
  NavType,
} from "../domain/chat.contracts";
import type { RuntimeContext, RuntimeMeta } from "./chatCompose.types";
import { resolveLegacyRuntimePolicyErrorCode } from "./legacyRuntimeErrorFallback";
import {
  buildTurnExecutionDraft,
  resolveOutputContract,
  type PreparedTurnIdentity,
  type TurnExecutionDraft,
} from "./turnExecutionDraft";
import { SEMANTIC_TRUNCATION_DETECTOR_VERSION } from "./truncationClassifier";

type BaseDraftParams = {
  traceId: string;
  req: ChatRequest;
  prepared: PreparedTurnIdentity;
  retrievalPack: TurnExecutionDraft["retrievalPack"];
  evidenceGateDecision: TurnExecutionDraft["evidenceGateDecision"];
  answerMode: AnswerMode;
  answerClass: AnswerClass;
  navType: NavType;
  retrievalMs: number;
  llmMs: number;
  stream: boolean;
};

export function buildBypassTurnDraft(
  params: BaseDraftParams & {
    bypass: { failureCode: string };
    sources: TurnExecutionDraft["sources"];
    sourceButtonsAttachment: unknown | null;
  },
): TurnExecutionDraft {
  const { prepared, req, traceId } = params;
  return buildTurnExecutionDraft({
    traceId,
    req,
    conversationId: prepared.conversationId,
    userMessage: prepared.userMessage,
    generatedConversationTitle: prepared.generatedConversationTitle,
    outputContract: "USER_VISIBLE_TEXT",
    answerMode: params.answerMode,
    answerClass: params.answerClass,
    navType: params.navType,
    retrievalPack: params.retrievalPack,
    evidenceGateDecision: params.evidenceGateDecision,
    sources: params.sources,
    sourceButtonsAttachment: params.sourceButtonsAttachment,
    assistantTextRaw: "",
    draftResult: {
      conversationId: prepared.conversationId,
      userMessageId: prepared.userMessage.id,
      assistantText: "",
      attachmentsPayload: params.sourceButtonsAttachment
        ? [params.sourceButtonsAttachment]
        : [],
      sources: params.sources,
      followups: [],
      answerMode: params.answerMode,
      answerClass: params.answerClass,
      navType: params.navType,
      status:
        params.bypass.failureCode === "EVIDENCE_NEEDS_CLARIFICATION"
          ? "clarification_required"
          : "partial",
      failureCode: params.bypass.failureCode,
      completion: {
        answered: false,
        missingSlots: [],
        nextAction: null,
        nextActionCode: "NEEDS_DOC_LOCK",
        nextActionArgs: { failureCode: params.bypass.failureCode },
      },
      truncation: {
        occurred: false,
        reason: null,
        resumeToken: null,
        providerOccurred: false,
        providerReason: null,
        detectorVersion: SEMANTIC_TRUNCATION_DETECTOR_VERSION,
      },
      evidence: {
        required: Boolean(req.attachedDocumentIds?.length),
        provided: params.sources.length > 0,
        sourceIds: params.sources.map((source) => source.documentId),
      },
    },
    telemetry: null,
    fallbackReasonCode: params.bypass.failureCode,
    priorAssistantMessageId: prepared.priorAssistantMessageId,
    timing: {
      turnStartedAt: prepared.turnStartedAt,
      retrievalMs: params.retrievalMs,
      llmMs: params.llmMs,
      stream: params.stream,
    },
  });
}

export function buildSuccessTurnDraft(
  params: BaseDraftParams & {
    sources: TurnExecutionDraft["sources"];
    sourceButtonsAttachment: unknown | null;
    generated: {
      assistantTextRaw: string;
      attachmentsPayload: unknown[];
      telemetry: Record<string, unknown> | null;
      followups: unknown[];
      assistantText: string;
    };
    runtimeContext?: RuntimeContext | null;
    runtimeMeta?: RuntimeMeta | null;
    fallbackSignal: {
      reasonCode?: string;
      telemetryReasonCode?: string;
      policyMeta?: Record<string, unknown> | null;
    };
  },
): TurnExecutionDraft {
  const { prepared, req, traceId } = params;
  return buildTurnExecutionDraft({
    traceId,
    req,
    conversationId: prepared.conversationId,
    userMessage: prepared.userMessage,
    generatedConversationTitle: prepared.generatedConversationTitle,
    outputContract: resolveOutputContract({
      answerMode: params.answerMode,
      attachmentsPayload: params.generated.attachmentsPayload,
      assistantText: params.generated.assistantTextRaw,
    }),
    answerMode: params.answerMode,
    answerClass: params.answerClass,
    navType: params.navType,
    retrievalPack: params.retrievalPack,
    evidenceGateDecision: params.evidenceGateDecision,
    sources: params.sources,
    sourceButtonsAttachment: params.sourceButtonsAttachment,
    assistantTextRaw: params.generated.assistantTextRaw,
    draftResult: {
      conversationId: prepared.conversationId,
      userMessageId: prepared.userMessage.id,
      assistantText: params.generated.assistantText,
      attachmentsPayload: params.generated.attachmentsPayload,
      assistantTelemetry: params.generated.telemetry || undefined,
      sources: params.sources,
      followups: Array.isArray(params.generated.followups)
        ? params.generated.followups.filter(
            (
              followup,
            ): followup is { label: string; query: string } =>
              Boolean(followup) &&
              typeof followup === "object" &&
              typeof (followup as { label?: unknown }).label === "string" &&
              typeof (followup as { query?: unknown }).query === "string",
          )
        : [],
      answerMode: params.answerMode,
      answerClass: params.answerClass,
      navType: params.navType,
      completion: {
        answered: Boolean(params.generated.assistantTextRaw),
        missingSlots: [],
        nextAction: null,
      },
      truncation: {
        occurred: false,
        reason: null,
        resumeToken: null,
        providerOccurred: false,
        providerReason: null,
        detectorVersion: SEMANTIC_TRUNCATION_DETECTOR_VERSION,
      },
      evidence: {
        required: Boolean(req.attachedDocumentIds?.length),
        provided: params.sources.length > 0,
        sourceIds: params.sources.map((source) => source.documentId),
      },
    },
    telemetry: params.generated.telemetry,
    fallbackReasonCode: params.fallbackSignal.reasonCode,
    fallbackReasonCodeTelemetry: params.fallbackSignal.telemetryReasonCode,
    fallbackPolicyMeta: params.fallbackSignal.policyMeta || undefined,
    priorAssistantMessageId: prepared.priorAssistantMessageId,
    runtimeContext: params.runtimeContext || null,
    runtimeMeta: params.runtimeMeta || null,
    timing: {
      turnStartedAt: prepared.turnStartedAt,
      retrievalMs: params.retrievalMs,
      llmMs: params.llmMs,
      stream: params.stream,
    },
  });
}

export function buildRuntimePolicyFailureDraft(
  params: BaseDraftParams & {
    error: unknown;
  },
): TurnExecutionDraft {
  const { prepared, req, traceId } = params;
  const failureCode = resolveLegacyRuntimePolicyErrorCode(params.error);
  return buildTurnExecutionDraft({
    traceId,
    req,
    conversationId: prepared.conversationId,
    userMessage: prepared.userMessage,
    generatedConversationTitle: prepared.generatedConversationTitle,
    outputContract: "USER_VISIBLE_TEXT",
    answerMode: params.answerMode,
    answerClass:
      params.answerMode === "general_answer" ? "GENERAL" : "DOCUMENT",
    navType: null,
    retrievalPack: params.retrievalPack,
    evidenceGateDecision: params.evidenceGateDecision,
    sources: [],
    assistantTextRaw: "",
    draftResult: {
      conversationId: prepared.conversationId,
      userMessageId: prepared.userMessage.id,
      assistantText: "",
      attachmentsPayload: [],
      sources: [],
      followups: [],
      answerMode: params.answerMode,
      answerClass:
        params.answerMode === "general_answer" ? "GENERAL" : "DOCUMENT",
      navType: null,
      status: "failed",
      failureCode,
      completion: {
        answered: false,
        missingSlots: ["runtime_policy"],
        nextAction: null,
        nextActionCode: failureCode,
        nextActionArgs: null,
      },
      truncation: {
        occurred: false,
        reason: null,
        resumeToken: null,
        providerOccurred: false,
        providerReason: null,
        detectorVersion: SEMANTIC_TRUNCATION_DETECTOR_VERSION,
      },
      evidence: {
        required: Boolean(req.attachedDocumentIds?.length),
        provided: false,
        sourceIds: [],
      },
    },
    telemetry: null,
    fallbackReasonCode: failureCode,
    priorAssistantMessageId: prepared.priorAssistantMessageId,
    timing: {
      turnStartedAt: prepared.turnStartedAt,
      retrievalMs: params.retrievalMs,
      llmMs: params.llmMs,
      stream: params.stream,
    },
  });
}
