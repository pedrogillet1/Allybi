/**
 * Queue Configuration
 *
 * Redis connection, queue instances, and shared job type interfaces.
 */

import { Queue } from "bullmq";
import { config } from "../config/env";
import { logger } from "../utils/logger";

// ---------------------------------------------------------------------------
// Redis connection
// ---------------------------------------------------------------------------

export const getRedisConnection = () => {
  const redisUrl = process.env.REDIS_URL;

  if (redisUrl) {
    try {
      const url = new URL(redisUrl);
      return {
        host: url.hostname,
        port: parseInt(url.port) || 6379,
        password: url.password || undefined,
        tls: url.protocol === "rediss:" ? {} : undefined,
        maxRetriesPerRequest: null, // Required for BullMQ
      };
    } catch (e) {
      logger.warn(
        "[DocumentQueue] Failed to parse REDIS_URL, using config fallback",
      );
    }
  }

  return {
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    password: config.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null, // Required for BullMQ
  };
};

export const connection = getRedisConnection();

// Namespace queues by environment
export const QUEUE_PREFIX =
  process.env.QUEUE_PREFIX ||
  (process.env.NODE_ENV === "production" ? "" : "dev-");

// ---------------------------------------------------------------------------
// Queue instances
// ---------------------------------------------------------------------------

export const documentQueue = new Queue(`${QUEUE_PREFIX}document-processing`, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: {
      count: 1000,
      age: 24 * 3600,
    },
    removeOnFail: {
      count: 100,
      age: 7 * 24 * 3600,
    },
  },
});

export const previewReconciliationQueue = new Queue(
  `${QUEUE_PREFIX}preview-reconciliation`,
  {
    connection,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: {
        count: 50,
        age: 24 * 3600,
      },
      removeOnFail: {
        count: 20,
        age: 24 * 3600,
      },
    },
  },
);

export const previewGenerationQueue = new Queue(
  `${QUEUE_PREFIX}preview-generation`,
  {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
      removeOnComplete: {
        count: 500,
        age: 24 * 3600,
      },
      removeOnFail: {
        count: 100,
        age: 7 * 24 * 3600,
      },
    },
  },
);

export const stuckDocSweepQueue = new Queue(`${QUEUE_PREFIX}stuck-doc-sweep`, {
  connection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { count: 50, age: 24 * 3600 },
    removeOnFail: { count: 20, age: 24 * 3600 },
  },
});

// ---------------------------------------------------------------------------
// Job type interfaces
// ---------------------------------------------------------------------------

export interface ProcessDocumentJobData {
  documentId: string;
  userId: string;
  filename: string;
  mimeType: string;
  encryptedFilename?: string;
  thumbnailUrl?: string | null;
  priority?: "high" | "normal" | "low";
  plaintextForEmbeddings?: string;
}

export interface PreviewGenerationJobData {
  documentId: string;
  userId: string;
  filename: string;
  mimeType: string;
}
