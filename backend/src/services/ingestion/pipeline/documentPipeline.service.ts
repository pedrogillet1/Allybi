/**
 * Document Pipeline Service
 *
 * Core pipeline: download → extract → chunk → embed → encrypt
 * Returns typed PipelineTimings.
 */

import { createHash } from "crypto";
import { logger } from "../../../utils/logger";
import prisma from "../../../config/database";
import { downloadFile } from "../../../config/storage";
import vectorEmbeddingRuntimeService from "../../retrieval/vectorEmbedding.runtime.service";
import { extractText, PDF_MIMES, DOCX_MIMES, XLSX_MIMES, PPTX_MIMES } from "../extraction/extractionDispatch.service";
import { normalizeMimeType } from "../extraction/ingestionMimeRegistry.service";
import { isSkipped, hasPagesArray, hasSlidesArray } from "../extraction/extractionResult.types";
import type { DispatchedExtractionResult, ImageSkippedResult } from "../extraction/extractionResult.types";
import { buildInputChunks, deduplicateChunks } from "./chunkAssembly.service";
import { deriveTextQuality } from "./textQuality.service";
import { runEncryptionStep } from "./encryptionStep.service";
import fileValidator from "../fileValidator.service";
import type { PipelineTimings, InputChunk } from "./pipelineTypes";
import { recordIngestionTiming, recordExtractionAttempt } from "./pipelineMetrics.service";
import { deriveOcrSignals } from "../../extraction/ocrSignals.service";
import { toSkipCode } from "./skipCodes";

// Storage download concurrency limiter
const pLimit = require("p-limit");
const storageDownloadConcurrency = parseInt(
  process.env.STORAGE_DOWNLOAD_CONCURRENCY || "24",
  10,
);
const storageDownloadLimit = pLimit(storageDownloadConcurrency) as <T>(
  fn: () => Promise<T>,
) => Promise<T>;

// Memory-based backpressure: wait before downloading if RSS is above threshold
const MAX_RSS_BYTES =
  parseInt(process.env.PIPELINE_MAX_RSS_MB || "1024", 10) * 1024 * 1024;

async function waitForMemory(): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (process.memoryUsage().rss > MAX_RSS_BYTES && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
  }
}

// Per-extraction timeout constants (configurable via env)
const EXTRACTION_TIMEOUT_MS = parseInt(process.env.EXTRACTION_TIMEOUT_MS || "300000", 10); // 5 min
const EMBEDDING_TIMEOUT_MS = parseInt(process.env.EMBEDDING_TIMEOUT_MS || "600000", 10);   // 10 min

/**
 * Wrap a promise with a timeout. Rejects with a descriptive error if the
 * promise does not settle within `ms` milliseconds.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

export function resolveStrictPdfOcrRequired(
  rawValue: string | undefined = process.env.STRICT_PDF_OCR_REQUIRED,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  const normalized = String(rawValue ?? "true").trim().toLowerCase();
  const strictEnabled = normalized !== "false";
  const protectedEnv = nodeEnv === "production" || nodeEnv === "staging";

  if (protectedEnv && !strictEnabled) {
    logger.error(
      "[Pipeline] STRICT_PDF_OCR_REQUIRED=false is not allowed in production/staging; forcing strict mode",
      { nodeEnv },
    );
    return true;
  }

  return strictEnabled;
}

/**
 * Run the full document processing pipeline.
 */
