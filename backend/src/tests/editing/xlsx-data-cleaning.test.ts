import { describe, it, expect } from "@jest/globals";
import { computeOpsToPatchPlan } from "../../services/editing/spreadsheetModel/computeOpsToPatchPlan";
import { applyPatchOpsToSpreadsheetModel } from "../../services/editing/spreadsheetModel/spreadsheetModel.patch.apply";
import { cellKey } from "../../services/editing/spreadsheetModel/spreadsheetModel.range";
import type { SpreadsheetModel } from "../../services/editing/spreadsheetModel/spreadsheetModel.types";

/* ────────────────────────────────────────────────────────────────────────── */
/*  Helpers                                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

function makeModel(
  overrides?: Partial<{
    sheetName: string;
    maxRow: number;
    maxCol: number;
    cells: Record<
      string,
      { t?: string; v?: unknown; f?: string; nf?: string; s?: string }
    >;
  }>,
): SpreadsheetModel {
  const sheetName = overrides?.sheetName ?? "Sheet1";
  return {
    version: 1,
    workbook: { name: "test.xlsx" },
    styles: {},
    sheets: [
      {
        id: "s1",
        name: sheetName,
        grid: {
          maxRow: overrides?.maxRow ?? 10,
          maxCol: overrides?.maxCol ?? 5,
        },
        cells: overrides?.cells ?? {},
        validations: [],
        conditionalFormats: [],
      },
    ],
  } as SpreadsheetModel;
}

function runPipeline(
  model: SpreadsheetModel,
  ops: Array<Record<string, unknown>>,
  activeSheetName = "Sheet1",
) {
  const plan = computeOpsToPatchPlan({ ops, activeSheetName });
  const result = applyPatchOpsToSpreadsheetModel(model, plan.patchOps);
  return { ...result, patchOps: plan.patchOps, rejectedOps: plan.rejectedOps };
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Tests                                                                      */
/* ────────────────────────────────────────────────────────────────────────── */

