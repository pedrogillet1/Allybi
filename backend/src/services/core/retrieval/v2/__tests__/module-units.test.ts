import { describe, expect, test } from "@jest/globals";

import { simpleTokens } from "../QueryPreparation.service";
import { compressSnippet } from "../SnippetCompression.service";
import { normalizeDocType } from "../DocumentClassification.service";
import { normalizeForNearDup } from "../Diversifier.service";
import { resolveIntentFamilyPriorityBoost } from "../Ranker.service";
import {
  computeDocLevelScores,
  isExploratoryRetrievalRequest,
  applyNonComparePurityPreRank,
} from "../EvidencePackager.service";

// ── 1. simpleTokens ─────────────────────────────────────────────────

describe("simpleTokens", () => {
  test("splits and lowercases a normal sentence", () => {
    expect(simpleTokens("Hello World! How are you?")).toEqual([
      "hello",
      "world",
      "how",
      "are",
      "you",
    ]);
  });

  test("strips smart quotes", () => {
    expect(simpleTokens("\u201Ctest\u201D")).toEqual(["test"]);
  });
});

// ── 2. compressSnippet ──────────────────────────────────────────────

describe("compressSnippet", () => {
  const baseOpts = {
    maxChars: 100,
    preserveNumericUnits: false,
    preserveHeadings: false,
    hasQuotedText: false,
    compareIntent: false,
  };

  test("short snippets are returned as-is", () => {
    const short = "This is short.";
    expect(compressSnippet(short, baseOpts)).toBe(short);
  });

  test("hasQuotedText returns snippet unmodified regardless of length", () => {
    const long = "x".repeat(200);
    expect(
      compressSnippet(long, { ...baseOpts, hasQuotedText: true }),
    ).toBe(long);
  });

  test("compareIntent gets a 1.3x budget", () => {
    // 120 chars fits within ceil(100 * 1.3) = 130 but exceeds 100
    const text = "a".repeat(120);
    const resultDefault = compressSnippet(text, baseOpts);
    const resultCompare = compressSnippet(text, {
      ...baseOpts,
      compareIntent: true,
    });
    // With compareIntent the effective max is 130, so 120 chars fits → returned as-is
    expect(resultCompare).toBe(text);
    // Without compareIntent the effective max is 100, so 120 chars is truncated
    expect(resultDefault.length).toBeLessThanOrEqual(text.length);
    expect(resultDefault).not.toBe(text);
  });
});

// ── 3. normalizeDocType ─────────────────────────────────────────────

describe("normalizeDocType", () => {
  test("trims and lowercases", () => {
    expect(normalizeDocType("  Invoice  ")).toBe("invoice");
  });

  test("returns null for null input", () => {
    expect(normalizeDocType(null)).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(normalizeDocType("")).toBeNull();
  });
});

// ── 4. normalizeForNearDup ──────────────────────────────────────────

describe("normalizeForNearDup", () => {
  test("strips punctuation, lowercases, collapses whitespace", () => {
    expect(normalizeForNearDup("Hello, World! #123")).toBe("hello world 123");
  });

  test("trims leading/trailing whitespace", () => {
    expect(normalizeForNearDup("  spaced  ")).toBe("spaced");
  });
});

// ── 5. resolveIntentFamilyPriorityBoost ─────────────────────────────

describe("resolveIntentFamilyPriorityBoost", () => {
  test("returns 0 when bank config is disabled", () => {
    expect(
      resolveIntentFamilyPriorityBoost("extraction", {
        config: { enabled: false },
        intentFamilyBasePriority: { extraction: 0.5 },
      }),
    ).toBe(0);
  });

  test("returns a value between 0 and 0.08 for a valid family", () => {
    const result = resolveIntentFamilyPriorityBoost("extraction", {
      config: { enabled: true },
      intentFamilyBasePriority: { extraction: 0.5, general: 0.3 },
    });
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThanOrEqual(0.08);
  });
});

// ── 6. computeDocLevelScores ────────────────────────────────────────

