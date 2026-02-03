/**
 * Marketing Service
 * Domain, intent, keyword, and pattern analytics for marketing insights
 */

import type { PrismaClient } from '@prisma/client';
import { parseRange, previousWindow, normalizeRange } from './_shared/rangeWindow';
import { clampLimit } from './_shared/clamp';
import { processPage, buildCursorClause } from './_shared/pagination';
import { supportsModel } from './_shared/prismaAdapter';

export interface DomainRow {
  domain: string;
  count: number;
  weakRate: number;
  tokens: number;
}

export interface DomainsResult {
  range: string;
  items: DomainRow[];
}

export interface IntentRow {
  intent: string;
  count: number;
  weakRate: number;
  tokens: number;
}

export interface IntentsResult {
  range: string;
  items: IntentRow[];
}

export interface KeywordRow {
  keyword: string;
  count: number;
  delta: number;
  trending: boolean;
}

export interface KeywordsResult {
  range: string;
  top: KeywordRow[];
  trending: KeywordRow[];
}

export interface PatternRow {
  patternKey: string;
  count: number;
}

export interface PatternsResult {
  range: string;
  items: PatternRow[];
}

export interface InteractionRow {
  at: string;
  userId: string;
  traceId: string;
  query: string | null;
  intent: string;
  domain: string;
  evidenceStrength: number | null;
  tokensTotal: number;
}

export interface InteractionsResult {
  range: string;
  items: InteractionRow[];
  nextCursor?: string;
}

/**
 * Get domain analytics
 */
export async function getDomains(
  prisma: PrismaClient,
  params: { range?: string }
): Promise<DomainsResult> {
  const rangeKey = normalizeRange(params.range, '7d');
  const window = parseRange(rangeKey);

  const { from, to } = window;

  if (!supportsModel(prisma, 'retrievalEvent')) {
    return { range: rangeKey, items: [] };
  }

  // Get all retrieval events grouped by domain
  const events = await prisma.retrievalEvent.findMany({
    where: { at: { gte: from, lt: to } },
    select: { domain: true, evidenceStrength: true, fallbackReasonCode: true, traceId: true },
    take: 100000,
  });

  // Group by domain
  const domainMap = new Map<string, { count: number; weak: number; traceIds: Set<string> }>();
  for (const e of events) {
    if (!domainMap.has(e.domain)) {
      domainMap.set(e.domain, { count: 0, weak: 0, traceIds: new Set() });
    }
    const data = domainMap.get(e.domain)!;
    data.count++;
    data.traceIds.add(e.traceId);
    if ((e.evidenceStrength !== null && e.evidenceStrength < 0.35) || e.fallbackReasonCode === 'WEAK_EVIDENCE') {
      data.weak++;
    }
  }

  // Get token totals by domain (best effort)
  let tokensByTrace = new Map<string, number>();
  if (supportsModel(prisma, 'modelCall')) {
    const traceIds = Array.from(new Set(events.map(e => e.traceId)));
    if (traceIds.length > 0 && traceIds.length <= 10000) {
      const tokenData = await prisma.modelCall.groupBy({
        by: ['traceId'],
        where: { traceId: { in: traceIds } },
        _sum: { totalTokens: true },
      });
      tokensByTrace = new Map(tokenData.map(t => [t.traceId, t._sum?.totalTokens ?? 0]));
    }
  }

  const items: DomainRow[] = Array.from(domainMap.entries())
    .map(([domain, data]) => {
      let tokens = 0;
      for (const traceId of data.traceIds) {
        tokens += tokensByTrace.get(traceId) ?? 0;
      }
      return {
        domain,
        count: data.count,
        weakRate: data.count > 0 ? Math.round((data.weak / data.count) * 10000) / 100 : 0,
        tokens,
      };
    })
    .sort((a, b) => b.count - a.count);

  return { range: rangeKey, items };
}

/**
 * Get intent analytics
 */
