import type { ChatResult } from "../domain/chat.contracts";
import { ContractNormalizer } from "../runtime/ContractNormalizer";

const normalizer = new ContractNormalizer();

function defaultCompletion(result: ChatResult) {
  return {
    answered: Boolean(String(result.assistantText || "").trim()),
    missingSlots: [],
    nextAction: null,
  };
}

function defaultTruncation() {
  return {
    occurred: false,
    reason: null,
    resumeToken: null,
    providerOccurred: false,
    providerReason: null,
    detectorVersion: null,
  };
}

function defaultEvidence(result: ChatResult) {
  const sources = Array.isArray(result.sources) ? result.sources : [];
  return {
    required: false,
    provided: sources.length > 0,
    sourceIds: sources
      .map((s) => String(s?.documentId || "").trim())
      .filter(Boolean),
  };
}

function defaultQualityGates() {
  return {
    allPassed: true,
    failed: [],
  };
}

export function normalizeChatResult(result: ChatResult): ChatResult {
  return normalizer.normalize(result);
}

export function toChatFinalEvent(result: ChatResult): Record<string, unknown> {
  const normalized = normalizeChatResult(result);
  return {
    type: "final",
    conversationId: normalized.conversationId,
    messageId: normalized.assistantMessageId,
    traceId: normalized.traceId || null,
    content: normalized.assistantText,
    answerMode: normalized.answerMode || "general_answer",
    answerClass: normalized.answerClass || null,
    navType: normalized.navType || null,
    sources: normalized.sources || [],
    provenance: (normalized as any).provenance || null,
    attachments: normalized.attachmentsPayload || [],
    answerProvisional: Boolean((normalized as any).answerProvisional),
    answerSourceMode: (normalized as any).answerSourceMode || "chunk",
    indexingInProgress: Boolean((normalized as any).indexingInProgress),
    scopeRelaxed: Boolean((normalized as any).scopeRelaxed),
    status: (normalized as any).status || "success",
    failureCode: (normalized as any).failureCode || null,
    completion: (normalized as any).completion || defaultCompletion(normalized),
    truncation: (normalized as any).truncation || defaultTruncation(),
    evidence: (normalized as any).evidence || defaultEvidence(normalized),
    qualityGates: (normalized as any).qualityGates || defaultQualityGates(),
    ...(String((normalized as any).scopeRelaxReason || "").trim()
      ? { scopeRelaxReason: (normalized as any).scopeRelaxReason }
      : {}),
    ...(String((normalized as any).fallbackReasonCode || "").trim()
      ? { fallbackReasonCode: (normalized as any).fallbackReasonCode }
      : {}),
    ...(normalized.listing?.length ? { listing: normalized.listing } : {}),
    ...(normalized.breadcrumb?.length
      ? { breadcrumb: normalized.breadcrumb }
      : {}),
    ...(normalized.followups?.length
      ? { followups: normalized.followups }
      : {}),
    ...(normalized.generatedTitle
      ? { generatedTitle: normalized.generatedTitle }
      : {}),
  };
}

export function toChatHttpEnvelope(result: ChatResult): {
  ok: true;
  data: ChatResult;
} {
  return {
    ok: true,
    data: normalizeChatResult(result),
  };
}
