import type { Request, Response } from 'express';
import { createHmac } from 'crypto';

import { ConnectorsIngestionService } from '../connectorsIngestion.service';

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function rawBodyFromReq(req: Request): string {
  const withRaw = req as Request & { rawBody?: string | Buffer };
  if (typeof withRaw.rawBody === 'string') return withRaw.rawBody;
  if (Buffer.isBuffer(withRaw.rawBody)) return withRaw.rawBody.toString('utf8');

  // Fallback: best effort if no raw body middleware was configured.
  return JSON.stringify(req.body || {});
}

interface SlackEventPayload {
  type?: string;
  challenge?: string;
  event?: {
    type?: string;
    subtype?: string;
    user?: string;
    bot_id?: string;
    text?: string;
    channel?: string;
    ts?: string;
    thread_ts?: string;
  };
  event_id?: string;
  event_time?: number;
  team_id?: string;
  authorizations?: Array<{ user_id?: string; team_id?: string }>;
}

export class SlackEventsController {
  constructor(private readonly ingestion: ConnectorsIngestionService = new ConnectorsIngestionService()) {}

  handle = async (req: Request, res: Response): Promise<Response> => {
    if (!this.verifySlackSignature(req)) {
      return res.status(401).json({ ok: false, error: { code: 'INVALID_SLACK_SIGNATURE', message: 'Slack signature verification failed.' } });
    }

    const payload = (req.body || {}) as SlackEventPayload;

    if (payload.type === 'url_verification' && payload.challenge) {
      return res.status(200).send(payload.challenge);
    }

    if (payload.type !== 'event_callback' || !payload.event) {
      return res.status(200).json({ ok: true, ignored: true, reason: 'unsupported_event_type' });
    }

    const event = payload.event;

    // Ack early to avoid retries by Slack.
    res.status(200).json({ ok: true, accepted: true });

    if (event.type !== 'message') return res;
    if (event.subtype && ['message_changed', 'channel_join', 'channel_leave', 'message_deleted'].includes(event.subtype)) {
      return res;
    }
    if (!event.channel || !event.ts) return res;

    const userId = this.resolveUserId(req, payload);
    if (!userId) return res;

    const eventTimeMs = event.ts ? Number(event.ts) * 1000 : (payload.event_time || Date.now() / 1000) * 1000;
    const timestamp = Number.isFinite(eventTimeMs) ? new Date(eventTimeMs) : new Date();

    await this.ingestion.ingestDocuments(
      {
        userId,
        correlationId: `slack_evt_${asString(payload.event_id) || 'unknown'}`,
      },
      [
        {
          sourceType: 'slack',
          sourceId: `${event.channel}:${event.ts}`,
          title: `Slack event ${event.channel}`,
          body: asString(event.text) || '(empty message)',
          timestamp,
          actors: [event.user || event.bot_id || 'unknown'],
          labelsOrChannel: [event.channel, 'slack'],
          sourceMeta: {
            eventId: payload.event_id || null,
            teamId: payload.team_id || null,
            threadTs: event.thread_ts || null,
            subtype: event.subtype || null,
          },
        },
      ],
    );

    return res;
  };

  health = async (_req: Request, res: Response): Promise<Response> => {
    return res.status(200).json({ ok: true, service: 'slack_events', status: 'ready' });
  };

  private verifySlackSignature(req: Request): boolean {
    const signingSecret = process.env.SLACK_SIGNING_SECRET;
    if (!asString(signingSecret)) {
      // Fail closed in production if not configured.
      return process.env.NODE_ENV !== 'production';
    }

    const timestamp = asString(req.headers['x-slack-request-timestamp']);
    const signature = asString(req.headers['x-slack-signature']);
    if (!timestamp || !signature) return false;

    const timestampNum = Number(timestamp);
    if (!Number.isFinite(timestampNum)) return false;

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestampNum) > 60 * 5) {
      return false;
    }

    const rawBody = rawBodyFromReq(req);
    const basestring = `v0:${timestamp}:${rawBody}`;
    const digest = createHmac('sha256', signingSecret as string).update(basestring).digest('hex');
    const expected = `v0=${digest}`;

    return safeCompare(expected, signature);
  }

  private resolveUserId(req: Request, payload: SlackEventPayload): string | null {
    const headerUserId = asString(req.headers['x-koda-user-id']);
    if (headerUserId) return headerUserId;

    const bodyUserId = asString((req.body as Record<string, unknown>)?.userId);
    if (bodyUserId) return bodyUserId;

    const authUser = payload.authorizations?.[0]?.user_id;
    if (asString(authUser)) return authUser as string;

    return null;
  }
}

export default SlackEventsController;
