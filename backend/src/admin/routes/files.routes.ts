/**
 * Files Routes
 * GET /api/admin/files
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { listFiles, getFileDetail } from '../../services/admin';

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /api/admin/files
 * Returns paginated list of files with ingestion stats
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const range = (req.query.range as string) || '7d';
    const limit = parseInt(req.query.limit as string) || 50;
    const cursor = req.query.cursor as string | undefined;

    const result = await listFiles(prisma, { range, limit, cursor });

    res.json({
      ok: true,
      range: result.range,
      data: {
        v: 1,
        total: result.items.length,
        files: result.items,
      },
      meta: {
        cache: 'miss',
        generatedAt: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || null,
      },
      ...(result.nextCursor && { nextCursor: result.nextCursor }),
    });
  } catch (error) {
    console.error('[Admin] Files list error:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch files',
      code: 'FILES_ERROR',
    });
  }
});

/**
 * GET /api/admin/files/:fileId
 * Returns detailed stats for a specific file
 */
router.get('/:fileId', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    const range = (req.query.range as string) || '7d';

    const result = await getFileDetail(prisma, { fileId, range });

    res.json({
      ok: true,
      range: result.range,
      data: {
        v: 1,
        events: result.events,
        stats: result.stats,
      },
      meta: {
        cache: 'miss',
        generatedAt: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || null,
      },
    });
  } catch (error) {
    console.error('[Admin] File detail error:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch file detail',
      code: 'FILE_DETAIL_ERROR',
    });
  }
});

export default router;
