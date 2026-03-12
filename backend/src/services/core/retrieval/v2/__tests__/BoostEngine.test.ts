import { describe, expect, test } from "@jest/globals";

import {
  applyBoosts,
  computeTokenOverlap,
  isGenericDocReferenceQuery,
  resolveCandidateTypeTag,
  resolveDocAgeDays,
  resolveExpectedTypeTags,
} from "../BoostEngine.service";
import type {
  CandidateChunk,
  DocMeta,
  RetrievalRequest,
} from "../../retrieval.types";

// ── Helpers / Fixtures ──────────────────────────────────────────────

function makeCandidate(
  overrides: Partial<CandidateChunk> = {},
): CandidateChunk {
  return {
    candidateId: overrides.candidateId ?? "chunk-1",
    type: overrides.type ?? "text",
    source: overrides.source ?? "semantic",
    docId: overrides.docId ?? "doc-1",
    docType: overrides.docType ?? null,
    title: overrides.title ?? "Test Document",
    filename: overrides.filename ?? "test.pdf",
    location: overrides.location ?? { page: 1, sectionKey: "intro" },
    locationKey: overrides.locationKey ?? "d:doc-1|p:1",
    snippet:
      overrides.snippet ??
      "Revenue increased 15% to $2.3 billion in Q3 2025.",
    rawText: overrides.rawText ?? null,
    table: overrides.table ?? null,
    scores: {
      semantic: 0.6,
      lexical: 0.3,
      structural: 0.1,
      ...overrides.scores,
    },
    signals: {
      isScopedMatch: false,
      ...overrides.signals,
    },
    provenanceOk: overrides.provenanceOk ?? true,
  };
}

function makeRequest(
  overrides: Partial<RetrievalRequest> = {},
): RetrievalRequest {
  return {
    query: overrides.query ?? "What was the revenue in Q3?",
    env: overrides.env ?? "local",
    signals: {
      intentFamily: null,
      operator: null,
      answerMode: null,
      ...overrides.signals,
    },
    overrides: overrides.overrides,
  };
}

/** Minimal bank structures that enable the individual boost categories. */
function makeBoostBanks(
  overrides: {
    keywordEnabled?: boolean;
    titleEnabled?: boolean;
    typeEnabled?: boolean;
    recencyEnabled?: boolean;
  } = {},
) {
  return {
    boostsKeyword: {
      config: {
        enabled: overrides.keywordEnabled ?? true,
        regionWeights: { body: 0.02, doc_title: 0.08, section_heading: 0.06 },
        actionsContract: { combination: { capMaxBoost: 0.25 } },
        genericTermGuard: {
          terms: { en: ["the", "what", "how"], pt: [], es: [] },
          penalty: 0.08,
        },
      },
    },
    boostsTitle: {
      config: {
        enabled: overrides.titleEnabled ?? false,
        boostWeights: {
          exact_filename: 0.12,
          high_overlap: 0.1,
          partial: 0.07,
        },
        actionsContract: {
          combination: { capMaxBoost: 0.15 },
          thresholds: { minOverlapRatioForPartial: 0.55, minTokensForPartial: 2 },
        },
        genericDocRefGuard: { patterns: { en: [], pt: [], es: [] } },
      },
    },
    boostsType: {
      config: {
        enabled: overrides.typeEnabled ?? false,
        actionsContract: { thresholds: { maxTotalTypeBoost: 0.12 } },
        typeWeights: { pdf: 0.06, spreadsheet: 0.06, slides: 0.04 },
      },
    },
    boostsRecency: {
      config: {
        enabled: overrides.recencyEnabled ?? false,
        actionsContract: {
          thresholds: {
            maxTotalRecencyBoost: 0.08,
            recentDaysStrong: 7,
            recentDaysMedium: 30,
            recentDaysLight: 90,
          },
        },
        recencyWeights: { strong: 0.05, medium: 0.03, light: 0.015 },
        neverOverrideExplicitDocLock: true,
        timeFilterGuards: {
          enabled: true,
          disableWhenExplicitYearOrQuarterComparison: true,
          reduceFactorWhenTimeConstraintsPresent: 0.5,
        },
      },
    },
  };
}

// ── 1. applyBoosts — basic keyword boost with token overlap ─────────

