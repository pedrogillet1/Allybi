import type {
  ColumnTypeInference,
  EnhancedSemanticIndex,
  MultiHeaderRow,
  SemanticIndex,
  SheetModel,
  SpreadsheetModel,
  TableBounds,
} from "./spreadsheetModel.types";
import { cellKey, numberToCol } from "./spreadsheetModel.range";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

// ---------------------------------------------------------------------------
// Original detection helpers (unchanged)
// ---------------------------------------------------------------------------

function detectHeaderRow(sheet: SheetModel): number | undefined {
  const maxScan = Math.min(sheet.grid.maxRow || 0, 20);
  let bestRow = 0;
  let bestScore = 0;

  for (let r = 1; r <= maxScan; r += 1) {
    let textCount = 0;
    for (let c = 1; c <= Math.min(sheet.grid.maxCol || 0, 40); c += 1) {
      const cell = sheet.cells[cellKey(r, c)];
      const text = toText(cell?.v);
      if (text) textCount += 1;
    }
    if (textCount > bestScore) {
      bestScore = textCount;
      bestRow = r;
    }
  }

  return bestRow > 0 ? bestRow : undefined;
}

function detectColumnKind(
  header: string,
): "currency" | "percent" | "text" | "date" {
  const h = header.toLowerCase();
  if (h.includes("%") || h.includes("percent") || h.includes("margin"))
    return "percent";
  if (h.includes("date") || h.includes("month") || h.includes("year"))
    return "date";
  if (
    h.includes("cost") ||
    h.includes("capex") ||
    h.includes("revenue") ||
    h.includes("price") ||
    h.includes("noi")
  ) {
    return "currency";
  }
  return "text";
}

function detectRowGroups(
  sheet: SheetModel,
): Array<{ label: string; startRow: number; endRow: number }> {
  const out: Array<{ label: string; startRow: number; endRow: number }> = [];
  let open: { label: string; startRow: number } | null = null;

  for (let r = 1; r <= sheet.grid.maxRow; r += 1) {
    const lead =
      toText(sheet.cells[cellKey(r, 1)]?.v) ||
      toText(sheet.cells[cellKey(r, 2)]?.v);
    if (!lead) continue;
    if (
      /^phase\s+\d+/i.test(lead) ||
      /^section\s+/i.test(lead) ||
      /^group\s+/i.test(lead)
    ) {
      if (open)
        out.push({ label: open.label, startRow: open.startRow, endRow: r - 1 });
      open = { label: lead, startRow: r };
    }
  }

  if (open)
    out.push({
      label: open.label,
      startRow: open.startRow,
      endRow: sheet.grid.maxRow,
    });
  return out;
}

// ---------------------------------------------------------------------------
// Backward-compatible public export
// ---------------------------------------------------------------------------

export function buildSemanticIndex(
  model: SpreadsheetModel,
): Record<string, SemanticIndex> {
  const out: Record<string, SemanticIndex> = {};

  for (const sheet of model.sheets) {
    const headerRow = detectHeaderRow(sheet);
    const columns: SemanticIndex["columns"] = {};

    if (headerRow) {
      for (let c = 1; c <= sheet.grid.maxCol; c += 1) {
        const header = toText(sheet.cells[cellKey(headerRow, c)]?.v);
        if (!header) continue;
        columns[c] = {
          header,
          kind: detectColumnKind(header),
        };
      }
    }

    const keyCells: SemanticIndex["keyCells"] = {};
    for (let r = 1; r <= sheet.grid.maxRow; r += 1) {
      for (let c = 1; c <= Math.min(sheet.grid.maxCol, 25); c += 1) {
        const value = toText(sheet.cells[cellKey(r, c)]?.v);
        if (!value) continue;
        const lower = value.toLowerCase();
        if (
          lower === "capex" ||
          lower === "noi" ||
          lower.includes("return on cost")
        ) {
          keyCells[value] = { role: "metric", row: r, col: c };
        }
      }
    }

    out[sheet.name] = {
      sheetName: sheet.name,
      headerRow,
      columns,
      rowGroups: detectRowGroups(sheet),
      keyCells,
    };
  }

  return out;
}

// ---------------------------------------------------------------------------
// Enhanced semantic index — new functions
// ---------------------------------------------------------------------------

const CURRENCY_SYMBOLS = /[$\u20AC\u00A3\u00A5]|R\$/;
const EMAIL_RE = /.+@.+\..+/;
const URL_RE = /^https?:\/\//;

