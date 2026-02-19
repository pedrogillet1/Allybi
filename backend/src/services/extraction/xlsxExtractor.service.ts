/**
 * Enhanced XLSX Extractor with Cell-Level Anchored Extraction
 *
 * This service extracts structured data from Excel spreadsheets, enabling:
 * - Anchor-based cell indexing (anchor.type = 'xlsx_cell')
 * - "What is EBITDA in July 2024?" queries
 * - Deterministic value lookup (no LLM math)
 * - Period-aware retrieval (month/quarter/year)
 *
 * Extracts:
 * - Sheet summaries with headers and row labels
 * - Cell facts with rowLabel + colHeader + period parsing
 * - Financial indicator detection
 */

import * as XLSX from "xlsx";
import type {
  XlsxExtractionResult,
  XlsxSheetSummary,
  XlsxCellFact,
  BaseExtractionResult,
} from "../../types/extraction.types";
import type { XlsxCellAnchor } from "../../types/extraction.types";
import { createXlsxCellAnchor } from "../../types/extraction.types";

// ============================================================================
// Constants
// ============================================================================

/**
 * Financial metric keywords for row label detection
 */
const FINANCIAL_KEYWORDS = [
  // Income Statement
  "revenue",
  "receita",
  "sales",
  "vendas",
  "gross profit",
  "lucro bruto",
  "operating income",
  "operating profit",
  "ebit",
  "ebitda",
  "net income",
  "lucro líquido",
  "earnings",
  "profit",
  "lucro",
  "margin",
  "margem",
  // Balance Sheet
  "assets",
  "ativos",
  "liabilities",
  "passivos",
  "equity",
  "patrimônio",
  "cash",
  "caixa",
  "debt",
  "dívida",
  "inventory",
  "estoque",
  "receivables",
  "contas a receber",
  "payables",
  "contas a pagar",
  // Cash Flow
  "cash flow",
  "fluxo de caixa",
  "operating cash",
  "investing",
  "financing",
  "capex",
  // Ratios
  "roi",
  "roe",
  "roa",
  "eps",
  "p/e",
  "debt/equity",
];

/**
 * Month patterns for period detection (EN + PT)
 */
const MONTH_PATTERNS: { pattern: RegExp; month: number }[] = [
  // English
  { pattern: /\bjan(?:uary)?\b/i, month: 1 },
  { pattern: /\bfeb(?:ruary)?\b/i, month: 2 },
  { pattern: /\bmar(?:ch)?\b/i, month: 3 },
  { pattern: /\bapr(?:il)?\b/i, month: 4 },
  { pattern: /\bmay\b/i, month: 5 },
  { pattern: /\bjun(?:e)?\b/i, month: 6 },
  { pattern: /\bjul(?:y)?\b/i, month: 7 },
  { pattern: /\baug(?:ust)?\b/i, month: 8 },
  { pattern: /\bsep(?:t(?:ember)?)?\b/i, month: 9 },
  { pattern: /\boct(?:ober)?\b/i, month: 10 },
  { pattern: /\bnov(?:ember)?\b/i, month: 11 },
  { pattern: /\bdec(?:ember)?\b/i, month: 12 },
  // Portuguese
  { pattern: /\bjaneiro\b/i, month: 1 },
  { pattern: /\bfevereiro\b/i, month: 2 },
  { pattern: /\bmarço\b/i, month: 3 },
  { pattern: /\babril\b/i, month: 4 },
  { pattern: /\bmaio\b/i, month: 5 },
  { pattern: /\bjunho\b/i, month: 6 },
  { pattern: /\bjulho\b/i, month: 7 },
  { pattern: /\bagosto\b/i, month: 8 },
  { pattern: /\bsetembro\b/i, month: 9 },
  { pattern: /\boutubro\b/i, month: 10 },
  { pattern: /\bnovembro\b/i, month: 11 },
  { pattern: /\bdezembro\b/i, month: 12 },
];

/**
 * Quarter patterns for period detection
 */
const QUARTER_PATTERNS: { pattern: RegExp; quarter: number }[] = [
  { pattern: /\bq1\b/i, quarter: 1 },
  { pattern: /\bq2\b/i, quarter: 2 },
  { pattern: /\bq3\b/i, quarter: 3 },
  { pattern: /\bq4\b/i, quarter: 4 },
  { pattern: /\b1[ºª]?\s*t(?:ri(?:mestre)?)?\b/i, quarter: 1 },
  { pattern: /\b2[ºª]?\s*t(?:ri(?:mestre)?)?\b/i, quarter: 2 },
  { pattern: /\b3[ºª]?\s*t(?:ri(?:mestre)?)?\b/i, quarter: 3 },
  { pattern: /\b4[ºª]?\s*t(?:ri(?:mestre)?)?\b/i, quarter: 4 },
];

