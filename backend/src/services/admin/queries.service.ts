/**
 * Queries Service
 * Query/retrieval analytics with filtering
 *
 * Falls back to Message table if RetrievalEvent is empty
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
  // Additional fields for message-based queries
  content?: string;
  userName?: string;
  userEmail?: string;
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
 * Falls back to Message table if RetrievalEvent is empty
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

  // Try RetrievalEvent first (detailed telemetry)
  if (supportsModel(prisma, 'retrievalEvent')) {
    const eventCount = await prisma.retrievalEvent.count({
      where: { at: { gte: from, lt: to } },
    });

    if (eventCount > 0) {
      return listFromRetrievalEvents(prisma, params, rangeKey, window, limit, cursorClause);
    }
  }

  // Fallback to Message table (user queries)
  return listFromMessages(prisma, params, rangeKey, window, limit, cursorClause);
}

/**
 * List queries from RetrievalEvent table (detailed telemetry)
 */
async function listFromRetrievalEvents(
  prisma: PrismaClient,
  params: ListQueriesParams,
  rangeKey: string,
  window: { from: Date; to: Date },
  limit: number,
  cursorClause: Record<string, unknown>
): Promise<QueryListResult> {
  const { from, to } = window;

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

  // Get token totals from ModelCall if available
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

  // Filter by keyword if provided
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
      cost: null,
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

/**
 * List queries from Message table (fallback when no telemetry)
 * Note: Message content is encrypted for privacy - we show metadata only
 */
async function listFromMessages(
  prisma: PrismaClient,
  params: ListQueriesParams,
  rangeKey: string,
  window: { from: Date; to: Date },
  limit: number,
  cursorClause: Record<string, unknown>
): Promise<QueryListResult> {
  const { from, to } = window;

  // Get user messages (role = 'user')
  const messages = await prisma.message.findMany({
    where: {
      role: 'user',
      createdAt: { gte: from, lt: to },
    },
    take: limit + 1,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      createdAt: true,
      content: true,
      contentEncrypted: true,
      isEncrypted: true,
      conversationId: true,
      conversation: {
        select: {
          userId: true,
          title: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      },
    },
  });

  const { page, nextCursor } = processPage(messages, limit);

  // Build query rows from messages
  const items: QueryRow[] = page.map(m => {
    const user = m.conversation?.user;
    const userEmail = user?.email || undefined;
    const userName = user?.firstName && user?.lastName
      ? `${user.firstName} ${user.lastName}`
      : user?.email || undefined;

    // Content is encrypted - show placeholder or conversation title
    const isEncrypted = !m.content && m.contentEncrypted;
    const displayContent = m.content
      ? m.content.substring(0, 200)
      : isEncrypted
        ? `[Encrypted message in "${m.conversation?.title || 'conversation'}"]`
        : '[No content]';

    return {
      at: m.createdAt.toISOString(),
      userId: m.conversation?.userId || 'unknown',
      userName,
      userEmail,
      content: displayContent,
      intent: 'chat',
      operator: 'user',
      domain: 'general',
      docLockEnabled: false,
      strategy: 'rag',
      evidenceStrength: null, // Not tracked yet
      refined: null,
      fallbackReasonCode: null,
      sourcesCount: null,
      navPillsUsed: null,
      traceId: m.id,
      turnId: m.id,
      conversationId: m.conversationId,
      tokensTotal: null,
      cost: null,
      keywords: [],
      patternKey: null,
    };
  });

  return {
    range: rangeKey,
    items,
    ...(nextCursor ? { nextCursor } : {}),
  };
}
