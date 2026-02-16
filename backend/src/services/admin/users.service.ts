/**
 * Users Service
 * User analytics and details
 */

import type { PrismaClient } from '@prisma/client';
import { parseRange, normalizeRange } from './_shared/rangeWindow';
import { clampLimit } from './_shared/clamp';
import { processPage, buildCursorClause } from './_shared/pagination';
import { supportsModel } from './_shared/prismaAdapter';

export interface UserRow {
  userId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  messages: number;
  uploads: number;
  llmCalls: number;
  tokensTotal: number;
  llmErrorRate: number;
  weakEvidenceRate: number;
}

export interface UserListResult {
  range: string;
  items: UserRow[];
  nextCursor?: string;
}

export interface UserDetailResult {
  range: string;
  user: UserRow & {
    email?: string;
    role?: string;
    conversationsCount: number;
    sessionsCount: number;
    topIntents: Array<{ intent: string; count: number }>;
    topDomains: Array<{ domain: string; count: number }>;
  };
}

/**
 * List users with activity stats
 */
export async function listUsers(
  prisma: PrismaClient,
  params: { range?: string; limit?: number; cursor?: string }
): Promise<UserListResult> {
  const rangeKey = normalizeRange(params.range, '7d');
  const window = parseRange(rangeKey);
  const limit = clampLimit(params.limit, 50);
  const cursorClause = buildCursorClause(params.cursor);

  const { from, to } = window;
  const safe = async <T>(query: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await query();
    } catch {
      return fallback;
    }
  };

  // Get users with pagination
  const users = await prisma.user.findMany({
    take: limit + 1,
    ...cursorClause,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const { page, nextCursor } = processPage(users, limit);
  const userIds = page.map(u => u.id);

  // Get activity stats in parallel
  const [messagesCounts, uploadsCounts, llmCallsData, retrievalData] = await Promise.all([
    // Messages per user
    supportsModel(prisma, 'message')
      ? safe(() => prisma.message.groupBy({
          by: ['conversationId'],
          where: {
            createdAt: { gte: from, lt: to },
            conversation: { userId: { in: userIds } },
          },
          _count: true,
        }).then(async results => {
          // Need to map conversation to user
          const convIds = results.map(r => r.conversationId);
          const convs = await prisma.conversation.findMany({
            where: { id: { in: convIds } },
            select: { id: true, userId: true },
          });
          const convUserMap = new Map(convs.map(c => [c.id, c.userId]));
          const userMsgCounts = new Map<string, number>();
          for (const r of results) {
            const userId = convUserMap.get(r.conversationId);
            if (userId) {
              userMsgCounts.set(userId, (userMsgCounts.get(userId) ?? 0) + ((r._count as number) || 0));
            }
          }
          return userMsgCounts;
        }), new Map<string, number>())
      : new Map<string, number>(),

    // Uploads per user
    supportsModel(prisma, 'document')
      ? safe(() => prisma.document.groupBy({
          by: ['userId'],
          where: { userId: { in: userIds }, createdAt: { gte: from, lt: to } },
          _count: true,
        }).then(results => new Map(results.map(r => [r.userId, (r._count as number) || 0]))), new Map<string, number>())
      : new Map<string, number>(),

    // LLM calls per user
    supportsModel(prisma, 'modelCall')
      ? safe(() => prisma.modelCall.groupBy({
          by: ['userId'],
          where: { userId: { in: userIds }, at: { gte: from, lt: to } },
          _count: true,
          _sum: { totalTokens: true },
        }).then(results => new Map(results.map(r => [r.userId, {
          calls: (r._count as number) || 0,
          tokens: r._sum?.totalTokens ?? 0,
        }]))), new Map<string, { calls: number; tokens: number }>())
      : new Map<string, { calls: number; tokens: number }>(),

    // Retrieval events for evidence quality
    supportsModel(prisma, 'retrievalEvent')
      ? safe(() => prisma.retrievalEvent.groupBy({
          by: ['userId'],
          where: { userId: { in: userIds }, at: { gte: from, lt: to } },
          _count: true,
        }).then(async results => {
          const userWeakCounts = new Map<string, { total: number; weak: number }>();
          for (const r of results) {
            userWeakCounts.set(r.userId, { total: (r._count as number) || 0, weak: 0 });
          }
          // Get weak evidence counts
          const weakResults = await prisma.retrievalEvent.groupBy({
            by: ['userId'],
            where: {
              userId: { in: userIds },
              at: { gte: from, lt: to },
              OR: [
                { evidenceStrength: { lt: 0.35 } },
                { fallbackReasonCode: 'WEAK_EVIDENCE' },
              ],
            },
            _count: true,
          });
          for (const r of weakResults) {
            const data = userWeakCounts.get(r.userId);
            if (data) data.weak = (r._count as number) || 0;
          }
          return userWeakCounts;
        }), new Map<string, { total: number; weak: number }>())
      : new Map<string, { total: number; weak: number }>(),
  ]);

  // Get LLM error counts
  let errorCounts = new Map<string, number>();
  if (supportsModel(prisma, 'modelCall')) {
    const errors = await safe(() => prisma.modelCall.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds }, at: { gte: from, lt: to }, status: 'fail' },
      _count: true,
    }), []);
    errorCounts = new Map(errors.map(e => [e.userId, (e._count as number) || 0]));
  }

  // Build user rows
  const items: UserRow[] = page.map(u => {
    const llmData = llmCallsData.get(u.id) ?? { calls: 0, tokens: 0 };
    const errorCount = errorCounts.get(u.id) ?? 0;
    const retrievalInfo = retrievalData.get(u.id) ?? { total: 0, weak: 0 };

    return {
      userId: u.id,
      firstSeenAt: u.createdAt.toISOString(),
      lastSeenAt: u.updatedAt.toISOString(),
      messages: messagesCounts.get(u.id) ?? 0,
      uploads: uploadsCounts.get(u.id) ?? 0,
      llmCalls: llmData.calls,
      tokensTotal: llmData.tokens,
      llmErrorRate: llmData.calls > 0 ? Math.round((errorCount / llmData.calls) * 10000) / 100 : 0,
      weakEvidenceRate: retrievalInfo.total > 0 ? Math.round((retrievalInfo.weak / retrievalInfo.total) * 10000) / 100 : 0,
    };
  });

  return {
    range: rangeKey,
    items,
    ...(nextCursor ? { nextCursor } : {}),
  };
}

