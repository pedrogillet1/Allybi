/**
 * Document AI Table Extractor
 *
 * Uses Google Document AI to extract structured tables from PDF buffers.
 * Falls back gracefully (returns null) when Document AI is unconfigured or unavailable.
 *
 * Env vars:
 *  - DOCUMENT_AI_ENABLED      (default "false")
 *  - DOCUMENT_AI_PROCESSOR_ID (required when enabled)
 *  - DOCUMENT_AI_LOCATION     (default "us")
 */

import { logger } from "../../utils/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StructuredCell {
  text: string;
  rowIndex: number;
  colIndex: number;
  isHeader: boolean;
  colSpan?: number;
  rowSpan?: number;
}

export interface StructuredTable {
  cells: StructuredCell[];
  rowCount: number;
  colCount: number;
  markdown: string;
}

export interface DocumentAiTableResult {
  pages: Array<{
    page: number;
    tables: string[];
    structuredTables?: StructuredTable[];
  }>;
  tableCount: number;
  tableConfidences: Array<{ page: number; tableIndex: number; confidence: number }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the text content from a Document AI table cell layout.
 * The cell text lives in `cell.layout.textAnchor.textSegments` mapped back
 * to the full document text, but the SDK also exposes a shorthand via
 * `cell.layout.textAnchor` - we therefore read from `document.text` using
 * the offset pair, or fall back to an empty string.
 */
function getCellText(
  cell: any,
  documentText: string,
): string {
  const segments = cell?.layout?.textAnchor?.textSegments;
  if (!segments || segments.length === 0) return "";

  return segments
    .map((seg: any) => {
      const start = Number(seg.startIndex || 0);
      const end = Number(seg.endIndex || 0);
      return documentText.slice(start, end);
    })
    .join("")
    .replace(/\n/g, " ")
    .trim();
}

/**
 * Convert a Document AI table (headerRows + bodyRows) into a markdown string.
 * Uses the same column-padding approach as the heuristic extractor in
 * `backend/src/utils/pdfTableExtractor.ts`.
 */
function formatAsMarkdownTable(rows: string[][]): string {
  if (rows.length === 0) return "";

  const columnCount = Math.max(...rows.map((r) => r.length));

  // Normalise every row to the same column count
  const normalised = rows.map((row) => {
    const padded = [...row];
    while (padded.length < columnCount) padded.push("");
    return padded;
  });

  // Column widths (minimum 3 for the separator dashes)
  const widths = Array(columnCount).fill(3);
  for (const row of normalised) {
    for (let i = 0; i < row.length; i++) {
      widths[i] = Math.max(widths[i], row[i].length);
    }
  }

  let md = "";

  // Header
  const header = normalised[0].map((c, i) => c.padEnd(widths[i]));
  md += "| " + header.join(" | ") + " |\n";

  // Separator
  md += "| " + widths.map((w: number) => "-".repeat(w)).join(" | ") + " |\n";

  // Body
  for (let r = 1; r < normalised.length; r++) {
    const cells = normalised[r].map((c, i) => c.padEnd(widths[i]));
    md += "| " + cells.join(" | ") + " |\n";
  }

  return md;
}

/**
 * Parse a single Document AI table into a 2-D string array (rows x cols).
 */
function parseTableRows(
  headerRows: any[],
  bodyRows: any[],
  documentText: string,
): string[][] {
  const rows: string[][] = [];

  for (const hRow of headerRows || []) {
    rows.push(
      (hRow.cells || []).map((cell: any) => getCellText(cell, documentText)),
    );
  }

  for (const bRow of bodyRows || []) {
    rows.push(
      (bRow.cells || []).map((cell: any) => getCellText(cell, documentText)),
    );
  }

  return rows;
}

/**
 * Parse a Document AI table into structured cells with positional metadata.
 */
function parseTableRowsStructured(
  headerRows: any[],
  bodyRows: any[],
  documentText: string,
): { cells: StructuredCell[]; rowCount: number; colCount: number } {
  const cells: StructuredCell[] = [];
  let rowIndex = 0;
  let maxCol = 0;
  let maxRow = 0;

  for (const hRow of headerRows || []) {
    const rowCells = hRow.cells || [];
    for (let colIndex = 0; colIndex < rowCells.length; colIndex++) {
      const rowSpan = Math.max(
        1,
        Number(
          rowCells[colIndex]?.rowSpan ??
            rowCells[colIndex]?.layout?.rowSpan ??
            1,
        ) || 1,
      );
      const colSpan = Math.max(
        1,
        Number(
          rowCells[colIndex]?.colSpan ??
            rowCells[colIndex]?.layout?.colSpan ??
            1,
        ) || 1,
      );
      cells.push({
        text: getCellText(rowCells[colIndex], documentText),
        rowIndex,
        colIndex,
        isHeader: true,
        ...(colSpan > 1 ? { colSpan } : {}),
        ...(rowSpan > 1 ? { rowSpan } : {}),
      });
      maxCol = Math.max(maxCol, colIndex + colSpan);
      maxRow = Math.max(maxRow, rowIndex + rowSpan);
    }
    rowIndex++;
  }

  for (const bRow of bodyRows || []) {
    const rowCells = bRow.cells || [];
    for (let colIndex = 0; colIndex < rowCells.length; colIndex++) {
      const rowSpan = Math.max(
        1,
        Number(
          rowCells[colIndex]?.rowSpan ??
            rowCells[colIndex]?.layout?.rowSpan ??
            1,
        ) || 1,
      );
      const colSpan = Math.max(
        1,
        Number(
          rowCells[colIndex]?.colSpan ??
            rowCells[colIndex]?.layout?.colSpan ??
            1,
        ) || 1,
      );
      cells.push({
        text: getCellText(rowCells[colIndex], documentText),
        rowIndex,
        colIndex,
        isHeader: false,
        ...(colSpan > 1 ? { colSpan } : {}),
        ...(rowSpan > 1 ? { rowSpan } : {}),
      });
      maxCol = Math.max(maxCol, colIndex + colSpan);
      maxRow = Math.max(maxRow, rowIndex + rowSpan);
    }
    rowIndex++;
  }

  return { cells, rowCount: Math.max(rowIndex, maxRow), colCount: maxCol };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Extract tables from a PDF buffer via Google Document AI.
 *
 * Returns `null` when:
 *  - DOCUMENT_AI_ENABLED is not "true"
 *  - The processor ID is not configured
 *  - The Document AI call fails for any reason
 */
export async function extractTablesWithDocumentAI(
  pdfBuffer: Buffer,
): Promise<DocumentAiTableResult | null> {
  // ------ Feature gate ------
  const enabled = process.env.DOCUMENT_AI_ENABLED === "true";
  if (!enabled) {
    logger.debug("[DocumentAI] Skipped - DOCUMENT_AI_ENABLED is not true");
    return null;
  }

  const processorId = process.env.DOCUMENT_AI_PROCESSOR_ID;
  if (!processorId) {
    logger.warn("[DocumentAI] DOCUMENT_AI_PROCESSOR_ID is not set; skipping");
    return null;
  }

  const location = process.env.DOCUMENT_AI_LOCATION || "us";
  const projectId = process.env.GCP_PROJECT_ID || process.env.GCS_PROJECT_ID;
  if (!projectId) {
    logger.warn("[DocumentAI] No GCP project ID available; skipping");
    return null;
  }

  try {
    // Lazy-import so the module can be loaded even when the SDK is absent.
    const {
      DocumentProcessorServiceClient,
    } = await import("@google-cloud/documentai");

    const client = new DocumentProcessorServiceClient();

    const name = `projects/${projectId}/locations/${location}/processors/${processorId}`;

    const [result] = await client.processDocument({
      name,
      rawDocument: {
        content: pdfBuffer.toString("base64"),
        mimeType: "application/pdf",
      },
    });

    const document = result.document;
    if (!document || !document.pages || document.pages.length === 0) {
      logger.debug("[DocumentAI] No pages returned from Document AI");
      return { pages: [], tableCount: 0, tableConfidences: [] };
    }

    const documentText = document.text || "";
    const pages: DocumentAiTableResult["pages"] = [];
    const tableConfidences: Array<{ page: number; tableIndex: number; confidence: number }> = [];
    let tableCount = 0;

    for (const page of document.pages) {
      const pageNumber = Number(page.pageNumber || 1);
      const tables: string[] = [];
      const structuredTables: StructuredTable[] = [];

      if (page.tables && page.tables.length > 0) {
        for (let tIdx = 0; tIdx < page.tables.length; tIdx++) {
          const table = page.tables[tIdx];
          const rows = parseTableRows(
            table.headerRows || [],
            table.bodyRows || [],
            documentText,
          );
          if (rows.length >= 1) {
            const md = formatAsMarkdownTable(rows);
            tables.push(md);

            const structured = parseTableRowsStructured(
              table.headerRows || [],
              table.bodyRows || [],
              documentText,
            );
            structuredTables.push({ ...structured, markdown: md });

            const confidence = Number((table as any).layout?.confidence ?? 0);
            tableConfidences.push({
              page: pageNumber,
              tableIndex: tIdx,
              confidence,
            });

            tableCount++;
          }
        }
      }

      if (tables.length > 0) {
        pages.push({ page: pageNumber, tables, structuredTables });
      }
    }

    logger.info(`[DocumentAI] Extracted ${tableCount} table(s) across ${pages.length} page(s)`, {
      confidences: tableConfidences,
    });
    return { pages, tableCount, tableConfidences };
  } catch (err: any) {
    logger.error("[DocumentAI] Table extraction failed", {
      message: err.message,
    });
    return null;
  }
}

export default { extractTablesWithDocumentAI };
