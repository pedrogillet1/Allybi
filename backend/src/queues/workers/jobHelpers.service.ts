/**
 * Job Helpers
 *
 * addDocumentJob, addDocumentJobsBulk, getQueueStats
 */

import { logger } from "../../utils/logger";
import { getFieldEncryption } from "../../services/security/fieldEncryption.service";
import { documentQueue } from "../queueConfig";
import type { ProcessDocumentJobData } from "../queueConfig";

/**
 * D-7: Encrypt sensitive fields in job data before enqueuing.
 * Encrypts `plaintextForEmbeddings` when KODA_ENCRYPT_FIELDS is enabled.
 */
function encryptJobData(data: ProcessDocumentJobData): ProcessDocumentJobData {
  if (
    process.env.KODA_ENCRYPT_FIELDS !== "true" ||
    !data.plaintextForEmbeddings
  ) {
    return data;
  }
  try {
    const fe = getFieldEncryption();
    const encrypted = fe.encryptField(data.plaintextForEmbeddings, {
      userId: data.userId,
      entityId: data.documentId,
      field: "queue",
    });
    return {
      ...data,
      plaintextForEmbeddings: undefined,
      plaintextForEmbeddingsEncrypted: encrypted,
    };
  } catch (err: any) {
    logger.warn("[DocumentQueue] Failed to encrypt job field, sending plaintext", {
      documentId: data.documentId,
      error: err?.message || String(err),
    });
    return data;
  }
}

/**
 * D-7: Decrypt sensitive fields in job data after dequeuing.
 * Restores `plaintextForEmbeddings` from its encrypted counterpart.
 */
export function decryptJobData(data: ProcessDocumentJobData): ProcessDocumentJobData {
  const encrypted = (data as any).plaintextForEmbeddingsEncrypted;
  if (!encrypted || process.env.KODA_ENCRYPT_FIELDS !== "true") {
    return data;
  }
  try {
    const fe = getFieldEncryption();
    const plaintext = fe.decryptField(encrypted, {
      userId: data.userId,
      entityId: data.documentId,
      field: "queue",
    });
    return {
      ...data,
      plaintextForEmbeddings: plaintext,
      plaintextForEmbeddingsEncrypted: undefined,
    } as ProcessDocumentJobData;
  } catch (err: any) {
    logger.warn("[DocumentQueue] Failed to decrypt job field", {
      documentId: data.documentId,
      error: err?.message || String(err),
    });
    return data;
  }
}

export async function addDocumentJob(data: ProcessDocumentJobData) {
  const safeData = encryptJobData(data);
  const job = await documentQueue.add("process-document", safeData, {
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
    data: encryptJobData(data),
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
