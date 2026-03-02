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
    case "doc_grounded_quote":
      return 0.55;
    case "doc_grounded_table":
      return 0.28;
    case "doc_grounded_multi":
      return 0.24;
    case "doc_grounded_single":
      return 0.22;
    case "help_steps":
      return 0.2;
    default:
      return 0.22;
  }
}

function isStrictProvenanceV2Enabled(): boolean {
  const raw = String(process.env.STRICT_PROVENANCE_V2 || "")
    .trim()
    .toLowerCase();
  if (!raw) return true;
  return !["0", "false", "off", "no"].includes(raw);
}

function resolveMinRefCount(answerMode?: AnswerMode): number {
  switch (answerMode) {
    case "doc_grounded_multi":
      return 2;
    default:
      return 1;
  }
}

function resolveMinPerRefCoverage(answerMode?: AnswerMode): number {
  switch (answerMode) {
    case "doc_grounded_quote":
      return 0.55;
    case "doc_grounded_table":
      return 0.25;
    case "doc_grounded_multi":
      return 0.2;
    case "doc_grounded_single":
      return 0.2;
    case "help_steps":
      return 0.18;
    default:
      return 0.2;
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

  if (!isStrictProvenanceV2Enabled()) {
    if (
      provenance.coverageScore <
      (params.answerMode === "doc_grounded_multi"
        ? 0.2
        : params.answerMode === "doc_grounded_quote"
          ? 0.15
          : 0.1)
    ) {
      return {
        ok: false,
        failureCode: "insufficient_provenance_coverage",
        warnings: ["PROVENANCE_COVERAGE_LOW"],
      };
    }
    return { ok: true, failureCode: null, warnings: [] };
  }

  if (provenance.snippetRefs.length < resolveMinRefCount(params.answerMode)) {
    return {
      ok: false,
      failureCode: "insufficient_provenance_coverage",
      warnings: ["PROVENANCE_SNIPPET_REFS_LOW"],
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

  const minPerRefCoverage = resolveMinPerRefCoverage(params.answerMode);
  const hasLowRef = provenance.snippetRefs.some(
    (ref) => Number(ref.coverageScore || 0) < minPerRefCoverage,
  );
  if (hasLowRef) {
    return {
      ok: false,
      failureCode: "insufficient_provenance_coverage",
      warnings: ["PROVENANCE_REF_COVERAGE_LOW"],
    };
  }

  const aggregateCoverage = Number(
    provenance.semanticCoverage ?? provenance.coverageScore ?? 0,
  );
  if (aggregateCoverage < resolveMinCoverage(params.answerMode)) {
    return {
      ok: false,
      failureCode: "insufficient_provenance_coverage",
      warnings: ["PROVENANCE_COVERAGE_LOW"],
    };
  }

  return { ok: true, failureCode: null, warnings: [] };
}
