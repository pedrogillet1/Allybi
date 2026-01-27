// src/types/extraction.types.ts

/**
 * Extraction Types (Koda)
 *
 * Goals:
 * - One unified contract for extracting content from PDFs, images (OCR), DOCX, PPTX, XLSX/CSV/TXT.
 * - Preserve location anchors so retrieval + sources buttons can point to where evidence came from.
 * - Capture extraction quality signals (OCR confidence, gibberish score, parse warnings).
 * - Support tables/spreadsheets and structured outputs without leaking UI-specific details.
 */

export type SupportedMimeType =
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // docx
  | 'application/vnd.openxmlformats-officedocument.presentationml.presentation' // pptx
  | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' // xlsx
  | 'text/csv'
  | 'text/plain'
  | 'image/png'
  | 'image/jpeg'
  | 'image/jpg'
  | 'image/webp'
  | string;

export type SupportedDocType =
  | 'pdf'
  | 'docx'
  | 'pptx'
  | 'xlsx'
  | 'csv'
  | 'txt'
  | 'image'
  | 'unknown';

export type ExtractionEngine =
  | 'pdf_text'
  | 'pdf_ocr'
  | 'image_ocr'
  | 'docx_parser'
  | 'pptx_parser'
  | 'xlsx_parser'
  | 'csv_parser'
  | 'txt_parser'
  | 'hybrid'
  | 'unknown';

export type ExtractionStatus =
  | 'ok'
  | 'partial'
  | 'failed'
  | 'skipped';

export type Severity = 'info' | 'warning' | 'error';

export interface ExtractionWarning {
  code: string; // e.g. "PDF_PARSE_GLYPH_WARN", "OCR_LOW_CONFIDENCE"
  severity: Severity;
  message?: string;
  details?: Record<string, unknown>;
}

export interface ExtractionError {
  code: string; // e.g. "PDF_PARSE_FAILED", "DOCX_PARSE_FAILED"
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Location anchors for evidence
 * Used by:
 * - Sources buttons
 * - Locate_content answers
 * - Spreadsheet cell extraction
 */
export type EvidenceLocationType = 'page' | 'slide' | 'sheet' | 'cell' | 'section' | 'line';

export interface EvidenceLocation {
  type: EvidenceLocationType;
  /** For page/slide/line: number; for sheet/section: string */
  value: number | string;
  /** Optional label shown in UI (e.g. "Page 3", "Sheet: Budget", "Cell B12") */
  label?: string;

  // Optional structured fields (useful for spreadsheets/tables)
  pageStart?: number;
  pageEnd?: number;
  slideNumber?: number;
  sheetName?: string;
  cellRange?: string; // e.g. "B12" or "B12:C12"
  rowIndex?: number; // 0-based or 1-based; pick one in codebase and keep consistent
  columnIndex?: number; // 0-based or 1-based; pick one in codebase and keep consistent
  sectionPath?: string[]; // e.g. ["Chapter 8", "Scrum Values"]
}

/**
 * Normalized text chunk used by retrieval/ranking and grounding checks.
 * Keep this small and consistent.
 */
export interface ExtractedChunk {
  chunkId: string;
  docId: string;

  docType: SupportedDocType;
  engine: ExtractionEngine;

  text: string;
  charCount: number;

  location?: EvidenceLocation;

  // Optional signals for ranking/quality gates
  ocrConfidence?: number; // 0..1
  gibberishScore?: number; // 0..1
  languageHint?: 'en' | 'pt' | 'es' | 'any';
  tags?: string[]; // e.g. ["table", "heading", "kv", "list", "numeric"]
  createdAt?: string; // ISO
}

/**
 * Table representation extracted from PDFs/PPTX/DOCX or OCR.
 * Use this for structured "table-first" answers.
 */
export interface ExtractedTable {
  tableId: string;
  docId: string;

  engine: ExtractionEngine;
  docType: SupportedDocType;

  location?: EvidenceLocation;

