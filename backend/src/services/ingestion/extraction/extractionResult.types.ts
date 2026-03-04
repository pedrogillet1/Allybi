/**
 * Discriminated union types for text extraction results.
 *
 * Every extractor returns a typed result with `sourceType` as the discriminant.
 * Type guards below eliminate the need for `(extraction as any)` casts.
 */

// ---------------------------------------------------------------------------
// Base fields shared by all extraction results
// ---------------------------------------------------------------------------

export interface BaseExtractionResult {
  text: string;
  wordCount: number;
  confidence: number;
  ocrApplied?: boolean;
  ocrConfidence?: number;
  ocrPageCount?: number;
  ocrMode?: string;
  textQuality?: string;
  textQualityScore?: number;
  weakTextReasons?: string[];
  extractionWarnings?: string[];
}

// ---------------------------------------------------------------------------
// Shared structured table type (PDF, DOCX, PPTX)
// ---------------------------------------------------------------------------

export interface ExtractedTable {
  tableId: string;
  pageOrSlide?: number;
  markdown: string;
  rows: Array<{
    rowIndex: number;
    isHeader: boolean;
    cells: Array<{ text: string; colIndex: number }>;
  }>;
}

// ---------------------------------------------------------------------------
// Per-format result types
// ---------------------------------------------------------------------------

export interface PdfExtractionResult extends BaseExtractionResult {
  sourceType: "pdf";
  pageCount: number;
  pages: Array<{ page: number; text: string }>;
  hasTextLayer?: boolean;
  outlines?: Array<{ title: string; level: number; pageIndex: number }>;
  extractedTables?: ExtractedTable[];
}

export interface DocxExtractionResult extends BaseExtractionResult {
  sourceType: "docx";
  sections: Array<{ heading?: string; level?: number; content?: string; path?: string[] }>;
  headings?: Array<{ text: string; level: number; path: string[] }>;
  paragraphCount?: number;
  hasToc?: boolean;
  documentTitle?: string;
  extractedTables?: ExtractedTable[];
}

export interface XlsxExtractionResult extends BaseExtractionResult {
  sourceType: "xlsx";
  sheetCount: number;
  sheetNames?: string[];
  sheets: Array<{
    name?: string;
    sheetName?: string;
    textContent?: string;
    rowCount?: number;
    columnCount?: number;
    headers?: string[];
    rowLabels?: string[];
    hasTemporalColumns?: boolean;
    isFinancial?: boolean;
    [k: string]: any;
  }>;
  cellFacts?: Array<{
    sheet: string;
    cell: string;
    rowLabel: string;
    colHeader: string;
    value: string;
    displayValue: string;
    period?: { year?: number; month?: number; quarter?: number };
    valueType?: "number" | "string" | "date" | "formula";
    scaleFactor?: string;       // e.g. "thousands", "millions", "billions"
    footnotes?: string[];       // e.g. ["(1) Restated", "(2) Unaudited"]
  }>;
  isFinancial?: boolean;
  allHeaders?: string[];
  allRowLabels?: string[];
}

export interface PptxExtractionResult extends BaseExtractionResult {
  sourceType: "pptx";
  slideCount: number;
  slides: Array<{ slide: number; title?: string; text: string; notes?: string }>;
  slideTitles?: (string | null)[];
  hasNotes?: boolean;
  presentationTitle?: string;
  extractedTables?: ExtractedTable[];
}

export interface PlainTextExtractionResult extends BaseExtractionResult {
  sourceType: "text";
}

export interface ImageSkippedResult extends BaseExtractionResult {
  sourceType: "image";
  skipped: true;
  skipReason: string;
}

export interface ImageOcrResult extends BaseExtractionResult {
  sourceType: "image";
  skipped?: false;
}

// ---------------------------------------------------------------------------
// Discriminated union
// ---------------------------------------------------------------------------

export type DispatchedExtractionResult =
  | PdfExtractionResult
  | DocxExtractionResult
  | XlsxExtractionResult
  | PptxExtractionResult
  | PlainTextExtractionResult
  | ImageSkippedResult
  | ImageOcrResult;

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isSkipped(
  r: DispatchedExtractionResult,
): r is ImageSkippedResult {
  return r.sourceType === "image" && (r as ImageSkippedResult).skipped === true;
}

export function hasPagesArray(
  r: DispatchedExtractionResult,
): r is PdfExtractionResult {
  return r.sourceType === "pdf" && Array.isArray((r as PdfExtractionResult).pages);
}

export function hasSlidesArray(
  r: DispatchedExtractionResult,
): r is PptxExtractionResult {
  return r.sourceType === "pptx" && Array.isArray((r as PptxExtractionResult).slides);
}

export function hasSectionsArray(
  r: DispatchedExtractionResult,
): r is DocxExtractionResult {
  return r.sourceType === "docx" && Array.isArray((r as DocxExtractionResult).sections);
}

export function hasSheets(
  r: DispatchedExtractionResult,
): r is XlsxExtractionResult {
  return r.sourceType === "xlsx" && Array.isArray((r as XlsxExtractionResult).sheets);
}
