/**
 * Answer Quality Service
 * Evidence strength analysis and quality metrics
 */

import type { PrismaClient } from "@prisma/client";
import { parseRange, normalizeRange } from "./_shared/rangeWindow";
import { clampLimit } from "./_shared/clamp";
import { processPage, buildCursorClause } from "./_shared/pagination";
import { supportsModel } from "./_shared/prismaAdapter";

// Thresholds
const WEAK_EVIDENCE_THRESHOLD = 0.35;

export interface QualityTotals {
  total: number;
  weak: number;
  none: number;
  weakRate: number;
  noneRate: number;
}

export interface BreakdownItem {
  total: number;
  weakRate: number;
  avgEvidence: number;
}

export interface QualityBreakdown {
  byDomain: Array<{ domain: string } & BreakdownItem>;
  byIntent: Array<{ intent: string } & BreakdownItem>;
  byOperator: Array<{ operator: string } & BreakdownItem>;
}

export interface QualityQueryRow {
  at: string;
  userId: string;
  intent: string;
  operator: string;
  domain: string;
  evidenceStrength: number | null;
  fallbackReasonCode: string | null;
  sourcesCount: number | null;
  traceId: string;
}

export interface QualityResult {
  range: string;
  totals: QualityTotals;
  breakdown: QualityBreakdown;
  items: QualityQueryRow[];
  nextCursor?: string;
}

export interface GetQualityParams {
  range?: string;
  limit?: number;
  cursor?: string;
  domain?: string;
  intent?: string;
  operator?: string;
}

/**
 * Get answer quality metrics with breakdown
 * Falls back to Message data if RetrievalEvent is empty
 */
export async function getQuality(
  prisma: PrismaClient,
  params: GetQualityParams,
): Promise<QualityResult> {
  const rangeKey = normalizeRange(params.range, "7d");
  const window = parseRange(rangeKey);
  const limit = clampLimit(params.limit, 50);
  const cursorClause = buildCursorClause(params.cursor);

  const { from, to } = window;

  // Check if we have retrievalEvent data
  if (supportsModel(prisma, "retrievalEvent")) {
    const eventCount = await prisma.retrievalEvent.count({
      where: { at: { gte: from, lt: to } },
    });

    if (eventCount > 0) {
      return getQualityFromRetrievalEvents(
        prisma,
        params,
        rangeKey,
        window,
        limit,
        cursorClause,
      );
    }
  }

  // Fallback to Message-based metrics
  return getQualityFromMessages(prisma, rangeKey, window, limit);
}

/**
 * Get quality metrics from RetrievalEvent (detailed telemetry)
 */
