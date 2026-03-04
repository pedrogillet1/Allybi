import { describe, expect, test } from "@jest/globals";

import { validateDocumentUnderstandingOutput } from "./validation";
import type { DocumentUnderstandingOutput } from "./types";

function baseOutput(): DocumentUnderstandingOutput {
  return {
    schema_version: "1.0.0",
    document_id: "doc-validation",
    doc_type: {
      label: "contract",
      confidence: 0.9,
      evidence: [{ page: 1, span: { start: 0, end: 10 } }],
    },
    sections: [
      {
        id: "s1",
        label: "definitions",
        parent_id: null,
        page_start: 1,
        page_end: 1,
        spans: [{ page: 1, span: { start: 20, end: 30 } }],
        confidence: 0.8,
      },
      {
        id: "s2",
        label: "termination",
        parent_id: "s1",
        page_start: 2,
        page_end: 2,
        spans: [{ page: 2, span: { start: 10, end: 20 } }],
        confidence: 0.75,
      },
    ],
    tables: [
      {
        id: "t1",
        label: "statement_table",
        page: 1,
        bbox: { x: 0, y: 0, w: 100, h: 40 },
        confidence: 0.88,
        evidence: [{ page: 1, span: { start: 35, end: 60 } }],
      },
    ],
    meta: {
      languages: ["en"],
      ocr_used: false,
      processing_time_ms: 12,
    },
  };
}

describe("document_understanding validation", () => {
  test("flags missing section parent references", () => {
    const output = baseOutput();
    output.sections[1].parent_id = "missing-parent";

    const result = validateDocumentUnderstandingOutput(output);

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "SECTION_PARENT_MISSING")).toBe(true);
  });

  test("flags section hierarchy cycles", () => {
    const output = baseOutput();
    output.sections[0].parent_id = "s2";
    output.sections[1].parent_id = "s1";

    const result = validateDocumentUnderstandingOutput(output);

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "SECTION_HIERARCHY_CYCLE")).toBe(true);
  });

  test("flags evidence span ranges where end < start", () => {
    const output = baseOutput();
    output.doc_type.evidence[0].span = { start: 20, end: 10 };

    const result = validateDocumentUnderstandingOutput(output);

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "EVIDENCE_RANGE_INVALID")).toBe(true);
  });

  test("accepts structurally valid outputs", () => {
    const result = validateDocumentUnderstandingOutput(baseOutput());

    expect(result.valid).toBe(true);
    expect(result.issues.filter((issue) => issue.severity === "error")).toHaveLength(0);
  });
});