const DATE_HEADER_WORDS =
  /\b(date|data|period|per[ií]odo|month|m[eê]s|year|ano|day|dia|week|semana|quarter|trimestre)\b/i;

/**
 * Infer the semantic type of a column by sampling its data cells.
 */
export function inferColumnType(
  sheet: SheetModel,
  col: number,
  headerRow: number,
  maxSamples = 50,
): ColumnTypeInference {
  // Collect samples
  const samples: Array<{ raw: unknown; nf?: string }> = [];
  for (
    let r = headerRow + 1;
    r <= sheet.grid.maxRow && samples.length < maxSamples;
    r += 1
  ) {
    const cell = sheet.cells[cellKey(r, col)];
    if (!cell) continue;
    const text = toText(cell.v);
    if (!text) continue;
    samples.push({ raw: cell.v, nf: cell.nf });
  }

  const sampleSize = samples.length;
  if (sampleSize === 0) {
    return { kind: "text", confidence: 0.5, sampleSize: 0 };
  }

  const headerText = toText(
    sheet.cells[cellKey(headerRow, col)]?.v,
  ).toLowerCase();

  // --- Rule 1: Currency ---
  let currencyCount = 0;
  for (const s of samples) {
    const text = toText(s.raw);
    const nf = s.nf ?? "";
    if (CURRENCY_SYMBOLS.test(text) || CURRENCY_SYMBOLS.test(nf)) {
      currencyCount += 1;
    }
  }
  if (currencyCount / sampleSize > 0.5) {
    return {
      kind: "currency",
      confidence: currencyCount / sampleSize,
      sampleSize,
    };
  }

  // --- Rule 2: Percent ---
  let percentCount = 0;
  for (const s of samples) {
    const text = toText(s.raw);
    const nf = s.nf ?? "";
    if (text.includes("%") || nf.includes("%")) {
      percentCount += 1;
    } else if (
      typeof s.raw === "number" &&
      s.raw >= 0 &&
      s.raw <= 1 &&
      /\b(margin|rate|margem|taxa|percent|pct)\b/i.test(headerText)
    ) {
      percentCount += 1;
    }
  }
  if (percentCount / sampleSize > 0.5) {
    return {
      kind: "percent",
      confidence: percentCount / sampleSize,
      sampleSize,
    };
  }

  // --- Rule 3: Date ---
  let dateCount = 0;
  for (const s of samples) {
    const text = toText(s.raw);
    if (typeof s.raw === "string" && !isNaN(Date.parse(text))) {
      dateCount += 1;
    } else if (
      typeof s.raw === "number" &&
      s.raw >= 1 &&
      s.raw <= 200000 &&
      DATE_HEADER_WORDS.test(headerText)
    ) {
      dateCount += 1;
    }
  }
  if (dateCount / sampleSize > 0.5) {
    return {
      kind: "date",
      confidence: dateCount / sampleSize,
      sampleSize,
    };
  }

  // --- Rule 6: Email (checked before ID/categorical since it's string-based) ---
  let emailCount = 0;
  for (const s of samples) {
    if (EMAIL_RE.test(toText(s.raw))) emailCount += 1;
  }
  if (emailCount / sampleSize > 0.5) {
    return {
      kind: "email",
      confidence: emailCount / sampleSize,
      sampleSize,
    };
  }

  // --- Rule 7: URL ---
  let urlCount = 0;
  for (const s of samples) {
    if (URL_RE.test(toText(s.raw))) urlCount += 1;
  }
  if (urlCount / sampleSize > 0.5) {
    return {
      kind: "url",
      confidence: urlCount / sampleSize,
      sampleSize,
    };
  }

  // --- Rule 8: Number (checked before ID/categorical) ---
  let numberCount = 0;
  const numericValues: number[] = [];
  for (const s of samples) {
    const n =
      typeof s.raw === "number"
        ? s.raw
        : Number(toText(s.raw).replace(/,/g, ""));
    if (Number.isFinite(n)) {
      numberCount += 1;
      numericValues.push(n);
    }
  }

  if (numberCount / sampleSize > 0.8) {
    // --- Rule 4: ID (subset of numeric) ---
    const allIntegers = numericValues.every((v) => Number.isInteger(v));
    const uniqueSet = new Set(numericValues);
    const sorted = [...numericValues].sort((a, b) => a - b);
    const isSequential =
      sorted.length > 1 &&
      sorted[sorted.length - 1] - sorted[0] <= sorted.length * 2;

    if (
      allIntegers &&
      uniqueSet.size === numericValues.length &&
      isSequential
    ) {
      return {
        kind: "id",
        confidence: numberCount / sampleSize,
        sampleSize,
      };
    }

    return {
      kind: "number",
      confidence: numberCount / sampleSize,
      sampleSize,
    };
  }

  // --- Rule 5: Categorical ---
  if (sampleSize >= 10) {
    const uniqueValues = new Set(
      samples.map((s) => toText(s.raw).toLowerCase()),
    );
    if (uniqueValues.size < 20) {
      return {
        kind: "categorical",
        confidence: 1 - uniqueValues.size / sampleSize,
        sampleSize,
      };
    }
  }

  // --- Rule 9: Fallback ---
  return { kind: "text", confidence: 0.5, sampleSize };
}