  headers?: string[];
  rows: string[][];

  // Signals
  confidence?: number; // 0..1 (extraction confidence)
  warnings?: ExtractionWarning[];
}

/**
 * Spreadsheet grid representation (XLSX/CSV)
 * You usually store this as chunks + tables, but this exists for "cell lookup" operations.
 */
export interface ExtractedSpreadsheet {
  docId: string;
  docType: 'xlsx' | 'csv';

  sheets: Array<{
    sheetName: string;
    // Optional summary stats
    rowCount?: number;
    columnCount?: number;

    // Optional: extracted tables within sheet (detected structured blocks)
    tables?: ExtractedTable[];

    // Optional: cell-level extraction for precise queries
    cells?: Array<{
      cell: string; // "B12"
      value: string;
      location?: EvidenceLocation; // {type:"cell", value:"B12", sheetName:"..."}
    }>;
  }>;
}

/**
 * Extracted entity fields (PII-ish and non-PII)
 * Keep it generic; domain logic lives in banks.
 */
export interface ExtractedFields {
  docId: string;
  fields: Array<{
    key: string; // e.g. "CPF", "Invoice Number", "Due Date"
    value: string;
    location?: EvidenceLocation;
    confidence?: number; // 0..1
    tags?: string[]; // e.g. ["pii", "identity", "finance"]
  }>;
}

/**
 * Document-level extraction output.
 * This is what ingestion/indexing should persist (or a normalized subset).
 */
export interface ExtractionResult {
  status?: ExtractionStatus;

  docId?: string;
  fileName?: string;
  mimeType?: SupportedMimeType;
  docType?: SupportedDocType;

  engine?: ExtractionEngine;

  // Main outputs
  chunks?: ExtractedChunk[];

  // Optional structured outputs
  tables?: ExtractedTable[];
  spreadsheet?: ExtractedSpreadsheet;
  fields?: ExtractedFields;

  // Summaries / metadata
  pageCount?: number; // pdf
  slideCount?: number; // pptx
  wordCountApprox?: number;

  // Quality signals
  ocrDominant?: boolean; // used by retrieval profiles
  avgOcrConfidence?: number; // 0..1
  avgGibberishScore?: number; // 0..1

  warnings?: ExtractionWarning[];
  error?: ExtractionError;

  createdAt?: string; // ISO
  durationMs?: number;

  // Allow extractor-specific fields
  [k: string]: any;
}

/**
 * Indexing pipeline result.
 * Used when building or updating the search index from extracted chunks.
 */
export interface IndexBuildResult {
  docId: string;
  status: 'indexed' | 'skipped' | 'failed';
  chunkCount: number;
  tableCount?: number;
  fieldCount?: number;
  warnings?: ExtractionWarning[];
  error?: ExtractionError;
  createdAt: string; // ISO
  durationMs?: number;
}

/**
 * A small payload you can attach to retrieval results for grounding.
 */
export interface EvidenceSnippet {
  docId: string;
  fileName?: string;
  docType?: SupportedDocType;

  chunkId?: string;
  score?: number;

  location?: EvidenceLocation;
  text: string;

  tags?: string[];
}

/**
 * Utility types for extraction service interfaces
 */
export interface ExtractorInput {
  docId: string;
  fileName: string;
  mimeType: SupportedMimeType;

  // Raw content or pointer; your implementation decides.
  buffer?: Buffer;
  filePath?: string;

  // Hints
  languageHint?: 'en' | 'pt' | 'es' | 'any';
  maxPages?: number;
  maxChars?: number;

