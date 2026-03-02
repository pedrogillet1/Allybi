import { describe, expect, test } from "@jest/globals";

import { DiffBuilderService } from "./diffBuilder.service";
import { looksLikeTruncatedSpanPayload } from "./docxSpanPayloadGuard";
import { RationaleBuilderService } from "./rationaleBuilder.service";
import {
  normalizeEditOperator,
  type NormalizedEditOperatorResult,
} from "./editOperatorAliases.service";
import { COMPUTE_KINDS, XLSX_COMPUTE_OPERATORS } from "./editing.constants";

// ---------------------------------------------------------------------------
// DiffBuilderService
// ---------------------------------------------------------------------------
describe("DiffBuilderService", () => {
  const diff = new DiffBuilderService();

  describe("buildParagraphDiff", () => {
    test("detects no change on identical text", () => {
      const result = diff.buildParagraphDiff("Hello world.", "Hello world.");
      expect(result.changed).toBe(false);
      expect(result.changes).toHaveLength(0);
      expect(result.summary).toContain("No textual change");
    });

    test("detects replacement change", () => {
      const result = diff.buildParagraphDiff(
        "The cat sat on the mat.",
        "The dog sat on the mat.",
      );
      expect(result.changed).toBe(true);
      expect(result.kind).toBe("paragraph");
      expect(result.changes.length).toBeGreaterThanOrEqual(1);
      expect(result.changes[0].type).toBe("replace");
    });

    test("detects sentence addition", () => {
      const result = diff.buildParagraphDiff(
        "First sentence.",
        "First sentence. Second sentence.",
      );
      expect(result.changed).toBe(true);
      expect(result.changes.some((c) => c.type === "add")).toBe(true);
    });

    test("detects sentence removal", () => {
      const result = diff.buildParagraphDiff(
        "First sentence. Second sentence.",
        "First sentence.",
      );
      expect(result.changed).toBe(true);
      expect(result.changes.some((c) => c.type === "remove")).toBe(true);
    });

    test("normalizes extra whitespace", () => {
      const result = diff.buildParagraphDiff(
        "Hello   world.",
        "Hello world.",
      );
      expect(result.changed).toBe(false);
    });

    test("summary mentions word count delta", () => {
      const result = diff.buildParagraphDiff(
        "Short.",
        "Short. Added more words here.",
      );
      expect(result.summary).toContain("Expanded by");
    });

    test("summary mentions reduction", () => {
      const result = diff.buildParagraphDiff(
        "This is a long sentence with many words.",
        "Short.",
      );
      expect(result.summary).toContain("Reduced by");
    });
  });

  describe("buildCellDiff", () => {
    test("detects cell value change", () => {
      const result = diff.buildCellDiff("100", "200");
      expect(result.kind).toBe("cell");
      expect(result.changed).toBe(true);
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].type).toBe("replace");
    });

    test("detects no change in cell", () => {
      const result = diff.buildCellDiff("100", "100");
      expect(result.changed).toBe(false);
      expect(result.changes).toHaveLength(0);
    });
  });

  describe("buildSlideTextDiff", () => {
    test("returns slide kind", () => {
      const result = diff.buildSlideTextDiff("Title A", "Title B");
      expect(result.kind).toBe("slide");
      expect(result.changed).toBe(true);
    });
  });

  describe("buildStructuralDiff", () => {
    test("returns structural kind with summary", () => {
      const result = diff.buildStructuralDiff("Sheet1", "Revenue Sheet");
      expect(result.kind).toBe("structural");
      expect(result.changed).toBe(true);
      expect(result.summary).toContain("Structural update");
    });

    test("detects no structural change", () => {
      const result = diff.buildStructuralDiff("Sheet1", "Sheet1");
      expect(result.changed).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// docxSpanPayloadGuard
// ---------------------------------------------------------------------------
describe("looksLikeTruncatedSpanPayload", () => {
  test("returns false for empty inputs", () => {
    expect(looksLikeTruncatedSpanPayload("", "")).toBe(false);
    expect(looksLikeTruncatedSpanPayload("hello", "")).toBe(false);
  });

  test("returns false when texts are identical", () => {
    expect(
      looksLikeTruncatedSpanPayload("Hello world foo bar baz.", "Hello world foo bar baz."),
    ).toBe(false);
  });

  test("returns true for very short proposed text with low overlap", () => {
    const original =
      "The comprehensive financial report for Q4 2025 shows strong revenue growth across all major business segments.";
    const truncated = "xyz";
    expect(looksLikeTruncatedSpanPayload(original, truncated)).toBe(true);
  });

  test("returns false for proportional edit with high overlap", () => {
    const original =
      "The quarterly financial report shows strong revenue growth across all major business segments of the company.";
    const edited =
      "The quarterly financial report shows moderate revenue growth across all major business segments of the organization.";
    expect(looksLikeTruncatedSpanPayload(original, edited)).toBe(false);
  });

  test("returns false when proposed text is long enough", () => {
    const original = "Short text here.";
    const proposed = "A completely different but sufficiently long replacement text for this field.";
    expect(looksLikeTruncatedSpanPayload(original, proposed)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// RationaleBuilderService
// ---------------------------------------------------------------------------
describe("RationaleBuilderService", () => {
  const builder = new RationaleBuilderService();

  const baseConstraints = {
    preserveNumbers: false,
    preserveEntities: false,
    strictNoNewFacts: false,
    tone: "neutral" as const,
    outputLanguage: "en" as const,
    maxExpansionRatio: 2,
  };

  test("builds basic rationale with operation label", () => {
    const result = builder.build({
      constraints: baseConstraints,
      operationLabel: "EDIT_PARAGRAPH",
    });
    expect(result.reasons.length).toBeGreaterThanOrEqual(1);
    expect(result.reasons[0]).toContain("edit_paragraph");
    expect(result.riskLevel).toBe("LOW");
    expect(result.styleMatched).toBe("neutral/en");
  });

  test("adds guardrails for strictNoNewFacts", () => {
    const result = builder.build({
      constraints: { ...baseConstraints, strictNoNewFacts: true },
      operationLabel: "EDIT_SPAN",
    });
    expect(result.guardrails).toContain("No new facts introduced");
    expect(result.reasons.some((r) => r.includes("no-new-facts"))).toBe(true);
  });

  test("adds guardrails for preserveNumbers", () => {
    const result = builder.build({
      constraints: { ...baseConstraints, preserveNumbers: true },
      operationLabel: "EDIT_CELL",
    });
    expect(result.guardrails).toContain("Numbers preserved");
  });

  test("adds guardrails for preserveEntities", () => {
    const result = builder.build({
      constraints: { ...baseConstraints, preserveEntities: true },
      operationLabel: "EDIT_RANGE",
    });
    expect(result.guardrails).toContain("Named entities preserved");
  });

  test("reports evidence anchor guardrail for source proofs", () => {
    const result = builder.build({
      constraints: baseConstraints,
      operationLabel: "COMPUTE",
      sourceProofCount: 3,
    });
    expect(result.guardrails).toContain("Evidence anchored");
    expect(result.reasons.some((r) => r.includes("3 local proof"))).toBe(true);
  });

  test("risk level is MED when target is ambiguous", () => {
    const result = builder.build({
      constraints: baseConstraints,
      operationLabel: "EDIT_PARAGRAPH",
      targetAmbiguous: true,
    });
    expect(result.riskLevel).toBe("MED");
    expect(result.guardrails).toContain("Ambiguous target flagged");
  });

  test("risk level is MED when format loss risk is present", () => {
    const result = builder.build({
      constraints: baseConstraints,
      operationLabel: "EDIT_PARAGRAPH",
      formatLossRisk: true,
    });
    expect(result.riskLevel).toBe("MED");
  });

  test("risk level is HIGH when both ambiguous and format loss", () => {
    const result = builder.build({
      constraints: baseConstraints,
      operationLabel: "EDIT_PARAGRAPH",
      targetAmbiguous: true,
      formatLossRisk: true,
    });
    expect(result.riskLevel).toBe("HIGH");
  });

  test("deduplicates preserved tokens", () => {
    const result = builder.build({
      constraints: baseConstraints,
      operationLabel: "EDIT_PARAGRAPH",
      preservedTokens: ["Revenue", "revenue", "REVENUE", "Cost"],
    });
    expect(result.preserved).toHaveLength(2);
    expect(result.preserved).toContain("Revenue");
    expect(result.preserved).toContain("Cost");
  });

  test("styleMatched reflects tone and language", () => {
    const result = builder.build({
      constraints: { ...baseConstraints, tone: "formal", outputLanguage: "fr" as any },
      operationLabel: "EDIT_PARAGRAPH",
    });
    expect(result.styleMatched).toBe("formal/fr");
  });
});

// ---------------------------------------------------------------------------
// editOperatorAliases.service.ts — normalizeEditOperator
// ---------------------------------------------------------------------------
describe("normalizeEditOperator", () => {
  const opts = { domain: "docx" as const, instruction: "Edit this" };

  test("recognizes canonical edit operators", () => {
    const result = normalizeEditOperator("EDIT_PARAGRAPH", opts);
    expect(result.operator).toBe("EDIT_PARAGRAPH");
    expect(result.strictActionAlias).toBeNull();
  });

  test("maps allybi canonical DOCX operators", () => {
    const result = normalizeEditOperator("DOCX_REPLACE_SPAN", opts);
    expect(result.operator).toBe("EDIT_SPAN");
    expect(result.canonicalOperator).toBe("DOCX_REPLACE_SPAN");
  });

  test("maps allybi canonical DOCX_REWRITE_PARAGRAPH", () => {
    const result = normalizeEditOperator("DOCX_REWRITE_PARAGRAPH", opts);
    expect(result.operator).toBe("EDIT_PARAGRAPH");
  });

  test("maps DOCX_INSERT_AFTER to ADD_PARAGRAPH", () => {
    const result = normalizeEditOperator("DOCX_INSERT_AFTER", opts);
    expect(result.operator).toBe("ADD_PARAGRAPH");
  });

  test("maps XLSX_SET_CELL_VALUE to EDIT_CELL", () => {
    const result = normalizeEditOperator("XLSX_SET_CELL_VALUE", {
      domain: "sheets",
      instruction: "Set value",
    });
    expect(result.operator).toBe("EDIT_CELL");
  });

  test("maps XLSX_CHART_CREATE to CREATE_CHART", () => {
    const result = normalizeEditOperator("XLSX_CHART_CREATE", {
      domain: "sheets",
      instruction: "Create chart",
    });
    expect(result.operator).toBe("CREATE_CHART");
  });

  test("maps PY_CHART_ prefixed operators to PY_CHART", () => {
    const result = normalizeEditOperator("PY_CHART_BAR", {
      domain: "sheets",
      instruction: "Create chart",
    });
    expect(result.operator).toBe("PY_CHART");
  });

  test("maps PY_WRITEBACK_RESULTS to PY_WRITEBACK", () => {
    const result = normalizeEditOperator("PY_WRITEBACK_RESULTS", {
      domain: "sheets",
      instruction: "Write back",
    });
    expect(result.operator).toBe("PY_WRITEBACK");
  });

  test("resolves plan aliases", () => {
    const result = normalizeEditOperator("edit.plan", opts);
    expect(result.strictActionAlias).toBe("plan");
    expect(result.operator).toBe("EDIT_PARAGRAPH"); // docx default
  });

  test("resolves apply aliases", () => {
    const result = normalizeEditOperator("edit_apply", opts);
    expect(result.strictActionAlias).toBe("apply");
  });

  test("resolves undo aliases", () => {
    const result = normalizeEditOperator("editing.undo", opts);
    expect(result.strictActionAlias).toBe("undo");
  });

  test("plan alias defaults to domain-specific operator", () => {
    const sheetsResult = normalizeEditOperator("edit.plan", {
      domain: "sheets",
      instruction: "Plan",
    });
    expect(sheetsResult.operator).toBe("COMPUTE_BUNDLE");

    const slidesResult = normalizeEditOperator("edit.plan", {
      domain: "slides",
      instruction: "Plan",
    });
    expect(slidesResult.operator).toBe("REWRITE_SLIDE_TEXT");
  });

  test("maps create_chart token to CREATE_CHART", () => {
    const result = normalizeEditOperator("create_chart", {
      domain: "sheets",
      instruction: "Make a chart",
    });
    expect(result.operator).toBe("CREATE_CHART");
    expect(result.canonicalOperator).toBe("XLSX_CHART_CREATE");
  });

  test("maps set_run_style to EDIT_DOCX_BUNDLE", () => {
    const result = normalizeEditOperator("set_run_style", opts);
    expect(result.operator).toBe("EDIT_DOCX_BUNDLE");
    expect(result.canonicalOperator).toBe("DOCX_SET_RUN_STYLE");
  });

  test("maps clear_run_style to EDIT_DOCX_BUNDLE", () => {
    const result = normalizeEditOperator("clear_run_style", opts);
    expect(result.operator).toBe("EDIT_DOCX_BUNDLE");
    expect(result.canonicalOperator).toBe("DOCX_CLEAR_RUN_STYLE");
  });

  test("maps edit_cell token to EDIT_CELL", () => {
    const result = normalizeEditOperator("edit_cell", {
      domain: "sheets",
      instruction: "Update cell",
    });
    expect(result.operator).toBe("EDIT_CELL");
  });

  test("maps rename_sheet token", () => {
    const result = normalizeEditOperator("rename_sheet", {
      domain: "sheets",
      instruction: "Rename",
    });
    expect(result.operator).toBe("RENAME_SHEET");
  });

  test("maps add_sheet token", () => {
    const result = normalizeEditOperator("add_sheet", {
      domain: "sheets",
      instruction: "Add sheet",
    });
    expect(result.operator).toBe("ADD_SHEET");
  });

  test("maps compute/sort/filter tokens to COMPUTE_BUNDLE", () => {
    for (const token of ["compute_values", "sort_range", "filter_data", "format_cells", "validation_add", "freeze_panes"]) {
      const result = normalizeEditOperator(token, {
        domain: "sheets",
        instruction: "Do it",
      });
      expect(result.operator).toBe("COMPUTE_BUNDLE");
    }
  });

  test("maps sheets_ prefixed tokens to COMPUTE_BUNDLE", () => {
    const result = normalizeEditOperator("sheets_format_range", {
      domain: "sheets",
      instruction: "Format",
    });
    expect(result.operator).toBe("COMPUTE_BUNDLE");
  });

  test("returns null operator for unrecognized input", () => {
    const result = normalizeEditOperator("completely_unknown_op_xyz", opts);
    expect(result.operator).toBeNull();
    expect(result.strictActionAlias).toBeNull();
  });

  test("returns null for empty input", () => {
    const result = normalizeEditOperator("", opts);
    expect(result.operator).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// editing.constants.ts
// ---------------------------------------------------------------------------
describe("editing constants", () => {
  test("COMPUTE_KINDS contains expected base operations", () => {
    expect(COMPUTE_KINDS.has("forecast_series")).toBe(true);
    expect(COMPUTE_KINDS.has("clean_data")).toBe(true);
    expect(COMPUTE_KINDS.has("generate_chart")).toBe(true);
    expect(COMPUTE_KINDS.has("regression")).toBe(true);
    expect(COMPUTE_KINDS.size).toBe(11);
  });

  test("XLSX_COMPUTE_OPERATORS contains 27 operators", () => {
    expect(XLSX_COMPUTE_OPERATORS.size).toBe(27);
  });

  test("XLSX_COMPUTE_OPERATORS includes original and new operators", () => {
    expect(XLSX_COMPUTE_OPERATORS.has("XLSX_FORECAST")).toBe(true);
    expect(XLSX_COMPUTE_OPERATORS.has("XLSX_PIVOT")).toBe(true);
    expect(XLSX_COMPUTE_OPERATORS.has("XLSX_DASHBOARD")).toBe(true);
    expect(XLSX_COMPUTE_OPERATORS.has("XLSX_MOVING_AVERAGE")).toBe(true);
  });
});
