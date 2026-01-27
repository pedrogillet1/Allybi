import type { Request, Response, NextFunction } from 'express';

type UUID = string;

export type Attachment =
  | {
      type: 'source_buttons';
      answerMode?: string;
      buttons: Array<{
        documentId: string;
        title: string;
        filename?: string;
        mimeType?: string;
        location?: { type: 'page' | 'slide' | 'sheet' | 'cell' | 'section'; value: string | number; label?: string };
      }>;
      seeAll?: { label: string; totalCount: number; remainingCount: number };
    }
  | {
      type: 'file_list';
      items: Array<{ id: string; filename: string; mimeType?: string; folderPath?: string }>;
      totalCount: number;
      seeAll?: { label: string; totalCount: number; remainingCount: number };
    }
  | { type: 'select_file'; prompt: string; options: any[] }
  | { type: 'grouped_files'; groups: any[]; totalCount: number }
  | Record<string, any>;

export interface ComposedResponse {
  content: string;
  attachments?: Attachment[];
  language?: 'en' | 'pt' | 'es';
  meta?: Record<string, any>;
}

type RagStreamEvent =
  | { type: 'delta'; delta: string }
  | { type: 'meta'; meta: Record<string, any> }
  | { type: 'attachments'; attachments: Attachment[] }
  | { type: 'final'; response: ComposedResponse }
  | { type: 'error'; error: string; code?: string };

export interface KodaOrchestratorService {
  ragQuery(args: {
    userId: string;
    conversationId?: UUID;
    query: string;
    locale?: string;
    ui?: { client: 'web' | 'mobile'; timezone?: string };
    options?: Record<string, any>;
    abortSignal?: AbortSignal;
  }): Promise<ComposedResponse>;

  ragQueryStream?(args: {
    userId: string;
    conversationId?: UUID;
    query: string;
    locale?: string;
    ui?: { client: 'web' | 'mobile'; timezone?: string };
    options?: Record<string, any>;
    abortSignal?: AbortSignal;
  }): AsyncIterable<RagStreamEvent>;
}

function getOrchestrator(req: Request): KodaOrchestratorService {
  const svc =
    (req.app.locals?.services?.core?.kodaOrchestrator as KodaOrchestratorService | undefined) ||
    (req.app.locals?.services?.core?.orchestrator as KodaOrchestratorService | undefined) ||
    (req.app.locals?.kodaOrchestrator as KodaOrchestratorService | undefined);

  if (!svc) {
    const err = new Error('Koda orchestrator not available (container wiring missing).');
    // @ts-expect-error
    err.statusCode = 503;
    throw err;
  }
  return svc;
}

function getUserId(req: Request): string {
  const anyReq = req as any;
  const userId = anyReq.user?.id || anyReq.user?.userId || anyReq.auth?.userId || anyReq.userId;
  if (!userId || typeof userId !== 'string') {
    const err = new Error('Unauthorized (missing user id).');
    // @ts-expect-error
    err.statusCode = 401;
    throw err;
  }
  return userId;
}

function readString(v: unknown, maxLen: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  if (!s) return undefined;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function sseInit(res: Response) {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
}

function sseSend(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export class RagController {
  query = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orchestrator = getOrchestrator(req);
      const userId = getUserId(req);

      const query = readString(req.body?.query ?? req.body?.q ?? req.body?.message, 4000);
      if (!query) return res.status(400).json({ error: 'Missing "query".' });

      const conversationId = readString(req.body?.conversationId ?? req.body?.conversation_id, 120);
      const locale = readString(req.body?.locale, 12) ?? (req.headers['accept-language'] as string | undefined);

      const options =
        typeof req.body?.options === 'object' && req.body?.options
          ? req.body.options
          : ({} as Record<string, any>);

      const abort = new AbortController();
      req.on('close', () => abort.abort());

      const response = await orchestrator.ragQuery({
        userId,
        conversationId,
        query,
        locale,
        ui: { client: 'web' },
        options,
        abortSignal: abort.signal,
      });

      res.json(response);
    } catch (err) {
      next(err);
    }
  };

  stream = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orchestrator = getOrchestrator(req);
      const userId = getUserId(req);

      const query = readString(req.body?.query ?? req.body?.q ?? req.body?.message, 4000);
      if (!query) return res.status(400).json({ error: 'Missing "query".' });

      const conversationId = readString(req.body?.conversationId ?? req.body?.conversation_id, 120);
      const locale = readString(req.body?.locale, 12) ?? (req.headers['accept-language'] as string | undefined);

      const options =
        typeof req.body?.options === 'object' && req.body?.options
          ? req.body.options
          : ({} as Record<string, any>);

      if (!orchestrator.ragQueryStream) {
        const response = await orchestrator.ragQuery({
          userId,
          conversationId,
          query,
          locale,
          ui: { client: 'web' },
          options,
        });
        return res.json(response);
      }

      sseInit(res);

      const abort = new AbortController();
      const onClose = () => abort.abort();
      req.on('close', onClose);

      sseSend(res, 'ready', { ok: true });

      try {
        for await (const ev of orchestrator.ragQueryStream({
          userId,
          conversationId,
          query,
          locale,
          ui: { client: 'web' },
          options,
          abortSignal: abort.signal,
        })) {
          if (abort.signal.aborted) break;

          switch (ev.type) {
            case 'delta':
              sseSend(res, 'delta', { delta: ev.delta });
              break;
            case 'meta':
              sseSend(res, 'meta', ev.meta);
              break;
            case 'attachments':
              sseSend(res, 'attachments', { attachments: ev.attachments });
              break;
            case 'final':
              sseSend(res, 'final', ev.response);
              break;
            case 'error':
              sseSend(res, 'error', { error: ev.error, code: ev.code });
              break;
            default:
              break;
          }
        }
      } catch (e: any) {
        sseSend(res, 'error', { error: e?.message || 'Stream failed.' });
      } finally {
        req.off('close', onClose);
        res.end();
      }
    } catch (err) {
      next(err);
    }
  };
}

export const ragController = new RagController();
