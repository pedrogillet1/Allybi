import { describe, expect, test } from "@jest/globals";

import { adaptLegacyDocIntOutput } from "./legacyAdapter";

describe("legacy document intelligence adapter", () => {
  test("adapts legacy payload to schema v1 output", () => {
    const adapted = adaptLegacyDocIntOutput({
      documentId: "legacy-1",
      docType: "agreement",
      docTypeConfidence: 0.77,
      sections: [
        {
          section: "definitions",
          startPage: 1,
          endPage: 2,
          confidence: 0.8,
          spans: [{ page: 1, span: { start: 10, end: 30 } }],
        },
      ],
      tables: [
        {
          tableType: "transactions",
          page: 2,
          bbox: { x: 1, y: 2, w: 100, h: 80 },
          confidence: 0.6,
          evidence: [{ page: 2, span: { start: 40, end: 90 } }],
        },
      ],
      language: "en",
      ocrUsed: true,
      processingTimeMs: 99,
      evalTrack: "native_pdf",
    });

    expect(adapted.schema_version).toBe("1.0.0");
    expect(adapted.document_id).toBe("legacy-1");
    expect(adapted.doc_type.label).toBe("agreement");
    expect(adapted.sections[0].id).toBe("section_1");
    expect(adapted.tables[0].id).toBe("table_1");
    expect(adapted.meta.languages).toEqual(["en"]);
    expect(adapted.meta.eval_track).toBe("native_pdf");
  });
});
