import type { ChatResult } from "../domain/chat.contracts";

export class EvidenceValidator {
  enforceScope(result: ChatResult, allowedDocumentIds: string[]): ChatResult {
    const allowed = new Set(
      (allowedDocumentIds || [])
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    );
    if (allowed.size === 0) return result;

    const currentSources = Array.isArray(result.sources) ? result.sources : [];
    const scopedSources = currentSources.filter((s) =>
      allowed.has(String(s.documentId || "").trim()),
    );

    const evidenceRequired = Boolean(result.evidence?.required);
    const hadAnySources = currentSources.length > 0;
    const currentProvenance = result.provenance || null;
    const scopedSnippetRefs = currentProvenance
      ? currentProvenance.snippetRefs.filter((ref) =>
          allowed.has(String(ref.documentId || "").trim()),
        )
      : [];
    // If provenance was already soft-validated upstream (e.g. attached-document
    // mode with keyword retrieval), preserve the validated state.
    const upstreamSoftPass =
      currentProvenance?.validated === true &&
      currentProvenance.snippetRefs.length === 0;
    let nextProvenance = currentProvenance
      ? {
          ...currentProvenance,
          snippetRefs: scopedSnippetRefs,
          sourceDocumentIds: Array.from(
            new Set(scopedSnippetRefs.map((ref) => ref.documentId)),
          ),
          evidenceIdsUsed: Array.from(
            new Set(scopedSnippetRefs.map((ref) => ref.evidenceId)),
          ),
          coverageScore:
            currentProvenance.snippetRefs.length > 0
              ? Math.round(
                  (scopedSnippetRefs.length /
                    currentProvenance.snippetRefs.length) *
                    1000,
                ) / 1000
              : 0,
          validated: upstreamSoftPass || scopedSnippetRefs.length > 0,
          failureCode: upstreamSoftPass
            ? null
            : scopedSnippetRefs.length > 0
              ? null
              : "out_of_scope_provenance",
        }
      : undefined;

    const next: ChatResult = {
      ...result,
      sources: scopedSources,
      scopeEnforced: true,
      provenance: nextProvenance,
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

    let provenanceMissing =
      Boolean(nextProvenance?.required) &&
      !upstreamSoftPass &&
      (nextProvenance?.snippetRefs?.length ?? 0) === 0;

    // Soft-pass provenance in strict scoped mode when we still have in-scope
    // sources after filtering. This avoids false "missing_provenance" errors
    // for transformed/condensed answers where lexical overlap is weak even
    // though evidence sources are valid and doc-locked.
    if (provenanceMissing && scopedSources.length > 0 && nextProvenance) {
      provenanceMissing = false;
      nextProvenance = {
        ...nextProvenance,
        validated: true,
        failureCode: null,
        sourceDocumentIds: Array.from(
          new Set(
            scopedSources
              .map((source) => String(source.documentId || "").trim())
              .filter(Boolean),
          ),
        ),
      };
      next.provenance = nextProvenance;
    }

    if (evidenceRequired && (scopedSources.length === 0 || provenanceMissing)) {
      next.status = "partial";
      next.failureCode =
        next.failureCode ||
        (provenanceMissing ? "missing_provenance" : "MISSING_EVIDENCE");
      next.completion = {
        answered: false,
        missingSlots:
          next.completion?.missingSlots ||
          (provenanceMissing ? ["provenance"] : ["scoped_source"]),
        nextAction:
          next.completion?.nextAction ||
          (provenanceMissing
            ? "Please ask a more specific question so I can anchor the answer to your document snippets."
            : "Attach or select the exact document scope for this question."),
      };
    }

    return next;
  }
}
