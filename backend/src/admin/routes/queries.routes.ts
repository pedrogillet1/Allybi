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
 * Response format matches frontend QueriesResponseSchema
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

    // Transform items to match frontend QueryFeedItem schema
    const feed = result.items.map(item => ({
      ts: item.at, // at -> ts
      userEmail: item.userEmail || item.userName || null,
      query: item.content || '[No content]', // content -> query
      intent: item.intent || 'chat',
      domain: item.domain || 'general',
      keywords: item.keywords || [],
      result: 'success',
      score: item.evidenceStrength ?? 0, // Not tracked yet - shows as 0
      fallbackUsed: item.fallbackReasonCode != null,
      docScopeApplied: item.docLockEnabled || false,
      chunksUsed: item.sourcesCount ?? 0,
    }));

    // Calculate KPIs from the items
    const total = feed.length;
    const scores = feed.map(f => f.score).filter(s => s > 0);
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const weakCount = feed.filter(f => f.score < 0.5).length;
    const weakRate = total > 0 ? (weakCount / total) * 100 : 0;

    // Build charts data (simplified - group by domain)
    const domainCounts: Record<string, number> = {};
    const domainScores: Record<string, number[]> = {};
    const domainFallbacks: Record<string, { total: number; fallback: number }> = {};

    feed.forEach(f => {
      const d = f.domain || 'general';
      domainCounts[d] = (domainCounts[d] || 0) + 1;
      if (!domainScores[d]) domainScores[d] = [];
      domainScores[d].push(f.score);
      if (!domainFallbacks[d]) domainFallbacks[d] = { total: 0, fallback: 0 };
      domainFallbacks[d].total++;
      if (f.fallbackUsed) domainFallbacks[d].fallback++;
    });

    const fallbackRateByDomain = Object.entries(domainFallbacks).map(([domain, data]) => ({
      domain,
      value: data.total > 0 ? data.fallback / data.total : 0,
    }));

    const avgScoreByDomain = Object.entries(domainScores).map(([domain, scores]) => ({
      domain,
      value: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
    }));

    res.json({
      ok: true,
      range: result.range,
      data: {
        kpis: {
          queries: total,
          avgTopScore: avgScore,
          weakEvidenceCount: weakCount,
          weakEvidenceRate: weakRate,
        },
        charts: {
          byDomain: [], // Would need time-series data
          fallbackRateByDomain,
          avgScoreByDomain,
        },
        feed,
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
