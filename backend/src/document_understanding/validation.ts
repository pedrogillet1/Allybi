import Ajv2020 from "ajv/dist/2020";
import type { ErrorObject } from "ajv";

import schema from "./document_understanding.schema.json";
import type {
  DocumentUnderstandingOutput,
  SectionPrediction,
  TextEvidence,
  ValidationIssue,
  ValidationResult,
} from "./types";

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateSchema = ajv.compile<DocumentUnderstandingOutput>(schema);

function addIssue(
  issues: ValidationIssue[],
  code: string,
  path: string,
  message: string,
  severity: "error" | "warning" = "error",
): void {
  issues.push({ code, path, message, severity });
}

function schemaErrorsToIssues(errors: ErrorObject[] | null | undefined): ValidationIssue[] {
  if (!errors || errors.length === 0) return [];
  return errors.map((error) => ({
    code: "SCHEMA_VALIDATION_ERROR",
    path: error.instancePath || "/",
    message: error.message || "invalid payload",
    severity: "error" as const,
  }));
}

function validateEvidenceSpan(
  evidence: TextEvidence,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Number.isInteger(evidence.page) || evidence.page < 1) {
    addIssue(
      issues,
      "EVIDENCE_PAGE_INVALID",
      `${path}.page`,
      `Evidence page must be a positive integer, received ${String(evidence.page)}`,
    );
  }

  const start = Number(evidence.span?.start);
  const end = Number(evidence.span?.end);

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    addIssue(
      issues,
      "EVIDENCE_RANGE_INVALID",
      `${path}.span`,
      "Evidence span start/end must be finite numbers",
    );
    return;
  }

  if (start < 0 || end < 0 || end < start) {
    addIssue(
      issues,
      "EVIDENCE_RANGE_INVALID",
      `${path}.span`,
      `Evidence span range is invalid (start=${start}, end=${end})`,
    );
  }
}

export function validateSectionHierarchy(
  sections: SectionPrediction[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const sectionById = new Map<string, SectionPrediction>();

  for (const section of sections) {
    const normalizedId = String(section.id || "").trim();
    if (!normalizedId) {
      addIssue(issues, "SECTION_ID_MISSING", "/sections", "Section id is required");
      continue;
    }

    if (sectionById.has(normalizedId)) {
      addIssue(
        issues,
        "SECTION_ID_DUPLICATE",
        "/sections",
        `Duplicate section id detected: ${normalizedId}`,
      );
    } else {
      sectionById.set(normalizedId, section);
    }

    if (section.page_start > section.page_end) {
      addIssue(
        issues,
        "SECTION_PAGE_RANGE_INVALID",
        `/sections/${normalizedId}`,
        `Section page range invalid: ${section.page_start}..${section.page_end}`,
      );
    }

    for (let i = 0; i < section.spans.length; i += 1) {
      const evidence = section.spans[i];
      validateEvidenceSpan(evidence, `/sections/${normalizedId}/spans/${i}`, issues);
      if (evidence.page < section.page_start || evidence.page > section.page_end) {
        addIssue(
          issues,
          "SECTION_SPAN_OUTSIDE_PAGE_RANGE",
          `/sections/${normalizedId}/spans/${i}`,
          `Span page ${evidence.page} outside section page range ${section.page_start}-${section.page_end}`,
          "warning",
        );
      }
    }
  }

  for (const section of sections) {
    if (!section.parent_id) continue;
    if (!sectionById.has(section.parent_id)) {
      addIssue(
        issues,
        "SECTION_PARENT_MISSING",
        `/sections/${section.id}`,
        `Section parent_id does not exist: ${section.parent_id}`,
      );
    }
  }

  const state = new Map<string, "unseen" | "visiting" | "visited">();
  for (const id of sectionById.keys()) {
    state.set(id, "unseen");
  }

  function dfs(sectionId: string, stack: string[]): void {
    const currentState = state.get(sectionId);
    if (currentState === "visited") return;
    if (currentState === "visiting") {
      addIssue(
        issues,
        "SECTION_HIERARCHY_CYCLE",
        `/sections/${sectionId}`,
        `Cycle detected in section hierarchy: ${[...stack, sectionId].join(" -> ")}`,
      );
      return;
    }

    state.set(sectionId, "visiting");
    const section = sectionById.get(sectionId);
    if (section?.parent_id && sectionById.has(section.parent_id)) {
      dfs(section.parent_id, [...stack, sectionId]);
    }
    state.set(sectionId, "visited");
  }

  for (const id of sectionById.keys()) {
    dfs(id, []);
  }

  return issues;
}

function validateTableConstraints(output: DocumentUnderstandingOutput, issues: ValidationIssue[]): void {
  const tableIds = new Set<string>();

  for (const table of output.tables) {
    const tableId = String(table.id || "").trim();
    if (!tableId) {
      addIssue(issues, "TABLE_ID_MISSING", "/tables", "Table id is required");
    } else if (tableIds.has(tableId)) {
      addIssue(issues, "TABLE_ID_DUPLICATE", "/tables", `Duplicate table id detected: ${tableId}`);
    } else {
      tableIds.add(tableId);
    }

    if (table.bbox.w <= 0 || table.bbox.h <= 0) {
      addIssue(
        issues,
        "TABLE_BBOX_INVALID",
        `/tables/${tableId}/bbox`,
        "Table bbox width/height must be > 0",
      );
    }

    for (let i = 0; i < table.evidence.length; i += 1) {
      validateEvidenceSpan(table.evidence[i], `/tables/${tableId}/evidence/${i}`, issues);
    }
  }
}

function validateDocTypeConstraints(output: DocumentUnderstandingOutput, issues: ValidationIssue[]): void {
  for (let i = 0; i < output.doc_type.evidence.length; i += 1) {
    validateEvidenceSpan(output.doc_type.evidence[i], `/doc_type/evidence/${i}`, issues);
  }
}

export function validateDocumentUnderstandingOutput(
  output: DocumentUnderstandingOutput,
): ValidationResult {
  const issues: ValidationIssue[] = [];

  const schemaIsValid = validateSchema(output);
  if (!schemaIsValid) {
    issues.push(...schemaErrorsToIssues(validateSchema.errors));
  }

  validateDocTypeConstraints(output, issues);
  issues.push(...validateSectionHierarchy(output.sections || []));
  validateTableConstraints(output, issues);

  return {
    valid: issues.every((issue) => issue.severity !== "error"),
    issues,
  };
}
