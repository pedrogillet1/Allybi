import { Router } from 'express';

import { authMiddleware } from '../middleware/auth.middleware';
import { rateLimitMiddleware } from '../middleware/rateLimit.middleware';
import { createIntegrationsController } from '../controllers/integrations.controller';

import { registerConnector } from '../services/connectors/connectorsRegistry';
import { GmailOAuthService } from '../services/connectors/gmail/gmailOAuth.service';
import { GmailClientService } from '../services/connectors/gmail/gmailClient.service';
import { GmailSyncService } from '../services/connectors/gmail/gmailSync.service';
import { OutlookOAuthService } from '../services/connectors/outlook/outlookOAuth.service';
import GraphClientService from '../services/connectors/outlook/graphClient.service';
import { OutlookSyncService } from '../services/connectors/outlook/outlookSync.service';
import { SlackOAuthService } from '../services/connectors/slack/slackOAuth.service';
import { SlackClientService } from '../services/connectors/slack/slackClient.service';
import { SlackSyncService } from '../services/connectors/slack/slackSync.service';

const router = Router();

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

const controller = createIntegrationsController();

router.get('/:provider/start', authMiddleware, rateLimitMiddleware, (req, res) => controller.startConnect(req, res));
router.get('/:provider/callback', rateLimitMiddleware, (req, res) => controller.oauthCallback(req, res));
router.get('/status', authMiddleware, rateLimitMiddleware, (req, res) => controller.status(req, res));
router.post('/:provider/sync', authMiddleware, rateLimitMiddleware, (req, res) => controller.sync(req, res));
router.get('/:provider/search', authMiddleware, rateLimitMiddleware, (req, res) => controller.search(req, res));
router.post('/:provider/disconnect', authMiddleware, rateLimitMiddleware, (req, res) => controller.disconnect(req, res));

export default router;