/**
 * Detect the bounding rectangle of the main data table on a sheet.
 */
export function detectTableBounds(
  sheet: SheetModel,
  headerRow: number,
): TableBounds {
  // firstCol / lastCol: leftmost/rightmost non-empty header cell
  let firstCol = sheet.grid.maxCol;
  let lastCol = 1;
  for (let c = 1; c <= sheet.grid.maxCol; c += 1) {
    const text = toText(sheet.cells[cellKey(headerRow, c)]?.v);
    if (text) {
      if (c < firstCol) firstCol = c;
      if (c > lastCol) lastCol = c;
    }
  }

  const headerColCount = lastCol - firstCol + 1;
  const fillThreshold = headerColCount * 0.6;

  // firstDataRow: first row after headerRow with >= 60% fill
  let firstDataRow = headerRow + 1;
  for (let r = headerRow + 1; r <= sheet.grid.maxRow; r += 1) {
    let filled = 0;
    for (let c = firstCol; c <= lastCol; c += 1) {
      if (toText(sheet.cells[cellKey(r, c)]?.v)) filled += 1;
    }
    if (filled >= fillThreshold) {
      firstDataRow = r;
      break;
    }
  }

  // lastDataRow: scan down, stop at last row before 3+ consecutive empty rows
  let lastDataRow = firstDataRow;
  let consecutiveEmpty = 0;
  for (let r = firstDataRow; r <= sheet.grid.maxRow; r += 1) {
    let hasData = false;
    for (let c = firstCol; c <= lastCol; c += 1) {
      if (toText(sheet.cells[cellKey(r, c)]?.v)) {
        hasData = true;
        break;
      }
    }
    if (hasData) {
      consecutiveEmpty = 0;
      lastDataRow = r;
    } else {
      consecutiveEmpty += 1;
      if (consecutiveEmpty >= 3) break;
    }
  }

  return { headerRow, firstDataRow, lastDataRow, firstCol, lastCol };
}

/**
 * Detect multi-header rows above the primary header row by checking for
 * merged cell ranges.
 */
