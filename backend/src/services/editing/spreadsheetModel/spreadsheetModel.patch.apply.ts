import { extractChartDataFromRange } from "./spreadsheetModel.charts";
import {
  clearAutoFilterRange,
  setAutoFilterRange,
} from "./spreadsheetModel.sortFilter";
import { mergeStyleModels, registerStyle } from "./spreadsheetModel.style";
import { upsertTable } from "./spreadsheetModel.table";
import { setConditionalFormat } from "./spreadsheetModel.conditionalFormat";
import {
  clearValidationRule,
  setValidationRule,
} from "./spreadsheetModel.validation";
import {
  cellKey,
  forEachCellInRange,
  formatCellRef,
  formatRangeA1,
  parseA1Range,
  parseCellKey,
} from "./spreadsheetModel.range";
import { validatePatchOps } from "./spreadsheetModel.patch.validate";
import {
  coerceScalarToTypedValue,
  normalizeFormula,
} from "./spreadsheetModel.valueCoercion";
import type {
  PatchApplyResult,
  PatchApplyStatus,
  PatchOp,
} from "./spreadsheetModel.patch.types";
import type {
  CellModel,
  SheetModel,
  SpreadsheetModel,
  SortKey,
} from "./spreadsheetModel.types";

function cloneModel<T>(input: T): T {
  return JSON.parse(JSON.stringify(input));
}

function getSheetByName(
  model: SpreadsheetModel,
  sheetName: string,
): SheetModel | undefined {
  const needle = String(sheetName || "")
    .trim()
    .toLowerCase();
  return model.sheets.find(
    (sheet) => sheet.name.trim().toLowerCase() === needle,
  );
}

function ensureSheetByName(
  model: SpreadsheetModel,
  sheetName: string,
): SheetModel {
  const out = getSheetByName(model, sheetName);
  if (!out) throw new Error(`Sheet not found: ${sheetName}`);
  return out;
}

function bumpGridBounds(sheet: SheetModel, row: number, col: number): void {
  sheet.grid.maxRow = Math.max(Number(sheet.grid.maxRow || 0), row);
  sheet.grid.maxCol = Math.max(Number(sheet.grid.maxCol || 0), col);
}

function setCellValuePreserveStyle(
  sheet: SheetModel,
  row: number,
  col: number,
  value: unknown,
): boolean {
  const key = cellKey(row, col);
  const prev = sheet.cells[key] || {};
  const next: CellModel = { ...prev };

  delete next.f;
  const typed = coerceScalarToTypedValue(value);
  next.v = typed.v;
  next.t = typed.t;

  const changed = JSON.stringify(prev) !== JSON.stringify(next);
  if (changed) sheet.cells[key] = next;
  bumpGridBounds(sheet, row, col);
  return changed;
}

function setCellFormulaPreserveStyle(
  sheet: SheetModel,
  row: number,
  col: number,
  formula: string,
): boolean {
  const key = cellKey(row, col);
  const prev = sheet.cells[key] || {};
  const next: CellModel = { ...prev, f: normalizeFormula(formula) };
  if (!next.f) return false;
  const changed = JSON.stringify(prev) !== JSON.stringify(next);
  if (changed) sheet.cells[key] = next;
  bumpGridBounds(sheet, row, col);
  return changed;
}

function clearCellContent(
  sheet: SheetModel,
  row: number,
  col: number,
): boolean {
  const key = cellKey(row, col);
  const prev = sheet.cells[key];
  if (!prev) return false;
  const next: CellModel = { ...prev };
  delete next.v;
  delete next.t;
  delete next.f;
  delete next.note;
  const changed = JSON.stringify(prev) !== JSON.stringify(next);
  if (!changed) return false;
  if (Object.keys(next).length) sheet.cells[key] = next;
  else delete sheet.cells[key];
  return true;
}

function setNumberFormat(
  sheet: SheetModel,
  row: number,
  col: number,
  format: string,
): boolean {
  const key = cellKey(row, col);
  const prev = sheet.cells[key] || {};
  const next: CellModel = { ...prev, nf: String(format || "").trim() };
  if (!next.nf) delete next.nf;
  const changed = JSON.stringify(prev) !== JSON.stringify(next);
  if (changed) sheet.cells[key] = next;
  bumpGridBounds(sheet, row, col);
  return changed;
}

