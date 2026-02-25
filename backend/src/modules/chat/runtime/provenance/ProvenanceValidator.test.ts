import { describe, expect, it } from "@jest/globals";
import { validateChatProvenance } from "./ProvenanceValidator";

describe("validateChatProvenance", () => {
  it("fails when doc-grounded answer has no provenance", () => {
    const out = validateChatProvenance({
      answerMode: "doc_grounded_single",
      answerClass: "DOCUMENT",
      provenance: null,
      allowedDocumentIds: ["doc-1"],
    });
    expect(out.ok).toBe(false);
    expect(out.failureCode).toBe("missing_provenance");
  });

  it("fails when provenance points outside allowed docs", () => {
    const out = validateChatProvenance({
      answerMode: "doc_grounded_single",
      answerClass: "DOCUMENT",
      allowedDocumentIds: ["doc-1"],
      provenance: {
        mode: "hidden_map",
        required: true,
        validated: true,
        failureCode: null,
        evidenceIdsUsed: ["doc-2:loc-1"],
        sourceDocumentIds: ["doc-2"],
        snippetRefs: [
          {
            evidenceId: "doc-2:loc-1",
            documentId: "doc-2",
            locationKey: "loc-1",
            snippetHash: "abc",
            coverageScore: 0.8,
          },
        ],
        coverageScore: 1,
      },
    });
    expect(out.ok).toBe(false);
    expect(out.failureCode).toBe("out_of_scope_provenance");
  });

  it("passes when provenance is in scope and above coverage threshold", () => {
    const out = validateChatProvenance({
      answerMode: "doc_grounded_single",
      answerClass: "DOCUMENT",
      allowedDocumentIds: ["doc-1"],
      provenance: {
        mode: "hidden_map",
        required: true,
        validated: true,
        failureCode: null,
        evidenceIdsUsed: ["doc-1:loc-1"],
        sourceDocumentIds: ["doc-1"],
        snippetRefs: [
          {
            evidenceId: "doc-1:loc-1",
            documentId: "doc-1",
            locationKey: "loc-1",
            snippetHash: "abc",
            coverageScore: 0.8,
          },
        ],
        coverageScore: 0.5,
      },
    });
    expect(out.ok).toBe(true);
    expect(out.failureCode).toBeNull();
  });
});