export async function processDocumentAsync(
  documentId: string,
  encryptedFilename: string | null,
  filename: string,
  mimeType: string,
  userId: string,
  _thumbnailUrl: string | null,
): Promise<PipelineTimings> {
  if (!encryptedFilename) {
    throw new Error(
      `No storage key (encryptedFilename) for document ${documentId}`,
    );
  }
  let peakRssBytes = process.memoryUsage().rss;
  const updatePeakRss = () => {
    const current = process.memoryUsage().rss;
    if (current > peakRssBytes) peakRssBytes = current;
  };
  const readPeakRssMb = () => Number((peakRssBytes / (1024 * 1024)).toFixed(1));
  const normalizedMimeType = normalizeMimeType(mimeType);

  // 1) Download from storage (with memory backpressure)
  await waitForMemory();
  updatePeakRss();
  const tDownload = Date.now();
  logger.info("[Pipeline] Downloading from storage", {
    documentId,
    key: encryptedFilename,
  });
  const fileBuffer = await storageDownloadLimit(() =>
    downloadFile(encryptedFilename),
  );
  updatePeakRss();
  logger.info("[Pipeline] Storage download", {
    durationMs: Date.now() - tDownload,
    sizeMb: +(fileBuffer.length / 1024 / 1024).toFixed(1),
    filename,
  });

  // 1b) Compute actual content hash and update document
  const fileHash = createHash("sha256").update(fileBuffer).digest("hex");
  await prisma.document.update({
    where: { id: documentId },
    data: { fileHash },
  });

  // 1c) Resolve version info for document context
  const versionInfo = await prisma.document.findUnique({
    where: { id: documentId },
    select: { parentVersionId: true },
  });
  const rootDocId = versionInfo?.parentVersionId || documentId;
  const documentContext = {
    documentId,
    versionId: documentId,
    rootDocumentId: rootDocId,
    isLatestVersion: true, // freshly processed doc is latest by definition
  };

  // 1d) Validate file integrity before extraction
  const headerCheck = fileValidator.validateFileHeader(fileBuffer, mimeType, documentId);
  if (!headerCheck.isValid) {
    logger.warn("[Pipeline] File failed header validation", {
      documentId,
      filename,
      errorCode: headerCheck.errorCode,
      error: headerCheck.error,
    });
    return {
      storageDownloadMs: Date.now() - tDownload,
      extractionMs: 0,
      extractionMethod: "text",
      ocrAttempted: false,
      ocrUsed: false,
      ocrSuccess: false,
      ocrOutcome: "not_attempted",
      ocrConfidence: null,
      ocrPageCount: null,
      ocrMode: null,
      textQuality: "none",
      textQualityScore: 0,
      extractionWarnings: [headerCheck.error || "File header validation failed"],
      textLength: 0,
      rawChunkCount: 0,
      chunkCount: 0,
      embeddingMs: 0,
      pageCount: null,
      peakRssMb: readPeakRssMb(),
      fileHash,
      skipped: true,
      skipReason: `${headerCheck.errorCode}: ${headerCheck.error}`,
      skipCode: toSkipCode(headerCheck.errorCode, "FILE_INVALID"),
    };
  }

  // 2) Extract text
  const tExtract = Date.now();
  logger.info("[Pipeline] Extracting text", {
    documentId,
    mimeType,
    size: fileBuffer.length,
  });
  const extraction: DispatchedExtractionResult = await withTimeout(
    extractText(fileBuffer, mimeType, filename),
    EXTRACTION_TIMEOUT_MS,
    "Text extraction",
  );
  updatePeakRss();
  logger.info("[Pipeline] Text extraction", {
    durationMs: Date.now() - tExtract,
    filename,
  });

  const fullText = extraction.text || "";
  const wasSkipped = extraction.sourceType === "image" && isSkipped(extraction);
  const ocrSignals = deriveOcrSignals({
    mimeType,
    extraction: extraction as unknown as Record<string, unknown>,
    fullText,
  });
  const ocrAttempted = ocrSignals.ocrAttempted;
  const ocrUsed = ocrSignals.ocrUsed;
  const ocrSuccess = ocrSignals.ocrSuccess;
  const ocrOutcome = ocrSignals.ocrOutcome;
  const ocrConfidence = ocrSignals.ocrConfidence;
  const ocrPageCount = ocrSignals.ocrPageCount;
  const ocrMode = ocrSignals.ocrMode;
  const textQuality = deriveTextQuality(extraction, fullText);
  const extractionWarnings = [
    ...(Array.isArray(extraction.weakTextReasons)
      ? extraction.weakTextReasons
      : []),
    ...(Array.isArray(extraction.extractionWarnings)
      ? extraction.extractionWarnings
      : []),
  ];

  // Detect scanned PDF with no OCR applied — log structured warning for monitoring
  if (
    PDF_MIMES.includes(normalizedMimeType) &&
    extraction.confidence !== undefined &&
    extraction.confidence < 0.5 &&
    !ocrUsed
  ) {
    logger.warn("[Pipeline] Low-confidence PDF without OCR — likely scanned", {
      documentId,
      filename,
      confidence: extraction.confidence,
      textLength: fullText.length,
    });
  }

  const strictPdfRequiresOcr = resolveStrictPdfOcrRequired();
  if (
    strictPdfRequiresOcr &&
    PDF_MIMES.includes(normalizedMimeType) &&
    extraction.confidence !== undefined &&
    extraction.confidence < 0.5 &&
    !ocrUsed
  ) {
    recordExtractionAttempt(false);
    const skipReason =
      "Weak PDF text quality and OCR was unavailable; extraction skipped to avoid unreliable indexing";
    logger.warn("[Pipeline] Strict PDF OCR requirement triggered", {
      documentId,
      filename,
      confidence: extraction.confidence,
      ocrOutcome,
    });
    return {
      storageDownloadMs: tExtract - tDownload,
      extractionMs: Date.now() - tExtract,
      extractionMethod: "pdf_text",
      ocrAttempted,
      ocrUsed,
      ocrSuccess,
      ocrOutcome,
      ocrConfidence,
      ocrPageCount,
      ocrMode,
      textQuality: textQuality.label,
      textQualityScore: textQuality.score,
      extractionWarnings: [
        ...extractionWarnings,
        "OCR required for weak PDF but unavailable",
      ],
      textLength: fullText.length,
      rawChunkCount: 0,
      chunkCount: 0,
      embeddingMs: 0,
      pageCount: hasPagesArray(extraction) ? extraction.pageCount : null,
      peakRssMb: readPeakRssMb(),
      fileHash,
      skipped: true,
      skipReason,
      skipCode: "OCR_REQUIRED_UNAVAILABLE",
    };
  }

  if (!fullText || fullText.trim().length < 10) {
    recordExtractionAttempt(false);

    const skipReason = wasSkipped
      ? (extraction as ImageSkippedResult).skipReason
      : "No extractable text content";

    logger.info("[Pipeline] File skipped, no usable content", {
      documentId,
      filename,
      reason: skipReason,
    });

    return {
      storageDownloadMs: tExtract - tDownload,
      extractionMs: Date.now() - tExtract,
      extractionMethod: normalizedMimeType.startsWith("image/") ? "ocr" : "text",
      ocrAttempted,
      ocrUsed,
      ocrSuccess,
      ocrOutcome,
      ocrConfidence,
      ocrPageCount,
      ocrMode,
      textQuality: "none",
      textQualityScore: 0,
      extractionWarnings,
      textLength: 0,
      rawChunkCount: 0,
      chunkCount: 0,
      embeddingMs: 0,
      pageCount: null,
      peakRssMb: readPeakRssMb(),
      fileHash,
      skipped: true,
      skipReason,
      skipCode: wasSkipped ? "IMAGE_VISUAL_ONLY" : "NO_TEXT_CONTENT",
    };
  }

  let inputChunks: InputChunk[] = [];
  let rawChunks: InputChunk[] = [];
  let tEmbed = Date.now();

  if (fullText && fullText.trim().length >= 10) {
    recordExtractionAttempt(true);

    logger.info("[Pipeline] Extracted text", {
      documentId,
      wordCount: extraction.wordCount || 0,
      textLength: fullText.length,
    });

    // 3) Chunk
    rawChunks = buildInputChunks(extraction, fullText, undefined, documentContext);
    inputChunks = deduplicateChunks(rawChunks);

    // 4) Embed + store
    tEmbed = Date.now();
    logger.info("[Pipeline] Chunking complete", {
      filename,
      rawChunks: rawChunks.length,
      afterDedup: inputChunks.length,
    });
    logger.info("[Pipeline] Generating embeddings", {
      documentId,
      chunkCount: inputChunks.length,
    });
    await withTimeout(
      vectorEmbeddingRuntimeService.storeDocumentEmbeddings(
        documentId,
        inputChunks,
      ),
      EMBEDDING_TIMEOUT_MS,
      "Embedding storage",
    );
    updatePeakRss();
    logger.info("[Pipeline] Embed+store complete", {
      durationMs: Date.now() - tEmbed,
      chunkCount: inputChunks.length,
      filename,
    });
    logger.info("[Pipeline] Embeddings stored successfully", {
      documentId,
      filename,
      chunks: inputChunks.length,
    });
  }

  // 5) Encrypt extracted text (blocking — must complete before marking indexed)
  await runEncryptionStep({ userId, documentId, fullText, filename });
  updatePeakRss();

  // Determine extraction method
  const isOcr = normalizedMimeType.startsWith("image/");
  let extractionMethod = "text";
  if (PDF_MIMES.includes(normalizedMimeType))
    extractionMethod = ocrUsed ? "pdf_ocr" : "pdf_text";
  else if (DOCX_MIMES.includes(normalizedMimeType)) extractionMethod = "docx";
  else if (XLSX_MIMES.includes(normalizedMimeType)) extractionMethod = "xlsx";
  else if (PPTX_MIMES.includes(normalizedMimeType)) extractionMethod = "pptx";
  else if (isOcr) extractionMethod = "ocr";

  const extractionMs = tEmbed - tExtract;
  const embeddingMs = Date.now() - tEmbed;

  recordIngestionTiming({
    extractionMs,
    embeddingMs,
    totalMs: Date.now() - tDownload,
  });

  return {
    storageDownloadMs: tExtract - tDownload,
    extractionMs,
    extractionMethod,
    ocrAttempted,
    ocrUsed,
    ocrSuccess,
    ocrOutcome,
    ocrConfidence,
    ocrPageCount,
    ocrMode,
    textQuality: textQuality.label,
    textQualityScore: textQuality.score,
    extractionWarnings,
    textLength: fullText.length,
    rawChunkCount: rawChunks.length,
    chunkCount: inputChunks.length,
    embeddingMs,
    pageCount:
      hasPagesArray(extraction) ? extraction.pageCount :
      hasSlidesArray(extraction) ? extraction.slideCount : null,
    peakRssMb: readPeakRssMb(),
    fileHash,
  };
}
