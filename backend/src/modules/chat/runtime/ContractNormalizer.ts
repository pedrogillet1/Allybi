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
      (!provenance ||
        provenance.validated !== true ||
        provenance.snippetRefs.length === 0)
    ) {
      status = "partial";
      failureCode = failureCode || "missing_provenance";
    }

    if (truncation.occurred && status === "success") {
      status = "partial";
      failureCode = failureCode || "TRUNCATED_RESPONSE";
    }

    return {
      ...input,
      sources,
      provenance,
      status,
      failureCode,
      completion,
      truncation,
      evidence,
    };
  }
}
