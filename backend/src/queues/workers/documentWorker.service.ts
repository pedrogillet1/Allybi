/**
 * Document Worker Service
 *
 * BullMQ worker that processes document ingestion jobs.
 * Delegates to the shared ingestion pipeline for all processing logic.
 */

import { Worker, Job } from "bullmq";
import { config } from "../../config/env";
import { logger } from "../../utils/logger";
import { connection, QUEUE_PREFIX } from "../queueConfig";
import type { ProcessDocumentJobData } from "../queueConfig";
import { runDocumentIngestionPipeline } from "./documentIngestionPipeline.service";
import { documentDlqQueue } from "../queueConfig";
import { recordDlqEntry } from "../../services/ingestion/pipeline/pipelineMetrics.service";

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
      return runDocumentIngestionPipeline(job.data, {
        emitProgress: (pct, msg) => {
          job.updateProgress(pct).catch(() => {});
        },
        handlePreviewAndReady: true,
      });
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

    // Push to DLQ when all attempts exhausted
    if (job && job.attemptsMade >= 3) {
      logger.error("[DocumentQueue] DLQ entry", {
        documentId: job.data?.documentId,
        filename: job.data?.filename,
        mimeType: job.data?.mimeType,
        attempts: job.attemptsMade,
        error: err.message,
      });
      recordDlqEntry(
        job.data?.documentId || "unknown",
        job.data?.mimeType || "unknown",
      );
      documentDlqQueue
        .add("dlq-document", {
          ...job.data,
          failedAt: new Date().toISOString(),
          error: err.message,
          attempts: job.attemptsMade,
        })
        .catch((dlqErr: any) =>
          logger.error("[DocumentQueue] Failed to add to DLQ", {
            error: dlqErr.message,
          }),
        );
    }
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