describe("XLSX Data Cleaning Operators", () => {
  describe("remove_duplicates", () => {
    it("removes duplicate rows with header", () => {
      const model = makeModel({
        maxRow: 5,
        maxCol: 2,
        cells: {
          [cellKey(1, 1)]: { t: "s", v: "Name" },
          [cellKey(1, 2)]: { t: "s", v: "Value" },
          [cellKey(2, 1)]: { t: "s", v: "Alice" },
          [cellKey(2, 2)]: { t: "n", v: 10 },
          [cellKey(3, 1)]: { t: "s", v: "Bob" },
          [cellKey(3, 2)]: { t: "n", v: 20 },
          [cellKey(4, 1)]: { t: "s", v: "Alice" },
          [cellKey(4, 2)]: { t: "n", v: 10 },
          [cellKey(5, 1)]: { t: "s", v: "Carol" },
          [cellKey(5, 2)]: { t: "n", v: 30 },
        },
      });

      const result = runPipeline(model, [
        { kind: "remove_duplicates", rangeA1: "Sheet1!A1:B5", hasHeader: true },
      ]);

      expect(result.rejectedOps).toHaveLength(0);
      // After dedup: header + Alice + Bob + Carol = 4 rows.  Row 4 (Alice dup) deleted.
      const sheet = result.model.sheets[0];
      // The shifted row count should be smaller
      expect(sheet.grid.maxRow).toBeLessThan(5);
    });

    it("removes duplicates by key column", () => {
      const model = makeModel({
        maxRow: 4,
        maxCol: 2,
        cells: {
          [cellKey(1, 1)]: { t: "s", v: "Name" },
          [cellKey(1, 2)]: { t: "s", v: "Value" },
          [cellKey(2, 1)]: { t: "s", v: "Alice" },
          [cellKey(2, 2)]: { t: "n", v: 10 },
          [cellKey(3, 1)]: { t: "s", v: "Alice" },
          [cellKey(3, 2)]: { t: "n", v: 99 },
          [cellKey(4, 1)]: { t: "s", v: "Bob" },
          [cellKey(4, 2)]: { t: "n", v: 20 },
        },
      });

      const result = runPipeline(model, [
        {
          kind: "remove_duplicates",
          rangeA1: "Sheet1!A1:B4",
          keyColumns: [1],
          hasHeader: true,
        },
      ]);

      expect(result.rejectedOps).toHaveLength(0);
      // Row 3 (Alice dup by col 1) should be removed
      expect(result.model.sheets[0].grid.maxRow).toBeLessThan(4);
    });

    it("is a noop when no duplicates exist", () => {
      const model = makeModel({
        maxRow: 3,
        maxCol: 1,
        cells: {
          [cellKey(1, 1)]: { t: "s", v: "Header" },
          [cellKey(2, 1)]: { t: "s", v: "A" },
          [cellKey(3, 1)]: { t: "s", v: "B" },
        },
      });

      const result = runPipeline(model, [
        { kind: "remove_duplicates", rangeA1: "Sheet1!A1:A3", hasHeader: true },
      ]);

      expect(result.rejectedOps).toHaveLength(0);
      const status = result.statuses.find((s) => s.op === "REMOVE_DUPLICATES");
      expect(status?.status).toBe("noop");
    });
  });

  describe("trim_whitespace", () => {
    it("trims string cell values", () => {
      const model = makeModel({
        maxRow: 3,
        maxCol: 1,
        cells: {
          [cellKey(1, 1)]: { t: "s", v: "  hello  " },
          [cellKey(2, 1)]: { t: "s", v: "  world " },
          [cellKey(3, 1)]: { t: "n", v: 42 },
        },
      });

      const result = runPipeline(model, [
        { kind: "trim_whitespace", rangeA1: "Sheet1!A1:A3" },
      ]);

      expect(result.rejectedOps).toHaveLength(0);
      const sheet = result.model.sheets[0];
      expect(sheet.cells[cellKey(1, 1)]?.v).toBe("hello");
      expect(sheet.cells[cellKey(2, 1)]?.v).toBe("world");
    });

    it("preserves non-string values", () => {
      const model = makeModel({
        maxRow: 2,
        maxCol: 1,
        cells: {
          [cellKey(1, 1)]: { t: "n", v: 42 },
          [cellKey(2, 1)]: { t: "b", v: true },
        },
      });

      const result = runPipeline(model, [
        { kind: "trim_whitespace", rangeA1: "Sheet1!A1:A2" },
      ]);

      expect(result.rejectedOps).toHaveLength(0);
      const sheet = result.model.sheets[0];
      expect(sheet.cells[cellKey(1, 1)]?.v).toBe(42);
    });
  });

  describe("normalize_values", () => {
    it("normalizes dates to ISO format", () => {
      const model = makeModel({
        maxRow: 2,
        maxCol: 1,
        cells: {
          [cellKey(1, 1)]: { t: "s", v: "January 15, 2024" },
          [cellKey(2, 1)]: { t: "s", v: "2024/03/20" },
        },
      });

      const result = runPipeline(model, [
        {
          kind: "normalize_values",
          rangeA1: "Sheet1!A1:A2",
          normalization: "dates",
        },
      ]);

      expect(result.rejectedOps).toHaveLength(0);
      const sheet = result.model.sheets[0];
      // coerceScalarToTypedValue converts date strings to full ISO format
      expect(String(sheet.cells[cellKey(1, 1)]?.v)).toContain("2024-01-15");
      expect(String(sheet.cells[cellKey(2, 1)]?.v)).toContain("2024-03-20");
    });

    it("normalizes text case to upper", () => {
      const model = makeModel({
        maxRow: 2,
        maxCol: 1,
        cells: {
          [cellKey(1, 1)]: { t: "s", v: "hello world" },
          [cellKey(2, 1)]: { t: "s", v: "foo bar" },
        },
      });

      const result = runPipeline(model, [
        {
          kind: "normalize_values",
          rangeA1: "Sheet1!A1:A2",
          normalization: "text_case",
          textCase: "upper",
        },
      ]);

      expect(result.rejectedOps).toHaveLength(0);
      const sheet = result.model.sheets[0];
      expect(sheet.cells[cellKey(1, 1)]?.v).toBe("HELLO WORLD");
      expect(sheet.cells[cellKey(2, 1)]?.v).toBe("FOO BAR");
    });

    it("normalizes numbers from formatted strings", () => {
      const model = makeModel({
        maxRow: 2,
        maxCol: 1,
        cells: {
          [cellKey(1, 1)]: { t: "s", v: "$1,234.56" },
          [cellKey(2, 1)]: { t: "s", v: "  42  " },
        },
      });

      const result = runPipeline(model, [
        {
          kind: "normalize_values",
          rangeA1: "Sheet1!A1:A2",
          normalization: "numbers",
        },
      ]);

      expect(result.rejectedOps).toHaveLength(0);
      const sheet = result.model.sheets[0];
      expect(sheet.cells[cellKey(1, 1)]?.v).toBe(1234.56);
      expect(sheet.cells[cellKey(2, 1)]?.v).toBe(42);
    });
  });
});
