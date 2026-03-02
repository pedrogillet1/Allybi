import { describe, expect, test } from "@jest/globals";
import { validateChatProvenance } from "./ProvenanceValidator";

function mkProvenance(
  overrides: Partial<{
    snippetRefs: Array<{
      evidenceId: string;
      documentId: string;
      locationKey: string;
      snippetHash: string;
      coverageScore: number;
    }>;
    coverageScore: number;
    semanticCoverage: number;
  }> = {},
) {
  return {
    mode: "hidden_map" as const,
    required: true,
    validated: false,
    failureCode: null,
    evidenceIdsUsed: ["doc-1:loc-1"],
    sourceDocumentIds: ["doc-1"],
    snippetRefs: [
      {
        evidenceId: "doc-1:loc-1",
        documentId: "doc-1",
        locationKey: "loc-1",
        snippetHash: "hash-1",
        coverageScore: 0.3,
      },
    ],
    coverageScore: 0.3,
    semanticCoverage: 0.3,
    ...overrides,
  };
}

describe("validateChatProvenance", () => {
  test("fails quote mode when per-ref coverage is below strict threshold", () => {
    const result = validateChatProvenance({
      provenance: mkProvenance({
        snippetRefs: [
          {
            evidenceId: "doc-1:loc-1",
            documentId: "doc-1",
            locationKey: "loc-1",
            snippetHash: "hash-1",
            coverageScore: 0.35,
          },
        ],
        coverageScore: 0.35,
        semanticCoverage: 0.35,
      }) as any,
      answerMode: "doc_grounded_quote" as any,
      answerClass: "DOCUMENT" as any,
      allowedDocumentIds: ["doc-1"],
    });

    expect(result.ok).toBe(false);
    expect(result.failureCode).toBe("insufficient_provenance_coverage");
  });

  test("fails multi mode when fewer than two refs are present", () => {
    const result = validateChatProvenance({
      provenance: mkProvenance() as any,
      answerMode: "doc_grounded_multi" as any,
      answerClass: "DOCUMENT" as any,
      allowedDocumentIds: ["doc-1"],
    });

    expect(result.ok).toBe(false);
    expect(result.failureCode).toBe("insufficient_provenance_coverage");
  });

  test("passes single mode with in-scope refs and sufficient coverage", () => {
    const result = validateChatProvenance({
      provenance: mkProvenance() as any,
      answerMode: "doc_grounded_single" as any,
      answerClass: "DOCUMENT" as any,
      allowedDocumentIds: ["doc-1"],
    });

    expect(result.ok).toBe(true);
    expect(result.failureCode).toBeNull();
  });

  test("uses legacy lenient coverage path when strict provenance flag is disabled", () => {
    const prev = process.env.STRICT_PROVENANCE_V2;
    process.env.STRICT_PROVENANCE_V2 = "0";
    try {
      const result = validateChatProvenance({
        provenance: mkProvenance({
          snippetRefs: [
            {
              evidenceId: "doc-1:loc-1",
              documentId: "doc-1",
              locationKey: "loc-1",
              snippetHash: "hash-1",
              coverageScore: 0.01,
            },
          ],
          coverageScore: 0.2,
          semanticCoverage: 0.01,
        }) as any,
        answerMode: "doc_grounded_quote" as any,
        answerClass: "DOCUMENT" as any,
        allowedDocumentIds: ["doc-1"],
      });

      expect(result.ok).toBe(true);
      expect(result.failureCode).toBeNull();
    } finally {
      if (prev === undefined) delete process.env.STRICT_PROVENANCE_V2;
      else process.env.STRICT_PROVENANCE_V2 = prev;
    }
  });
});
