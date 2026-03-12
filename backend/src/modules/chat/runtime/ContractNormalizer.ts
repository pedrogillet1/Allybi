import type {
  ChatCompletionState,
  ChatEvidenceState,
  ChatQualityGateState,
  ChatResult,
  ChatResultStatus,
  ChatSourceDTO,
  ChatTruncationState,
} from "../domain/chat.contracts";

function isEvidenceRequired(result: ChatResult): boolean {
  const mode = String(result.answerMode || "");
  const answerClass = String(result.answerClass || "");
  if (mode.startsWith("doc_grounded")) return true;
  if (answerClass === "DOCUMENT") return true;
  return false;
}

function hasAttachmentPayload(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }
  return false;
}

function hasMeaningfulOutput(result: ChatResult): boolean {
  if (String(result.assistantText || "").trim().length > 0) return true;
  if (hasAttachmentPayload(result.attachmentsPayload)) return true;
  if (Array.isArray(result.listing) && result.listing.length > 0) return true;
  if (Array.isArray(result.breadcrumb) && result.breadcrumb.length > 0) {
    return true;
  }
  if (Array.isArray(result.followups) && result.followups.length > 0) return true;
  return false;
}

function normalizeSourceId(source: ChatSourceDTO): string {
  const locationKey = String(source.locationKey || "").trim();
  if (locationKey) return `${source.documentId}:${locationKey}`;
  const page = Number.isFinite(Number(source.page)) ? Number(source.page) : "";
  const slide = Number.isFinite(Number(source.slide)) ? Number(source.slide) : "";
  const sheet = String(source.sheet || "").trim();
  const section = String(source.section || "").trim();
  return [
    String(source.documentId || "").trim(),
    String(page),
    String(slide),
    sheet,
    section,
  ].join(":");
}

function dedupeSources(sources: ChatSourceDTO[]): ChatSourceDTO[] {
  const deduped = new Map<string, ChatSourceDTO>();
  for (const source of sources) {
    const documentId = String(source?.documentId || "").trim();
    if (!documentId) continue;
    const normalized: ChatSourceDTO = {
      ...source,
      documentId,
      docId: String(source.docId || documentId).trim() || documentId,
      filename: String(source.filename || "").trim(),
      mimeType: source.mimeType ?? null,
      page:
        Number.isFinite(Number(source.page)) && Number(source.page) > 0
          ? Number(source.page)
          : null,
      slide:
        Number.isFinite(Number(source.slide)) && Number(source.slide) > 0
          ? Number(source.slide)
          : null,
      sheet: String(source.sheet || "").trim() || null,
      cell: String(source.cell || "").trim() || null,
      section: String(source.section || "").trim() || null,
      locationKey: String(source.locationKey || "").trim() || null,
      locationLabel: String(source.locationLabel || "").trim() || null,
      snippet: String(source.snippet || "").trim() || null,
    };
    const key = normalizeSourceId(normalized);
    if (!deduped.has(key)) {
      deduped.set(key, normalized);
    }
  }
  return Array.from(deduped.values());
}

function inferStatus(result: ChatResult, answered: boolean): ChatResultStatus {
  if (result.status) return result.status;
  if (String(result.failureCode || "").trim()) return "failed";
  if (result.indexingInProgress || result.answerProvisional) return "partial";
  if (String(result.fallbackReasonCode || "").trim()) return "partial";
  if (!answered) return "failed";
  return "success";
}

export class ContractNormalizer {
  normalize(input: ChatResult): ChatResult {
    const sources = dedupeSources(Array.isArray(input.sources) ? input.sources : []);
    const provenance = input.provenance;
    const evidenceRequired = isEvidenceRequired(input);
    const answered = hasMeaningfulOutput(input);

    const completion: ChatCompletionState = {
      answered,
      missingSlots: Array.isArray(input.completion?.missingSlots)
        ? input.completion!.missingSlots
            .map((slot) => String(slot || "").trim())
            .filter(Boolean)
        : [],
      nextAction: input.completion?.nextAction ?? null,
      nextActionCode: input.completion?.nextActionCode ?? null,
      nextActionArgs: input.completion?.nextActionArgs ?? null,
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

    const evidence: ChatEvidenceState = {
      required:
        typeof input.evidence?.required === "boolean"
          ? input.evidence.required
          : evidenceRequired,
      provided:
        typeof input.evidence?.provided === "boolean"
          ? input.evidence.provided
          : sources.length > 0,
      sourceIds: Array.from(
        new Set(
          (
            Array.isArray(input.evidence?.sourceIds)
              ? input.evidence!.sourceIds
              : sources.map((source) => source.documentId)
          )
            .map((sourceId) => String(sourceId || "").trim())
            .filter(Boolean),
        ),
      ),
    };
    const qualityGates: ChatQualityGateState = input.qualityGates || {
      allPassed: true,
      failed: [],
    };

    let status = inferStatus(input, completion.answered);
    let failureCode = String(input.failureCode || "").trim() || null;

    if (!completion.answered && status === "success") {
      status = "failed";
      failureCode = failureCode || "EMPTY_OUTPUT";
    }

    if (status === "success" && evidence.required && !evidence.provided) {
      status = "partial";
      failureCode = failureCode || "MISSING_SOURCES";
    }

    if (normalizedTruncation.occurred && status === "success") {
      status = "partial";
      failureCode = failureCode || "TRUNCATED_OUTPUT";
    }

    const hasBlockingQualityGate =
      Array.isArray(qualityGates.failed) &&
      qualityGates.failed.some((gate) => gate.severity === "block");
    if (status === "success" && hasBlockingQualityGate) {
      status = "partial";
      failureCode = failureCode || "QUALITY_GATE_BLOCKED";
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
      qualityGates,
    };
  }
}

export function hasMeaningfulChatResultOutput(result: ChatResult): boolean {
  return hasMeaningfulOutput(result);
}
