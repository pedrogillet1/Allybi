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
import { extractWithTesseract } from "../../extraction/tesseractFallback.service";
import type { DispatchedExtractionResult } from "./extractionResult.types";
import { recordExtractorTiming, recordExtractionAttempt, recordOcrUsage } from "../pipeline/pipelineMetrics.service";

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

// ---------------------------------------------------------------------------
// OLE binary detection (legacy .doc / .xls / .ppt)
// ---------------------------------------------------------------------------

const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0];

function isOleBinary(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  return OLE_MAGIC.every((byte, i) => buffer[i] === byte);
}

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
// Tesseract language detection
// ---------------------------------------------------------------------------

function detectTesseractLangs(filename?: string): string {
  if (!filename) return "eng+por";
  const lower = filename.toLowerCase();
  if (lower.includes("_es") || lower.includes("_spa") || lower.includes(".es.") || lower.includes("spanish")) {
    return "eng+spa";
  }
  return "eng+por";
}

// ---------------------------------------------------------------------------
// Main dispatch
// ---------------------------------------------------------------------------

export async function extractText(
  buffer: Buffer,
  mimeType: string,
  filename?: string,
): Promise<DispatchedExtractionResult> {
  const tStart = Date.now();
  let extractor = "unknown";

  try {
  if (PDF_MIMES.includes(mimeType)) {
    extractor = "pdf";
    const result = await extractPdfWithAnchors(buffer);
    return { sourceType: "pdf", ...result } as unknown as DispatchedExtractionResult;
  }

  if (DOCX_MIMES.includes(mimeType)) {
    if (isOleBinary(buffer)) {
      throw new Error(
        "Legacy .doc format is not supported. Please convert to .docx (File > Save As > .docx) and re-upload.",
      );
    }
    extractor = "docx";
    const result = await extractDocxWithAnchors(buffer);
    return { sourceType: "docx", ...result } as unknown as DispatchedExtractionResult;
  }

  if (XLSX_MIMES.includes(mimeType)) {
    if (isOleBinary(buffer)) {
      throw new Error(
        "Legacy .xls format is not supported. Please convert to .xlsx (File > Save As > .xlsx) and re-upload.",
      );
    }
    extractor = "xlsx";
    const result = await extractXlsxWithAnchors(buffer);
    return { sourceType: "xlsx", ...result } as unknown as DispatchedExtractionResult;
  }

  if (PPTX_MIMES.includes(mimeType)) {
    if (isOleBinary(buffer)) {
      throw new Error(
        "Legacy .ppt format is not supported. Please convert to .pptx (File > Save As > .pptx) and re-upload.",
      );
    }
    extractor = "pptx";
    const result = await extractPptxWithAnchors(buffer);
    return { sourceType: "pptx", ...result } as unknown as DispatchedExtractionResult;
  }

  // Plain text fallback
  if (mimeType.startsWith("text/")) {
    extractor = "text";
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
    extractor = "image_ocr";
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
          confidence: 0,
          skipped: true,
          skipReason: `Image saved as visual-only (${skipCheck.reason})`,
        };
      }
    }

    const visionService = getGoogleVisionOcrService();
    if (!visionService.isAvailable()) {
      // Primary OCR unavailable — try Tesseract.js fallback
      logger.info("[OCR] Google Vision unavailable, trying Tesseract fallback", {
        filename,
        mimeType,
        initError: visionService.getInitError(),
      });

      const fallbackResult = await extractWithTesseract(buffer, detectTesseractLangs(filename));
      if (fallbackResult.text && fallbackResult.text.trim().length > 0) {
        recordOcrUsage("tesseract", true);
        logger.info("[OCR] Tesseract fallback succeeded", {
          filename,
          textLength: fallbackResult.text.length,
          confidence: fallbackResult.confidence,
        });
        return {
          sourceType: "image",
          text: fallbackResult.text,
          wordCount: fallbackResult.text.split(/\s+/).length,
          confidence: fallbackResult.confidence,
        };
      }

      recordOcrUsage("tesseract", false);
      logger.warn("[OCR] Tesseract fallback produced no text, saving as visual-only", {
        filename,
        mimeType,
      });
      return {
        sourceType: "image",
        text: "",
        wordCount: 0,
        confidence: 0,
        skipped: true,
        skipReason: "Image saved as visual-only (Google Vision unavailable, Tesseract returned no text)",
      };
    }

    try {
      const ocrResult = await visionService.extractTextWithRetry(buffer, {
        mode: "document",
      });
      if (!ocrResult.text || ocrResult.text.trim().length === 0) {
        recordOcrUsage("google_vision", false);
        logger.info("[OCR] Image OCR produced no text, saving as visual-only", {
          filename,
          mimeType,
        });
        return {
          sourceType: "image",
          text: "",
          wordCount: 0,
          confidence: 0,
          skipped: true,
          skipReason: "Image contains no text (visual-only)",
        };
      }
      recordOcrUsage("google_vision", true);
      return {
        sourceType: "image",
        text: ocrResult.text,
        wordCount: ocrResult.text.split(/\s+/).length,
        confidence: ocrResult.confidence ?? 0.8,
      };
    } catch (error) {
      recordOcrUsage("google_vision", false);
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
  } catch (err) {
    recordExtractionAttempt(false);
    throw err;
  } finally {
    const durationMs = Date.now() - tStart;
    if (extractor !== "unknown") {
      recordExtractorTiming(extractor, durationMs);
      logger.info("[Extraction] Completed", { extractor, mimeType, durationMs, sizeBytes: buffer.length });
    }
  }
}
