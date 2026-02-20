import { describe, expect, it } from "@jest/globals";

import { EvidenceValidator } from "./EvidenceValidator";
import type { ChatResult } from "../domain/chat.contracts";

function baseResult(overrides: Partial<ChatResult> = {}): ChatResult {
  return {
    conversationId: "c1",
    userMessageId: "u1",
    assistantMessageId: "a1",
    assistantText: "ok",
    ...overrides,
  };
}

describe("EvidenceValidator", () => {
  it("returns original result when no allowed scope is provided", () => {
    const validator = new EvidenceValidator();
    const result = baseResult({
      sources: [
        { documentId: "doc-1", filename: "a.pdf", mimeType: null, page: 1 },
      ],
    });
    const out = validator.enforceScope(result, []);
    expect(out).toBe(result);
  });

  it("filters out-of-scope sources and marks scope enforcement", () => {
    const validator = new EvidenceValidator();
    const out = validator.enforceScope(
      baseResult({
        sources: [
          { documentId: "doc-1", filename: "a.pdf", mimeType: null, page: 1 },
          { documentId: "doc-2", filename: "b.pdf", mimeType: null, page: 2 },
        ],
      }),
      ["doc-1"],
    );

    expect(out.scopeEnforced).toBe(true);
    expect(out.sources).toEqual([
      { documentId: "doc-1", filename: "a.pdf", mimeType: null, page: 1 },
    ]);
    expect(out.evidence?.provided).toBe(true);
    expect(out.evidence?.sourceIds).toEqual(["doc-1"]);
  });

  it("sets partial result when evidence is required but all sources are removed", () => {
    const validator = new EvidenceValidator();
    const out = validator.enforceScope(
      baseResult({
        status: "success",
        sources: [
          { documentId: "doc-2", filename: "b.pdf", mimeType: null, page: 2 },
        ],
        evidence: { required: true, provided: true, sourceIds: ["doc-2"] },
      }),
      ["doc-1"],
    );

    expect(out.scopeRelaxed).toBe(false);
    expect(out.scopeRelaxReason).toBe("out_of_scope_sources_removed");
    expect(out.status).toBe("partial");
    expect(out.failureCode).toBe("MISSING_EVIDENCE");
    expect(out.completion?.answered).toBe(false);
    expect(out.completion?.missingSlots).toContain("scoped_source");
  });

  it("keeps non-required evidence responses without forcing partial", () => {
    const validator = new EvidenceValidator();
    const out = validator.enforceScope(
      baseResult({
        status: "success",
        sources: [
          { documentId: "doc-2", filename: "b.pdf", mimeType: null, page: 2 },
        ],
        evidence: { required: false, provided: true, sourceIds: ["doc-2"] },
      }),
      ["doc-1"],
    );
    expect(out.status).toBe("success");
    expect(out.failureCode).toBeUndefined();
  });

  it("keeps existing completion metadata when evidence already failed", () => {
    const validator = new EvidenceValidator();
    const out = validator.enforceScope(
      baseResult({
        status: "partial",
        failureCode: "ALREADY_FAILED",
        completion: {
          answered: false,
          missingSlots: ["slot_a"],
          nextAction: "custom",
        },
        sources: [
          { documentId: "doc-2", filename: "b.pdf", mimeType: null, page: 2 },
        ],
        evidence: { required: true, provided: true, sourceIds: ["doc-2"] },
      }),
      ["doc-1"],
    );
    expect(out.failureCode).toBe("ALREADY_FAILED");
    expect(out.completion?.missingSlots).toEqual(["slot_a"]);
    expect(out.completion?.nextAction).toBe("custom");
  });

  it("normalizes whitespace around allowed source ids", () => {
    const validator = new EvidenceValidator();
    const out = validator.enforceScope(
      baseResult({
        sources: [
          { documentId: " doc-1 ", filename: "a.pdf", mimeType: null, page: 1 },
        ],
      }),
      [" doc-1 "],
    );
    expect(out.sources).toHaveLength(1);
    expect(out.evidence?.sourceIds).toEqual([" doc-1 "]);
  });
});
