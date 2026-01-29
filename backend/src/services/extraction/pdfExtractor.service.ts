/**
 * Enhanced PDF Extractor with Per-Page Anchored Extraction
 *
 * This service extracts text from PDFs on a per-page basis, enabling:
 * - Anchor-based chunk indexing (anchor.type = 'pdf_page')
 * - "Which page mentions X?" queries
 * - Preview modal jump-to-page functionality
 * - No cross-page chunk spans
 *
 * Uses pdf-parse v2 for native text extraction and Google Vision OCR for scanned PDFs.
 */

import type {
  PdfExtractionResult,
  PdfExtractedPage,
  BaseExtractionResult,
} from '../../types/extraction.types';
import type { PdfPageAnchor } from '../../types/extraction.types';
import { createPdfPageAnchor } from '../../types/extraction.types';
import googleVisionOCR from './google-vision-ocr.service';
import { extractPDFWithTables } from '../../utils/pdfTableExtractor';

// ============================================================================
// Constants
// ============================================================================

/** Minimum characters per page to consider PDF as having a text layer */
const MIN_CHARS_PER_PAGE_THRESHOLD = 100;

/** Form feed character used as page separator in some PDFs */
const FORM_FEED = '\f';

/** Page separator pattern injected by some PDF extractors */
const PAGE_MARKER_REGEX = /\n*---\s*Page\s*(\d+)\s*---\n*/gi;

// ============================================================================
// Post-processing
// ============================================================================

/**
 * Clean up extracted text (same logic as textExtraction.service.ts)
 */
function postProcessText(text: string): string {
  if (!text || text.trim().length === 0) {
    return text;
  }

  let cleaned = text;

  // Fix spacing issues
  cleaned = cleaned.replace(/\s+/g, ' ');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  // Fix punctuation spacing
  cleaned = cleaned.replace(/\s+([.,!?;:])/g, '$1');
  cleaned = cleaned.replace(/([.,!?;:])(\S)/g, '$1 $2');

  return cleaned.trim();
}

/**
 * Fix UTF-8 encoding issues common in PDFs
 */
function fixUtf8Encoding(text: string): string {
  try {
    // Detect if text has encoding issues (e.g., "Ã³" instead of "ó")
    if (text.includes('Ã') && /Ã[\x80-\xBF]/.test(text)) {
      const buffer = Buffer.from(text, 'latin1');
      return buffer.toString('utf-8');
    }
  } catch {
    // Ignore encoding fix errors
  }
  return text;
}

// ============================================================================
// Per-Page Extraction with pdf-parse v2
// ============================================================================

/**
 * Extract text from PDF on a per-page basis using pdf-parse v2.
 *
 * pdf-parse v2 API:
 * - parser.getText() returns full text with form feeds between pages
 * - parser.getPages() returns array of page objects (if available)
 *
 * We split by form feed (\f) to get per-page text.
 */
async function extractPagesNative(buffer: Buffer): Promise<{
  pages: PdfExtractedPage[];
  pageCount: number;
  hasTextLayer: boolean;
}> {
  // Use require for pdf-parse v2 (CommonJS module)
  const { PDFParse } = require('pdf-parse');
  const parser = new PDFParse({ data: buffer });

  // Get raw text with page separators
  const data = await parser.getText();
  const pageCount = data.numpages || 1;

  // Fix UTF-8 encoding
  let fullText = fixUtf8Encoding(data.text || '');

  // Check if PDF has meaningful text
  const avgCharsPerPage = fullText.length / pageCount;
  let hasTextLayer = avgCharsPerPage >= MIN_CHARS_PER_PAGE_THRESHOLD;

  // Guard: if text is almost entirely page markers (e.g. "-- 1 of 31 --"),
  // it's a scanned PDF with an overlay, not a real text layer.
  if (hasTextLayer) {
    const withoutMarkers = fullText.replace(/--\s*\d+\s*(of|de)\s*\d+\s*--/gi, '').trim();
    if (withoutMarkers.length < MIN_CHARS_PER_PAGE_THRESHOLD) {
      hasTextLayer = false;
    }
  }

  if (!hasTextLayer) {
    return {
      pages: [],
      pageCount,
      hasTextLayer: false,
    };
  }

  // Split text by page
  // pdf-parse typically uses form feed (\f) between pages
  let pageTexts: string[];

  if (fullText.includes(FORM_FEED)) {
    // Split by form feed character
    pageTexts = fullText.split(FORM_FEED);
  } else {
    // Fallback: Try to detect page markers or split evenly
    // Some extractors add "--- Page N ---" markers
    const markerMatch = fullText.match(PAGE_MARKER_REGEX);
    if (markerMatch && markerMatch.length > 1) {
      pageTexts = fullText.split(PAGE_MARKER_REGEX).filter(t => t && t.trim());
    } else {
      // No clear page separators - treat as single page
      // This is less ideal but preserves functionality
      pageTexts = [fullText];
    }
  }

  // Build page objects
  const pages: PdfExtractedPage[] = pageTexts.map((text, index) => {
    const cleanedText = postProcessText(text);
    return {
      page: index + 1,
      text: cleanedText,
      wordCount: cleanedText.split(/\s+/).filter(w => w.length > 0).length,
      ocrApplied: false,
    };
  });

  // If we got fewer pages than expected, pad with empty pages
  // (This handles cases where form feeds are missing at the end)
  while (pages.length < pageCount) {
    pages.push({
      page: pages.length + 1,
      text: '',
      wordCount: 0,
      ocrApplied: false,
    });
  }

  // If we got more pages than expected (rare), truncate
  if (pages.length > pageCount) {
    pages.length = pageCount;
  }

  return {
    pages,
    pageCount,
    hasTextLayer: true,
  };
}

