import { describe, it, expect } from "vitest";
import { computeOpsToPatchPlan } from "../../services/editing/spreadsheetModel/computeOpsToPatchPlan";
import { applyPatchOpsToSpreadsheetModel } from "../../services/editing/spreadsheetModel/spreadsheetModel.patch.apply";
import type { SpreadsheetModel } from "../../services/editing/spreadsheetModel/spreadsheetModel.types";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function makeModel(
  overrides?: Partial<{
    sheetName: string;
    maxRow: number;
    maxCol: number;
    cells: Record<
      string,
      { v?: any; t?: string; f?: string; nf?: string; s?: string }
    >;
  }>,
): SpreadsheetModel {
  const name = overrides?.sheetName ?? "Sheet1";
  return {
    version: 1,
    workbook: { name: "test.xlsx" },
    sheets: [
      {
        id: "s1",
        name,
        grid: {
          maxRow: overrides?.maxRow ?? 10,
          maxCol: overrides?.maxCol ?? 5,
        },
        cells: overrides?.cells ?? {},
        validations: [],
        conditionalFormats: [],
      },
    ],
    styles: {},
    charts: [],
    tables: [],
    meta: { source: "xlsx_import" as const, buildHash: "test" },
  };
}

function runPipeline(
  model: SpreadsheetModel,
  ops: Array<Record<string, unknown>>,
  activeSheetName = "Sheet1",
) {
  const { patchOps, rejectedOps } = computeOpsToPatchPlan({
    ops,
    activeSheetName,
  });
  const result = applyPatchOpsToSpreadsheetModel(model, patchOps);
  return { ...result, patchOps, rejectedOps };
}

/* ------------------------------------------------------------------ */
/*  Golden tests                                                      */
/* ------------------------------------------------------------------ */

