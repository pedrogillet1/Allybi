/**
 * Tesseract.js OCR Fallback Service
 *
 * Used ONLY when Google Cloud Vision is unavailable.
 * Google Vision remains the primary OCR provider.
 *
 * Features:
 * - Cached worker pool: reuses a single worker per language set
 * - Per-call timeout (TESSERACT_TIMEOUT_MS, default 30s)
 * - Batch API for multi-image extraction
 * - terminatePool() for graceful cleanup
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

// ---------------------------------------------------------------------------
// Worker pool (one cached worker, language-keyed)
// ---------------------------------------------------------------------------

const TESSERACT_TIMEOUT_MS = parseInt(
  process.env.TESSERACT_TIMEOUT_MS || "30000",
  10,
);

let cachedWorker: any | null = null;
let cachedWorkerLangs: string | null = null;

async function getOrCreateWorker(langs: string): Promise<any> {
  if (cachedWorker && cachedWorkerLangs === langs) {
    return cachedWorker;
  }

  // Language changed — terminate old worker and create new one
  if (cachedWorker) {
    try {
      await cachedWorker.terminate();
    } catch {
      // ignore termination errors
    }
    cachedWorker = null;
    cachedWorkerLangs = null;
  }

  const Tesseract = await getTesseract();
  cachedWorker = await Tesseract.createWorker(langs);
  await cachedWorker.setParameters({ tessedit_pageseg_mode: "6" });
  cachedWorkerLangs = langs;
  return cachedWorker;
}

/**
 * Terminate the cached worker pool. Call on process shutdown.
 */
export async function terminatePool(): Promise<void> {
  if (cachedWorker) {
    try {
      await cachedWorker.terminate();
    } catch {
      // ignore
    }
    cachedWorker = null;
    cachedWorkerLangs = null;
  }
}

// ---------------------------------------------------------------------------
// Timeout helper
// ---------------------------------------------------------------------------

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Tesseract OCR timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

// ---------------------------------------------------------------------------
// Single-image extraction
// ---------------------------------------------------------------------------

/**
 * Extract text from an image buffer using Tesseract.js (local OCR).
 * Returns empty text with confidence 0 on failure — never throws.
 */
export async function extractWithTesseract(
  buffer: Buffer,
  langs: string = "eng",
): Promise<TesseractOcrResult> {
  try {
    const worker = await getOrCreateWorker(langs);
    const recognizeResult = (await withTimeout(
      worker.recognize(buffer),
      TESSERACT_TIMEOUT_MS,
    )) as { data?: { text?: string; confidence?: number } };
    const data = recognizeResult?.data ?? {};

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

    // On timeout or fatal error, discard the worker so a fresh one is created next call
    if (reason.includes("timed out")) {
      try { await cachedWorker?.terminate(); } catch { /* ignore */ }
      cachedWorker = null;
      cachedWorkerLangs = null;
    }

    return { text: "", confidence: 0 };
  }
}

// ---------------------------------------------------------------------------
// Batch extraction (multi-image, reuses single worker)
// ---------------------------------------------------------------------------

/**
 * Extract text from multiple image buffers using a single Tesseract worker.
 * Returns results in the same order as inputs.
 */
export async function extractWithTesseractBatch(
  buffers: Buffer[],
  langs: string = "eng",
): Promise<TesseractOcrResult[]> {
  const results: TesseractOcrResult[] = [];

  for (const buffer of buffers) {
    results.push(await extractWithTesseract(buffer, langs));
  }

  return results;
}
