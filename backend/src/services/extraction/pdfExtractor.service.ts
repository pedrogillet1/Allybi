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
} from "../../types/extraction.types";
import type { PdfPageAnchor } from "../../types/extraction.types";
import { createPdfPageAnchor } from "../../types/extraction.types";
import googleVisionOCR from "./google-vision-ocr.service";
import { extractPDFWithTables, extractTablesFromText } from "../../utils/pdfTableExtractor";
import type { ExtractedTable } from "../ingestion/extraction/extractionResult.types";
import { extractTablesWithDocumentAI } from "./documentAiTableExtractor.service";
import { extractPdfOutline } from "./pdfOutlineExtractor.service";
import { logger } from "../../utils/logger";

/** Timeout (ms) for Document AI table extraction */
const DOCUMENT_AI_TIMEOUT_MS = 5000;

// ============================================================================
// Constants
// ============================================================================

/** Minimum characters per page to consider PDF as having a text layer */
const MIN_CHARS_PER_PAGE_THRESHOLD = 100;
const MIN_MEANINGFUL_CHARS_PER_PAGE = 80;
const MIN_MEANINGFUL_WORDS_PER_PAGE = 18;
const MIN_TOKEN_DIVERSITY = 0.22;
const WATERMARK_HEAVY_RATIO_THRESHOLD = 0.5;

/** Form feed character used as page separator in some PDFs */
const FORM_FEED = "\f";

/** Page separator pattern injected by some PDF extractors */
const PAGE_MARKER_REGEX = /\n*---\s*Page\s*(\d+)\s*---\n*/gi;
const KNOWN_WATERMARK_PATTERNS: RegExp[] = [
  /visualiza(?:c|ç)[aã]o disponibilizada pela central registradores de im[oó]veis/gi,
  /visualizado em:\s*\d{1,2}\/\d{1,2}\/\d{2,4}\s+\d{1,2}:\d{2}:\d{2}/gi,
  /www\.\s*registradores\.\s*org\.\s*br/gi,
];

// ============================================================================
// Post-processing
// ============================================================================

/**
 * Clean up extracted text while preserving layout structure needed for
 * downstream table detection.
 *
 * Key invariants:
 * - Newlines are preserved (not collapsed to spaces)
 * - Multi-space gaps (3+ spaces) are preserved for table column detection
 * - Runs of 2 spaces are collapsed to 1 (general cleanup)
 * - 3+ consecutive blank lines are collapsed to 2
 * - Punctuation spacing is normalised
 */
export function postProcessText(text: string): string {
  if (!text || text.trim().length === 0) {
    return text;
  }

  let cleaned = text;

  // Collapse runs of spaces/tabs on the SAME LINE but preserve multi-space
  // gaps (3+ chars) that the table extractor relies on (\s{3,}).
  // [^\S\n]+ matches horizontal whitespace only (excludes newlines).
  cleaned = cleaned.replace(/[^\S\n]+/g, (match) => {
    if (match.length >= 3) return match; // preserve table column gaps
    return " ";
  });

  // Collapse 3+ consecutive blank lines to 2
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  // Fix punctuation spacing
  cleaned = cleaned.replace(/ +([.,!?;:])/g, "$1");
  cleaned = cleaned.replace(/([.,!?;:])(\S)/g, "$1 $2");

  return cleaned.trim();
}

/**
 * Fix UTF-8 encoding issues common in PDFs
 */
function fixUtf8Encoding(text: string): string {
  try {
    // Detect if text has encoding issues (e.g., "Ã³" instead of "ó")
    if (text.includes("Ã") && /Ã[\x80-\xBF]/.test(text)) {
      const buffer = Buffer.from(text, "latin1");
      return buffer.toString("utf-8");
    }
  } catch {
    // Ignore encoding fix errors
  }
  return text;
}

function stripStructuralMarkers(text: string): string {
  return String(text || "")
    .replace(/--\s*\d+\s*(?:of|de)\s*\d+\s*--/gi, " ")
    .replace(/---\s*Page\s*\d+\s*---/gi, " ")
    .replace(/\f/g, " ");
}

