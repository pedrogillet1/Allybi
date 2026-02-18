import crypto from "crypto";
import ExcelJS from "exceljs";
import { cellKey, parseCellKey } from "./spreadsheetModel.range";
import { registerStyle } from "./spreadsheetModel.style";
import type { CellModel, SpreadsheetModel, StyleModel } from "./spreadsheetModel.types";

function asHexColor(raw: unknown): string | undefined {
  const value = String(raw || "").trim();
  if (!value) return undefined;
  const m = value.match(/^(?:FF)?([0-9A-Fa-f]{6})$/);
  if (!m?.[1]) return undefined;
  return `#${m[1].toUpperCase()}`;
}

function extractStyle(cell: ExcelJS.Cell): StyleModel | null {
  const font = cell.font
    ? {
        ...(cell.font.name ? { name: String(cell.font.name) } : {}),
        ...(typeof cell.font.size === "number" ? { size: cell.font.size } : {}),
        ...(typeof cell.font.bold === "boolean" ? { bold: cell.font.bold } : {}),
        ...(typeof cell.font.italic === "boolean" ? { italic: cell.font.italic } : {}),
        ...(typeof cell.font.underline === "boolean" ? { underline: cell.font.underline } : {}),
        ...(cell.font.color?.argb ? { color: asHexColor(cell.font.color.argb) } : {}),
      }
    : undefined;

  const fillColor = (cell.fill as any)?.fgColor?.argb || (cell.fill as any)?.bgColor?.argb;
  const fill = fillColor ? { color: asHexColor(fillColor) } : undefined;

  const align = cell.alignment
    ? {
        ...(cell.alignment.horizontal ? { h: String(cell.alignment.horizontal) as "left" | "center" | "right" } : {}),
        ...(cell.alignment.vertical
          ? {
              v:
                String(cell.alignment.vertical) === "middle"
                  ? "middle"
                  : (String(cell.alignment.vertical) as "top" | "bottom" | "middle"),
            }
          : {}),
        ...(typeof cell.alignment.wrapText === "boolean" ? { wrap: cell.alignment.wrapText } : {}),
      }
    : undefined;

  const border = cell.border && Object.keys(cell.border).length ? { ...(cell.border as any) } : undefined;
  const out: StyleModel = {
    ...(font && Object.keys(font).length ? { font } : {}),
    ...(fill && Object.keys(fill).length ? { fill } : {}),
    ...(align && Object.keys(align).length ? { align } : {}),
    ...(border ? { border } : {}),
  };

  return Object.keys(out).length ? out : null;
}

function parseExcelCellValue(value: ExcelJS.CellValue): Pick<CellModel, "v" | "t" | "f"> {
  if (value == null) return {};

  if (typeof value === "number") return { v: value, t: "n" };
  if (typeof value === "string") return { v: value, t: "s" };
  if (typeof value === "boolean") return { v: value, t: "b" };
  if (value instanceof Date) return { v: value.toISOString(), t: "d" };

  if (typeof value === "object") {
    const candidate = value as any;

    if (typeof candidate.formula === "string" && candidate.formula.trim()) {
      const result = candidate.result;
      if (typeof result === "number") return { f: candidate.formula.trim(), v: result, t: "n" };
      if (typeof result === "string") return { f: candidate.formula.trim(), v: result, t: "s" };
      if (typeof result === "boolean") return { f: candidate.formula.trim(), v: result, t: "b" };
      if (result instanceof Date) return { f: candidate.formula.trim(), v: result.toISOString(), t: "d" };
      return { f: candidate.formula.trim() };
    }

    if (Array.isArray(candidate.richText)) {
      const text = candidate.richText.map((item: any) => String(item?.text || "")).join("");
      return { v: text, t: "s" };
    }

    if (typeof candidate.text === "string") return { v: candidate.text, t: "s" };
    if (typeof candidate.hyperlink === "string" && typeof candidate.text === "string") return { v: candidate.text, t: "s" };
    if (candidate.error) return { v: String(candidate.error), t: "e" };
  }

  return { v: String(value), t: "s" };
}

function shouldKeepCell(cell: ExcelJS.Cell, modelCell: CellModel): boolean {
  if (modelCell.v !== undefined || modelCell.f !== undefined) return true;
  if (modelCell.nf && modelCell.nf !== "General") return true;
  if (modelCell.s) return true;
  if (modelCell.note) return true;
  if ((cell as any).dataValidation && Object.keys((cell as any).dataValidation || {}).length) return true;
  return false;
}

