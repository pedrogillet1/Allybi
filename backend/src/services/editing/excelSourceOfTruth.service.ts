import { analyzeMessageToPlan } from "./intentRuntime";

type ComputeOp = Record<string, unknown>;

export interface ExcelSoTInput {
  message: string;
  language?: "en" | "pt";
  viewerSheetName?: string | null;
  viewerRangeA1?: string | null;
  cellFacts?: Array<{
    sheet?: string;
    sheetName?: string;
    cell?: string;
    rowLabel?: string;
    colHeader?: string;
  }>;
  sheetNames?: string[];
}

export type ExcelSoTResult =
  | {
      kind: "plan";
      ops: ComputeOp[];
      sourcePatternIds: string[];
      canonicalOps: string[];
    }
  | {
      kind: "clarification";
      message: string;
      missingSlots: string[];
      sourcePatternIds: string[];
    }
  | {
      kind: "unsupported";
      reason: string;
      unsupportedOps: string[];
      sourcePatternIds: string[];
    }
  | {
      kind: "none";
      reason: string;
    };

function coerceScalar(input: unknown): string | number | boolean | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number" || typeof input === "boolean") return input;
  const raw = String(input).trim();
  if (!raw) return "";
  if (/^(null|empty|blank)$/i.test(raw)) return null;
  if (/^(true|false)$/i.test(raw)) return raw.toLowerCase() === "true";

  const pct = raw.match(/^(-?[\d,.]+)\s*%$/);
  if (pct?.[1]) {
    const n = Number(pct[1].replace(/,/g, ""));
    if (Number.isFinite(n)) return n / 100;
  }

  const n = Number(raw.replace(/,/g, ""));
  if (Number.isFinite(n) && /^-?[\d,.]+$/.test(raw)) return n;

  return raw;
}

function normalizeRange(
  input: unknown,
  fallbackSheetName?: string | null,
): string | null {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const embedded = extractRangeFromMessage(raw);
  const candidate = embedded || raw;
  if (candidate.includes("!")) {
    const bang = candidate.indexOf("!");
    const sheet = candidate
      .slice(0, bang)
      .replace(/^'+|'+$/g, "")
      .replace(/^.*\b(?:from|on|in|at)\s+/i, "")
      .replace(
        /^(?:in|on|at|from|using|use|em|na|no|make|set|create|insert|delete|format|sort|filter)\s+/i,
        "",
      )
      .trim();
    const a1 = candidate.slice(bang + 1).trim();
    if (!sheet || !a1) return null;
    return `${sheet}!${a1}`;
  }
  const sheet = String(fallbackSheetName || "").trim();
  if (!sheet) return candidate;
  return `${sheet}!${candidate}`;
}

function sheetFromRange(rangeA1: string): string | null {
  const bang = String(rangeA1 || "").indexOf("!");
  if (bang <= 0) return null;
  return (
    String(rangeA1.slice(0, bang)).replace(/^'/, "").replace(/'$/, "").trim() ||
    null
  );
}

function firstNonEmptyString(values: unknown[]): string | null {
  for (const value of values) {
    const out = String(value || "").trim();
    if (out) return out;
  }
  return null;
}

function normalizeText(value: string): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function scoreMessageMatch(messageNorm: string, candidateText: string): number {
  const candidateNorm = normalizeText(candidateText);
  if (!candidateNorm) return 0;
  if (messageNorm.includes(candidateNorm)) return 1000 + candidateNorm.length;
  const words = tokenize(candidateText);
  if (!words.length) return 0;
  let matched = 0;
  for (const w of words) {
    if (messageNorm.includes(w)) matched += 1;
  }
  if (!matched) return 0;
  return matched * 20 + candidateNorm.length;
}

type SemanticMatch = {
  rowLabel: string | null;
  colHeader: string | null;
  rowScore: number;
  colScore: number;
};

