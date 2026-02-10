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
import SlackEventsController from '../services/connectors/slack/slackEvents.controller';
import crypto from 'crypto';
import prisma from '../config/database';

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
const slackEvents = new SlackEventsController();

function emailSendSecret(): string {
  const s =
    process.env.CONNECTOR_ACTION_SECRET ||
    process.env.KODA_ACTION_SECRET ||
    process.env.JWT_ACCESS_SECRET ||
    process.env.ENCRYPTION_KEY ||
    '';
  if (!s.trim()) throw new Error('Missing CONNECTOR_ACTION_SECRET (or JWT_ACCESS_SECRET / ENCRYPTION_KEY).');
  return s;
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function signEmailSendToken(payload: Record<string, unknown>): string {
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', emailSendSecret()).update(encoded).digest();
  const sigUrl = base64UrlEncode(sig);
  return `${encoded}.${sigUrl}`;
}

// Slack Events API (public, signature-verified). Must be mounted under /api/integrations.
router.post('/slack/events', (req, res) => slackEvents.handle(req, res));
router.get('/slack/events/health', (req, res) => slackEvents.health(req, res));

// Mint a fresh EMAIL_SEND confirmation token for interactive draft editing in the UI.
// Frontend will then call /api/chat/... with { confirmationToken } to execute the send.
router.post('/email/send-token', authMiddleware, rateLimitMiddleware, async (req: any, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ ok: false, error: { code: 'AUTH_UNAUTHORIZED', message: 'Not authenticated.' } });

  try {
    const providerRaw = String(req.body?.provider || '').toLowerCase();
    if (providerRaw !== 'gmail' && providerRaw !== 'outlook') {
      return res.status(400).json({ ok: false, error: { code: 'UNSUPPORTED_PROVIDER', message: 'Provider must be gmail or outlook.' } });
    }

    const to = String(req.body?.to || '').trim();
    if (!to) {
      return res.status(400).json({ ok: false, error: { code: 'RECIPIENT_REQUIRED', message: 'Recipient (to) is required.' } });
    }

    const subject = String(req.body?.subject || '');
    const body = String(req.body?.body || '');
    const rawIds = Array.isArray(req.body?.attachmentDocumentIds) ? req.body.attachmentDocumentIds : [];
    const ids = rawIds.filter((x: any) => typeof x === 'string' && x.trim()).map((s: string) => s.trim());

    // Limit attachments and ensure they belong to the user (and aren't connector artifacts).
    const MAX_ATTACHMENTS = 6;
    const uniqueIds: string[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      uniqueIds.push(id);
      if (uniqueIds.length >= MAX_ATTACHMENTS) break;
    }

    let verifiedIds: string[] = [];
    if (uniqueIds.length) {
      const docs = await prisma.document.findMany({
        where: {
          userId,
          id: { in: uniqueIds },
          parentVersionId: null,
          encryptedFilename: { not: { contains: '/connectors/' } },
        },
        select: { id: true },
      });
      const ok = new Set(docs.map((d: { id: string }) => d.id));
      verifiedIds = uniqueIds.filter((id) => ok.has(id));
    }

    const confirmationId = signEmailSendToken({
      v: 2,
      t: 'email_send',
      userId,
      provider: providerRaw,
      to,
      subject,
      body,
      attachmentDocumentIds: verifiedIds,
      iat: Date.now(),
      exp: Date.now() + 10 * 60 * 1000,
    });

    return res.json({
      ok: true,
      data: {
        operator: 'EMAIL_SEND',
        confirmationId,
      },
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: { code: 'TOKEN_MINT_FAILED', message: e?.message || 'Failed to create confirmation token.' } });
  }
});

router.get('/:provider/start', authMiddleware, rateLimitMiddleware, (req, res) => controller.startConnect(req, res));
router.get('/:provider/callback', rateLimitMiddleware, (req, res) => controller.oauthCallback(req, res));
router.get('/status', authMiddleware, rateLimitMiddleware, (req, res) => controller.status(req, res));
router.post('/:provider/sync', authMiddleware, rateLimitMiddleware, (req, res) => controller.sync(req, res));
router.get('/:provider/search', authMiddleware, rateLimitMiddleware, (req, res) => controller.search(req, res));
router.post('/:provider/send', authMiddleware, rateLimitMiddleware, (req, res) => controller.send(req, res));
router.post('/:provider/disconnect', authMiddleware, rateLimitMiddleware, (req, res) => controller.disconnect(req, res));

export default router;
