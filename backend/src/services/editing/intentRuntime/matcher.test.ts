import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import type { IntentPattern } from "./types";

const mockLoadPatterns =
  jest.fn<(domain: "excel" | "docx", lang: "en" | "pt") => IntentPattern[]>();

jest.mock("./loaders", () => ({
  loadPatterns: (
    domain: "excel" | "docx",
    lang: "en" | "pt",
  ): IntentPattern[] => mockLoadPatterns(domain, lang),
}));

import { matchSegment } from "./matcher";

function mkPattern(input: {
  id: string;
  domain?: "excel" | "docx";
  priority?: number;
  tokensAny?: string[];
  tokensAll?: string[];
  regexAny?: string[];
  tokensNone?: string[];
  disambiguationGroup?: string;
  mutuallyExclusiveWith?: string[];
  requiresContext?: IntentPattern["requiresContext"];
  scoreAdjustments?: IntentPattern["scoreAdjustments"];
}): IntentPattern {
  return {
    id: input.id,
    domain: input.domain ?? "excel",
    lang: "en",
    priority: input.priority ?? 80,
    triggers: {
      tokens_any: input.tokensAny ?? [],
      tokens_all: input.tokensAll ?? [],
      regex_any: input.regexAny ?? [],
      tokens_none: input.tokensNone ?? [],
    },
    disambiguationGroup: input.disambiguationGroup,
    mutuallyExclusiveWith: input.mutuallyExclusiveWith,
    requiresContext: input.requiresContext,
    scoreAdjustments: input.scoreAdjustments,
    slotExtractors: [],
    scopeRules: {
      defaultScope: "selection",
      allowScopeOverrideByExplicitRange: true,
      allowNoSelectionIfRangeProvided: true,
    },
    planTemplate: [{ op: "XLSX_SET_CELL_VALUE" }],
    examples: { positive: [], negative: [] },
  };
}

