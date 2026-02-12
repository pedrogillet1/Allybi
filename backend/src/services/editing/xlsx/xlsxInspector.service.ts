import ExcelJS from "exceljs";

export type InferredXlsxRange = {
  sheetName: string;
  rangeA1: string; // e.g. "A1:D20"
};

function numToCol(n0: number): string {
  let n = Math.max(0, Math.floor(n0));
  // convert 1-based
  n += 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s || "A";
}

function isEmptyCellValue(v: any): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim().length === 0;
  // ExcelJS formulas come as { formula, result }
  if (typeof v === "object" && typeof v.result !== "undefined") {
    return isEmptyCellValue(v.result);
  }
  return false;
}

/**
 * Best-effort "data block" inference for charts when the user didn't select a range.
 * This is intentionally conservative and bounded for performance.
 */
export class XlsxInspectorService {
  async inferChartRange(
    xlsxBytes: Buffer,
    preferredSheetName?: string | null,
  ): Promise<InferredXlsxRange | null> {
    if (!Buffer.isBuffer(xlsxBytes) || xlsxBytes.length === 0) return null;

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsxBytes as any);

    const preferred = String(preferredSheetName || "").trim();
    const ws =
      (preferred ? wb.getWorksheet(preferred) : null) ||
      wb.worksheets?.[0] ||
      null;
    if (!ws) return null;

    const sheetName = String(ws.name || preferred || "Sheet1");

    // Bounded scan: find min/max non-empty cell across the sheet quickly.
    let minRow = Number.POSITIVE_INFINITY;
    let maxRow = 0;
    let minCol = Number.POSITIVE_INFINITY;
    let maxCol = 0;

    ws.eachRow({ includeEmpty: false }, (row) => {
      const r = Number((row as any).number);
      if (!Number.isFinite(r)) return;
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const c = Number(colNumber);
        const v = (cell as any).value;
        if (isEmptyCellValue(v)) return;
        if (r < minRow) minRow = r;
        if (r > maxRow) maxRow = r;
        if (c < minCol) minCol = c;
        if (c > maxCol) maxCol = c;
      });
    });

    if (!Number.isFinite(minRow) || maxRow <= 0 || !Number.isFinite(minCol) || maxCol <= 0) {
      return null;
    }

    // Heuristic: prefer a header-ish row as the start if the first row is sparse.
    const headerRowCandidate = (() => {
      // Consider up to 6 rows starting at minRow.
      for (let r = minRow; r < Math.min(maxRow + 1, minRow + 6); r += 1) {
        let filled = 0;
        for (let c = minCol; c <= maxCol; c += 1) {
          const v = (ws.getCell(r, c) as any).value;
          if (!isEmptyCellValue(v)) filled += 1;
        }
        if (filled >= 2) return r;
      }
      return minRow;
    })();

    // Ensure we have at least a 2x2 block for charts.
    const startRow = headerRowCandidate;
    const startCol = minCol;
    const rowCount = maxRow - startRow + 1;
    const colCount = maxCol - startCol + 1;
    if (rowCount < 2 || colCount < 2) return null;

    const rangeA1 = `${numToCol(startCol - 1)}${startRow}:${numToCol(maxCol - 1)}${maxRow}`;
    return { sheetName, rangeA1 };
  }
}

export default XlsxInspectorService;

