import { describe, expect, test } from "@jest/globals";

import {
  applyAbstention,
  canonicalizeLabel,
  clampConfidence,
  normalizeDocumentUnderstandingOutput,
} from "./normalization";
import { DOCUMENT_UNDERSTANDING_ONTOLOGY } from "./ontology";
import type { DocumentUnderstandingOutput } from "./types";

function makeOutput(overrides: Partial<DocumentUnderstandingOutput> = {}): DocumentUnderstandingOutput {
  return {
    schema_version: "1.0.0",
    document_id: "doc-1",
    doc_type: {
      label: "agreement",
      confidence: 0.95,
      evidence: [{ page: 1, span: { start: 0, end: 10 } }],
    },
    sections: [
      {
        id: "s1",
        label: "definitions and interpretation",
        parent_id: null,
        page_start: 1,
        page_end: 1,
        spans: [{ page: 1, span: { start: 12, end: 20 } }],
        confidence: 0.91,
      },
    ],
    tables: [
      {
        id: "t1",
        label: "transactions",
        page: 1,
        bbox: { x: 0, y: 0, w: 100, h: 40 },
        confidence: 0.9,
        evidence: [{ page: 1, span: { start: 22, end: 40 } }],
      },
    ],
    meta: {
      languages: ["EN", "en", "pt"],
      ocr_used: true,
      processing_time_ms: 10,
    },
    ...overrides,
  };
}

describe("document_understanding normalization", () => {
  test("canonicalizeLabel maps aliases to canonical labels", () => {
    const out = canonicalizeLabel(
      "telephone bill",
      DOCUMENT_UNDERSTANDING_ONTOLOGY.docTypeAliasMap,
    );
    expect(out).toBe("phone_bill");
  });

  test("clampConfidence enforces [0, 1] bounds", () => {
    expect(clampConfidence(-1)).toBe(0);
    expect(clampConfidence(0.42)).toBe(0.42);
    expect(clampConfidence(2)).toBe(1);
  });

  test("applyAbstention routes low confidence to unknown", () => {
    expect(applyAbstention("contract", 0.3, 0.65)).toBe("unknown");
    expect(applyAbstention("contract", 0.9, 0.65)).toBe("contract");
  });

  test("normalizeDocumentUnderstandingOutput normalizes labels and language casing", () => {
    const normalized = normalizeDocumentUnderstandingOutput(makeOutput());

    expect(normalized.doc_type.label).toBe("contract");
    expect(normalized.sections[0].label).toBe("definitions");
    expect(normalized.tables[0].label).toBe("statement_table");
    expect(normalized.meta.languages).toEqual(["en", "pt"]);
  });
});
