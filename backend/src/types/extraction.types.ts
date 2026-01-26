/**
 * Enhanced Extraction Types with Anchor Support
 *
 * These types define the output of document extraction with location anchors
 * for precise content addressing (page/slide/cell/heading).
 */

import type { Anchor, PdfPageAnchor, PptSlideAnchor, XlsxCellAnchor, DocxHeadingAnchor } from './anchor.types';

// ============================================================================
// Base Extraction Result (legacy compatibility)
// ============================================================================

export interface BaseExtractionResult {
  text: string;
  confidence?: number;
  pageCount?: number;
  wordCount?: number;
  language?: string;
}

// ============================================================================
// Per-Page/Per-Segment Extraction
// ============================================================================

/**
 * A segment of extracted text with its anchor location
 */
export interface ExtractedSegment {
  /** Raw text content of this segment */
  text: string;
  /** Location anchor for this segment */
  anchor: Anchor;
  /** Word count in this segment */
  wordCount?: number;
  /** Character count */
  charCount?: number;
}

/**
 * PDF-specific extracted page
 */
export interface PdfExtractedPage {
  /** 1-based page number */
  page: number;
  /** Text content of the page */
  text: string;
  /** Word count */
  wordCount: number;
  /** Whether OCR was used for this page */
  ocrApplied?: boolean;
  /** OCR confidence if applicable */
  ocrConfidence?: number;
  /** Detected section titles on this page */
  sectionTitles?: string[];
}

/**
 * PPTX-specific extracted slide
 */
export interface PptxExtractedSlide {
  /** 1-based slide number */
  slide: number;
  /** Slide title if detected */
  title?: string;
  /** Main text content (body text) */
  text: string;
  /** Speaker notes if available */
  notes?: string;
  /** Bullet points (preserving hierarchy) */
  bullets?: string[];
  /** Slide layout type if detected */
  layoutType?: string;
}

/**
 * XLSX-specific extracted cell fact
 */
export interface XlsxCellFact {
  /** Sheet name */
  sheet: string;
  /** Cell address (e.g., "H70") */
  cell: string;
  /** Row label (e.g., "EBITDA") */
  rowLabel: string;
  /** Column header (e.g., "Jul-2024") */
  colHeader: string;
  /** Cell value (number or string) */
  value: number | string;
  /** Display value (formatted) */
  displayValue: string;
  /** Parsed period information */
  period?: {
    year?: number;
    month?: number;
    quarter?: number;
  };
  /** Value type */
  valueType: 'number' | 'string' | 'date' | 'formula';
}

/**
 * XLSX-specific sheet summary
 */
export interface XlsxSheetSummary {
  /** Sheet name */
  name: string;
  /** Sheet index (0-based) */
  index: number;
  /** Row count */
  rowCount: number;
  /** Column count */
  columnCount: number;
  /** Detected headers */
  headers: string[];
  /** Detected row labels (metrics) */
  rowLabels: string[];
  /** Has temporal columns (months/quarters) */
  hasTemporalColumns: boolean;
  /** Is likely financial data */
  isFinancial: boolean;
}

/**
 * DOCX-specific heading section
 */
export interface DocxSection {
  /** Heading text */
  heading: string;
  /** Heading level (1-6) */
  level: number;
  /** Full path from root (breadcrumb) */
  path: string[];
  /** Content under this heading */
  content: string;
  /** Child sections */
  children?: DocxSection[];
  /** Paragraph index range */
  paragraphStart: number;
  paragraphEnd: number;
}

// ============================================================================
// Enhanced Extraction Results by Document Type
// ============================================================================

/**
 * Enhanced PDF extraction result with per-page data
 */
export interface PdfExtractionResult extends BaseExtractionResult {
  /** Extraction source type */
  sourceType: 'pdf';
  /** Total page count */
  pageCount: number;
  /** Per-page extracted content */
  pages: PdfExtractedPage[];
  /** Whether document has text layer */
  hasTextLayer: boolean;
  /** Whether OCR was used for any pages */
  ocrApplied: boolean;
  /** Overall OCR confidence if applied */
  ocrConfidence?: number;
  /** Detected document language */
  language?: string;
}

/**
 * Enhanced PPTX extraction result with per-slide data
 */
export interface PptxExtractionResult extends BaseExtractionResult {
  /** Extraction source type */
  sourceType: 'pptx';
  /** Total slide count */
  slideCount: number;
  /** Per-slide extracted content */
  slides: PptxExtractedSlide[];
  /** Array of slide titles (for quick lookup) */
  slideTitles: (string | null)[];
  /** Has speaker notes */
  hasNotes: boolean;
  /** Presentation title if detected */
  presentationTitle?: string;
}

/**
 * Enhanced XLSX extraction result with structured data
 */
