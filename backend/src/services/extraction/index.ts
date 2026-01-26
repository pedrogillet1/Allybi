/**
 * Extraction Services Index
 *
 * Enhanced extraction services with per-page/per-slide/per-cell anchor support.
 *
 * Usage:
 * ```typescript
 * import { extractPdfWithAnchors, extractXlsxWithAnchors } from './extraction';
 *
 * const pdfResult = await extractPdfWithAnchors(buffer);
 * for (const page of pdfResult.pages) {
 *   // page.text, page.page, page.wordCount
 * }
 *
 * const xlsxResult = await extractXlsxWithAnchors(buffer);
 * for (const fact of xlsxResult.cellFacts) {
 *   // fact.sheet, fact.cell, fact.rowLabel, fact.colHeader, fact.value
 * }
 * ```
 */

// ============================================================================
// Docling Extraction (legacy)
// ============================================================================

export { DoclingBridge, isDoclingAvailable, runDoclingExtract, loadDoclingOutput, extractWithDocling as extractWithDoclingBridge } from './doclingBridge.service';
export type { DoclingBridgeResult, DoclingSuccessResult, DoclingErrorResult, DoclingChunk, DoclingExtractedDocument } from './doclingBridge.service';

export { DoclingExtractor, extractWithDocling } from './doclingExtractor.service';
export type { DoclingExtractionResult } from './doclingExtractor.service';

// ============================================================================
// Enhanced Extractors with Anchor Support
// ============================================================================

// PDF Extraction (per-page)
export {
  extractPdfWithAnchors,
  extractTextFromPDF as extractTextFromPDFAnchored,
  createPageAnchor,
  getPageAnchors,
} from './pdfExtractor.service';

// PPTX Extraction (per-slide)
export {
  extractPptxWithAnchors,
  extractTextFromPowerPoint as extractTextFromPowerPointAnchored,
  createSlideAnchor,
  getSlideAnchors,
} from './pptxExtractor.service';

// XLSX Extraction (per-cell with facts)
export {
  extractXlsxWithAnchors,
  extractTextFromExcel as extractTextFromExcelAnchored,
  createCellAnchorFromFact,
  getCellAnchors,
  findCellFact,
} from './xlsxExtractor.service';

// DOCX Extraction (per-heading)
export {
  extractDocxWithAnchors,
  extractTextFromWord as extractTextFromWordAnchored,
  createHeadingAnchorFromSection,
  getHeadingAnchors,
  findSectionByHeading,
} from './docxExtractor.service';

// ============================================================================
// Re-export Types
// ============================================================================

export type {
  PdfExtractionResult,
  PdfExtractedPage,
  PptxExtractionResult,
  PptxExtractedSlide,
  XlsxExtractionResult,
  XlsxCellFact,
  XlsxSheetSummary,
  DocxExtractionResult,
  DocxSection,
  BaseExtractionResult,
  AnchoredChunk,
  AnchoredChunkingResult,
} from '../../types/extraction.types';

export type {
  Anchor,
  AnchorType,
  PdfPageAnchor,
  PptSlideAnchor,
  XlsxCellAnchor,
  XlsxRangeAnchor,
  DocxHeadingAnchor,
  DocxParagraphAnchor,
} from '../../types/anchor.types';

export {
  createPdfPageAnchor,
  createPptSlideAnchor,
  createXlsxCellAnchor,
  createXlsxRangeAnchor,
  createDocxHeadingAnchor,
  flattenAnchor,
  unflattenAnchor,
  formatAnchorLocation,
  isPdfPageAnchor,
  isPptSlideAnchor,
  isXlsxCellAnchor,
  isDocxHeadingAnchor,
} from '../../types/anchor.types';

// ============================================================================
// Unified Extraction Function
// ============================================================================

/**
 * Extract content with anchors based on MIME type.
 * Auto-detects document type and uses the appropriate enhanced extractor.
 */
export async function extractWithAnchors(
  buffer: Buffer,
  mimeType: string
): Promise<{
  text: string;
  wordCount: number;
  confidence: number;
  sourceType: 'pdf' | 'pptx' | 'xlsx' | 'docx' | 'unknown';
  metadata: Record<string, any>;
}> {
  switch (mimeType) {
    case 'application/pdf': {
      const { extractPdfWithAnchors } = await import('./pdfExtractor.service');
      const result = await extractPdfWithAnchors(buffer);
      return {
        text: result.text,
        wordCount: result.wordCount || 0,
        confidence: result.confidence || 1.0,
        sourceType: 'pdf',
        metadata: {
          pageCount: result.pageCount,
          hasTextLayer: result.hasTextLayer,
          ocrApplied: result.ocrApplied,
          pages: result.pages,
        },
      };
    }

    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    case 'application/vnd.ms-powerpoint': {
      const { extractPptxWithAnchors } = await import('./pptxExtractor.service');
      const result = await extractPptxWithAnchors(buffer);
      return {
        text: result.text,
        wordCount: result.wordCount || 0,
        confidence: result.confidence || 1.0,
        sourceType: 'pptx',
        metadata: {
          slideCount: result.slideCount,
          slideTitles: result.slideTitles,
          hasNotes: result.hasNotes,
          presentationTitle: result.presentationTitle,
          slides: result.slides,
        },
      };
    }

    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    case 'application/vnd.ms-excel': {
      const { extractXlsxWithAnchors } = await import('./xlsxExtractor.service');
      const result = await extractXlsxWithAnchors(buffer);
      return {
        text: result.text,
        wordCount: result.wordCount || 0,
        confidence: result.confidence || 1.0,
        sourceType: 'xlsx',
        metadata: {
          sheetCount: result.sheetCount,
          sheetNames: result.sheetNames,
          isFinancial: result.isFinancial,
          allHeaders: result.allHeaders,
          allRowLabels: result.allRowLabels,
          cellFacts: result.cellFacts,
          sheets: result.sheets,
        },
      };
    }

    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/msword': {
      const { extractDocxWithAnchors } = await import('./docxExtractor.service');
      const result = await extractDocxWithAnchors(buffer);
      return {
        text: result.text,
        wordCount: result.wordCount || 0,
        confidence: result.confidence || 1.0,
        sourceType: 'docx',
        metadata: {
          paragraphCount: result.paragraphCount,
          hasToc: result.hasToc,
          documentTitle: result.documentTitle,
          headings: result.headings,
          sections: result.sections,
        },
      };
    }

    default:
      return {
        text: '',
        wordCount: 0,
        confidence: 0,
        sourceType: 'unknown',
        metadata: { error: `Unsupported MIME type: ${mimeType}` },
      };
  }
}