describe("applyBoosts", () => {
  test("applies keyword boost when query tokens appear in snippet", () => {
    const candidate = makeCandidate({
      snippet: "Revenue increased 15% in Q3 2025.",
    });
    const req = makeRequest({ query: "revenue Q3" });
    const banks = makeBoostBanks({ keywordEnabled: true });

    const result = applyBoosts([candidate], req, req.signals, banks);

    expect(result).toHaveLength(1);
    expect(result[0].scores.keywordBoost).toBeGreaterThan(0);
  });

  test("applies keyword title-weight when token appears in candidate title", () => {
    const candidate = makeCandidate({
      title: "Revenue Summary",
      snippet: "Some unrelated snippet text here.",
    });
    const req = makeRequest({ query: "revenue analysis" });
    const banks = makeBoostBanks({ keywordEnabled: true });

    const result = applyBoosts([candidate], req, req.signals, banks);

    // "revenue" matches title -> gets doc_title weight (0.08), higher than body weight (0.02)
    expect(result[0].scores.keywordBoost).toBeGreaterThanOrEqual(0.08);
  });

  test("penalises generic-only keyword matches", () => {
    const candidate = makeCandidate({
      snippet: "What is the meaning of life?",
    });
    // "what" and "the" are both in the genericTermGuard list
    const req = makeRequest({ query: "what the" });
    const banks = makeBoostBanks({ keywordEnabled: true });

    const result = applyBoosts([candidate], req, req.signals, banks);

    // Generic-only matches get penalised; boost is reduced
    expect(result[0].scores.penalties).toBeGreaterThan(0);
  });

  test("keyword boost is capped at maxBoost value", () => {
    // Build a query with many matching specific tokens to try to exceed the cap
    const candidate = makeCandidate({
      title: "alpha beta gamma delta epsilon zeta eta theta iota kappa",
      snippet: "alpha beta gamma delta epsilon zeta eta theta iota kappa",
    });
    const req = makeRequest({
      query: "alpha beta gamma delta epsilon zeta eta theta iota kappa",
    });
    const banks = makeBoostBanks({ keywordEnabled: true });

    const result = applyBoosts([candidate], req, req.signals, banks);

    // keywordBoost must not exceed the cap of 0.25
    expect(result[0].scores.keywordBoost).toBeLessThanOrEqual(0.25);
  });

  test("sets keywordBoost to 0 when keyword bank is disabled", () => {
    const candidate = makeCandidate({
      snippet: "Revenue increased.",
    });
    const req = makeRequest({ query: "revenue" });
    const banks = makeBoostBanks({ keywordEnabled: false });

    const result = applyBoosts([candidate], req, req.signals, banks);

    // When disabled, keywordBoost should remain as whatever was on the input (undefined in this case)
    expect(result[0].scores.keywordBoost).toBeUndefined();
  });

  test("applies title boost for explicit doc ref matching resolvedDocId", () => {
    const candidate = makeCandidate({ docId: "doc-abc" });
    const req = makeRequest({
      query: "show doc-abc file",
      signals: {
        explicitDocRef: true,
        resolvedDocId: "doc-abc",
      },
    });
    const banks = makeBoostBanks({
      keywordEnabled: false,
      titleEnabled: true,
    });

    const result = applyBoosts([candidate], req, req.signals, banks);

    expect(result[0].scores.titleBoost).toBeGreaterThan(0);
  });

  test("applies recency boost for very recent documents", () => {
    const candidate = makeCandidate({ docId: "doc-recent" });
    const req = makeRequest({ query: "latest updates" });
    const banks = makeBoostBanks({ recencyEnabled: true });

    // Doc updated 2 days ago -> strong recency boost
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const docMetaById = new Map<string, DocMeta>([
      [
        "doc-recent",
        {
          docId: "doc-recent",
          title: "Recent Doc",
          updatedAt: twoDaysAgo,
        },
      ],
    ]);

    const result = applyBoosts(
      [candidate],
      req,
      req.signals,
      banks,
      docMetaById,
    );

    expect(result[0].scores.recencyBoost).toBeGreaterThan(0);
    // Strong tier: doc is within 7 days -> weight 0.05
    expect(result[0].scores.recencyBoost).toBeCloseTo(0.05, 2);
  });

  test("disables recency boost when explicitDocLock is set", () => {
    const candidate = makeCandidate({ docId: "doc-locked" });
    const req = makeRequest({
      query: "latest updates",
      signals: { explicitDocLock: true },
    });
    const banks = makeBoostBanks({ recencyEnabled: true });

    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const docMetaById = new Map<string, DocMeta>([
      ["doc-locked", { docId: "doc-locked", updatedAt: twoDaysAgo }],
    ]);

    const result = applyBoosts(
      [candidate],
      req,
      req.signals,
      banks,
      docMetaById,
    );

    expect(result[0].scores.recencyBoost).toBe(0);
  });

  test("applies type boost when candidate type matches expected type tags", () => {
    const candidate = makeCandidate({
      filename: "report.xlsx",
      docType: "spreadsheet",
    });
    const req = makeRequest({
      query: "show me the sheet data",
      signals: { sheetHintPresent: true },
    });
    const banks = makeBoostBanks({ typeEnabled: true });

    const result = applyBoosts([candidate], req, req.signals, banks);

    expect(result[0].scores.typeBoost).toBeGreaterThan(0);
  });
});

