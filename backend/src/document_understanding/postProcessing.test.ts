import { describe, expect, test } from "@jest/globals";

import { postProcessDocumentUnderstandingOutput } from "./postProcessing";
import type { DocumentUnderstandingOutput } from "./types";

function buildInput(): DocumentUnderstandingOutput {
  return {
    schema_version: "1.0.0",
    document_id: "doc-post-process",
    doc_type: {
      label: "agreement",
      confidence: 0.4,
      evidence: [{ page: 1, span: { start: 0, end: 10 } }],
    },
    sections: [
      {
        id: "s1",
        label: "definitions",
        parent_id: null,
        page_start: 1,
        page_end: 1,
        spans: [{ page: 1, span: { start: 11, end: 20 } }],
        confidence: 0.3,
      },
    ],
    tables: [
      {
        id: "t1",
        label: "transactions",
        page: 1,
        bbox: { x: 0, y: 0, w: 100, h: 50 },
        confidence: 0.2,
        evidence: [{ page: 1, span: { start: 21, end: 30 } }],
      },
    ],
    meta: {
      languages: ["EN"],
      ocr_used: true,
      processing_time_ms: 20,
    },
  };
}

describe("document_understanding post processing", () => {
  test("applies confidence abstention and returns validation issues list", () => {
    const { output, issues } = postProcessDocumentUnderstandingOutput(buildInput(), {
      confidence_abstain_threshold: 0.65,
    });

    expect(output.doc_type.label).toBe("unknown");
    expect(output.sections[0].label).toBe("unknown");
    expect(output.tables[0].label).toBe("unknown");
    expect(issues.some((issue) => issue.severity === "error")).toBe(false);
  });

  test("keeps labels when confidence exceeds threshold", () => {
    const input = buildInput();
    input.doc_type.confidence = 0.95;
    input.sections[0].confidence = 0.91;
    input.tables[0].confidence = 0.87;

    const { output } = postProcessDocumentUnderstandingOutput(input, {
      confidence_abstain_threshold: 0.65,
    });

    expect(output.doc_type.label).toBe("contract");
    expect(output.sections[0].label).toBe("definitions");
    expect(output.tables[0].label).toBe("statement_table");
  });
});
