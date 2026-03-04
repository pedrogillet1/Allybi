/**
 * Pipeline types — typed timings, progress helpers, and shared interfaces.
 */

// ---------------------------------------------------------------------------
// PipelineTimings — discriminated union with `skipped` flag
// ---------------------------------------------------------------------------

interface BasePipelineTimings {
  storageDownloadMs: number;
  extractionMs: number;
  extractionMethod: string;
  ocrUsed: boolean;
  ocrSuccess: boolean;
  ocrConfidence: number | null;
  ocrPageCount: number | null;
  ocrMode: string | null;
  textQuality: "high" | "medium" | "low" | "none";
  textQualityScore: number | null;
  extractionWarnings: string[];
  textLength: number;
  rawChunkCount: number;
  chunkCount: number;
  embeddingMs: number;
  pageCount: number | null;
  /** SHA256 of the raw file buffer, computed after download */
  fileHash?: string;
}

export interface SkippedPipelineTimings extends BasePipelineTimings {
  skipped: true;
  skipReason: string;
}

export interface CompletedPipelineTimings extends BasePipelineTimings {
  skipped?: false;
}

export type PipelineTimings = SkippedPipelineTimings | CompletedPipelineTimings;

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

export function isPipelineSkipped(
  t: PipelineTimings,
): t is SkippedPipelineTimings {
  return t.skipped === true;
}

// ---------------------------------------------------------------------------
// InputChunk — used throughout the pipeline
// ---------------------------------------------------------------------------

export interface InputChunkMetadata {
  sectionName?: string;
  sectionLevel?: number;
  sectionPath?: string[];
  chunkType?: "text" | "heading" | "table" | "cell_fact" | "slide" | "notes";
  tableChunkForm?:
    | "table_summary"
    | "row_aggregate"
    | "cell_centric";
  tableId?: string;
  rowIndex?: number;
  columnIndex?: number;
  headerPath?: string[];
  unitRaw?: string;
  unitNormalized?: string;
  numericValue?: number;
  startChar?: number;
  endChar?: number;
  sheetName?: string;
  isFinancial?: boolean;
  cellRef?: string;
  rowLabel?: string;
  colHeader?: string;
  valueRaw?: string;
  slideTitle?: string;
  hasNotes?: boolean;
  ocrConfidence?: number;
  sourceType?: "pdf" | "docx" | "xlsx" | "pptx" | "text" | "image";
  versionId?: string;
  rootDocumentId?: string;
  isLatestVersion?: boolean;
}

export interface InputChunk {
  chunkIndex: number;
  content: string;
  pageNumber?: number;
  metadata?: InputChunkMetadata;
}

// ---------------------------------------------------------------------------
// Progress emitter callback
// ---------------------------------------------------------------------------

export type ProgressEmitter = (pct: number, msg: string) => void | Promise<void>;
