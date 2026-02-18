import { formatCellRef, formatRangeA1, parseCellKey, parseA1Range } from "./spreadsheetModel.range";
import type { CellModel, SheetModel, SpreadsheetModel, SpreadsheetModelDiff } from "./spreadsheetModel.types";

function stableCellSnapshot(cell: CellModel | undefined): string {
  if (!cell) return "";
  const payload = {
    v: cell.v,
    t: cell.t,
    f: cell.f,
    nf: cell.nf,
    s: cell.s,
    note: cell.note,
  };
  return JSON.stringify(payload);
}

function toDisplay(cell: CellModel | undefined): string {
  if (!cell) return "";
  if (cell.f) return `=${cell.f}`;
  if (cell.v == null) return "";
  return String(cell.v);
}

function sheetIndex(model: SpreadsheetModel): Record<string, SheetModel> {
  const out: Record<string, SheetModel> = {};
  model.sheets.forEach((sheet) => {
    out[sheet.name.toLowerCase()] = sheet;
  });
  return out;
}

function rangeFromCoords(sheetName: string, coords: Array<{ row: number; col: number }>): string {
  if (!coords.length) return `${sheetName}!A1`;
  let minRow = Number.MAX_SAFE_INTEGER;
  let minCol = Number.MAX_SAFE_INTEGER;
  let maxRow = 1;
  let maxCol = 1;
  for (const item of coords) {
    minRow = Math.min(minRow, item.row);
    minCol = Math.min(minCol, item.col);
    maxRow = Math.max(maxRow, item.row);
    maxCol = Math.max(maxCol, item.col);
  }
  return formatRangeA1({
    sheetName,
    start: { row: minRow, col: minCol },
    end: { row: maxRow, col: maxCol },
  });
}

function structureDelta(before: SheetModel | undefined, after: SheetModel | undefined): number {
  if (!before && after) return 1;
  if (before && !after) return 1;
  if (!before || !after) return 0;

  let changes = 0;
  if (before.grid.maxRow !== after.grid.maxRow) changes += 1;
  if (before.grid.maxCol !== after.grid.maxCol) changes += 1;
  if (JSON.stringify(before.grid.freeze || {}) !== JSON.stringify(after.grid.freeze || {})) changes += 1;
  if (String(before.grid.autoFilterRange || "") !== String(after.grid.autoFilterRange || "")) changes += 1;
  if ((before.grid.merges || []).length !== (after.grid.merges || []).length) changes += 1;
  if ((before.validations || []).length !== (after.validations || []).length) changes += 1;
  if ((before.conditionalFormats || []).length !== (after.conditionalFormats || []).length) changes += 1;
  return changes;
}

export function diffSpreadsheetModels(before: SpreadsheetModel, after: SpreadsheetModel): SpreadsheetModelDiff {
  const beforeSheets = sheetIndex(before);
  const afterSheets = sheetIndex(after);
  const names = Array.from(new Set([...Object.keys(beforeSheets), ...Object.keys(afterSheets)])).sort();

  const affectedRanges: string[] = [];
  const changedSamples: SpreadsheetModelDiff["changedSamples"] = [];
  let changedCellsCount = 0;
  let changedStructuresCount = 0;

  for (const key of names) {
    const beforeSheet = beforeSheets[key];
    const afterSheet = afterSheets[key];
    changedStructuresCount += structureDelta(beforeSheet, afterSheet);

    if (!beforeSheet || !afterSheet) {
      const sheetName = beforeSheet?.name || afterSheet?.name || key;
      affectedRanges.push(`${sheetName}!A1`);
      continue;
    }

    const cellKeys = Array.from(new Set([...Object.keys(beforeSheet.cells), ...Object.keys(afterSheet.cells)]));
    const coords: Array<{ row: number; col: number }> = [];

    for (const cellKeyName of cellKeys) {
      const left = beforeSheet.cells[cellKeyName];
      const right = afterSheet.cells[cellKeyName];
      if (stableCellSnapshot(left) === stableCellSnapshot(right)) continue;

      changedCellsCount += 1;
      const parsed = parseCellKey(cellKeyName);
      if (parsed) coords.push(parsed);

      if (changedSamples.length < 10 && parsed) {
        changedSamples.push({
          sheetName: afterSheet.name,
          cell: `${afterSheet.name}!${formatCellRef(parsed.row, parsed.col)}`,
          before: toDisplay(left),
          after: toDisplay(right),
        });
      }
    }

    if (coords.length) {
      affectedRanges.push(rangeFromCoords(afterSheet.name, coords));
    } else if (structureDelta(beforeSheet, afterSheet) > 0) {
      affectedRanges.push(`${afterSheet.name}!A1`);
    }
  }

  const normalizedRanges = Array.from(new Set(affectedRanges.map((item) => {
    try {
      return formatRangeA1(parseA1Range(item));
    } catch {
      return item;
    }
  })));

  return {
    changed: changedCellsCount > 0 || changedStructuresCount > 0,
    changedCellsCount,
    changedStructuresCount,
    affectedRanges: normalizedRanges,
    locateRange: normalizedRanges.length ? normalizedRanges[0] : null,
    changedSamples,
  };
}
