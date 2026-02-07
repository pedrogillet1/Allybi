/**
 * Gaps & Opportunities Service
 * Identifies content gaps, missing features, and improvement opportunities
 */

import type { PrismaClient } from '@prisma/client';
import { parseRange, normalizeRange } from './_shared/rangeWindow';
import { supportsModel } from './_shared/prismaAdapter';

// ============================================================================
// Types
// ============================================================================

export interface WeakEvidenceQuery {
  pattern: string;
  count: number;
  domain: string;
  avgScore: number;
}

export interface NoEvidenceQuery {
  pattern: string;
  count: number;
  reason: string;
}

export interface FallbackReason {
  reason: string;
  count: number;
  pct: number;
}

export interface MissingConnector {
  keyword: string;
  count: number;
  category: string;
}

export interface GapsResult {
  range: string;
  weakEvidenceQueries: WeakEvidenceQuery[];
  noEvidenceQueries: NoEvidenceQuery[];
  fallbackReasons: FallbackReason[];
  missingConnectors: MissingConnector[];
  opportunityScore: number; // 0-100, higher = more gaps to fix
  topGapCategories: Array<{ category: string; count: number; severity: 'low' | 'medium' | 'high' }>;
}

export interface GapsParams {
  range?: string;
  limit?: number;
}

// ============================================================================
// Main Function
// ============================================================================

