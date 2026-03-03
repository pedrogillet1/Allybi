/**
 * Extraction Dispatch Service
 *
 * MIME-based routing to the appropriate text extractor.
 * Returns typed DispatchedExtractionResult instead of untyped objects.
 */

import { logger } from "../../../utils/logger";
import { extractPdfWithAnchors } from "../../extraction/pdfExtractor.service";
import { extractDocxWithAnchors } from "../../extraction/docxExtractor.service";
import { extractXlsxWithAnchors } from "../../extraction/xlsxExtractor.service";
import { extractPptxWithAnchors } from "../../extraction/pptxExtractor.service";
import { getGoogleVisionOcrService } from "../../extraction/google-vision-ocr.service";
import type { DispatchedExtractionResult } from "./extractionResult.types";

// ---------------------------------------------------------------------------
// MIME constants
// ---------------------------------------------------------------------------

export const PDF_MIMES = ["application/pdf"];
export const DOCX_MIMES = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];
export const XLSX_MIMES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
];
export const PPTX_MIMES = [
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
];

/** Images are visual-first — they should remain visible even if OCR finds no text. */
export function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

// ---------------------------------------------------------------------------
// Smart Image OCR Filter
// ---------------------------------------------------------------------------

const SKIP_OCR_FILENAME_PATTERNS = [
  /photoroom/i,
  /logo/i,
  /icon/i,
  /avatar/i,
  /thumbnail/i,
  /banner/i,
  /background/i,
  /^copy_[A-F0-9-]+/i,
  /\.(svg|gif|webp)$/i,
];

const MIN_IMAGE_SIZE_FOR_OCR = 10 * 1024; // 10KB

export function shouldSkipImageOcr(
  filename: string,
  bufferSize: number,
): { skip: boolean; reason?: string } {
  for (const pattern of SKIP_OCR_FILENAME_PATTERNS) {
    if (pattern.test(filename)) {
      return {
        skip: true,
        reason: `filename matches skip pattern: ${pattern}`,
      };
    }
  }

  if (bufferSize < MIN_IMAGE_SIZE_FOR_OCR) {
    return {
      skip: true,
      reason: `image too small (${(bufferSize / 1024).toFixed(1)}KB < 10KB)`,
    };
  }

  return { skip: false };
}

// ---------------------------------------------------------------------------
// Main dispatch
// ---------------------------------------------------------------------------

export async function extractText(
  buffer: Buffer,
  mimeType: string,
  filename?: string,
): Promise<DispatchedExtractionResult> {
  if (PDF_MIMES.includes(mimeType)) {
    const result = await extractPdfWithAnchors(buffer);
    return { sourceType: "pdf", ...result } as unknown as DispatchedExtractionResult;
  }

  if (DOCX_MIMES.includes(mimeType)) {
    const result = await extractDocxWithAnchors(buffer);
    return { sourceType: "docx", sections: [], ...result } as unknown as DispatchedExtractionResult;
  }

  if (XLSX_MIMES.includes(mimeType)) {
    const result = await extractXlsxWithAnchors(buffer);
    return { sourceType: "xlsx", sheetCount: 0, sheets: [], ...result } as unknown as DispatchedExtractionResult;
  }

  if (PPTX_MIMES.includes(mimeType)) {
    const result = await extractPptxWithAnchors(buffer);
    return { sourceType: "pptx", slideCount: 0, slides: [], ...result } as unknown as DispatchedExtractionResult;
  }

  // Plain text fallback
  if (mimeType.startsWith("text/")) {
    const text = buffer.toString("utf-8");
    return {
      sourceType: "text",
      text,
      wordCount: text.split(/\s+/).length,
      confidence: 1.0,
    };
  }

  // Image OCR via Google Cloud Vision
  if (mimeType.startsWith("image/")) {
    if (filename) {
      const skipCheck = shouldSkipImageOcr(filename, buffer.length);
      if (skipCheck.skip) {
        logger.info("[OCR] Skipping image OCR, saving as visual-only", {
          filename,
          reason: skipCheck.reason,
        });
        return {
          sourceType: "image",
          text: "",
          wordCount: 0,
          confidence: 1.0,
          skipped: true,
          skipReason: `Image saved as visual-only (${skipCheck.reason})`,
        };
      }
    }

    const visionService = getGoogleVisionOcrService();
    if (!visionService.isAvailable()) {
      const reason = `Image OCR unavailable (Google Vision not initialized): ${visionService.getInitError() || "no credentials"}`;
      logger.warn("[OCR] Provider unavailable, saving as visual-only", {
        filename,
        mimeType,
        reason,
      });
      return {
        sourceType: "image",
        text: "",
        wordCount: 0,
        confidence: 0,
        skipped: true,
        skipReason: `Image saved as visual-only (${reason})`,
      };
    }

    try {
      const ocrResult = await visionService.extractTextWithRetry(buffer, {
        mode: "document",
      });
      if (!ocrResult.text || ocrResult.text.trim().length === 0) {
        logger.info("[OCR] Image OCR produced no text, saving as visual-only", {
          filename,
          mimeType,
        });
        return {
          sourceType: "image",
          text: "",
          wordCount: 0,
          confidence: 1.0,
          skipped: true,
          skipReason: "Image contains no text (visual-only)",
        };
      }
      return {
        sourceType: "image",
        text: ocrResult.text,
        wordCount: ocrResult.text.split(/\s+/).length,
        confidence: ocrResult.confidence ?? 0.8,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      logger.warn("[OCR] OCR processing failed, saving as visual-only", {
        filename,
        mimeType,
        reason,
      });
      return {
        sourceType: "image",
        text: "",
        wordCount: 0,
        confidence: 0,
        skipped: true,
        skipReason: `Image saved as visual-only (ocr_error: ${reason})`,
      };
    }
  }

  throw new Error(`Unsupported mimeType for extraction: ${mimeType}`);
}
