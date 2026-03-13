import { describe, expect, test } from "@jest/globals";

import {
  shouldEnforceScopedDocSet,
  resolveExplicitDocIds,
  resolveExplicitDocTypes,
  isDocLockActive,
} from "../ScopeResolver.service";

import type { RetrievalRequest, RetrievalScope } from "../../retrieval.types";

// ── Helpers ─────────────────────────────────────────────────────────

type Signals = RetrievalRequest["signals"];

function makeSignals(overrides: Partial<Signals> = {}): Signals {
  return {
    intentFamily: null,
    operator: null,
    answerMode: null,
    docScopeLock: null,
    allowedDocumentIds: null,
    explicitDocLock: false,
    activeDocId: null,
    explicitDocRef: false,
    resolvedDocId: null,
    hardScopeActive: false,
    singleDocIntent: false,
    allowExpansion: false,
    hasQuotedText: false,
    hasFilename: false,
    userAskedForTable: false,
    userAskedForQuote: false,
    corpusSearchAllowed: false,
    explicitDocIds: null,
    explicitDocTypes: null,
    explicitDocDomains: null,
    ...overrides,
  };
}

function makeScope(
  overrides: Partial<RetrievalScope> = {},
): RetrievalScope {
  return {
    candidateDocIds: overrides.candidateDocIds ?? ["doc-1"],
    hardScopeActive: overrides.hardScopeActive ?? true,
    sheetName: overrides.sheetName ?? null,
    rangeA1: overrides.rangeA1 ?? null,
  };
}

// ── shouldEnforceScopedDocSet ───────────────────────────────────────

describe("shouldEnforceScopedDocSet", () => {
  test("returns true when hardScopeActive and candidate docs exist", () => {
    const scope = makeScope({
      hardScopeActive: true,
      candidateDocIds: ["doc-1", "doc-2"],
    });
    const signals = makeSignals();

    expect(shouldEnforceScopedDocSet(scope, signals)).toBe(true);
  });

  test("returns false when hardScopeActive is false", () => {
    const scope = makeScope({
      hardScopeActive: false,
      candidateDocIds: ["doc-1"],
    });
    const signals = makeSignals();

    expect(shouldEnforceScopedDocSet(scope, signals)).toBe(false);
  });

  test("returns false when candidateDocIds is empty", () => {
    const scope = makeScope({
      hardScopeActive: true,
      candidateDocIds: [],
    });
    const signals = makeSignals();

    expect(shouldEnforceScopedDocSet(scope, signals)).toBe(false);
  });

  test("returns false for doc_discovery intentFamily", () => {
    const scope = makeScope({
      hardScopeActive: true,
      candidateDocIds: ["doc-1"],
    });
    const signals = makeSignals({ intentFamily: "doc_discovery" });

    expect(shouldEnforceScopedDocSet(scope, signals)).toBe(false);
  });

  test("returns false when corpusSearchAllowed is true", () => {
    const scope = makeScope({
      hardScopeActive: true,
      candidateDocIds: ["doc-1"],
    });
    const signals = makeSignals({ corpusSearchAllowed: true });

    expect(shouldEnforceScopedDocSet(scope, signals)).toBe(false);
  });

  test("returns false when both discovery flags are set", () => {
    const scope = makeScope({
      hardScopeActive: true,
      candidateDocIds: ["doc-1"],
    });
    const signals = makeSignals({
      intentFamily: "doc_discovery",
      corpusSearchAllowed: true,
    });

    expect(shouldEnforceScopedDocSet(scope, signals)).toBe(false);
  });

  test("returns true for non-discovery intentFamily with hard scope", () => {
    const scope = makeScope({
      hardScopeActive: true,
      candidateDocIds: ["doc-1"],
    });
    const signals = makeSignals({ intentFamily: "doc_qa" });

    expect(shouldEnforceScopedDocSet(scope, signals)).toBe(true);
  });

  test("handles single-element candidateDocIds", () => {
    const scope = makeScope({
      hardScopeActive: true,
      candidateDocIds: ["only-doc"],
    });
    const signals = makeSignals();

    expect(shouldEnforceScopedDocSet(scope, signals)).toBe(true);
  });
});

// ── resolveExplicitDocIds ───────────────────────────────────────────