function clearFormatting(sheet: SheetModel, row: number, col: number): boolean {
  const key = cellKey(row, col);
  const prev = sheet.cells[key];
  if (!prev) return false;
  const next: CellModel = { ...prev };
  delete next.s;
  delete next.nf;
  const changed = JSON.stringify(prev) !== JSON.stringify(next);
  if (!changed) return false;
  if (Object.keys(next).length) sheet.cells[key] = next;
  else delete sheet.cells[key];
  return true;
}

function setStyle(
  sheet: SheetModel,
  model: SpreadsheetModel,
  row: number,
  col: number,
  patch: PatchOp & { op: "SET_STYLE" },
): boolean {
  const key = cellKey(row, col);
  const prev = sheet.cells[key] || {};
  const currentStyle = prev.s ? model.styles[prev.s] : null;
  const nextStyle =
    patch.merge === "override"
      ? patch.stylePatch
      : mergeStyleModels(currentStyle, patch.stylePatch);
  const styleRef = registerStyle(model, nextStyle);
  const next: CellModel = {
    ...prev,
    ...(styleRef ? { s: styleRef } : {}),
  };
  if (!styleRef) delete next.s;
  const changed = JSON.stringify(prev) !== JSON.stringify(next);
  if (changed) sheet.cells[key] = next;
  bumpGridBounds(sheet, row, col);
  return changed;
}

function shiftRows(
  sheet: SheetModel,
  atRow: number,
  count: number,
  mode: "insert" | "delete",
): boolean {
  const nextCells: Record<string, CellModel> = {};
  let changed = false;

  for (const [key, value] of Object.entries(sheet.cells)) {
    const pos = parseCellKey(key);
    if (!pos) continue;
    if (mode === "insert") {
      const targetRow = pos.row >= atRow ? pos.row + count : pos.row;
      if (targetRow !== pos.row) changed = true;
      nextCells[cellKey(targetRow, pos.col)] = value;
      continue;
    }

    const deleteEnd = atRow + count - 1;
    if (pos.row >= atRow && pos.row <= deleteEnd) {
      changed = true;
      continue;
    }

    const targetRow = pos.row > deleteEnd ? pos.row - count : pos.row;
    if (targetRow !== pos.row) changed = true;
    nextCells[cellKey(targetRow, pos.col)] = value;
  }

  if (changed) {
    sheet.cells = nextCells;
    sheet.grid.maxRow = Math.max(
      1,
      Number(sheet.grid.maxRow || 1) + (mode === "insert" ? count : -count),
    );
  }

  return changed;
}

function shiftCols(
  sheet: SheetModel,
  atCol: number,
  count: number,
  mode: "insert" | "delete",
): boolean {
  const nextCells: Record<string, CellModel> = {};
  let changed = false;

  for (const [key, value] of Object.entries(sheet.cells)) {
    const pos = parseCellKey(key);
    if (!pos) continue;
    if (mode === "insert") {
      const targetCol = pos.col >= atCol ? pos.col + count : pos.col;
      if (targetCol !== pos.col) changed = true;
      nextCells[cellKey(pos.row, targetCol)] = value;
      continue;
    }

    const deleteEnd = atCol + count - 1;
    if (pos.col >= atCol && pos.col <= deleteEnd) {
      changed = true;
      continue;
    }

    const targetCol = pos.col > deleteEnd ? pos.col - count : pos.col;
    if (targetCol !== pos.col) changed = true;
    nextCells[cellKey(pos.row, targetCol)] = value;
  }

  if (changed) {
    sheet.cells = nextCells;
    sheet.grid.maxCol = Math.max(
      1,
      Number(sheet.grid.maxCol || 1) + (mode === "insert" ? count : -count),
    );
  }

  return changed;
}

function valueForSort(cell?: CellModel): string | number {
  const raw = cell?.v;
  if (typeof raw === "number") return raw;
  if (typeof raw === "boolean") return raw ? 1 : 0;
  const asNumber = Number(String(raw ?? "").replace(/,/g, ""));
  if (Number.isFinite(asNumber) && String(raw ?? "").trim() !== "")
    return asNumber;
  return String(raw ?? "").toLowerCase();
}

function resolveSortColumn(
  startCol: number,
  width: number,
  key: SortKey,
): number {
  if (typeof key.column === "number") {
    const n = Math.trunc(key.column);
    if (n >= 1 && n <= width) return startCol + (n - 1);
    return Math.max(1, n);
  }
  const text = String(key.column || "").trim();
  if (!text) return startCol;
  if (/^[A-Za-z]+$/.test(text)) {
    let out = 0;
    for (const ch of text.toUpperCase())
      out = out * 26 + (ch.charCodeAt(0) - 64);
    return Math.max(1, out);
  }
  return startCol;
}

