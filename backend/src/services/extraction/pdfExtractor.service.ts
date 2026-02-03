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

  // Get page count from getInfo() - required in pdf-parse v2
  const info = await parser.getInfo();
  const pageCount = info.total || 1;

  // Get raw text with page separators
  const data = await parser.getText();

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
    await parser.destroy();
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

  await parser.destroy();
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
 * SELECTIVE OCR: Only OCR pages that need it (low text density).
 * This can cut OCR time by 70-95% on mixed PDFs with some native text pages.
 */
async function extractPagesSelectiveOCR(
  buffer: Buffer,
  nativePages: PdfExtractedPage[],
  totalPageCount: number
): Promise<{
  pages: PdfExtractedPage[];
  pageCount: number;
  overallConfidence: number;
  ocrPageCount: number;
}> {
  if (!googleVisionOCR.isAvailable()) {
    throw new Error('Google Vision OCR not available');
  }

  // Identify which pages need OCR (low text density)
  const pagesToOcr: number[] = [];
  for (let i = 0; i < totalPageCount; i++) {
    const page = nativePages[i];
    const textLength = page?.text?.length || 0;
    // Page needs OCR if it has very little text (likely scanned)
    if (textLength < MIN_CHARS_PER_PAGE_THRESHOLD) {
      pagesToOcr.push(i + 1); // 1-indexed
    }
  }

  // If no pages need OCR, return native pages as-is
  if (pagesToOcr.length === 0) {
    console.log('✅ [PDF] All pages have sufficient text, skipping OCR');
    return {
      pages: nativePages,
      pageCount: totalPageCount,
      overallConfidence: 1.0,
      ocrPageCount: 0,
    };
  }

  // If ALL pages need OCR, use batch OCR (more efficient)
  if (pagesToOcr.length === totalPageCount) {
    console.log(`🔍 [PDF] All ${totalPageCount} pages need OCR, using batch...`);
    const fullOcr = await extractPagesOCR(buffer);
    return { ...fullOcr, ocrPageCount: totalPageCount };
  }

  // SELECTIVE OCR: Only OCR the pages that need it
  console.log(`🔍 [PDF] Selective OCR: ${pagesToOcr.length}/${totalPageCount} pages need OCR`);

  // Use Google Vision batchAnnotateFiles with specific page numbers
  const BATCH_SIZE = 5;
  const batches: number[][] = [];
  for (let i = 0; i < pagesToOcr.length; i += BATCH_SIZE) {
    batches.push(pagesToOcr.slice(i, i + BATCH_SIZE));
  }

  const ocrResults = new Map<number, { text: string; confidence: number }>();

  await Promise.all(
    batches.map(async (pageRange) => {
      try {
        const [result] = await (googleVisionOCR as any).client!.batchAnnotateFiles({
          requests: [{
            inputConfig: { content: buffer, mimeType: 'application/pdf' },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
            pages: pageRange,
          }],
        });

        const responses = result.responses?.[0]?.responses || [];
        for (let i = 0; i < responses.length; i++) {
          const pageNum = pageRange[i];
          const pageText = responses[i]?.fullTextAnnotation?.text || '';
          const blocks = responses[i]?.fullTextAnnotation?.pages?.flatMap((p: any) => p.blocks || []) || [];
          const confs = blocks.map((b: any) => b.confidence).filter((c: any): c is number => typeof c === 'number');
          const confidence = confs.length > 0 ? confs.reduce((a: number, b: number) => a + b, 0) / confs.length : 0.7;
          ocrResults.set(pageNum, { text: postProcessText(pageText), confidence });
        }
      } catch (err: any) {
        console.warn(`[PDF] OCR batch failed for pages ${pageRange.join(',')}:`, err.message);
      }
    })
  );

  // Merge native pages with OCR results
  const finalPages: PdfExtractedPage[] = [];
  let totalConfidence = 0;
  let confCount = 0;

  for (let i = 0; i < totalPageCount; i++) {
    const pageNum = i + 1;
    const ocrResult = ocrResults.get(pageNum);

    if (ocrResult && ocrResult.text.length > 0) {
      // Use OCR result for this page
      finalPages.push({
        page: pageNum,
        text: ocrResult.text,
        wordCount: ocrResult.text.split(/\s+/).filter(w => w.length > 0).length,
        ocrApplied: true,
        ocrConfidence: ocrResult.confidence,
      });
      totalConfidence += ocrResult.confidence;
      confCount++;
    } else if (nativePages[i] && nativePages[i].text.length > 0) {
      // Use native text for this page
      finalPages.push({ ...nativePages[i], ocrApplied: false });
    } else {
      // Empty page
      finalPages.push({
        page: pageNum,
        text: '',
        wordCount: 0,
        ocrApplied: pagesToOcr.includes(pageNum),
      });
    }
  }

  const avgConfidence = confCount > 0 ? totalConfidence / confCount : 1.0;
  console.log(`✅ [PDF] Selective OCR complete: ${ocrResults.size} pages OCR'd, confidence: ${(avgConfidence * 100).toFixed(0)}%`);

  return {
    pages: finalPages,
    pageCount: totalPageCount,
    overallConfidence: avgConfidence,
    ocrPageCount: ocrResults.size,
  };
}

