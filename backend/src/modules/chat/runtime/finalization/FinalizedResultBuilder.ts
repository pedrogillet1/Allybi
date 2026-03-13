import type { ChatResult, ChatSourceDTO } from "../../domain/chat.contracts";
import type { TurnExecutionDraft } from "../turnExecutionDraft";

export function buildBaseResult(params: {
  draft: TurnExecutionDraft;
  baseSources: ChatSourceDTO[];
  attachmentsPayload: unknown;
  docContextUsed: boolean;
}): ChatResult {
  const { draft, baseSources, attachmentsPayload, docContextUsed } = params;
  return {
    ...draft.draftResult,
    conversationId: draft.conversationId,
    userMessageId: draft.userMessage.id,
    assistantMessageId: draft.draftResult.assistantMessageId || "",
    turnKey: draft.turnKey,
    sources: baseSources,
    attachmentsPayload,
    evidence: {
      required: docContextUsed,
      provided: baseSources.length > 0,
      sourceIds: baseSources.map((source) => source.documentId),
    },
    assistantTelemetry: draft.telemetry || draft.draftResult.assistantTelemetry,
    provenance: draft.draftResult.provenance,
  };
}

export function buildReturnResult(params: {
  finalized: ChatResult;
  draft: TurnExecutionDraft;
  enforcedAttachments: unknown;
  enforcedContent: string;
  retainSources: boolean;
  sortSources: (sources: ChatSourceDTO[]) => ChatSourceDTO[];
}): ChatResult {
  const { finalized, draft, enforcedAttachments, enforcedContent, retainSources } =
    params;
  return {
    ...finalized,
    assistantMessageId: finalized.assistantMessageId || "",
    turnKey: draft.turnKey,
    sources: retainSources ? params.sortSources(finalized.sources || []) : [],
    completion: {
      answered: params.finalized.completion?.answered ?? false,
      missingSlots: Array.isArray(finalized.completion?.missingSlots)
        ? finalized.completion!.missingSlots
        : [],
      nextAction: null,
      nextActionCode: finalized.completion?.nextActionCode ?? null,
      nextActionArgs: finalized.completion?.nextActionArgs ?? null,
    },
    evidence: {
      required: finalized.evidence?.required || false,
      provided: retainSources && (finalized.sources || []).length > 0,
      sourceIds: retainSources
        ? (finalized.sources || []).map((source) => source.documentId)
        : [],
    },
    attachmentsPayload: enforcedAttachments,
    assistantText: enforcedContent,
  };
}
