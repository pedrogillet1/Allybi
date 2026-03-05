/**
 * Document Ingestion Pipeline
 *
 * Single shared pipeline function used by both:
 * - BullMQ document worker (documentWorker.service.ts)
 * - GCP Pub/Sub HTTP worker (documentJobProcessor.service.ts)
 *
 * All status transitions go through DocumentStateManager for consistency.
 */

import prisma from "../../config/database";
import { config } from "../../config/env";
import { logger } from "../../utils/logger";
import { emitRealtimeToUser } from "../../services/realtime/socketGateway.service";
import { processDocumentAsync } from "../../services/ingestion/pipeline/documentPipeline.service";
import {
  emitToUser,
  emitProcessingUpdate,
  documentProgressService,
} from "../../services/ingestion/progress/documentProgress.service";
import {
  isMimeTypeSupportedForExtraction,
} from "../../services/ingestion/extraction/extractionDispatch.service";
import { isPipelineSkipped } from "../../services/ingestion/pipeline/pipelineTypes";
import {
  generatePreviewPdf,
  needsPreviewPdfGeneration,
} from "../../services/preview/previewPdfGenerator.service";
import {
  documentStateManager,
  type TransitionResult,
} from "../../services/documents/documentStateManager.service";
import type { ProcessDocumentJobData } from "../queueConfig";
import type { ProgressEmitter } from "../../services/ingestion/pipeline/pipelineTypes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

async function persistWithRetry(
  label: string,
  fn: () => Promise<unknown>,
  retries = 1,
  failClosed = false,
): Promise<void> {
  let finalError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await fn();
      return;
    } catch (err: any) {
      finalError =
        err instanceof Error ? err : new Error(err?.message || String(err));
      if (attempt < retries) {
        logger.warn(`[IngestionPipeline] ${label} failed, retrying`, {
          attempt: attempt + 1,
          error: finalError.message,
        });
        await new Promise((r) => setTimeout(r, 500));
      } else {
        logger.warn(`[IngestionPipeline] ${label} failed after retries`, {
          error: finalError.message,
        });
      }
    }
  }
  if (failClosed) {
    throw new Error(
      `[IngestionPipeline] ${label} failed after retries: ${finalError?.message || "unknown error"}`,
    );
  }
}

