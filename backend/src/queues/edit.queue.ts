import { Queue, Worker, type Job } from "bullmq";

import { config } from "../config/env";

export interface ReindexRevisionJobData {
  documentId: string;
  revisionId?: string;
  userId: string;
  correlationId?: string;
  conversationId?: string;
  clientMessageId?: string;
  reason?: string;
}

function buildConnection() {
  const redisUrl = process.env.REDIS_URL;

  if (redisUrl) {
    try {
      const url = new URL(redisUrl);
      return {
        host: url.hostname,
        port: Number(url.port || 6379),
        password: url.password || undefined,
        tls: url.protocol === "rediss:" ? {} : undefined,
        maxRetriesPerRequest: null,
      };
    } catch {
      // fall through to host/port config
    }
  }

  return {
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    password: config.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  };
}

const connection = buildConnection();
const prefix =
  process.env.QUEUE_PREFIX ||
  (process.env.NODE_ENV === "production" ? "" : "dev-");

const queueName = `${prefix}edit-reindex`;

export const editQueue = new Queue<ReindexRevisionJobData>(queueName, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: { count: 1000, age: 24 * 3600 },
    removeOnFail: { count: 300, age: 7 * 24 * 3600 },
  },
});

let editWorker: Worker<ReindexRevisionJobData> | null = null;

export async function addReindexRevisionJob(data: ReindexRevisionJobData) {
  const targetId = data.revisionId || data.documentId;
  return editQueue.add("reindex-revision", data, {
    jobId: `reindex:${targetId}:${Date.now()}`,
  });
}

export async function enqueueEditReindex(data: ReindexRevisionJobData) {
  return addReindexRevisionJob(data);
}

export function startEditWorker(
  handler: (job: Job<ReindexRevisionJobData>) => Promise<void>,
): void {
  if (editWorker) return;

  editWorker = new Worker<ReindexRevisionJobData>(
    queueName,
    async (job) => handler(job),
    {
      connection,
      concurrency: Number(process.env.EDIT_WORKER_CONCURRENCY || 5),
    },
  );
}

export async function stopEditWorker(): Promise<void> {
  if (!editWorker) return;
  await editWorker.close();
  editWorker = null;
}

export async function getEditQueueStats() {
  const [waiting, active, completed, failed] = await Promise.all([
    editQueue.getWaitingCount(),
    editQueue.getActiveCount(),
    editQueue.getCompletedCount(),
    editQueue.getFailedCount(),
  ]);

  return { waiting, active, completed, failed };
}
