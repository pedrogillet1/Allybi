/**
 * Patterns Service
 * Analyzes query patterns, keywords, and entities for gap detection
 */

import type { PrismaClient } from '@prisma/client';
import { parseRange, normalizeRange } from './_shared/rangeWindow';
import { supportsModel } from './_shared/prismaAdapter';

// ============================================================================
// Types
// ============================================================================

export interface TopKeyword {
  keyword: string;
  count: number;
  trend: number; // % change vs previous period
}

export interface TopEntity {
  type: string;
  values: string[];
  count: number;
}

export interface QuestionCluster {
  pattern: string;
  examples: string[];
  count: number;
}

export interface WeakEvidenceCluster {
  pattern: string;
  count: number;
  avgScore: number;
}

export interface PatternsResult {
  range: string;
  topKeywords: TopKeyword[];
  topEntities: TopEntity[];
  questionClusters: QuestionCluster[];
  weakEvidenceClusters: WeakEvidenceCluster[];
  domainDistribution: Array<{ domain: string; count: number; pct: number }>;
  intentDistribution: Array<{ intent: string; count: number; pct: number }>;
}

export interface PatternsParams {
  range?: string;
  limit?: number;
}

// ============================================================================
// Main Function
// ============================================================================

export async function getPatterns(
  prisma: PrismaClient,
  params: PatternsParams
): Promise<PatternsResult> {
  const rangeKey = normalizeRange(params.range, '7d');
  const window = parseRange(rangeKey);
  const limit = params.limit ?? 20;
  const { from, to } = window;

  // Calculate previous period for trend calculation
  const periodMs = to.getTime() - from.getTime();
  const prevFrom = new Date(from.getTime() - periodMs);
  const prevTo = from;

  // Get top keywords
  let topKeywords: TopKeyword[] = [];
  if (supportsModel(prisma, 'queryKeyword')) {
    topKeywords = await getTopKeywords(prisma, from, to, prevFrom, prevTo, limit);
  } else {
    // Fallback: extract keywords from QueryTelemetry.matchedKeywords
    topKeywords = await getKeywordsFromTelemetry(prisma, from, to, prevFrom, prevTo, limit);
  }

  // Get top entities
  let topEntities: TopEntity[] = [];
  if (supportsModel(prisma, 'queryEntity')) {
    topEntities = await getTopEntities(prisma, from, to, limit);
  }

  // Get question clusters
  const questionClusters = await getQuestionClusters(prisma, from, to);

  // Get weak evidence clusters
  const weakEvidenceClusters = await getWeakEvidenceClusters(prisma, from, to);

  // Get domain distribution
  const domainDistribution = await getDomainDistribution(prisma, from, to);

  // Get intent distribution
  const intentDistribution = await getIntentDistribution(prisma, from, to);

  return {
    range: rangeKey,
    topKeywords,
    topEntities,
    questionClusters,
    weakEvidenceClusters,
    domainDistribution,
    intentDistribution,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

async function getTopKeywords(
  prisma: PrismaClient,
  from: Date,
  to: Date,
  prevFrom: Date,
  prevTo: Date,
  limit: number
): Promise<TopKeyword[]> {
  // Current period keyword counts
  const currentCounts = await prisma.queryKeyword.groupBy({
    by: ['keyword'],
    where: {
      createdAt: { gte: from, lt: to },
    },
    _count: { keyword: true },
    orderBy: { _count: { keyword: 'desc' } },
    take: limit,
  });

  // Previous period counts for trend
  const prevKeywords = currentCounts.map(c => c.keyword);
  const prevCounts = await prisma.queryKeyword.groupBy({
    by: ['keyword'],
    where: {
      keyword: { in: prevKeywords },
      createdAt: { gte: prevFrom, lt: prevTo },
    },
    _count: { keyword: true },
  });

  const prevMap = new Map(prevCounts.map(p => [p.keyword, p._count.keyword]));

  return currentCounts.map(c => {
    const prevCount = prevMap.get(c.keyword) ?? 0;
    const trend = prevCount > 0
      ? ((c._count.keyword - prevCount) / prevCount) * 100
      : 100; // New keyword = 100% growth

    return {
      keyword: c.keyword,
      count: c._count.keyword,
      trend: Math.round(trend),
    };
  });
}

async function getKeywordsFromTelemetry(
  prisma: PrismaClient,
  from: Date,
  to: Date,
  prevFrom: Date,
  prevTo: Date,
  limit: number
): Promise<TopKeyword[]> {
  if (!supportsModel(prisma, 'queryTelemetry')) {
    return [];
  }

  // Get current period telemetry with keywords
  const currentTelemetry = await prisma.queryTelemetry.findMany({
    where: {
      timestamp: { gte: from, lt: to },
      matchedKeywords: { isEmpty: false },
    },
    select: { matchedKeywords: true },
  });

  // Count keywords
  const keywordCounts = new Map<string, number>();
  for (const t of currentTelemetry) {
    for (const kw of t.matchedKeywords) {
      keywordCounts.set(kw, (keywordCounts.get(kw) ?? 0) + 1);
    }
  }

  // Get previous period for trend
  const prevTelemetry = await prisma.queryTelemetry.findMany({
    where: {
      timestamp: { gte: prevFrom, lt: prevTo },
      matchedKeywords: { isEmpty: false },
    },
    select: { matchedKeywords: true },
  });

  const prevCounts = new Map<string, number>();
  for (const t of prevTelemetry) {
    for (const kw of t.matchedKeywords) {
      prevCounts.set(kw, (prevCounts.get(kw) ?? 0) + 1);
    }
  }

  // Sort and limit
  const sorted = Array.from(keywordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

  return sorted.map(([keyword, count]) => {
    const prevCount = prevCounts.get(keyword) ?? 0;
    const trend = prevCount > 0
      ? ((count - prevCount) / prevCount) * 100
      : 100;

    return {
      keyword,
      count,
      trend: Math.round(trend),
    };
  });
}

async function getTopEntities(
  prisma: PrismaClient,
  from: Date,
  to: Date,
  limit: number
): Promise<TopEntity[]> {
  // Group by entity type
  const typeCounts = await prisma.queryEntity.groupBy({
    by: ['entityType'],
    where: {
      createdAt: { gte: from, lt: to },
    },
    _count: { entityType: true },
    orderBy: { _count: { entityType: 'desc' } },
    take: limit,
  });

  // Get top values for each type
  const result: TopEntity[] = [];
  for (const tc of typeCounts) {
    const topValues = await prisma.queryEntity.groupBy({
      by: ['value'],
      where: {
        entityType: tc.entityType,
        createdAt: { gte: from, lt: to },
      },
      _count: { value: true },
      orderBy: { _count: { value: 'desc' } },
      take: 5,
    });

    result.push({
      type: tc.entityType,
      values: topValues.map(v => v.value),
      count: tc._count.entityType,
    });
  }

  return result;
}

async function getQuestionClusters(
  prisma: PrismaClient,
  from: Date,
  to: Date
): Promise<QuestionCluster[]> {
  // Cluster by intent + operator combinations
  if (!supportsModel(prisma, 'queryTelemetry')) {
    return [];
  }

  const clusters = await prisma.queryTelemetry.groupBy({
    by: ['intent', 'operatorFamily'],
    where: {
      timestamp: { gte: from, lt: to },
    },
    _count: { intent: true },
    orderBy: { _count: { intent: 'desc' } },
    take: 10,
  });

  return clusters.map(c => ({
    pattern: `${c.intent} + ${c.operatorFamily || 'qa'}`,
    examples: [], // Would need query text which is redacted
    count: c._count.intent,
  }));
}

async function getWeakEvidenceClusters(
  prisma: PrismaClient,
  from: Date,
  to: Date
): Promise<WeakEvidenceCluster[]> {
  if (!supportsModel(prisma, 'queryTelemetry')) {
    return [];
  }

  // Group weak evidence queries by domain
  const weakQueries = await prisma.queryTelemetry.groupBy({
    by: ['domain'],
    where: {
      timestamp: { gte: from, lt: to },
      OR: [
        { hadFallback: true },
        { topRelevanceScore: { lt: 0.35 } },
      ],
    },
    _count: { domain: true },
    _avg: { topRelevanceScore: true },
    orderBy: { _count: { domain: 'desc' } },
    take: 10,
  });

  return weakQueries.map(q => ({
    pattern: q.domain || 'general',
    count: q._count.domain,
    avgScore: Math.round((q._avg.topRelevanceScore ?? 0) * 100) / 100,
  }));
}

async function getDomainDistribution(
  prisma: PrismaClient,
  from: Date,
  to: Date
): Promise<Array<{ domain: string; count: number; pct: number }>> {
  if (!supportsModel(prisma, 'queryTelemetry')) {
    // Fallback to RetrievalEvent
    if (!supportsModel(prisma, 'retrievalEvent')) {
      return [];
    }

    const counts = await prisma.retrievalEvent.groupBy({
      by: ['domain'],
      where: { at: { gte: from, lt: to } },
      _count: { domain: true },
      orderBy: { _count: { domain: 'desc' } },
    });

    const total = counts.reduce((sum, c) => sum + c._count.domain, 0);
    return counts.map(c => ({
      domain: c.domain,
      count: c._count.domain,
      pct: total > 0 ? Math.round((c._count.domain / total) * 100) : 0,
    }));
  }

  const counts = await prisma.queryTelemetry.groupBy({
    by: ['domain'],
    where: { timestamp: { gte: from, lt: to } },
    _count: { domain: true },
    orderBy: { _count: { domain: 'desc' } },
  });

  const total = counts.reduce((sum, c) => sum + c._count.domain, 0);
  return counts.map(c => ({
    domain: c.domain || 'general',
    count: c._count.domain,
    pct: total > 0 ? Math.round((c._count.domain / total) * 100) : 0,
  }));
}

async function getIntentDistribution(
  prisma: PrismaClient,
  from: Date,
  to: Date
): Promise<Array<{ intent: string; count: number; pct: number }>> {
  if (!supportsModel(prisma, 'queryTelemetry')) {
    // Fallback to RetrievalEvent
    if (!supportsModel(prisma, 'retrievalEvent')) {
      return [];
    }

    const counts = await prisma.retrievalEvent.groupBy({
      by: ['intent'],
      where: { at: { gte: from, lt: to } },
      _count: { intent: true },
      orderBy: { _count: { intent: 'desc' } },
    });

    const total = counts.reduce((sum, c) => sum + c._count.intent, 0);
    return counts.map(c => ({
      intent: c.intent,
      count: c._count.intent,
      pct: total > 0 ? Math.round((c._count.intent / total) * 100) : 0,
    }));
  }

  const counts = await prisma.queryTelemetry.groupBy({
    by: ['intent'],
    where: { timestamp: { gte: from, lt: to } },
    _count: { intent: true },
    orderBy: { _count: { intent: 'desc' } },
  });

  const total = counts.reduce((sum, c) => sum + c._count.intent, 0);
  return counts.map(c => ({
    intent: c.intent,
    count: c._count.intent,
    pct: total > 0 ? Math.round((c._count.intent / total) * 100) : 0,
  }));
}
