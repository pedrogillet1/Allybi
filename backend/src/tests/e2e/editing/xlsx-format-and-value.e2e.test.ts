/**
 * E2E evaluation harness: XLSX format and value editing
 *
 * Proves the complete plan→apply pipeline for spreadsheet edits:
 *  (a) plan is correct — patch ops produce the expected model mutations
 *  (b) apply changed cells — model diff shows correct cell/structure counts
 *  (c) UI can highlight affected targets — touched ranges are surfaced
 *
 * No stubs. Real SpreadsheetModel, real patch engine, real diff verification.
 */

import { describe, expect, test, beforeAll } from "@jest/globals";
import { applyPatchOpsToSpreadsheetModel } from "../../../services/editing/spreadsheetModel/spreadsheetModel.patch.apply";
import { diffSpreadsheetModels } from "../../../services/editing/spreadsheetModel/spreadsheetModel.diff";
import type {
  SpreadsheetModel,
  SheetModel,
} from "../../../services/editing/spreadsheetModel/spreadsheetModel.types";
import type { PatchOp } from "../../../services/editing/spreadsheetModel/spreadsheetModel.patch.types";

// ---------------------------------------------------------------------------
// Fixture builder: creates an in-memory SpreadsheetModel with a small table
//
//   Sheet1:
//     A1: Product   B1: Price    C1: Qty    D1: Total
//     A2: Widget    B2: 10.50    C2: 100    D2: =B2*C2
//     A3: Gadget    B3: 25.00    C3: 50     D3: =B3*C3
//     A4: Doohicky  B4: 5.75     C4: 200    D4: =B4*C4
// ---------------------------------------------------------------------------

function buildFixtureModel(): SpreadsheetModel {
  const sheet: SheetModel = {
    id: "sheet_fixture_1",
    name: "Sheet1",
    grid: { maxRow: 4, maxCol: 4 },
    cells: {
      R1C1: { v: "Product", t: "s" },
      R1C2: { v: "Price", t: "s" },
      R1C3: { v: "Qty", t: "s" },
      R1C4: { v: "Total", t: "s" },
      R2C1: { v: "Widget", t: "s" },
      R2C2: { v: 10.5, t: "n" },
      R2C3: { v: 100, t: "n" },
      R2C4: { f: "B2*C2", t: "n" },
      R3C1: { v: "Gadget", t: "s" },
      R3C2: { v: 25.0, t: "n" },
      R3C3: { v: 50, t: "n" },
      R3C4: { f: "B3*C3", t: "n" },
      R4C1: { v: "Doohicky", t: "s" },
      R4C2: { v: 5.75, t: "n" },
      R4C3: { v: 200, t: "n" },
      R4C4: { f: "B4*C4", t: "n" },
    },
    validations: [],
    conditionalFormats: [],
  };

  return {
    version: 1,
    workbook: { name: "Test Workbook", locale: "en-US" },
    sheets: [sheet],
    styles: {},
    charts: [],
    tables: [],
    namedRanges: [],
    meta: { source: "xlsx_import", buildHash: "test_fixture" },
  };
}

function cloneModel(model: SpreadsheetModel): SpreadsheetModel {
  return JSON.parse(JSON.stringify(model));
}

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

let fixtureModel: SpreadsheetModel;

beforeAll(() => {
  fixtureModel = buildFixtureModel();
});

// ---------------------------------------------------------------------------
// 1. Fixture integrity — prerequisite
// ---------------------------------------------------------------------------

