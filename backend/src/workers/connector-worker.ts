import type { Job } from 'bullmq';

import { startConnectorWorker, stopConnectorWorker, type ConnectorSyncJobData } from '../queues/connector.queue';
import { registerConnector, getConnector } from '../services/connectors/connectorsRegistry';
import { GmailOAuthService } from '../services/connectors/gmail/gmailOAuth.service';
import { GmailClientService } from '../services/connectors/gmail/gmailClient.service';
import { GmailSyncService } from '../services/connectors/gmail/gmailSync.service';
import { OutlookOAuthService } from '../services/connectors/outlook/outlookOAuth.service';
import GraphClientService from '../services/connectors/outlook/graphClient.service';
import { OutlookSyncService } from '../services/connectors/outlook/outlookSync.service';
import { SlackOAuthService } from '../services/connectors/slack/slackOAuth.service';
import { SlackClientService } from '../services/connectors/slack/slackClient.service';
import { SlackSyncService } from '../services/connectors/slack/slackSync.service';

registerConnector('gmail', {
  capabilities: { oauth: true, sync: true, search: true },
  oauthService: new GmailOAuthService(),
  clientService: new GmailClientService(),
  syncService: new GmailSyncService(),
});

registerConnector('outlook', {
  capabilities: { oauth: true, sync: true, search: true },
  oauthService: new OutlookOAuthService(),
  clientService: new GraphClientService(),
  syncService: new OutlookSyncService(),
});

registerConnector('slack', {
  capabilities: { oauth: true, sync: true, search: true, realtime: true },
  oauthService: new SlackOAuthService(),
  clientService: new SlackClientService(),
  syncService: new SlackSyncService(),
});

async function runJob(job: Job<ConnectorSyncJobData>): Promise<void> {
  const module = await getConnector(job.data.provider);
  const syncService = module.syncService as { sync?: (input: any) => Promise<any>; runSync?: (input: any) => Promise<any> } | undefined;

  const fn = syncService?.sync || syncService?.runSync;
  if (!fn) {
    throw new Error(`Sync service not available for provider ${job.data.provider}`);
  }

  await fn.call(syncService, {
    userId: job.data.userId,
    forceResync: job.data.forceResync,
    correlationId: `connector-worker:${job.id}`,
    conversationId: `connector-worker:${job.data.userId}`,
    clientMessageId: String(job.id || Date.now()),
  });
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

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