/**
 * Get detailed user stats
 */
export async function getUserDetail(
  prisma: PrismaClient,
  params: { userId: string; range?: string }
): Promise<UserDetailResult> {
  const rangeKey = normalizeRange(params.range, '7d');
  const window = parseRange(rangeKey);
  const { from, to } = window;
  const { userId } = params;
  const safe = async <T>(query: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await query();
    } catch {
      return fallback;
    }
  };

  // Get user
  const user = await safe(() => prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  }), null);

  if (!user) {
    return {
      range: rangeKey,
      user: {
        userId,
        firstSeenAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        messages: 0,
        uploads: 0,
        llmCalls: 0,
        tokensTotal: 0,
        llmErrorRate: 0,
        weakEvidenceRate: 0,
        email: undefined,
        role: undefined,
        conversationsCount: 0,
        sessionsCount: 0,
        topIntents: [],
        topDomains: [],
      },
    };
  }

  // Get stats in parallel
  const [
    messagesCount,
    uploadsCount,
    llmCallsAgg,
    errorCount,
    retrievalData,
    conversationsCount,
    sessionsCount,
    intentGroups,
    domainGroups,
  ] = await Promise.all([
    // Messages count
    supportsModel(prisma, 'conversation')
      ? safe(() => prisma.message.count({
          where: {
            createdAt: { gte: from, lt: to },
            conversation: { userId },
          },
        }), 0)
      : 0,

    // Uploads
    supportsModel(prisma, 'document')
      ? safe(() => prisma.document.count({
          where: { userId, createdAt: { gte: from, lt: to } },
        }), 0)
      : 0,

    // LLM calls
    supportsModel(prisma, 'modelCall')
      ? safe(() => prisma.modelCall.aggregate({
          where: { userId, at: { gte: from, lt: to } },
          _count: { _all: true },
          _sum: { totalTokens: true },
        }), null)
      : null,

    // LLM errors
    supportsModel(prisma, 'modelCall')
      ? safe(() => prisma.modelCall.count({
          where: { userId, at: { gte: from, lt: to }, status: 'fail' },
        }), 0)
      : 0,

    // Retrieval quality
    supportsModel(prisma, 'retrievalEvent')
      ? safe(() => Promise.all([
          prisma.retrievalEvent.count({ where: { userId, at: { gte: from, lt: to } } }),
          prisma.retrievalEvent.count({
            where: {
              userId,
              at: { gte: from, lt: to },
              OR: [
                { evidenceStrength: { lt: 0.35 } },
                { fallbackReasonCode: 'WEAK_EVIDENCE' },
              ],
            },
          }),
        ]), [0, 0] as [number, number])
      : [0, 0],

    // Conversations count
    supportsModel(prisma, 'conversation')
      ? safe(() => prisma.conversation.count({
          where: { userId, createdAt: { gte: from, lt: to } },
        }), 0)
      : 0,

    // Sessions count
    supportsModel(prisma, 'session')
      ? safe(() => prisma.session.count({
          where: { userId, createdAt: { gte: from, lt: to } },
        }), 0)
      : 0,

    // Top intents
    supportsModel(prisma, 'retrievalEvent')
      ? safe(() => prisma.retrievalEvent.groupBy({
          by: ['intent'],
          where: { userId, at: { gte: from, lt: to } },
          _count: true,
          orderBy: { _count: { intent: 'desc' } },
          take: 10,
        }), [])
      : [],

    // Top domains
    supportsModel(prisma, 'retrievalEvent')
      ? safe(() => prisma.retrievalEvent.groupBy({
          by: ['domain'],
          where: { userId, at: { gte: from, lt: to } },
          _count: true,
          orderBy: { _count: { domain: 'desc' } },
          take: 10,
        }), [])
      : [],
  ]);

  const llmCalls = llmCallsAgg?._count?._all ?? 0;
  const tokensTotal = llmCallsAgg?._sum?.totalTokens ?? 0;
  const [totalRetrieval, weakRetrieval] = retrievalData;

  return {
    range: rangeKey,
    user: {
      userId: user.id,
      email: user.email,
      role: user.role,
      firstSeenAt: user.createdAt.toISOString(),
      lastSeenAt: user.updatedAt.toISOString(),
      messages: messagesCount as number,
      uploads: uploadsCount as number,
      llmCalls,
      tokensTotal,
      llmErrorRate: llmCalls > 0 ? Math.round(((errorCount as number) / llmCalls) * 10000) / 100 : 0,
      weakEvidenceRate: totalRetrieval > 0 ? Math.round((weakRetrieval / totalRetrieval) * 10000) / 100 : 0,
      conversationsCount: conversationsCount as number,
      sessionsCount: sessionsCount as number,
      topIntents: intentGroups.map(g => ({ intent: g.intent, count: (g._count as number) || 0 })),
      topDomains: domainGroups.map(g => ({ domain: g.domain, count: (g._count as number) || 0 })),
    },
  };
}
