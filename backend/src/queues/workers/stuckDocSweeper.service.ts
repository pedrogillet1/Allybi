/**
 * Stuck Document Sweeper
 *
 * Runs periodically, re-enqueues documents stuck in 'uploaded' or 'enriching'.
 * Uses DocumentStateManager.resetToUploadedOrFail() so that documents exceeding
 * max sweep resets are permanently failed instead of infinitely re-enqueued.
 */

import { Worker, Job } from "bullmq";
import prisma from "../../config/database";
import { config } from "../../config/env";
import { logger } from "../../utils/logger";
import {
  isPubSubAvailable,
  publishExtractFanoutJobsBulk,
} from "../../services/jobs/pubsubPublisher.service";
import { documentStateManager } from "../../services/documents/documentStateManager.service";
import { connection, QUEUE_PREFIX, documentQueue, stuckDocSweepQueue } from "../queueConfig";
import { addDocumentJob } from "./jobHelpers.service";
import { safeParseInt } from "../../utils/safeParseInt";

let stuckDocSweepWorker: Worker | null = null;

const SWEEP_INTERVAL_MS = safeParseInt(process.env.SWEEP_INTERVAL_MS, 60000);
const UPLOADED_STUCK_THRESHOLD_MS = safeParseInt(process.env.UPLOADED_STUCK_THRESHOLD_MS, 120000);
const ENRICHING_STUCK_THRESHOLD_MS = safeParseInt(process.env.ENRICHING_STUCK_THRESHOLD_MS, 480000);
const SWEEP_BATCH_LIMIT = safeParseInt(process.env.SWEEP_BATCH_LIMIT, 50);

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

      // -----------------------------------------------------------------------
      // Reset enriching docs via DocumentStateManager (with sweep cap)
      // -----------------------------------------------------------------------
      const permanentlyFailed: string[] = [];
      const resetDocs: typeof stuckEnriching = [];
      const transitionFailures: string[] = [];

      for (const doc of stuckEnriching) {
        const result = await documentStateManager.resetToUploadedOrFail(doc.id);
        if (!result.success) {
          transitionFailures.push(doc.id);
          logger.warn("[StuckDocSweeper] Failed to reset stuck document", {
            documentId: doc.id,
            reason: result.reason,
          });
          continue;
        }

        if (result.toStatus === "failed") {
          permanentlyFailed.push(doc.id);
          // Log DLQ event
          prisma.ingestionEvent
            .create({
              data: {
                userId: doc.userId,
                documentId: doc.id,
                filename: doc.filename || "unknown",
                mimeType: doc.mimeType || "unknown",
                status: "dlq",
                errorCode: "SWEEP_RESET_LIMIT",
                at: new Date(),
              },
            })
            .catch((e: any) =>
              logger.warn("[StuckDocSweeper] DLQ event failed", {
                error: e.message,
              }),
            );
        } else if (result.toStatus === "uploaded") {
          resetDocs.push(doc);
        } else {
          transitionFailures.push(doc.id);
          logger.warn("[StuckDocSweeper] Unexpected reset target status", {
            documentId: doc.id,
            toStatus: result.toStatus,
          });
        }
      }

      if (permanentlyFailed.length > 0) {
        logger.warn("[StuckDocSweeper] Permanently failed documents", {
          count: permanentlyFailed.length,
          documentIds: permanentlyFailed.map((id) => id.substring(0, 8)),
        });
      }

      // Only re-enqueue uploaded + successfully-reset docs (not permanently failed)
      const allStuck = [...stuckUploaded, ...resetDocs];
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
        found: allStuck.length + permanentlyFailed.length,
        stuckUploaded: stuckUploaded.length,
        stuckEnriching: stuckEnriching.length,
        permanentlyFailed: permanentlyFailed.length,
        transitionFailures: transitionFailures.length,
        requeued,
      });

      return {
        found:
          allStuck.length + permanentlyFailed.length + transitionFailures.length,
        requeued,
        permanentlyFailed: permanentlyFailed.length,
        transitionFailures: transitionFailures.length,
      };
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
