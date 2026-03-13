/**
 * table-context-types.cert.test.ts
 * Certification test for CandidateChunk.table context fields.
 *
 * Verifies that the unitAnnotation, scaleFactor, and footnotes fields
 * are present and accessible on the CandidateChunk.table type.
 */
import { describe, expect, it } from "@jest/globals";
import type { CandidateChunk } from "../../services/core/retrieval/retrieval.types";

describe("CandidateChunk.table context fields", () => {
  const baseChunk: CandidateChunk = {
    candidateId: "test-001",
    type: "table",
    source: "semantic",
    docId: "doc-1",
    location: { page: 1 },
    locationKey: "doc-1:p1",
    snippet: "Revenue table",
    table: {
      header: ["Year", "Revenue"],
      rows: [
        [2024, 1000],
        [2025, 1200],
      ],
      structureScore: 0.95,
      numericIntegrityScore: 0.9,
      warnings: [],
      unitAnnotation: { unitRaw: "$M", unitNormalized: "USD_MILLIONS" },
      scaleFactor: "millions",
      footnotes: ["Restated for FY2024", "Unaudited"],
    },
    scores: { final: 0.85 },
    signals: { tableValidated: true },
    provenanceOk: true,
  };

  it("unitAnnotation is accessible and carries unitRaw + unitNormalized", () => {
    expect(baseChunk.table).toBeDefined();
    expect(baseChunk.table!.unitAnnotation).toEqual({
      unitRaw: "$M",
      unitNormalized: "USD_MILLIONS",
    });
    expect(baseChunk.table!.unitAnnotation!.unitRaw).toBe("$M");
    expect(baseChunk.table!.unitAnnotation!.unitNormalized).toBe("USD_MILLIONS");
  });

  it("scaleFactor is accessible", () => {
    expect(baseChunk.table!.scaleFactor).toBe("millions");
  });

  it("footnotes is accessible and is an array of strings", () => {
    expect(baseChunk.table!.footnotes).toEqual(["Restated for FY2024", "Unaudited"]);
    expect(Array.isArray(baseChunk.table!.footnotes)).toBe(true);
    expect(baseChunk.table!.footnotes!.length).toBe(2);
  });

  it("fields accept null values", () => {
    const nullChunk: CandidateChunk = {
      ...baseChunk,
      candidateId: "test-002",
      table: {
        header: ["Col"],
        rows: [["val"]],
        unitAnnotation: null,
        scaleFactor: null,
        footnotes: null,
      },
    };

    expect(nullChunk.table!.unitAnnotation).toBeNull();
    expect(nullChunk.table!.scaleFactor).toBeNull();
    expect(nullChunk.table!.footnotes).toBeNull();
  });

  it("fields are optional (can be omitted)", () => {
    const minimalChunk: CandidateChunk = {
      ...baseChunk,
      candidateId: "test-003",
      table: {
        header: ["Col"],
        rows: [["val"]],
      },
    };

    expect(minimalChunk.table!.unitAnnotation).toBeUndefined();
    expect(minimalChunk.table!.scaleFactor).toBeUndefined();
    expect(minimalChunk.table!.footnotes).toBeUndefined();
  });
});
