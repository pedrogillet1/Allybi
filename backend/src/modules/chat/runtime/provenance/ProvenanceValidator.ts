import type {
  AnswerClass,
  AnswerMode,
  ChatProvenanceDTO,
} from "../../domain/chat.contracts";

export type ProvenanceFailureCode =
  | "missing_provenance"
  | "out_of_scope_provenance"
  | "insufficient_provenance_coverage";

export interface ProvenanceValidationResult {
  ok: boolean;
  failureCode: ProvenanceFailureCode | null;
  warnings: string[];
}

function requiresProvenance(
  answerMode?: AnswerMode,
  answerClass?: AnswerClass,
) {
  if (String(answerMode || "").startsWith("doc_grounded")) return true;
  return String(answerClass || "") === "DOCUMENT";
}

function resolveMinCoverage(answerMode?: AnswerMode): number {
  switch (answerMode) {
    case "doc_grounded_multi":
      return 0.2;
    case "doc_grounded_quote":
      return 0.15;
    case "doc_grounded_single":
      return 0.1;
    default:
      return 0.1;
  }
}

export function validateChatProvenance(params: {
  provenance?: ChatProvenanceDTO | null;
  answerMode?: AnswerMode;
  answerClass?: AnswerClass;
  allowedDocumentIds?: string[];
}): ProvenanceValidationResult {
  const required = requiresProvenance(params.answerMode, params.answerClass);
  if (!required) {
    return { ok: true, failureCode: null, warnings: [] };
  }

  const provenance = params.provenance || null;
  if (!provenance || provenance.snippetRefs.length === 0) {
    return {
      ok: false,
      failureCode: "missing_provenance",
      warnings: ["DOC_GROUNDED_WITHOUT_PROVENANCE"],
    };
  }

  const allowed = new Set(
    (params.allowedDocumentIds || [])
      .map((id) => String(id || "").trim())
      .filter(Boolean),
  );
  if (allowed.size > 0) {
    const outOfScope = provenance.snippetRefs.filter(
      (ref) => !allowed.has(String(ref.documentId || "").trim()),
    );
    if (outOfScope.length > 0) {
      return {
        ok: false,
        failureCode: "out_of_scope_provenance",
        warnings: ["PROVENANCE_OUT_OF_SCOPE"],
      };
    }
  }

  if (provenance.coverageScore < resolveMinCoverage(params.answerMode)) {
    return {
      ok: false,
      failureCode: "insufficient_provenance_coverage",
      warnings: ["PROVENANCE_COVERAGE_LOW"],
    };
  }

  return { ok: true, failureCode: null, warnings: [] };
}
