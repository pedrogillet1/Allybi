import { Queue, Worker, type Job } from "bullmq";

import { config } from "../config/env";

export interface ConnectorSyncJobData {
  userId: string;
  provider: "gmail" | "outlook" | "slack";
  cursor: string | null;
  forceResync?: boolean;
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
      // fall through
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

export const connectorQueue = new Queue<ConnectorSyncJobData>(
  `${prefix}connector-sync`,
  {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: { count: 1000, age: 24 * 3600 },
      removeOnFail: { count: 200, age: 7 * 24 * 3600 },
    },
  },
);

let connectorWorker: Worker<ConnectorSyncJobData> | null = null;

export async function addConnectorSyncJob(data: ConnectorSyncJobData) {
  return connectorQueue.add("connector-sync", data, {
    jobId: `connector:${data.provider}:${data.userId}:${Date.now()}`,
  });
}

export async function enqueueConnectorSync(data: ConnectorSyncJobData) {
  return addConnectorSyncJob(data);
}

export function startConnectorWorker(
  handler: (job: Job<ConnectorSyncJobData>) => Promise<void>,
): void {
  if (connectorWorker) return;

  connectorWorker = new Worker<ConnectorSyncJobData>(
    `${prefix}connector-sync`,
    async (job) => handler(job),
    {
      connection,
      concurrency: Number(process.env.CONNECTOR_WORKER_CONCURRENCY || 5),
      lockDuration: 300_000,
      stalledInterval: 60_000,
      maxStalledCount: 2,
    },
  );

  connectorWorker.on("ready", () => {
    console.log("[ConnectorWorker] Worker READY and listening for jobs");
  });
  connectorWorker.on("completed", (job) => {
    console.log(`[ConnectorWorker] Job ${job.id} COMPLETED`);
  });
  connectorWorker.on("failed", (job, err) => {
    console.error(`[ConnectorWorker] Job ${job?.id} FAILED: ${err.message}`);
  });
  connectorWorker.on("error", (err) => {
    console.error(`[ConnectorWorker] Worker ERROR: ${String(err)}`);
  });
}

export async function stopConnectorWorker(): Promise<void> {
  if (!connectorWorker) return;
  await connectorWorker.close();
  connectorWorker = null;
}

export async function getConnectorQueueStats() {
  const [waiting, active, completed, failed] = await Promise.all([
    connectorQueue.getWaitingCount(),
    connectorQueue.getActiveCount(),
    connectorQueue.getCompletedCount(),
    connectorQueue.getFailedCount(),
  ]);

  return { waiting, active, completed, failed };
}