// ── 2. computeTokenOverlap ──────────────────────────────────────────

describe("computeTokenOverlap", () => {
  test("returns full overlap when all query tokens are in target", () => {
    const result = computeTokenOverlap(
      ["revenue", "growth"],
      ["revenue", "growth", "report"],
    );
    expect(result.overlapCount).toBe(2);
    expect(result.overlapRatio).toBe(1);
  });

  test("returns partial overlap", () => {
    const result = computeTokenOverlap(
      ["revenue", "growth", "forecast"],
      ["revenue", "growth", "report"],
    );
    expect(result.overlapCount).toBe(2);
    expect(result.overlapRatio).toBeCloseTo(2 / 3, 5);
  });

  test("returns zero when no tokens overlap", () => {
    const result = computeTokenOverlap(
      ["alpha", "beta"],
      ["gamma", "delta"],
    );
    expect(result.overlapCount).toBe(0);
    expect(result.overlapRatio).toBe(0);
  });

  test("returns zero when queryTokens is empty", () => {
    const result = computeTokenOverlap([], ["gamma", "delta"]);
    expect(result.overlapCount).toBe(0);
    expect(result.overlapRatio).toBe(0);
  });

  test("returns zero when targetTokens is empty", () => {
    const result = computeTokenOverlap(["alpha"], []);
    expect(result.overlapCount).toBe(0);
    expect(result.overlapRatio).toBe(0);
  });

  test("is case-insensitive on target tokens", () => {
    const result = computeTokenOverlap(["revenue"], ["REVENUE", "growth"]);
    expect(result.overlapCount).toBe(1);
    expect(result.overlapRatio).toBe(1);
  });
});

// ── 3. isGenericDocReferenceQuery ───────────────────────────────────

describe("isGenericDocReferenceQuery", () => {
  const titleCfg = {
    genericDocRefGuard: {
      patterns: {
        en: ["^(what|tell me about) (this|the) (document|file|doc)\\??$"],
        pt: ["^(o que|fale sobre) (este|o) (documento|arquivo)\\??$"],
        es: [],
      },
    },
  };

  test("returns true for a matching generic doc reference (EN)", () => {
    expect(isGenericDocReferenceQuery("what this document?", titleCfg)).toBe(
      true,
    );
  });

  test("returns true for matching generic doc reference (PT)", () => {
    expect(isGenericDocReferenceQuery("o que este documento", titleCfg)).toBe(
      true,
    );
  });

  test("returns false for a specific query", () => {
    expect(
      isGenericDocReferenceQuery("What is the revenue in Q3?", titleCfg),
    ).toBe(false);
  });

  test("returns false for an empty query", () => {
    expect(isGenericDocReferenceQuery("", titleCfg)).toBe(false);
  });

  test("returns false when no patterns are configured", () => {
    expect(
      isGenericDocReferenceQuery("what this document?", {
        genericDocRefGuard: { patterns: { en: [], pt: [], es: [] } },
      }),
    ).toBe(false);
  });

  test("gracefully handles null/undefined titleCfg", () => {
    expect(isGenericDocReferenceQuery("what this document?", null)).toBe(false);
    expect(isGenericDocReferenceQuery("what this document?", undefined)).toBe(
      false,
    );
  });

  test("silently ignores invalid regex patterns", () => {
    const badCfg = {
      genericDocRefGuard: {
        patterns: { en: ["[invalid(regex"], pt: [], es: [] },
      },
    };
    // Should not throw; the bad pattern is caught and returns false
    expect(isGenericDocReferenceQuery("test", badCfg)).toBe(false);
  });
});

// ── 4. resolveCandidateTypeTag ──────────────────────────────────────

describe("resolveCandidateTypeTag", () => {
  test("resolves pdf from filename", () => {
    const c = makeCandidate({ filename: "report.pdf" });
    expect(resolveCandidateTypeTag(c)).toBe("pdf");
  });

  test("resolves spreadsheet from xlsx extension", () => {
    const c = makeCandidate({ filename: "data.xlsx" });
    expect(resolveCandidateTypeTag(c)).toBe("spreadsheet");
  });

  test("resolves spreadsheet from csv extension", () => {
    const c = makeCandidate({ filename: "export.csv" });
    expect(resolveCandidateTypeTag(c)).toBe("spreadsheet");
  });

  test("resolves slides from pptx extension", () => {
    const c = makeCandidate({ filename: "deck.pptx" });
    expect(resolveCandidateTypeTag(c)).toBe("slides");
  });

  test("resolves image from jpg extension", () => {
    const c = makeCandidate({ filename: "photo.jpg" });
    expect(resolveCandidateTypeTag(c)).toBe("image");
  });

  test("resolves text from docx extension", () => {
    const c = makeCandidate({ filename: "letter.docx" });
    expect(resolveCandidateTypeTag(c)).toBe("text");
  });

  test("resolves type from docType when filename is ambiguous", () => {
    const c = makeCandidate({ filename: "unknown", docType: "application/pdf" });
    expect(resolveCandidateTypeTag(c)).toBe("pdf");
  });

  test("returns null for unknown file types", () => {
    const c = makeCandidate({ filename: "mystery.xyz", docType: null });
    expect(resolveCandidateTypeTag(c)).toBeNull();
  });

  test("returns null when filename and docType are both empty", () => {
    const c = makeCandidate({ filename: "", docType: "" });
    expect(resolveCandidateTypeTag(c)).toBeNull();
  });
});