// ============================================================================
// Period Parsing
// ============================================================================

/**
 * Parse period information from a header string (e.g., "Jul-2024", "Q3 2023")
 */
function parsePeriod(header: string):
  | {
      year?: number;
      month?: number;
      quarter?: number;
    }
  | undefined {
  const result: { year?: number; month?: number; quarter?: number } = {};
  const str = String(header);

  // Extract year (4-digit number)
  const yearMatch = str.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) {
    result.year = parseInt(yearMatch[0], 10);
  }

  // Extract month
  for (const { pattern, month } of MONTH_PATTERNS) {
    if (pattern.test(str)) {
      result.month = month;
      break;
    }
  }

  // Extract quarter
  for (const { pattern, quarter } of QUARTER_PATTERNS) {
    if (pattern.test(str)) {
      result.quarter = quarter;
      break;
    }
  }

  // Return undefined if no period info found
  if (!result.year && !result.month && !result.quarter) {
    return undefined;
  }

  return result;
}

/**
 * Check if headers contain temporal columns
 */
function hasTemporalHeaders(headers: string[]): boolean {
  return headers.some((h) => {
    const str = String(h);
    // Check for year
    if (/\b(19|20)\d{2}\b/.test(str)) return true;
    // Check for month
    for (const { pattern } of MONTH_PATTERNS) {
      if (pattern.test(str)) return true;
    }
    // Check for quarter
    for (const { pattern } of QUARTER_PATTERNS) {
      if (pattern.test(str)) return true;
    }
    return false;
  });
}

/**
 * Check if a row label looks like a financial metric
 */
function isFinancialMetric(label: string): boolean {
  const lower = String(label).toLowerCase();
  return FINANCIAL_KEYWORDS.some((kw) => lower.includes(kw));
}

// ============================================================================
// Cell Address Helpers
// ============================================================================

/**
 * Convert column index to Excel column letter (0 -> A, 25 -> Z, 26 -> AA)
 */