function sortRange(
  sheet: SheetModel,
  op: PatchOp & { op: "SORT_RANGE" },
): boolean {
  const parsed = parseA1Range(op.range, op.sheet || undefined);
  const width = parsed.end.col - parsed.start.col + 1;
  const hasHeader = op.hasHeader !== false;
  const dataStart = hasHeader ? parsed.start.row + 1 : parsed.start.row;
  if (dataStart > parsed.end.row) return false;

  type RowData = { rowNumber: number; cells: CellModel[] };
  const rows: RowData[] = [];
  for (let r = dataStart; r <= parsed.end.row; r += 1) {
    const cells: CellModel[] = [];
    for (let c = parsed.start.col; c <= parsed.end.col; c += 1) {
      cells.push({ ...(sheet.cells[cellKey(r, c)] || {}) });
    }
    rows.push({ rowNumber: r, cells });
  }

  const keys =
    Array.isArray(op.keys) && op.keys.length
      ? op.keys
      : [{ column: 1, order: "ASC" as const }];
  rows.sort((left, right) => {
    for (const key of keys) {
      const col = resolveSortColumn(parsed.start.col, width, key);
      const idx = col - parsed.start.col;
      const av = valueForSort(left.cells[idx]);
      const bv = valueForSort(right.cells[idx]);
      if (av === bv) continue;
      const cmp = av > bv ? 1 : -1;
      const order = String(key.order || "ASC").toUpperCase();
      return order.startsWith("DESC") ? -cmp : cmp;
    }
    return 0;
  });

  let changed = false;
  rows.forEach((row, idx) => {
    const targetRow = dataStart + idx;
    for (let c = parsed.start.col; c <= parsed.end.col; c += 1) {
      const keyOut = cellKey(targetRow, c);
      const next = row.cells[c - parsed.start.col] || {};
      const prev = sheet.cells[keyOut] || {};
      if (JSON.stringify(prev) !== JSON.stringify(next)) {
        changed = true;
        if (Object.keys(next).length) sheet.cells[keyOut] = { ...next };
        else delete sheet.cells[keyOut];
      }
    }
  });

  return changed;
}

function rangeList(op: { range: string; ranges?: string[] }): string[] {
  const out = [op.range, ...(Array.isArray(op.ranges) ? op.ranges : [])]
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return Array.from(new Set(out));
}

