/**
 * Tesseract.js OCR Fallback Service
 *
 * Used ONLY when Google Cloud Vision is unavailable.
 * Google Vision remains the primary OCR provider.
 */

import { logger } from "../../utils/logger";

let tesseractModule: typeof import("tesseract.js") | null = null;

async function getTesseract(): Promise<typeof import("tesseract.js")> {
  if (!tesseractModule) {
    tesseractModule = await import("tesseract.js");
  }
  return tesseractModule;
}

export interface TesseractOcrResult {
  text: string;
  confidence: number;
}

/**
 * Extract text from an image buffer using Tesseract.js (local OCR).
 * Returns empty text with confidence 0 on failure — never throws.
 */
export async function extractWithTesseract(
  buffer: Buffer,
  langs: string = "eng",
): Promise<TesseractOcrResult> {
  try {
    const Tesseract = await getTesseract();
    const worker = await Tesseract.createWorker(langs);
    const { data } = await worker.recognize(buffer);
    await worker.terminate();

    const text = (data.text || "").trim();
    const confidence = (data.confidence || 0) / 100; // Tesseract uses 0-100, normalize to 0-1

    logger.info("[TesseractFallback] OCR complete", {
      textLength: text.length,
      confidence,
    });

    return { text, confidence };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.warn("[TesseractFallback] OCR failed", { reason });
    return { text: "", confidence: 0 };
  }
}