// ============================================================================
// Per-Page Extraction with OCR (for scanned PDFs)
// ============================================================================

/**
 * Extract text from scanned PDF using Google Vision OCR.
 * Returns per-page text with OCR confidence.
 *
 * Note: The OCR service returns a single text blob with form feeds between pages.
 * We split by form feeds to get per-page data.
 */
async function extractPagesOCR(buffer: Buffer): Promise<{
  pages: PdfExtractedPage[];
  pageCount: number;
  overallConfidence: number;
}> {
  if (!googleVisionOCR.isAvailable()) {
    throw new Error('Google Vision OCR not available');
  }

  console.log('🔍 [PDF] Using Google Vision OCR for per-page extraction...');

  // Google Vision OCR returns: { text, pageCount, confidence }
  const ocrResult = await (googleVisionOCR as any).processScannedPDF(buffer);

  // OCR service returns single text blob - split by form feeds for per-page
  const fullText = ocrResult.text || '';
  let pageTexts: string[];

  if (fullText.includes(FORM_FEED)) {
    pageTexts = fullText.split(FORM_FEED);
  } else {
    // If no form feeds, split evenly across reported page count
    // or treat as single page if we can't determine
    const pageCount = ocrResult.pageCount || 1;
    if (pageCount > 1 && fullText.length > 500) {
      // Attempt basic split by double newlines as page approximation
      const paragraphs = fullText.split(/\n\n+/);
      const perPage = Math.ceil(paragraphs.length / pageCount);
      pageTexts = [];
      for (let i = 0; i < pageCount; i++) {
        const start = i * perPage;
        const end = Math.min(start + perPage, paragraphs.length);
        pageTexts.push(paragraphs.slice(start, end).join('\n\n'));
      }
    } else {
      pageTexts = [fullText];
    }
  }

  const pages: PdfExtractedPage[] = pageTexts.map((text, index) => {
    const cleanedText = postProcessText(text);
    return {
      page: index + 1,
      text: cleanedText,
      wordCount: cleanedText.split(/\s+/).filter(w => w.length > 0).length,
      ocrApplied: true,
      ocrConfidence: ocrResult.confidence,
    };
  });

  // Ensure we have the reported number of pages
  const reportedPageCount = ocrResult.pageCount || pages.length;
  while (pages.length < reportedPageCount) {
    pages.push({
      page: pages.length + 1,
      text: '',
      wordCount: 0,
      ocrApplied: true,
      ocrConfidence: ocrResult.confidence,
    });
  }

  return {
    pages,
    pageCount: reportedPageCount,
    overallConfidence: ocrResult.confidence,
  };
}

// ============================================================================
// Main Export: Enhanced PDF Extraction
// ============================================================================

/**
 * Extract text from PDF with per-page anchoring.
 *
 * Returns:
 * - pages[]: Array of { page, text, wordCount, ocrApplied, ocrConfidence }
 * - pageCount: Total number of pages
 * - hasTextLayer: Whether PDF has native text layer
 * - ocrApplied: Whether OCR was used
 *
 * Usage:
 * ```typescript
 * const result = await extractPdfWithAnchors(buffer);
 * for (const page of result.pages) {
 *   const anchor = createPdfPageAnchor(page.page);
 *   // Create chunks from page.text, attach anchor to each chunk
 * }
 * ```
 */
