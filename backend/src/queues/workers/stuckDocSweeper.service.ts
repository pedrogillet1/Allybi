/**
 * Stuck Document Sweeper
 *
 * Runs every minute, re-enqueues documents stuck in 'uploaded' or 'enriching'.
 */

import { Worker, Job } from "bullmq";
import prisma from "../../config/database";
import { config } from "../../config/env";
import { logger } from "../../utils/logger";
import {
  isPubSubAvailable,
  publishExtractFanoutJobsBulk,
} from "../../services/jobs/pubsubPublisher.service";
import { connection, QUEUE_PREFIX, documentQueue, stuckDocSweepQueue } from "../queueConfig";
import { addDocumentJob } from "./jobHelpers.service";

let stuckDocSweepWorker: Worker | null = null;

const SWEEP_INTERVAL_MS = 60 * 1000; // 1 minute
const UPLOADED_STUCK_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes
const ENRICHING_STUCK_THRESHOLD_MS = 8 * 60 * 1000; // 8 minutes
const SWEEP_BATCH_LIMIT = 50;

export async function startStuckDocSweeper() {
  if (stuckDocSweepWorker) {
    logger.info("[StuckDocSweeper] Already running");
    return;
  }

  logger.info("[StuckDocSweeper] Starting sweeper", {
    intervalMs: SWEEP_INTERVAL_MS,
  });

  stuckDocSweepWorker = new Worker(
    `${QUEUE_PREFIX}stuck-doc-sweep`,
    async (job: Job) => {
      const now = new Date();
      const uploadedCutoff = new Date(
        now.getTime() - UPLOADED_STUCK_THRESHOLD_MS,
      );
      const enrichingCutoff = new Date(
        now.getTime() - ENRICHING_STUCK_THRESHOLD_MS,
      );

      const stuckUploaded = await prisma.document.findMany({
        where: {
          status: "uploaded",
          updatedAt: { lt: uploadedCutoff },
        },
        select: {
          id: true,
          userId: true,
          filename: true,
          mimeType: true,
          encryptedFilename: true,
        },
        take: SWEEP_BATCH_LIMIT,
      });

      const stuckEnriching = await prisma.document.findMany({
        where: {
          status: "enriching",
          updatedAt: { lt: enrichingCutoff },
        },
        select: {
          id: true,
          userId: true,
          filename: true,
          mimeType: true,
          encryptedFilename: true,
        },
        take: SWEEP_BATCH_LIMIT - stuckUploaded.length,
      });

      if (stuckEnriching.length > 0) {
        await prisma.document.updateMany({
          where: { id: { in: stuckEnriching.map((d) => d.id) } },
          data: {
            status: "uploaded",
            indexingState: "pending",
            indexingError: null,
            indexingUpdatedAt: new Date(),
          },
        });
      }

      const allStuck = [...stuckUploaded, ...stuckEnriching];
      let requeued = 0;

      if (config.USE_GCP_WORKERS && isPubSubAvailable()) {
        try {
          const pubsubItems = allStuck.map((doc) => ({
            documentId: doc.id,
            userId: doc.userId,
            storageKey: doc.encryptedFilename || "",
            mimeType: doc.mimeType || "application/octet-stream",
            filename: doc.filename || undefined,
          }));

          const out = await publishExtractFanoutJobsBulk(pubsubItems, {
            requestId: "stuck-doc-sweeper",
            uploadSessionId: "stuck-doc-sweeper",
          });

          requeued = out.publishedDocs;
          logger.info("[StuckDocSweeper] Republished to Pub/Sub", {
            batches: out.publishedBatches,
            docs: out.publishedDocs,
          });
        } catch (err: any) {
          logger.warn("[StuckDocSweeper] Failed to republish to Pub/Sub", {
            error: err.message,
          });
        }
      } else {
        for (const doc of allStuck) {
          try {
            const existingJob = await documentQueue.getJob(`doc-${doc.id}`);
            if (existingJob) {
              const state = await existingJob.getState();
              if (
                state === "waiting" ||
                state === "active" ||
                state === "delayed"
              ) {
                logger.debug("[StuckDocSweeper] Job already queued, skipping", {
                  documentId: doc.id,
                  state,
                });
                continue;
              }
            }

            await addDocumentJob({
              documentId: doc.id,
              userId: doc.userId,
              filename: doc.filename || "unknown",
              mimeType: doc.mimeType || "application/octet-stream",
              encryptedFilename: doc.encryptedFilename || undefined,
            });
            requeued++;
          } catch (err: any) {
            logger.warn("[StuckDocSweeper] Failed to requeue", {
              documentId: doc.id,
              error: err.message,
            });
          }
        }
      }

      logger.info("[StuckDocSweeper] Sweep complete", {
        found: allStuck.length,
        stuckUploaded: stuckUploaded.length,
        stuckEnriching: stuckEnriching.length,
        requeued,
      });

      return { found: allStuck.length, requeued };
    },
    {
      connection,
      concurrency: 1,
    },
  );

  stuckDocSweepWorker.on("failed", (job, err) => {
    logger.error("[StuckDocSweeper] Job failed", {
      jobId: job?.id,
      error: err.message,
    });
  });

  await stuckDocSweepQueue.add(
    "sweep-stuck-docs",
    {},
    {
      repeat: { every: SWEEP_INTERVAL_MS },
      jobId: "stuck-doc-sweep-repeatable",
    },
  );

  logger.info("[StuckDocSweeper] Sweeper started");
}

export function stopStuckDocSweeper() {
  if (stuckDocSweepWorker) {
    stuckDocSweepWorker.close();
    stuckDocSweepWorker = null;
    logger.info("[StuckDocSweeper] Sweeper stopped");
  }
}