export function detectMultiHeaders(
  sheet: SheetModel,
  headerRow: number,
): MultiHeaderRow[] {
  const merges = sheet.grid.merges;
  if (!merges || merges.length === 0 || headerRow <= 1) return [];

  const result: MultiHeaderRow[] = [];

  for (let r = 1; r < headerRow; r += 1) {
    const rowMerges: MultiHeaderRow["mergedRanges"] = [];

    for (const m of merges) {
      // The merge spans this row if its row range includes r
      if (m.r1 <= r && m.r2 >= r && m.c1 < m.c2) {
        const label = toText(sheet.cells[cellKey(m.r1, m.c1)]?.v);
        rowMerges.push({
          label,
          startCol: m.c1,
          endCol: m.c2,
        });
      }
    }

    if (rowMerges.length > 0) {
      result.push({ row: r, mergedRanges: rowMerges });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Synonym groups (bilingual EN/PT)
// ---------------------------------------------------------------------------

const SYNONYM_GROUPS: string[][] = [
  ["revenue", "sales", "faturamento", "receita", "income", "vendas"],
  ["cost", "expense", "custo", "despesa", "cogs", "gastos"],
  [
    "date",
    "data",
    "period",
    "per\u00EDodo",
    "month",
    "m\u00EAs",
    "ano",
    "year",
  ],
  ["name", "nome", "full name", "nome completo"],
  ["email", "e-mail", "email address", "endere\u00E7o de email"],
  ["quantity", "qty", "quantidade", "qtd", "units", "unidades"],
  ["price", "pre\u00E7o", "unit price", "pre\u00E7o unit\u00E1rio", "valor"],
  ["total", "subtotal", "grand total", "total geral"],
  ["description", "descri\u00E7\u00E3o", "desc", "details", "detalhes"],
  ["status", "estado", "situa\u00E7\u00E3o", "state"],
  ["id", "c\u00F3digo", "code", "identifier", "identificador"],
  ["margin", "margem", "profit margin", "margem de lucro"],
];

/**
 * Map each column to a list of header synonyms from the hardcoded groups.
 */
export function buildColumnSynonyms(
  columns: SemanticIndex["columns"],
): Record<number, string[]> {
  const out: Record<number, string[]> = {};

  for (const [colStr, col] of Object.entries(columns)) {
    const colIdx = Number(colStr);
    const header = (col.header ?? "").toLowerCase();
    if (!header) continue;

    for (const group of SYNONYM_GROUPS) {
      if (group.some((syn) => syn === header)) {
        out[colIdx] = group.filter((syn) => syn !== header);
        break;
      }
    }
  }

  return out;
}

/**
 * For columns whose first data-row cell contains a formula, build a
 * human-readable summary mapping column references to header names.
 *
 * Example: column E with formula `=C2-D2` where C="Revenue", D="Cost"
 *          yields `"Profit = Revenue - Cost"`.
 */
export function buildFormulaSummaries(
  sheet: SheetModel,
  columns: SemanticIndex["columns"],
  headerRow: number,
): Record<number, string> {
  const out: Record<number, string> = {};
  const firstDataRow = headerRow + 1;

  // Build a lookup: col letter -> header name
  const colLetterToHeader: Record<string, string> = {};
  for (const [colStr, col] of Object.entries(columns)) {
    const letter = numberToCol(Number(colStr));
    colLetterToHeader[letter] = col.header ?? letter;
  }

  for (const [colStr, col] of Object.entries(columns)) {
    const colIdx = Number(colStr);
    const cell = sheet.cells[cellKey(firstDataRow, colIdx)];
    if (!cell?.f) continue;

    const formula = cell.f;
    const header = col.header ?? numberToCol(colIdx);

    // Replace cell references (e.g. C2, D$2, $C$2) with their header names
    const readable = formula
      .replace(/=/, "")
      .replace(/\$?([A-Z]{1,3})\$?\d+/g, (_match, colLetter: string) => {
        return colLetterToHeader[colLetter] ?? colLetter;
      })
      .trim();

    if (readable) {
      out[colIdx] = `${header} = ${readable}`;
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Enhanced semantic index — main export
// ---------------------------------------------------------------------------

export function buildEnhancedSemanticIndex(
  model: SpreadsheetModel,
): Record<string, EnhancedSemanticIndex> {
  const base = buildSemanticIndex(model);
  const out: Record<string, EnhancedSemanticIndex> = {};

  for (const sheet of model.sheets) {
    const idx = base[sheet.name];
    if (!idx) continue;

    const headerRow = idx.headerRow;

    // Column type inference
    const columnTypeInference: Record<number, ColumnTypeInference> = {};
    if (headerRow != null) {
      for (const colStr of Object.keys(idx.columns)) {
        const colIdx = Number(colStr);
        columnTypeInference[colIdx] = inferColumnType(sheet, colIdx, headerRow);
      }
    }

    // Table bounds
    const tableBounds =
      headerRow != null ? detectTableBounds(sheet, headerRow) : undefined;

    // Multi-header rows
    const multiHeaders =
      headerRow != null ? detectMultiHeaders(sheet, headerRow) : undefined;

    // Synonyms
    const columnSynonyms = buildColumnSynonyms(idx.columns);

    // Formula summaries
    const formulaSummaries =
      headerRow != null
        ? buildFormulaSummaries(sheet, idx.columns, headerRow)
        : {};

    out[sheet.name] = {
      ...idx,
      tableBounds,
      multiHeaders:
        multiHeaders && multiHeaders.length > 0 ? multiHeaders : undefined,
      columnSynonyms,
      formulaSummaries,
      columnTypeInference,
    };
  }

  return out;
}