/**
 * Extract text from scanned PDF using Google Vision OCR (full PDF).
 * Returns per-page text with OCR confidence.
 */
async function extractPagesOCR(buffer: Buffer): Promise<{
  pages: PdfExtractedPage[];
  pageCount: number;
  overallConfidence: number;
}> {
  if (!googleVisionOCR.isAvailable()) {
    throw new Error('Google Vision OCR not available');
  }

  console.log('🔍 [PDF] Using Google Vision OCR for full PDF extraction...');

  // Google Vision OCR returns: { text, pageCount, confidence }
  const ocrResult = await (googleVisionOCR as any).processScannedPDF(buffer);

  // OCR service returns single text blob - split by form feeds for per-page
  const fullText = ocrResult.text || '';
  let pageTexts: string[];

  if (fullText.includes(FORM_FEED)) {
    pageTexts = fullText.split(FORM_FEED);
  } else {
    // If no form feeds, split evenly across reported page count
    const pageCount = ocrResult.pageCount || 1;
    if (pageCount > 1 && fullText.length > 500) {
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

    // Step 2: PDF has low text density - use SELECTIVE OCR
    // This only OCRs pages that need it, cutting OCR time by 70-95%
    console.log(
      `📄 [PDF] Low overall text density (${nativeResult.pageCount} pages), using selective OCR...`
    );

    if (googleVisionOCR.isAvailable()) {
      try {
        // Pad native pages array to match page count
        const paddedNativePages = [...nativeResult.pages];
        while (paddedNativePages.length < nativeResult.pageCount) {
          paddedNativePages.push({
            page: paddedNativePages.length + 1,
            text: '',
            wordCount: 0,
            ocrApplied: false,
          });
        }

        const ocrResult = await extractPagesSelectiveOCR(
          buffer,
          paddedNativePages,
          nativeResult.pageCount
        );

        const totalText = ocrResult.pages.map(p => p.text).join('\n\n');
        const totalWordCount = ocrResult.pages.reduce(
          (sum, p) => sum + p.wordCount,
          0
        );

        const ocrPct = Math.round((ocrResult.ocrPageCount / ocrResult.pageCount) * 100);
        console.log(
          `✅ [PDF] Selective OCR: ${ocrResult.pageCount} pages, ${ocrResult.ocrPageCount} OCR'd (${ocrPct}%), ${totalWordCount} words`
        );

        return {
          sourceType: 'pdf',
          text: totalText,
          pageCount: ocrResult.pageCount,
          pages: ocrResult.pages,
          hasTextLayer: ocrResult.ocrPageCount < ocrResult.pageCount,
          ocrApplied: ocrResult.ocrPageCount > 0,
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