function stripKnownWatermarks(text: string): string {
  let cleaned = String(text || "");
  for (const pattern of KNOWN_WATERMARK_PATTERNS) {
    cleaned = cleaned.replace(pattern, " ");
  }
  return cleaned;
}

function stripPageMarkers(text: string): string {
  return stripKnownWatermarks(stripStructuralMarkers(text))
    .replace(/\s+/g, " ")
    .trim();
}

function countWatermarkHits(text: string): number {
  let total = 0;
  for (const pattern of KNOWN_WATERMARK_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) total += matches.length;
  }
  return total;
}

function estimatePageCount(rawText: string, parserPageCount: number): number {
  let estimated = Math.max(1, parserPageCount || 1);

  const markerMatches = [
    ...rawText.matchAll(/--\s*\d+\s*(?:of|de)\s*(\d+)\s*--/gi),
  ];
  for (const match of markerMatches) {
    const total = Number(match[1]);
    if (Number.isFinite(total) && total > estimated) estimated = total;
  }

  const formFeedPages = rawText.split(FORM_FEED).length;
  if (formFeedPages > estimated) estimated = formFeedPages;

  const explicitPageMarkers =
    rawText.match(/---\s*Page\s*\d+\s*---/gi)?.length ?? 0;
  if (explicitPageMarkers > estimated) estimated = explicitPageMarkers;

  return Math.max(1, estimated);
}

