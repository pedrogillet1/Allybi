/* eslint-disable @typescript-eslint/no-explicit-any */

import type { AnalyticsConfig } from "../config";
import type { OverviewResponse, DateRange, HealthBadge, SeriesPoint } from "../types";
import TelemetryRepo from "../repositories/telemetry.repo";
import TokenUsageRepo from "../repositories/tokenUsage.repo";
import ApiPerfRepo from "../repositories/apiPerf.repo";
import ErrorLogsRepo from "../repositories/errorLogs.repo";
import DocumentsRepo from "../repositories/documents.repo";
import UsersRepo from "../repositories/users.repo";

/**
 * overview.aggregator.ts (Koda)
 * -----------------------------
 * Produces the admin "Overview" dashboard payload:
 *  - headline KPIs
 *  - simple series for charts
 *  - top issues (failures/fallbacks/format violations/language mismatch)
 *
 * Philosophy:
 *  - Read-only
 *  - Bounded and cache-friendly
 *  - Works even if some tables are empty
 */

export interface OverviewAggregatorDeps {
  prisma: any;
  redis?: any;
  config: AnalyticsConfig;
}

export interface OverviewQueryInput {
  range: DateRange;
  bucket?: "hour" | "day"; // default: "day" for >48h, else "hour"
}

function toDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function daysBetween(a: Date, b: Date) {
  return Math.max(0, (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function clampBucket(range: DateRange, preferred?: "hour" | "day"): "hour" | "day" {
  if (preferred) return preferred;
  const d = daysBetween(toDate(range.from), toDate(range.to));
  return d <= 2 ? "hour" : "day";
}

function bucketKey(d: Date, bucket: "hour" | "day") {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  if (bucket === "day") return `${yyyy}-${mm}-${dd}T00:00:00.000Z`;
  const hh = String(d.getUTCHours()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:00:00.000Z`;
}

function inc(map: Map<string, number>, key: string, by = 1) {
  map.set(key, (map.get(key) || 0) + by);
}

function topN(map: Map<string, number>, n: number) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, count]) => ({ key, count }));
}

function safeNum(x: any, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function makeBadges(cfg: AnalyticsConfig, kpis: any): HealthBadge[] {
  const badges: HealthBadge[] = [];

  if (typeof kpis.errorRate === "number") {
    if (kpis.errorRate >= cfg.thresholds.errorRateError) {
      badges.push({ status: "error", metric: "errorRate", value: kpis.errorRate, threshold: cfg.thresholds.errorRateError, reason: "High error rate" });
    } else if (kpis.errorRate >= cfg.thresholds.errorRateWarn) {
      badges.push({ status: "warn", metric: "errorRate", value: kpis.errorRate, threshold: cfg.thresholds.errorRateWarn, reason: "Elevated error rate" });
    }
  }

  if (typeof kpis.fallbackRate === "number" && kpis.fallbackRate >= cfg.thresholds.fallbackRateWarn) {
    badges.push({ status: "warn", metric: "fallbackRate", value: kpis.fallbackRate, threshold: cfg.thresholds.fallbackRateWarn, reason: "Fallback rate elevated" });
  }

  if (typeof kpis.avgTtftMs === "number") {
    if (kpis.avgTtftMs >= cfg.thresholds.ttftMsError) {
      badges.push({ status: "error", metric: "ttftMs", value: kpis.avgTtftMs, threshold: cfg.thresholds.ttftMsError, reason: "TTFT too high" });
    } else if (kpis.avgTtftMs >= cfg.thresholds.ttftMsWarn) {
      badges.push({ status: "warn", metric: "ttftMs", value: kpis.avgTtftMs, threshold: cfg.thresholds.ttftMsWarn, reason: "TTFT elevated" });
    }
  }

  if (typeof kpis.avgTotalMs === "number") {
    if (kpis.avgTotalMs >= cfg.thresholds.totalMsError) {
      badges.push({ status: "error", metric: "totalMs", value: kpis.avgTotalMs, threshold: cfg.thresholds.totalMsError, reason: "Latency too high" });
    } else if (kpis.avgTotalMs >= cfg.thresholds.totalMsWarn) {
      badges.push({ status: "warn", metric: "totalMs", value: kpis.avgTotalMs, threshold: cfg.thresholds.totalMsWarn, reason: "Latency elevated" });
    }
  }

  return badges;
}

export class OverviewAggregator {
  private telemetryRepo: TelemetryRepo;
  private tokenRepo: TokenUsageRepo;
  private apiPerfRepo: ApiPerfRepo;
  private errorRepo: ErrorLogsRepo;
  private docsRepo: DocumentsRepo;
  private usersRepo: UsersRepo;

  constructor(private deps: OverviewAggregatorDeps) {
    const cfg = deps.config;
    this.telemetryRepo = new TelemetryRepo(deps.prisma, { maxLimit: cfg.maxPageSize, defaultLimit: cfg.defaultPageSize });
    this.tokenRepo = new TokenUsageRepo(deps.prisma, { maxLimit: cfg.maxPageSize, defaultLimit: cfg.defaultPageSize });
    this.apiPerfRepo = new ApiPerfRepo(deps.prisma, { maxLimit: cfg.maxPageSize, defaultLimit: cfg.defaultPageSize });
    this.errorRepo = new ErrorLogsRepo(deps.prisma, { maxLimit: cfg.maxPageSize, defaultLimit: cfg.defaultPageSize });
    this.docsRepo = new DocumentsRepo(deps.prisma, { maxLimit: cfg.maxPageSize, defaultLimit: cfg.defaultPageSize });
    this.usersRepo = new UsersRepo(deps.prisma, { maxLimit: cfg.maxPageSize, defaultLimit: cfg.defaultPageSize });
  }

  async build(input: OverviewQueryInput): Promise<OverviewResponse> {
    const { range } = input;
    const bucket = clampBucket(range, input.bucket);
    const from = toDate(range.from);
    const to = toDate(range.to);

    // Pull a bounded slice of telemetry for series + top issues
    const telemPage = await this.telemetryRepo.list(
      {
        range,
      },
      { limit: 500 }
    );

    // KPI counts that should come from DB (fast counts)
    const [
      totalUsers,
      activeUsersApprox,
      docsBreakdown,
      queryAgg,
      tokenAgg,
      apiAgg,
      errorAgg,
    ] = await Promise.all([
      this.deps.prisma.user.count(),
      // Approximation: count users with recent activity telemetry; if you have a real user activity table, swap this.
      this.deps.prisma.analyticsUserActivity
        ? this.deps.prisma.analyticsUserActivity.count({ where: { date: { gte: from, lt: to } } }).catch(() => 0)
        : Promise.resolve(0),
      this.docsRepo.statusBreakdown({ range }),
      this.deps.prisma.queryTelemetry
        ? this.deps.prisma.queryTelemetry.aggregate({
            where: { timestamp: { gte: from, lt: to } },
            _count: { _all: true },
            _avg: { ttft: true, totalMs: true },
            _sum: { hadFallback: true as any }, // not all schemas support sum on boolean; handled below
          }).catch(() => null)
        : Promise.resolve(null),
      this.tokenRepo.aggregate({ range }),
      this.apiPerfRepo.aggregate({ range }),
      this.errorRepo.aggregate({ range }),
    ]);

    // Derived from telemetry slice (avoid heavy full scans)
    const seriesMessages = new Map<string, number>();
    const seriesRag = new Map<string, number>();
    const seriesErrors = new Map<string, number>();
    const seriesCost = new Map<string, number>();
    const seriesTtft = new Map<string, { sum: number; n: number }>();
    const seriesTotal = new Map<string, { sum: number; n: number }>();

    const failureCats = new Map<string, number>();
    const fallbackScenarios = new Map<string, number>();
    const langMismatch = new Map<string, number>();
    const formatViolations = new Map<string, number>();

    let messagesCount = 0;
    let ragQueriesCount = 0;
    let fallbackCount = 0;

    for (const row of telemPage.items || []) {
      const t = toDate(row.timestamp);
      if (t < from || t >= to) continue;

      const key = bucketKey(t, bucket);

      // Messages: count rows that look like chat stream completion or message saved
      if (row.messageId) {
        messagesCount++;
        inc(seriesMessages, key, 1);
      }

      // RAG queries: use heuristic: retrievalMethod present or chunksReturned > 0
      if (row.retrievalMethod || (row.chunksReturned || 0) > 0) {
        ragQueriesCount++;
        inc(seriesRag, key, 1);
      }

      // Errors
      if (row.hasErrors) {
        inc(seriesErrors, key, 1);
      }

      // Fallbacks
      if (row.hadFallback) {
        fallbackCount++;
        if (row.fallbackScenario) inc(fallbackScenarios, row.fallbackScenario, 1);
      }

      // Failure categories
      if (row.failureCategory) inc(failureCats, row.failureCategory, 1);

      // Language mismatch
      if (row.languageMismatch) {
        inc(langMismatch, row.resolvedLang || "mismatch", 1);
      }

      // Formatting violations
      if (Array.isArray(row.formattingViolations)) {
        for (const v of row.formattingViolations) {
          if (v) inc(formatViolations, String(v), 1);
        }
      }

      // TTFT / total latency series
      if (typeof row.ttft === "number") {
        const cur = seriesTtft.get(key) || { sum: 0, n: 0 };
        cur.sum += row.ttft;
        cur.n += 1;
        seriesTtft.set(key, cur);
      }
      if (typeof row.totalMs === "number") {
        const cur = seriesTotal.get(key) || { sum: 0, n: 0 };
        cur.sum += row.totalMs;
        cur.n += 1;
        seriesTotal.set(key, cur);
      }
    }

    // Cost series: use TokenUsage aggregate only, series optional; keep series empty unless you add a daily rollup table
    const totalCostUsd = tokenAgg?.sum?.totalCostUsd ?? 0;
    const totalTokens = tokenAgg?.sum?.totalTokens ?? 0;

    // Derived rates
    const errorRate = apiAgg?.total ? apiAgg.errorRate : undefined;
    const fallbackRate = ragQueriesCount > 0 ? fallbackCount / ragQueriesCount : 0;

    const avgTtftMs =
      queryAgg && queryAgg._avg && queryAgg._avg.ttft != null ? safeNum(queryAgg._avg.ttft) : avgFromSeries(seriesTtft);

    const avgTotalMs =
      queryAgg && queryAgg._avg && queryAgg._avg.totalMs != null ? safeNum(queryAgg._avg.totalMs) : avgFromSeries(seriesTotal);

    const kpis = {
      totalUsers,
      activeUsers: activeUsersApprox || undefined,
      totalDocuments: docsBreakdown.total,
      documentsReady: countStatus(docsBreakdown.byStatus, "ready"),
      documentsFailed: countStatus(docsBreakdown.byStatus, "failed"),
      totalConversations: await this.deps.prisma.conversation.count({ where: { isDeleted: false } }).catch(() => 0),
      totalMessages: messagesCount,
      totalRagQueries: ragQueriesCount,
      errorRate,
      fallbackRate,
      totalCostUsd,
      totalTokens,
      avgTtftMs,
      avgTotalMs,
    };

    const response: OverviewResponse = {
      range,
      kpis,
      badges: makeBadges(this.deps.config, kpis),
      series: {
        messages: mapSeries(seriesMessages),
        ragQueries: mapSeries(seriesRag),
        errors: mapSeries(seriesErrors),
        costUsd: totalCostUsd ? [{ t: bucketKey(toDate(range.to), bucket), v: totalCostUsd }] : [],
        ttftMs: mapAvgSeries(seriesTtft),
        totalMs: mapAvgSeries(seriesTotal),
      },
      topIssues: {
        failureCategories: topN(failureCats, 8),
        fallbackScenarios: topN(fallbackScenarios, 8),
        languageMismatches: topN(langMismatch, 6),
        formattingViolations: topN(formatViolations, 10),
      },
    };

    return response;
  }
}

function countStatus(byStatus: Array<{ key: string; count: number }>, key: string) {
  const hit = byStatus.find((x) => String(x.key).toLowerCase() === key);
  return hit ? hit.count : 0;
}

function mapSeries(map: Map<string, number>): SeriesPoint[] {
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([t, v]) => ({ t, v }));
}

function mapAvgSeries(map: Map<string, { sum: number; n: number }>): SeriesPoint[] {
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([t, v]) => ({ t, v: v.n ? v.sum / v.n : 0 }));
}

function avgFromSeries(map: Map<string, { sum: number; n: number }>): number {
  let sum = 0;
  let n = 0;
  for (const v of map.values()) {
    sum += v.sum;
    n += v.n;
  }
  return n ? sum / n : 0;
}