function resolveSemanticMatch(
  message: string,
  cellFacts: ExcelSoTInput["cellFacts"],
): SemanticMatch {
  const facts = Array.isArray(cellFacts) ? cellFacts : [];
  const messageNorm = normalizeText(message);
  let bestRow: { label: string; score: number } | null = null;
  let bestCol: { label: string; score: number } | null = null;

  const uniqueRows = new Set<string>();
  const uniqueCols = new Set<string>();
  for (const fact of facts) {
    const row = String(fact?.rowLabel || "").trim();
    const col = String(fact?.colHeader || "").trim();
    if (row) uniqueRows.add(row);
    if (col) uniqueCols.add(col);
  }

  for (const rowLabel of uniqueRows) {
    const score = scoreMessageMatch(messageNorm, rowLabel);
    if (!score) continue;
    if (!bestRow || score > bestRow.score) bestRow = { label: rowLabel, score };
  }

  for (const colHeader of uniqueCols) {
    const score = scoreMessageMatch(messageNorm, colHeader);
    if (!score) continue;
    if (!bestCol || score > bestCol.score)
      bestCol = { label: colHeader, score };
  }

  return {
    rowLabel: bestRow?.label || null,
    colHeader: bestCol?.label || null,
    rowScore: bestRow?.score || 0,
    colScore: bestCol?.score || 0,
  };
}

function resolveSemanticCellTarget(
  message: string,
  cellFacts: ExcelSoTInput["cellFacts"],
): { sheetName: string; a1: string } | null {
  const facts = Array.isArray(cellFacts) ? cellFacts : [];
  if (!facts.length) return null;
  const semantic = resolveSemanticMatch(message, facts);
  if (!semantic.rowLabel || !semantic.colHeader) return null;

  let best: { sheetName: string; a1: string; score: number } | null = null;
  for (const fact of facts) {
    const row = String(fact?.rowLabel || "").trim();
    const col = String(fact?.colHeader || "").trim();
    const a1 = String(fact?.cell || "").trim();
    const sheetName = String(fact?.sheet || fact?.sheetName || "").trim();
    if (!row || !col || !a1 || !sheetName) continue;
    if (normalizeText(row) !== normalizeText(semantic.rowLabel)) continue;
    if (normalizeText(col) !== normalizeText(semantic.colHeader)) continue;
    const score =
      semantic.rowScore + semantic.colScore + row.length + col.length;
    if (!best || score > best.score) best = { sheetName, a1, score };
  }
  return best ? { sheetName: best.sheetName, a1: best.a1 } : null;
}

function resolveSemanticColumnRange(
  message: string,
  cellFacts: ExcelSoTInput["cellFacts"],
): { sheetName: string; rangeA1: string } | null {
  const facts = Array.isArray(cellFacts) ? cellFacts : [];
  if (!facts.length) return null;
  const semantic = resolveSemanticMatch(message, facts);
  if (!semantic.colHeader) return null;

  let best: {
    sheetName: string;
    col: string;
    minRow: number;
    maxRow: number;
    score: number;
  } | null = null;

  const bySheetAndHeader = new Map<string, Array<{ cell: string }>>();
  for (const fact of facts) {
    const header = String(fact?.colHeader || "").trim();
    const sheetName = String(fact?.sheet || fact?.sheetName || "").trim();
    const cell = String(fact?.cell || "").trim();
    if (!header || !sheetName || !cell) continue;
    if (normalizeText(header) !== normalizeText(semantic.colHeader)) continue;
    const key = `${sheetName}::${normalizeText(header)}`;
    const list = bySheetAndHeader.get(key) || [];
    list.push({ cell });
    bySheetAndHeader.set(key, list);
  }

  for (const [key, cells] of bySheetAndHeader.entries()) {
    const [sheetName] = key.split("::");
    const parsed = cells
      .map((item) => {
        const m = String(item.cell).match(/^([A-Z]{1,3})(\d{1,7})$/i);
        if (!m) return null;
        return { col: String(m[1]).toUpperCase(), row: Number(m[2]) };
      })
      .filter(Boolean) as Array<{ col: string; row: number }>;
    if (!parsed.length) continue;
    const col = parsed[0]!.col;
    const sameCol = parsed.every((p) => p.col === col);
    if (!sameCol) continue;
    const minRow = Math.min(...parsed.map((p) => p.row));
    const maxRow = Math.max(...parsed.map((p) => p.row));
    const score = semantic.colScore + parsed.length;
    if (!best || score > best.score) {
      best = { sheetName, col, minRow, maxRow, score };
    }
  }

  if (!best) return null;
  return {
    sheetName: best.sheetName,
    rangeA1: `${best.col}${best.minRow}:${best.col}${best.maxRow}`,
  };
}

