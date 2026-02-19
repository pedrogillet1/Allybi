import type { ChatResult } from "../domain/chat.contracts";

export class EvidenceValidator {
  enforceScope(result: ChatResult, allowedDocumentIds: string[]): ChatResult {
    const allowed = new Set(
      (allowedDocumentIds || []).map((id) => String(id || "").trim()).filter(Boolean),
    );
    if (allowed.size === 0) return result;

    const currentSources = Array.isArray(result.sources) ? result.sources : [];
    const scopedSources = currentSources.filter((s) => allowed.has(String(s.documentId || "").trim()));

    const evidenceRequired = Boolean(result.evidence?.required);
    const hadAnySources = currentSources.length > 0;

    const next: ChatResult = {
      ...result,
      sources: scopedSources,
      scopeEnforced: true,
      evidence: {
        required: evidenceRequired,
        provided: scopedSources.length > 0,
        sourceIds: scopedSources.map((s) => s.documentId),
      },
    };

    if (hadAnySources && scopedSources.length === 0) {
      next.scopeRelaxed = false;
      next.scopeRelaxReason = "out_of_scope_sources_removed";
    }

    if (evidenceRequired && scopedSources.length === 0) {
      next.status = "partial";
      next.failureCode = next.failureCode || "MISSING_EVIDENCE";
      next.completion = {
        answered: false,
        missingSlots: next.completion?.missingSlots || ["scoped_source"],
        nextAction:
          next.completion?.nextAction ||
          "Attach or select the exact document scope for this question.",
      };
    }

    return next;
  }
}
