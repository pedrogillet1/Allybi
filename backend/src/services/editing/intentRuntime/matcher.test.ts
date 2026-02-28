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
  priority?: number;
  tokensAny?: string[];
  tokensNone?: string[];
  disambiguationGroup?: string;
  mutuallyExclusiveWith?: string[];
  requiresContext?: IntentPattern["requiresContext"];
  scoreAdjustments?: IntentPattern["scoreAdjustments"];
}): IntentPattern {
  return {
    id: input.id,
    domain: "excel",
    lang: "en",
    priority: input.priority ?? 80,
    triggers: {
      tokens_any: input.tokensAny ?? [],
      tokens_none: input.tokensNone ?? [],
      regex_any: [],
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
});