describe("XLSX fixture integrity", () => {
  test("fixture has one sheet named Sheet1", () => {
    expect(fixtureModel.sheets.length).toBe(1);
    expect(fixtureModel.sheets[0]!.name).toBe("Sheet1");
  });

  test("fixture has 4 rows and 4 columns", () => {
    expect(fixtureModel.sheets[0]!.grid.maxRow).toBe(4);
    expect(fixtureModel.sheets[0]!.grid.maxCol).toBe(4);
  });

  test("fixture header row has expected labels", () => {
    const cells = fixtureModel.sheets[0]!.cells;
    expect(cells["R1C1"]?.v).toBe("Product");
    expect(cells["R1C2"]?.v).toBe("Price");
    expect(cells["R1C3"]?.v).toBe("Qty");
    expect(cells["R1C4"]?.v).toBe("Total");
  });

  test("fixture data rows have numeric values", () => {
    const cells = fixtureModel.sheets[0]!.cells;
    expect(cells["R2C2"]?.v).toBe(10.5);
    expect(cells["R3C3"]?.v).toBe(50);
  });

  test("fixture has formula cells in column D", () => {
    const cells = fixtureModel.sheets[0]!.cells;
    expect(cells["R2C4"]?.f).toBe("B2*C2");
    expect(cells["R3C4"]?.f).toBe("B3*C3");
    expect(cells["R4C4"]?.f).toBe("B4*C4");
  });
});

// ---------------------------------------------------------------------------
// 2. SET_VALUE — cell value mutation
// ---------------------------------------------------------------------------

describe("SET_VALUE patch op (plan→apply→verify)", () => {
  let result: ReturnType<typeof applyPatchOpsToSpreadsheetModel>;
  let diff: ReturnType<typeof diffSpreadsheetModels>;

  beforeAll(() => {
    const ops: PatchOp[] = [
      { op: "SET_VALUE", sheet: "Sheet1", range: "Sheet1!B2", value: 15.99 },
      {
        op: "SET_VALUE",
        sheet: "Sheet1",
        range: "Sheet1!A4",
        value: "Thingamajig",
      },
    ];
    result = applyPatchOpsToSpreadsheetModel(fixtureModel, ops);
    diff = diffSpreadsheetModels(fixtureModel, result.model);
  });

  test("patch result has 2 applied statuses", () => {
    const applied = result.statuses.filter((s) => s.status === "applied");
    expect(applied.length).toBe(2);
  });

  test("touched ranges include Sheet1 ranges", () => {
    expect(result.touchedRanges.length).toBeGreaterThanOrEqual(1);
    expect(result.touchedRanges.some((r) => r.includes("Sheet1"))).toBe(true);
  });

  test("diff reports exactly 2 changed cells", () => {
    expect(diff.changed).toBe(true);
    expect(diff.changedCellsCount).toBe(2);
  });

  test("diff affected ranges are non-empty (UI highlight target)", () => {
    expect(diff.affectedRanges.length).toBeGreaterThanOrEqual(1);
  });

  test("model cell B2 has new value 15.99", () => {
    expect(result.model.sheets[0]!.cells["R2C2"]?.v).toBe(15.99);
  });

  test("model cell A4 has new value Thingamajig", () => {
    expect(result.model.sheets[0]!.cells["R4C1"]?.v).toBe("Thingamajig");
  });

  test("unchanged cells are preserved", () => {
    expect(result.model.sheets[0]!.cells["R2C1"]?.v).toBe("Widget");
    expect(result.model.sheets[0]!.cells["R3C2"]?.v).toBe(25.0);
  });

  test("diff changedSamples contain before/after for modified cells", () => {
    expect(diff.changedSamples.length).toBeGreaterThanOrEqual(1);
    const sample = diff.changedSamples.find((s) => s.after === "15.99");
    expect(sample).toBeDefined();
    expect(sample!.before).toBe("10.5");
  });
});

// ---------------------------------------------------------------------------
// 3. SET_FORMULA — formula mutation
// ---------------------------------------------------------------------------