describe("resolveExplicitDocIds", () => {
  test("returns empty array when no explicit doc signals present", () => {
    const signals = makeSignals();

    const result = resolveExplicitDocIds(signals);

    expect(result).toEqual([]);
  });

  test("extracts from explicitDocIds signal", () => {
    const signals = makeSignals({
      explicitDocIds: ["doc-a", "doc-b"],
    });

    const result = resolveExplicitDocIds(signals);

    expect(result).toContain("doc-a");
    expect(result).toContain("doc-b");
  });

  test("extracts from allowedDocumentIds signal", () => {
    const signals = makeSignals({
      allowedDocumentIds: ["doc-x", "doc-y"],
    });

    const result = resolveExplicitDocIds(signals);

    expect(result).toContain("doc-x");
    expect(result).toContain("doc-y");
  });

  test("extracts from resolvedDocId signal", () => {
    const signals = makeSignals({
      resolvedDocId: "resolved-123",
    });

    const result = resolveExplicitDocIds(signals);

    expect(result).toContain("resolved-123");
  });

  test("extracts from activeDocId signal", () => {
    const signals = makeSignals({
      activeDocId: "active-456",
    });

    const result = resolveExplicitDocIds(signals);

    expect(result).toContain("active-456");
  });

  test("extracts from docScopeLock.allowedDocumentIds", () => {
    const signals = makeSignals({
      docScopeLock: {
        mode: "docset",
        allowedDocumentIds: ["lock-1", "lock-2"],
        source: "attachments",
      },
    });

    const result = resolveExplicitDocIds(signals);

    expect(result).toContain("lock-1");
    expect(result).toContain("lock-2");
  });

  test("deduplicates across all signal sources", () => {
    const signals = makeSignals({
      explicitDocIds: ["doc-shared"],
      allowedDocumentIds: ["doc-shared"],
      resolvedDocId: "doc-shared",
      activeDocId: "doc-shared",
    });

    const result = resolveExplicitDocIds(signals);

    expect(result).toEqual(["doc-shared"]);
  });

  test("merges all sources and deduplicates", () => {
    const signals = makeSignals({
      explicitDocIds: ["doc-a"],
      allowedDocumentIds: ["doc-b"],
      resolvedDocId: "doc-c",
      activeDocId: "doc-a",
      docScopeLock: {
        mode: "docset",
        allowedDocumentIds: ["doc-d", "doc-b"],
        source: "system",
      },
    });

    const result = resolveExplicitDocIds(signals);

    expect(result).toHaveLength(4);
    expect(new Set(result)).toEqual(
      new Set(["doc-a", "doc-b", "doc-c", "doc-d"]),
    );
  });

  test("trims whitespace from doc IDs", () => {
    const signals = makeSignals({
      explicitDocIds: ["  doc-space  "],
    });

    const result = resolveExplicitDocIds(signals);

    expect(result).toContain("doc-space");
  });

  test("filters out empty string doc IDs", () => {
    const signals = makeSignals({
      explicitDocIds: ["", "  ", "valid-doc"],
    });

    const result = resolveExplicitDocIds(signals);

    expect(result).toEqual(["valid-doc"]);
  });

  test("handles null explicitDocIds gracefully", () => {
    const signals = makeSignals({
      explicitDocIds: null,
      allowedDocumentIds: null,
      resolvedDocId: null,
      activeDocId: null,
    });

    const result = resolveExplicitDocIds(signals);

    expect(result).toEqual([]);
  });

  test("handles undefined signal fields gracefully", () => {
    const signals = makeSignals({
      explicitDocIds: undefined,
      allowedDocumentIds: undefined,
      resolvedDocId: undefined,
      activeDocId: undefined,
    });

    const result = resolveExplicitDocIds(signals);

    expect(result).toEqual([]);
  });
});

// ── resolveExplicitDocTypes ─────────────────────────────────────────

