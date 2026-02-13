import { describe, expect, test } from "@jest/globals";
import { planAllybiOperator, planAllybiOperatorSteps } from "./operatorPlanner";

describe("planAllybiOperator", () => {
  test("maps DOCX inline formatting preview to render-card key", () => {
    const plan = planAllybiOperator({
      domain: "docx",
      message: "make this bold",
      classifiedIntent: {
        intentId: "DOCX_FORMAT_INLINE",
        confidence: 0.9,
        operatorCandidates: ["DOCX_SET_RUN_STYLE"],
        language: "en",
        reason: "test",
      },
      scope: {
        source: "live_selection",
        confidence: 1,
        scopeKind: "selection",
        requiresDisambiguation: false,
        explicitlyLimitedToFirst: false,
        multiRangeFanout: false,
      },
    });

    expect(plan?.canonicalOperator).toBe("DOCX_SET_RUN_STYLE");
    expect(plan?.runtimeOperator).toBe("EDIT_DOCX_BUNDLE");
    expect(plan?.previewRenderType).toBe("docx_inline_format_diff");
  });

  test("maps DOCX paragraph-format preview to docx_format_diff", () => {
    const plan = planAllybiOperator({
      domain: "docx",
      message: "set heading style",
      classifiedIntent: {
        intentId: "DOCX_STYLES_APPLY",
        confidence: 0.9,
        operatorCandidates: ["DOCX_SET_PARAGRAPH_STYLE"],
        language: "en",
        reason: "test",
      },
      scope: {
        source: "structural_resolver",
        confidence: 0.8,
        scopeKind: "section",
        requiresDisambiguation: false,
        explicitlyLimitedToFirst: false,
        multiRangeFanout: false,
      },
    });

    expect(plan?.canonicalOperator).toBe("DOCX_SET_PARAGRAPH_STYLE");
    expect(plan?.previewRenderType).toBe("docx_format_diff");
  });

  test("falls back to sheets range render type when no candidate exists", () => {
    const plan = planAllybiOperator({
      domain: "sheets",
      message: "set selected cells to 1",
      classifiedIntent: null,
      scope: {
        source: "live_selection",
        confidence: 0.9,
        scopeKind: "selection",
        requiresDisambiguation: false,
        explicitlyLimitedToFirst: false,
        multiRangeFanout: false,
      },
    });

    expect(plan?.canonicalOperator).toBe("XLSX_SET_RANGE_VALUES");
    expect(plan?.previewRenderType).toBe("xlsx_range_diff");
  });

  test("forces formatting operator for font-family prompt without font keyword", () => {
    const plan = planAllybiOperator({
      domain: "docx",
      message: "change this to times new roman",
      classifiedIntent: {
        intentId: "DOCX_FORMAT_INLINE",
        confidence: 0.96,
        operatorCandidates: ["DOCX_SET_RUN_STYLE"],
        language: "en",
        reason: "font_entity:Times New Roman",
        isFormattingIntent: true,
        fontFamily: "Times New Roman",
      },
      scope: {
        source: "live_selection",
        confidence: 1,
        scopeKind: "selection",
        requiresDisambiguation: false,
        explicitlyLimitedToFirst: false,
        multiRangeFanout: false,
      },
    });

    expect(plan?.canonicalOperator).toBe("DOCX_SET_RUN_STYLE");
    expect(plan?.isFormattingOnly).toBe(true);
    expect(plan?.blockedRewrite).toBe(true);
    expect(plan?.fontFamily).toBe("Times New Roman");
    expect(plan?.previewRenderType).toBe("docx_inline_format_diff");
  });

  test("fans out one step per selected range", () => {
    const steps = planAllybiOperatorSteps({
      domain: "sheets",
      message: "set selected cells to 0",
      classifiedIntent: {
        intentId: "XLSX_SET_VALUE",
        confidence: 0.9,
        operatorCandidates: ["XLSX_SET_RANGE_VALUES"],
        language: "en",
        reason: "test",
      },
      scope: {
        source: "live_selection",
        confidence: 1,
        scopeKind: "range",
        requiresDisambiguation: false,
        explicitlyLimitedToFirst: false,
        multiRangeFanout: true,
        targetHints: ["A1:A2", "C1:C2"],
      },
    });

    expect(steps).toHaveLength(2);
    expect(steps[0]?.targetHint).toBe("A1:A2");
    expect(steps[1]?.targetHint).toBe("C1:C2");
  });

  test("prevents list intents from falling back to rewrite operators", () => {
    const plan = planAllybiOperator({
      domain: "docx",
      message: "convert this to bullet points",
      classifiedIntent: {
        intentId: "DOCX_LIST_CONVERT",
        confidence: 0.88,
        operatorCandidates: ["DOCX_REWRITE_PARAGRAPH"],
        language: "en",
        reason: "test",
      },
      scope: {
        source: "live_selection",
        confidence: 1,
        scopeKind: "selection",
        requiresDisambiguation: false,
        explicitlyLimitedToFirst: false,
        multiRangeFanout: false,
      },
    });

    expect(plan?.canonicalOperator).toBe("DOCX_LIST_APPLY_BULLETS");
    expect(plan?.operatorClass).toBe("list_numbering");
    expect(plan?.blockedRewrite).toBe(true);
  });
});