export async function getIntents(
  prisma: PrismaClient,
  params: { range?: string }
): Promise<IntentsResult> {
  const rangeKey = normalizeRange(params.range, '7d');
  const window = parseRange(rangeKey);

  const { from, to } = window;

  if (!supportsModel(prisma, 'retrievalEvent')) {
    return { range: rangeKey, items: [] };
  }

  const events = await prisma.retrievalEvent.findMany({
    where: { at: { gte: from, lt: to } },
    select: { intent: true, evidenceStrength: true, fallbackReasonCode: true, traceId: true },
    take: 100000,
  });

  const intentMap = new Map<string, { count: number; weak: number; traceIds: Set<string> }>();
  for (const e of events) {
    if (!intentMap.has(e.intent)) {
      intentMap.set(e.intent, { count: 0, weak: 0, traceIds: new Set() });
    }
    const data = intentMap.get(e.intent)!;
    data.count++;
    data.traceIds.add(e.traceId);
    if ((e.evidenceStrength !== null && e.evidenceStrength < 0.35) || e.fallbackReasonCode === 'WEAK_EVIDENCE') {
      data.weak++;
    }
  }

  // Get token totals
  let tokensByTrace = new Map<string, number>();
  if (supportsModel(prisma, 'modelCall')) {
    const traceIds = Array.from(new Set(events.map(e => e.traceId)));
    if (traceIds.length > 0 && traceIds.length <= 10000) {
      const tokenData = await prisma.modelCall.groupBy({
        by: ['traceId'],
        where: { traceId: { in: traceIds } },
        _sum: { totalTokens: true },
      });
      tokensByTrace = new Map(tokenData.map(t => [t.traceId, t._sum?.totalTokens ?? 0]));
    }
  }

  const items: IntentRow[] = Array.from(intentMap.entries())
    .map(([intent, data]) => {
      let tokens = 0;
      for (const traceId of data.traceIds) {
        tokens += tokensByTrace.get(traceId) ?? 0;
      }
      return {
        intent,
        count: data.count,
        weakRate: data.count > 0 ? Math.round((data.weak / data.count) * 10000) / 100 : 0,
        tokens,
      };
    })
    .sort((a, b) => b.count - a.count);

  return { range: rangeKey, items };
}

/**
 * Get keyword analytics with trending
 */
export async function getKeywords(
  prisma: PrismaClient,
  params: { range?: string; domain?: string }
): Promise<KeywordsResult> {
  const rangeKey = normalizeRange(params.range, '7d');
  const currentWindow = parseRange(rangeKey);
  const prevWindow = previousWindow(rangeKey);

  // Try QueryTelemetry first for keywords
  if (supportsModel(prisma, 'queryTelemetry')) {
    const where: Record<string, unknown> = {
      timestamp: { gte: currentWindow.from, lt: currentWindow.to },
    };
    if (params.domain) where.domain = params.domain;

    const currentEvents = await prisma.queryTelemetry.findMany({
      where,
      select: { matchedKeywords: true },
      take: 50000,
    });

    const prevWhere: Record<string, unknown> = {
      timestamp: { gte: prevWindow.from, lt: prevWindow.to },
    };
    if (params.domain) prevWhere.domain = params.domain;

    const prevEvents = await prisma.queryTelemetry.findMany({
      where: prevWhere,
      select: { matchedKeywords: true },
      take: 50000,
    });

    // Count keywords
    const currentCounts = new Map<string, number>();
    for (const e of currentEvents) {
      for (const kw of e.matchedKeywords || []) {
        currentCounts.set(kw, (currentCounts.get(kw) ?? 0) + 1);
      }
    }

    const prevCounts = new Map<string, number>();
    for (const e of prevEvents) {
      for (const kw of e.matchedKeywords || []) {
        prevCounts.set(kw, (prevCounts.get(kw) ?? 0) + 1);
      }
    }

    // Build keyword rows with delta
    const keywordRows: KeywordRow[] = Array.from(currentCounts.entries())
      .map(([keyword, count]) => {
        const prevCount = prevCounts.get(keyword) ?? 0;
        const delta = prevCount > 0 ? Math.round(((count - prevCount) / prevCount) * 100) : (count > 0 ? 100 : 0);
        return {
          keyword,
          count,
          delta,
          trending: delta > 20, // 20% increase = trending
        };
      })
      .sort((a, b) => b.count - a.count);

    const top = keywordRows.slice(0, 20);
    const trending = keywordRows
      .filter(k => k.trending)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 10);

    return { range: rangeKey, top, trending };
  }

  // Fallback: no keywords available
  return { range: rangeKey, top: [], trending: [] };
}

