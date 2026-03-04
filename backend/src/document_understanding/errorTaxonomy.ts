import type { ValidationIssue } from "./types";

export type DocumentUnderstandingErrorCode =
  | "LABEL_MISMATCH"
  | "BOUNDARY_MISMATCH"
  | "MISSING_DETECTION"
  | "FALSE_POSITIVE"
  | "HIERARCHY_ERROR"
  | "LOW_EVIDENCE_QUALITY"
  | "ABSTENTION_ERROR"
  | "SCHEMA_ERROR"
  | "UNKNOWN_ERROR";

export type ErrorSeverity = "critical" | "high" | "medium";

export interface ErrorTaxonomyEntry {
  code: DocumentUnderstandingErrorCode;
  severity: ErrorSeverity;
  weight: number;
}

export const ERROR_TAXONOMY: Record<DocumentUnderstandingErrorCode, ErrorTaxonomyEntry> = {
  LABEL_MISMATCH: { code: "LABEL_MISMATCH", severity: "critical", weight: 5 },
  BOUNDARY_MISMATCH: { code: "BOUNDARY_MISMATCH", severity: "high", weight: 3 },
  MISSING_DETECTION: { code: "MISSING_DETECTION", severity: "critical", weight: 5 },
  FALSE_POSITIVE: { code: "FALSE_POSITIVE", severity: "medium", weight: 2 },
  HIERARCHY_ERROR: { code: "HIERARCHY_ERROR", severity: "high", weight: 4 },
  LOW_EVIDENCE_QUALITY: { code: "LOW_EVIDENCE_QUALITY", severity: "medium", weight: 2 },
  ABSTENTION_ERROR: { code: "ABSTENTION_ERROR", severity: "high", weight: 4 },
  SCHEMA_ERROR: { code: "SCHEMA_ERROR", severity: "critical", weight: 5 },
  UNKNOWN_ERROR: { code: "UNKNOWN_ERROR", severity: "medium", weight: 1 },
};

export function classifyValidationIssue(issue: ValidationIssue): DocumentUnderstandingErrorCode {
  if (issue.code === "SCHEMA_VALIDATION_ERROR") return "SCHEMA_ERROR";

  if (issue.code.startsWith("SECTION_HIERARCHY") || issue.code.startsWith("SECTION_PARENT")) {
    return "HIERARCHY_ERROR";
  }

  if (issue.code.startsWith("EVIDENCE_")) return "LOW_EVIDENCE_QUALITY";

  if (issue.code.startsWith("SECTION_PAGE_RANGE") || issue.code.startsWith("SECTION_SPAN_OUTSIDE")) {
    return "BOUNDARY_MISMATCH";
  }

  if (issue.code.startsWith("TABLE_BBOX")) return "BOUNDARY_MISMATCH";

  return "UNKNOWN_ERROR";
}

export function weightedErrorScore(errorCodes: DocumentUnderstandingErrorCode[]): number {
  if (errorCodes.length === 0) return 0;
  let total = 0;
  for (const code of errorCodes) {
    total += ERROR_TAXONOMY[code].weight;
  }
  return total / errorCodes.length;
}