export function applyPatchOpsToSpreadsheetModel(
  modelInput: SpreadsheetModel,
  patchOpsInput: PatchOp[],
): PatchApplyResult {
  const model = cloneModel(modelInput);
  const statuses: PatchApplyStatus[] = [];
  const touchedRanges = new Set<string>();
  let changedStructuresCount = 0;

  const validated = validatePatchOps(model, patchOpsInput);
  const rejectedSet = new Set(validated.rejectedOps);

  validated.rejectedOps.forEach((line) => {
    statuses.push({
      index: Number(line.match(/^op#(\d+):/)?.[1] || 0),
      op: "SET_VALUE",
      status: "rejected",
      message: line,
    });
  });

  validated.validOps.forEach((op, index) => {
    try {
      let changed = false;

      if (op.op === "ADD_SHEET") {
        const name = String(op.name || "").trim();
        if (!name) throw new Error("Sheet name is required");
        if (getSheetByName(model, name))
          throw new Error(`Sheet already exists: ${name}`);
        model.sheets.push({
          id: `sheet_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name,
          grid: { maxRow: 1, maxCol: 1 },
          cells: {},
          validations: [],
          conditionalFormats: [],
        });
        changed = true;
        changedStructuresCount += 1;
      } else if (op.op === "RENAME_SHEET") {
        const sheet = ensureSheetByName(model, op.from);
        const target = String(op.to || "").trim();
        if (!target) throw new Error("RENAME_SHEET requires destination name");
        if (getSheetByName(model, target))
          throw new Error(`Sheet already exists: ${target}`);
        if (sheet.name !== target) {
          sheet.name = target;
          changed = true;
          changedStructuresCount += 1;
        }
      } else if (op.op === "DELETE_SHEET") {
        const before = model.sheets.length;
        model.sheets = model.sheets.filter(
          (sheet) =>
            sheet.name.toLowerCase() !==
            String(op.name || "")
              .trim()
              .toLowerCase(),
        );
        changed = model.sheets.length !== before;
        if (changed) changedStructuresCount += 1;
      } else if (op.op === "INSERT_ROWS") {
        const sheet = ensureSheetByName(model, op.sheet);
        changed = shiftRows(
          sheet,
          Math.max(1, Math.trunc(op.atRow)),
          Math.max(1, Math.trunc(op.count || 1)),
          "insert",
        );
        if (changed) changedStructuresCount += 1;
      } else if (op.op === "DELETE_ROWS") {
        const sheet = ensureSheetByName(model, op.sheet);
        changed = shiftRows(
          sheet,
          Math.max(1, Math.trunc(op.atRow)),
          Math.max(1, Math.trunc(op.count || 1)),
          "delete",
        );
        if (changed) changedStructuresCount += 1;
      } else if (op.op === "INSERT_COLUMNS") {
        const sheet = ensureSheetByName(model, op.sheet);
        changed = shiftCols(
          sheet,
          Math.max(1, Math.trunc(op.atCol)),
          Math.max(1, Math.trunc(op.count || 1)),
          "insert",
        );
        if (changed) changedStructuresCount += 1;
      } else if (op.op === "DELETE_COLUMNS") {
        const sheet = ensureSheetByName(model, op.sheet);
        changed = shiftCols(
          sheet,
          Math.max(1, Math.trunc(op.atCol)),
          Math.max(1, Math.trunc(op.count || 1)),
          "delete",
        );
        if (changed) changedStructuresCount += 1;
      } else if (op.op === "CLEAR_FILTER") {
        const sheet = ensureSheetByName(model, op.sheet);
        const before = sheet.grid.autoFilterRange;
        clearAutoFilterRange(sheet);
        changed = Boolean(before);
      } else if (op.op === "FREEZE_PANES") {
        const sheet = ensureSheetByName(model, op.sheet);
        const next = {
          rowSplit: Math.max(0, Math.trunc(op.rowSplit || 0)),
          colSplit: Math.max(0, Math.trunc(op.colSplit || 0)),
        };
        if (JSON.stringify(sheet.grid.freeze || {}) !== JSON.stringify(next)) {
          sheet.grid.freeze = next;
          changed = true;
        }
      } else if (op.op === "FILTER_RANGE") {
        const parsed = parseA1Range(op.range, op.sheet);
        const sheet = ensureSheetByName(model, parsed.sheetName);
        const next = formatRangeA1(parsed);
        if (sheet.grid.autoFilterRange !== next) {
          setAutoFilterRange(sheet, next);
          changed = true;
        }
      } else if (op.op === "SORT_RANGE") {
        const parsed = parseA1Range(op.range, op.sheet);
        const sheet = ensureSheetByName(model, parsed.sheetName);
        changed = sortRange(sheet, op);
      } else if (op.op === "CREATE_TABLE") {
        const parsed = parseA1Range(op.range, op.sheet);
        upsertTable(model, {
          id: String(
            op.name ||
              `table_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          ),
          sheetName: parsed.sheetName,
          range: formatRangeA1(parsed),
          hasHeader: op.hasHeader !== false,
          style: op.style,
        });

        // Apply thin borders to all cells so the live preview shows table outlines
        const tableSheet = ensureSheetByName(model, parsed.sheetName);
        const thinBorder = { style: "thin" };
        const borderPatch = {
          border: {
            top: thinBorder,
            bottom: thinBorder,
            left: thinBorder,
            right: thinBorder,
          },
        };
        for (let r = parsed.start.row; r <= parsed.end.row; r++) {
          for (let c = parsed.start.col; c <= parsed.end.col; c++) {
            const k = cellKey(r, c);
            const existing = tableSheet.cells[k] || {};
            const currentStyle = existing.s ? model.styles[existing.s] : {};
            // Header row: bold + accent fill
            const isHeader = op.hasHeader !== false && r === parsed.start.row;
            const extra = isHeader
              ? { font: { bold: true }, fill: { color: "#4472C4" } }
              : {};
            const merged = mergeStyleModels(currentStyle, {
              ...borderPatch,
              ...extra,
            });
            const ref = registerStyle(model, merged);
            tableSheet.cells[k] = { ...existing, ...(ref ? { s: ref } : {}) };
            bumpGridBounds(tableSheet, r, c);
          }
        }

        changed = true;
        changedStructuresCount += 1;
      } else if (op.op === "SET_VALIDATION") {
        const parsed = parseA1Range(op.range, op.sheet);
        const sheet = ensureSheetByName(model, parsed.sheetName);
        setValidationRule(sheet, formatRangeA1(parsed), op.rule);
        changed = true;
      } else if (op.op === "CLEAR_VALIDATION") {
        const parsed = parseA1Range(op.range, op.sheet);
        const sheet = ensureSheetByName(model, parsed.sheetName);
        const before = Array.isArray(sheet.validations)
          ? sheet.validations.length
          : 0;
        clearValidationRule(sheet, formatRangeA1(parsed));
        const after = Array.isArray(sheet.validations)
          ? sheet.validations.length
          : 0;
        changed = before !== after;
      } else if (op.op === "SET_CONDITIONAL_FORMAT") {
        const parsed = parseA1Range(op.range, op.sheet);
        const sheet = ensureSheetByName(model, parsed.sheetName);
        setConditionalFormat(sheet, formatRangeA1(parsed), op.rule);
        changed = true;
      } else if (op.op === "CREATE_CHART_CARD") {
        const parsed = parseA1Range(op.range, op.sheet);
        const chart = extractChartDataFromRange({
          model,
          sheetName: parsed.sheetName,
          range: formatRangeA1(parsed),
          spec: op.chart,
        });
        model.charts = [...(model.charts || []), chart];
        changed = true;
        changedStructuresCount += 1;
      } else if (op.op === "MERGE_CELLS") {
        const parsed = parseA1Range(op.range, op.sheet);
        const sheet = ensureSheetByName(model, parsed.sheetName);
        if (!sheet.grid.merges) sheet.grid.merges = [];
        const merge = {
          r1: parsed.start.row,
          c1: parsed.start.col,
          r2: parsed.end.row,
          c2: parsed.end.col,
        };
        const exists = sheet.grid.merges.some(
          (m) =>
            m.r1 === merge.r1 &&
            m.c1 === merge.c1 &&
            m.r2 === merge.r2 &&
            m.c2 === merge.c2,
        );
        if (!exists) {
          sheet.grid.merges.push(merge);
          changed = true;
          changedStructuresCount += 1;
        }
      } else if (op.op === "UNMERGE_CELLS") {
        const parsed = parseA1Range(op.range, op.sheet);
        const sheet = ensureSheetByName(model, parsed.sheetName);
        if (Array.isArray(sheet.grid.merges)) {
          const before = sheet.grid.merges.length;
          sheet.grid.merges = sheet.grid.merges.filter(
            (m) =>
              !(
                m.r1 === parsed.start.row &&
                m.c1 === parsed.start.col &&
                m.r2 === parsed.end.row &&
                m.c2 === parsed.end.col
              ),
          );
          changed = sheet.grid.merges.length !== before;
          if (changed) changedStructuresCount += 1;
        }
      } else if (op.op === "SET_ROW_VISIBILITY") {
        const sheet = ensureSheetByName(model, op.sheet);
        if (!sheet.grid.hiddenRows) sheet.grid.hiddenRows = [];
        const set = new Set(sheet.grid.hiddenRows);
        for (const row of op.rows) {
          if (op.hidden) {
            if (!set.has(row)) {
              set.add(row);
              changed = true;
            }
          } else {
            if (set.has(row)) {
              set.delete(row);
              changed = true;
            }
          }
        }
        sheet.grid.hiddenRows = Array.from(set).sort((a, b) => a - b);
      } else if (op.op === "SET_COL_VISIBILITY") {
        const sheet = ensureSheetByName(model, op.sheet);
        if (!sheet.grid.hiddenColumns) sheet.grid.hiddenColumns = [];
        const set = new Set(sheet.grid.hiddenColumns);
        for (const col of op.cols) {
          if (op.hidden) {
            if (!set.has(col)) {
              set.add(col);
              changed = true;
            }
          } else {
            if (set.has(col)) {
              set.delete(col);
              changed = true;
            }
          }
        }
        sheet.grid.hiddenColumns = Array.from(set).sort((a, b) => a - b);
      } else if (op.op === "REMOVE_DUPLICATES") {
        const parsed = parseA1Range(op.range, op.sheet);
        const sheet = ensureSheetByName(model, parsed.sheetName);
        const hasHeader = op.hasHeader !== false;
        const dataStart = hasHeader ? parsed.start.row + 1 : parsed.start.row;
        if (dataStart <= parsed.end.row) {
          const width = parsed.end.col - parsed.start.col + 1;
          const keyCols =
            Array.isArray(op.keyColumns) && op.keyColumns.length > 0
              ? op.keyColumns.map((c) => c - 1)
              : Array.from({ length: width }, (_, i) => i);
          const seen = new Set<string>();
          const dupeRows: number[] = [];
          for (let r = dataStart; r <= parsed.end.row; r += 1) {
            const parts: string[] = [];
            for (const ki of keyCols) {
              const c = parsed.start.col + ki;
              const cell = sheet.cells[cellKey(r, c)];
              parts.push(JSON.stringify(cell?.v ?? ""));
            }
            const fp = parts.join("|");
            if (seen.has(fp)) {
              dupeRows.push(r);
            } else {
              seen.add(fp);
            }
          }
          // Delete bottom-up to keep indices stable
          for (let i = dupeRows.length - 1; i >= 0; i -= 1) {
            shiftRows(sheet, dupeRows[i], 1, "delete");
            changed = true;
          }
          if (changed) changedStructuresCount += 1;
        }
      } else if (op.op === "TRIM_WHITESPACE") {
        const parsed = parseA1Range(op.range, op.sheet);
        const sheet = ensureSheetByName(model, parsed.sheetName);
        forEachCellInRange(parsed, (row, col) => {
          const key = cellKey(row, col);
          const cell = sheet.cells[key];
          if (cell && typeof cell.v === "string") {
            const trimmed = cell.v.trim();
            if (trimmed !== cell.v) {
              changed =
                setCellValuePreserveStyle(sheet, row, col, trimmed) || changed;
            }
          }
        });
      } else if (op.op === "NORMALIZE_VALUES") {
        const parsed = parseA1Range(op.range, op.sheet);
        const sheet = ensureSheetByName(model, parsed.sheetName);
        forEachCellInRange(parsed, (row, col) => {
          const key = cellKey(row, col);
          const cell = sheet.cells[key];
          if (!cell || cell.v == null) return;

          if (op.normalization === "text_case" && typeof cell.v === "string") {
            const mode = op.textCase || "lower";
            let next: string;
            if (mode === "upper") next = cell.v.toUpperCase();
            else if (mode === "title")
              next = cell.v.replace(/\b\w/g, (ch) => ch.toUpperCase());
            else next = cell.v.toLowerCase();
            if (next !== cell.v) {
              changed =
                setCellValuePreserveStyle(sheet, row, col, next) || changed;
            }
          } else if (
            op.normalization === "numbers" &&
            typeof cell.v === "string"
          ) {
            const cleaned = cell.v.replace(/[,$\s%]/g, "");
            const n = Number(cleaned);
            if (Number.isFinite(n)) {
              changed =
                setCellValuePreserveStyle(sheet, row, col, n) || changed;
            }
          } else if (
            op.normalization === "dates" &&
            typeof cell.v === "string"
          ) {
            const d = new Date(cell.v);
            if (!Number.isNaN(d.getTime())) {
              const fmt = op.dateFormat || "YYYY-MM-DD";
              const iso = d.toISOString().slice(0, 10);
              const formatted = fmt === "YYYY-MM-DD" ? iso : iso;
              changed =
                setCellValuePreserveStyle(sheet, row, col, formatted) ||
                changed;
            }
          }
        });
      } else if (op.op === "SET_SHEET_PROTECTION") {
        const sheet = ensureSheetByName(model, op.sheet);
        (sheet as any).protection = {
          enabled: true,
          ...(op.password ? { password: op.password } : {}),
          ...(op.options || {}),
        };
        changed = true;
      } else if (op.op === "SET_CELL_PROTECTION") {
        const parsed = parseA1Range(op.range, op.sheet);
        const sheet = ensureSheetByName(model, parsed.sheetName);
        forEachCellInRange(parsed, (row, col) => {
          const key = cellKey(row, col);
          if (!sheet.cells[key]) sheet.cells[key] = {};
          (sheet.cells[key] as any).protection = {
            locked: op.locked,
            ...(op.hidden != null ? { hidden: op.hidden } : {}),
          };
          changed = true;
        });
      } else if (op.op === "SET_COL_WIDTH") {
        const sheet = ensureSheetByName(model, op.sheet);
        if (!sheet.grid.colWidths) sheet.grid.colWidths = {};
        for (const col of op.cols) {
          if (op.width === "auto") {
            let maxLen = 8;
            for (let r = 1; r <= sheet.grid.maxRow; r += 1) {
              const cell = sheet.cells[cellKey(r, col)];
              const text = String(cell?.v ?? cell?.f ?? "");
              maxLen = Math.max(maxLen, Math.min(text.length + 2, 60));
            }
            sheet.grid.colWidths[col] = maxLen;
          } else {
            sheet.grid.colWidths[col] = Math.max(1, Math.trunc(op.width));
          }
          changed = true;
        }
      } else {
        const ranges = rangeList(op as any);
        for (const range of ranges) {
          const parsed = parseA1Range(range, (op as any).sheet);
          const sheet = ensureSheetByName(model, parsed.sheetName);

          if (op.op === "SET_VALUE") {
            const matrix = Array.isArray(op.values)
              ? op.values
              : Array.isArray(op.value)
                ? (op.value as any)
                : null;
            const matrixMode = op.mode === "matrix" || Array.isArray(matrix);
            if (matrixMode && Array.isArray(matrix)) {
              for (let r = 0; r <= parsed.end.row - parsed.start.row; r += 1) {
                for (
                  let c = 0;
                  c <= parsed.end.col - parsed.start.col;
                  c += 1
                ) {
                  const sourceRow = Array.isArray(matrix[r]) ? matrix[r] : [];
                  const value = sourceRow[c];
                  if (value === undefined) continue;
                  changed =
                    setCellValuePreserveStyle(
                      sheet,
                      parsed.start.row + r,
                      parsed.start.col + c,
                      value,
                    ) || changed;
                }
              }
            } else {
              forEachCellInRange(parsed, (row, col) => {
                changed =
                  setCellValuePreserveStyle(sheet, row, col, op.value) ||
                  changed;
              });
            }
          } else if (op.op === "SET_FORMULA") {
            forEachCellInRange(parsed, (row, col) => {
              changed =
                setCellFormulaPreserveStyle(sheet, row, col, op.formula) ||
                changed;
            });
          } else if (op.op === "CLEAR_CONTENT") {
            forEachCellInRange(parsed, (row, col) => {
              changed = clearCellContent(sheet, row, col) || changed;
            });
          } else if (op.op === "SET_NUMBER_FORMAT") {
            forEachCellInRange(parsed, (row, col) => {
              changed = setNumberFormat(sheet, row, col, op.format) || changed;
            });
          } else if (op.op === "SET_STYLE") {
            forEachCellInRange(parsed, (row, col) => {
              changed = setStyle(sheet, model, row, col, op) || changed;
            });
          } else if (op.op === "CLEAR_FORMATTING") {
            forEachCellInRange(parsed, (row, col) => {
              changed = clearFormatting(sheet, row, col) || changed;
            });
          }

          if (changed) touchedRanges.add(formatRangeA1(parsed));
        }
      }

      statuses.push({
        index,
        op: op.op,
        status: changed ? "applied" : "noop",
        ...(changed
          ? {
              range:
                "range" in op ? String((op as any).range || "") : undefined,
            }
          : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      statuses.push({
        index,
        op: op.op,
        status: "rejected",
        message,
      });
      rejectedSet.add(`op#${index}:${op.op}:${message}`);
    }
  });

  return {
    model,
    statuses,
    touchedRanges: Array.from(touchedRanges),
    changedStructuresCount,
  };
}

export function summarizePatchStatuses(statuses: PatchApplyStatus[]): {
  applied: number;
  noop: number;
  rejected: number;
  rejectedOps: string[];
} {
  let applied = 0;
  let noop = 0;
  let rejected = 0;
  const rejectedOps: string[] = [];

  for (const status of statuses) {
    if (status.status === "applied") applied += 1;
    else if (status.status === "noop") noop += 1;
    else {
      rejected += 1;
      rejectedOps.push(
        `${status.op}${status.message ? `:${status.message}` : ""}`,
      );
    }
  }

  return { applied, noop, rejected, rejectedOps };
}

export function locateRangeFromTouched(touchedRanges: string[]): string | null {
  return touchedRanges.length ? touchedRanges[0] : null;
}

export function formatSingleCellRange(
  sheetName: string,
  row: number,
  col: number,
): string {
  const a1 = formatCellRef(row, col);
  return `${sheetName}!${a1}`;
}