function colIndexToLetter(index: number): string {
  let result = "";
  let n = index;
  while (n >= 0) {
    result = String.fromCharCode((n % 26) + 65) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

/**
 * Get cell address from row and column indices (0-based)
 */
function getCellAddress(row: number, col: number): string {
  return `${colIndexToLetter(col)}${row + 1}`;
}

// ============================================================================
// Sheet Processing
// ============================================================================

interface ProcessedSheet {
  summary: XlsxSheetSummary;
  cellFacts: XlsxCellFact[];
  textContent: string;
}

/**
 * Process a single sheet and extract structured data
 */
function processSheet(
  sheet: XLSX.WorkSheet,
  sheetName: string,
  sheetIndex: number,
): ProcessedSheet {
  // Convert to array of arrays
  const data = XLSX.utils.sheet_to_json<any[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
    raw: false,
  }) as any[][];

  if (!data || data.length === 0) {
    return {
      summary: {
        name: sheetName,
        index: sheetIndex,
        rowCount: 0,
        columnCount: 0,
        headers: [],
        rowLabels: [],
        hasTemporalColumns: false,
        isFinancial: false,
      },
      cellFacts: [],
      textContent: `=== Sheet: ${sheetName} (Empty) ===\n`,
    };
  }

  // Detect header row (first non-empty row with mostly strings)
  let headerRowIndex = 0;
  let headers: string[] = [];

  for (let i = 0; i < Math.min(5, data.length); i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    const nonEmpty = row.filter(
      (c) => c !== null && c !== undefined && c !== "",
    );
    const stringCount = nonEmpty.filter(
      (c) => typeof c === "string" && isNaN(Number(c)),
    ).length;

    // Header row should have mostly string values
    if (nonEmpty.length >= 2 && stringCount / nonEmpty.length > 0.5) {
      headerRowIndex = i;
      headers = row.map((c) =>
        c !== null && c !== undefined ? String(c).trim() : "",
      );
      break;
    }
  }

  // Extract row labels (first column values)
  const rowLabels: string[] = [];
  for (let i = headerRowIndex + 1; i < data.length; i++) {
    const row = data[i];
    if (row && row[0] !== null && row[0] !== undefined && row[0] !== "") {
      const label = String(row[0]).trim();
      if (label && !rowLabels.includes(label)) {
        rowLabels.push(label);
      }
    }
  }

  // Calculate dimensions
  const columnCount = Math.max(...data.map((row) => (row ? row.length : 0)));
  const rowCount = data.length;

  // Check for temporal and financial content
  const temporal = hasTemporalHeaders(headers);
  const financial = rowLabels.some(isFinancialMetric);

  // Extract cell facts (for financial/metric data)
  const cellFacts: XlsxCellFact[] = [];

  if (financial || temporal) {
    // Process data rows
    for (let rowIdx = headerRowIndex + 1; rowIdx < data.length; rowIdx++) {
      const row = data[rowIdx];
      if (!row) continue;

      const rowLabel =
        row[0] !== null && row[0] !== undefined ? String(row[0]).trim() : "";
      if (!rowLabel) continue;

      // Process each cell in the row
      for (let colIdx = 1; colIdx < row.length; colIdx++) {
        const cellValue = row[colIdx];
        if (cellValue === null || cellValue === undefined || cellValue === "") {
          continue;
        }

        const colHeader = headers[colIdx] || "";
        const cellAddress = getCellAddress(rowIdx, colIdx);

        // Determine value type
        let value: number | string = cellValue;
        let valueType: "number" | "string" | "date" | "formula" = "string";

        if (typeof cellValue === "number") {
          value = cellValue;
          valueType = "number";
        } else if (!isNaN(Number(cellValue))) {
          value = Number(cellValue);
          valueType = "number";
        } else if (cellValue instanceof Date) {
          value = cellValue.toISOString();
          valueType = "date";
        }

        // Parse period from column header
        const period = parsePeriod(colHeader);

        const fact: XlsxCellFact = {
          sheet: sheetName,
          cell: cellAddress,
          rowLabel,
          colHeader,
          value: String(value),
          displayValue: String(cellValue),
          period,
          valueType,
        };

        cellFacts.push(fact);
      }
    }
  }

  // Build text representation
  let textContent = `=== Sheet: ${sheetName} ===\n`;
  textContent += `Rows: ${rowCount}, Columns: ${columnCount}\n\n`;

  // Add headers
  if (headers.length > 0) {
    textContent += `Headers: ${headers.filter((h) => h).join(" | ")}\n`;
    textContent += "-".repeat(60) + "\n";
  }

  // Add data rows
  for (let i = headerRowIndex + 1; i < Math.min(data.length, 100); i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    const rowText = row
      .map((cell, idx) => {
        if (cell === null || cell === undefined || cell === "") return "";
        return typeof cell === "string" ? `"${cell}"` : String(cell);
      })
      .filter((c) => c)
      .join(" | ");

    if (rowText) {
      textContent += `Row ${i}: ${rowText}\n`;
    }
  }

  if (data.length > 100) {
    textContent += `... and ${data.length - 100} more rows\n`;
  }

  return {
    summary: {
      name: sheetName,
      index: sheetIndex,
      rowCount,
      columnCount,
      headers: headers.filter((h) => h),
      rowLabels: rowLabels.slice(0, 50), // Limit stored row labels
      hasTemporalColumns: temporal,
      isFinancial: financial,
    },
    cellFacts,
    textContent,
  };
}

// ============================================================================
// Main Extraction
// ============================================================================

/**
 * Extract structured data from XLSX with cell-level anchoring.
 *
 * Returns:
 * - sheets[]: Array of sheet summaries with headers/rowLabels
 * - cellFacts[]: Array of cell facts with rowLabel + colHeader + period
 * - sheetNames[]: Array of sheet names
 * - isFinancial: Whether spreadsheet contains financial data
 *
 * Usage:
 * ```typescript
 * const result = await extractXlsxWithAnchors(buffer);
 * for (const fact of result.cellFacts) {
 *   const anchor = createXlsxCellAnchor(fact.sheet, fact.cell, {
 *     rowLabel: fact.rowLabel,
 *     colHeader: fact.colHeader,
 *     period: fact.period,
 *   });
 *   // Index fact.value with anchor for retrieval
 * }
 * ```
 */
export async function extractXlsxWithAnchors(
  buffer: Buffer,
): Promise<XlsxExtractionResult> {
  console.log(
    `📊 [XLSX] Starting structured extraction (${buffer.length} bytes)...`,
  );

  try {
    // Read workbook
    const workbook = XLSX.read(buffer, {
      type: "buffer",
      cellFormula: true,
      cellStyles: true,
      cellDates: true,
      cellNF: true,
    });

    if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error("Excel file contains no sheets");
    }

    const sheetNames = workbook.SheetNames;
    const sheets: XlsxSheetSummary[] = [];
    const allCellFacts: XlsxCellFact[] = [];
    const allHeaders: Set<string> = new Set();
    const allRowLabels: Set<string> = new Set();
    let textContent = "";
    let isFinancial = false;

    // Process each sheet
    for (let i = 0; i < sheetNames.length; i++) {
      const sheetName = sheetNames[i];
      const sheet = workbook.Sheets[sheetName];

      if (!sheet) {
        console.warn(`⚠️ [XLSX] Sheet "${sheetName}" is null`);
        continue;
      }

      const processed = processSheet(sheet, sheetName, i);
      sheets.push(processed.summary);
      allCellFacts.push(...processed.cellFacts);
      textContent += processed.textContent + "\n\n";

      // Aggregate headers and row labels
      processed.summary.headers.forEach((h: any) => allHeaders.add(h));
      processed.summary.rowLabels.forEach((l: any) => allRowLabels.add(l));

      if (processed.summary.isFinancial) {
        isFinancial = true;
      }
    }

    const wordCount = textContent
      .split(/\s+/)
      .filter((w) => w.length > 0).length;

    console.log(
      `✅ [XLSX] Extracted ${sheetNames.length} sheets, ${allCellFacts.length} cell facts, ${isFinancial ? "financial" : "non-financial"}`,
    );

    return {
      sourceType: "xlsx",
      text: textContent.trim(),
      sheetCount: sheetNames.length,
      sheetNames,
      sheets,
      cellFacts: allCellFacts,
      isFinancial,
      allHeaders: Array.from(allHeaders),
      allRowLabels: Array.from(allRowLabels),
      wordCount,
      confidence: 1.0,
    };
  } catch (error: any) {
    console.error("❌ [XLSX] Extraction failed:", error.message);

    if (
      error.message?.includes("Unsupported file") ||
      error.message?.includes("ZIP")
    ) {
      throw new Error(
        "Excel file is corrupted or in an unsupported format. Expected .xlsx or .xls file.",
      );
    }

    if (
      error.message?.includes("encrypted") ||
      error.message?.includes("password")
    ) {
      throw new Error(
        "Excel file is password-protected. Please remove the password and try again.",
      );
    }

    throw new Error(`Failed to extract text from Excel: ${error.message}`);
  }
}