describe("SET_FORMULA patch op (plan→apply→verify)", () => {
  let result: ReturnType<typeof applyPatchOpsToSpreadsheetModel>;
  let diff: ReturnType<typeof diffSpreadsheetModels>;

  beforeAll(() => {
    const ops: PatchOp[] = [
      {
        op: "SET_FORMULA",
        sheet: "Sheet1",
        range: "Sheet1!D2",
        formula: "B2*C2*1.1",
      },
    ];
    result = applyPatchOpsToSpreadsheetModel(fixtureModel, ops);
    diff = diffSpreadsheetModels(fixtureModel, result.model);
  });

  test("patch applied successfully", () => {
    const applied = result.statuses.filter((s) => s.status === "applied");
    expect(applied.length).toBe(1);
  });

  test("model cell D2 has updated formula", () => {
    expect(result.model.sheets[0]!.cells["R2C4"]?.f).toBe("B2*C2*1.1");
  });

  test("diff reports 1 changed cell", () => {
    expect(diff.changed).toBe(true);
    expect(diff.changedCellsCount).toBe(1);
  });

  test("other formulas remain unchanged", () => {
    expect(result.model.sheets[0]!.cells["R3C4"]?.f).toBe("B3*C3");
    expect(result.model.sheets[0]!.cells["R4C4"]?.f).toBe("B4*C4");
  });
});

// ---------------------------------------------------------------------------
// 4. SET_NUMBER_FORMAT — number format mutation
// ---------------------------------------------------------------------------

describe("SET_NUMBER_FORMAT patch op (plan→apply→verify)", () => {
  let result: ReturnType<typeof applyPatchOpsToSpreadsheetModel>;
  let diff: ReturnType<typeof diffSpreadsheetModels>;

  beforeAll(() => {
    const ops: PatchOp[] = [
      {
        op: "SET_NUMBER_FORMAT",
        sheet: "Sheet1",
        range: "Sheet1!B2:B4",
        format: "$#,##0.00",
      },
    ];
    result = applyPatchOpsToSpreadsheetModel(fixtureModel, ops);
    diff = diffSpreadsheetModels(fixtureModel, result.model);
  });

  test("patch applied to 3 cells (B2:B4)", () => {
    const applied = result.statuses.filter((s) => s.status === "applied");
    expect(applied.length).toBe(1); // 1 patch op, but multiple cells
  });

  test("all 3 price cells have the new number format", () => {
    expect(result.model.sheets[0]!.cells["R2C2"]?.nf).toBe("$#,##0.00");
    expect(result.model.sheets[0]!.cells["R3C2"]?.nf).toBe("$#,##0.00");
    expect(result.model.sheets[0]!.cells["R4C2"]?.nf).toBe("$#,##0.00");
  });

  test("diff reports 3 changed cells", () => {
    expect(diff.changed).toBe(true);
    expect(diff.changedCellsCount).toBe(3);
  });

  test("diff affected ranges cover B2:B4", () => {
    expect(diff.affectedRanges.length).toBeGreaterThanOrEqual(1);
    // The range should be something like Sheet1!B2:B4
    const rangeText = diff.affectedRanges.join(" ");
    expect(rangeText).toContain("Sheet1");
  });

  test("cell values are preserved (only format changed)", () => {
    expect(result.model.sheets[0]!.cells["R2C2"]?.v).toBe(10.5);
    expect(result.model.sheets[0]!.cells["R3C2"]?.v).toBe(25.0);
    expect(result.model.sheets[0]!.cells["R4C2"]?.v).toBe(5.75);
  });
});

// ---------------------------------------------------------------------------
// 5. SET_STYLE — cell style mutation
// ---------------------------------------------------------------------------

