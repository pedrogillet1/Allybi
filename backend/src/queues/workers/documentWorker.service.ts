/**
 * Document Worker Service
 *
 * BullMQ worker that processes document ingestion jobs.
 */

import { Worker, Job } from "bullmq";
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
import {
  generatePreviewPdf,
  needsPreviewPdfGeneration,
} from "../../services/preview/previewPdfGenerator.service";
import { connection, QUEUE_PREFIX } from "../queueConfig";
import type { ProcessDocumentJobData } from "../queueConfig";

let worker: Worker | null = null;

export function startDocumentWorker() {
  if (worker) {
    logger.info("[DocumentQueue] Worker already running");
    return;
  }

  const concurrency = config.WORKER_CONCURRENCY;
  logger.info("[DocumentQueue] Starting worker", { concurrency });

  worker = new Worker(
    `${QUEUE_PREFIX}document-processing`,
    async (job: Job<ProcessDocumentJobData>) => {
      const {
        documentId,
        userId,
        filename,
        mimeType,
        encryptedFilename,
        thumbnailUrl,
      } = job.data;
      const startTime = Date.now();

      const dbHost = config.DATABASE_URL?.match(/@([^:/]+)/)?.[1] || "unknown";
      logger.info("[Worker] Enriching document", {
        filename,
        documentId: documentId.substring(0, 8),
        dbHost,
      });

      const progressOptions = {
        documentId,
        userId,
        filename,
      };

      try {
        logger.info("[Worker] Looking up document", {
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
              logger.info("[Worker] Document found on retry", {
                retry: i + 1,
                documentId: documentId.substring(0, 8),
              });
              break;
            }
          }
          if (!document) {
            logger.error("[Worker] Document not found after retries", {
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
          logger.info("[Worker] Skipping already-processed document", {
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
          data: { status: "enriching" },
        });

        if (updated.count === 0) {
          logger.info("[Worker] Document already claimed by another worker", {
            documentId: documentId.substring(0, 8),
          });
          return {
            success: true,
            documentId,
            skipped: true,
            reason: "Already claimed",
          };
        }

        job.updateProgress(5).catch(() => {});
        documentProgressService
          .emitCustomProgress(
            5,
            "Starting background enrichment...",
            progressOptions,
          )
          .catch(() => {});

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
              chunksCount: 0,
              error: skipReason || "No extractable content",
            },
          });

          const totalTime = Date.now() - startTime;
          logger.info("[Worker] Document skipped (no content)", {
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
              reason: skipReason,
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
              chunksCount: 0,
              error: "No extractable text content",
            },
          });

          const totalTime = Date.now() - startTime;
          logger.info("[Worker] Document skipped (0 chunks after processing)", {
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
              logger.warn("[Worker] Failed to save pageCount", {
                err: err.message,
              }),
            );
        }

        const totalTime = Date.now() - startTime;
        logger.info("[Worker] Indexing complete", {
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
            logger.warn("[Worker] Failed to persist metrics", {
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
            logger.warn("[Worker] Failed to log ingestion telemetry", {
              err: err.message,
            }),
          );

        emitToUser(userId, "document-indexed", { documentId, filename });

        if (needsPreviewPdfGeneration(effectiveMimeType)) {
          logger.info("[Worker] Queueing background preview generation", {
            filename,
          });
          generatePreviewPdf(documentId, userId)
            .then((result) => {
              prisma.document
                .update({
                  where: { id: documentId },
                  data: { status: "ready" },
                })
                .then(() => {
                  emitToUser(userId, "document-ready", {
                    documentId,
                    filename,
                    hasPreview: result.success,
                  });
                })
                .catch((err) =>
                  logger.warn("[Worker] Failed to set ready status", {
                    err: err.message,
                  }),
                );
            })
            .catch((err) => {
              logger.warn("[Worker] Preview failed, document stays indexed", {
                filename,
                error: err.message,
              });
              emitToUser(userId, "document-ready", {
                documentId,
                filename,
                hasPreview: false,
              });
            });
        } else {
          await prisma.document.update({
            where: { id: documentId },
            data: { status: "ready" },
          });
          emitToUser(userId, "document-ready", { documentId, filename });
        }

        return { success: true, documentId, processingTime: totalTime };
      } catch (error: any) {
        logger.error("[Worker] Enrichment failed", {
          filename,
          error: error.message,
        });

        try {
          await prisma.document.update({
            where: { id: documentId },
            data: {
              status: "failed",
              error: error.message || "Enrichment failed",
            },
          });
        } catch (updateErr: any) {
          logger.warn(
            "[Worker] Could not mark document as failed (may be deleted)",
            { documentId, err: updateErr.message },
          );
        }

        const failData = {
          uploadStartedAt: new Date(startTime),
          processingStartedAt: new Date(startTime),
          processingCompletedAt: new Date(),
          processingDuration: Date.now() - startTime,
          processingFailed: true,
          processingError: (error.message || "Unknown error").slice(0, 500),
        };
        prisma.documentProcessingMetrics
          .upsert({
            where: { documentId },
            create: { documentId, ...failData },
            update: failData,
          })
          .catch((err) =>
            logger.warn("[Worker] Failed to persist failure metrics", {
              err: err.message,
            }),
          );

        prisma.ingestionEvent
          .create({
            data: {
              userId,
              documentId,
              filename: filename || "unknown",
              mimeType: mimeType || "unknown",
              status: "fail",
              errorCode: String(error.code || error.name || "UNKNOWN").slice(
                0,
                50,
              ),
              extractionMethod: "unknown",
              durationMs: Date.now() - startTime,
              at: new Date(),
            },
          })
          .catch((err) =>
            logger.warn("[Worker] Failed to log ingestion telemetry", {
              err: err.message,
            }),
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
    },
    {
      connection,
      concurrency,
      limiter: {
        max: 100,
        duration: 1000,
      },
      lockDuration: 300000,
      stalledInterval: 60000,
      maxStalledCount: 2,
    },
  );

  worker.on("ready", () => {
    logger.info("[DocumentQueue] Worker READY and listening for jobs");
  });

  worker.on("active", (job) => {
    logger.debug("[DocumentQueue] Job active", { jobId: job.id, filename: job.data?.filename });
  });

  worker.on("completed", (job) => {
    logger.debug("[DocumentQueue] Job completed", { jobId: job.id });
  });

  worker.on("failed", (job, err) => {
    logger.error("[DocumentQueue] Job failed", {
      jobId: job?.id,
      error: err.message,
    });
  });

  worker.on("error", (err) => {
    logger.error("[DocumentQueue] Worker error", { error: String(err) });
  });

  logger.info("[DocumentQueue] Worker started");
}

export function stopDocumentWorker() {
  if (worker) {
    worker.close();
    worker = null;
    logger.info("[DocumentQueue] Worker stopped");
  }
}
