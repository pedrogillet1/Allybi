/**
 * Queries Routes
 * GET /api/admin/queries
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { listQueries } from '../../services/admin';

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /api/admin/queries
 * Returns paginated list of queries with filtering
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const range = (req.query.range as string) || '7d';
    const limit = parseInt(req.query.limit as string) || 50;
    const cursor = req.query.cursor as string | undefined;
    const domain = req.query.domain as string | undefined;
    const intent = req.query.intent as string | undefined;
    const operator = req.query.operator as string | undefined;
    const keyword = req.query.keyword as string | undefined;

    const result = await listQueries(prisma, {
      range,
      limit,
      cursor,
      domain,
      intent,
      operator,
      keyword,
    });

    res.json({
      ok: true,
      range: result.range,
      data: {
        v: 1,
        total: result.items.length,
        feed: result.items,
      },
      meta: {
        cache: 'miss',
        generatedAt: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || null,
      },
      ...(result.nextCursor && { nextCursor: result.nextCursor }),
    });
  } catch (error) {
    console.error('[Admin] Queries list error:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch queries',
      code: 'QUERIES_ERROR',
    });
  }
});

export default router;
