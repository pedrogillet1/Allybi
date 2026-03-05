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
import {
  OCR_MIN_IMAGE_SIZE_BYTES,
  OCR_MIN_IMAGE_EDGE,
  OCR_MIN_IMAGE_PIXELS,
  OCR_LOW_VARIANCE_STDEV_THRESHOLD,
  OCR_LOW_ENTROPY_THRESHOLD,
  resolveImageOcrConfidence,
} from "../../extraction/ocrPolicy.service";
import sharp from "sharp";
import type { DispatchedExtractionResult } from "./extractionResult.types";
import { recordExtractorTiming, recordOcrUsage } from "../pipeline/pipelineMetrics.service";
import {
  PDF_MIMES,
  DOCX_MIMES,
  XLSX_MIMES,
  PPTX_MIMES,
  CONNECTOR_MIMES,
  isImageMime,
  isMimeTypeSupportedForExtraction,
  normalizeMimeType,
} from "./ingestionMimeRegistry.service";

// ---------------------------------------------------------------------------
// MIME constants
// ---------------------------------------------------------------------------

export {
  PDF_MIMES,
  DOCX_MIMES,
  XLSX_MIMES,
  PPTX_MIMES,
  isMimeTypeSupportedForExtraction,
};

// ---------------------------------------------------------------------------
// OLE binary detection (legacy .doc / .xls / .ppt)
// ---------------------------------------------------------------------------

const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0];

function isOleBinary(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  return OLE_MAGIC.every((byte, i) => buffer[i] === byte);
}

/** Images are visual-first — they should remain visible even if OCR finds no text. */
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

async function analyzeImageVisualSignals(
  buffer: Buffer,
): Promise<{ skip: boolean; reason?: string }> {
  try {
    const image = sharp(buffer, { failOn: "none" });
    const metadata = await image.metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;

    if (width === 0 || height === 0) {
      return { skip: false };
    }

    const pixels = width * height;
    if (
      Math.min(width, height) < OCR_MIN_IMAGE_EDGE ||
      pixels < OCR_MIN_IMAGE_PIXELS
    ) {
      return {
        skip: true,
        reason: `image dimensions too small (${width}x${height})`,
      };
    }

    const stats = await image.stats();
    const channels = Array.isArray(stats.channels) ? stats.channels : [];
    if (channels.length === 0) {
      return { skip: false };
    }

    const avgChannelStdev =
      channels.reduce((sum, ch) => sum + (ch.stdev ?? 0), 0) / channels.length;
    const entropy = typeof stats.entropy === "number" ? stats.entropy : null;
    const veryLowVariance =
      avgChannelStdev <= OCR_LOW_VARIANCE_STDEV_THRESHOLD;
    const lowEntropy = entropy !== null && entropy <= OCR_LOW_ENTROPY_THRESHOLD;

    if (veryLowVariance && lowEntropy) {
      return {
        skip: true,
        reason: `visual-only image detected (low_variance=${avgChannelStdev.toFixed(2)}, entropy=${entropy.toFixed(2)})`,
      };
    }
  } catch (error) {
    logger.debug("[OCR] Unable to run image content analysis", {
      reason: error instanceof Error ? error.message : String(error),
    });
  }

  return { skip: false };
}

export async function shouldSkipImageOcr(
  filename: string | undefined,
  buffer: Buffer,
): Promise<{ skip: boolean; reason?: string }> {
  if (filename) {
    for (const pattern of SKIP_OCR_FILENAME_PATTERNS) {
      if (pattern.test(filename)) {
        return {
          skip: true,
          reason: `filename matches skip pattern: ${pattern}`,
        };
      }
    }
  }

  if (buffer.length < OCR_MIN_IMAGE_SIZE_BYTES) {
    return {
      skip: true,
      reason: `image too small (${(buffer.length / 1024).toFixed(1)}KB < 10KB)`,
    };
  }

  const visualSignals = await analyzeImageVisualSignals(buffer);
  if (visualSignals.skip) {
    return visualSignals;
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
  const normalizedMime = normalizeMimeType(mimeType);

  try {
  if (PDF_MIMES.includes(normalizedMime)) {
    extractor = "pdf";
    const result = await extractPdfWithAnchors(buffer);
    return result;
  }

  if (DOCX_MIMES.includes(normalizedMime)) {
    if (isOleBinary(buffer)) {
      throw new Error(
        "Legacy .doc format is not supported. Please convert to .docx (File > Save As > .docx) and re-upload.",
      );
    }
    extractor = "docx";
    const result = await extractDocxWithAnchors(buffer);
    return result;
  }

  if (XLSX_MIMES.includes(normalizedMime)) {
    if (isOleBinary(buffer)) {
      throw new Error(
        "Legacy .xls format is not supported. Please convert to .xlsx (File > Save As > .xlsx) and re-upload.",
      );
    }
    extractor = "xlsx";
    const result = await extractXlsxWithAnchors(buffer);
    return result;
  }

  if (PPTX_MIMES.includes(normalizedMime)) {
    if (isOleBinary(buffer)) {
      throw new Error(
        "Legacy .ppt format is not supported. Please convert to .pptx (File > Save As > .pptx) and re-upload.",
      );
    }
    extractor = "pptx";
    const result = await extractPptxWithAnchors(buffer);
    return result;
  }

  // Plain text fallback
  if (CONNECTOR_MIMES.includes(normalizedMime)) {
    extractor = "connector_text";
    const text = buffer.toString("utf-8");
    return {
      sourceType: "text",
      text,
      wordCount: text.trim() ? text.trim().split(/\s+/).length : 0,
      confidence: 1.0,
    };
  }

  if (normalizedMime.startsWith("text/")) {
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
  if (isImageMime(normalizedMime)) {
    extractor = "image_ocr";
    const skipCheck = await shouldSkipImageOcr(filename, buffer);
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
      const normalizedConfidence = resolveImageOcrConfidence(
        ocrResult.confidence,
      );
      return {
        sourceType: "image",
        text: ocrResult.text,
        wordCount: ocrResult.text.split(/\s+/).length,
        confidence: normalizedConfidence.confidence,
        ...(normalizedConfidence.estimated
          ? { extractionWarnings: ["ocr_confidence_estimated: provider returned no confidence score, using default 0.5"] }
          : {}),
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

  throw new Error(`Unsupported mimeType for extraction: ${normalizedMime || mimeType}`);
  } catch (err) {
    throw err;
  } finally {
    const durationMs = Date.now() - tStart;
    if (extractor !== "unknown") {
      recordExtractorTiming(extractor, durationMs);
      logger.info("[Extraction] Completed", { extractor, mimeType, durationMs, sizeBytes: buffer.length });
    }
  }
}