function evaluateNativeTextQuality(
  rawText: string,
  pageCount: number,
): { weak: boolean; reasons: string[]; score: number } {
  const reasons: string[] = [];
  const structuralText = stripStructuralMarkers(rawText)
    .replace(/\s+/g, " ")
    .trim();
  const meaningful = stripPageMarkers(rawText);
  const watermarkHits = countWatermarkHits(structuralText);
  const charsPerPageBeforeWatermark =
    structuralText.length / Math.max(1, pageCount);
  const charsPerPage = meaningful.length / Math.max(1, pageCount);
  const words = meaningful
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
  const wordsPerPage = words.length / Math.max(1, pageCount);

  const lexicalWords = words
    .map((w) => w.toLowerCase().replace(/[^a-z0-9\u00c0-\u024f]/gi, ""))
    .filter((w) => w.length >= 3);
  const uniqueWords = new Set(lexicalWords);
  const tokenDiversity =
    lexicalWords.length > 0 ? uniqueWords.size / lexicalWords.length : 0;

  if (charsPerPage < MIN_MEANINGFUL_CHARS_PER_PAGE)
    reasons.push("low_chars_per_page");
  if (wordsPerPage < MIN_MEANINGFUL_WORDS_PER_PAGE)
    reasons.push("low_words_per_page");
  if (lexicalWords.length >= 40 && tokenDiversity < MIN_TOKEN_DIVERSITY)
    reasons.push("low_token_diversity");
  if (
    watermarkHits > 0 &&
    charsPerPageBeforeWatermark >= MIN_MEANINGFUL_CHARS_PER_PAGE &&
    charsPerPage < MIN_MEANINGFUL_CHARS_PER_PAGE
  ) {
    reasons.push("watermark_only_native_text");
  }

  if (
    watermarkHits > 0 &&
    structuralText.length > 0 &&
    meaningful.length / structuralText.length < WATERMARK_HEAVY_RATIO_THRESHOLD
  ) {
    reasons.push("watermark_heavy_text");
  }

  const markerTokens =
    rawText.match(/--\s*\d+\s*(?:of|de)\s*\d+\s*--|---\s*Page\s*\d+\s*---/gi) ||
    [];
  const markerOnlyLength = markerTokens.reduce(
    (sum, token) => sum + token.length,
    0,
  );
  if (markerOnlyLength > 0 && meaningful.length < markerOnlyLength * 1.5)
    reasons.push("marker_heavy_text");

  const score = Math.max(
    0,
    Math.min(
      1,
      (charsPerPage / (MIN_MEANINGFUL_CHARS_PER_PAGE * 2)) * 0.45 +
        (wordsPerPage / (MIN_MEANINGFUL_WORDS_PER_PAGE * 2)) * 0.35 +
        tokenDiversity * 0.2,
    ),
  );

  return {
    weak: reasons.length > 0,
    reasons,
    score,
  };
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
  forceOcrAll: boolean;
  weakTextReasons: string[];
  nativeQualityScore: number;
}> {
  // Use require for pdf-parse v2 (CommonJS module)
  const { PDFParse } = require("pdf-parse");
  const parser = new PDFParse({ data: buffer });

  // Get page count from getInfo() - required in pdf-parse v2
  const info = await parser.getInfo();
  const parserPageCount = info.total || 1;

  // Get raw text with page separators
  const data = await parser.getText();

  // Fix UTF-8 encoding
  const fullText = fixUtf8Encoding(data.text || "");
  const pageCount = estimatePageCount(fullText, parserPageCount);

  // Check if PDF has meaningful text
  const avgCharsPerPage = fullText.length / Math.max(1, pageCount);
  let hasTextLayer = avgCharsPerPage >= MIN_CHARS_PER_PAGE_THRESHOLD;

  // Guard: if text is almost entirely page markers (e.g. "-- 1 of 31 --"),
  // it's a scanned PDF with an overlay, not a real text layer.
  if (hasTextLayer) {
    const withoutMarkers = fullText
      .replace(/--\s*\d+\s*(of|de)\s*\d+\s*--/gi, "")
      .trim();
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
      forceOcrAll: true,
      weakTextReasons: ["low_text_density"],
      nativeQualityScore: 0,
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
      pageTexts = fullText
        .split(PAGE_MARKER_REGEX)
        .filter((t) => t && t.trim());
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
      wordCount: cleanedText.split(/\s+/).filter((w) => w.length > 0).length,
      ocrApplied: false,
    };
  });

  // If we got fewer pages than expected, pad with empty pages
  // (This handles cases where form feeds are missing at the end)
  while (pages.length < pageCount) {
    pages.push({
      page: pages.length + 1,
      text: "",
      wordCount: 0,
      ocrApplied: false,
    });
  }

  // If we got more pages than expected (rare), truncate
  if (pages.length > pageCount) {
    pages.length = pageCount;
  }

  await parser.destroy();

  const quality = evaluateNativeTextQuality(fullText, pageCount);
  if (quality.weak) {
    logger.warn("[PDF] Native text appears weak/boilerplate", {
      score: quality.score,
      reasons: quality.reasons,
    });
    return {
      pages,
      pageCount,
      hasTextLayer: false,
      forceOcrAll: true,
      weakTextReasons: quality.reasons,
      nativeQualityScore: quality.score,
    };
  }

  return {
    pages,
    pageCount,
    hasTextLayer: true,
    forceOcrAll: false,
    weakTextReasons: [],
    nativeQualityScore: quality.score,
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
  totalPageCount: number,
  forceOcrAll = false,
): Promise<{
  pages: PdfExtractedPage[];
  pageCount: number;
  overallConfidence: number;
  ocrPageCount: number;
  ocrMode: "direct" | "split" | "none";
  warnings: string[];
}> {
  if (!googleVisionOCR.isAvailable()) {
    throw new Error("Google Vision OCR not available");
  }

  // Identify which pages need OCR (low text density), or force all pages when native text quality is weak.
  const pagesToOcr: number[] = forceOcrAll
    ? Array.from({ length: totalPageCount }, (_, i) => i + 1)
    : [];
  if (!forceOcrAll) {
    for (let i = 0; i < totalPageCount; i++) {
      const page = nativePages[i];
      const textLength = page?.text?.length || 0;
      if (textLength < MIN_CHARS_PER_PAGE_THRESHOLD) {
        pagesToOcr.push(i + 1); // 1-indexed
      }
    }
  }

  // If no pages need OCR, return native pages as-is
  if (pagesToOcr.length === 0) {
    logger.debug("[PDF] All pages have sufficient text, skipping OCR");
    return {
      pages: nativePages,
      pageCount: totalPageCount,
      overallConfidence: 1.0,
      ocrPageCount: 0,
      ocrMode: "none",
      warnings: [],
    };
  }

  // If ALL pages need OCR, use batch OCR (more efficient)
  if (pagesToOcr.length === totalPageCount) {
    logger.info("[PDF] All pages need OCR, using batch", { totalPageCount });
    const fullOcr = await extractPagesOCR(buffer);
    return {
      ...fullOcr,
      ocrPageCount: totalPageCount,
      ocrMode: fullOcr.ocrMode,
      warnings: fullOcr.warnings,
    };
  }

  // SELECTIVE OCR: Only OCR the pages that need it
  logger.info("[PDF] Selective OCR: pages need OCR", {
    ocrPageCount: pagesToOcr.length,
    totalPageCount,
  });
  const ocrPagesResult = await (googleVisionOCR as any).processPdfPages(
    buffer,
    {
      pages: pagesToOcr,
      maxPages: totalPageCount,
    },
  );
  const ocrResults = new Map<number, { text: string; confidence: number }>(
    (ocrPagesResult.pages || []).map((page: any) => [
      page.page,
      {
        text: postProcessText(String(page.text || "")),
        confidence: Number(page.confidence || 0.7),
      },
    ]),
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
        wordCount: ocrResult.text.split(/\s+/).filter((w) => w.length > 0)
          .length,
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
        text: "",
        wordCount: 0,
        ocrApplied: pagesToOcr.includes(pageNum),
      });
    }
  }

  const avgConfidence = confCount > 0 ? totalConfidence / confCount : 1.0;
  logger.info("[PDF] Selective OCR complete", {
    ocrPagesCompleted: ocrResults.size,
    confidencePct: Math.round(avgConfidence * 100),
  });

  return {
    pages: finalPages,
    pageCount: totalPageCount,
    overallConfidence: avgConfidence,
    ocrPageCount: ocrResults.size,
    ocrMode: (ocrPagesResult.mode as "direct" | "split") || "direct",
    warnings: Array.isArray(ocrPagesResult.warnings)
      ? ocrPagesResult.warnings
      : [],
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
  ocrMode: "direct" | "split" | "none";
  warnings: string[];
}> {
  if (!googleVisionOCR.isAvailable()) {
    throw new Error("Google Vision OCR not available");
  }

  logger.info("[PDF] Using Google Vision OCR for full PDF extraction");

  const ocrResult = await (googleVisionOCR as any).processPdfPages(buffer);
  const pageCount = ocrResult.pageCount || 1;
  const pagesByNumber = new Map<number, any>(
    (ocrResult.pages || []).map((page: any) => [Number(page.page), page]),
  );

  const pages: PdfExtractedPage[] = [];
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    const page = pagesByNumber.get(pageNumber);
    const cleanedText = postProcessText(String(page?.text || ""));
    pages.push({
      page: pageNumber,
      text: cleanedText,
      wordCount: cleanedText.split(/\s+/).filter((w) => w.length > 0).length,
      ocrApplied: true,
      ocrConfidence: Number(page?.confidence || ocrResult.confidence || 0.7),
    });
  }

  while (pages.length < pageCount) {
    pages.push({
      page: pages.length + 1,
      text: "",
      wordCount: 0,
      ocrApplied: true,
      ocrConfidence: Number(ocrResult.confidence || 0.7),
    });
  }

  return {
    pages,
    pageCount,
    overallConfidence: ocrResult.confidence,
    ocrMode: (ocrResult.mode as "direct" | "split") || "direct",
    warnings: Array.isArray(ocrResult.warnings) ? ocrResult.warnings : [],
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
  buffer: Buffer,
): Promise<PdfExtractionResult> {
  logger.info("[PDF] Starting per-page extraction", { sizeBytes: buffer.length });

  try {
    // Step 1: Try native text extraction first
    const nativeResult = await extractPagesNative(buffer);

    if (nativeResult.hasTextLayer && nativeResult.pages.length > 0) {
      // Track which pages got Document AI tables (used to skip heuristic on those pages)
      const docAiPageSet = new Set<number>();

      // Optional Document AI pass: try structured table extraction FIRST
      // when DOCUMENT_AI_ENABLED=true — pages with Doc AI tables skip heuristic
      let docAiTablesByPage = new Map<number, string[]>();
      if (process.env.DOCUMENT_AI_ENABLED === "true") {
        try {
          const docAiResult = await Promise.race([
            extractTablesWithDocumentAI(buffer),
            new Promise<null>((resolve) =>
              setTimeout(() => resolve(null), DOCUMENT_AI_TIMEOUT_MS),
            ),
          ]);

          if (docAiResult && docAiResult.tableCount > 0) {
            for (const entry of docAiResult.pages) {
              docAiTablesByPage.set(entry.page, entry.tables);
              docAiPageSet.add(entry.page);
            }

            logger.info("[PDF] Document AI tables extracted", {
              tableCount: docAiResult.tableCount,
              pagesWithTables: docAiResult.pages.length,
              tableConfidences: docAiResult.tableConfidences,
            });
          }
        } catch (docAiErr: any) {
          logger.warn("[PDF] Document AI table pass failed, falling back to heuristic for all pages", {
            error: docAiErr.message,
          });
        }
      }

      // Apply table preservation: Doc AI pages get Doc AI tables appended to
      // RAW page text; other pages get heuristic table enhancement
      const allExtractedTables: ExtractedTable[] = [];
      let enhancedPages = nativeResult.pages.map((page) => {
        const pageNum = page.page ?? (page as any).pageNumber ?? 0;
        const aiTables = docAiTablesByPage.get(pageNum);

        if (aiTables && aiTables.length > 0) {
          // Page covered by Document AI — append structured tables to raw text
          return {
            ...page,
            text: page.text + "\n\n" + aiTables.join("\n\n"),
          };
        }

        // No Document AI tables for this page — apply heuristic extraction
        try {
          const tableResult = extractTablesFromText(page.text);
          // Collect structured tables for cell-level indexing
          for (let tIdx = 0; tIdx < tableResult.tables.length; tIdx++) {
            const t = tableResult.tables[tIdx];
            if (t.structuredRows && t.structuredRows.length > 0) {
              allExtractedTables.push({
                tableId: `pdf:p${pageNum}:t${tIdx}`,
                pageOrSlide: pageNum,
                markdown: t.markdown,
                rows: t.structuredRows,
              });
            }
          }
          return { ...page, text: tableResult.tableCount > 0 ? tableResult.text : page.text };
        } catch {
          return page;
        }
      });

      // Extract PDF outline / bookmarks (non-blocking)
      let outlines: Array<{ title: string; level: number; pageIndex: number }> | undefined;
      try {
        const outlineEntries = await extractPdfOutline(buffer);
        if (outlineEntries.length > 0) {
          outlines = outlineEntries;
        }
      } catch (outlineErr: any) {
        logger.warn("[PDF] Outline extraction failed, continuing without outlines", {
          error: outlineErr.message,
        });
      }

      const totalText = enhancedPages.map((p) => p.text).join("\n\n");
      const totalWordCount = enhancedPages.reduce(
        (sum, p) => sum + p.wordCount,
        0,
      );

      logger.info("[PDF] Native extraction complete", {
        pageCount: nativeResult.pageCount,
        wordCount: totalWordCount,
        outlineCount: outlines?.length ?? 0,
      });

      return {
        sourceType: "pdf",
        text: totalText,
        pageCount: nativeResult.pageCount,
        pages: enhancedPages,
        hasTextLayer: true,
        ocrApplied: false,
        wordCount: totalWordCount,
        confidence: 1.0,
        textQuality: "high",
        textQualityScore: nativeResult.nativeQualityScore,
        ...(outlines ? { outlines } : {}),
        ...(allExtractedTables.length > 0 ? { extractedTables: allExtractedTables } : {}),
      };
    }

    // Step 2: PDF has low text density - use SELECTIVE OCR
    // This only OCRs pages that need it, cutting OCR time by 70-95%
    const weakReasonText =
      nativeResult.weakTextReasons.length > 0
        ? ` reasons=${nativeResult.weakTextReasons.join(",")}`
        : "";
    logger.info("[PDF] Native extraction requires OCR", {
      pageCount: nativeResult.pageCount,
      weakTextReasons: nativeResult.weakTextReasons,
    });

    // Extract PDF outline / bookmarks for OCR and fallback paths (non-blocking)
    let ocrOutlines: Array<{ title: string; level: number; pageIndex: number }> | undefined;
    try {
      const outlineEntries = await extractPdfOutline(buffer);
      if (outlineEntries.length > 0) {
        ocrOutlines = outlineEntries;
      }
    } catch {
      // Outline extraction is best-effort; ignore failures
    }

    if (googleVisionOCR.isAvailable()) {
      try {
        // Pad native pages array to match page count
        const paddedNativePages = [...nativeResult.pages];
        while (paddedNativePages.length < nativeResult.pageCount) {
          paddedNativePages.push({
            page: paddedNativePages.length + 1,
            text: "",
            wordCount: 0,
            ocrApplied: false,
          });
        }

        const ocrResult = await extractPagesSelectiveOCR(
          buffer,
          paddedNativePages,
          nativeResult.pageCount,
          nativeResult.forceOcrAll,
        );

        const totalText = ocrResult.pages.map((p) => p.text).join("\n\n");
        const totalWordCount = ocrResult.pages.reduce(
          (sum, p) => sum + p.wordCount,
          0,
        );

        const ocrPct = Math.round(
          (ocrResult.ocrPageCount / ocrResult.pageCount) * 100,
        );
        logger.info("[PDF] Selective OCR extraction complete", {
          pageCount: ocrResult.pageCount,
          ocrPageCount: ocrResult.ocrPageCount,
          ocrPct,
          wordCount: totalWordCount,
        });

        return {
          sourceType: "pdf",
          text: totalText,
          pageCount: ocrResult.pageCount,
          pages: ocrResult.pages,
          hasTextLayer: ocrResult.ocrPageCount < ocrResult.pageCount,
          ocrApplied: ocrResult.ocrPageCount > 0,
          ocrConfidence: ocrResult.overallConfidence,
          ocrPageCount: ocrResult.ocrPageCount,
          ocrMode: ocrResult.ocrMode,
          wordCount: totalWordCount,
          confidence: ocrResult.overallConfidence,
          textQuality: "ocr_enhanced",
          textQualityScore: ocrResult.overallConfidence,
          weakTextReasons: nativeResult.weakTextReasons,
          extractionWarnings: ocrResult.warnings,
          ...(ocrOutlines ? { outlines: ocrOutlines } : {}),
        };
      } catch (ocrError: any) {
        logger.error("[PDF] OCR failed", { error: ocrError.message });
      }
    } else {
      const nativeTextLength = nativeResult.pages.reduce(
        (sum, p) => sum + (p.text?.length || 0), 0,
      );
      logger.warn("[PDF] OCR not available — scanned/low-quality PDF will have degraded text", {
        pageCount: nativeResult.pageCount,
        nativeTextLength,
        weakTextReasons: nativeResult.weakTextReasons,
        initError: (googleVisionOCR as any).getInitializationError?.(),
      });
    }

    // Step 3: Fallback - return whatever native extraction gave us
    const fallbackText = nativeResult.pages.map((p) => p.text).join("\n\n");
    const fallbackWordCount = fallbackText
      .split(/\s+/)
      .filter((w) => w.length > 0).length;

    logger.warn("[PDF] Fallback extraction with low confidence", {
      pageCount: nativeResult.pageCount,
      wordCount: fallbackWordCount,
    });

    return {
      sourceType: "pdf",
      text: fallbackText,
      pageCount: nativeResult.pageCount,
      pages: nativeResult.pages,
      hasTextLayer: false,
      ocrApplied: false,
      wordCount: fallbackWordCount,
      confidence: 0.3,
      textQuality: "low",
      textQualityScore: nativeResult.nativeQualityScore,
      weakTextReasons: nativeResult.weakTextReasons,
      ...(ocrOutlines ? { outlines: ocrOutlines } : {}),
    };
  } catch (error: any) {
    logger.error("[PDF] Extraction failed", { error: error.message });
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
  buffer: Buffer,
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
  sectionTitle?: string,
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
