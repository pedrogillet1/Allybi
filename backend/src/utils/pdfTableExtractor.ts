/**
 * PDF Table Extractor Utility
 * Detects and extracts tables from PDF text by analyzing spacing patterns
 *
 * ✅ FIX: Preserves table structure in extracted text as markdown tables
 */

import { logger } from "./logger";
import { recordTablesDetected } from "../services/ingestion/pipeline/pipelineMetrics.service";

export interface StructuredRow {
  rowIndex: number;
  cells: Array<{ text: string; colIndex: number }>;
  isHeader: boolean;
}

export interface TableInfo {
  startLine: number;
  endLine: number;
  rows: string[][];
  structuredRows?: StructuredRow[];
  markdown: string;
  confidence: number;
}

export interface TableExtractionResult {
  text: string;
  tables: TableInfo[];
  tableCount: number;
}

/**
 * Detect if a line looks like a table row
 * Table rows typically have:
 * - Multiple values separated by 2+ spaces
 * - Consistent spacing patterns
 * - Often contain numbers
 */
function isLikelyTableRow(line: string): boolean {
  if (!line || line.trim().length === 0) {
    return false;
  }

  const trimmed = line.trim();
  const isMarkdownSeparator = /^:?-{3,}:?(?:\s*\|\s*:?-{3,}:?)+$/.test(
    trimmed.replace(/^\|/, "").replace(/\|$/, ""),
  );
  if (isMarkdownSeparator) {
    return true;
  }

  // Check for multiple space-separated columns (3+ spaces between values)
  const hasMultipleSpaces = /\s{3,}/.test(line);

  // Check for tab-separated values
  const hasTabs = /\t/.test(line);

  // Check for pipe-separated values (already markdown table)
  const hasPipes = /\|.*\|/.test(line);

  // Count potential columns (separated by 3+ spaces, tabs, or markdown pipes)
  const columns = hasPipes
    ? line
        .split("|")
        .map((c) => c.trim())
        .filter((c) => c.length > 0)
    : line.split(/\s{3,}|\t+/).filter((c) => c.trim().length > 0);
  const hasMultipleColumns = columns.length >= 2;
  if (!hasMultipleColumns) {
    return false;
  }

  // Check if line has numbers (common in data tables)
  const hasNumbers = /\d/.test(line);
  const numericColumnCount = columns.filter((c) =>
    /[-+]?[$€£]?\d[\d,.\s%]*$/.test(c.trim()),
  ).length;

  // Check if line starts with a number or bullet (common row indicator)
  const startsWithNumber = /^\s*\d+[\.\)\s]/.test(line);

  // Check for list-like patterns (numbered lists, bullet points)
  const isNumberedList = /^\s*\d+[\.\)]\s/.test(line);
  const isBulletList = /^\s*[-•*]\s/.test(line);

  // Calculate score
  let score = 0;
  if (hasMultipleSpaces) score += 2;
  if (hasTabs) score += 2;
  if (hasPipes) score += 3;
  if (hasMultipleColumns) score += 2;
  if (hasNumbers) score += 1;
  if (numericColumnCount > 0) score += 1;
  if (startsWithNumber && !isNumberedList) score += 1;

  // Penalize list-like patterns to reduce false positives
  if (isNumberedList) score -= 2;
  if (isBulletList) score -= 1;

  // Penalize prose-like lines with one very long sentence.
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount > 22 && numericColumnCount === 0 && !hasPipes) score -= 2;

  return score >= 4 && (hasMultipleSpaces || hasTabs || hasPipes);
}

/**
 * Analyze column alignment in potential table rows
 * Returns column positions if alignment is detected
 */