describe("XLSX agent golden tests — computeOpsToPatchPlan → applyPatchOps", () => {
  // ── 1. Set cell value (string) ──────────────────────────────────
  it("should set a string cell value", () => {
    const model = makeModel();
    const { model: out } = runPipeline(model, [
      { kind: "set_values", rangeA1: "Sheet1!A1", value: "Hello" },
    ]);
    expect(out.sheets[0].cells["R1C1"]?.v).toBe("Hello");
    expect(out.sheets[0].cells["R1C1"]?.t).toBe("s");
  });

  // ── 2. Set cell value (number with currency format) ─────────────
  it("should set number value with currency format", () => {
    const model = makeModel();
    const { model: out } = runPipeline(model, [
      { kind: "set_values", rangeA1: "Sheet1!B2", value: 1500 },
      {
        kind: "set_number_format",
        rangeA1: "Sheet1!B2",
        pattern: "$#,##0.00",
      },
    ]);
    expect(out.sheets[0].cells["R2C2"]?.v).toBe(1500);
    expect(out.sheets[0].cells["R2C2"]?.nf).toBe("$#,##0.00");
  });

  // ── 3. Set formula =SUM(A1:A10) ────────────────────────────────
  it("should set a SUM formula", () => {
    const model = makeModel({
      cells: { R1C1: { v: 10, t: "n" }, R2C1: { v: 20, t: "n" } },
    });
    const { model: out } = runPipeline(model, [
      { kind: "set_formula", a1: "Sheet1!A11", formula: "=SUM(A1:A10)" },
    ]);
    // normalizeFormula strips the leading '='
    expect(out.sheets[0].cells["R11C1"]?.f).toBe("SUM(A1:A10)");
  });

  // ── 4. Fill down from A1 to A1:A5 ──────────────────────────────
  it("should fill down values", () => {
    const model = makeModel({ cells: { R1C1: { v: 100, t: "n" } } });
    const { model: out } = runPipeline(model, [
      { kind: "fill_down", rangeA1: "Sheet1!A1:A5", value: 100 },
    ]);
    // Source row (1) is skipped; rows 2–5 filled with 100
    expect(out.sheets[0].cells["R2C1"]?.v).toBe(100);
    expect(out.sheets[0].cells["R5C1"]?.v).toBe(100);
  });

  // ── 5. Fill series (1,2,3... to A1:A5) ─────────────────────────
  it("should fill a linear series", () => {
    const model = makeModel({ maxRow: 20 });
    const { model: out } = runPipeline(model, [
      {
        kind: "fill_series",
        rangeA1: "Sheet1!A1:A5",
        startValue: 1,
        step: 1,
      },
    ]);
    expect(out.sheets[0].cells["R1C1"]?.v).toBe(1);
    expect(out.sheets[0].cells["R3C1"]?.v).toBe(3);
    expect(out.sheets[0].cells["R5C1"]?.v).toBe(5);
  });

  // ── 6. Sort range by column B descending ────────────────────────
  it("should sort range by column B descending", () => {
    const model = makeModel({
      maxRow: 4,
      maxCol: 2,
      cells: {
        R1C1: { v: "Name", t: "s" },
        R1C2: { v: "Score", t: "s" },
        R2C1: { v: "Alice", t: "s" },
        R2C2: { v: 70, t: "n" },
        R3C1: { v: "Bob", t: "s" },
        R3C2: { v: 90, t: "n" },
        R4C1: { v: "Charlie", t: "s" },
        R4C2: { v: 80, t: "n" },
      },
    });
    const { model: out } = runPipeline(model, [
      {
        kind: "sort_range",
        rangeA1: "Sheet1!A1:B4",
        sortSpecs: [{ column: 2, sortOrder: "DESC" }],
      },
    ]);
    // After sort: Bob (90), Charlie (80), Alice (70) — header stays row 1
    expect(out.sheets[0].cells["R2C1"]?.v).toBe("Bob");
    expect(out.sheets[0].cells["R3C1"]?.v).toBe("Charlie");
    expect(out.sheets[0].cells["R4C1"]?.v).toBe("Alice");
  });

  // ── 7. Create table with headers ───────────────────────────────
  it("should create a table", () => {
    const model = makeModel({
      maxRow: 3,
      maxCol: 2,
      cells: {
        R1C1: { v: "Name", t: "s" },
        R1C2: { v: "Age", t: "s" },
        R2C1: { v: "Alice", t: "s" },
        R2C2: { v: 30, t: "n" },
        R3C1: { v: "Bob", t: "s" },
        R3C2: { v: 25, t: "n" },
      },
    });
    const { model: out } = runPipeline(model, [
      { kind: "create_table", rangeA1: "Sheet1!A1:B3", hasHeader: true },
    ]);
    expect(out.tables?.length).toBe(1);
    expect(out.tables?.[0]?.sheetName).toBe("Sheet1");
  });

  // ── 8. Apply auto-filter ────────────────────────────────────────
  it("should apply auto-filter", () => {
    const model = makeModel({ cells: { R1C1: { v: "Name", t: "s" } } });
    const { model: out } = runPipeline(model, [
      { kind: "filter_range", rangeA1: "Sheet1!A1:C10" },
    ]);
    expect(out.sheets[0].grid.autoFilterRange).toBeTruthy();
  });

  // ── 9. Insert 3 rows at position ───────────────────────────────
  it("should insert rows", () => {
    const model = makeModel({
      maxRow: 10,
      cells: { R5C1: { v: "moved", t: "s" } },
    });
    const { model: out } = runPipeline(model, [
      // atRow: 4 → computeOpsToPatchPlan adds +1 → inserts at row 5
      { kind: "insert_rows", atRow: 4, count: 3 },
    ]);
    // Row 5 shifts to row 8 (5 + 3)
    expect(out.sheets[0].cells["R8C1"]?.v).toBe("moved");
    expect(out.sheets[0].grid.maxRow).toBe(13);
  });

  // ── 10. Delete columns C:D ──────────────────────────────────────
  it("should delete columns", () => {
    const model = makeModel({
      maxCol: 5,
      cells: {
        R1C5: { v: "keep", t: "s" },
        R1C3: { v: "delete", t: "s" },
      },
    });
    const { model: out } = runPipeline(model, [
      // atCol: 2 → computeOpsToPatchPlan adds +1 → deletes at col 3, count 2
      { kind: "delete_columns", atCol: 2, count: 2 },
    ]);
    // Column 5 shifts to column 3
    expect(out.sheets[0].cells["R1C3"]?.v).toBe("keep");
  });

  // ── 11. Merge cells A1:C1 ──────────────────────────────────────
  it("should merge cells", () => {
    const model = makeModel();
    const { model: out } = runPipeline(model, [
      { kind: "merge_cells", rangeA1: "Sheet1!A1:C1" },
    ]);
    expect(out.sheets[0].grid.merges?.length).toBe(1);
    expect(out.sheets[0].grid.merges?.[0]).toEqual({
      r1: 1,
      c1: 1,
      r2: 1,
      c2: 3,
    });
  });

  // ── 12. Wrap text in range ──────────────────────────────────────
  it("should wrap text", () => {
    const model = makeModel();
    const { model: out } = runPipeline(model, [
      { kind: "wrap_text", rangeA1: "Sheet1!A1:B2" },
    ]);
    const cell = out.sheets[0].cells["R1C1"];
    expect(cell?.s).toBeTruthy();
    const style = out.styles[cell!.s!];
    expect(style?.align?.wrap).toBe(true);
  });

  // ── 13. Conditional format: highlight top 10 ───────────────────
  it("should apply top-N conditional format", () => {
    const model = makeModel();
    const { model: out } = runPipeline(model, [
      { kind: "cond_format_top_n", rangeA1: "Sheet1!B2:B20", n: 10 },
    ]);
    expect(out.sheets[0].conditionalFormats?.length).toBeGreaterThan(0);
    expect(out.sheets[0].conditionalFormats?.[0]?.rule.type).toBe("TOP_N");
  });

  // ── 14. Conditional format: data bars ──────────────────────────
  it("should apply data bars conditional format", () => {
    const model = makeModel();
    const { model: out } = runPipeline(model, [
      {
        kind: "cond_format_data_bars",
        rangeA1: "Sheet1!B2:B20",
        color: "#4472C4",
      },
    ]);
    expect(out.sheets[0].conditionalFormats?.length).toBeGreaterThan(0);
    expect(out.sheets[0].conditionalFormats?.[0]?.rule.type).toBe("DATA_BARS");
  });

  // ── 15. Set number format to percentage ─────────────────────────
  it("should set percentage number format", () => {
    const model = makeModel({ cells: { R1C1: { v: 0.75, t: "n" } } });
    const { model: out } = runPipeline(model, [
      { kind: "set_number_format", rangeA1: "Sheet1!A1", pattern: "0.00%" },
    ]);
    expect(out.sheets[0].cells["R1C1"]?.nf).toBe("0.00%");
  });

  // ── 16. Format range (bold + color) ─────────────────────────────
  it("should format range with bold and color", () => {
    const model = makeModel();
    const { model: out } = runPipeline(model, [
      {
        kind: "format_range",
        rangeA1: "Sheet1!A1:C1",
        format: { bold: true, color: "#FF0000" },
      },
    ]);
    const cell = out.sheets[0].cells["R1C1"];
    const style = out.styles[cell!.s!];
    expect(style?.font?.bold).toBe(true);
    expect(style?.font?.color).toBe("#FF0000");
  });

  // ── 17. Add new sheet "Summary" ─────────────────────────────────
  it("should add a new sheet", () => {
    const model = makeModel();
    const { model: out } = runPipeline(model, [
      { kind: "add_sheet", title: "Summary" },
    ]);
    expect(out.sheets.length).toBe(2);
    expect(out.sheets[1].name).toBe("Summary");
  });

  // ── 18. Aggregation: SUM column B to B101 ──────────────────────
  it("should create aggregation formula", () => {
    const model = makeModel({
      maxRow: 100,
      cells: { R1C2: { v: 10, t: "n" } },
    });
    const { model: out } = runPipeline(model, [
      {
        kind: "aggregation",
        function: "SUM",
        sourceRange: "Sheet1!B2:B100",
        targetCell: "Sheet1!B101",
      },
    ]);
    // Same-sheet reference strips the sheet prefix; normalizeFormula strips '='
    expect(out.sheets[0].cells["R101C2"]?.f).toBe("SUM(B2:B100)");
  });

  // ── 19. Hide rows 5-10 ─────────────────────────────────────────
  it("should hide rows", () => {
    const model = makeModel({ maxRow: 15 });
    const { model: out } = runPipeline(model, [
      { kind: "hide_rows", rows: [5, 6, 7, 8, 9, 10] },
    ]);
    expect(out.sheets[0].grid.hiddenRows).toEqual([5, 6, 7, 8, 9, 10]);
  });

  // ── 20. Create chart model from data range ─────────────────────
  it("should create a chart model", () => {
    const model = makeModel({
      maxRow: 4,
      maxCol: 2,
      cells: {
        R1C1: { v: "Category", t: "s" },
        R1C2: { v: "Value", t: "s" },
        R2C1: { v: "A", t: "s" },
        R2C2: { v: 10, t: "n" },
        R3C1: { v: "B", t: "s" },
        R3C2: { v: 20, t: "n" },
        R4C1: { v: "C", t: "s" },
        R4C2: { v: 30, t: "n" },
      },
    });
    const { model: out } = runPipeline(model, [
      {
        kind: "create_chart",
        rangeA1: "Sheet1!A1:B4",
        spec: { type: "BAR", title: "Test Chart" },
      },
    ]);
    expect(out.charts?.length).toBe(1);
    expect(out.charts?.[0]?.spec.type).toBe("BAR");
  });
});
