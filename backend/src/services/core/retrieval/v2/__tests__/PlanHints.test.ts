import { describe, expect, test } from "@jest/globals";

import {
  normalizePlanHintTerms,
  applyRetrievalPlanHints,
  buildSearchableTextForPlannerHint,
  matchesPlannerLocationTarget,
} from "../PlanHints.service";
import type { CandidateChunk } from "../../retrieval.types";

// ── Helpers ─────────────────────────────────────────────────────────

function makeCandidate(
  overrides: Partial<CandidateChunk> = {},
): CandidateChunk {
  return {
    candidateId: overrides.candidateId ?? "chunk-1",
    type: overrides.type ?? "text",
    source: overrides.source ?? "semantic",
    docId: overrides.docId ?? "doc-1",
    docType: overrides.docType ?? "pdf",
    title: overrides.title ?? "Quarterly Report",
    filename: overrides.filename ?? "report.pdf",
    location: overrides.location ?? {
      page: 3,
      sheet: null,
      slide: null,
      sectionKey: "revenue-analysis",
    },
    locationKey: overrides.locationKey ?? "d:doc-1|p:3",
    snippet:
      overrides.snippet ??
      "Total revenue for Q3 was $12.5M, representing a 15% increase year-over-year.",
    rawText: overrides.rawText ?? null,
    table: overrides.table ?? null,
    scores: {
      semantic: 0.6,
      lexical: 0.3,
      structural: 0.1,
      ...overrides.scores,
    },
    signals: { ...overrides.signals },
    provenanceOk: overrides.provenanceOk ?? true,
  };
}

// ── normalizePlanHintTerms ──────────────────────────────────────────

describe("normalizePlanHintTerms", () => {
  test("returns empty array for non-array input", () => {
    expect(normalizePlanHintTerms(null, 10)).toEqual([]);
    expect(normalizePlanHintTerms(undefined, 10)).toEqual([]);
    expect(normalizePlanHintTerms("not-an-array", 10)).toEqual([]);
    expect(normalizePlanHintTerms(42, 10)).toEqual([]);
  });

  test("returns empty array for empty array", () => {
    expect(normalizePlanHintTerms([], 10)).toEqual([]);
  });

  test("lowercases and trims values", () => {
    const result = normalizePlanHintTerms(["  Revenue  ", "PROFIT"], 10);
    expect(result).toEqual(["revenue", "profit"]);
  });

  test("deduplicates case-insensitively", () => {
    const result = normalizePlanHintTerms(
      ["Revenue", "revenue", "REVENUE"],
      10,
    );
    expect(result).toEqual(["revenue"]);
  });

  test("skips empty and whitespace-only entries", () => {
    const result = normalizePlanHintTerms(["", "  ", "valid", null], 10);
    expect(result).toEqual(["valid"]);
  });

  test("caps output at maxItems", () => {
    const result = normalizePlanHintTerms(
      ["a", "b", "c", "d", "e", "f"],
      3,
    );
    expect(result).toEqual(["a", "b", "c"]);
    expect(result).toHaveLength(3);
  });

  test("maxItems=1 returns only the first valid item", () => {
    const result = normalizePlanHintTerms(["first", "second"], 1);
    expect(result).toEqual(["first"]);
  });

  test("converts non-string values via String()", () => {
    const result = normalizePlanHintTerms([123, true, "text"], 10);
    expect(result).toEqual(["123", "true", "text"]);
  });
});

// ── buildSearchableTextForPlannerHint ───────────────────────────────

describe("buildSearchableTextForPlannerHint", () => {
  test("includes snippet, title, filename, docType, and location fields", () => {
    const candidate = makeCandidate({
      snippet: "Revenue was $10M",
      title: "Annual Report",
      filename: "annual-report.xlsx",
      docType: "spreadsheet",
      location: {
        page: 5,
        sheet: "Financials",
        sectionKey: "income-statement",
        slide: null,
      },
    });
    const text = buildSearchableTextForPlannerHint(candidate);
    expect(text).toContain("revenue was $10m");
    expect(text).toContain("annual report");
    expect(text).toContain("annual-report.xlsx");
    expect(text).toContain("spreadsheet");
    expect(text).toContain("income-statement");
    expect(text).toContain("financials");
    expect(text).toContain("page 5");
  });

  test("includes rawText when present", () => {
    const candidate = makeCandidate({
      rawText: "Some raw text data",
    });
    const text = buildSearchableTextForPlannerHint(candidate);
    expect(text).toContain("some raw text data");
  });

  test("includes slide reference when present", () => {
    const candidate = makeCandidate({
      location: { slide: 7, page: null, sheet: null, sectionKey: null },
    });
    const text = buildSearchableTextForPlannerHint(candidate);
    expect(text).toContain("slide 7");
  });

  test("omits null/undefined fields gracefully", () => {
    const candidate = makeCandidate({
      rawText: null,
      docType: null,
      location: { page: null, sheet: null, slide: null, sectionKey: null },
    });
    const text = buildSearchableTextForPlannerHint(candidate);
    // Should not contain "null" or "undefined" as literal strings
    expect(text).not.toContain("null");
    expect(text).not.toContain("undefined");
  });

  test("all text is lowercased", () => {
    const candidate = makeCandidate({
      snippet: "UPPER CASE TEXT",
      title: "Title Case",
    });
    const text = buildSearchableTextForPlannerHint(candidate);
    expect(text).toBe(text.toLowerCase());
  });
});

