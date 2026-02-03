/**
 * Reliability Routes
 * GET /api/admin/reliability
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { listErrors, listIngestionFailures, getReliabilityTimeseries } from '../../services/admin';

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /api/admin/reliability
 * Returns reliability KPIs
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const range = (req.query.range as string) || '7d';

    // Get error and failure data
    const [errorsResult, ingestionResult] = await Promise.all([
      listErrors(prisma, { range, limit: 10 }),
      listIngestionFailures(prisma, { range, limit: 10 }),
    ]);

    res.json({
      ok: true,
      range,
      data: {
        v: 1,
        kpis: {
          p50LatencyMs: null,
          p95LatencyMs: null,
          errorRate: 0,
          errorCount: errorsResult.items.length,
          totalMessages: 0,
          activeUsers: 0,
        },
        recentErrors: errorsResult.items,
        recentIngestionFailures: ingestionResult.items,
      },
      meta: {
        cache: 'miss',
        generatedAt: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || null,
      },
    });
  } catch (error) {
    console.error('[Admin] Reliability error:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch reliability metrics',
      code: 'RELIABILITY_ERROR',
    });
  }
});

/**
 * GET /api/admin/reliability/errors
 * Returns paginated list of LLM errors
 */
router.get('/errors', async (req: Request, res: Response) => {
  try {
    const range = (req.query.range as string) || '7d';
    const limit = parseInt(req.query.limit as string) || 50;
    const cursor = req.query.cursor as string | undefined;

    const result = await listErrors(prisma, { range, limit, cursor });

    res.json({
      ok: true,
      range: result.range,
      data: {
        v: 1,
        total: result.items.length,
        errors: result.items,
      },
      meta: {
        cache: 'miss',
        generatedAt: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || null,
      },
      ...(result.nextCursor && { nextCursor: result.nextCursor }),
    });
  } catch (error) {
    console.error('[Admin] Errors list error:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch errors',
      code: 'ERRORS_ERROR',
    });
  }
});

/**
 * GET /api/admin/reliability/ingestion-failures
 * Returns paginated list of ingestion failures
 */
router.get('/ingestion-failures', async (req: Request, res: Response) => {
  try {
    const range = (req.query.range as string) || '7d';
    const limit = parseInt(req.query.limit as string) || 50;
    const cursor = req.query.cursor as string | undefined;

    const result = await listIngestionFailures(prisma, { range, limit, cursor });

    res.json({
      ok: true,
      range: result.range,
      data: {
        v: 1,
        total: result.items.length,
        failures: result.items,
      },
      meta: {
        cache: 'miss',
        generatedAt: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || null,
      },
      ...(result.nextCursor && { nextCursor: result.nextCursor }),
    });
  } catch (error) {
    console.error('[Admin] Ingestion failures error:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch ingestion failures',
      code: 'INGESTION_FAILURES_ERROR',
    });
  }
});

/**
 * GET /api/admin/reliability/timeseries
 * Returns reliability timeseries data
 */
router.get('/timeseries', async (req: Request, res: Response) => {
  try {
    const range = (req.query.range as string) || '7d';
    const metric = (req.query.metric as string) || 'llm_errors';

    const result = await getReliabilityTimeseries(prisma, { range, metric });

    res.json({
      ok: true,
      range: result.range,
      data: {
        v: 1,
        metric: result.metric,
        points: result.points,
      },
      meta: {
        cache: 'miss',
        generatedAt: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || null,
      },
    });
  } catch (error) {
    console.error('[Admin] Reliability timeseries error:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch reliability timeseries',
      code: 'RELIABILITY_TIMESERIES_ERROR',
    });
  }
});

export default router;
