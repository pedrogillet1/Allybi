import { Router, type Response } from 'express';
import { randomUUID } from 'crypto';
import prisma from '../config/database';
import cacheService from '../services/cache.service';
import DocumentRevisionStoreService from '../services/editing/documentRevisionStore.service';

const router = Router({ mergeParams: true });

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function userIdFromReq(req: any): string | null {
  return asString(req?.user?.id);
}

function buildContext(req: any): { correlationId: string; clientMessageId: string; conversationId: string } {
  const body = (req.body as Record<string, unknown> | undefined) ?? {};
  const correlationId = asString(req.headers['x-correlation-id']) || asString(body.correlationId) || randomUUID();
  const clientMessageId = asString(req.headers['x-client-message-id']) || asString(body.clientMessageId) || randomUUID();
  const conversationId =
    asString(req.headers['x-conversation-id']) || asString(body.conversationId) || `editing:${userIdFromReq(req) || 'user'}`;
  return { correlationId, clientMessageId, conversationId };
}

/**
 * POST /api/documents/:id/studio/sheets/compute
 *
 * Applies a structured compute ops list to an XLSX document (Sheets-backed when available).
 * Body: { instruction?: string, ops: Array<...> }
 */
router.post('/compute', async (req: any, res: Response): Promise<void> => {
  const userId = userIdFromReq(req);
  if (!userId) {
    res.status(401).json({ ok: false, error: 'Not authenticated.' });
    return;
  }

  const documentId = asString(req.params?.id);
  if (!documentId) {
    res.status(400).json({ ok: false, error: 'Missing document id.' });
    return;
  }

  const doc = await prisma.document.findFirst({
    where: { id: documentId, userId },
    select: { id: true, filename: true, mimeType: true },
  });
  if (!doc) {
    res.status(404).json({ ok: false, error: 'Document not found.' });
    return;
  }

  if (doc.mimeType !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    res.status(400).json({ ok: false, error: 'compute is only available for XLSX files.' });
    return;
  }

  const body = (req.body as Record<string, unknown> | undefined) ?? {};
  const instruction = asString(body.instruction) || 'Compute (structured)';
  const ops = Array.isArray(body.ops) ? body.ops : null;
  if (!ops) {
    res.status(400).json({ ok: false, error: 'Body must include ops: [...]' });
    return;
  }

  const ctx = buildContext(req);
  const store = new DocumentRevisionStoreService();

  try {
    const content = JSON.stringify({ ops });
    const created = await store.createRevision({
      documentId,
      userId,
      correlationId: ctx.correlationId,
      conversationId: ctx.conversationId,
      clientMessageId: ctx.clientMessageId,
      content,
      metadata: {
        operator: 'COMPUTE',
        instruction,
        contentFormat: 'plain',
      },
    });

    // Invalidate the cached document buffer so the frontend serves the fresh file
    await cacheService.del(`document_buffer:${documentId}`);

    res.json({ ok: true, data: { revisionId: created.revisionId } });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || 'Compute failed.' });
  }
});

export default router;

