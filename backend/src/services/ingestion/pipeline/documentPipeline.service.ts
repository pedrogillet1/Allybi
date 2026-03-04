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
import vectorEmbeddingService from "../../retrieval/vectorEmbedding.service";
import { extractText, PDF_MIMES, DOCX_MIMES, XLSX_MIMES, PPTX_MIMES } from "../extraction/extractionDispatch.service";
import { isSkipped } from "../extraction/extractionResult.types";
import type { DispatchedExtractionResult } from "../extraction/extractionResult.types";
import { buildInputChunks, deduplicateChunks } from "./chunkAssembly.service";
import { clamp01, deriveTextQuality } from "./textQuality.service";
import { runEncryptionStep } from "./encryptionStep.service";
import fileValidator from "../fileValidator.service";
import type { PipelineTimings, InputChunk } from "./pipelineTypes";
import { recordIngestionTiming, recordExtractionAttempt } from "./pipelineMetrics.service";

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

  // 1) Download from storage (with memory backpressure)
  await waitForMemory();
  const tDownload = Date.now();
  logger.info("[Pipeline] Downloading from storage", {
    documentId,
    key: encryptedFilename,
  });
  const fileBuffer = await storageDownloadLimit(() =>
    downloadFile(encryptedFilename),
  );
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
      ocrUsed: false,
      ocrSuccess: false,
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
      fileHash,
      skipped: true,
      skipReason: `${headerCheck.errorCode}: ${headerCheck.error}`,
      skipCode: headerCheck.errorCode || "FILE_INVALID",
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
  logger.info("[Pipeline] Text extraction", {
    durationMs: Date.now() - tExtract,
    filename,
  });

  const fullText = extraction.text || "";
  const wasSkipped = extraction.sourceType === "image" && isSkipped(extraction);
  const extractedOcrUsed = Boolean(
    mimeType.startsWith("image/") ||
    extraction.ocrApplied ||
    (extraction.ocrPageCount ?? 0) > 0,
  );
  const ocrConfidence = extractedOcrUsed
    ? clamp01(
        extraction.ocrConfidence ??
          (mimeType.startsWith("image/")
            ? extraction.confidence
            : null),
      )
    : null;
  const ocrPageCount = Number.isFinite(Number(extraction.ocrPageCount))
    ? Number(extraction.ocrPageCount)
    : null;
  const ocrMode =
    typeof extraction.ocrMode === "string"
      ? String(extraction.ocrMode)
      : null;
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
    PDF_MIMES.includes(mimeType) &&
    extraction.confidence !== undefined &&
    extraction.confidence < 0.5 &&
    !extractedOcrUsed
  ) {
    logger.warn("[Pipeline] Low-confidence PDF without OCR — likely scanned", {
      documentId,
      filename,
      confidence: extraction.confidence,
      textLength: fullText.length,
    });
  }

  if (!fullText || fullText.trim().length < 10) {
    recordExtractionAttempt(false);

    const skipReason = wasSkipped
      ? (extraction as any).skipReason
      : "No extractable text content";

    logger.info("[Pipeline] File skipped, no usable content", {
      documentId,
      filename,
      reason: skipReason,
    });

    return {
      storageDownloadMs: tExtract - tDownload,
      extractionMs: Date.now() - tExtract,
      extractionMethod: mimeType.startsWith("image/") ? "ocr" : "text",
      ocrUsed: extractedOcrUsed,
      ocrSuccess: false,
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
      vectorEmbeddingService.storeDocumentEmbeddings(
        documentId,
        inputChunks,
      ),
      EMBEDDING_TIMEOUT_MS,
      "Embedding storage",
    );
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

  // Determine extraction method
  const isOcr = mimeType.startsWith("image/");
  let extractionMethod = "text";
  if (PDF_MIMES.includes(mimeType))
    extractionMethod = extractedOcrUsed ? "pdf_ocr" : "pdf_text";
  else if (DOCX_MIMES.includes(mimeType)) extractionMethod = "docx";
  else if (XLSX_MIMES.includes(mimeType)) extractionMethod = "xlsx";
  else if (PPTX_MIMES.includes(mimeType)) extractionMethod = "pptx";
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
    ocrUsed: extractedOcrUsed,
    ocrSuccess: extractedOcrUsed ? fullText.trim().length > 0 : false,
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
      (extraction as any).pageCount ?? (extraction as any).slideCount ?? null,
    fileHash,
  };
}