// ── matchesPlannerLocationTarget ────────────────────────────────────

describe("matchesPlannerLocationTarget", () => {
  test("returns false for empty target value", () => {
    const candidate = makeCandidate({
      location: { sheet: "Sheet1" },
    });
    expect(
      matchesPlannerLocationTarget(candidate, { type: "sheet", value: "" }),
    ).toBe(false);
  });

  test("matches sheet type (case-insensitive, substring)", () => {
    const candidate = makeCandidate({
      location: { sheet: "Financial Summary", page: null, slide: null, sectionKey: null },
    });
    expect(
      matchesPlannerLocationTarget(candidate, {
        type: "sheet",
        value: "financial",
      }),
    ).toBe(true);
  });

  test("does not match sheet when sheet is different", () => {
    const candidate = makeCandidate({
      location: { sheet: "Revenue", page: null, slide: null, sectionKey: null },
    });
    expect(
      matchesPlannerLocationTarget(candidate, {
        type: "sheet",
        value: "expenses",
      }),
    ).toBe(false);
  });

  test("matches section type (case-insensitive, substring)", () => {
    const candidate = makeCandidate({
      location: { sectionKey: "executive-summary", page: null, sheet: null, slide: null },
    });
    expect(
      matchesPlannerLocationTarget(candidate, {
        type: "section",
        value: "executive",
      }),
    ).toBe(true);
  });

  test("does not match section when sectionKey is different", () => {
    const candidate = makeCandidate({
      location: { sectionKey: "introduction", page: null, sheet: null, slide: null },
    });
    expect(
      matchesPlannerLocationTarget(candidate, {
        type: "section",
        value: "conclusion",
      }),
    ).toBe(false);
  });

  test("matches page type by exact string comparison", () => {
    const candidate = makeCandidate({
      location: { page: 5, sheet: null, slide: null, sectionKey: null },
    });
    expect(
      matchesPlannerLocationTarget(candidate, {
        type: "page",
        value: "5",
      }),
    ).toBe(true);
  });

  test("does not match page when page number differs", () => {
    const candidate = makeCandidate({
      location: { page: 5, sheet: null, slide: null, sectionKey: null },
    });
    expect(
      matchesPlannerLocationTarget(candidate, {
        type: "page",
        value: "6",
      }),
    ).toBe(false);
  });

  test("matches slide type by exact string comparison", () => {
    const candidate = makeCandidate({
      location: { slide: 12, page: null, sheet: null, sectionKey: null },
    });
    expect(
      matchesPlannerLocationTarget(candidate, {
        type: "slide",
        value: "12",
      }),
    ).toBe(true);
  });

  test("matches cell/range type via snippet substring", () => {
    const candidate = makeCandidate({
      snippet: "data in cell B5 contains the total",
    });
    expect(
      matchesPlannerLocationTarget(candidate, {
        type: "cell",
        value: "b5",
      }),
    ).toBe(true);
  });

  test("unknown type falls back to full searchable text match", () => {
    const candidate = makeCandidate({
      snippet: "quarterly revenue figures",
      title: "Annual Report 2025",
    });
    expect(
      matchesPlannerLocationTarget(candidate, {
        type: "keyword",
        value: "annual report",
      }),
    ).toBe(true);
  });

  test("unknown type returns false when value not found", () => {
    const candidate = makeCandidate({
      snippet: "some unrelated content",
      title: "Other Document",
    });
    expect(
      matchesPlannerLocationTarget(candidate, {
        type: "keyword",
        value: "nonexistent",
      }),
    ).toBe(false);
  });
});

// ── applyRetrievalPlanHints ─────────────────────────────────────────