async function getQualityFromRetrievalEvents(
  prisma: PrismaClient,
  params: GetQualityParams,
  rangeKey: string,
  window: { from: Date; to: Date },
  limit: number,
  cursorClause: Record<string, unknown>,
): Promise<QualityResult> {
  const { from, to } = window;

  // Build where clause
  const where: Record<string, unknown> = {
    at: { gte: from, lt: to },
  };

  if (params.domain) where.domain = params.domain;
  if (params.intent) where.intent = params.intent;
  if (params.operator) where.operator = params.operator;

  // Get all events for totals and breakdown (capped for performance)
  const allEvents = await prisma.retrievalEvent.findMany({
    where,
    take: 100000,
    select: {
      domain: true,
      intent: true,
      operator: true,
      evidenceStrength: true,
      fallbackReasonCode: true,
    },
  });

  // Calculate totals
  const total = allEvents.length;
  const weak = allEvents.filter(
    (e) =>
      (e.evidenceStrength !== null &&
        e.evidenceStrength < WEAK_EVIDENCE_THRESHOLD) ||
      e.fallbackReasonCode === "WEAK_EVIDENCE",
  ).length;
  const none = allEvents.filter(
    (e) =>
      e.evidenceStrength === null || e.fallbackReasonCode === "NO_EVIDENCE",
  ).length;

  const totals: QualityTotals = {
    total,
    weak,
    none,
    weakRate: total > 0 ? Math.round((weak / total) * 10000) / 100 : 0,
    noneRate: total > 0 ? Math.round((none / total) * 10000) / 100 : 0,
  };

  // Calculate breakdown by domain
  const domainMap = new Map<
    string,
    { total: number; weak: number; evidenceSum: number; evidenceCount: number }
  >();
  const intentMap = new Map<
    string,
    { total: number; weak: number; evidenceSum: number; evidenceCount: number }
  >();
  const operatorMap = new Map<
    string,
    { total: number; weak: number; evidenceSum: number; evidenceCount: number }
  >();

  for (const e of allEvents) {
    const isWeak =
      (e.evidenceStrength !== null &&
        e.evidenceStrength < WEAK_EVIDENCE_THRESHOLD) ||
      e.fallbackReasonCode === "WEAK_EVIDENCE";

    // Domain
    if (!domainMap.has(e.domain)) {
      domainMap.set(e.domain, {
        total: 0,
        weak: 0,
        evidenceSum: 0,
        evidenceCount: 0,
      });
    }
    const domainData = domainMap.get(e.domain)!;
    domainData.total++;
    if (isWeak) domainData.weak++;
    if (e.evidenceStrength !== null) {
      domainData.evidenceSum += e.evidenceStrength;
      domainData.evidenceCount++;
    }

    // Intent
    if (!intentMap.has(e.intent)) {
      intentMap.set(e.intent, {
        total: 0,
        weak: 0,
        evidenceSum: 0,
        evidenceCount: 0,
      });
    }
    const intentData = intentMap.get(e.intent)!;
    intentData.total++;
    if (isWeak) intentData.weak++;
    if (e.evidenceStrength !== null) {
      intentData.evidenceSum += e.evidenceStrength;
      intentData.evidenceCount++;
    }

    // Operator
    if (!operatorMap.has(e.operator)) {
      operatorMap.set(e.operator, {
        total: 0,
        weak: 0,
        evidenceSum: 0,
        evidenceCount: 0,
      });
    }
    const operatorData = operatorMap.get(e.operator)!;
    operatorData.total++;
    if (isWeak) operatorData.weak++;
    if (e.evidenceStrength !== null) {
      operatorData.evidenceSum += e.evidenceStrength;
      operatorData.evidenceCount++;
    }
  }

  // Build breakdown
  const breakdown: QualityBreakdown = {
    byDomain: Array.from(domainMap.entries())
      .map(([domain, data]) => ({
        domain,
        total: data.total,
        weakRate:
          data.total > 0
            ? Math.round((data.weak / data.total) * 10000) / 100
            : 0,
        avgEvidence:
          data.evidenceCount > 0
            ? Math.round((data.evidenceSum / data.evidenceCount) * 1000) / 1000
            : 0,
      }))
      .sort((a, b) => b.total - a.total),

    byIntent: Array.from(intentMap.entries())
      .map(([intent, data]) => ({
        intent,
        total: data.total,
        weakRate:
          data.total > 0
            ? Math.round((data.weak / data.total) * 10000) / 100
            : 0,
        avgEvidence:
          data.evidenceCount > 0
            ? Math.round((data.evidenceSum / data.evidenceCount) * 1000) / 1000
            : 0,
      }))
      .sort((a, b) => b.total - a.total),

    byOperator: Array.from(operatorMap.entries())
      .map(([operator, data]) => ({
        operator,
        total: data.total,
        weakRate:
          data.total > 0
            ? Math.round((data.weak / data.total) * 10000) / 100
            : 0,
        avgEvidence:
          data.evidenceCount > 0
            ? Math.round((data.evidenceSum / data.evidenceCount) * 1000) / 1000
            : 0,
      }))
      .sort((a, b) => b.total - a.total),
  };

  // Get paginated items
  const events = await prisma.retrievalEvent.findMany({
    where,
    take: limit + 1,
    ...cursorClause,
    orderBy: { at: "desc" },
    select: {
      id: true,
      at: true,
      userId: true,
      traceId: true,
      intent: true,
      operator: true,
      domain: true,
      evidenceStrength: true,
      fallbackReasonCode: true,
      sourcesCount: true,
    },
  });

  const { page, nextCursor } = processPage(events, limit);

  const items: QualityQueryRow[] = page.map((e) => ({
    at: e.at.toISOString(),
    userId: e.userId,
    intent: e.intent,
    operator: e.operator,
    domain: e.domain,
    evidenceStrength: e.evidenceStrength,
    fallbackReasonCode: e.fallbackReasonCode,
    sourcesCount: e.sourcesCount,
    traceId: e.traceId,
  }));

  return {
    range: rangeKey,
    totals,
    breakdown,
    items,
    ...(nextCursor ? { nextCursor } : {}),
  };
}

/**
 * Get quality metrics from Message table (fallback when no telemetry)
 * Shows conversation statistics since we don't have evidence scores
 */
async function getQualityFromMessages(
  prisma: PrismaClient,
  rangeKey: string,
  window: { from: Date; to: Date },
  limit: number,
): Promise<QualityResult> {
  const { from, to } = window;

  // Get message counts per conversation
  const conversations = await prisma.conversation.findMany({
    where: {
      createdAt: { gte: from, lt: to },
    },
    select: {
      id: true,
      userId: true,
      createdAt: true,
      _count: {
        select: { messages: true },
      },
      user: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  // Get user messages for the feed
  const userMessages = await prisma.message.findMany({
    where: {
      role: "user",
      createdAt: { gte: from, lt: to },
    },
    select: {
      id: true,
      createdAt: true,
      content: true,
      conversationId: true,
      conversation: {
        select: {
          userId: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const total = userMessages.length;

  // Build totals - without telemetry we show basic message counts
  const totals: QualityTotals = {
    total,
    weak: 0, // Can't determine without telemetry
    none: 0, // Can't determine without telemetry
    weakRate: 0,
    noneRate: 0,
  };

  // Build breakdown by conversation activity
  const breakdown: QualityBreakdown = {
    byDomain: [{ domain: "general", total, weakRate: 0, avgEvidence: 0 }],
    byIntent: [{ intent: "user_query", total, weakRate: 0, avgEvidence: 0 }],
    byOperator: [{ operator: "chat", total, weakRate: 0, avgEvidence: 0 }],
  };

  // Build items from messages
  const items: QualityQueryRow[] = userMessages.map((m) => ({
    at: m.createdAt.toISOString(),
    userId: m.conversation?.userId || "unknown",
    intent: "user_query",
    operator: "chat",
    domain: "general",
    evidenceStrength: null,
    fallbackReasonCode: null,
    sourcesCount: null,
    traceId: m.id,
  }));

  return {
    range: rangeKey,
    totals,
    breakdown,
    items,
  };
}