// ============================================================================
// Legacy Compatibility
// ============================================================================

/**
 * Legacy extraction function that returns single text blob.
 * Use extractXlsxWithAnchors() for anchor support.
 */
export async function extractTextFromExcel(
  buffer: Buffer,
): Promise<BaseExtractionResult> {
  const result = await extractXlsxWithAnchors(buffer);
  return {
    text: result.text,
    wordCount: result.wordCount,
    confidence: result.confidence,
  };
}

// ============================================================================
// Anchor Helpers
// ============================================================================

/**
 * Create an XLSX cell anchor for a cell fact.
 */
export function createCellAnchorFromFact(fact: XlsxCellFact): XlsxCellAnchor {
  return createXlsxCellAnchor(
    (fact as any).sheet ?? fact.sheetName,
    fact.cell,
    {
      rowLabel: fact.rowLabel,
      colHeader: fact.colHeader,
      period: fact.period,
    },
  );
}

/**
 * Get all anchors for an XLSX extraction result.
 * Returns one anchor per cell fact.
 */
export function getCellAnchors(result: XlsxExtractionResult): XlsxCellAnchor[] {
  return result.cellFacts.map((fact: any) => createCellAnchorFromFact(fact));
}

/**
 * Find cell fact by metric and period.
 * Used for deterministic value lookup (no LLM math).
 */
export function findCellFact(
  result: XlsxExtractionResult,
  options: {
    rowLabel?: string;
    month?: number;
    year?: number;
    quarter?: number;
    sheet?: string;
  },
): XlsxCellFact | undefined {
  const { rowLabel, month, year, quarter, sheet } = options;

  return result.cellFacts.find((fact: any) => {
    // Match sheet if specified
    if (sheet && fact.sheet.toLowerCase() !== sheet.toLowerCase()) {
      return false;
    }

    // Match row label (fuzzy)
    if (rowLabel) {
      const factLabel = fact.rowLabel.toLowerCase();
      const searchLabel = rowLabel.toLowerCase();
      if (
        !factLabel.includes(searchLabel) &&
        !searchLabel.includes(factLabel)
      ) {
        return false;
      }
    }

    // Match period
    if (year && fact.period?.year !== year) {
      return false;
    }
    if (month && fact.period?.month !== month) {
      return false;
    }
    if (quarter && fact.period?.quarter !== quarter) {
      return false;
    }

    return true;
  });
}

// ============================================================================
// Exports
// ============================================================================

export default {
  extractXlsxWithAnchors,
  extractTextFromExcel,
  createCellAnchorFromFact,
  getCellAnchors,
  findCellFact,
};