describe("intentRuntime matcher determinism", () => {
  beforeEach(() => {
    mockLoadPatterns.mockReset();
  });

  test("keeps only top candidate in the same disambiguation group", () => {
    const rangePattern = mkPattern({
      id: "excel.set_value.range",
      tokensAny: ["set"],
      disambiguationGroup: "excel.value_assignment",
      scoreAdjustments: {
        boostIfTokensPresent: ["every"],
        boostPoints: 20,
      },
    });
    const singlePattern = mkPattern({
      id: "excel.set_value.single",
      tokensAny: ["set"],
      disambiguationGroup: "excel.value_assignment",
    });
    mockLoadPatterns.mockReturnValue([singlePattern, rangePattern]);

    const result = matchSegment(
      { text: "set every cell in A1:A5 to 0", index: 0 },
      "excel",
      "en",
    );

    expect(result.bestMatch?.pattern.id).toBe("excel.set_value.range");
    expect(result.candidates).toHaveLength(1);
  });

  test("drops mutually-exclusive lower candidates", () => {
    const winner = mkPattern({
      id: "excel.formula.single",
      priority: 95,
      tokensAny: ["set"],
      mutuallyExclusiveWith: ["excel.set_value.single"],
    });
    const loser = mkPattern({
      id: "excel.set_value.single",
      priority: 90,
      tokensAny: ["set"],
    });
    const neutral = mkPattern({
      id: "excel.sort.single_key",
      priority: 70,
      tokensAny: ["set"],
    });
    mockLoadPatterns.mockReturnValue([winner, loser, neutral]);

    const result = matchSegment(
      { text: "set A1 to 100", index: 0 },
      "excel",
      "en",
    );

    const ids = result.candidates.map((candidate) => candidate.pattern.id);
    expect(ids).toContain("excel.formula.single");
    expect(ids).toContain("excel.sort.single_key");
    expect(ids).not.toContain("excel.set_value.single");
  });

  test("enforces explicit range context when required", () => {
    const pattern = mkPattern({
      id: "excel.range.only",
      tokensAny: ["set"],
      requiresContext: { explicitRange: true },
    });
    mockLoadPatterns.mockReturnValue([pattern]);

    const withoutRange = matchSegment(
      { text: "set selected cells to 1", index: 0 },
      "excel",
      "en",
    );
    const withRange = matchSegment(
      { text: "set A1:A10 to 1", index: 0 },
      "excel",
      "en",
    );

    expect(withoutRange.bestMatch).toBeNull();
    expect(withRange.bestMatch?.pattern.id).toBe("excel.range.only");
  });

  test("returns ambiguity instead of lexicographic pick for fill direction ties", () => {
    const fillDown = mkPattern({
      id: "excel.fill_down",
      tokensAny: ["fill"],
      disambiguationGroup: "excel.fill_direction",
    });
    const fillRight = mkPattern({
      id: "excel.fill_right",
      tokensAny: ["fill"],
      disambiguationGroup: "excel.fill_direction",
    });
    mockLoadPatterns.mockReturnValue([fillDown, fillRight]);

    const result = matchSegment(
      { text: "fill this selection", index: 0 },
      "excel",
      "en",
    );

    expect(result.bestMatch).toBeNull();
    expect(result.ambiguity?.group).toBe("excel.fill_direction");
    expect(result.ambiguity?.reason).toBe("tie_score");
    expect(result.ambiguity?.candidateIds).toEqual([
      "excel.fill_down",
      "excel.fill_right",
    ]);
  });

  test("keeps deterministic winner when directional evidence exists", () => {
    const fillDown = mkPattern({
      id: "excel.fill_down",
      tokensAny: ["fill"],
      disambiguationGroup: "excel.fill_direction",
      scoreAdjustments: {
        boostIfTokensPresent: ["down"],
        boostPoints: 18,
      },
    });
    const fillRight = mkPattern({
      id: "excel.fill_right",
      tokensAny: ["fill"],
      disambiguationGroup: "excel.fill_direction",
      scoreAdjustments: {
        boostIfTokensPresent: ["right"],
        boostPoints: 18,
      },
    });
    mockLoadPatterns.mockReturnValue([fillDown, fillRight]);

    const result = matchSegment(
      { text: "fill right on the selected range", index: 0 },
      "excel",
      "en",
    );

    expect(result.ambiguity).toBeUndefined();
    expect(result.bestMatch?.pattern.id).toBe("excel.fill_right");
  });

  test("returns ambiguity for align mode ties without direction", () => {
    const alignLeft = mkPattern({
      id: "docx.align.left",
      domain: "docx",
      tokensAny: ["align"],
      disambiguationGroup: "docx.align_mode",
    });
    const alignRight = mkPattern({
      id: "docx.align.right",
      domain: "docx",
      tokensAny: ["align"],
      disambiguationGroup: "docx.align_mode",
    });
    mockLoadPatterns.mockReturnValue([alignLeft, alignRight]);

    const result = matchSegment(
      { text: "align this paragraph", index: 0 },
      "docx",
      "en",
    );

    expect(result.bestMatch).toBeNull();
    expect(result.ambiguity?.group).toBe("docx.align_mode");
    expect(result.ambiguity?.candidateIds).toEqual([
      "docx.align.left",
      "docx.align.right",
    ]);
  });

  test("returns ambiguity for rows structural ties without insert/delete evidence", () => {
    const insertRows = mkPattern({
      id: "excel.insert_rows",
      tokensAny: ["rows"],
      disambiguationGroup: "excel.rows_structural",
    });
    const deleteRows = mkPattern({
      id: "excel.delete_rows",
      tokensAny: ["rows"],
      disambiguationGroup: "excel.rows_structural",
    });
    mockLoadPatterns.mockReturnValue([insertRows, deleteRows]);

    const result = matchSegment(
      { text: "change these rows", index: 0 },
      "excel",
      "en",
    );

    expect(result.bestMatch).toBeNull();
    expect(result.ambiguity?.group).toBe("excel.rows_structural");
    expect(result.ambiguity?.candidateIds).toEqual([
      "excel.delete_rows",
      "excel.insert_rows",
    ]);
  });

  test("resolves rows structural intent when insert evidence is present", () => {
    const insertRows = mkPattern({
      id: "excel.insert_rows",
      tokensAny: ["rows"],
      disambiguationGroup: "excel.rows_structural",
      scoreAdjustments: {
        boostIfTokensPresent: ["insert"],
        boostPoints: 20,
      },
    });
    const deleteRows = mkPattern({
      id: "excel.delete_rows",
      tokensAny: ["rows"],
      disambiguationGroup: "excel.rows_structural",
      scoreAdjustments: {
        boostIfTokensPresent: ["delete"],
        boostPoints: 20,
      },
    });
    mockLoadPatterns.mockReturnValue([insertRows, deleteRows]);

    const result = matchSegment(
      { text: "insert rows after row 5", index: 0 },
      "excel",
      "en",
    );

    expect(result.ambiguity).toBeUndefined();
    expect(result.bestMatch?.pattern.id).toBe("excel.insert_rows");
  });

  test("requires regex evidence when pattern defines regex_any", () => {
    const pattern = mkPattern({
      id: "excel.pivot.regex_guarded",
      tokensAny: ["table"],
      regexAny: ["\\bpivot\\b"],
    });
    mockLoadPatterns.mockReturnValue([pattern]);

    const result = matchSegment(
      { text: "create a table from this range", index: 0 },
      "excel",
      "en",
    );

    expect(result.bestMatch).toBeNull();
  });

  test("normalizes double-escaped regex patterns from bank JSON", () => {
    const pattern = mkPattern({
      id: "excel.remove_duplicates.escaped_regex",
      tokensAny: ["remove duplicates"],
      regexAny: ["\\bremove\\\\s+duplicates\\b"],
    });
    mockLoadPatterns.mockReturnValue([pattern]);

    const result = matchSegment(
      { text: "remove duplicates from this range", index: 0 },
      "excel",
      "en",
    );

    expect(result.bestMatch?.pattern.id).toBe(
      "excel.remove_duplicates.escaped_regex",
    );
  });
});
