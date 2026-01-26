/**
 * Shared Chat Wire Utilities
 *
 * Single source of truth for:
 * - SSE headers (prevents proxy buffering)
 * - Body normalization (query/text/content + attachedFiles/attachedDocuments)
 * - SSE heartbeat (prevents proxy idle timeouts)
 *
 * Used by: chat.routes.ts, rag.routes.ts, chat.controller.ts
 */

import { Request, Response } from 'express';

export type NormalizedChatBody = {
  query: string;
  text: string;
  content: string;
  language?: string;
  attachedFiles: any[];
  attachedDocuments: any[];
  attachedDocumentId: string | null;
  researchMode?: boolean;
  regenerateMessageId?: string | null;
};

/**
 * Apply SSE headers to prevent proxy buffering.
 * Safe to call multiple times (headers are idempotent).
 */
export function applySseHeaders(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Prevent compression middleware from buffering SSE
  res.setHeader('Content-Encoding', 'identity');

  // @ts-ignore
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
}

/**
 * Normalize chat body to standard shape.
 * Accepts: query OR text OR content (all set to same value)
 * Accepts: attachedFiles OR attachedDocuments
 */
export function normalizeChatBody(req: Request): NormalizedChatBody {
  const body: any = req.body || {};

  const query =
    typeof body.query === 'string' ? body.query :
    typeof body.text === 'string' ? body.text :
    typeof body.content === 'string' ? body.content :
    '';

  const attachedFiles = Array.isArray(body.attachedFiles)
    ? body.attachedFiles
    : Array.isArray(body.attachedDocuments)
      ? body.attachedDocuments
      : [];

  const attachedDocumentId =
    typeof body.attachedDocumentId === 'string' ? body.attachedDocumentId :
    typeof body.documentId === 'string' ? body.documentId :
    null;

  return {
    ...body,
    query,
    text: query,
    content: query,
    attachedFiles,
    attachedDocuments: attachedFiles,
    attachedDocumentId,
  };
}

/**
 * SSE keepalive to prevent proxy idle timeouts (Cloudflare/nginx/heroku).
 * Sends comment frames: ": ping\n\n"
 *
 * @param res - Express response
 * @param ms - Interval in milliseconds (default 15000)
 * @returns Interval handle (clear with clearInterval on close)
 */
export function startSseHeartbeat(res: Response, ms: number = 15000): NodeJS.Timeout {
  return setInterval(() => {
    try {
      res.write(`: ping\n\n`);
      // @ts-ignore
      if (typeof res.flush === 'function') res.flush();
    } catch {
      // ignore - connection may be closed
    }
  }, ms);
}
