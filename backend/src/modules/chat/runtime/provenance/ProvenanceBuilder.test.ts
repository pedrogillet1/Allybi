import { describe, expect, it } from "@jest/globals";
import { buildChatProvenance } from "./ProvenanceBuilder";

describe("buildChatProvenance", () => {
  it("builds snippet refs from overlapping answer/evidence text", () => {
    const out = buildChatProvenance({
      answerText:
        "The contract states that Acme Corp is the legal owner of the asset.",
      answerMode: "doc_grounded_single",
      answerClass: "DOCUMENT",
      retrievalPack: {
        query: { original: "owner", normalized: "owner" },
        scope: {
          activeDocId: "doc-1",
          explicitDocLock: true,
          candidateDocIds: ["doc-1"],
        },
        stats: {
          candidatesConsidered: 1,
          candidatesAfterNegatives: 1,
          candidatesAfterBoosts: 1,
          candidatesAfterDiversification: 1,
          evidenceItems: 1,
          uniqueDocsInEvidence: 1,
          topScore: 0.9,
          scoreGap: 0.2,
        },
        evidence: [
          {
            evidenceType: "text",
            docId: "doc-1",
            title: "Contract",
            location: { page: 2 },
            locationKey: "doc-1:p2",
            snippet: "Acme Corp is the legal owner of the asset.",
            score: { finalScore: 0.9 },
          },
        ],
      } as any,
    });

    expect(out.required).toBe(true);
    expect(out.snippetRefs.length).toBeGreaterThan(0);
    expect(out.sourceDocumentIds).toEqual(["doc-1"]);
    expect(out.coverageScore).toBeGreaterThan(0);
  });
});