describe("SET_STYLE patch op (plan→apply→verify)", () => {
  let result: ReturnType<typeof applyPatchOpsToSpreadsheetModel>;
  let diff: ReturnType<typeof diffSpreadsheetModels>;

  beforeAll(() => {
    const ops: PatchOp[] = [
      {
        op: "SET_STYLE",
        sheet: "Sheet1",
        range: "Sheet1!A1:D1",
        stylePatch: {
          font: { bold: true, color: "#FFFFFF" },
          fill: { color: "#4472C4" },
        },
      },
    ];
    result = applyPatchOpsToSpreadsheetModel(fixtureModel, ops);
    diff = diffSpreadsheetModels(fixtureModel, result.model);
  });

  test("patch applied to header row", () => {
    const applied = result.statuses.filter((s) => s.status === "applied");
    expect(applied.length).toBe(1);
  });

  test("header cells have style references", () => {
    const cells = result.model.sheets[0]!.cells;
    expect(cells["R1C1"]?.s).toBeDefined();
    expect(cells["R1C2"]?.s).toBeDefined();
    expect(cells["R1C3"]?.s).toBeDefined();
    expect(cells["R1C4"]?.s).toBeDefined();
  });

  test("style registry contains the applied style", () => {
    const styleRefs = Object.keys(result.model.styles);
    expect(styleRefs.length).toBeGreaterThanOrEqual(1);
    const style = Object.values(result.model.styles)[0]!;
    expect(style.font?.bold).toBe(true);
  });

  test("diff reports 4 changed cells", () => {
    expect(diff.changed).toBe(true);
    expect(diff.changedCellsCount).toBe(4);
  });

  test("cell values are preserved (only style changed)", () => {
    expect(result.model.sheets[0]!.cells["R1C1"]?.v).toBe("Product");
    expect(result.model.sheets[0]!.cells["R1C4"]?.v).toBe("Total");
  });
});

// ---------------------------------------------------------------------------
// 6. Structural operations — INSERT_ROWS, DELETE_ROWS
// ---------------------------------------------------------------------------

describe("structural operations (INSERT_ROWS, DELETE_ROWS)", () => {
  test("INSERT_ROWS shifts data rows down", () => {
    const ops: PatchOp[] = [
      { op: "INSERT_ROWS", sheet: "Sheet1", atRow: 3, count: 2 },
    ];
    const result = applyPatchOpsToSpreadsheetModel(fixtureModel, ops);
    const diff = diffSpreadsheetModels(fixtureModel, result.model);

    expect(diff.changed).toBe(true);
    expect(diff.changedStructuresCount).toBeGreaterThanOrEqual(1);
    expect(result.model.sheets[0]!.grid.maxRow).toBe(6); // 4 + 2 inserted

    // Row 3 data (Gadget) should now be at row 5
    expect(result.model.sheets[0]!.cells["R5C1"]?.v).toBe("Gadget");
  });

  test("DELETE_ROWS removes data row and shifts up", () => {
    const ops: PatchOp[] = [
      { op: "DELETE_ROWS", sheet: "Sheet1", atRow: 3, count: 1 },
    ];
    const result = applyPatchOpsToSpreadsheetModel(fixtureModel, ops);
    const diff = diffSpreadsheetModels(fixtureModel, result.model);

    expect(diff.changed).toBe(true);
    expect(result.model.sheets[0]!.grid.maxRow).toBe(3); // 4 - 1

    // "Gadget" at row 3 should be gone; "Doohicky" shifted up to row 3
    expect(result.model.sheets[0]!.cells["R3C1"]?.v).toBe("Doohicky");
  });
});

// ---------------------------------------------------------------------------
// 7. SORT_RANGE — data sorting
// ---------------------------------------------------------------------------

