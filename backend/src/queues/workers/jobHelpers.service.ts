/**
 * Job Helpers
 *
 * addDocumentJob, addDocumentJobsBulk, getQueueStats
 */

import { logger } from "../../utils/logger";
import { documentQueue } from "../queueConfig";
import type { ProcessDocumentJobData } from "../queueConfig";

export async function addDocumentJob(data: ProcessDocumentJobData) {
  const job = await documentQueue.add("process-document", data, {
    jobId: `doc-${data.documentId}`, // Prevents duplicate jobs for same doc
  });
  logger.info("[DocumentQueue] Added job", {
    jobId: job.id,
    documentId: data.documentId,
  });
  return job;
}

/**
 * Bulk-enqueue documents with batching to prevent event loop stalls.
 */
export async function addDocumentJobsBulk(items: ProcessDocumentJobData[]) {
  if (items.length === 0) return [];

  const batchSize = Number(process.env.JOB_BULK_ENQUEUE_BATCH ?? 50);
  const sleepMs = Number(process.env.JOB_BULK_ENQUEUE_SLEEP_MS ?? 25);

  const bulkJobs = items.map((data) => ({
    name: "process-document" as const,
    data,
    opts: {
      jobId: `doc-${data.documentId}`,
    },
  }));

  const allJobs: any[] = [];

  for (let i = 0; i < bulkJobs.length; i += batchSize) {
    const batch = bulkJobs.slice(i, i + batchSize);
    const jobs = await documentQueue.addBulk(batch);
    allJobs.push(...jobs);

    if (i + batchSize < bulkJobs.length && sleepMs > 0) {
      await new Promise((r) => setTimeout(r, sleepMs));
    }
  }

  logger.info("[DocumentQueue] Bulk added jobs", {
    count: allJobs.length,
    batches: Math.ceil(bulkJobs.length / batchSize),
  });
  return allJobs;
}

export async function getQueueStats() {
  const [waiting, active, completed, failed] = await Promise.all([
    documentQueue.getWaitingCount(),
    documentQueue.getActiveCount(),
    documentQueue.getCompletedCount(),
    documentQueue.getFailedCount(),
  ]);

  return { waiting, active, completed, failed };
}