describe("applyRetrievalPlanHints", () => {
  test("returns candidates unchanged when retrievalPlan is null", () => {
    const candidates = [makeCandidate()];
    const result = applyRetrievalPlanHints(candidates, null);
    expect(result).toBe(candidates);
  });

  test("returns candidates unchanged when retrievalPlan is undefined", () => {
    const candidates = [makeCandidate()];
    const result = applyRetrievalPlanHints(candidates, undefined);
    expect(result).toBe(candidates);
  });

  test("returns candidates unchanged when plan has no actionable hints", () => {
    const candidates = [makeCandidate()];
    const result = applyRetrievalPlanHints(candidates, {});
    expect(result).toBe(candidates);
  });

  test("boosts keywordBoost for candidates matching requiredTerms", () => {
    const candidates = [
      makeCandidate({
        candidateId: "match",
        snippet: "revenue growth was impressive this quarter",
        scores: { semantic: 0.6, keywordBoost: 0 },
      }),
      makeCandidate({
        candidateId: "no-match",
        snippet: "the weather was sunny today",
        title: "Weather Forecast",
        filename: "weather.txt",
        docType: "text",
        location: { page: null, sheet: null, slide: null, sectionKey: "climate" },
        scores: { semantic: 0.6, keywordBoost: 0 },
      }),
    ];

    const result = applyRetrievalPlanHints(candidates, {
      requiredTerms: ["revenue"],
    });

    const match = result.find((c) => c.candidateId === "match")!;
    const noMatch = result.find((c) => c.candidateId === "no-match")!;

    expect(match.scores.keywordBoost).toBeGreaterThan(0);
    // No-match gets a penalty instead
    expect(noMatch.scores.penalties).toBeGreaterThan(0);
  });

  test("requiredTerms boost is capped at 0.18", () => {
    const candidates = [
      makeCandidate({
        snippet: "alpha beta gamma delta epsilon zeta eta theta iota kappa",
        scores: { semantic: 0.6, keywordBoost: 0 },
      }),
    ];

    const result = applyRetrievalPlanHints(candidates, {
      requiredTerms: [
        "alpha",
        "beta",
        "gamma",
        "delta",
        "epsilon",
        "zeta",
        "eta",
        "theta",
        "iota",
        "kappa",
      ],
    });

    // 10 hits * 0.05 = 0.50, but capped at Math.min(0.18, ...)
    expect(result[0].scores.keywordBoost).toBeLessThanOrEqual(0.18);
  });

  test("penalizes candidates matching excludedTerms", () => {
    const candidates = [
      makeCandidate({
        candidateId: "excluded",
        snippet: "this draft version is deprecated and should not be used",
        scores: { semantic: 0.6, penalties: 0 },
      }),
      makeCandidate({
        candidateId: "clean",
        snippet: "the final quarterly report for stakeholders",
        scores: { semantic: 0.6, penalties: 0 },
      }),
    ];

    const result = applyRetrievalPlanHints(candidates, {
      excludedTerms: ["draft", "deprecated"],
    });

    const excluded = result.find((c) => c.candidateId === "excluded")!;
    const clean = result.find((c) => c.candidateId === "clean")!;

    expect(excluded.scores.penalties).toBeGreaterThan(0);
    expect(clean.scores.penalties ?? 0).toBe(0);
  });

  test("excludedTerms penalty is capped at 0.28", () => {
    const candidates = [
      makeCandidate({
        snippet: "a b c d e f g h i j",
        scores: { semantic: 0.6, penalties: 0 },
      }),
    ];

    const result = applyRetrievalPlanHints(candidates, {
      excludedTerms: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"],
    });

    // 10 hits * 0.1 = 1.0 but capped at min(0.28, ...)
    expect(result[0].scores.penalties).toBeLessThanOrEqual(0.28);
  });

  test("boosts typeBoost for candidates matching docTypePreferences", () => {
    const candidates = [
      makeCandidate({
        candidateId: "invoice",
        docType: "Invoice",
        scores: { semantic: 0.6, typeBoost: 0 },
      }),
      makeCandidate({
        candidateId: "contract",
        docType: "Contract",
        scores: { semantic: 0.6, typeBoost: 0 },
      }),
    ];

    const result = applyRetrievalPlanHints(candidates, {
      docTypePreferences: ["invoice"],
    });

    const invoice = result.find((c) => c.candidateId === "invoice")!;
    const contract = result.find((c) => c.candidateId === "contract")!;

    expect(invoice.scores.typeBoost).toBe(0.08);
    expect(contract.scores.typeBoost ?? 0).toBe(0);
  });

  test("boosts keywordBoost for candidates matching locationTargets", () => {
    const candidates = [
      makeCandidate({
        candidateId: "on-sheet",
        location: { sheet: "Balance Sheet", page: null, slide: null, sectionKey: null },
        scores: { semantic: 0.6, keywordBoost: 0 },
      }),
      makeCandidate({
        candidateId: "other-sheet",
        location: { sheet: "Income Statement", page: null, slide: null, sectionKey: null },
        scores: { semantic: 0.6, keywordBoost: 0 },
      }),
    ];

    const result = applyRetrievalPlanHints(candidates, {
      locationTargets: [{ type: "sheet", value: "balance" }],
    });

    const onSheet = result.find((c) => c.candidateId === "on-sheet")!;
    const otherSheet = result.find((c) => c.candidateId === "other-sheet")!;

    expect(onSheet.scores.keywordBoost).toBe(0.07);
    expect(otherSheet.scores.keywordBoost ?? 0).toBe(0);
  });

  test("boosts for entity matches", () => {
    const candidates = [
      makeCandidate({
        snippet: "Acme Corp reported strong results for the fiscal year",
        scores: { semantic: 0.6, keywordBoost: 0 },
      }),
    ];

    const result = applyRetrievalPlanHints(candidates, {
      entities: ["Acme Corp"],
    });

    expect(result[0].scores.keywordBoost).toBeGreaterThan(0);
    expect(result[0].scores.keywordBoost).toBeLessThanOrEqual(0.12);
  });

  test("boosts for metric matches with digits (larger boost)", () => {
    const candidates = [
      makeCandidate({
        snippet: "Revenue reached $500M in 2025, a record high for the company",
        scores: { semantic: 0.6, keywordBoost: 0 },
      }),
    ];

    const result = applyRetrievalPlanHints(candidates, {
      metrics: ["revenue"],
    });

    // Contains digits, so boost is 0.06
    expect(result[0].scores.keywordBoost).toBe(0.06);
  });

  test("boosts for metric matches without digits (smaller boost)", () => {
    const candidates = [
      makeCandidate({
        snippet: "Revenue growth was strong across all segments",
        scores: { semantic: 0.6, keywordBoost: 0 },
      }),
    ];

    const result = applyRetrievalPlanHints(candidates, {
      metrics: ["revenue"],
    });

    // No digits in searchable text... but wait, let's check: "page 3" appears in the default location
    // Actually the buildSearchableTextForPlannerHint includes "page 3" which has a digit.
    // Let's use a candidate with no page/slide.
    const candidatesNoDigits = [
      makeCandidate({
        snippet: "Revenue growth was strong across all segments",
        location: { page: null, sheet: null, slide: null, sectionKey: "summary" },
        scores: { semantic: 0.6, keywordBoost: 0 },
      }),
    ];

    const resultNoDigits = applyRetrievalPlanHints(candidatesNoDigits, {
      metrics: ["revenue"],
    });

    // No digits anywhere in the searchable text, so boost is 0.02
    expect(resultNoDigits[0].scores.keywordBoost).toBe(0.02);
  });

  test("boosts for timeHints match", () => {
    const candidates = [
      makeCandidate({
        candidateId: "time-match",
        snippet: "In Q3 2025, revenue exceeded projections by a wide margin",
        scores: { semantic: 0.6, keywordBoost: 0 },
      }),
      makeCandidate({
        candidateId: "no-time",
        snippet: "general policy on employee conduct and guidelines",
        location: { page: null, sheet: null, slide: null, sectionKey: null },
        scores: { semantic: 0.6, keywordBoost: 0, penalties: 0 },
      }),
    ];

    const result = applyRetrievalPlanHints(candidates, {
      timeHints: ["2025"],
    });

    const timeMatch = result.find((c) => c.candidateId === "time-match")!;
    const noTime = result.find((c) => c.candidateId === "no-time")!;

    expect(timeMatch.scores.keywordBoost).toBe(0.05);
    expect(noTime.scores.penalties).toBe(0.03);
  });

  test("empty candidates array returns empty array", () => {
    const result = applyRetrievalPlanHints([], {
      requiredTerms: ["revenue"],
    });
    expect(result).toEqual([]);
  });

  test("combined hints accumulate boosts on the same candidate", () => {
    const candidates = [
      makeCandidate({
        snippet: "Revenue was $50M in 2025 for Acme Corp financial statement",
        docType: "Financial Report",
        location: { sheet: "Income", page: null, slide: null, sectionKey: "revenue" },
        scores: {
          semantic: 0.6,
          keywordBoost: 0,
          typeBoost: 0,
          penalties: 0,
        },
      }),
    ];

    const result = applyRetrievalPlanHints(candidates, {
      requiredTerms: ["revenue"],
      entities: ["acme corp"],
      docTypePreferences: ["financial report"],
      locationTargets: [{ type: "section", value: "revenue" }],
      timeHints: ["2025"],
    });

    // Should have accumulated boosts from multiple sources
    expect(result[0].scores.keywordBoost).toBeGreaterThan(0.1);
    expect(result[0].scores.typeBoost).toBe(0.08);
  });
});