function detectColumnPositions(rows: string[]): number[] {
  if (rows.length < 2) return [];

  // Find all space positions in each row
  const spacePositions: Map<number, number> = new Map();

  for (const row of rows) {
    let inSpace = false;
    let spaceStart = -1;

    for (let i = 0; i < row.length; i++) {
      if (row[i] === " " || row[i] === "\t") {
        if (!inSpace) {
          inSpace = true;
          spaceStart = i;
        }
      } else {
        if (inSpace && i - spaceStart >= 2) {
          // Found a significant space gap, record the transition point
          const pos = spaceStart + Math.floor((i - spaceStart) / 2);
          spacePositions.set(pos, (spacePositions.get(pos) || 0) + 1);
        }
        inSpace = false;
      }
    }
  }

  // Find column positions that appear in most rows
  const threshold = Math.floor(rows.length * 0.5);
  const columns: number[] = [];

  for (const [pos, count] of spacePositions.entries()) {
    if (count >= threshold) {
      // Check if not too close to another column
      const tooClose = columns.some((c) => Math.abs(c - pos) < 3);
      if (!tooClose) {
        columns.push(pos);
      }
    }
  }

  return columns.sort((a, b) => a - b);
}

/**
 * Split a row into cells based on detected column positions
 */
function splitRowIntoCells(row: string, columnPositions: number[]): string[] {
  if (/\|/.test(row)) {
    const piped = row
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    if (piped.length >= 2) {
      return piped;
    }
  }

  if (columnPositions.length === 0) {
    // Fallback: split by multiple spaces/tabs
    return row
      .split(/\s{3,}|\t+/)
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
  }

  const cells: string[] = [];
  let lastPos = 0;

  for (const pos of columnPositions) {
    if (pos < row.length) {
      cells.push(row.substring(lastPos, pos).trim());
      lastPos = pos;
    }
  }

  // Add the last cell
  cells.push(row.substring(lastPos).trim());

  return cells.filter((c) => c.length > 0 || cells.length > 1);
}

/**
 * Format table rows as markdown table
 */
export function formatAsMarkdownTable(rows: string[][]): string {
  if (rows.length === 0) return "";

  // Determine column count from the row with most cells
  const columnCount = Math.max(...rows.map((r) => r.length));

  // Normalize all rows to have the same number of columns
  const normalizedRows = rows.map((row) => {
    const normalized = [...row];
    while (normalized.length < columnCount) {
      normalized.push("");
    }
    return normalized;
  });

  // Calculate column widths
  const columnWidths = Array(columnCount).fill(3);
  for (const row of normalizedRows) {
    for (let i = 0; i < row.length; i++) {
      columnWidths[i] = Math.max(columnWidths[i], row[i].length);
    }
  }

  // Build markdown table
  let markdown = "";

  // Header row (first row)
  const headerCells = normalizedRows[0].map((cell, i) =>
    cell.padEnd(columnWidths[i]),
  );
  markdown += "| " + headerCells.join(" | ") + " |\n";

  // Separator row
  const separators = columnWidths.map((w) => "-".repeat(w));
  markdown += "| " + separators.join(" | ") + " |\n";

  // Data rows
  for (let i = 1; i < normalizedRows.length; i++) {
    const dataCells = normalizedRows[i].map((cell, j) =>
      cell.padEnd(columnWidths[j]),
    );
    markdown += "| " + dataCells.join(" | ") + " |\n";
  }

  return markdown;
}

/**
 * Extract tables from PDF text
 * Detects table-like patterns and converts them to markdown format
 */