export async function buildSpreadsheetModelFromXlsx(xlsxBytes: Buffer): Promise<SpreadsheetModel> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(xlsxBytes as any);

  const model: SpreadsheetModel = {
    version: 1,
    workbook: {
      name: undefined,
      locale: "en-US",
      createdAt: new Date().toISOString(),
    },
    sheets: [],
    styles: {},
    charts: [],
    tables: [],
    namedRanges: [],
    meta: {
      source: "xlsx_import",
      buildHash: "",
    },
  };

  for (const ws of wb.worksheets) {
    const rowHeights: Record<number, number> = {};
    const colWidths: Record<number, number> = {};

    for (let r = 1; r <= ws.rowCount; r += 1) {
      const row = ws.getRow(r);
      if (typeof row.height === "number" && Number.isFinite(row.height)) rowHeights[r] = row.height;
    }

    for (let c = 1; c <= ws.columnCount; c += 1) {
      const col = ws.getColumn(c);
      if (typeof col.width === "number" && Number.isFinite(col.width)) colWidths[c] = col.width;
    }

    const mergesRaw = ((ws as any).model?.merges || []) as string[];
    const merges = mergesRaw
      .map((entry) => {
        try {
          const [left, right] = String(entry).split(":");
          const a = ws.getCell(left);
          const b = ws.getCell(right || left);
          return {
            r1: Math.min(Number((a as any).row), Number((b as any).row)),
            c1: Math.min(Number((a as any).col), Number((b as any).col)),
            r2: Math.max(Number((a as any).row), Number((b as any).row)),
            c2: Math.max(Number((a as any).col), Number((b as any).col)),
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean) as Array<{ r1: number; c1: number; r2: number; c2: number }>;

    const frozenView = Array.isArray(ws.views)
      ? ws.views.find((view: any) => String(view?.state || "").toLowerCase() === "frozen")
      : null;

    const cells: Record<string, CellModel> = {};
    let maxRowSeen = 0;
    let maxColSeen = 0;

    for (let r = 1; r <= ws.rowCount; r += 1) {
      for (let c = 1; c <= ws.columnCount; c += 1) {
        const excelCell = ws.getCell(r, c);
        const parsed = parseExcelCellValue(excelCell.value);
        const styleRef = registerStyle(model, extractStyle(excelCell) || undefined);
        const note = (excelCell.note as any)?.texts?.map?.((item: any) => String(item?.text || "")).join("") ||
          (typeof excelCell.note === "string" ? excelCell.note : undefined);

        const modelCell: CellModel = {
          ...parsed,
          ...(excelCell.numFmt && excelCell.numFmt !== "General" ? { nf: excelCell.numFmt } : {}),
          ...(styleRef ? { s: styleRef } : {}),
          ...(note ? { note } : {}),
          ...((excelCell as any).dataValidation && Object.keys((excelCell as any).dataValidation || {}).length
            ? { validation: (excelCell as any).dataValidation }
            : {}),
        };

        if (!shouldKeepCell(excelCell, modelCell)) continue;
        cells[cellKey(r, c)] = modelCell;
        maxRowSeen = Math.max(maxRowSeen, r);
        maxColSeen = Math.max(maxColSeen, c);
      }
    }

    for (const key of Object.keys(cells)) {
      const parsedKey = parseCellKey(key);
      if (!parsedKey) continue;
      maxRowSeen = Math.max(maxRowSeen, parsedKey.row);
      maxColSeen = Math.max(maxColSeen, parsedKey.col);
    }

    model.sheets.push({
      id: `sheet_${model.sheets.length + 1}`,
      name: ws.name,
      grid: {
        maxRow: Math.max(maxRowSeen, ws.rowCount || 0),
        maxCol: Math.max(maxColSeen, ws.columnCount || 0),
        ...(Object.keys(rowHeights).length ? { rowHeights } : {}),
        ...(Object.keys(colWidths).length ? { colWidths } : {}),
        ...(merges.length ? { merges } : {}),
        ...(frozenView
          ? {
              freeze: {
                rowSplit: Number((frozenView as any).ySplit || 0),
                colSplit: Number((frozenView as any).xSplit || 0),
              },
            }
          : {}),
        ...((ws as any).autoFilter ? { autoFilterRange: String((ws as any).autoFilter) } : {}),
      },
      cells,
      validations: [],
      conditionalFormats: [],
    });
  }

  const payload = JSON.stringify(model);
  model.meta.buildHash = crypto.createHash("sha1").update(payload).digest("hex");
  return model;
}
