/**
 * Reliability Routes
 * GET /api/admin/reliability
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { listErrors, listIngestionFailures, getReliabilityTimeseries } from '../../services/admin';
import { parseRange, normalizeRange } from '../../services/admin/_shared/rangeWindow';

const router = Router();
const prisma = new PrismaClient();

/**
 * Calculate percentile from sorted array
 */
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

/**
 * GET /api/admin/reliability
 * Returns reliability KPIs
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const range = (req.query.range as string) || '7d';
    const rangeKey = normalizeRange(range, '7d');
    const window = parseRange(rangeKey);
    const { from, to } = window;

    // Get error and failure data
    const [errorsResult, ingestionResult] = await Promise.all([
      listErrors(prisma, { range, limit: 50 }),
      listIngestionFailures(prisma, { range, limit: 50 }),
    ]);

    // Calculate KPIs from ModelCall table
    const modelCalls = await prisma.modelCall.findMany({
      where: { at: { gte: from, lt: to } },
      select: { durationMs: true, status: true },
      take: 100000,
    });

    const latencies = modelCalls.map(c => c.durationMs ?? 0).filter(v => v > 0);
    const errorCount = modelCalls.filter(c => c.status === 'fail').length;
    const totalCalls = modelCalls.length;
    const errorRate = totalCalls > 0 ? errorCount / totalCalls : 0;

    // Get message count
    const totalMessages = await prisma.message.count({
      where: { createdAt: { gte: from, lt: to } },
    });

    // Get active users (users with messages in time range)
    const activeUsersData = await prisma.message.groupBy({
      by: ['conversationId'],
      where: { createdAt: { gte: from, lt: to } },
    });
    // Get unique user count from conversations
    const conversationIds = activeUsersData.map(d => d.conversationId);
    const conversationsWithUsers = await prisma.conversation.findMany({
      where: { id: { in: conversationIds } },
      select: { userId: true },
      distinct: ['userId'],
    });
    const activeUsers = conversationsWithUsers.length;

    // Transform errors to match frontend LLMErrorItem format
    const recentErrors = errorsResult.items.map((err, idx) => ({
      id: err.traceId || `err-${idx}`,
      ts: err.at,
      provider: err.provider,
      model: err.model,
      errorType: err.errorCode || 'UNKNOWN',
      message: err.errorCode || 'Unknown error',
      stage: err.stage,
    }));

    // Transform ingestion failures to match frontend IngestionFailureItem format
    const recentIngestionFailures = ingestionResult.items.map((fail, idx) => ({
      id: fail.documentId || `fail-${idx}`,
      ts: fail.at,
      fileId: fail.documentId || '',
      fileName: fail.filename || 'Unknown file',
      mimeType: fail.mimeType || 'unknown',
      error: fail.errorCode || 'Unknown error',
      stage: fail.extractionMethod || 'ingestion',
    }));

    res.json({
      ok: true,
      range,
      data: {
        v: 1,
        kpis: {
          p50LatencyMs: percentile(latencies, 50),
          p95LatencyMs: percentile(latencies, 95),
          errorRate,
          errorCount,
          totalMessages,
          activeUsers,
        },
        recentErrors,
        recentIngestionFailures,
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

    // Transform to match frontend LLMErrorItem format
    const errors = result.items.map((err, idx) => ({
      id: err.traceId || `err-${idx}`,
      ts: err.at,
      provider: err.provider,
      model: err.model,
      errorType: err.errorCode || 'UNKNOWN',
      message: err.errorCode || 'Unknown error',
      stage: err.stage,
    }));

    res.json({
      ok: true,
      range: result.range,
      data: {
        v: 1,
        total: errors.length,
        errors,
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

    // Transform to match frontend IngestionFailureItem format
    const failures = result.items.map((fail, idx) => ({
      id: fail.documentId || `fail-${idx}`,
      ts: fail.at,
      fileId: fail.documentId || '',
      fileName: fail.filename || 'Unknown file',
      mimeType: fail.mimeType || 'unknown',
      error: fail.errorCode || 'Unknown error',
      stage: fail.extractionMethod || 'ingestion',
    }));

    res.json({
      ok: true,
      range: result.range,
      data: {
        v: 1,
        total: failures.length,
        failures,
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