export interface XlsxExtractionResult extends BaseExtractionResult {
  /** Extraction source type */
  sourceType: 'xlsx';
  /** Total sheet count */
  sheetCount: number;
  /** Sheet names */
  sheetNames: string[];
  /** Per-sheet summaries */
  sheets: XlsxSheetSummary[];
  /** Extracted cell facts (for finance/metrics) */
  cellFacts: XlsxCellFact[];
  /** Is likely a financial spreadsheet */
  isFinancial: boolean;
  /** Detected headers across all sheets */
  allHeaders: string[];
  /** Detected row labels across all sheets */
  allRowLabels: string[];
}

/**
 * Enhanced DOCX extraction result with heading structure
 */
export interface DocxExtractionResult extends BaseExtractionResult {
  /** Extraction source type */
  sourceType: 'docx';
  /** Document structure (heading tree) */
  sections: DocxSection[];
  /** Flat list of all headings */
  headings: { text: string; level: number; path: string[] }[];
  /** Total paragraph count */
  paragraphCount: number;
  /** Has table of contents */
  hasToc: boolean;
  /** Document title if detected */
  documentTitle?: string;
}

/**
 * Image OCR extraction result
 */
export interface ImageExtractionResult extends BaseExtractionResult {
  /** Extraction source type */
  sourceType: 'image';
  /** OCR confidence (0-1) */
  confidence: number;
  /** OCR blocks with bounding boxes */
  blocks: Array<{
    text: string;
    confidence: number;
    bbox?: { x: number; y: number; width: number; height: number };
  }>;
  /** Image dimensions */
  dimensions?: { width: number; height: number };
}

/**
 * Union type for all enhanced extraction results
 */
export type EnhancedExtractionResult =
  | PdfExtractionResult
  | PptxExtractionResult
  | XlsxExtractionResult
  | DocxExtractionResult
  | ImageExtractionResult;

// ============================================================================
// Anchored Chunk for Indexing
// ============================================================================

/**
 * A chunk of text with its anchor for indexing
 */
export interface AnchoredChunk {
  /** Unique chunk ID */
  chunkId: string;
  /** Document ID */
  documentId: string;
  /** Text content */
  text: string;
  /** Location anchor */
  anchor: Anchor;
  /** Token count (for embedding) */
  tokenCount?: number;
  /** Character count */
  charCount: number;
  /** Embedding vector (if computed) */
  embedding?: number[];
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Result of chunking an extraction with anchors
 */
export interface AnchoredChunkingResult {
  /** Document ID */
  documentId: string;
  /** All chunks with anchors */
  chunks: AnchoredChunk[];
  /** Total chunk count */
  chunkCount: number;
  /** Source document type */
  sourceType: 'pdf' | 'pptx' | 'xlsx' | 'docx' | 'image' | 'text';
  /** Extraction metadata */
  metadata: {
    pageCount?: number;
    slideCount?: number;
    sheetCount?: number;
    sectionCount?: number;
    hasAnchors: boolean;
  };
}

// ============================================================================
// Type Guards
// ============================================================================

export function isPdfExtractionResult(result: EnhancedExtractionResult): result is PdfExtractionResult {
  return result.sourceType === 'pdf';
}

export function isPptxExtractionResult(result: EnhancedExtractionResult): result is PptxExtractionResult {
  return result.sourceType === 'pptx';
}

export function isXlsxExtractionResult(result: EnhancedExtractionResult): result is XlsxExtractionResult {
  return result.sourceType === 'xlsx';
}

export function isDocxExtractionResult(result: EnhancedExtractionResult): result is DocxExtractionResult {
  return result.sourceType === 'docx';
}

export function isImageExtractionResult(result: EnhancedExtractionResult): result is ImageExtractionResult {
  return result.sourceType === 'image';
}

// ============================================================================
// Document Metadata Extensions
// ============================================================================

/**
 * Extended document metadata with anchor-related info
 */
export interface DocumentAnchorMetadata {
  /** Document type */
  mimeType: string;
  /** For PDF: page count */
  pageCount?: number;
  /** For PDF: has text layer */
  hasTextLayer?: boolean;
  /** For PDF: OCR was applied */
  ocrApplied?: boolean;
  /** For PPTX: slide count */
  slideCount?: number;
  /** For PPTX: slide titles */
  slideTitles?: (string | null)[];
  /** For XLSX: sheet names */
  sheetNames?: string[];
  /** For XLSX: sheet count */
  sheetCount?: number;
  /** For XLSX: is financial */
  isFinancial?: boolean;
  /** For DOCX: heading count */
  headingCount?: number;
  /** For DOCX: has table of contents */
  hasToc?: boolean;
  /** For Image: OCR confidence */
  ocrConfidence?: number;
}

export default {
  isPdfExtractionResult,
  isPptxExtractionResult,
  isXlsxExtractionResult,
  isDocxExtractionResult,
  isImageExtractionResult,
};