describe("computeDocLevelScores", () => {
  test("single doc with 3 chunks yields correct blended score", () => {
    const candidates = [
      {
        candidateId: "c1",
        type: "text" as const,
        source: "semantic" as const,
        docId: "doc-1",
        location: {},
        locationKey: "loc-1",
        snippet: "test",
        scores: { final: 0.9 },
        signals: {},
        provenanceOk: true,
      },
      {
        candidateId: "c2",
        type: "text" as const,
        source: "semantic" as const,
        docId: "doc-1",
        location: {},
        locationKey: "loc-2",
        snippet: "test",
        scores: { final: 0.7 },
        signals: {},
        provenanceOk: true,
      },
      {
        candidateId: "c3",
        type: "text" as const,
        source: "semantic" as const,
        docId: "doc-1",
        location: {},
        locationKey: "loc-3",
        snippet: "test",
        scores: { final: 0.5 },
        signals: {},
        provenanceOk: true,
      },
    ] as any[];

    const result = computeDocLevelScores(candidates);
    expect(result.size).toBe(1);
    // maxScore=0.9, meanTop3=(0.9+0.7+0.5)/3=0.7, result=0.9*0.7+0.7*0.3=0.84
    expect(result.get("doc-1")).toBeCloseTo(0.84, 5);
  });

  test("multiple docs each get their own score", () => {
    const candidates = [
      {
        candidateId: "c1",
        type: "text" as const,
        source: "semantic" as const,
        docId: "doc-1",
        location: {},
        locationKey: "loc-1",
        snippet: "a",
        scores: { final: 0.8 },
        signals: {},
        provenanceOk: true,
      },
      {
        candidateId: "c2",
        type: "text" as const,
        source: "semantic" as const,
        docId: "doc-2",
        location: {},
        locationKey: "loc-2",
        snippet: "b",
        scores: { final: 0.6 },
        signals: {},
        provenanceOk: true,
      },
    ] as any[];

    const result = computeDocLevelScores(candidates);
    expect(result.size).toBe(2);
    expect(result.has("doc-1")).toBe(true);
    expect(result.has("doc-2")).toBe(true);
  });
});

// ── 7. isExploratoryRetrievalRequest ────────────────────────────────

describe("isExploratoryRetrievalRequest", () => {
  const baseParams = {
    compareIntent: false,
    queryNormalized: "some query",
    signals: {
      corpusSearchAllowed: false,
      explicitDocLock: false,
      explicitDocRef: false,
      singleDocIntent: false,
      intentFamily: null,
      operator: null,
    } as any,
    classification: { confidence: 0.8, docType: "report" } as any,
    resolvedDocTypes: ["report"],
  };

  test("returns true when corpusSearchAllowed is true", () => {
    expect(
      isExploratoryRetrievalRequest({
        ...baseParams,
        signals: { ...baseParams.signals, corpusSearchAllowed: true },
      }),
    ).toBe(true);
  });

  test("returns false when explicitDocLock is true", () => {
    expect(
      isExploratoryRetrievalRequest({
        ...baseParams,
        signals: { ...baseParams.signals, explicitDocLock: true },
      }),
    ).toBe(false);
  });

  test("returns true when intentFamily is doc_discovery", () => {
    expect(
      isExploratoryRetrievalRequest({
        ...baseParams,
        signals: { ...baseParams.signals, intentFamily: "doc_discovery" },
      }),
    ).toBe(true);
  });
});

// ── 8. applyNonComparePurityPreRank ─────────────────────────────────

describe("applyNonComparePurityPreRank", () => {
  const makeCandidate = (docId: string, docType: string) =>
    ({
      candidateId: docId,
      type: "text" as const,
      source: "semantic" as const,
      docId,
      docType,
      location: {},
      locationKey: `loc-${docId}`,
      snippet: "text",
      scores: { final: 0.5 },
      signals: {},
      provenanceOk: true,
    }) as any;

  const baseParams = {
    compareIntent: false,
    classification: { confidence: 0.8, docType: "invoice" } as any,
    resolvedDocTypes: ["invoice"],
    signals: {
      corpusSearchAllowed: false,
      explicitDocLock: false,
      explicitDocRef: false,
      singleDocIntent: false,
    } as any,
    exploratoryMode: false,
  };

  test("returns all candidates when compareIntent is true (bypasses purity)", () => {
    const candidates = [
      makeCandidate("d1", "invoice"),
      makeCandidate("d2", "report"),
    ];
    const result = applyNonComparePurityPreRank(candidates, {
      ...baseParams,
      compareIntent: true,
    });
    expect(result).toHaveLength(2);
  });

  test("filters to matching doc type when confidence >= 0.6", () => {
    const candidates = [
      makeCandidate("d1", "invoice"),
      makeCandidate("d2", "report"),
      makeCandidate("d3", "Invoice"),
    ];
    const result = applyNonComparePurityPreRank(candidates, baseParams);
    // Only invoice candidates should remain (d1 and d3)
    expect(result).toHaveLength(2);
    expect(result.every((c: any) => c.docType.toLowerCase() === "invoice")).toBe(
      true,
    );
  });

  test("returns all candidates when confidence is below 0.6", () => {
    const candidates = [
      makeCandidate("d1", "invoice"),
      makeCandidate("d2", "report"),
    ];
    const result = applyNonComparePurityPreRank(candidates, {
      ...baseParams,
      classification: { confidence: 0.4, docType: "invoice" } as any,
    });
    expect(result).toHaveLength(2);
  });
});