function resolveSemanticTableRange(
  cellFacts: ExcelSoTInput["cellFacts"],
): { sheetName: string; rangeA1: string } | null {
  const facts = Array.isArray(cellFacts) ? cellFacts : [];
  if (!facts.length) return null;

  let best: {
    sheetName: string;
    minCol: number;
    maxCol: number;
    minRow: number;
    maxRow: number;
  } | null = null;

  const colToNumber = (col: string): number =>
    String(col || "")
      .toUpperCase()
      .split("")
      .reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0);

  const numToCol = (n: number): string => {
    let x = Math.max(1, Math.trunc(n));
    let out = "";
    while (x > 0) {
      const r = (x - 1) % 26;
      out = String.fromCharCode(65 + r) + out;
      x = Math.floor((x - 1) / 26);
    }
    return out;
  };

  const bySheet = new Map<string, Array<{ col: number; row: number }>>();
  for (const fact of facts) {
    const sheetName = String(fact?.sheet || fact?.sheetName || "").trim();
    const cell = String(fact?.cell || "").trim();
    if (!sheetName || !cell) continue;
    const m = cell.match(/^([A-Z]{1,3})(\d{1,7})$/i);
    if (!m) continue;
    const col = colToNumber(String(m[1] || ""));
    const row = Number(m[2]);
    if (!Number.isFinite(col) || !Number.isFinite(row)) continue;
    const list = bySheet.get(sheetName) || [];
    list.push({ col, row });
    bySheet.set(sheetName, list);
  }

  for (const [sheetName, coords] of bySheet.entries()) {
    if (!coords.length) continue;
    const minCol = Math.min(...coords.map((v) => v.col));
    const maxCol = Math.max(...coords.map((v) => v.col));
    const minRow = Math.min(...coords.map((v) => v.row));
    const maxRow = Math.max(...coords.map((v) => v.row));
    const currentArea = (maxCol - minCol + 1) * (maxRow - minRow + 1);
    const bestArea = best
      ? (best.maxCol - best.minCol + 1) * (best.maxRow - best.minRow + 1)
      : -1;
    if (!best || currentArea > bestArea) {
      best = { sheetName, minCol, maxCol, minRow, maxRow };
    }
  }

  if (!best) return null;
  return {
    sheetName: best.sheetName,
    rangeA1: `${numToCol(best.minCol)}${best.minRow}:${numToCol(best.maxCol)}${best.maxRow}`,
  };
}

