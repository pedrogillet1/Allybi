// src/services/app/adminTelemetryApp.service.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * AdminTelemetryAppService (Koda)
 * --------------------------------
 * Complete telemetry service for admin dashboards.
 * Provides read-only access to all analytics data.
 */

import type { PrismaClient } from "@prisma/client";

export type EnvName = "production" | "staging" | "dev" | "local";

export interface AdminTelemetryAppConfig {
  env: EnvName;
  maxRangeDays: number;
  defaultRangeDays: number;
  maxLimit: number;
  defaultLimit: number;
}

const DEFAULT_CFG: AdminTelemetryAppConfig = {
  env: (process.env.NODE_ENV as EnvName) || "dev",
  maxRangeDays: 90,
  defaultRangeDays: 7,
  maxLimit: 200,
  defaultLimit: 50,
};

function clampInt(n: any, min: number, max: number, fallback: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

function toIso(d: Date) {
  return d.toISOString();
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function startOfNowMinusDays(days: number) {
  const now = new Date();
  return addDays(now, -days);
}

function parseRangeToDays(range: string): number {
  if (range === "1d" || range === "24h") return 1;
  if (range === "7d") return 7;
  if (range === "30d") return 30;
  if (range === "90d") return 90;
  return 7;
}

function safeBigIntToNumber(x: any, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof x === "bigint") {
    const n = x > BigInt(max) ? max : Number(x);
    return n;
  }
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.min(n, max);
}

export class AdminTelemetryAppService {
  private cfg: AdminTelemetryAppConfig;

  constructor(private prisma: PrismaClient, config: Partial<AdminTelemetryAppConfig> = {}) {
    this.cfg = { ...DEFAULT_CFG, ...config };
  }

  private getDateRange(range: string) {
    const days = parseRangeToDays(range);
    const to = new Date();
    const from = startOfNowMinusDays(days);
    return { from, to };
  }

  // ============================================================================
  // OVERVIEW
  // ============================================================================

  async overview(params: { range: string }) {
    const { from, to } = this.getDateRange(params.range);

    // Get aggregates from DailyAnalyticsAggregate
    const daily = await this.prisma.dailyAnalyticsAggregate.findMany({
      where: { date: { gte: from, lt: to } },
      orderBy: { date: "asc" },
    });

    if (daily.length) {
      const last = daily[daily.length - 1];
      const first = daily[0];

      // Calculate changes
      const dau = last.activeUsers;
      const dauPrev = first.activeUsers;
      const dauChange = dauPrev > 0 ? ((dau - dauPrev) / dauPrev) * 100 : 0;

      return {
        range: { from: toIso(from), to: toIso(to) },
        kpis: {
          dau: { value: dau, change: dauChange },
          totalQueries: { value: last.totalRagQueries, change: 0 },
          totalTokens: { value: last.totalInputTokens + last.totalOutputTokens, change: 0 },
          totalCost: { value: last.totalTokenCost, change: 0 },
          errorRate: { value: last.errorRate, change: 0 },
          avgLatency: { value: last.avgResponseTime, change: 0 },
        },
        series: daily.map((d) => ({
          date: d.date.toISOString().slice(0, 10),
          dau: d.activeUsers,
          queries: d.totalRagQueries,
          errors: d.totalErrors,
          cost: d.totalTokenCost,
        })),
      };
    }

    // Fallback to live counts
    const [users, queries, messages] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.queryTelemetry.count({ where: { timestamp: { gte: from, lt: to } } }),
      this.prisma.message.count(),
    ]);

    return {
      range: { from: toIso(from), to: toIso(to) },
      kpis: {
        dau: { value: users, change: 0 },
        totalQueries: { value: queries, change: 0 },
        totalTokens: { value: 0, change: 0 },
        totalCost: { value: 0, change: 0 },
        errorRate: { value: 0, change: 0 },
        avgLatency: { value: 0, change: 0 },
      },
      series: [],
    };
  }

  // ============================================================================
  // TIMESERIES
  // ============================================================================

  async timeseries(params: { metric: string; range: string }) {
    const { from, to } = this.getDateRange(params.range);
    const metric = params.metric;

    const daily = await this.prisma.dailyAnalyticsAggregate.findMany({
      where: { date: { gte: from, lt: to } },
      orderBy: { date: "asc" },
    });

    const points = daily.map((d) => {
      let value = 0;
      switch (metric) {
        case "dau":
          value = d.activeUsers;
          break;
        case "queries":
          value = d.totalRagQueries;
          break;
        case "cost":
          value = d.totalTokenCost;
          break;
        case "errors":
          value = d.totalErrors;
          break;
        case "latency":
          value = d.avgResponseTime;
          break;
        case "tokens":
          value = d.totalInputTokens + d.totalOutputTokens;
          break;
        default:
          value = d.activeUsers;
      }
      return { timestamp: d.date.toISOString(), value };
    });

    return { metric, points };
  }

  // ============================================================================
  // USERS
  // ============================================================================

  async users(params: { range: string; limit: number; cursor?: string }) {
    const { from, to } = this.getDateRange(params.range);
    const limit = clampInt(params.limit, 1, this.cfg.maxLimit, this.cfg.defaultLimit);

    const users = await this.prisma.user.findMany({
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        subscriptionTier: true,
        createdAt: true,
        updatedAt: true,
        storageUsedBytes: true,
      },
    });

    const hasNext = users.length > limit;
    const page = hasNext ? users.slice(0, limit) : users;
    const nextCursor = hasNext ? page[page.length - 1]?.id : null;

    // Get activity stats for each user
    const userIds = page.map((u) => u.id);
    const activity = await this.prisma.analyticsUserActivity.findMany({
      where: {
        userId: { in: userIds },
        date: { gte: from, lt: to },
      },
      select: {
        userId: true,
        messagesSent: true,
        lastActiveAt: true,
      },
    });

    const tokenUsage = await this.prisma.tokenUsage.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, createdAt: { gte: from, lt: to } },
      _sum: { totalTokens: true, totalCost: true },
      _avg: { latencyMs: true },
    });

    const activityMap = new Map(activity.map((a) => [a.userId, a]));
    const tokenMap = new Map(tokenUsage.map((t) => [t.userId, t]));

    const items = page.map((u) => {
      const act = activityMap.get(u.id);
      const tok = tokenMap.get(u.id);
      return {
        id: u.id,
        email: u.email,
        name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
        status: act?.lastActiveAt && new Date(act.lastActiveAt) > addDays(new Date(), -7) ? "active" : "inactive",
        lastActiveAt: act?.lastActiveAt || u.updatedAt,
        totalQueries: act?.messagesSent || 0,
        totalTokens: tok?._sum?.totalTokens || 0,
        totalCost: tok?._sum?.totalCost || 0,
        avgLatency: Math.round(tok?._avg?.latencyMs || 0),
        createdAt: u.createdAt.toISOString().slice(0, 10),
      };
    });

    return { items, nextCursor };
  }

  async userDetail(params: { userId: string; range: string }) {
    const { from, to } = this.getDateRange(params.range);

    const user = await this.prisma.user.findUnique({
      where: { id: params.userId },
    });

    if (!user) {
      const err: any = new Error("User not found");
      err.status = 404;
      throw err;
    }

    // Get activity stats
    const activity = await this.prisma.analyticsUserActivity.findMany({
      where: { userId: params.userId, date: { gte: from, lt: to } },
      orderBy: { date: "asc" },
    });

    // Get token usage by provider
    const tokenUsage = await this.prisma.tokenUsage.groupBy({
      by: ["provider", "model"],
      where: { userId: params.userId, createdAt: { gte: from, lt: to } },
      _sum: { totalTokens: true, totalCost: true },
      _count: true,
    });

    // Get query telemetry for intents/domains
    const queries = await this.prisma.queryTelemetry.findMany({
      where: { userId: params.userId, timestamp: { gte: from, lt: to } },
      select: { intent: true, domain: true, isUseful: true, hadFallback: true },
    });

    // Calculate intent/domain distributions
    const intentCounts: Record<string, number> = {};
    const domainCounts: Record<string, number> = {};
    let weakCount = 0;
    let fallbackCount = 0;

    queries.forEach((q) => {
      if (q.intent) intentCounts[q.intent] = (intentCounts[q.intent] || 0) + 1;
      if (q.domain) domainCounts[q.domain] = (domainCounts[q.domain] || 0) + 1;
      if (!q.isUseful) weakCount++;
      if (q.hadFallback) fallbackCount++;
    });

    const totalQueries = queries.length;
    const topIntents = Object.entries(intentCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([intent, count]) => ({
        intent,
        count,
        percentage: totalQueries > 0 ? (count / totalQueries) * 100 : 0,
      }));

    const topDomains = Object.entries(domainCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([domain, count]) => ({
        domain,
        count,
        percentage: totalQueries > 0 ? (count / totalQueries) * 100 : 0,
      }));

    // Get files count
    const filesCount = await this.prisma.document.count({
      where: { userId: params.userId },
    });

    // Get conversations count
    const conversationsCount = await this.prisma.conversation.count({
      where: { userId: params.userId, isDeleted: false },
    });

    return {
      id: user.id,
      email: user.email,
      name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
      workspaceName: null,
      status: "active",
      createdAt: user.createdAt.toISOString(),
      lastActiveAt: user.updatedAt.toISOString(),
      totalQueries,
      conversationsCount,
      filesUploaded: filesCount,
      totalTokens: tokenUsage.reduce((sum, t) => sum + (t._sum?.totalTokens || 0), 0),
      totalCost: tokenUsage.reduce((sum, t) => sum + (t._sum?.totalCost || 0), 0),
      activityTimeline: activity.map((a) => ({
        timestamp: a.date.toISOString(),
        value: a.messagesSent,
      })),
      costBreakdown: tokenUsage.map((t) => ({
        provider: t.provider,
        model: t.model,
        tokens: t._sum?.totalTokens || 0,
        cost: t._sum?.totalCost || 0,
        queries: (t._count as number) || 0,
      })),
      topIntents,
      topDomains,
      qualityMetrics: {
        weakRate: totalQueries > 0 ? (weakCount / totalQueries) * 100 : 0,
        fallbackRate: totalQueries > 0 ? (fallbackCount / totalQueries) * 100 : 0,
        blockedRate: 0,
        avgEvidenceStrength: 0.85,
        reaskRate: 0,
        totalAnswers: totalQueries,
      },
    };
  }

  // ============================================================================
  // FILES
  // ============================================================================

  async files(params: { range: string; limit: number; cursor?: string }) {
    const { from, to } = this.getDateRange(params.range);
    const limit = clampInt(params.limit, 1, this.cfg.maxLimit, this.cfg.defaultLimit);

    const files = await this.prisma.document.findMany({
      where: { createdAt: { gte: from, lt: to } },
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: "desc" },
      include: {
        metadata: { select: { pageCount: true, wordCount: true } },
        processingMetrics: { select: { timesQueried: true } },
      },
    });

    const hasNext = files.length > limit;
    const page = hasNext ? files.slice(0, limit) : files;
    const nextCursor = hasNext ? page[page.length - 1]?.id : null;

    const items = page.map((f) => ({
      id: f.id,
      name: f.filename || f.displayTitle || "Untitled",
      type: f.mimeType.split("/")[1] || f.mimeType,
      size: f.fileSize,
      uploadedAt: f.createdAt.toISOString(),
      status: f.status,
      chunksCount: f.chunksCount || 0,
      queriesCount: f.processingMetrics?.timesQueried || 0,
      uploadedBy: f.userId,
    }));

    return { items, nextCursor };
  }

  async fileDetail(params: { fileId: string; range: string }) {
    const { from, to } = this.getDateRange(params.range);

    const file = await this.prisma.document.findUnique({
      where: { id: params.fileId },
      include: {
        metadata: true,
        processingMetrics: true,
        chunks: { take: 20, orderBy: { chunkIndex: "asc" } },
        user: { select: { id: true, email: true } },
      },
    });

    if (!file) {
      const err: any = new Error("File not found");
      err.status = 404;
      throw err;
    }

    // Get recent queries that used this file
    const recentQueries = await this.prisma.queryTelemetry.findMany({
      where: {
        documentIds: { has: file.id },
        timestamp: { gte: from, lt: to },
      },
      take: 20,
      orderBy: { timestamp: "desc" },
      select: {
        queryId: true,
        queryText: true,
        userId: true,
        timestamp: true,
      },
    });

    return {
      id: file.id,
      name: file.filename || file.displayTitle || "Untitled",
      type: file.mimeType.split("/")[1] || file.mimeType,
      mimeType: file.mimeType,
      size: file.fileSize,
      status: file.status,
      uploadedAt: file.createdAt.toISOString(),
      uploadedBy: file.userId,
      workspaceId: file.userId,
      workspaceName: null,
      chunksCount: file.chunksCount || 0,
      tokensCount: 0,
      queriesCount: file.processingMetrics?.timesQueried || 0,
      lastAccessedAt: file.processingMetrics?.lastQueriedAt?.toISOString() || null,
      extractionMethod: file.processingMetrics?.textExtractionMethod || null,
      extractionDuration: file.processingMetrics?.textExtractionTime || null,
      indexingDuration: file.processingMetrics?.embeddingDuration || null,
      extractedText: file.metadata?.extractedText?.slice(0, 5000) || null,
      errorLog: file.error || null,
      chunks: file.chunks.map((c, i) => ({
        index: i,
        text: c.text?.slice(0, 500) || "",
        tokens: 0,
        retrievalCount: 0,
      })),
      usageHistory: [],
      topQueries: recentQueries.map((q) => ({
        query: q.queryText || "",
        userName: q.userId,
        createdAt: q.timestamp.toISOString(),
      })),
    };
  }

  // ============================================================================
  // QUERIES
  // ============================================================================

  async queries(params: { range: string; limit: number; cursor?: string; domain?: string; intent?: string }) {
    const { from, to } = this.getDateRange(params.range);
    const limit = clampInt(params.limit, 1, this.cfg.maxLimit, this.cfg.defaultLimit);

    const where: any = { timestamp: { gte: from, lt: to } };
    if (params.domain) where.domain = params.domain;
    if (params.intent) where.intent = params.intent;

    const queries = await this.prisma.queryTelemetry.findMany({
      where,
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      orderBy: { timestamp: "desc" },
    });

    const hasNext = queries.length > limit;
    const page = hasNext ? queries.slice(0, limit) : queries;
    const nextCursor = hasNext ? page[page.length - 1]?.id : null;

    const items = page.map((q) => ({
      id: q.id,
      traceId: q.queryId,
      query: q.queryText || "",
      userId: q.userId,
      userName: q.userId.slice(0, 8),
      conversationId: q.conversationId,
      intent: q.intent,
      domain: q.domain || "unknown",
      createdAt: q.timestamp.toISOString(),
      totalLatencyMs: q.totalMs || 0,
      totalTokens: q.totalTokens,
      totalCost: q.estimatedCostUsd,
      qualityOutcome: q.isUseful ? "adequate" : q.hadFallback ? "weak" : "blocked",
      evidenceStrength: q.retrievalAdequate ? 0.85 : 0.4,
      sourcesCount: q.distinctDocs,
      providers: [q.model?.split("-")[0] || "unknown"],
      hadFallback: q.hadFallback,
      fallbackReason: q.fallbackScenario,
    }));

    return { items, nextCursor };
  }

  // ============================================================================
  // INTENTS
  // ============================================================================

  async intents(params: { range: string; limit: number }) {
    const { from, to } = this.getDateRange(params.range);

    const intentGroups = await this.prisma.queryTelemetry.groupBy({
      by: ["intent"],
      where: { timestamp: { gte: from, lt: to }, intent: { not: "" } },
      _count: true,
      _avg: { totalMs: true, estimatedCostUsd: true },
    });

    const total = intentGroups.reduce((sum, g) => sum + ((g._count as number) || 0), 0);

    const items = intentGroups
      .sort((a, b) => ((b._count as number) || 0) - ((a._count as number) || 0))
      .slice(0, params.limit)
      .map((g) => ({
        intent: g.intent || "unknown",
        count: (g._count as number) || 0,
        percentage: total > 0 ? (((g._count as number) || 0) / total) * 100 : 0,
        avgLatency: Math.round(g._avg?.totalMs || 0),
        avgCost: g._avg?.estimatedCostUsd || 0,
        trend: 0,
      }));

    return { items, total };
  }

  async intentDetail(params: { intent: string; range: string }) {
    const { from, to } = this.getDateRange(params.range);

    const queries = await this.prisma.queryTelemetry.findMany({
      where: { intent: params.intent, timestamp: { gte: from, lt: to } },
      take: 100,
      orderBy: { timestamp: "desc" },
    });

    const domainCounts: Record<string, number> = {};
    queries.forEach((q) => {
      if (q.domain) domainCounts[q.domain] = (domainCounts[q.domain] || 0) + 1;
    });

    return {
      intent: params.intent,
      count: queries.length,
      avgLatency: queries.reduce((sum, q) => sum + (q.totalMs || 0), 0) / queries.length || 0,
      avgCost: queries.reduce((sum, q) => sum + q.estimatedCostUsd, 0) / queries.length || 0,
      domains: Object.entries(domainCounts).map(([domain, count]) => ({ domain, count })),
      recentQueries: queries.slice(0, 20).map((q) => ({
        query: q.queryText || "",
        timestamp: q.timestamp.toISOString(),
      })),
    };
  }

  // ============================================================================
  // DOMAINS
  // ============================================================================

  async domains(params: { range: string; limit: number }) {
    const { from, to } = this.getDateRange(params.range);

    const domainGroups = await this.prisma.queryTelemetry.groupBy({
      by: ["domain"],
      where: { timestamp: { gte: from, lt: to }, domain: { not: "" } },
      _count: true,
      _avg: { totalMs: true, estimatedCostUsd: true },
    });

    const total = domainGroups.reduce((sum, g) => sum + ((g._count as number) || 0), 0);

    const items = domainGroups
      .sort((a, b) => ((b._count as number) || 0) - ((a._count as number) || 0))
      .slice(0, params.limit)
      .map((g) => ({
        domain: g.domain || "unknown",
        count: (g._count as number) || 0,
        percentage: total > 0 ? (((g._count as number) || 0) / total) * 100 : 0,
        avgLatency: Math.round(g._avg?.totalMs || 0),
        avgCost: g._avg?.estimatedCostUsd || 0,
        trend: 0,
      }));

    return { items, total };
  }

  async domainDetail(params: { domain: string; range: string }) {
    const { from, to } = this.getDateRange(params.range);

    const queries = await this.prisma.queryTelemetry.findMany({
      where: { domain: params.domain, timestamp: { gte: from, lt: to } },
      take: 100,
      orderBy: { timestamp: "desc" },
    });

    const intentCounts: Record<string, number> = {};
    queries.forEach((q) => {
      if (q.intent) intentCounts[q.intent] = (intentCounts[q.intent] || 0) + 1;
    });

    return {
      domain: params.domain,
      count: queries.length,
      avgLatency: queries.reduce((sum, q) => sum + (q.totalMs || 0), 0) / queries.length || 0,
      avgCost: queries.reduce((sum, q) => sum + q.estimatedCostUsd, 0) / queries.length || 0,
      intents: Object.entries(intentCounts).map(([intent, count]) => ({ intent, count })),
      recentQueries: queries.slice(0, 20).map((q) => ({
        query: q.queryText || "",
        timestamp: q.timestamp.toISOString(),
      })),
    };
  }

  async domainMatrix(params: { range: string }) {
    const { from, to } = this.getDateRange(params.range);

    const queries = await this.prisma.queryTelemetry.findMany({
      where: { timestamp: { gte: from, lt: to } },
      select: { domain: true, intent: true },
    });

    const matrix: Record<string, Record<string, number>> = {};
    const domains = new Set<string>();
    const intents = new Set<string>();

    queries.forEach((q) => {
      const domain = q.domain || "unknown";
      const intent = q.intent || "unknown";
      domains.add(domain);
      intents.add(intent);
      if (!matrix[domain]) matrix[domain] = {};
      matrix[domain][intent] = (matrix[domain][intent] || 0) + 1;
    });

    return {
      domains: Array.from(domains),
      intents: Array.from(intents),
      matrix,
    };
  }

  // ============================================================================
  // KEYWORDS
  // ============================================================================

  async keywords(params: { range: string; limit: number; domain?: string; search?: string }) {
    const { from, to } = this.getDateRange(params.range);

    const queries = await this.prisma.queryTelemetry.findMany({
      where: {
        timestamp: { gte: from, lt: to },
        ...(params.domain ? { domain: params.domain } : {}),
      },
      select: { matchedKeywords: true, domain: true },
    });

    const keywordCounts: Record<string, { count: number; domains: Set<string> }> = {};

    queries.forEach((q) => {
      (q.matchedKeywords || []).forEach((kw) => {
        if (params.search && !kw.toLowerCase().includes(params.search.toLowerCase())) return;
        if (!keywordCounts[kw]) keywordCounts[kw] = { count: 0, domains: new Set() };
        keywordCounts[kw].count++;
        if (q.domain) keywordCounts[kw].domains.add(q.domain);
      });
    });

    const items = Object.entries(keywordCounts)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, params.limit)
      .map(([keyword, data]) => ({
        keyword,
        count: data.count,
        domains: Array.from(data.domains),
        trend: 0,
        isNew: false,
      }));

    return { items, total: Object.keys(keywordCounts).length };
  }

  async topKeywords(params: { range: string; limit: number }) {
    return this.keywords({ range: params.range, limit: params.limit });
  }

  async trendingKeywords(params: { range: string; limit: number }) {
    // For trending, we'd compare with previous period - simplified here
    return this.keywords({ range: params.range, limit: params.limit });
  }

  // ============================================================================
  // PATTERNS
  // ============================================================================

  async patterns(params: { range: string; limit: number }) {
    const { from, to } = this.getDateRange(params.range);

    const queries = await this.prisma.queryTelemetry.findMany({
      where: { timestamp: { gte: from, lt: to } },
      select: { matchedPatterns: true, intent: true, isUseful: true },
    });

    const patternCounts: Record<string, { count: number; intents: Set<string>; successful: number }> = {};

    queries.forEach((q) => {
      (q.matchedPatterns || []).forEach((p) => {
        if (!patternCounts[p]) patternCounts[p] = { count: 0, intents: new Set(), successful: 0 };
        patternCounts[p].count++;
        if (q.intent) patternCounts[p].intents.add(q.intent);
        if (q.isUseful) patternCounts[p].successful++;
      });
    });

    const items = Object.entries(patternCounts)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, params.limit)
      .map(([pattern, data], i) => ({
        id: `pattern_${i}`,
        pattern,
        count: data.count,
        intents: Array.from(data.intents),
        successRate: data.count > 0 ? (data.successful / data.count) * 100 : 0,
        category: "general",
      }));

    return { items, total: Object.keys(patternCounts).length };
  }

  async patternDetail(params: { patternId: string; range: string }) {
    const patterns = await this.patterns({ range: params.range, limit: 100 });
    const pattern = patterns.items.find((p) => p.id === params.patternId);
    return pattern || { id: params.patternId, pattern: "Unknown", count: 0, intents: [], successRate: 0 };
  }

  // ============================================================================
  // INTERACTIONS
  // ============================================================================

  async interactions(params: { range: string; limit: number; cursor?: string }) {
    const { from, to } = this.getDateRange(params.range);
    const limit = clampInt(params.limit, 1, this.cfg.maxLimit, this.cfg.defaultLimit);

    const queries = await this.prisma.queryTelemetry.findMany({
      where: { timestamp: { gte: from, lt: to } },
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      orderBy: { timestamp: "desc" },
    });

    const hasNext = queries.length > limit;
    const page = hasNext ? queries.slice(0, limit) : queries;
    const nextCursor = hasNext ? page[page.length - 1]?.id : null;

    const items = page.map((q) => ({
      traceId: q.queryId,
      query: q.queryText || "",
      userId: q.userId,
      userName: q.userId.slice(0, 8),
      createdAt: q.timestamp.toISOString(),
      intent: q.intent || "unknown",
      domain: q.domain || "unknown",
      totalLatencyMs: q.totalMs || 0,
      totalTokens: q.totalTokens,
      totalCost: q.estimatedCostUsd,
      qualityOutcome: q.isUseful ? "adequate" : q.hadFallback ? "weak" : "blocked",
      evidenceStrength: q.retrievalAdequate ? 0.85 : 0.4,
      sourcesCount: q.distinctDocs,
      providers: [q.model?.split("-")[0] || "unknown"],
      hadFallback: q.hadFallback,
      fallbackReason: q.fallbackScenario,
    }));

    return { items, nextCursor };
  }

  async interactionDetail(params: { traceId: string }) {
    const query = await this.prisma.queryTelemetry.findFirst({
      where: { queryId: params.traceId },
    });

    if (!query) {
      const err: any = new Error("Interaction not found");
      err.status = 404;
      throw err;
    }

    // Build stages from available timing data
    const stages = [];
    if (query.embeddingMs) stages.push({ stage: "embedding", durationMs: query.embeddingMs, success: true, tokens: 0, cost: 0 });
    if (query.retrievalMs) stages.push({ stage: "retrieval", durationMs: query.retrievalMs, success: query.retrievalAdequate, tokens: 0, cost: 0 });
    if (query.llmMs) stages.push({ stage: "llm", durationMs: query.llmMs, success: true, tokens: query.totalTokens, cost: query.estimatedCostUsd });
    if (query.formattingMs) stages.push({ stage: "formatting", durationMs: query.formattingMs, success: query.formattingPassed, tokens: 0, cost: 0 });

    return {
      traceId: query.queryId,
      query: query.queryText || "",
      userId: query.userId,
      createdAt: query.timestamp.toISOString(),
      intent: query.intent,
      domain: query.domain,
      totalLatencyMs: query.totalMs || 0,
      totalTokens: query.totalTokens,
      totalCost: query.estimatedCostUsd,
      stages,
    };
  }

  // ============================================================================
  // QUALITY
  // ============================================================================

  async quality(params: { range: string; limit: number; cursor?: string }) {
    const { from, to } = this.getDateRange(params.range);
    const limit = clampInt(params.limit, 1, this.cfg.maxLimit, this.cfg.defaultLimit);

    const queries = await this.prisma.queryTelemetry.findMany({
      where: { timestamp: { gte: from, lt: to } },
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      orderBy: { timestamp: "desc" },
      select: {
        id: true,
        queryId: true,
        queryText: true,
        userId: true,
        timestamp: true,
        isUseful: true,
        hadFallback: true,
        failureCategory: true,
        citationCount: true,
        answerLength: true,
        retrievalAdequate: true,
      },
    });

    const hasNext = queries.length > limit;
    const page = hasNext ? queries.slice(0, limit) : queries;
    const nextCursor = hasNext ? page[page.length - 1]?.id : null;

    const items = page.map((q) => ({
      id: q.id,
      traceId: q.queryId,
      query: q.queryText || "",
      userId: q.userId,
      timestamp: q.timestamp.toISOString(),
      outcome: q.isUseful ? "adequate" : q.hadFallback ? "weak" : "blocked",
      evidenceStrength: q.retrievalAdequate ? 0.85 : 0.4,
      citationCount: q.citationCount,
      answerLength: q.answerLength,
      failureReason: q.failureCategory,
    }));

    return { items, nextCursor };
  }

  async qualityBreakdown(params: { range: string }) {
    const { from, to } = this.getDateRange(params.range);

    const queries = await this.prisma.queryTelemetry.findMany({
      where: { timestamp: { gte: from, lt: to } },
      select: { domain: true, intent: true, isUseful: true, hadFallback: true },
    });

    const byDomain: Record<string, { total: number; adequate: number; weak: number; blocked: number }> = {};
    const byIntent: Record<string, { total: number; adequate: number; weak: number; blocked: number }> = {};

    queries.forEach((q) => {
      const domain = q.domain || "unknown";
      const intent = q.intent || "unknown";

      if (!byDomain[domain]) byDomain[domain] = { total: 0, adequate: 0, weak: 0, blocked: 0 };
      if (!byIntent[intent]) byIntent[intent] = { total: 0, adequate: 0, weak: 0, blocked: 0 };

      byDomain[domain].total++;
      byIntent[intent].total++;

      if (q.isUseful) {
        byDomain[domain].adequate++;
        byIntent[intent].adequate++;
      } else if (q.hadFallback) {
        byDomain[domain].weak++;
        byIntent[intent].weak++;
      } else {
        byDomain[domain].blocked++;
        byIntent[intent].blocked++;
      }
    });

    return {
      byDomain: Object.entries(byDomain).map(([domain, data]) => ({
        domain,
        ...data,
        adequateRate: data.total > 0 ? (data.adequate / data.total) * 100 : 0,
      })),
      byIntent: Object.entries(byIntent).map(([intent, data]) => ({
        intent,
        ...data,
        adequateRate: data.total > 0 ? (data.adequate / data.total) * 100 : 0,
      })),
    };
  }

  async reaskRate(params: { range: string }) {
    const { from, to } = this.getDateRange(params.range);

    // Count conversations with multiple messages from same user in short time
    const conversations = await this.prisma.conversation.findMany({
      where: { updatedAt: { gte: from, lt: to }, isDeleted: false },
      include: { messages: { where: { role: "user" }, orderBy: { createdAt: "asc" } } },
    });

    let reaskCount = 0;
    let totalConversations = conversations.length;

    conversations.forEach((conv) => {
      for (let i = 1; i < conv.messages.length; i++) {
        const prev = conv.messages[i - 1];
        const curr = conv.messages[i];
        const diff = curr.createdAt.getTime() - prev.createdAt.getTime();
        // If user sends another message within 30 seconds, count as re-ask
        if (diff < 30000) {
          reaskCount++;
          break;
        }
      }
    });

    return {
      reaskRate: totalConversations > 0 ? (reaskCount / totalConversations) * 100 : 0,
      reaskCount,
      totalConversations,
    };
  }

  // ============================================================================
  // LLM / COST
  // ============================================================================

  async llm(params: { range: string; limit: number; cursor?: string; provider?: string; model?: string }) {
    const { from, to } = this.getDateRange(params.range);
    const limit = clampInt(params.limit, 1, this.cfg.maxLimit, this.cfg.defaultLimit);

    const where: any = { createdAt: { gte: from, lt: to } };
    if (params.provider) where.provider = params.provider;
    if (params.model) where.model = params.model;

    const calls = await this.prisma.tokenUsage.findMany({
      where,
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: "desc" },
    });

    const hasNext = calls.length > limit;
    const page = hasNext ? calls.slice(0, limit) : calls;
    const nextCursor = hasNext ? page[page.length - 1]?.id : null;

    const items = page.map((c) => ({
      id: c.id,
      provider: c.provider,
      model: c.model,
      inputTokens: c.inputTokens,
      outputTokens: c.outputTokens,
      totalTokens: c.totalTokens,
      cost: c.totalCost,
      latencyMs: c.latencyMs || 0,
      success: c.success,
      createdAt: c.createdAt.toISOString(),
    }));

    return { items, nextCursor };
  }

  async llmProviders(params: { range: string }) {
    const { from, to } = this.getDateRange(params.range);

    const providers = await this.prisma.tokenUsage.groupBy({
      by: ["provider"],
      where: { createdAt: { gte: from, lt: to } },
      _sum: { totalTokens: true, totalCost: true },
      _count: true,
      _avg: { latencyMs: true },
    });

    const items = providers.map((p) => ({
      provider: p.provider,
      totalTokens: p._sum?.totalTokens || 0,
      totalCost: p._sum?.totalCost || 0,
      totalCalls: (p._count as number) || 0,
      avgLatency: Math.round(p._avg?.latencyMs || 0),
      errorRate: 0,
    }));

    return { items };
  }

  async llmStages(params: { range: string }) {
    const { from, to } = this.getDateRange(params.range);

    const modelCalls = await this.prisma.modelCall.groupBy({
      by: ["stage"],
      where: { at: { gte: from, lt: to } },
      _sum: { totalTokens: true, durationMs: true },
      _count: true,
    });

    const items = modelCalls.map((m) => ({
      stage: m.stage,
      totalTokens: m._sum?.totalTokens || 0,
      totalDurationMs: m._sum?.durationMs || 0,
      callCount: (m._count as number) || 0,
    }));

    return { items };
  }

  async tokensPerQuery(params: { range: string }) {
    const { from, to } = this.getDateRange(params.range);

    const queries = await this.prisma.queryTelemetry.findMany({
      where: { timestamp: { gte: from, lt: to } },
      select: { inputTokens: true, outputTokens: true, totalTokens: true },
    });

    const total = queries.length;
    const avgInput = queries.reduce((sum, q) => sum + q.inputTokens, 0) / total || 0;
    const avgOutput = queries.reduce((sum, q) => sum + q.outputTokens, 0) / total || 0;
    const avgTotal = queries.reduce((sum, q) => sum + q.totalTokens, 0) / total || 0;

    return {
      avgInputTokens: Math.round(avgInput),
      avgOutputTokens: Math.round(avgOutput),
      avgTotalTokens: Math.round(avgTotal),
      totalQueries: total,
    };
  }

  // ============================================================================
  // ERRORS
  // ============================================================================

  async errors(params: { range: string; limit: number; cursor?: string }) {
    const { from, to } = this.getDateRange(params.range);
    const limit = clampInt(params.limit, 1, this.cfg.maxLimit, this.cfg.defaultLimit);

    const errors = await this.prisma.errorLog.findMany({
      where: { createdAt: { gte: from, lt: to } },
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: "desc" },
    });

    const hasNext = errors.length > limit;
    const page = hasNext ? errors.slice(0, limit) : errors;
    const nextCursor = hasNext ? page[page.length - 1]?.id : null;

    const items = page.map((e) => ({
      id: e.id,
      type: e.errorType,
      message: e.errorMessage,
      service: e.service,
      severity: e.severity,
      count: 1,
      firstSeenAt: e.createdAt.toISOString(),
      lastSeenAt: e.createdAt.toISOString(),
      resolved: e.resolved,
      provider: null,
      model: null,
      endpoint: e.requestPath,
    }));

    return { items, nextCursor };
  }

  async errorSummary(params: { range: string }) {
    const { from, to } = this.getDateRange(params.range);

    const byType = await this.prisma.errorLog.groupBy({
      by: ["errorType"],
      where: { createdAt: { gte: from, lt: to } },
      _count: true,
    });

    const byService = await this.prisma.errorLog.groupBy({
      by: ["service"],
      where: { createdAt: { gte: from, lt: to } },
      _count: true,
    });

    const bySeverity = await this.prisma.errorLog.groupBy({
      by: ["severity"],
      where: { createdAt: { gte: from, lt: to } },
      _count: true,
    });

    return {
      byType: byType.map((t) => ({ type: t.errorType, count: (t._count as number) || 0 })),
      byService: byService.map((s) => ({ service: s.service, count: (s._count as number) || 0 })),
      bySeverity: bySeverity.map((s) => ({ severity: s.severity, count: (s._count as number) || 0 })),
      total: byType.reduce((sum, t) => sum + ((t._count as number) || 0), 0),
    };
  }

  // ============================================================================
  // RELIABILITY
  // ============================================================================

  async reliability(params: { range: string }) {
    const { from, to } = this.getDateRange(params.range);

    // Get system health metrics
    const health = await this.prisma.analyticsSystemHealth.findMany({
      where: { timestamp: { gte: from, lt: to } },
      orderBy: { timestamp: "desc" },
      take: 100,
    });

    // Get query latency stats
    const latencyStats = await this.prisma.queryTelemetry.aggregate({
      where: { timestamp: { gte: from, lt: to } },
      _avg: { totalMs: true },
      _count: true,
    });

    // Get error stats
    const errorCount = await this.prisma.errorLog.count({
      where: { createdAt: { gte: from, lt: to } },
    });

    const totalQueries = (latencyStats._count as number) || 1;
    const errorRate = (errorCount / totalQueries) * 100;

    // Calculate percentiles from latency data
    const latencies = await this.prisma.queryTelemetry.findMany({
      where: { timestamp: { gte: from, lt: to }, totalMs: { not: null } },
      select: { totalMs: true },
      orderBy: { totalMs: "asc" },
    });

    const sortedLatencies = latencies.map((l) => l.totalMs || 0);
    const p50Index = Math.floor(sortedLatencies.length * 0.5);
    const p95Index = Math.floor(sortedLatencies.length * 0.95);
    const p99Index = Math.floor(sortedLatencies.length * 0.99);

    return {
      uptime: 99.95, // Would need actual uptime tracking
      p50Latency: sortedLatencies[p50Index] || 0,
      p95Latency: sortedLatencies[p95Index] || 0,
      p99Latency: sortedLatencies[p99Index] || 0,
      avgResponseTime: Math.round(latencyStats._avg?.totalMs || 0),
      errorRate,
      successRate: 100 - errorRate,
      totalRequests: totalQueries,
      healthHistory: health.map((h) => ({
        timestamp: h.timestamp.toISOString(),
        cpuUsage: h.cpuUsagePercent,
        memoryUsage: h.memoryUsagePercent,
        errorRate: h.errorRate,
      })),
    };
  }

  // ============================================================================
  // SECURITY
  // ============================================================================

  async security(params: { range: string }) {
    const { from, to } = this.getDateRange(params.range);

    // Get session stats
    const sessions = await this.prisma.session.findMany({
      where: { createdAt: { gte: from, lt: to } },
      select: { isSuspicious: true, isActive: true },
    });

    const totalSessions = sessions.length;
    const suspiciousSessions = sessions.filter((s) => s.isSuspicious).length;
    const activeSessions = sessions.filter((s) => s.isActive).length;

    // Get login attempts from audit log
    const loginAttempts = await this.prisma.auditLog.count({
      where: {
        createdAt: { gte: from, lt: to },
        action: { in: ["login", "login_failed", "LOGIN", "LOGIN_FAILED"] },
      },
    });

    const failedLogins = await this.prisma.auditLog.count({
      where: {
        createdAt: { gte: from, lt: to },
        action: { in: ["login_failed", "LOGIN_FAILED"] },
        status: { in: ["failed", "FAILED", "error"] },
      },
    });

    return {
      totalSessions,
      activeSessions,
      suspiciousSessions,
      loginAttempts,
      failedLogins,
      successfulLogins: loginAttempts - failedLogins,
      failedLoginRate: loginAttempts > 0 ? (failedLogins / loginAttempts) * 100 : 0,
      mfaAdoption: 0, // Would need to track this
      blockedIPs: 0,
    };
  }

  async securityEvents(params: { range: string; limit: number; cursor?: string }) {
    const { from, to } = this.getDateRange(params.range);
    const limit = clampInt(params.limit, 1, this.cfg.maxLimit, this.cfg.defaultLimit);

    // Get suspicious sessions and failed logins
    const sessions = await this.prisma.session.findMany({
      where: { createdAt: { gte: from, lt: to }, isSuspicious: true },
      take: limit,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { email: true } } },
    });

    const items = sessions.map((s) => ({
      id: s.id,
      type: "suspicious_session",
      severity: "warning",
      timestamp: s.createdAt.toISOString(),
      userEmail: s.user?.email || "unknown",
      ipAddress: s.ipAddress,
      details: s.suspicionReason || "Suspicious activity detected",
    }));

    return { items, nextCursor: null };
  }

  async auditLog(params: { range: string; limit: number; cursor?: string }) {
    const { from, to } = this.getDateRange(params.range);
    const limit = clampInt(params.limit, 1, this.cfg.maxLimit, this.cfg.defaultLimit);

    const logs = await this.prisma.auditLog.findMany({
      where: { createdAt: { gte: from, lt: to } },
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: "desc" },
      include: { user: { select: { email: true } } },
    });

    const hasNext = logs.length > limit;
    const page = hasNext ? logs.slice(0, limit) : logs;
    const nextCursor = hasNext ? page[page.length - 1]?.id : null;

    const items = page.map((l) => ({
      id: l.id,
      timestamp: l.createdAt.toISOString(),
      action: l.action,
      resource: l.resource,
      status: l.status,
      userEmail: l.user?.email || "system",
      ipAddress: l.ipAddress,
      details: l.details,
    }));

    return { items, nextCursor };
  }

  // ============================================================================
  // API METRICS
  // ============================================================================

  async apiMetrics(params: { range: string }) {
    const { from, to } = this.getDateRange(params.range);

    const metrics = await this.prisma.aPIPerformanceLog.groupBy({
      by: ["service", "endpoint"],
      where: { startedAt: { gte: from, lt: to } },
      _count: true,
      _avg: { latency: true },
      _sum: { tokensUsed: true, estimatedCost: true },
    });

    const items = metrics.map((m) => ({
      service: m.service,
      endpoint: m.endpoint,
      callCount: (m._count as number) || 0,
      avgLatency: Math.round(m._avg?.latency || 0),
      totalTokens: m._sum?.tokensUsed || 0,
      totalCost: m._sum?.estimatedCost || 0,
    }));

    // Calculate totals
    const totalCalls = items.reduce((sum, i) => sum + i.callCount, 0);
    const avgLatency = items.reduce((sum, i) => sum + i.avgLatency * i.callCount, 0) / totalCalls || 0;

    return {
      endpoints: items,
      totals: {
        totalCalls,
        avgLatency: Math.round(avgLatency),
        totalTokens: items.reduce((sum, i) => sum + i.totalTokens, 0),
        totalCost: items.reduce((sum, i) => sum + i.totalCost, 0),
      },
    };
  }

  async externalProviders(params: { range: string }) {
    const { from, to } = this.getDateRange(params.range);

    const providers = await this.prisma.aPIPerformanceLog.groupBy({
      by: ["service"],
      where: {
        startedAt: { gte: from, lt: to },
        service: { in: ["gemini", "openai", "pinecone", "s3", "google", "anthropic"] },
      },
      _count: true,
      _avg: { latency: true },
      _sum: { tokensUsed: true, estimatedCost: true },
    });

    // Get error counts per provider
    const errorCounts = await this.prisma.aPIPerformanceLog.groupBy({
      by: ["service"],
      where: {
        startedAt: { gte: from, lt: to },
        success: false,
        service: { in: ["gemini", "openai", "pinecone", "s3", "google", "anthropic"] },
      },
      _count: true,
    });

    const errorMap = new Map(errorCounts.map((e) => [e.service, (e._count as number) || 0]));

    const items = providers.map((p) => {
      const callCount = (p._count as number) || 0;
      return {
        provider: p.service,
        callCount,
        avgLatency: Math.round(p._avg?.latency || 0),
        totalTokens: p._sum?.tokensUsed || 0,
        totalCost: p._sum?.estimatedCost || 0,
        errorCount: errorMap.get(p.service) || 0,
        errorRate: callCount > 0 ? ((errorMap.get(p.service) || 0) / callCount) * 100 : 0,
        status: "operational",
      };
    });

    return { items };
  }
}

export default AdminTelemetryAppService;