describe("resolveExplicitDocTypes", () => {
  const identityNormalizer = (value: unknown): string | null => {
    const s = String(value || "").trim().toLowerCase();
    return s || null;
  };

  test("returns empty array when explicitDocTypes is absent", () => {
    const signals = makeSignals({ explicitDocTypes: null });

    const result = resolveExplicitDocTypes(signals, identityNormalizer);

    expect(result).toEqual([]);
  });

  test("returns empty array when explicitDocTypes is undefined", () => {
    const signals = makeSignals({ explicitDocTypes: undefined });

    const result = resolveExplicitDocTypes(signals, identityNormalizer);

    expect(result).toEqual([]);
  });

  test("returns empty array when explicitDocTypes is empty", () => {
    const signals = makeSignals({ explicitDocTypes: [] });

    const result = resolveExplicitDocTypes(signals, identityNormalizer);

    expect(result).toEqual([]);
  });

  test("normalizes and returns doc types", () => {
    const signals = makeSignals({
      explicitDocTypes: ["Invoice", "CONTRACT"],
    });

    const result = resolveExplicitDocTypes(signals, identityNormalizer);

    expect(result).toEqual(["invoice", "contract"]);
  });

  test("deduplicates after normalization", () => {
    const signals = makeSignals({
      explicitDocTypes: ["Invoice", "INVOICE", "invoice"],
    });

    const result = resolveExplicitDocTypes(signals, identityNormalizer);

    expect(result).toEqual(["invoice"]);
  });

  test("filters out values that normalize to null", () => {
    const selectiveNormalizer = (value: unknown): string | null => {
      const s = String(value || "").trim().toLowerCase();
      if (s === "unknown") return null;
      return s || null;
    };

    const signals = makeSignals({
      explicitDocTypes: ["invoice", "unknown", "contract"],
    });

    const result = resolveExplicitDocTypes(signals, selectiveNormalizer);

    expect(result).toEqual(["invoice", "contract"]);
  });

  test("uses the provided normalizer function", () => {
    const uppercaseNormalizer = (value: unknown): string | null => {
      const s = String(value || "").trim().toUpperCase();
      return s || null;
    };

    const signals = makeSignals({
      explicitDocTypes: ["invoice"],
    });

    const result = resolveExplicitDocTypes(signals, uppercaseNormalizer);

    expect(result).toEqual(["INVOICE"]);
  });
});

// ── isDocLockActive ─────────────────────────────────────────────────

describe("isDocLockActive", () => {
  test("returns false with no lock signals", () => {
    const signals = makeSignals();

    expect(isDocLockActive(signals)).toBe(false);
  });

  test("returns true with docScopeLock in single_doc mode", () => {
    const signals = makeSignals({
      docScopeLock: {
        mode: "single_doc",
        allowedDocumentIds: ["doc-1"],
        activeDocumentId: "doc-1",
        source: "attachments",
      },
    });

    expect(isDocLockActive(signals)).toBe(true);
  });

  test("returns true with docScopeLock in docset mode", () => {
    const signals = makeSignals({
      docScopeLock: {
        mode: "docset",
        allowedDocumentIds: ["doc-1", "doc-2"],
        source: "system",
      },
    });

    expect(isDocLockActive(signals)).toBe(true);
  });

  test("returns false with docScopeLock in none mode and no legacy flags", () => {
    const signals = makeSignals({
      docScopeLock: {
        mode: "none",
        allowedDocumentIds: [],
        source: "system",
      },
    });

    expect(isDocLockActive(signals)).toBe(false);
  });

  test("returns true with explicitDocLock legacy flag", () => {
    const signals = makeSignals({
      explicitDocLock: true,
      activeDocId: "doc-1",
    });

    // explicitDocLock + activeDocId triggers single_doc via resolveDocScopeLockFromSignals
    expect(isDocLockActive(signals)).toBe(true);
  });

  test("returns true with explicitDocRef legacy flag", () => {
    const signals = makeSignals({
      explicitDocRef: true,
      resolvedDocId: "doc-ref-1",
    });

    expect(isDocLockActive(signals)).toBe(true);
  });

  test("returns true with explicitDocRef even if resolvedDocId is absent", () => {
    // explicitDocRef boolean is checked directly in isDocLockActive
    const signals = makeSignals({
      explicitDocRef: true,
      resolvedDocId: null,
    });

    // explicitDocRef is true, which triggers the boolean OR check
    expect(isDocLockActive(signals)).toBe(true);
  });

  test("returns true with allowedDocumentIds array (triggers docset via lock resolution)", () => {
    const signals = makeSignals({
      allowedDocumentIds: ["doc-1", "doc-2"],
    });

    expect(isDocLockActive(signals)).toBe(true);
  });

  test("returns true with singleDocIntent and activeDocId", () => {
    const signals = makeSignals({
      singleDocIntent: true,
      activeDocId: "doc-1",
    });

    expect(isDocLockActive(signals)).toBe(true);
  });

  test("returns false with singleDocIntent but no activeDocId", () => {
    const signals = makeSignals({
      singleDocIntent: true,
      activeDocId: null,
    });

    // singleDocIntent without activeDocId resolves to mode:"none"
    // and singleDocIntent/explicitDocLock/explicitDocRef are all falsy or not enough
    expect(isDocLockActive(signals)).toBe(false);
  });
});
