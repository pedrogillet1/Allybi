import { describe, expect, test } from "@jest/globals";
import { resolveAllybiScope } from "./scopeResolver";

describe("resolveAllybiScope", () => {
  test("uses data-bank document scope hints over stale selections", () => {
    const scope = resolveAllybiScope({
      domain: "docx",
      message: "Translate the entire document to Portuguese.",
      classifiedIntent: {
        intentId: "DOCX_TRANSLATE",
        confidence: 0.99,
        operatorCandidates: ["DOCX_TRANSLATE_SCOPE"],
        language: "en",
        reason: "test",
      },
      liveSelection: { paragraphId: "p1" },
      frozenSelection: { paragraphId: "p0" },
    });

    expect(scope.scopeKind).toBe("document");
    expect(scope.targetHint).toBe("document");
  });

  test("prioritizes live selection over frozen selection for normal edits", () => {
    const scope = resolveAllybiScope({
      domain: "docx",
      message: "Make this bold.",
      classifiedIntent: {
        intentId: "DOCX_FORMAT_INLINE",
        confidence: 0.9,
        operatorCandidates: ["DOCX_SET_RUN_STYLE"],
        language: "en",
        reason: "test",
      },
      liveSelection: { paragraphId: "p-live" },
      frozenSelection: { paragraphId: "p-frozen" },
    });

    expect(scope.source).toBe("live_selection");
    expect(scope.scopeKind).toBe("selection");
  });

  test("fans out all selected XLSX ranges by default", () => {
    const scope = resolveAllybiScope({
      domain: "xlsx",
      message: "set selected cells to 0",
      liveSelection: { selectedRanges: ["A1:A2", "C1:C2"] },
    });

    expect(scope.multiRangeFanout).toBe(true);
    expect(scope.targetHints).toEqual(["A1:A2", "C1:C2"]);
    expect(scope.explicitlyLimitedToFirst).toBe(false);
  });

  test("respects explicit only-first override for multi-range selection", () => {
    const scope = resolveAllybiScope({
      domain: "xlsx",
      message: "set selected cells to 0, only the first",
      liveSelection: { selectedRanges: ["A1:A2", "C1:C2"] },
    });

    expect(scope.multiRangeFanout).toBe(false);
    expect(scope.targetHints).toEqual(["A1:A2"]);
    expect(scope.explicitlyLimitedToFirst).toBe(true);
  });

  test("xlsx explicit range in prompt takes precedence over active selection", () => {
    const scope = resolveAllybiScope({
      domain: "xlsx",
      message: "set SUMMARY 1!D35:D48 to 0",
      liveSelection: { selectedRanges: ["A1:A2", "C1:C2"] },
    });

    expect(scope.source).toBe("explicit_anchor");
    expect(scope.targetHints).toEqual(["SUMMARY 1!D35:D48"]);
    expect(scope.multiRangeFanout).toBe(false);
  });

  test("emits generic selection hint when viewer reports selection without concrete IDs", () => {
    const scope = resolveAllybiScope({
      domain: "docx",
      message: "make this bold",
      liveSelection: { hasSelection: true },
    });

    expect(scope.source).toBe("live_selection");
    expect(scope.targetHints).toEqual(["selection"]);
    expect(scope.targetHint).toBe("selection");
  });
});
