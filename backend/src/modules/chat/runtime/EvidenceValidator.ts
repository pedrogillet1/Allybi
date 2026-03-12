import type { ChatResult } from "../domain/chat.contracts";

export type EvidenceNextActionCode =
  | "NEEDS_DOC_LOCK"
  | "NEEDS_PROVENANCE"
  | "NEEDS_SOURCE_SCOPE";

export type EvidenceFailureCode =
  | "MISSING_SOURCES"
  | "MISSING_PROVENANCE"
  | "OUT_OF_SCOPE_SOURCES"
  | "OUT_OF_SCOPE_PROVENANCE";

export interface EvidenceValidationDecision {
  shouldUpdate: boolean;
  sources: ChatResult["sources"];
  provenance: ChatResult["provenance"];
  evidence: NonNullable<ChatResult["evidence"]>;
  status?: ChatResult["status"];
  failureCode?: EvidenceFailureCode | null;
  nextActionCode?: EvidenceNextActionCode | null;
  nextActionArgs?: Record<string, unknown> | null;
  scopeRelaxed?: boolean;
  scopeRelaxReason?: string;
}

function dedupeIds(values: string[]): string[] {
  return Array.from(
    new Set(
      (values || []).map((value) => String(value || "").trim()).filter(Boolean),
    ),
  );
}

export class EvidenceValidator {
  validateScope(
    result: ChatResult,
    allowedDocumentIds: string[],
  ): EvidenceValidationDecision {
    const allowed = new Set(dedupeIds(allowedDocumentIds || []));
    const currentSources = Array.isArray(result.sources) ? result.sources : [];
    const evidenceRequired = Boolean(result.evidence?.required);
    if (allowed.size === 0) {
      return {
        shouldUpdate: false,
        sources: currentSources,
        provenance: result.provenance || undefined,
        evidence: {
          required: evidenceRequired,
          provided: currentSources.length > 0,
          sourceIds: dedupeIds(currentSources.map((s) => s.documentId)),
        },
      };
    }

    const scopedSources = currentSources.filter((source) =>
      allowed.has(String(source.documentId || "").trim()),
    );
    const currentProvenance = result.provenance || null;
    const scopedSnippetRefs = currentProvenance
      ? currentProvenance.snippetRefs.filter((ref) =>
          allowed.has(String(ref.documentId || "").trim()),
        )
      : [];
    const nextProvenance = currentProvenance
      ? {
          ...currentProvenance,
          snippetRefs: scopedSnippetRefs,
          sourceDocumentIds: dedupeIds(
            scopedSnippetRefs.map((ref) => ref.documentId),
          ),
          evidenceIdsUsed: dedupeIds(
            scopedSnippetRefs.map((ref) => ref.evidenceId),
          ),
          coverageScore:
            currentProvenance.snippetRefs.length > 0
              ? Math.round(
                  (scopedSnippetRefs.length /
                    currentProvenance.snippetRefs.length) *
                    1000,
                ) / 1000
              : 0,
          validated:
            currentProvenance.validated === true &&
            scopedSnippetRefs.length > 0,
          failureCode:
            scopedSnippetRefs.length > 0 ? null : "OUT_OF_SCOPE_PROVENANCE",
        }
      : undefined;

    const evidence = {
      required: evidenceRequired,
      provided: scopedSources.length > 0,
      sourceIds: dedupeIds(scopedSources.map((source) => source.documentId)),
    };

    const provenanceMissing =
      Boolean(nextProvenance?.required) &&
      (nextProvenance?.snippetRefs?.length ?? 0) === 0;
    const missingSources = evidenceRequired && scopedSources.length === 0;

    if (!missingSources && !provenanceMissing) {
      return {
        shouldUpdate: true,
        sources: scopedSources,
        provenance: nextProvenance,
        evidence,
        scopeRelaxed: false,
        scopeRelaxReason:
          currentSources.length > 0 && scopedSources.length === 0
            ? "out_of_scope_sources_removed"
            : undefined,
      };
    }

    const missingSlots: string[] = [];
    let failureCode: EvidenceFailureCode = "MISSING_SOURCES";
    let nextActionCode: EvidenceNextActionCode = "NEEDS_DOC_LOCK";
    if (missingSources) {
      missingSlots.push("scoped_source");
      failureCode =
        currentSources.length > 0 ? "OUT_OF_SCOPE_SOURCES" : "MISSING_SOURCES";
      nextActionCode = "NEEDS_DOC_LOCK";
    }
    if (provenanceMissing) {
      missingSlots.push("provenance");
      if (!missingSources) {
        failureCode =
          scopedSources.length > 0
            ? "MISSING_PROVENANCE"
            : "OUT_OF_SCOPE_PROVENANCE";
      }
      nextActionCode = missingSources
        ? "NEEDS_DOC_LOCK"
        : scopedSources.length > 0
          ? "NEEDS_PROVENANCE"
          : "NEEDS_SOURCE_SCOPE";
    }

    return {
      shouldUpdate: true,
      sources: scopedSources,
      provenance: nextProvenance,
      evidence,
      status: "partial",
      failureCode,
      nextActionCode,
      nextActionArgs: { missingSlots },
      scopeRelaxed: false,
      scopeRelaxReason:
        currentSources.length > 0 && scopedSources.length === 0
          ? "out_of_scope_sources_removed"
          : undefined,
    };
  }

  enforceScope(result: ChatResult, allowedDocumentIds: string[]): ChatResult {
    const decision = this.validateScope(result, allowedDocumentIds);
    if (!decision.shouldUpdate) return result;

    return {
      ...result,
      sources: decision.sources,
      scopeEnforced: true,
      provenance: decision.provenance,
      evidence: decision.evidence,
      status: decision.status || result.status,
      failureCode: decision.failureCode || result.failureCode || null,
      scopeRelaxed:
        typeof decision.scopeRelaxed === "boolean"
          ? decision.scopeRelaxed
          : result.scopeRelaxed,
      scopeRelaxReason:
        decision.scopeRelaxReason || result.scopeRelaxReason || undefined,
      completion: {
        answered:
          result.completion?.answered ??
          Boolean(String(result.assistantText || "").trim()),
        missingSlots:
          Array.isArray(decision.nextActionArgs?.missingSlots) &&
          decision.nextActionArgs?.missingSlots.every(
            (value) => typeof value === "string",
          )
            ? (decision.nextActionArgs?.missingSlots as string[])
            : (result.completion?.missingSlots ?? []),
        nextAction: null,
        nextActionCode:
          decision.nextActionCode || result.completion?.nextActionCode || null,
        nextActionArgs:
          decision.nextActionArgs || result.completion?.nextActionArgs || null,
      },
    };
  }
}
