/**
 * Security Routes
 * GET /api/admin/security
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { getSecurity } from '../../services/admin';

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /api/admin/security
 * Returns security metrics and events
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const range = (req.query.range as string) || '7d';
    const limit = parseInt(req.query.limit as string) || 50;
    const cursor = req.query.cursor as string | undefined;

    const result = await getSecurity(prisma, { range, limit, cursor });

    res.json({
      ok: true,
      range: result.range,
      data: {
        v: 1,
        kpis: {
          totalUsers: 0, // Would need to query users table
          activeUsers: 0,
          authFailures: result.counters.failedAuth,
          rateLimitTriggers: 0, // Would need rate limit tracking
        },
        counters: result.counters,
        authEvents: result.items.filter(e =>
          e.action.toLowerCase().includes('login') ||
          e.action.toLowerCase().includes('auth')
        ),
        rateLimitEvents: [],
        adminAudit: result.items.filter(e =>
          e.action.toLowerCase().includes('admin')
        ),
      },
      meta: {
        cache: 'miss',
        generatedAt: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || null,
      },
      ...(result.nextCursor && { nextCursor: result.nextCursor }),
    });
  } catch (error) {
    console.error('[Admin] Security error:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch security metrics',
      code: 'SECURITY_ERROR',
    });
  }
});

export default router;
