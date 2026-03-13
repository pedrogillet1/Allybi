import { describe, expect, test } from "@jest/globals";
import type { ChatResult } from "../domain/chat.contracts";
import { EvidenceValidator } from "./EvidenceValidator";

function baseResult(overrides: Partial<ChatResult> = {}): ChatResult {
  return {
    conversationId: "conv-1",
    userMessageId: "user-msg-1",
    assistantMessageId: "assistant-msg-1",
    assistantText: "answer",
    answerMode: "doc_grounded_single",
    answerClass: "DOCUMENT",
    status: "success",
    completion: { answered: true, missingSlots: [], nextAction: null },
    truncation: { occurred: false, reason: null, resumeToken: null },
    evidence: { required: true, provided: true, sourceIds: ["doc-1"] },
    sources: [
      { documentId: "doc-1", filename: "d1.pdf", mimeType: null, page: 1 },
    ],
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
          snippetHash: "hash-1",
          coverageScore: 1,
        },
      ],
      coverageScore: 1,
    },
    ...overrides,
  };
}

describe("EvidenceValidator", () => {
  test("returns machine-readable codes instead of user-facing text", () => {
    const validator = new EvidenceValidator();
    const scoped = validator.enforceScope(
      baseResult({
        sources: [
          { documentId: "doc-out", filename: "out.pdf", mimeType: null, page: 2 },
        ],
        evidence: { required: true, provided: true, sourceIds: ["doc-out"] },
        provenance: {
          ...baseResult().provenance!,
          snippetRefs: [
            {
              evidenceId: "doc-out:loc-1",
              documentId: "doc-out",
              locationKey: "doc-out:loc-1",
              snippetHash: "hash-out",
              coverageScore: 1,
            },
          ],
          sourceDocumentIds: ["doc-out"],
          evidenceIdsUsed: ["doc-out:loc-1"],
        },
      }),
      ["doc-1"],
    );

    expect(scoped.failureCode).toBe("OUT_OF_SCOPE_SOURCES");
    expect(scoped.completion?.nextAction).toBeNull();
    expect(scoped.completion?.nextActionCode).toBe("NEEDS_DOC_LOCK");
    expect(scoped.completion?.nextActionArgs).toEqual({
      missingSlots: ["scoped_source", "provenance"],
    });
  });

  test("downgrades to partial when scoped sources remain but provenance refs are missing", () => {
    const validator = new EvidenceValidator();
    const result = baseResult({
      provenance: {
        ...baseResult().provenance!,
        validated: false,
        snippetRefs: [],
        sourceDocumentIds: [],
        evidenceIdsUsed: [],
        coverageScore: 0,
      },
    });

    const scoped = validator.enforceScope(result, ["doc-1"]);
    expect(scoped.sources?.length).toBe(1);
    expect(scoped.status).toBe("partial");
    expect(scoped.failureCode).toBe("MISSING_PROVENANCE");
    expect(scoped.completion?.missingSlots).toContain("provenance");
    expect(scoped.provenance?.validated).toBe(false);
    expect(scoped.provenance?.failureCode).toBe("OUT_OF_SCOPE_PROVENANCE");
  });

  test("returns input unchanged when no allowed scope is provided", () => {
    const validator = new EvidenceValidator();
    const result = baseResult();
    const scoped = validator.enforceScope(result, []);
    expect(scoped).toBe(result);
  });
});
