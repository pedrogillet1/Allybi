import { describe, expect, test } from "@jest/globals";

import { resolveDocScopeLockFromSignals } from "./docScopeLock";

describe("resolveDocScopeLockFromSignals", () => {
  test("explicit doc reference overrides broad allowedDocumentIds", () => {
    const result = resolveDocScopeLockFromSignals({
      allowedDocumentIds: ["doc-a", "doc-b", "doc-c"],
      explicitDocRef: true,
      resolvedDocId: "doc-b",
    });

    expect(result).toEqual({
      mode: "single_doc",
      allowedDocumentIds: ["doc-b"],
      activeDocumentId: "doc-b",
      source: "user_explicit",
    });
  });

  test("falls back to docset when no explicit reference is resolved", () => {
    const result = resolveDocScopeLockFromSignals({
      allowedDocumentIds: ["doc-a", "doc-b"],
      explicitDocRef: true,
      resolvedDocId: "",
    });

    expect(result).toEqual({
      mode: "docset",
      allowedDocumentIds: ["doc-a", "doc-b"],
      source: "system",
    });
  });
});
