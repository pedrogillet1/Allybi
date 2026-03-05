import type { Job } from "bullmq";

import {
  startConnectorWorker,
  stopConnectorWorker,
  type ConnectorSyncJobData,
} from "../queues/connector.queue";
import { getConnector } from "../services/connectors/connectorsRegistry";
import { registerDefaultConnectors } from "../services/connectors/registerDefaultConnectors";
import { logger } from "../utils/logger";

registerDefaultConnectors();

async function runJob(job: Job<ConnectorSyncJobData>): Promise<void> {
  const { provider, userId } = job.data;
  try {
    const module = await getConnector(provider);
    const syncService = module.syncService as
      | {
          sync?: (input: any) => Promise<any>;
          runSync?: (input: any) => Promise<any>;
        }
      | undefined;

    const fn = syncService?.sync || syncService?.runSync;
    if (!fn) {
      throw new Error(
        `Sync service not available for provider ${provider}`,
      );
    }

    await fn.call(syncService, {
      userId,
      forceResync: job.data.forceResync,
      correlationId: `connector-worker:${job.id}`,
      conversationId: `connector-worker:${userId}`,
      clientMessageId: String(job.id || Date.now()),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[ConnectorWorker] Sync job failed", {
      jobId: job.id,
      provider,
      userId,
      error: msg,
    });
    throw err;
  }
}

export function startWorker(): void {
  startConnectorWorker(runJob);
}

export async function stopWorker(): Promise<void> {
  await stopConnectorWorker();
}

if (require.main === module) {
  startWorker();

  const shutdown = async () => {
    await stopWorker();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
