/**
 * LLM Cost Routes
 * GET /api/admin/llm-cost
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { listLlmCalls, getLlmSummary } from '../../services/admin';

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /api/admin/llm-cost
 * Returns LLM cost summary with breakdowns
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const range = (req.query.range as string) || '7d';

    const result = await getLlmSummary(prisma, { range });

    res.json({
      ok: true,
      range: result.range,
      data: {
        v: 1,
        kpis: {
          costUsd: 0, // Would need pricing integration
          totalTokens: result.summary.tokensTotal,
          totalCalls: result.summary.calls,
          avgLatencyMs: result.summary.latencyMsP50,
          errorRate: result.summary.errorRate,
          recentErrors: 0,
        },
        summary: result.summary,
      },
      meta: {
        cache: 'miss',
        generatedAt: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || null,
      },
    });
  } catch (error) {
    console.error('[Admin] LLM cost error:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch LLM cost',
      code: 'LLM_COST_ERROR',
    });
  }
});

/**
 * GET /api/admin/llm-cost/calls
 * Returns paginated list of LLM calls
 */
router.get('/calls', async (req: Request, res: Response) => {
  try {
    const range = (req.query.range as string) || '7d';
    const limit = parseInt(req.query.limit as string) || 50;
    const cursor = req.query.cursor as string | undefined;
    const provider = req.query.provider as string | undefined;
    const model = req.query.model as string | undefined;
    const stage = req.query.stage as string | undefined;

    const result = await listLlmCalls(prisma, {
      range,
      limit,
      cursor,
      provider,
      model,
      stage,
    });

    res.json({
      ok: true,
      range: result.range,
      data: {
        v: 1,
        total: result.items.length,
        calls: result.items,
      },
      meta: {
        cache: 'miss',
        generatedAt: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || null,
      },
      ...(result.nextCursor && { nextCursor: result.nextCursor }),
    });
  } catch (error) {
    console.error('[Admin] LLM calls error:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch LLM calls',
      code: 'LLM_CALLS_ERROR',
    });
  }
});

export default router;
