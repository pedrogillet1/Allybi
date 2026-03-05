import type { Job } from "bullmq";
import * as fs from "fs/promises";
import * as path from "path";

import {
  startConnectorWorker,
  stopConnectorWorker,
  type ConnectorSyncJobData,
} from "../queues/connector.queue";
import {
  registerConnector,
  getConnector,
} from "../services/connectors/connectorsRegistry";
import { ConnectorIdentityMapService } from "../services/connectors/connectorIdentityMap.service";
import { GmailOAuthService } from "../services/connectors/gmail/gmailOAuth.service";
import { GmailClientService } from "../services/connectors/gmail/gmailClient.service";
import { GmailSyncService } from "../services/connectors/gmail/gmailSync.service";
import { OutlookOAuthService } from "../services/connectors/outlook/outlookOAuth.service";
import GraphClientService from "../services/connectors/outlook/graphClient.service";
import { OutlookSyncService } from "../services/connectors/outlook/outlookSync.service";
import { SlackOAuthService } from "../services/connectors/slack/slackOAuth.service";
import { SlackClientService } from "../services/connectors/slack/slackClient.service";
import { SlackSyncService } from "../services/connectors/slack/slackSync.service";

registerConnector("gmail", {
  capabilities: { oauth: true, sync: true, search: true },
  oauthService: new GmailOAuthService(),
  clientService: new GmailClientService(),
  syncService: new GmailSyncService(),
});

registerConnector("outlook", {
  capabilities: { oauth: true, sync: true, search: true },
  oauthService: new OutlookOAuthService(),
  clientService: new GraphClientService(),
  syncService: new OutlookSyncService(),
});

registerConnector("slack", {
  capabilities: { oauth: true, sync: true, search: true, realtime: true },
  oauthService: new SlackOAuthService(),
  clientService: new SlackClientService(),
  syncService: new SlackSyncService(),
});

const CURSOR_ROOT = path.resolve(
  process.cwd(),
  "storage",
  "connectors",
  "cursors",
);
const cimService = new ConnectorIdentityMapService();

async function seedFileCursorFromDb(
  userId: string,
  provider: string,
): Promise<void> {
  try {
    const dbCursor = await cimService.getSyncCursor(userId, provider as any);
    if (!dbCursor) return;

    await fs.mkdir(CURSOR_ROOT, { recursive: true });
    const filePath = path.join(CURSOR_ROOT, `${userId}.json`);
    let existing: any = { version: 1, userId, providers: {} };
    try {
      existing = JSON.parse(await fs.readFile(filePath, "utf8"));
    } catch {
      // no existing file
    }

    const parsed = JSON.parse(dbCursor);
    if (!existing.providers) existing.providers = {};
    if (!existing.providers[provider]) {
      existing.providers[provider] = parsed;
      await fs.writeFile(filePath, JSON.stringify(existing), "utf8");
    }
  } catch {
    // non-fatal: file cursor seeding is best-effort
  }
}

async function persistFileCursorToDb(
  userId: string,
  provider: string,
): Promise<void> {
  try {
    const filePath = path.join(CURSOR_ROOT, `${userId}.json`);
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const providerCursor = parsed?.providers?.[provider];
    if (providerCursor) {
      await cimService.updateSyncCursor(
        userId,
        provider as any,
        JSON.stringify(providerCursor),
      );
    }
  } catch {
    // non-fatal: cursor persistence is best-effort
  }
}

async function runJob(job: Job<ConnectorSyncJobData>): Promise<void> {
  const { provider, userId } = job.data;
  try {
    await seedFileCursorFromDb(userId, provider);

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

    await persistFileCursorToDb(userId, provider);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[ConnectorWorker] Sync job ${job.id} failed for ${provider}: ${msg}`,
    );
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
