/**
 * Preview Workers Service
 *
 * Preview reconciliation + immediate generation workers.
 */

import { Worker, Job } from "bullmq";
import { logger } from "../../utils/logger";
import {
  generatePreviewPdf,
  reconcilePreviewJobs,
} from "../../services/preview/previewPdfGenerator.service";
import {
  connection,
  QUEUE_PREFIX,
  previewReconciliationQueue,
  previewGenerationQueue,
} from "../queueConfig";
import type { PreviewGenerationJobData } from "../queueConfig";

// ---------------------------------------------------------------------------
// Reconciliation Worker
// ---------------------------------------------------------------------------

let reconciliationWorker: Worker | null = null;
const RECONCILIATION_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export async function startPreviewReconciliationWorker() {
  if (reconciliationWorker) {
    logger.info("[PreviewReconciliation] Worker already running");
    return;
  }

  logger.info("[PreviewReconciliation] Starting reconciliation worker", {
    intervalMs: RECONCILIATION_INTERVAL_MS,
  });

  reconciliationWorker = new Worker(
    `${QUEUE_PREFIX}preview-reconciliation`,
    async (job: Job) => {
      logger.info("[PreviewReconciliation] Running scheduled reconciliation", {
        jobId: job.id,
      });
      const startTime = Date.now();

      try {
        const result = await reconcilePreviewJobs();
        const duration = Date.now() - startTime;

        logger.info("[PreviewReconciliation] Completed", {
          durationMs: duration,
          ...result,
        });

        return {
          success: true,
          ...result,
          duration,
        };
      } catch (error: any) {
        logger.error("[PreviewReconciliation] Failed", {
          error: error.message,
        });
        throw error;
      }
    },
    {
      connection,
      concurrency: 1,
    },
  );

  reconciliationWorker.on("completed", (job) => {
    logger.debug("[PreviewReconciliation] Job completed", { jobId: job.id });
  });

  reconciliationWorker.on("failed", (job, err) => {
    logger.error("[PreviewReconciliation] Job failed", {
      jobId: job?.id,
      error: err.message,
    });
  });

  await previewReconciliationQueue.add(
    "reconcile-previews",
    {},
    {
      repeat: {
        every: RECONCILIATION_INTERVAL_MS,
      },
      jobId: "preview-reconciliation-repeatable",
    },
  );

  logger.info("[PreviewReconciliation] Worker started with repeatable job");
}

export function stopPreviewReconciliationWorker() {
  if (reconciliationWorker) {
    reconciliationWorker.close();
    reconciliationWorker = null;
    logger.info("[PreviewReconciliation] Worker stopped");
  }
}

// ---------------------------------------------------------------------------
// Preview Generation Worker (Immediate)
// ---------------------------------------------------------------------------

let previewWorker: Worker | null = null;

export function startPreviewGenerationWorker() {
  if (previewWorker) {
    logger.info("[PreviewGeneration] Worker already running");
    return;
  }

  logger.info("[PreviewGeneration] Starting immediate preview worker");

  previewWorker = new Worker(
    `${QUEUE_PREFIX}preview-generation`,
    async (job: Job<PreviewGenerationJobData>) => {
      const { documentId, userId, filename, mimeType } = job.data;
      const startTime = Date.now();

      logger.info("[PreviewWorker] Processing preview", {
        filename,
        documentId: documentId.substring(0, 8),
      });

      try {
        const result = await generatePreviewPdf(documentId, userId);
        const duration = Date.now() - startTime;

        if (result.success) {
          logger.info("[PreviewWorker] Preview ready", {
            filename,
            durationMs: duration,
          });
        } else if (result.status === "skipped") {
          logger.debug(
            "[PreviewWorker] Skipped (already exists or not needed)",
            { filename },
          );
        } else {
          logger.warn("[PreviewWorker] Preview failed", {
            filename,
            error: result.error,
          });
          if (result.status !== "max_retries_exceeded") {
            throw new Error(result.error || "Preview generation failed");
          }
        }

        return { success: result.success, duration, status: result.status };
      } catch (error: any) {
        logger.error("[PreviewWorker] Error", {
          filename,
          error: error.message,
        });
        throw error;
      }
    },
    {
      connection,
      concurrency: parseInt(process.env.PREVIEW_WORKER_CONCURRENCY || "4", 10),
    },
  );

  previewWorker.on("completed", (job) => {
    logger.debug("[PreviewGeneration] Job completed", { jobId: job.id });
  });

  previewWorker.on("failed", (job, err) => {
    logger.error("[PreviewGeneration] Job failed", {
      jobId: job?.id,
      error: err.message,
    });
  });

  previewWorker.on("error", (err) => {
    logger.error("[PreviewGeneration] Worker error", { error: String(err) });
  });

  logger.info("[PreviewGeneration] Worker started");
}

export function stopPreviewGenerationWorker() {
  if (previewWorker) {
    previewWorker.close();
    previewWorker = null;
    logger.info("[PreviewGeneration] Worker stopped");
  }
}

/**
 * Add a preview generation job to the queue.
 */
export async function addPreviewGenerationJob(data: PreviewGenerationJobData) {
  const job = await previewGenerationQueue.add("generate-preview", data);

  logger.info("[PreviewQueue] Enqueued preview job", {
    jobId: job.id,
    filename: data.filename,
  });

  return job;
}