function extractRangeFromMessage(message: string): string | null {
  const text = String(message || "").trim();
  if (!text) return null;
  const withSheet = text.match(
    /(?:^|[\s,(])((?:'[^']+'|[A-Za-z0-9_.-]+(?:\s+[A-Za-z0-9_.-]+){0,4})![A-Z]{1,3}\d{1,7}(?::[A-Z]{1,3}\d{1,7})?)(?=$|[\s),.;])/i,
  );
  if (withSheet?.[1]) return String(withSheet[1]).trim();
  const bare = text.match(/\b([A-Z]{1,3}\d{1,7}(?::[A-Z]{1,3}\d{1,7})?)\b/i);
  if (bare?.[1]) return String(bare[1]).trim();
  return null;
}

function extractAllRangesFromMessage(message: string): string[] {
  const text = String(message || "").trim();
  if (!text) return [];
  const out = new Set<string>();

  const withSheetRegex =
    /(?:^|[\s,(])((?:'[^']+'|[A-Za-z0-9_.-]+(?:\s+[A-Za-z0-9_.-]+){0,4})![A-Z]{1,3}\d{1,7}(?::[A-Z]{1,3}\d{1,7})?)(?=$|[\s),.;])/gi;
  let m: RegExpExecArray | null = null;
  while ((m = withSheetRegex.exec(text)) != null) {
    const value = String(m[1] || "").trim();
    if (value) out.add(value);
  }

  const bareRegex = /\b([A-Z]{1,3}\d{1,7}(?::[A-Z]{1,3}\d{1,7})?)\b/gi;
  while ((m = bareRegex.exec(text)) != null) {
    const value = String(m[1] || "").trim();
    if (value) out.add(value);
  }

  return Array.from(out);
}

function formatPatternFromMessage(message: string): string | null {
  const text = String(message || "").toLowerCase();
  const decimalWordMap: Record<string, number> = {
    zero: 0,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
  };

  const explicitDigits = text.match(/(\d+)\s*decimal/);
  const explicitWords = Object.entries(decimalWordMap).find(([word]) =>
    new RegExp(`\\b${word}\\s+decimals?\\b`, "i").test(text),
  );
  const decimals = explicitDigits
    ? Math.max(0, Math.min(6, Number(explicitDigits[1])))
    : explicitWords
      ? explicitWords[1]
      : null;

  if (/\bcurrency\b|\$|usd|dollar/.test(text)) {
    const d = decimals == null ? 2 : decimals;
    return d <= 0 ? "$#,##0" : `$#,##0.${"0".repeat(d)}`;
  }
  if (/\bpercent\b|\bpercentage\b|%/.test(text)) {
    const d = decimals == null ? 0 : decimals;
    return d <= 0 ? "0%" : `0.${"0".repeat(d)}%`;
  }
  if (
    /\bnumber format\b|\bdecimal\b|\bformat\b/.test(text) &&
    decimals != null
  ) {
    return decimals <= 0 ? "#,##0" : `#,##0.${"0".repeat(decimals)}`;
  }
  return null;
}

function parseSheetMention(
  message: string,
  sheetNames?: string[],
): string | null {
  const names = Array.isArray(sheetNames) ? sheetNames.filter(Boolean) : [];
  if (!names.length) return null;
  const lowerMessage = String(message || "").toLowerCase();
  for (const name of names) {
    const trimmed = String(name || "").trim();
    if (!trimmed) continue;
    if (lowerMessage.includes(trimmed.toLowerCase())) return trimmed;
  }
  return null;
}

function parseRowInsertIntent(
  message: string,
): { count: number; row: number } | null {
  const text = String(message || "").toLowerCase();
  if (!/\binsert\b/.test(text) || !/\brow/.test(text)) return null;
  const countMatch = text.match(/\binsert\s+(\d+)\s+rows?\b/);
  const rowMatch = text.match(/\b(?:at|into|before|after)?\s*row\s+(\d+)\b/);
  if (!rowMatch?.[1]) return null;
  const count = Math.max(1, Number(countMatch?.[1] || 1));
  const row = Math.max(1, Number(rowMatch[1]));
  if (!Number.isFinite(row) || !Number.isFinite(count)) return null;
  return { count, row };
}

function parseRowDeleteIntent(
  message: string,
): { startRow: number; count: number } | null {
  const text = String(message || "").toLowerCase();
  if (!/\b(delete|remove)\b/.test(text) || !/\brow/.test(text)) return null;
  // "delete rows 5 through 10" / "delete rows 5 to 10" / "delete rows 5-10"
  const rangeMatch = text.match(/rows?\s+(\d+)\s*(?:through|to|-)\s*(\d+)/);
  if (rangeMatch) {
    const r1 = Number(rangeMatch[1]);
    const r2 = Number(rangeMatch[2]);
    if (Number.isFinite(r1) && Number.isFinite(r2)) {
      return { startRow: Math.min(r1, r2), count: Math.abs(r2 - r1) + 1 };
    }
  }
  // "delete row 5"
  const singleMatch = text.match(/row\s+(\d+)/);
  if (singleMatch?.[1]) {
    return { startRow: Number(singleMatch[1]), count: 1 };
  }
  return null;
}

function parseSetCellNumericIntent(
  message: string,
): { cellA1: string; value: number; sheetName?: string } | null {
  const text = String(message || "");
  const m = text.match(
    /\b(?:on\s+([A-Za-z0-9_.-]+)\s*,?\s*)?(?:set|change|update)\s+([A-Za-z]{1,3}\d{1,7})\s+to\s+(-?[\d,]+(?:\.\d+)?)/i,
  );
  if (!m?.[2] || !m?.[3]) return null;
  const value = Number(String(m[3]).replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  return {
    ...(m[1] ? { sheetName: String(m[1]).trim() } : {}),
    cellA1: String(m[2]).toUpperCase(),
    value,
  };
}

function parseChartIntent(
  message: string,
  sheetNames?: string[],
  fallbackSheetName?: string | null,
): ComputeOp | null {
  const text = String(message || "");
  if (!/\bchart\b/i.test(text)) return null;

  const ranges = extractAllRangesFromMessage(text);
  if (!ranges.length) return null;

  const type = /\bbar\b/i.test(text)
    ? "bar"
    : /\bline\b/i.test(text)
      ? "line"
      : /\bpie\b/i.test(text)
        ? "pie"
        : /\bscatter\b/i.test(text)
          ? "scatter"
          : "bar";

  const inferredSheet =
    parseSheetMention(text, sheetNames) ||
    String(fallbackSheetName || "").trim() ||
    undefined;
  const first = normalizeRange(ranges[0], inferredSheet || null);
  if (!first) return null;
  const second =
    ranges
      .map((value) =>
        normalizeRange(value, inferredSheet || sheetFromRange(first) || null),
      )
      .find(
        (value) =>
          Boolean(value) &&
          String(value).toUpperCase() !== String(first).toUpperCase(),
      ) || null;
  const titleMatch = text.match(/\btitled?\s+["“”']?([^"“”']{2,120})["“”']?/i);
  const title = titleMatch?.[1] ? String(titleMatch[1]).trim() : undefined;

  const spec: Record<string, unknown> = {
    type: type.toUpperCase(),
    range: first,
    ...(title ? { title } : {}),
  };
  if (second) {
    spec.labelRange = first;
    spec.valueRange = second;
  }

  return {
    kind: "create_chart",
    rangeA1: first,
    type,
    spec,
    ...(title ? { title } : {}),
  };
}

function toComputeOp(
  step: { op: string; params: Record<string, unknown> },
  fallbackSheetName?: string | null,
  fallbackRangeA1?: string | null,
): ComputeOp | null {
  const params = step.params || {};
  const explicitSheetRaw = firstNonEmptyString([
    params.sheetName,
    params.sheet,
    params.targetSheet,
  ]);
  const explicitSheet = explicitSheetRaw
    ? String(explicitSheetRaw)
        .replace(/^(?:in|on|at)\s+/i, "")
        .trim()
    : null;
  const effectiveSheet = explicitSheet || fallbackSheetName || null;
  const rangeA1 = normalizeRange(
    params.rangeA1 || params.range || params.a1 || fallbackRangeA1,
    effectiveSheet,
  );

  switch (step.op) {
    case "XLSX_SET_CELL_VALUE":
    case "XLSX_SET_RANGE_VALUES": {
      if (params.convertToNumeric === true) return null;
      if (!rangeA1 || !("value" in params)) return null;
      const scalar = coerceScalar(params.value);
      return {
        kind: "set_values",
        rangeA1,
        values: [[scalar]],
      };
    }
    case "XLSX_SET_CELL_FORMULA": {
      if (!rangeA1 || !("formula" in params)) return null;
      const target = normalizeRange(
        params.rangeA1 || params.a1,
        effectiveSheet,
      );
      if (!target) return null;
      const formulaRaw = String(params.formula || "").trim();
      if (!formulaRaw) return null;
      const formula = formulaRaw.startsWith("=")
        ? formulaRaw.slice(1).trim()
        : formulaRaw;
      return {
        kind: "set_formula",
        a1: target,
        formula,
      };
    }
    case "XLSX_SET_NUMBER_FORMAT": {
      if (!rangeA1) return null;
      const pattern = String(params.pattern || params.format || "").trim();
      if (!pattern) return null;
      return {
        kind: "set_number_format",
        rangeA1,
        pattern,
      };
    }
    case "XLSX_FORMAT_RANGE": {
      if (!rangeA1) return null;
      const format: Record<string, unknown> = {};
      if (typeof params.bold === "boolean") format.bold = params.bold;
      if (typeof params.italic === "boolean") format.italic = params.italic;
      if (typeof params.underline === "boolean")
        format.underline = params.underline;
      if (typeof params.color === "string" && params.color.trim())
        format.color = params.color;
      if (typeof params.fontFamily === "string" && params.fontFamily.trim())
        format.fontFamily = params.fontFamily;
      if (
        typeof params.fontSize === "number" &&
        Number.isFinite(params.fontSize)
      )
        format.fontSizePt = params.fontSize;
      if (!Object.keys(format).length) return null;
      return {
        kind: "format_range",
        rangeA1,
        format,
      };
    }
    case "XLSX_SORT_RANGE": {
      if (!rangeA1) return null;
      const sortSpecs = Array.isArray(params.sortSpecs)
        ? params.sortSpecs
        : [
            {
              column: String(params.column || "2"),
              order: String(params.order || "ASC").toUpperCase(),
            },
          ];
      return {
        kind: "sort_range",
        rangeA1,
        hasHeader: params.hasHeader !== false,
        sortSpecs,
      };
    }
    case "XLSX_FILTER_APPLY": {
      if (!rangeA1) return null;
      return {
        kind: "filter_range",
        rangeA1,
      };
    }
    case "XLSX_FILTER_CLEAR": {
      const inferredSheet =
        effectiveSheet || (rangeA1 ? sheetFromRange(rangeA1) : null);
      if (!inferredSheet) return null;
      return {
        kind: "clear_filter",
        sheetName: inferredSheet,
      };
    }
    case "XLSX_TABLE_CREATE": {
      if (!rangeA1) return null;
      return {
        kind: "create_table",
        rangeA1,
        hasHeader: params.hasHeader !== false,
        ...(typeof params.style === "string" && params.style.trim()
          ? { style: params.style }
          : {}),
      };
    }
    case "XLSX_FREEZE_PANES": {
      const inferredSheet =
        effectiveSheet || (rangeA1 ? sheetFromRange(rangeA1) : null);
      if (!inferredSheet) return null;
      return {
        kind: "set_freeze_panes",
        sheetName: inferredSheet,
        frozenRowCount: Number(params.frozenRowCount || params.rows || 0),
        frozenColumnCount: Number(
          params.frozenColumnCount || params.columns || 0,
        ),
      };
    }
    case "XLSX_INSERT_ROWS":
    case "XLSX_DELETE_ROWS": {
      const inferredSheet =
        effectiveSheet || (rangeA1 ? sheetFromRange(rangeA1) : null);
      if (!inferredSheet) return null;
      // Derive startIndex/count from rangeA1 when not explicitly provided
      let rowStart = Number(params.startIndex ?? -1);
      let rowCount = Number(params.count ?? 0);
      if ((rowStart < 0 || !rowCount) && rangeA1) {
        const rowNums = String(rangeA1).match(/(\d+)/g);
        const r1 = rowNums?.[0] ? Number(rowNums[0]) : 0;
        const r2 = rowNums?.[1] ? Number(rowNums[1]) : r1;
        if (r1 > 0) {
          rowStart = r1 - 1; // 0-based
          rowCount = Math.max(1, r2 - r1 + 1);
        }
      }
      if (rowStart < 0) rowStart = 0;
      if (!rowCount) rowCount = 1;
      const rowKind =
        step.op === "XLSX_INSERT_ROWS" ? "insert_rows" : "delete_rows";
      return {
        kind: rowKind,
        sheetName: inferredSheet,
        startIndex: rowStart,
        count: rowCount,
      };
    }
    case "XLSX_INSERT_COLUMNS":
    case "XLSX_DELETE_COLUMNS": {
      const inferredSheet =
        effectiveSheet || (rangeA1 ? sheetFromRange(rangeA1) : null);
      if (!inferredSheet) return null;
      // Derive startIndex/count from rangeA1 when not explicitly provided
      let colStart = Number(params.startIndex ?? -1);
      let colCount = Number(params.count ?? 0);
      if ((colStart < 0 || !colCount) && rangeA1) {
        const colLetters = String(rangeA1).match(/([A-Z]+)/gi);
        const colToNum = (s: string) =>
          s
            .toUpperCase()
            .split("")
            .reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0);
        const c1 = colLetters?.[0] ? colToNum(colLetters[0]) : 0;
        const c2 = colLetters?.[1] ? colToNum(colLetters[1]) : c1;
        if (c1 > 0) {
          colStart = c1 - 1; // 0-based
          colCount = Math.max(1, c2 - c1 + 1);
        }
      }
      if (colStart < 0) colStart = 0;
      if (!colCount) colCount = 1;
      const colKind =
        step.op === "XLSX_INSERT_COLUMNS" ? "insert_columns" : "delete_columns";
      return {
        kind: colKind,
        sheetName: inferredSheet,
        startIndex: colStart,
        count: colCount,
      };
    }
    case "XLSX_CHART_CREATE": {
      if (!rangeA1) return null;
      const type = String(params.chartType || params.type || "line")
        .trim()
        .toLowerCase();
      return {
        kind: "create_chart",
        rangeA1,
        type,
        ...(typeof params.title === "string" && params.title.trim()
          ? { title: params.title }
          : {}),
      };
    }
    case "XLSX_DATA_VALIDATION_SET": {
      if (!rangeA1) return null;
      const rule =
        params.rule && typeof params.rule === "object" ? params.rule : null;
      if (!rule) return null;
      return {
        kind: "set_data_validation",
        rangeA1,
        rule,
      };
    }
    default:
      return null;
  }
}

export class ExcelSourceOfTruthService {
  toComputeOps(input: ExcelSoTInput): ExcelSoTResult {
    const message = String(input.message || "").trim();
    if (!message) return { kind: "none", reason: "empty_message" };

    const explicitRanges = extractAllRangesFromMessage(message);
    const sheetFromMessage = parseSheetMention(message, input.sheetNames);
    const fallbackSheetFromViewer =
      String(input.viewerSheetName || "").trim() || null;
    const chosenSheet = sheetFromMessage || fallbackSheetFromViewer || null;

    // Hard guard: formatting commands must never be converted to value writes.
    const explicitFormatPattern = formatPatternFromMessage(message);
    if (explicitFormatPattern) {
      const chosenRange =
        normalizeRange(
          explicitRanges[0] || input.viewerRangeA1 || "",
          chosenSheet,
        ) || normalizeRange(input.viewerRangeA1 || "", chosenSheet);
      if (chosenRange) {
        return {
          kind: "plan",
          ops: [
            {
              kind: "set_number_format",
              rangeA1: chosenRange,
              pattern: explicitFormatPattern,
            },
          ],
          sourcePatternIds: ["heuristic:number_format"],
          canonicalOps: ["XLSX_SET_NUMBER_FORMAT"],
        };
      }
    }

    // Hard guard: row insertion requests with explicit row number.
    const rowInsert = parseRowInsertIntent(message);
    if (rowInsert) {
      return {
        kind: "plan",
        ops: [
          {
            kind: "insert_rows",
            sheetName: chosenSheet || "Sheet1",
            startIndex: Math.max(0, rowInsert.row - 1),
            count: rowInsert.count,
          },
        ],
        sourcePatternIds: ["heuristic:insert_rows"],
        canonicalOps: ["XLSX_INSERT_ROWS"],
      };
    }

    // Hard guard: row deletion requests with explicit row numbers.
    const rowDelete = parseRowDeleteIntent(message);
    if (rowDelete) {
      return {
        kind: "plan",
        ops: [
          {
            kind: "delete_rows",
            sheetName: chosenSheet || "Sheet1",
            startIndex: Math.max(0, rowDelete.startRow - 1),
            count: rowDelete.count,
          },
        ],
        sourcePatternIds: ["heuristic:delete_rows"],
        canonicalOps: ["XLSX_DELETE_ROWS"],
      };
    }

    // Hard guard: "delete these/selected rows" — derive from viewer selection.
    const low = message.toLowerCase();
    if (
      /\b(delete|remove)\b/.test(low) &&
      /\b(these|selected|this)\b/.test(low) &&
      /\brows?\b/.test(low)
    ) {
      const viewerRange = input.viewerRangeA1;
      if (viewerRange) {
        const rowNums = String(viewerRange).match(/(\d+)/g);
        const r1 = rowNums?.[0] ? Number(rowNums[0]) : 0;
        const r2 = rowNums?.[1] ? Number(rowNums[1]) : r1;
        if (r1 > 0) {
          return {
            kind: "plan",
            ops: [
              {
                kind: "delete_rows",
                sheetName: chosenSheet || "Sheet1",
                startIndex: r1 - 1,
                count: Math.max(1, r2 - r1 + 1),
              },
            ],
            sourcePatternIds: ["heuristic:delete_rows_selection"],
            canonicalOps: ["XLSX_DELETE_ROWS"],
          };
        }
      }
    }

    // Hard guard: explicit numeric set-cell commands.
    const setCellNumeric = parseSetCellNumericIntent(message);
    if (setCellNumeric) {
      const rangeA1 = normalizeRange(
        setCellNumeric.cellA1,
        setCellNumeric.sheetName || chosenSheet || null,
      );
      if (rangeA1) {
        return {
          kind: "plan",
          ops: [
            { kind: "set_values", rangeA1, values: [[setCellNumeric.value]] },
          ],
          sourcePatternIds: ["heuristic:set_cell_numeric"],
          canonicalOps: ["XLSX_SET_CELL_VALUE"],
        };
      }
    }

    // Hard guard: chart commands with one or two explicit ranges.
    const chartHeuristic = parseChartIntent(
      message,
      input.sheetNames,
      chosenSheet,
    );
    if (chartHeuristic) {
      return {
        kind: "plan",
        ops: [chartHeuristic],
        sourcePatternIds: ["heuristic:create_chart"],
        canonicalOps: ["XLSX_CHART_CREATE"],
      };
    }

    const viewerContext: Record<string, unknown> = {
      ...(input.viewerSheetName ? { sheetName: input.viewerSheetName } : {}),
      ...(input.viewerRangeA1
        ? {
            selection: {
              sheetName: input.viewerSheetName || null,
              rangeA1: input.viewerRangeA1,
            },
          }
        : {}),
    };

    const analyzed = analyzeMessageToPlan({
      message,
      domain: "excel",
      viewerContext,
      ...(input.language ? { language: input.language } : {}),
    });

    if (!analyzed) {
      return { kind: "none", reason: "no_intent_runtime_match" };
    }

    if (analyzed.kind === "clarification") {
      const first = analyzed.missingSlots[0];
      return {
        kind: "clarification",
        message: String(first?.message || "Please clarify what to change."),
        missingSlots: analyzed.missingSlots
          .map((item) => String(item.slot || ""))
          .filter(Boolean),
        sourcePatternIds: analyzed.sourcePatternIds || [],
      };
    }

    const unsupported: string[] = [];
    const ops: ComputeOp[] = [];
    const explicitRangeInMessage = extractRangeFromMessage(message);
    const semanticCellTarget = resolveSemanticCellTarget(
      message,
      input.cellFacts,
    );
    const semanticColumnRange = resolveSemanticColumnRange(
      message,
      input.cellFacts,
    );
    const semanticTableRange = resolveSemanticTableRange(input.cellFacts);
    const hasSemanticTarget = Boolean(
      semanticCellTarget || semanticColumnRange || semanticTableRange,
    );
    const fallbackRangeA1 =
      explicitRangeInMessage ||
      (hasSemanticTarget ? null : input.viewerRangeA1 || null);
    const sheetNameFallback =
      Array.isArray(input.sheetNames) && input.sheetNames.length > 0
        ? String(input.sheetNames[0] || "").trim() || null
        : null;
    const semanticSheetName =
      semanticCellTarget?.sheetName ||
      semanticColumnRange?.sheetName ||
      semanticTableRange?.sheetName ||
      sheetNameFallback ||
      null;

    for (const step of analyzed.ops) {
      const paramsWithSemantic = { ...(step.params || {}) } as Record<
        string,
        unknown
      >;
      const needsRangeA1 = !String(
        paramsWithSemantic.rangeA1 ||
          paramsWithSemantic.range ||
          paramsWithSemantic.a1 ||
          "",
      ).trim();
      if (needsRangeA1) {
        if (
          step.op === "XLSX_SET_CELL_VALUE" ||
          step.op === "XLSX_SET_CELL_FORMULA"
        ) {
          if (semanticCellTarget?.a1)
            paramsWithSemantic.rangeA1 = semanticCellTarget.a1;
        } else if (
          step.op === "XLSX_SET_RANGE_VALUES" ||
          step.op === "XLSX_FORMAT_RANGE" ||
          step.op === "XLSX_SET_NUMBER_FORMAT" ||
          step.op === "XLSX_SORT_RANGE" ||
          step.op === "XLSX_FILTER_APPLY" ||
          step.op === "XLSX_TABLE_CREATE"
        ) {
          if (semanticColumnRange?.rangeA1)
            paramsWithSemantic.rangeA1 = semanticColumnRange.rangeA1;
        } else if (step.op === "XLSX_CHART_CREATE") {
          if (semanticTableRange?.rangeA1)
            paramsWithSemantic.rangeA1 = semanticTableRange.rangeA1;
        }
      }
      if (
        !String(paramsWithSemantic.sheetName || "").trim() &&
        semanticSheetName
      ) {
        paramsWithSemantic.sheetName = semanticSheetName;
      }
      const mapped = toComputeOp(
        { ...step, params: paramsWithSemantic },
        semanticSheetName || input.viewerSheetName || null,
        fallbackRangeA1,
      );
      if (!mapped) {
        unsupported.push(step.op);
        continue;
      }
      ops.push(mapped);
    }

    if (!ops.length && unsupported.length) {
      return {
        kind: "unsupported",
        reason: "intent_runtime_ops_not_mappable",
        unsupportedOps: unsupported,
        sourcePatternIds: analyzed.sourcePatternIds || [],
      };
    }

    if (!ops.length) {
      return {
        kind: "none",
        reason: "intent_runtime_no_ops",
      };
    }

    return {
      kind: "plan",
      ops,
      sourcePatternIds: analyzed.sourcePatternIds || [],
      canonicalOps: analyzed.ops.map((step) => step.op),
    };
  }
}

export default ExcelSourceOfTruthService;
