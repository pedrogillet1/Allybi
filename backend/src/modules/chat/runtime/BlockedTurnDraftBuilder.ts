import type { ChatRequest } from "../domain/chat.contracts";
import type { RuntimePolicyGate } from "./RuntimePolicyGate";
import {
  buildTurnExecutionDraft,
  type PreparedTurnIdentity,
  type TurnExecutionDraft,
} from "./turnExecutionDraft";

export function buildBlockedTurnDraft(params: {
  req: ChatRequest;
  prepared: PreparedTurnIdentity;
  decision: Extract<ReturnType<RuntimePolicyGate["evaluate"]>, { blocked: true }>;
  stream: boolean;
}): TurnExecutionDraft {
  const { req, prepared, decision, stream } = params;
  const answerMode =
    (req.attachedDocumentIds || []).length > 0 ? "help_steps" : "general_answer";
  const answerClass = answerMode === "general_answer" ? "GENERAL" : "DOCUMENT";

  return buildTurnExecutionDraft({
    traceId: prepared.traceId,
    req,
    conversationId: prepared.conversationId,
    userMessage: prepared.userMessage,
    generatedConversationTitle: prepared.generatedConversationTitle,
    outputContract: "USER_VISIBLE_TEXT",
    answerMode,
    answerClass,
    navType: null,
    retrievalPack: null,
    evidenceGateDecision: null,
    sources: [],
    sourceButtonsAttachment: null,
    assistantTextRaw: "",
    draftResult: {
      conversationId: prepared.conversationId,
      userMessageId: prepared.userMessage.id,
      assistantText: "",
      attachmentsPayload: [],
      sources: [],
      followups: [],
      answerMode,
      answerClass,
      navType: null,
      status: decision.status,
      failureCode: decision.code,
      completion: {
        answered: false,
        missingSlots: [],
        nextAction: null,
        nextActionCode: decision.code,
        nextActionArgs: null,
      },
      truncation: {
        occurred: false,
        reason: null,
        resumeToken: null,
        providerOccurred: false,
        providerReason: null,
        detectorVersion: null,
      },
      evidence: {
        required: Boolean(req.attachedDocumentIds?.length),
        provided: false,
        sourceIds: [],
      },
    },
    telemetry: null,
    fallbackReasonCode: decision.code,
    priorAssistantMessageId: prepared.priorAssistantMessageId,
    timing: {
      turnStartedAt: prepared.turnStartedAt,
      retrievalMs: 0,
      llmMs: 0,
      stream,
    },
  });
}
