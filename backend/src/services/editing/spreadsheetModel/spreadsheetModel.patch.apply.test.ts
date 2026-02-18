import { applyPatchOpsToSpreadsheetModel } from "./spreadsheetModel.patch.apply";
import { diffSpreadsheetModels } from "./spreadsheetModel.diff";
import { cellKey } from "./spreadsheetModel.range";
import type { SpreadsheetModel } from "./spreadsheetModel.types";

function baseModel(): SpreadsheetModel {
  return {
    version: 1,
    workbook: { locale: "en-US" },
    styles: {
      s_font: {
        font: { bold: true, color: "#111111" },
      },
    },
    sheets: [
      {
        id: "sheet_1",
        name: "Sheet1",
        grid: { maxRow: 10, maxCol: 10 },
        cells: {
          [cellKey(1, 1)]: { v: 5, t: "n", s: "s_font", nf: "$#,##0.00" },
          [cellKey(1, 2)]: { v: 2, t: "n" },
          [cellKey(1, 3)]: { v: 3, t: "n" },
        },
      },
    ],
    charts: [],
    tables: [],
    namedRanges: [],
    meta: {
      source: "xlsx_import",
      buildHash: "test",
    },
  };
}

describe("spreadsheetModel patch apply", () => {
  test("SET_VALUE preserves existing style", () => {
    const model = baseModel();
    const result = applyPatchOpsToSpreadsheetModel(model, [{ op: "SET_VALUE", range: "Sheet1!A1", value: 10 }]);
    expect(result.model.sheets[0].cells[cellKey(1, 1)]?.s).toBe("s_font");
    expect(result.model.sheets[0].cells[cellKey(1, 1)]?.v).toBe(10);
  });

  test("SET_NUMBER_FORMAT does not mutate value", () => {
    const model = baseModel();
    const result = applyPatchOpsToSpreadsheetModel(model, [{ op: "SET_NUMBER_FORMAT", range: "Sheet1!A1", format: "0.000" }]);
    expect(result.model.sheets[0].cells[cellKey(1, 1)]?.v).toBe(5);
    expect(result.model.sheets[0].cells[cellKey(1, 1)]?.nf).toBe("0.000");
  });

  test("SET_VALUE coercion stores numeric 0", () => {
    const model = baseModel();
    const result = applyPatchOpsToSpreadsheetModel(model, [{ op: "SET_VALUE", range: "Sheet1!B2", value: "0" }]);
    expect(result.model.sheets[0].cells[cellKey(2, 2)]?.v).toBe(0);
    expect(result.model.sheets[0].cells[cellKey(2, 2)]?.t).toBe("n");
  });

  test("NOOP diff has zero changed cells", () => {
    const model = baseModel();
    const applied = applyPatchOpsToSpreadsheetModel(model, [{ op: "SET_VALUE", range: "Sheet1!A1", value: 5 }]);
    const diff = diffSpreadsheetModels(model, applied.model);
    expect(diff.changedCellsCount).toBe(0);
    expect(diff.changed).toBe(false);
  });

  test("multi-range fanout applies to all target ranges", () => {
    const model = baseModel();
    const applied = applyPatchOpsToSpreadsheetModel(model, [
      {
        op: "SET_VALUE",
        range: "Sheet1!A1",
        ranges: ["Sheet1!B1", "Sheet1!C1"],
        value: "7",
        mode: "broadcast",
      },
    ]);

    expect(applied.model.sheets[0].cells[cellKey(1, 1)]?.v).toBe(7);
    expect(applied.model.sheets[0].cells[cellKey(1, 2)]?.v).toBe(7);
    expect(applied.model.sheets[0].cells[cellKey(1, 3)]?.v).toBe(7);
  });
});