  // Flags
  enableOcr?: boolean;
  enableTables?: boolean;
  enableFields?: boolean;
}

export interface Extractor {
  id: ExtractionEngine;
  supports: (mimeType: SupportedMimeType) => boolean;
  extract: (input: ExtractorInput) => Promise<ExtractionResult>;
}

/**
 * Common codes (optional): helps standardize warnings/errors across extractors.
 */
export const EXTRACTION_WARNING_CODES = {
  OCR_LOW_CONFIDENCE: 'OCR_LOW_CONFIDENCE',
  OCR_PARTIAL: 'OCR_PARTIAL',
  PDF_PARSE_GLYPH_WARN: 'PDF_PARSE_GLYPH_WARN',
  PDF_TEXT_GIBBERISH: 'PDF_TEXT_GIBBERISH',
  TABLE_PARSE_PARTIAL: 'TABLE_PARSE_PARTIAL',
  DOCX_PARSE_PARTIAL: 'DOCX_PARSE_PARTIAL',
  PPTX_PARSE_PARTIAL: 'PPTX_PARSE_PARTIAL',
  XLSX_PARSE_PARTIAL: 'XLSX_PARSE_PARTIAL',
} as const;

export const EXTRACTION_ERROR_CODES = {
  PDF_PARSE_FAILED: 'PDF_PARSE_FAILED',
  OCR_FAILED: 'OCR_FAILED',
  DOCX_PARSE_FAILED: 'DOCX_PARSE_FAILED',
  PPTX_PARSE_FAILED: 'PPTX_PARSE_FAILED',
  XLSX_PARSE_FAILED: 'XLSX_PARSE_FAILED',
  CSV_PARSE_FAILED: 'CSV_PARSE_FAILED',
  TXT_PARSE_FAILED: 'TXT_PARSE_FAILED',
  UNSUPPORTED_TYPE: 'UNSUPPORTED_TYPE',
} as const;

export type ExtractionWarningCode = (typeof EXTRACTION_WARNING_CODES)[keyof typeof EXTRACTION_WARNING_CODES];
export type ExtractionErrorCode = (typeof EXTRACTION_ERROR_CODES)[keyof typeof EXTRACTION_ERROR_CODES];

// ---------------------------------------------------------------------------
// Specialized result aliases used by extractor services
// ---------------------------------------------------------------------------

export type BaseExtractionResult = ExtractionResult;
export type DocxExtractionResult = ExtractionResult;
export type PdfExtractionResult = ExtractionResult;
export type PptxExtractionResult = ExtractionResult;
export type XlsxExtractionResult = ExtractionResult;

// DOCX-specific types
export interface DocxSection { heading?: string; text?: string; level?: number; content?: string; children?: DocxSection[]; paragraphStart?: number; paragraphEnd?: number; path?: string[]; [k: string]: any; }
export interface DocxHeadingAnchor { heading: string; level: number; [k: string]: any; }
export interface DocxParagraphAnchor { paragraphIndex: number; [k: string]: any; }
export function createDocxHeadingAnchor(heading: string, level: number, ..._rest: any[]): DocxHeadingAnchor {
  return { heading, level };
}

// PDF-specific types
export interface PdfExtractedPage { pageNumber?: number; page?: number; text: string; ocrConfidence?: number; [k: string]: any; }
export interface PdfPageAnchor { pageNumber: number; [k: string]: any; }
export function createPdfPageAnchor(pageNumber: number, ..._rest: any[]): PdfPageAnchor {
  return { pageNumber };
}

// PPTX-specific types
export interface PptxExtractedSlide { slideNumber?: number; slide?: number; text: string; notes?: string; [k: string]: any; }
export interface PptSlideAnchor { slideNumber: number; [k: string]: any; }
export function createPptSlideAnchor(slideNumber: number, ..._rest: any[]): PptSlideAnchor {
  return { slideNumber };
}

// XLSX-specific types
export interface XlsxSheetSummary { sheetName?: string; name?: string; rowCount?: number; columnCount?: number; [k: string]: any; }
export interface XlsxCellFact { cell: string; value: string; sheetName?: string; [k: string]: any; }
export interface XlsxCellAnchor { cell: string; sheetName?: string; [k: string]: any; }
export function createXlsxCellAnchor(cell: string, sheetName?: string, ..._rest: any[]): XlsxCellAnchor {
  return { cell, sheetName };
}
