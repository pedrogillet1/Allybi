/**
 * Queries Service
 * Query/retrieval analytics with filtering
 */

import type { PrismaClient } from '@prisma/client';
import { parseRange, normalizeRange } from './_shared/rangeWindow';
import { clampLimit } from './_shared/clamp';
import { processPage, buildCursorClause } from './_shared/pagination';
import { supportsModel } from './_shared/prismaAdapter';

export interface QueryRow {
  at: string;
  userId: string;
  intent: string;
  operator: string;
  domain: string;
  docLockEnabled: boolean;
  strategy: string;
  evidenceStrength: number | null;
  refined: boolean | null;
  fallbackReasonCode: string | null;
  sourcesCount: number | null;
  navPillsUsed: boolean | null;
  traceId: string;
  turnId: string | null;
  conversationId: string | null;
  tokensTotal: number | null;
  cost: number | null;
  keywords: string[];
  patternKey: string | null;
}

export interface QueryListResult {
  range: string;
  items: QueryRow[];
  nextCursor?: string;
}

export interface ListQueriesParams {
  range?: string;
  limit?: number;
  cursor?: string;
  domain?: string;
  intent?: string;
  operator?: string;
  keyword?: string;
}

/**
 * List queries with optional filtering
 */
export async function listQueries(
  prisma: PrismaClient,
  params: ListQueriesParams
): Promise<QueryListResult> {
  const rangeKey = normalizeRange(params.range, '7d');
  const window = parseRange(rangeKey);
  const limit = clampLimit(params.limit, 50);
  const cursorClause = buildCursorClause(params.cursor);

  const { from, to } = window;

  // Check if we have retrievalEvent model
  if (!supportsModel(prisma, 'retrievalEvent')) {
    return { range: rangeKey, items: [] };
  }

  // Build where clause
  const where: Record<string, unknown> = {
    at: { gte: from, lt: to },
  };

  if (params.domain) where.domain = params.domain;
  if (params.intent) where.intent = params.intent;
  if (params.operator) where.operator = params.operator;

  // Get retrieval events
  const events = await prisma.retrievalEvent.findMany({
    where,
    take: limit + 1,
    ...cursorClause,
    orderBy: { at: 'desc' },
    select: {
      id: true,
      at: true,
      userId: true,
      traceId: true,
      turnId: true,
      conversationId: true,
      operator: true,
      intent: true,
      domain: true,
      docLockEnabled: true,
      strategy: true,
      evidenceStrength: true,
      refined: true,
      fallbackReasonCode: true,
      sourcesCount: true,
      navPillsUsed: true,
      meta: true,
    },
  });

  const { page, nextCursor } = processPage(events, limit);

  // Get token totals from ModelCall if available (best effort, capped)
  let tokenMap = new Map<string, number>();
  if (supportsModel(prisma, 'modelCall') && page.length > 0) {
    const traceIds = page.map(e => e.traceId);
    const tokenData = await prisma.modelCall.groupBy({
      by: ['traceId'],
      where: { traceId: { in: traceIds } },
      _sum: { totalTokens: true },
    });
    tokenMap = new Map(tokenData.map(t => [t.traceId, t._sum?.totalTokens ?? 0]));
  }

  // Filter by keyword if provided (post-query filter since keywords may be in meta)
  let filteredPage = page;
  if (params.keyword) {
    const keywordLower = params.keyword.toLowerCase();
    filteredPage = page.filter(e => {
      const meta = e.meta as Record<string, unknown> | null;
      const keywords = (meta?.keywords as string[]) ?? [];
      return keywords.some(k => k.toLowerCase().includes(keywordLower));
    });
  }

  // Build query rows
  const items: QueryRow[] = filteredPage.map(e => {
    const meta = e.meta as Record<string, unknown> | null;
    return {
      at: e.at.toISOString(),
      userId: e.userId,
      intent: e.intent,
      operator: e.operator,
      domain: e.domain,
      docLockEnabled: e.docLockEnabled,
      strategy: e.strategy,
      evidenceStrength: e.evidenceStrength,
      refined: e.refined,
      fallbackReasonCode: e.fallbackReasonCode,
      sourcesCount: e.sourcesCount,
      navPillsUsed: e.navPillsUsed,
      traceId: e.traceId,
      turnId: e.turnId,
      conversationId: e.conversationId,
      tokensTotal: tokenMap.get(e.traceId) ?? null,
      cost: null, // Would need pricing data
      keywords: (meta?.keywords as string[]) ?? [],
      patternKey: (meta?.patternKey as string) ?? null,
    };
  });

  return {
    range: rangeKey,
    items,
    ...(nextCursor ? { nextCursor } : {}),
  };
}