export function extractTablesFromText(text: string): TableExtractionResult {
  const lines = text.split("\n");
  const tables: TableInfo[] = [];

  let currentTableLines: string[] = [];
  let currentTableStart = -1;
  let inTable = false;
  let emptyLineCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isTableRow = isLikelyTableRow(line);
    const isEmpty = line.trim().length === 0;

    if (isTableRow) {
      if (!inTable) {
        // Start of a new potential table
        inTable = true;
        currentTableStart = i;
        currentTableLines = [];
        emptyLineCount = 0;
      }
      currentTableLines.push(line);
      emptyLineCount = 0;
    } else if (isEmpty && inTable) {
      emptyLineCount++;
      // Allow 1 empty line within a table, but 2+ ends it
      if (emptyLineCount >= 2) {
        // End of table
        if (currentTableLines.length >= 2) {
          const table = processTableLines(
            currentTableLines,
            currentTableStart,
            i - emptyLineCount,
          );
          if (table) {
            tables.push(table);
          }
        }
        inTable = false;
        currentTableLines = [];
        emptyLineCount = 0;
      }
    } else if (!isEmpty && inTable) {
      // Non-table line ends the table
      if (currentTableLines.length >= 2) {
        const table = processTableLines(
          currentTableLines,
          currentTableStart,
          i - 1,
        );
        if (table) {
          tables.push(table);
        }
      }
      inTable = false;
      currentTableLines = [];
      emptyLineCount = 0;
    }
  }

  // Handle table at end of text
  if (inTable && currentTableLines.length >= 2) {
    const table = processTableLines(
      currentTableLines,
      currentTableStart,
      lines.length - 1,
    );
    if (table) {
      tables.push(table);
    }
  }

  // Deterministic reconstruction avoids accidental replacement collisions when
  // source text contains repeated table blocks.
  const resultLines: string[] = [];
  let cursor = 0;
  const sortedTables = [...tables].sort((a, b) => a.startLine - b.startLine);

  for (const table of sortedTables) {
    if (table.startLine > cursor) {
      resultLines.push(...lines.slice(cursor, table.startLine));
    }
    resultLines.push("", table.markdown.trimEnd());
    cursor = table.endLine + 1;
  }
  if (cursor < lines.length) {
    resultLines.push(...lines.slice(cursor));
  }

  const resultText = resultLines.join("\n");

  return {
    text: resultText,
    tables,
    tableCount: tables.length,
  };
}

/**
 * Process detected table lines into a TableInfo object
 */
function processTableLines(
  lines: string[],
  startLine: number,
  endLine: number,
): TableInfo | null {
  if (lines.length < 2) return null;

  // Detect column positions
  const columnPositions = detectColumnPositions(lines);

  // Split each line into cells
  const rows: string[][] = lines.map((line) =>
    splitRowIntoCells(line, columnPositions),
  );
  let workingRows = rows;

  // Validate: all rows should have similar column count
  let columnCounts = workingRows.map((r) => r.length);
  const maxColumns = Math.max(...columnCounts);
  const minColumns = Math.min(...columnCounts);

  // If column counts vary too much, this might not be a table
  if (maxColumns - minColumns > 2) {
    // Try to salvage by filtering rows with wrong column count
    const freq = new Map<number, number>();
    for (const count of columnCounts) {
      freq.set(count, (freq.get(count) || 0) + 1);
    }
    const mode =
      [...freq.entries()]
        .sort((a, b) => {
          if (b[1] !== a[1]) return b[1] - a[1];
          return b[0] - a[0];
        })[0]?.[0] || maxColumns;

    const filteredRows = workingRows.filter((r) => Math.abs(r.length - mode) <= 1);
    if (filteredRows.length < 2) {
      return null;
    }
    workingRows = filteredRows;
    columnCounts = workingRows.map((r) => r.length);
  }

  // Calculate confidence based on consistency
  const avgColumns =
    columnCounts.reduce((a, b) => a + b, 0) / columnCounts.length;
  const columnVariance =
    columnCounts.reduce((sum, c) => sum + Math.abs(c - avgColumns), 0) /
    columnCounts.length;
  const confidence = Math.max(0.5, 1 - columnVariance / avgColumns);

  // Generate markdown
  const markdown = formatAsMarkdownTable(workingRows);

  // Build structured rows with positional metadata
  const structuredRows: StructuredRow[] = workingRows.map((row, rIdx) => ({
    rowIndex: rIdx,
    cells: row.map((text, cIdx) => ({ text, colIndex: cIdx })),
    isHeader: rIdx === 0,
  }));

  return {
    startLine,
    endLine,
    rows: workingRows,
    structuredRows,
    markdown,
    confidence,
  };
}

/**
 * Enhanced PDF text extraction with table detection
 * This is the main function to use for PDF processing
 */
export function extractPDFWithTables(text: string): string {
  const result = extractTablesFromText(text);

  if (result.tableCount > 0) {
    logger.debug("[PDFTableExtractor] Detected tables in PDF text", {
      tableCount: result.tableCount,
    });
    recordTablesDetected(result.tableCount);
    return result.text;
  }

  return text;
}

export default {
  extractTablesFromText,
  extractPDFWithTables,
  formatAsMarkdownTable,
  isLikelyTableRow,
};