async function awaitWithTimeout(
  label: string,
  task: Promise<void>,
  timeoutMs: number,
): Promise<void> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    await task;
    return;
  }

  let timer: NodeJS.Timeout | null = null;
  try {
    await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } catch (err: any) {
    logger.warn(`[IngestionPipeline] ${label} not fully persisted`, {
      error: err?.message || String(err),
      timeoutMs,
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function ensureTransitionSucceeded(
  result: TransitionResult,
  context: string,
): void {
  if (result.success) return;
  const reason = result.reason || "unknown transition failure";
  throw new Error(
    `[IngestionPipeline] State transition failed during ${context}: ${reason}`,
  );
}

function toSizeBucket(sizeBytes: number | null | undefined): string | null {
  if (!Number.isFinite(sizeBytes as number) || (sizeBytes as number) < 0)
    return null;
  const value = Number(sizeBytes);
  const mb = value / (1024 * 1024);
  if (mb < 1) return "lt_1mb";
  if (mb < 10) return "1_to_10mb";
  if (mb < 50) return "10_to_50mb";
  if (mb < 200) return "50_to_200mb";
  return "gte_200mb";
}

export function resolveIngestionTelemetryFailClosed(
  rawValue: string | undefined = process.env.INGESTION_TELEMETRY_FAIL_CLOSED,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  const protectedEnv = nodeEnv === "production" || nodeEnv === "staging";
  const normalized = String(rawValue ?? (protectedEnv ? "true" : "false"))
    .trim()
    .toLowerCase();
  const enabled = normalized === "true" || normalized === "1";

  if (protectedEnv && !enabled) {
    logger.error(
      "[IngestionPipeline] INGESTION_TELEMETRY_FAIL_CLOSED=false is not allowed in production/staging; forcing fail-closed",
      { nodeEnv },
    );
    return true;
  }

  return enabled;
}

export interface IngestionPipelineOptions {
  /** Emit progress updates (e.g., BullMQ job.updateProgress) */
  emitProgress?: ProgressEmitter;
  /** Generate preview PDF and transition to ready (true for BullMQ, false for Pub/Sub) */
  handlePreviewAndReady?: boolean;
}

export interface IngestionPipelineResult {
  success: boolean;
  documentId: string;
  skipped?: boolean;
  reason?: string;
  processingTime?: number;
  chunks?: number;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export async function runDocumentIngestionPipeline(
  data: ProcessDocumentJobData,
  opts?: IngestionPipelineOptions,
): Promise<IngestionPipelineResult> {
  const {
    documentId,
    userId,
    filename,
    mimeType,
    encryptedFilename,
    thumbnailUrl,
  } = data;
  const startTime = Date.now();
  const failureTelemetryTimeoutMs = parseInt(
    process.env.INGESTION_FAILURE_TELEMETRY_TIMEOUT_MS || "3000",
    10,
  );
  const failClosedTelemetry = resolveIngestionTelemetryFailClosed();

  const dbHost = config.DATABASE_URL?.match(/@([^:/]+)/)?.[1] || "unknown";
  logger.info("[IngestionPipeline] Enriching document", {
    filename,
    documentId: documentId.substring(0, 8),
    dbHost,
  });

  const progressOptions = { documentId, userId, filename };
  const emitProgress = async (pct: number, msg: string) => {
    try {
      await opts?.emitProgress?.(pct, msg);
    } catch {}
    documentProgressService
      .emitCustomProgress(pct, msg, progressOptions)
      .catch(() => {});
  };

  try {
    // -----------------------------------------------------------------------
    // 1. Find document (with retries for replication lag)
    // -----------------------------------------------------------------------
    let document = await prisma.document.findUnique({
      where: { id: documentId },
      include: { metadata: true },
    });

    if (!document) {
      for (let i = 0; i < 8; i++) {
        const delay = Math.min(500 * (i + 1), 2000);
        await new Promise((r) => setTimeout(r, delay));
        document = await prisma.document.findUnique({
          where: { id: documentId },
          include: { metadata: true },
        });
        if (document) {
          logger.info("[IngestionPipeline] Document found on retry", {
            retry: i + 1,
            documentId: documentId.substring(0, 8),
          });
          break;
        }
      }
      if (!document) {
        logger.error("[IngestionPipeline] Document not found after retries", {
          documentId,
          filename,
        });
        throw new Error(
          `Document ${documentId} not found after retries — may have been deleted`,
        );
      }
    }

    // -----------------------------------------------------------------------
    // 2. Skip already-processed documents
    // -----------------------------------------------------------------------
    const skipStatuses = ["enriching", "indexed", "ready", "skipped"];
    if (skipStatuses.includes(document.status)) {
      logger.info("[IngestionPipeline] Skipping already-processed document", {
        documentId: documentId.substring(0, 8),
        status: document.status,
      });
      return {
        success: true,
        documentId,
        skipped: true,
        reason: `Already ${document.status}`,
      };
    }

    // -----------------------------------------------------------------------
    // 3. CAS claim via DocumentStateManager (uploaded → enriching)
    // -----------------------------------------------------------------------
    const claimResult = await documentStateManager.claimForEnrichment(documentId);
    if (!claimResult.success) {
      logger.info("[IngestionPipeline] Document already claimed by another worker", {
        documentId: documentId.substring(0, 8),
        reason: claimResult.reason,
      });
      return {
        success: true,
        documentId,
        skipped: true,
        reason: "Already claimed",
      };
    }

    await emitProgress(5, "Starting background enrichment...");

    // -----------------------------------------------------------------------
    // 4. Run the processing pipeline
    // -----------------------------------------------------------------------
    const effectiveEncryptedFilename =
      encryptedFilename || document.encryptedFilename;
    const effectiveMimeType = mimeType || document.mimeType;

    if (!effectiveMimeType) {
      throw new Error(`No mimeType available for document ${documentId}`);
    }
    if (!isMimeTypeSupportedForExtraction(effectiveMimeType)) {
      throw new Error(
        `Unsupported mimeType for ingestion: ${effectiveMimeType}`,
      );
    }

    const timings = await processDocumentAsync(
      documentId,
      effectiveEncryptedFilename,
      filename || document.filename || "unknown",
      effectiveMimeType,
      userId,
      thumbnailUrl || document.metadata?.thumbnailUrl || null,
    );

    // -----------------------------------------------------------------------
    // 5. Duplicate content detection
    // -----------------------------------------------------------------------
    if (timings.fileHash) {
      const duplicate = await prisma.document.findFirst({
        where: {
          userId,
          fileHash: timings.fileHash,
          id: { not: documentId },
          status: { in: ["indexed", "ready"] },
        },
        select: { id: true, filename: true },
      });
      if (duplicate) {
        logger.info("[IngestionPipeline] Duplicate content detected", {
          documentId: documentId.substring(0, 8),
          duplicateOf: duplicate.id.substring(0, 8),
          duplicateFilename: duplicate.filename,
          fileHash: timings.fileHash.substring(0, 12),
        });
      }
    }

    // -----------------------------------------------------------------------
    // 6. Handle skipped / zero-chunk documents
    // -----------------------------------------------------------------------
    const wasSkipped = isPipelineSkipped(timings);
    const skipReason = wasSkipped ? timings.skipReason : undefined;
    const skipCode = wasSkipped ? timings.skipCode : undefined;
    const sizeBucket = toSizeBucket(document.fileSize || null);

    if (wasSkipped || timings.chunkCount === 0) {
      const reason = skipReason || "No extractable text content";
      const transitionResult = await documentStateManager.markSkipped(
        documentId,
        reason,
      );
      ensureTransitionSucceeded(transitionResult, "markSkipped");
      emitToUser(userId, "document-skipped", {
        documentId,
        filename,
        reason,
      });

      const totalTime = Date.now() - startTime;
      logger.info("[IngestionPipeline] Document skipped", {
        filename,
        reason,
        durationMs: totalTime,
      });

      // Persist skipped ingestion telemetry (with retry)
      await persistWithRetry("Persist skipped telemetry", () =>
        prisma.ingestionEvent.create({
          data: {
            userId,
            documentId,
            filename: filename || document.filename || "unknown",
            mimeType: effectiveMimeType,
            sizeBytes: document.fileSize || null,
            status: "skipped",
            extractionMethod: timings.extractionMethod || "unknown",
            pages: timings.pageCount || null,
            ocrUsed: timings.ocrUsed || false,
            ocrConfidence: timings.ocrConfidence ?? null,
            extractedTextLength: timings.textLength || null,
            chunkCount: 0,
            durationMs: totalTime,
            at: new Date(),
            meta: {
              skipReason: reason,
              skipCode: skipCode ?? null,
              ocrAttempted: timings.ocrAttempted,
              ocrOutcome: timings.ocrOutcome,
              ocrMode: timings.ocrMode,
              ocrPageCount: timings.ocrPageCount,
              textQuality: timings.textQuality,
              extractionWarnings: timings.extractionWarnings.slice(0, 20),
              extractionWarningCodes: Array.isArray(timings.extractionWarningCodes)
                ? timings.extractionWarningCodes.slice(0, 20)
                : [],
              peakRssMb: timings.peakRssMb ?? null,
              sizeBucket,
            },
          },
        }),
      1,
      failClosedTelemetry,
    );

      return {
        success: true,
        documentId,
        skipped: true,
        processingTime: totalTime,
      };
    }

    const totalTime = Date.now() - startTime;
    logger.info("[IngestionPipeline] Ingestion payload prepared", {
      filename,
      durationMs: totalTime,
    });

    // -----------------------------------------------------------------------
    // 7. Persist processing metrics (with retry)
    // -----------------------------------------------------------------------
    const metricsData = {
      uploadStartedAt: document.createdAt,
      processingStartedAt: new Date(startTime),
      processingCompletedAt: new Date(),
      processingDuration: totalTime,
      textExtractionMethod: timings.extractionMethod,
      textExtractionSuccess: true,
      textExtractionTime: timings.extractionMs,
      textLength: timings.textLength,
      ocrUsed: timings.ocrUsed,
      ocrSuccess: timings.ocrSuccess,
      ocrConfidence: timings.ocrConfidence,
      embeddingDuration: timings.embeddingMs,
      embeddingsCreated: timings.chunkCount,
      chunksCreated: timings.chunkCount,
    };
    await persistWithRetry("Persist processing metrics", () =>
      prisma.documentProcessingMetrics.upsert({
        where: { documentId },
        create: { documentId, ...metricsData },
        update: metricsData,
      }),
      1,
      failClosedTelemetry,
    );

    // -----------------------------------------------------------------------
    // 8. Persist ingestion telemetry (with retry)
    // -----------------------------------------------------------------------
    await persistWithRetry("Persist ingestion telemetry", () =>
      prisma.ingestionEvent.create({
        data: {
          userId,
          documentId,
          filename: filename || document.filename || "unknown",
          mimeType: effectiveMimeType,
          sizeBytes: document.fileSize || null,
          status: "ok",
          extractionMethod: timings.extractionMethod || "unknown",
          pages: timings.pageCount || null,
          ocrUsed: timings.ocrUsed || false,
          ocrConfidence: timings.ocrConfidence ?? null,
          extractedTextLength: timings.textLength || null,
          chunkCount: timings.chunkCount || null,
          embeddingProvider: process.env.EMBEDDING_PROVIDER || "openai",
          embeddingModel:
            process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
          durationMs: totalTime,
          at: new Date(),
          meta: {
            ocrAttempted: timings.ocrAttempted,
            ocrOutcome: timings.ocrOutcome,
            ocrMode: timings.ocrMode,
            ocrPageCount: timings.ocrPageCount,
            textQuality: timings.textQuality,
            textQualityScore: timings.textQualityScore,
            extractionWarnings: timings.extractionWarnings.slice(0, 20),
            extractionWarningCodes: Array.isArray(timings.extractionWarningCodes)
              ? timings.extractionWarningCodes.slice(0, 20)
              : [],
            tablesDetected: (timings as any).tablesDetected ?? null,
            extractorDurationMs: (timings as any).extractorDurationMs ?? null,
            fileHash: timings.fileHash ?? null,
            peakRssMb: timings.peakRssMb ?? null,
            sizeBucket,
          },
        },
      }),
      1,
      failClosedTelemetry,
    );

    // -----------------------------------------------------------------------
    // 9. Mark indexed via DocumentStateManager
    // -----------------------------------------------------------------------
    const markIndexedResult = await documentStateManager.markIndexed(
      documentId,
      timings.chunkCount,
    );
    ensureTransitionSucceeded(markIndexedResult, "markIndexed");

    // Save pageCount metadata (best-effort)
    if (timings.pageCount && timings.pageCount > 0) {
      try {
        await prisma.documentMetadata.upsert({
          where: { documentId },
          create: { documentId, pageCount: timings.pageCount },
          update: { pageCount: timings.pageCount },
        });
      } catch (err: any) {
        logger.warn("[IngestionPipeline] Failed to save pageCount", {
          err: err.message,
        });
      }
    }

    logger.info("[IngestionPipeline] Indexing complete", {
      filename,
      durationMs: totalTime,
    });

    emitToUser(userId, "document-indexed", { documentId, filename });

    // -----------------------------------------------------------------------
    // 10. Preview generation + ready transition (BullMQ path only)
    // -----------------------------------------------------------------------
    if (opts?.handlePreviewAndReady) {
      if (needsPreviewPdfGeneration(effectiveMimeType)) {
        logger.info("[IngestionPipeline] Generating preview PDF", { filename });
        try {
          const result = await generatePreviewPdf(documentId, userId);
          const transitionResult = await documentStateManager.markReady(
            documentId,
          );
          ensureTransitionSucceeded(transitionResult, "markReady(with preview)");
          emitToUser(userId, "document-ready", {
            documentId,
            filename,
            hasPreview: result.success,
          });
        } catch (err: any) {
          logger.warn("[IngestionPipeline] Preview failed, marking ready anyway", {
            filename,
            error: err.message,
          });
          const transitionResult = await documentStateManager.markReady(
            documentId,
          );
          ensureTransitionSucceeded(
            transitionResult,
            "markReady(preview fallback)",
          );
          emitToUser(userId, "document-ready", {
            documentId,
            filename,
            hasPreview: false,
          });
        }
      } else {
        const transitionResult = await documentStateManager.markReady(documentId);
        ensureTransitionSucceeded(transitionResult, "markReady");
        emitToUser(userId, "document-ready", { documentId, filename });
      }
    }

    return {
      success: true,
      documentId,
      processingTime: totalTime,
      chunks: timings.chunkCount,
    };
  } catch (error: any) {
    const totalTime = Date.now() - startTime;
    logger.error("[IngestionPipeline] Enrichment failed", {
      filename,
      error: error.message,
      durationMs: totalTime,
    });

    // Mark as failed via DocumentStateManager
    try {
      const markFailedResult = await documentStateManager.markFailed(
        documentId,
        "enriching",
        error.message || "Enrichment failed",
      );
      if (!markFailedResult.success) {
        logger.warn("[IngestionPipeline] markFailed transition was not applied", {
          documentId,
          reason: markFailedResult.reason,
        });
      }
    } catch (updateErr: any) {
      logger.warn(
        "[IngestionPipeline] Could not mark document as failed (may be deleted)",
        { documentId, err: updateErr.message },
      );
    }

    // Persist failure metrics with bounded timeout budget.
    const failData = {
      uploadStartedAt: new Date(startTime),
      processingStartedAt: new Date(startTime),
      processingCompletedAt: new Date(),
      processingDuration: totalTime,
      processingFailed: true,
      processingError: (error.message || "Unknown error").slice(0, 500),
    };
    await awaitWithTimeout(
      "Persist failure metrics",
      persistWithRetry("Persist failure metrics", () =>
        prisma.documentProcessingMetrics.upsert({
          where: { documentId },
          create: { documentId, ...failData },
          update: failData,
        }),
        1,
        failClosedTelemetry,
      ),
      failureTelemetryTimeoutMs,
    );

    // Persist failure ingestion event with bounded timeout budget.
    await awaitWithTimeout(
      "Persist failure telemetry",
      persistWithRetry("Persist failure telemetry", () =>
        prisma.ingestionEvent.create({
          data: {
            userId,
            documentId,
            filename: filename || "unknown",
            mimeType: mimeType || "unknown",
            status: "fail",
            errorCode: String(error.code || error.name || "UNKNOWN").slice(0, 50),
            extractionMethod: "unknown",
            durationMs: totalTime,
            at: new Date(),
          },
        }),
        1,
        failClosedTelemetry,
      ),
      failureTelemetryTimeoutMs,
    );

    emitProcessingUpdate({
      userId,
      documentId,
      filename,
      status: "failed",
      progress: 100,
      stage: "failed",
      message: "Document processing failed.",
      error: String(error?.message || "Enrichment failed"),
    });
    emitRealtimeToUser(userId, "documents-changed", {
      documentId,
      event: "document-failed",
    });

    throw error;
  }
}