/**
 * Get pattern analytics
 */
export async function getPatterns(
  prisma: PrismaClient,
  params: { range?: string }
): Promise<PatternsResult> {
  const rangeKey = normalizeRange(params.range, '7d');
  const window = parseRange(rangeKey);

  // Try QueryTelemetry for patterns
  if (supportsModel(prisma, 'queryTelemetry')) {
    const events = await prisma.queryTelemetry.findMany({
      where: { timestamp: { gte: window.from, lt: window.to } },
      select: { matchedPatterns: true },
      take: 50000,
    });

    const patternCounts = new Map<string, number>();
    for (const e of events) {
      for (const p of e.matchedPatterns || []) {
        patternCounts.set(p, (patternCounts.get(p) ?? 0) + 1);
      }
    }

    const items: PatternRow[] = Array.from(patternCounts.entries())
      .map(([patternKey, count]) => ({ patternKey, count }))
      .sort((a, b) => b.count - a.count);

    return { range: rangeKey, items };
  }

  return { range: rangeKey, items: [] };
}

/**
 * List interactions (query→answer rollups)
 */
export async function listInteractions(
  prisma: PrismaClient,
  params: { range?: string; limit?: number; cursor?: string }
): Promise<InteractionsResult> {
  const rangeKey = normalizeRange(params.range, '7d');
  const window = parseRange(rangeKey);
  const limit = clampLimit(params.limit, 50);
  const cursorClause = buildCursorClause(params.cursor);

  const { from, to } = window;

  // Try QueryTelemetry first (most complete)
  if (supportsModel(prisma, 'queryTelemetry')) {
    const events = await prisma.queryTelemetry.findMany({
      where: { timestamp: { gte: from, lt: to } },
      take: limit + 1,
      ...cursorClause,
      orderBy: { timestamp: 'desc' },
      select: {
        id: true,
        timestamp: true,
        userId: true,
        queryId: true,
        queryText: true,
        intent: true,
        domain: true,
        avgRelevanceScore: true,
        totalTokens: true,
      },
    });

    const { page, nextCursor } = processPage(events, limit);

    const items: InteractionRow[] = page.map(e => ({
      at: e.timestamp.toISOString(),
      userId: e.userId,
      traceId: e.queryId,
      query: e.queryText,
      intent: e.intent,
      domain: e.domain ?? 'unknown',
      evidenceStrength: e.avgRelevanceScore,
      tokensTotal: e.totalTokens,
    }));

    return {
      range: rangeKey,
      items,
      ...(nextCursor ? { nextCursor } : {}),
    };
  }

  // Fallback to RetrievalEvent + ModelCall join
  if (supportsModel(prisma, 'retrievalEvent')) {
    const events = await prisma.retrievalEvent.findMany({
      where: { at: { gte: from, lt: to } },
      take: limit + 1,
      ...cursorClause,
      orderBy: { at: 'desc' },
      select: {
        id: true,
        at: true,
        userId: true,
        traceId: true,
        intent: true,
        domain: true,
        evidenceStrength: true,
      },
    });

    const { page, nextCursor } = processPage(events, limit);

    // Get tokens for these traces
    let tokensByTrace = new Map<string, number>();
    if (supportsModel(prisma, 'modelCall') && page.length > 0) {
      const traceIds = page.map(e => e.traceId);
      const tokenData = await prisma.modelCall.groupBy({
        by: ['traceId'],
        where: { traceId: { in: traceIds } },
        _sum: { totalTokens: true },
      });
      tokensByTrace = new Map(tokenData.map(t => [t.traceId, t._sum?.totalTokens ?? 0]));
    }

    const items: InteractionRow[] = page.map(e => ({
      at: e.at.toISOString(),
      userId: e.userId,
      traceId: e.traceId,
      query: null,
      intent: e.intent,
      domain: e.domain,
      evidenceStrength: e.evidenceStrength,
      tokensTotal: tokensByTrace.get(e.traceId) ?? 0,
    }));

    return {
      range: rangeKey,
      items,
      ...(nextCursor ? { nextCursor } : {}),
    };
  }

  return { range: rangeKey, items: [] };
}
