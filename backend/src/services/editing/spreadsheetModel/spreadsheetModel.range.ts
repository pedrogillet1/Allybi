import type { A1Range } from "./spreadsheetModel.types";

export type ParsedCellRef = {
  col: number;
  row: number;
};

export type ParsedRangeRef = {
  sheetName: string;
  start: ParsedCellRef;
  end: ParsedCellRef;
};

function unquoteSheetName(raw: string): string {
  const text = String(raw || "").trim();
  if (!text) return "";
  if (text.startsWith("'") && text.endsWith("'") && text.length >= 2) {
    return text.slice(1, -1).replace(/''/g, "'");
  }
  return text;
}

export function quoteSheetNameIfNeeded(name: string): string {
  const raw = String(name || "").trim();
  if (!raw) return "";
  if (/^[A-Za-z0-9_]+$/.test(raw)) return raw;
  return `'${raw.replace(/'/g, "''")}'`;
}

export function colToNumber(col: string): number {
  const text = String(col || "").trim().toUpperCase();
  if (!text || !/^[A-Z]+$/.test(text)) return 0;
  let out = 0;
  for (const ch of text) out = out * 26 + (ch.charCodeAt(0) - 64);
  return out;
}

export function numberToCol(input: number): string {
  let n = Math.max(1, Math.trunc(input));
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function parseCellRef(input: string): ParsedCellRef {
  const raw = String(input || "").replace(/\$/g, "").trim();
  const m = raw.match(/^([A-Za-z]{1,4})(\d{1,7})$/);
  if (!m) throw new Error(`Invalid A1 cell reference: ${input}`);
  const col = colToNumber(m[1]);
  const row = Number(m[2]);
  if (!Number.isFinite(col) || !Number.isFinite(row) || col < 1 || row < 1) {
    throw new Error(`Invalid A1 cell reference: ${input}`);
  }
  return { col, row };
}

export function parseA1Range(input: A1Range, fallbackSheetName?: string): ParsedRangeRef {
  const raw = String(input || "").trim();
  if (!raw) throw new Error("A1 range is required.");

  const bang = raw.indexOf("!");
  const sheetName = bang > 0 ? unquoteSheetName(raw.slice(0, bang)) : String(fallbackSheetName || "").trim();
  const rangePart = bang > 0 ? raw.slice(bang + 1).trim() : raw;
  if (!sheetName) throw new Error(`Sheet name missing in range: ${input}`);

  const [leftRaw, rightRaw] = rangePart.includes(":") ? rangePart.split(":") : [rangePart, rangePart];
  const left = parseCellRef(leftRaw);
  const right = parseCellRef(rightRaw || leftRaw);

  return {
    sheetName,
    start: {
      row: Math.min(left.row, right.row),
      col: Math.min(left.col, right.col),
    },
    end: {
      row: Math.max(left.row, right.row),
      col: Math.max(left.col, right.col),
    },
  };
}

export function formatCellRef(row: number, col: number): string {
  return `${numberToCol(col)}${Math.max(1, Math.trunc(row))}`;
}

export function formatRangeA1(parsed: ParsedRangeRef, includeSheet = true): string {
  const left = formatCellRef(parsed.start.row, parsed.start.col);
  const right = formatCellRef(parsed.end.row, parsed.end.col);
  const range = left === right ? left : `${left}:${right}`;
  if (!includeSheet) return range;
  return `${quoteSheetNameIfNeeded(parsed.sheetName)}!${range}`;
}

export function normalizeA1Range(range: string, fallbackSheetName?: string): string {
  return formatRangeA1(parseA1Range(range, fallbackSheetName));
}

export function cellKey(row: number, col: number): string {
  return `R${Math.max(1, Math.trunc(row))}C${Math.max(1, Math.trunc(col))}`;
}

export function parseCellKey(key: string): { row: number; col: number } | null {
  const m = String(key || "").match(/^R(\d+)C(\d+)$/);
  if (!m) return null;
  return { row: Number(m[1]), col: Number(m[2]) };
}

export function forEachCellInRange(parsed: ParsedRangeRef, cb: (row: number, col: number) => void): void {
  for (let r = parsed.start.row; r <= parsed.end.row; r += 1) {
    for (let c = parsed.start.col; c <= parsed.end.col; c += 1) cb(r, c);
  }
}

export function rangeCellCount(parsed: ParsedRangeRef): number {
  return (parsed.end.row - parsed.start.row + 1) * (parsed.end.col - parsed.start.col + 1);
}