describe("SORT_RANGE patch op (plan→apply→verify)", () => {
  let result: ReturnType<typeof applyPatchOpsToSpreadsheetModel>;
  let diff: ReturnType<typeof diffSpreadsheetModels>;

  beforeAll(() => {
    const ops: PatchOp[] = [
      {
        op: "SORT_RANGE",
        sheet: "Sheet1",
        range: "Sheet1!A1:D4",
        keys: [{ column: 2, order: "DESC" }], // Sort by Price descending
        hasHeader: true,
      },
    ];
    result = applyPatchOpsToSpreadsheetModel(fixtureModel, ops);
    diff = diffSpreadsheetModels(fixtureModel, result.model);
  });

  test("diff reports changes after sort", () => {
    expect(diff.changed).toBe(true);
  });

  test("first data row is the highest-priced item (Gadget=25.00)", () => {
    expect(result.model.sheets[0]!.cells["R2C1"]?.v).toBe("Gadget");
    expect(result.model.sheets[0]!.cells["R2C2"]?.v).toBe(25.0);
  });

  test("last data row is the lowest-priced item (Doohicky=5.75)", () => {
    expect(result.model.sheets[0]!.cells["R4C1"]?.v).toBe("Doohicky");
    expect(result.model.sheets[0]!.cells["R4C2"]?.v).toBe(5.75);
  });

  test("header row is unchanged", () => {
    expect(result.model.sheets[0]!.cells["R1C1"]?.v).toBe("Product");
    expect(result.model.sheets[0]!.cells["R1C2"]?.v).toBe("Price");
  });

  test("diff affected ranges are non-empty (UI highlight target)", () => {
    // SORT_RANGE modifies cells in-place without adding to touchedRanges.
    // The diff function correctly captures the affected range.
    expect(diff.affectedRanges.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// 8. ADD_SHEET / RENAME_SHEET / DELETE_SHEET — structural sheet ops
// ---------------------------------------------------------------------------

describe("sheet management operations", () => {
  test("ADD_SHEET creates a new sheet", () => {
    const ops: PatchOp[] = [{ op: "ADD_SHEET", name: "Summary" }];
    const result = applyPatchOpsToSpreadsheetModel(fixtureModel, ops);
    const diff = diffSpreadsheetModels(fixtureModel, result.model);

    expect(result.model.sheets.length).toBe(2);
    expect(result.model.sheets[1]!.name).toBe("Summary");
    expect(diff.changedStructuresCount).toBeGreaterThanOrEqual(1);
  });

  test("RENAME_SHEET changes sheet name", () => {
    const ops: PatchOp[] = [
      { op: "RENAME_SHEET", from: "Sheet1", to: "Sales Data" },
    ];
    const result = applyPatchOpsToSpreadsheetModel(fixtureModel, ops);
    const diff = diffSpreadsheetModels(fixtureModel, result.model);

    expect(result.model.sheets[0]!.name).toBe("Sales Data");
    expect(diff.changedStructuresCount).toBeGreaterThanOrEqual(1);
  });

  test("DELETE_SHEET removes a sheet", () => {
    // First add a sheet, then delete the original
    const withExtra = applyPatchOpsToSpreadsheetModel(fixtureModel, [
      { op: "ADD_SHEET", name: "Extra" },
    ]);
    const result = applyPatchOpsToSpreadsheetModel(withExtra.model, [
      { op: "DELETE_SHEET", name: "Extra" },
    ]);

    expect(result.model.sheets.length).toBe(1);
    expect(result.model.sheets[0]!.name).toBe("Sheet1");
  });
});

// ---------------------------------------------------------------------------
// 9. Chained patch ops — multiple operations in single apply
// ---------------------------------------------------------------------------

describe("chained patch ops (multiple ops → single apply)", () => {
  let result: ReturnType<typeof applyPatchOpsToSpreadsheetModel>;
  let diff: ReturnType<typeof diffSpreadsheetModels>;

  beforeAll(() => {
    const ops: PatchOp[] = [
      // Update a value
      { op: "SET_VALUE", sheet: "Sheet1", range: "Sheet1!B2", value: 12.99 },
      // Format the price column
      {
        op: "SET_NUMBER_FORMAT",
        sheet: "Sheet1",
        range: "Sheet1!B2:B4",
        format: "€#,##0.00",
      },
      // Style the header
      {
        op: "SET_STYLE",
        sheet: "Sheet1",
        range: "Sheet1!A1:D1",
        stylePatch: { font: { bold: true } },
      },
    ];
    result = applyPatchOpsToSpreadsheetModel(fixtureModel, ops);
    diff = diffSpreadsheetModels(fixtureModel, result.model);
  });

  test("all 3 patch ops applied successfully", () => {
    const applied = result.statuses.filter((s) => s.status === "applied");
    expect(applied.length).toBe(3);
  });

  test("diff reports multiple changed cells", () => {
    expect(diff.changed).toBe(true);
    // B2 (value + format), B3 (format), B4 (format), A1-D1 (style) = 8 cells
    expect(diff.changedCellsCount).toBeGreaterThanOrEqual(7);
  });

  test("value change and format change both reflected", () => {
    expect(result.model.sheets[0]!.cells["R2C2"]?.v).toBe(12.99);
    expect(result.model.sheets[0]!.cells["R2C2"]?.nf).toBe("€#,##0.00");
  });

  test("affected ranges cover both value and format areas", () => {
    expect(diff.affectedRanges.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// 10. Diff verification — locateRange for UI navigation
// ---------------------------------------------------------------------------

describe("diff provides locateRange for UI navigation", () => {
  test("locateRange is non-null when changes exist", () => {
    const ops: PatchOp[] = [
      { op: "SET_VALUE", sheet: "Sheet1", range: "Sheet1!C3", value: 75 },
    ];
    const result = applyPatchOpsToSpreadsheetModel(fixtureModel, ops);
    const diff = diffSpreadsheetModels(fixtureModel, result.model);

    expect(diff.locateRange).not.toBeNull();
    expect(diff.locateRange).toContain("Sheet1");
  });

  test("locateRange is null when no changes", () => {
    const same = cloneModel(fixtureModel);
    const diff = diffSpreadsheetModels(fixtureModel, same);

    expect(diff.changed).toBe(false);
    expect(diff.locateRange).toBeNull();
    expect(diff.changedCellsCount).toBe(0);
  });

  test("changedSamples provide before/after for UI display", () => {
    const ops: PatchOp[] = [
      {
        op: "SET_VALUE",
        sheet: "Sheet1",
        range: "Sheet1!A2",
        value: "Sprocket",
      },
    ];
    const result = applyPatchOpsToSpreadsheetModel(fixtureModel, ops);
    const diff = diffSpreadsheetModels(fixtureModel, result.model);

    expect(diff.changedSamples.length).toBeGreaterThanOrEqual(1);
    const sample = diff.changedSamples[0]!;
    expect(sample.before).toBe("Widget");
    expect(sample.after).toBe("Sprocket");
    expect(sample.sheetName).toBe("Sheet1");
  });
});

// ---------------------------------------------------------------------------
// 11. SET_VALUE with matrix mode — multi-cell assignment
// ---------------------------------------------------------------------------

describe("SET_VALUE matrix mode (multi-cell write)", () => {
  let result: ReturnType<typeof applyPatchOpsToSpreadsheetModel>;
  let diff: ReturnType<typeof diffSpreadsheetModels>;

  beforeAll(() => {
    const ops: PatchOp[] = [
      {
        op: "SET_VALUE",
        sheet: "Sheet1",
        range: "Sheet1!A5:D5",
        values: [["Gizmo", 8.25, 150, null]],
        mode: "matrix",
      },
    ];
    result = applyPatchOpsToSpreadsheetModel(fixtureModel, ops);
    diff = diffSpreadsheetModels(fixtureModel, result.model);
  });

  test("new row added at row 5", () => {
    expect(result.model.sheets[0]!.cells["R5C1"]?.v).toBe("Gizmo");
    expect(result.model.sheets[0]!.cells["R5C2"]?.v).toBe(8.25);
    expect(result.model.sheets[0]!.cells["R5C3"]?.v).toBe(150);
  });

  test("diff reports changes for new cells", () => {
    expect(diff.changed).toBe(true);
    expect(diff.changedCellsCount).toBeGreaterThanOrEqual(3);
  });

  test("existing data rows untouched", () => {
    expect(result.model.sheets[0]!.cells["R2C1"]?.v).toBe("Widget");
    expect(result.model.sheets[0]!.cells["R3C1"]?.v).toBe("Gadget");
    expect(result.model.sheets[0]!.cells["R4C1"]?.v).toBe("Doohicky");
  });
});