export async function getGaps(
  prisma: PrismaClient,
  params: GapsParams
): Promise<GapsResult> {
  const rangeKey = normalizeRange(params.range, '7d');
  const window = parseRange(rangeKey);
  const limit = params.limit ?? 20;
  const { from, to } = window;

  // Get weak evidence queries
  const weakEvidenceQueries = await getWeakEvidenceQueries(prisma, from, to, limit);

  // Get no evidence queries
  const noEvidenceQueries = await getNoEvidenceQueries(prisma, from, to, limit);

  // Get fallback reason distribution
  const fallbackReasons = await getFallbackReasons(prisma, from, to);

  // Detect potential missing connectors/integrations
  const missingConnectors = await detectMissingConnectors(prisma, from, to, limit);

  // Calculate opportunity score
  const opportunityScore = calculateOpportunityScore(
    weakEvidenceQueries,
    noEvidenceQueries,
    fallbackReasons
  );

  // Categorize gaps
  const topGapCategories = categorizeGaps(
    weakEvidenceQueries,
    noEvidenceQueries,
    fallbackReasons,
    missingConnectors
  );

  return {
    range: rangeKey,
    weakEvidenceQueries,
    noEvidenceQueries,
    fallbackReasons,
    missingConnectors,
    opportunityScore,
    topGapCategories,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

async function getWeakEvidenceQueries(
  prisma: PrismaClient,
  from: Date,
  to: Date,
  limit: number
): Promise<WeakEvidenceQuery[]> {
  if (!supportsModel(prisma, 'queryTelemetry')) {
    // Fallback to RetrievalEvent
    if (!supportsModel(prisma, 'retrievalEvent')) {
      return [];
    }

    const weakEvents = await prisma.retrievalEvent.groupBy({
      by: ['domain', 'intent'],
      where: {
        at: { gte: from, lt: to },
        evidenceStrength: { lt: 0.35, gt: 0 },
      },
      _count: { domain: true },
      _avg: { evidenceStrength: true },
      orderBy: { _count: { domain: 'desc' } },
      take: limit,
    });

    return weakEvents.map(e => ({
      pattern: `${e.intent} queries`,
      count: e._count.domain,
      domain: e.domain,
      avgScore: Math.round((e._avg.evidenceStrength ?? 0) * 100) / 100,
    }));
  }

  const weakQueries = await prisma.queryTelemetry.groupBy({
    by: ['domain', 'intent'],
    where: {
      timestamp: { gte: from, lt: to },
      topRelevanceScore: { lt: 0.35, gt: 0 },
      hadFallback: false, // Has some evidence but weak
    },
    _count: { domain: true },
    _avg: { topRelevanceScore: true },
    orderBy: { _count: { domain: 'desc' } },
    take: limit,
  });

  return weakQueries.map(q => ({
    pattern: `${q.intent} queries`,
    count: q._count.domain,
    domain: q.domain || 'general',
    avgScore: Math.round((q._avg.topRelevanceScore ?? 0) * 100) / 100,
  }));
}

async function getNoEvidenceQueries(
  prisma: PrismaClient,
  from: Date,
  to: Date,
  limit: number
): Promise<NoEvidenceQuery[]> {
  if (!supportsModel(prisma, 'queryTelemetry')) {
    // Fallback to RetrievalEvent
    if (!supportsModel(prisma, 'retrievalEvent')) {
      return [];
    }

    const noEvidenceEvents = await prisma.retrievalEvent.groupBy({
      by: ['fallbackReasonCode', 'intent'],
      where: {
        at: { gte: from, lt: to },
        fallbackReasonCode: { not: null },
      },
      _count: { fallbackReasonCode: true },
      orderBy: { _count: { fallbackReasonCode: 'desc' } },
      take: limit,
    });

    return noEvidenceEvents.map(e => ({
      pattern: `${e.intent} queries`,
      count: e._count.fallbackReasonCode,
      reason: e.fallbackReasonCode || 'unknown',
    }));
  }

  const noEvidenceQueries = await prisma.queryTelemetry.groupBy({
    by: ['failureCategory', 'intent'],
    where: {
      timestamp: { gte: from, lt: to },
      OR: [
        { hadFallback: true },
        { chunksReturned: 0 },
      ],
    },
    _count: { failureCategory: true },
    orderBy: { _count: { failureCategory: 'desc' } },
    take: limit,
  });

  return noEvidenceQueries.map(q => ({
    pattern: `${q.intent} queries`,
    count: q._count.failureCategory,
    reason: q.failureCategory || 'no_relevant_docs',
  }));
}

async function getFallbackReasons(
  prisma: PrismaClient,
  from: Date,
  to: Date
): Promise<FallbackReason[]> {
  if (!supportsModel(prisma, 'queryTelemetry')) {
    // Fallback to RetrievalEvent
    if (!supportsModel(prisma, 'retrievalEvent')) {
      return [];
    }

    const reasons = await prisma.retrievalEvent.groupBy({
      by: ['fallbackReasonCode'],
      where: {
        at: { gte: from, lt: to },
        fallbackReasonCode: { not: null },
      },
      _count: { fallbackReasonCode: true },
      orderBy: { _count: { fallbackReasonCode: 'desc' } },
    });

    const total = reasons.reduce((sum, r) => sum + r._count.fallbackReasonCode, 0);
    return reasons.map(r => ({
      reason: formatFallbackReason(r.fallbackReasonCode || 'unknown'),
      count: r._count.fallbackReasonCode,
      pct: total > 0 ? Math.round((r._count.fallbackReasonCode / total) * 100) : 0,
    }));
  }

  const reasons = await prisma.queryTelemetry.groupBy({
    by: ['failureCategory'],
    where: {
      timestamp: { gte: from, lt: to },
      hadFallback: true,
    },
    _count: { failureCategory: true },
    orderBy: { _count: { failureCategory: 'desc' } },
  });

  const total = reasons.reduce((sum, r) => sum + r._count.failureCategory, 0);
  return reasons.map(r => ({
    reason: formatFallbackReason(r.failureCategory || 'unknown'),
    count: r._count.failureCategory,
    pct: total > 0 ? Math.round((r._count.failureCategory / total) * 100) : 0,
  }));
}

function formatFallbackReason(code: string): string {
  const mapping: Record<string, string> = {
    'NO_EVIDENCE': 'No relevant documents found',
    'NO_DOCS': 'No documents uploaded',
    'WEAK_EVIDENCE': 'Low confidence in results',
    'SCOPE_EMPTY': 'Search scope too narrow',
    'INDEXING': 'Documents still processing',
    'EXTRACTION_FAILED': 'Failed to extract document content',
    'grounding_failed': 'Answer not grounded in sources',
    'grounding_warning': 'Weak grounding in sources',
    'no_relevant_docs': 'No relevant documents found',
    'unknown': 'Unknown reason',
  };
  return mapping[code] || code.replace(/_/g, ' ').toLowerCase();
}

async function detectMissingConnectors(
  prisma: PrismaClient,
  from: Date,
  to: Date,
  limit: number
): Promise<MissingConnector[]> {
  // Common integration-related keywords that might indicate missing connectors
  const integrationKeywords = [
    'gmail', 'google drive', 'dropbox', 'onedrive', 'slack',
    'notion', 'confluence', 'jira', 'asana', 'trello',
    'salesforce', 'hubspot', 'zendesk', 'intercom',
    'github', 'gitlab', 'bitbucket', 'figma', 'miro',
  ];

  if (!supportsModel(prisma, 'queryKeyword')) {
    return [];
  }

  // Find keywords that match integration patterns
  const keywordMatches = await prisma.queryKeyword.groupBy({
    by: ['keyword'],
    where: {
      createdAt: { gte: from, lt: to },
      keyword: { in: integrationKeywords, mode: 'insensitive' },
    },
    _count: { keyword: true },
    orderBy: { _count: { keyword: 'desc' } },
    take: limit,
  });

  const categoryMapping: Record<string, string> = {
    'gmail': 'email',
    'google drive': 'cloud_storage',
    'dropbox': 'cloud_storage',
    'onedrive': 'cloud_storage',
    'slack': 'communication',
    'notion': 'productivity',
    'confluence': 'documentation',
    'jira': 'project_management',
    'asana': 'project_management',
    'trello': 'project_management',
    'salesforce': 'crm',
    'hubspot': 'crm',
    'zendesk': 'support',
    'intercom': 'support',
    'github': 'development',
    'gitlab': 'development',
    'bitbucket': 'development',
    'figma': 'design',
    'miro': 'design',
  };

  return keywordMatches.map(k => ({
    keyword: k.keyword,
    count: k._count.keyword,
    category: categoryMapping[k.keyword.toLowerCase()] || 'other',
  }));
}

function calculateOpportunityScore(
  weakEvidenceQueries: WeakEvidenceQuery[],
  noEvidenceQueries: NoEvidenceQuery[],
  fallbackReasons: FallbackReason[]
): number {
  // Score based on volume and severity of gaps
  const weakCount = weakEvidenceQueries.reduce((sum, q) => sum + q.count, 0);
  const noEvidenceCount = noEvidenceQueries.reduce((sum, q) => sum + q.count, 0);
  const totalFallbacks = fallbackReasons.reduce((sum, r) => sum + r.count, 0);

  // Weight: no evidence is worse than weak evidence
  const weightedGaps = (noEvidenceCount * 2) + weakCount;

  // Normalize to 0-100 scale (assuming max ~1000 gaps is 100% opportunity)
  const score = Math.min(100, Math.round((weightedGaps / 10)));

  return score;
}

function categorizeGaps(
  weakEvidenceQueries: WeakEvidenceQuery[],
  noEvidenceQueries: NoEvidenceQuery[],
  fallbackReasons: FallbackReason[],
  missingConnectors: MissingConnector[]
): Array<{ category: string; count: number; severity: 'low' | 'medium' | 'high' }> {
  const categories: Array<{ category: string; count: number; severity: 'low' | 'medium' | 'high' }> = [];

  // Content gaps (weak evidence)
  const weakTotal = weakEvidenceQueries.reduce((sum, q) => sum + q.count, 0);
  if (weakTotal > 0) {
    categories.push({
      category: 'Content Gaps',
      count: weakTotal,
      severity: weakTotal > 100 ? 'high' : weakTotal > 30 ? 'medium' : 'low',
    });
  }

  // Coverage gaps (no evidence)
  const noEvidenceTotal = noEvidenceQueries.reduce((sum, q) => sum + q.count, 0);
  if (noEvidenceTotal > 0) {
    categories.push({
      category: 'Coverage Gaps',
      count: noEvidenceTotal,
      severity: noEvidenceTotal > 50 ? 'high' : noEvidenceTotal > 15 ? 'medium' : 'low',
    });
  }

  // Integration gaps (missing connectors)
  const connectorTotal = missingConnectors.reduce((sum, c) => sum + c.count, 0);
  if (connectorTotal > 0) {
    categories.push({
      category: 'Integration Opportunities',
      count: connectorTotal,
      severity: connectorTotal > 20 ? 'high' : connectorTotal > 5 ? 'medium' : 'low',
    });
  }

  // Categorize by domain
  const domainGaps = new Map<string, number>();
  for (const q of weakEvidenceQueries) {
    domainGaps.set(q.domain, (domainGaps.get(q.domain) ?? 0) + q.count);
  }

  for (const [domain, count] of domainGaps) {
    if (count > 10) {
      categories.push({
        category: `${domain} domain gaps`,
        count,
        severity: count > 50 ? 'high' : count > 20 ? 'medium' : 'low',
      });
    }
  }

  // Sort by count descending
  categories.sort((a, b) => b.count - a.count);

  return categories.slice(0, 10);
}
