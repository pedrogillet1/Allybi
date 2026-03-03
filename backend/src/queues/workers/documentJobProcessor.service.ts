/**
 * Document Job Processor
 *
 * Shared pipeline logic used by both the BullMQ worker and the GCP Pub/Sub HTTP worker.
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
  XLSX_MIMES,
  isImageMime,
} from "../../services/ingestion/extraction/extractionDispatch.service";
import { isPipelineSkipped } from "../../services/ingestion/pipeline/pipelineTypes";
import type { ProcessDocumentJobData } from "../queueConfig";
import type { ProgressEmitter } from "../../services/ingestion/pipeline/pipelineTypes";

/**
 * Run the same ingestion pipeline as the local BullMQ worker, but callable directly.
 * This is used by the GCP Pub/Sub HTTP worker so it can process jobs without BullMQ.
 */
export async function processDocumentJobData(
  data: ProcessDocumentJobData,
  opts?: { emitProgress?: ProgressEmitter },
): Promise<Record<string, unknown>> {
  const {
    documentId,
    userId,
    filename,
    mimeType,
    encryptedFilename,
    thumbnailUrl,
  } = data;
  const startTime = Date.now();

  const dbHost = config.DATABASE_URL?.match(/@([^:/]+)/)?.[1] || "unknown";
  logger.info("[ProcessJob] Enriching document", {
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
    logger.info("[ProcessJob] Looking up document", {
      documentId: documentId.substring(0, 8),
      filename,
    });

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
          logger.info("[ProcessJob] Document found on retry", {
            retry: i + 1,
            documentId: documentId.substring(0, 8),
          });
          break;
        }
      }
      if (!document) {
        logger.error("[ProcessJob] Document not found after retries", {
          documentId,
          filename,
        });
        throw new Error(
          `Document ${documentId} not found after retries — may have been deleted`,
        );
      }
    }

    const skipStatuses = ["enriching", "indexed", "ready", "skipped"];
    if (skipStatuses.includes(document.status)) {
      logger.info("[ProcessJob] Skipping already-processed document", {
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

    const updated = await prisma.document.updateMany({
      where: { id: documentId, status: "uploaded" },
      data: {
        status: "enriching",
        indexingState: "running",
        indexingError: null,
        indexingUpdatedAt: new Date(),
      },
    });

    if (updated.count === 0) {
      logger.info("[ProcessJob] Document already claimed by another worker", {
        documentId: documentId.substring(0, 8),
      });
      return {
        success: true,
        documentId,
        skipped: true,
        reason: "Already claimed",
      };
    }

    await emitProgress(5, "Starting background enrichment...");

    const effectiveEncryptedFilename =
      encryptedFilename || document.encryptedFilename;
    const effectiveMimeType = mimeType || document.mimeType;

    if (!effectiveMimeType) {
      throw new Error(`No mimeType available for document ${documentId}`);
    }

    const timings = await processDocumentAsync(
      documentId,
      effectiveEncryptedFilename,
      filename || document.filename || "unknown",
      effectiveMimeType,
      userId,
      thumbnailUrl || document.metadata?.thumbnailUrl || null,
    );

    // Check for content-duplicate after pipeline computes the real fileHash
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
        logger.info("[ProcessJob] Duplicate content detected", {
          documentId: documentId.substring(0, 8),
          duplicateOf: duplicate.id.substring(0, 8),
          duplicateFilename: duplicate.filename,
          fileHash: timings.fileHash.substring(0, 12),
        });
      }
    }

    const wasSkipped = isPipelineSkipped(timings);
    const skipReason = wasSkipped ? timings.skipReason : undefined;

    if (wasSkipped) {
      const keepVisibleWithoutText =
        XLSX_MIMES.includes(effectiveMimeType) ||
        isImageMime(effectiveMimeType);
      await prisma.document.update({
        where: { id: documentId },
        data: {
          status: keepVisibleWithoutText ? "ready" : "skipped",
          indexingState: keepVisibleWithoutText ? "indexed" : "failed",
          indexingError: keepVisibleWithoutText
            ? null
            : (skipReason || "No extractable content").slice(0, 500),
          indexingUpdatedAt: new Date(),
          chunksCount: 0,
          error: keepVisibleWithoutText
            ? null
            : skipReason || "No extractable content",
        },
      });

      const totalTime = Date.now() - startTime;
      logger.info("[ProcessJob] Document skipped (no content)", {
        filename,
        reason: skipReason,
        durationMs: totalTime,
      });
      if (keepVisibleWithoutText) {
        emitToUser(userId, "document-ready", {
          documentId,
          filename,
          hasPreview: false,
          hasContent: false,
        });
      } else {
        emitToUser(userId, "document-skipped", {
          documentId,
          filename,
          reason: skipReason || "No extractable content",
        });
      }
      return {
        success: true,
        documentId,
        skipped: true,
        processingTime: totalTime,
      };
    }

    if (timings.chunkCount === 0) {
      const keepVisibleWithoutText =
        XLSX_MIMES.includes(effectiveMimeType) ||
        isImageMime(effectiveMimeType);
      await prisma.document.update({
        where: { id: documentId },
        data: {
          status: keepVisibleWithoutText ? "ready" : "skipped",
          indexingState: keepVisibleWithoutText ? "indexed" : "failed",
          indexingError: keepVisibleWithoutText
            ? null
            : "No extractable text content",
          indexingUpdatedAt: new Date(),
          chunksCount: 0,
          error: keepVisibleWithoutText ? null : "No extractable text content",
        },
      });

      const totalTime = Date.now() - startTime;
      logger.info("[ProcessJob] Document skipped (0 chunks after processing)", {
        filename,
        durationMs: totalTime,
      });
      if (keepVisibleWithoutText) {
        emitToUser(userId, "document-ready", {
          documentId,
          filename,
          hasPreview: false,
          hasContent: false,
        });
      } else {
        emitToUser(userId, "document-skipped", {
          documentId,
          filename,
          reason: "No extractable content",
        });
      }
      return {
        success: true,
        documentId,
        skipped: true,
        processingTime: totalTime,
      };
    }

    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: "indexed",
        indexingState: "indexed",
        indexingError: null,
        indexingUpdatedAt: new Date(),
        chunksCount: timings.chunkCount,
      },
    });

    if (timings.pageCount && timings.pageCount > 0) {
      prisma.documentMetadata
        .upsert({
          where: { documentId },
          create: { documentId, pageCount: timings.pageCount },
          update: { pageCount: timings.pageCount },
        })
        .catch((err) =>
          logger.warn("[ProcessJob] Failed to save pageCount", {
            err: err.message,
          }),
        );
    }

    const totalTime = Date.now() - startTime;
    logger.info("[ProcessJob] Indexing complete", {
      filename,
      durationMs: totalTime,
    });

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
    prisma.documentProcessingMetrics
      .upsert({
        where: { documentId },
        create: { documentId, ...metricsData },
        update: metricsData,
      })
      .catch((err) =>
        logger.warn("[ProcessJob] Failed to persist processing metrics", {
          documentId,
          err: err.message,
        }),
      );

    prisma.ingestionEvent
      .create({
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
          embeddingProvider: "openai",
          embeddingModel:
            process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
          durationMs: totalTime,
          at: new Date(),
          meta: {
            ocrMode: timings.ocrMode,
            ocrPageCount: timings.ocrPageCount,
            textQuality: timings.textQuality,
            textQualityScore: timings.textQualityScore,
            extractionWarnings: timings.extractionWarnings.slice(0, 20),
          },
        },
      })
      .catch((err) =>
        logger.warn("[ProcessJob] Failed to log ingestion telemetry", {
          err: err.message,
        }),
      );

    return {
      success: true,
      documentId,
      processingTime: totalTime,
      chunks: timings.chunkCount,
    };
  } catch (err: any) {
    const totalTime = Date.now() - startTime;
    logger.error("[ProcessJob] Processing failed", {
      documentId,
      filename,
      durationMs: totalTime,
      error: err.message,
    });
    try {
      await prisma.document.update({
        where: { id: documentId },
        data: {
          status: "failed",
          indexingState: "failed",
          indexingError: String(
            (err.message || "Processing failed").slice(0, 500),
          ),
          indexingUpdatedAt: new Date(),
          error: (err.message || "Processing failed").slice(0, 500),
        },
      });
    } catch {}
    emitProcessingUpdate({
      userId,
      documentId,
      filename,
      status: "failed",
      progress: 100,
      stage: "failed",
      message: "Document processing failed.",
      error: String(err?.message || "Processing failed"),
    });
    emitRealtimeToUser(userId, "documents-changed", {
      documentId,
      event: "document-failed",
    });
    throw err;
  }
}