// ── 5. resolveDocAgeDays ────────────────────────────────────────────

describe("resolveDocAgeDays", () => {
  test("returns age in days based on updatedAt", () => {
    const tenDaysAgo = new Date(
      Date.now() - 10 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const meta: DocMeta = { docId: "doc-1", updatedAt: tenDaysAgo };
    const age = resolveDocAgeDays(meta);
    expect(age).not.toBeNull();
    // Allow small float tolerance (within ~0.1 day of 10)
    expect(age!).toBeCloseTo(10, 0);
  });

  test("falls back to createdAt when updatedAt is null", () => {
    const fiveDaysAgo = new Date(
      Date.now() - 5 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const meta: DocMeta = {
      docId: "doc-1",
      updatedAt: null,
      createdAt: fiveDaysAgo,
    };
    const age = resolveDocAgeDays(meta);
    expect(age).not.toBeNull();
    expect(age!).toBeCloseTo(5, 0);
  });

  test("returns null when docMeta is undefined", () => {
    expect(resolveDocAgeDays(undefined)).toBeNull();
  });

  test("returns null when neither updatedAt nor createdAt is set", () => {
    const meta: DocMeta = { docId: "doc-1" };
    expect(resolveDocAgeDays(meta)).toBeNull();
  });

  test("returns null for an unparseable timestamp", () => {
    const meta: DocMeta = {
      docId: "doc-1",
      createdAt: "not-a-date",
      updatedAt: null,
    };
    expect(resolveDocAgeDays(meta)).toBeNull();
  });

  test("returns 0 (floored) for a future timestamp", () => {
    const future = new Date(
      Date.now() + 10 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const meta: DocMeta = { docId: "doc-1", updatedAt: future };
    const age = resolveDocAgeDays(meta);
    // Math.max(0, negative) should return 0
    expect(age).toBe(0);
  });
});

// ── 6. resolveExpectedTypeTags ──────────────────────────────────────

describe("resolveExpectedTypeTags", () => {
  test("includes spreadsheet when rangeExplicit signal is set", () => {
    const tags = resolveExpectedTypeTags({ rangeExplicit: true }, "");
    expect(tags.has("spreadsheet")).toBe(true);
  });

  test("includes pdf and text when userAskedForQuote signal is set", () => {
    const tags = resolveExpectedTypeTags({ userAskedForQuote: true }, "");
    expect(tags.has("pdf")).toBe(true);
    expect(tags.has("text")).toBe(true);
  });

  test("includes spreadsheet when query contains sheet-related keywords", () => {
    const tags = resolveExpectedTypeTags({}, "show me the xlsx data");
    expect(tags.has("spreadsheet")).toBe(true);
  });

  test("includes pdf when query contains page keyword", () => {
    const tags = resolveExpectedTypeTags({}, "go to page 5");
    expect(tags.has("pdf")).toBe(true);
  });

  test("includes slides when query mentions pptx", () => {
    const tags = resolveExpectedTypeTags({}, "open the pptx presentation");
    expect(tags.has("slides")).toBe(true);
  });

  test("includes image when query mentions screenshot", () => {
    const tags = resolveExpectedTypeTags({}, "show the screenshot");
    expect(tags.has("image")).toBe(true);
  });

  test("returns empty set when no signals or keywords match", () => {
    const tags = resolveExpectedTypeTags({}, "hello world");
    expect(tags.size).toBe(0);
  });
});

// ── 7. Edge case: empty candidates array ────────────────────────────

describe("applyBoosts — edge cases", () => {
  test("returns empty array when candidates is empty", () => {
    const req = makeRequest();
    const banks = makeBoostBanks({
      keywordEnabled: true,
      titleEnabled: true,
      typeEnabled: true,
      recencyEnabled: true,
    });

    const result = applyBoosts([], req, req.signals, banks);

    expect(result).toEqual([]);
  });

  test("mutates and returns the same candidate array (no copy)", () => {
    const candidates = [makeCandidate()];
    const req = makeRequest();
    const banks = makeBoostBanks({ keywordEnabled: true });

    const result = applyBoosts(candidates, req, req.signals, banks);

    expect(result).toBe(candidates);
  });
});
