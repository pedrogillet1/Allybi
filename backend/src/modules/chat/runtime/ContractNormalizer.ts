import type {
  ChatCompletionState,
  ChatEvidenceState,
  ChatResult,
  ChatResultStatus,
  ChatTruncationState,
} from "../domain/chat.contracts";

function isEvidenceRequired(result: ChatResult): boolean {
  const mode = String(result.answerMode || "");
  const answerClass = String(result.answerClass || "");
  if (mode.startsWith("doc_grounded")) return true;
  if (answerClass === "DOCUMENT") return true;
  return false;
}

function inferStatus(result: ChatResult): ChatResultStatus {
  if (result.status) return result.status;
  if (result.failureCode) return "failed";
  if (result.indexingInProgress || result.answerProvisional) return "partial";
  if (String(result.fallbackReasonCode || "").trim()) return "partial";
  if (!String(result.assistantText || "").trim()) return "failed";
  return "success";
}

export class ContractNormalizer {
  normalize(input: ChatResult): ChatResult {
    const sources = Array.isArray(input.sources) ? input.sources : [];
    const provenance = input.provenance;
    const evidenceRequired = isEvidenceRequired(input);

    const completion: ChatCompletionState = input.completion || {
      answered: Boolean(String(input.assistantText || "").trim()),
      missingSlots: [],
      nextAction: null,
    };

    const truncation: ChatTruncationState = input.truncation || {
      occurred: false,
      reason: null,
      resumeToken: null,
    };
    const normalizedTruncation: ChatTruncationState = {
      occurred: Boolean(truncation.occurred),
      reason: truncation.reason ?? null,
      resumeToken: truncation.resumeToken ?? null,
      providerOccurred:
        truncation.providerOccurred === undefined
          ? Boolean(truncation.occurred)
          : Boolean(truncation.providerOccurred),
      providerReason: truncation.providerReason ?? null,
      detectorVersion: truncation.detectorVersion ?? null,
    };

    const evidence: ChatEvidenceState = input.evidence || {
      required: evidenceRequired,
      provided: sources.length > 0,
      sourceIds: sources.map((s) => s.documentId),
    };

    let status = inferStatus(input);
    let failureCode = input.failureCode || null;

    if (status === "success" && !completion.answered) {
      status = "failed";
      failureCode = failureCode || "EMPTY_ANSWER";
    }

    if (status === "success" && evidence.required && !evidence.provided) {
      status = "partial";
      failureCode = failureCode || "MISSING_EVIDENCE";
    }

    if (
      status === "success" &&
      evidence.required &&
      (!provenance || provenance.validated !== true)
    ) {
      status = "partial";
      failureCode = failureCode || "missing_provenance";
    }

    if (normalizedTruncation.occurred && status === "success") {
      status = "partial";
      // Truncation is surfaced via the truncation object; no need to set a
      // failureCode that would render as a warning badge in the UI.
    }

    return {
      ...input,
      sources,
      provenance,
      status,
      failureCode,
      completion,
      truncation: normalizedTruncation,
      evidence,
    };
  }
}