export async function extractPdfWithAnchors(
  buffer: Buffer
): Promise<PdfExtractionResult> {
  console.log(`📄 [PDF] Starting per-page extraction (${buffer.length} bytes)...`);

  try {
    // Step 1: Try native text extraction first
    const nativeResult = await extractPagesNative(buffer);

    if (nativeResult.hasTextLayer && nativeResult.pages.length > 0) {
      // Native extraction succeeded - apply table preservation
      const enhancedPages = nativeResult.pages.map(page => {
        try {
          const textWithTables = extractPDFWithTables(page.text);
          return { ...page, text: textWithTables };
        } catch {
          return page;
        }
      });

      const totalText = enhancedPages.map(p => p.text).join('\n\n');
      const totalWordCount = enhancedPages.reduce((sum, p) => sum + p.wordCount, 0);

      console.log(
        `✅ [PDF] Native extraction: ${nativeResult.pageCount} pages, ${totalWordCount} words`
      );

      return {
        sourceType: 'pdf',
        text: totalText,
        pageCount: nativeResult.pageCount,
        pages: enhancedPages,
        hasTextLayer: true,
        ocrApplied: false,
        wordCount: totalWordCount,
        confidence: 1.0,
      };
    }

    // Step 2: PDF appears scanned - try OCR
    console.log(
      `📄 [PDF] Low text density (${nativeResult.pageCount} pages), trying OCR...`
    );

    if (googleVisionOCR.isAvailable()) {
      try {
        const ocrResult = await extractPagesOCR(buffer);

        const totalText = ocrResult.pages.map(p => p.text).join('\n\n');
        const totalWordCount = ocrResult.pages.reduce(
          (sum, p) => sum + p.wordCount,
          0
        );

        console.log(
          `✅ [PDF] OCR extraction: ${ocrResult.pageCount} pages, ${totalWordCount} words, ${(ocrResult.overallConfidence * 100).toFixed(0)}% confidence`
        );

        return {
          sourceType: 'pdf',
          text: totalText,
          pageCount: ocrResult.pageCount,
          pages: ocrResult.pages,
          hasTextLayer: false,
          ocrApplied: true,
          ocrConfidence: ocrResult.overallConfidence,
          wordCount: totalWordCount,
          confidence: ocrResult.overallConfidence,
        };
      } catch (ocrError: any) {
        console.error('❌ [PDF] OCR failed:', ocrError.message);
      }
    } else {
      console.warn(
        '⚠️ [PDF] OCR not available:',
        (googleVisionOCR as any).getInitializationError?.()
      );
    }

    // Step 3: Fallback - return whatever native extraction gave us
    const fallbackText = nativeResult.pages.map(p => p.text).join('\n\n');
    const fallbackWordCount = fallbackText
      .split(/\s+/)
      .filter(w => w.length > 0).length;

    console.log(
      `⚠️ [PDF] Fallback extraction: ${nativeResult.pageCount} pages, ${fallbackWordCount} words (low confidence)`
    );

    return {
      sourceType: 'pdf',
      text: fallbackText,
      pageCount: nativeResult.pageCount,
      pages: nativeResult.pages,
      hasTextLayer: false,
      ocrApplied: false,
      wordCount: fallbackWordCount,
      confidence: 0.3,
    };
  } catch (error: any) {
    console.error('❌ [PDF] Extraction failed:', error.message);
    throw new Error(`Failed to extract text from PDF: ${error.message}`);
  }
}

// ============================================================================
// Legacy Compatibility
// ============================================================================

/**
 * Legacy extraction function that returns single text blob.
 * Use extractPdfWithAnchors() for anchor support.
 */
export async function extractTextFromPDF(
  buffer: Buffer
): Promise<BaseExtractionResult> {
  const result = await extractPdfWithAnchors(buffer);
  return {
    text: result.text,
    pageCount: result.pageCount,
    wordCount: result.wordCount,
    confidence: result.confidence,
  };
}

// ============================================================================
// Anchor Helpers
// ============================================================================

/**
 * Create a PDF page anchor for a given page number.
 */
export function createPageAnchor(
  page: number,
  sectionTitle?: string
): PdfPageAnchor {
  return createPdfPageAnchor(page, sectionTitle ? { sectionTitle } : undefined);
}

/**
 * Get all anchors for a PDF extraction result.
 * Returns one anchor per page that has content.
 */
export function getPageAnchors(result: PdfExtractionResult): PdfPageAnchor[] {
  return result.pages
    .filter((page: any) => page.text.trim().length > 0)
    .map((page: any) => createPdfPageAnchor(page.page ?? page.pageNumber));
}

// ============================================================================
// Exports
// ============================================================================

export default {
  extractPdfWithAnchors,
  extractTextFromPDF,
  createPageAnchor,
  getPageAnchors,
};
