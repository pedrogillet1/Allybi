/**
 * Overview Service
 * Dashboard KPIs and timeseries data
 */

import type { PrismaClient } from "@prisma/client";
import {
  parseRange,
  formatWindow,
  normalizeRange,
  type TimeWindow,
} from "./_shared/rangeWindow";
import { p50, p95 } from "./_shared/percentiles";
import { supportsModel } from "./_shared/prismaAdapter";

export interface OverviewKpis {
  dau: number;
  messages: number;
  conversationsCreated: number;
  uploads: number;
  allybiVisits: number;
  allybiClicks: number;
  allybiClickThroughRate: number;
  llmCalls: number;
  tokensTotal: number;
  llmErrorRate: number;
  weakEvidenceRate: number;
  noEvidenceRate: number;
  ingestionFailures: number;
  latencyMsP50: number;
  latencyMsP95: number;
}

export interface OverviewResult {
  range: string;
  window: { from: string; to: string };
  kpis: OverviewKpis;
}

export interface TimeseriesPoint {
  t: string;
  value: number;
}

export interface TimeseriesResult {
  metric: string;
  range: string;
  points: TimeseriesPoint[];
}

type MetricName =
  | "dau"
  | "messages"
  | "uploads"
  | "tokens"
  | "llm_errors"
  | "ingestion_failures"
  | "weak_evidence_rate"
  | "allybi_visits"
  | "allybi_clicks";

const ALLYBI_CLICK_EVENT_TYPES = [
  "ALLYBI_AD_CLICKED",
  "ALLYBI_OPEN_CLICKED",
  "ALLYBI_SUGGESTION_CLICKED",
  "ALLYBI_MESSAGE_SENT",
  "ALLYBI_APPLY_CLICKED",
  "SOURCE_PILL_CLICKED",
  "FILE_PILL_CLICKED",
] as const;

const ALLYBI_VISIT_EVENT_TYPES = [
  "ALLYBI_VISIT_STARTED",
  "ALLYBI_PUBLIC_VISIT_STARTED",
] as const;

/**
 * Get overview KPIs for the dashboard
 */
export async function getOverview(
  prisma: PrismaClient,
  params: { range?: string },
): Promise<OverviewResult> {
  const rangeKey = normalizeRange(params.range, "7d");
  const window = parseRange(rangeKey);

  const kpis = await calculateKpis(prisma, window);

  return {
    range: rangeKey,
    window: formatWindow(window),
    kpis,
  };
}

/**
 * Get timeseries data for a specific metric
 */
export async function getTimeseries(
  prisma: PrismaClient,
  params: { metric: string; range?: string },
): Promise<TimeseriesResult> {
  const rangeKey = normalizeRange(params.range, "7d");
  const window = parseRange(rangeKey);
  const metric = (params.metric || "dau") as MetricName;

  const points = await calculateTimeseries(prisma, window, metric, rangeKey);

  return {
    metric,
    range: rangeKey,
    points,
  };
}

async function calculateKpis(
  prisma: PrismaClient,
  window: TimeWindow,
): Promise<OverviewKpis> {
  const { from, to } = window;
  const safe = async <T>(query: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await query();
    } catch (error) {
      console.warn("[Admin][Overview] KPI query failed; using fallback value", {
        error: error instanceof Error ? error.message : String(error),
      });
      return fallback;
    }
  };

  // Run queries in parallel for performance
  const [
    dauResult,
    messagesCount,
    conversationsCount,
    uploadsCount,
    allybiVisitsCount,
    allybiClicksCount,
    llmCallsData,
    retrievalData,
    ingestionData,
    latencyData,
  ] = await Promise.all([
    // DAU: distinct users with activity
    supportsModel(prisma, "usageEvent")
      ? safe(
          () =>
            prisma.usageEvent.groupBy({
              by: ["userId"],
              where: {
                at: { gte: from, lt: to },
                eventType: { not: "ALLYBI_PUBLIC_VISIT_STARTED" },
              },
            }),
          [],
        )
      : [],

    // Messages count
    supportsModel(prisma, "message")
      ? safe(
          () =>
            prisma.message.count({
              where: { createdAt: { gte: from, lt: to } },
            }),
          0,
        )
      : 0,

    // Conversations created
    supportsModel(prisma, "conversation")
      ? safe(
          () =>
            prisma.conversation.count({
              where: { createdAt: { gte: from, lt: to } },
            }),
          0,
        )
      : 0,

    // Uploads (documents created)
    supportsModel(prisma, "document")
      ? safe(
          () =>
            prisma.document.count({
              where: { createdAt: { gte: from, lt: to } },
            }),
          0,
        )
      : 0,

    // Allybi visits (session start into Allybi surfaces)
    supportsModel(prisma, "usageEvent")
      ? safe(
          () =>
            prisma.usageEvent.count({
              where: {
                at: { gte: from, lt: to },
                eventType: { in: [...ALLYBI_VISIT_EVENT_TYPES] },
              },
            }),
          0,
        )
      : 0,

    // Allybi clicks (core interactions)
    supportsModel(prisma, "usageEvent")
      ? safe(
          () =>
            prisma.usageEvent.count({
              where: {
                at: { gte: from, lt: to },
                eventType: { in: [...ALLYBI_CLICK_EVENT_TYPES] },
              },
            }),
          0,
        )
      : 0,

    // LLM calls and tokens
    supportsModel(prisma, "modelCall")
      ? safe(
          () =>
            prisma.modelCall.aggregate({
              where: { at: { gte: from, lt: to } },
              _count: { _all: true },
              _sum: { totalTokens: true },
            }),
          null,
        )
      : null,

    // Retrieval events for evidence quality
    supportsModel(prisma, "retrievalEvent")
      ? safe(
          () =>
            prisma.retrievalEvent.findMany({
              where: { at: { gte: from, lt: to } },
              select: { evidenceStrength: true, fallbackReasonCode: true },
              take: 100000,
            }),
          [],
        )
      : [],

    // Ingestion events for failures
    supportsModel(prisma, "ingestionEvent")
      ? safe(
          () =>
            prisma.ingestionEvent.groupBy({
              by: ["status"],
              where: { at: { gte: from, lt: to } },
              _count: true,
            }),
          [],
        )
      : [],

    // Latency data from model calls
    supportsModel(prisma, "modelCall")
      ? safe(
          () =>
            prisma.modelCall.findMany({
              where: { at: { gte: from, lt: to }, durationMs: { not: null } },
              select: { durationMs: true },
              take: 10000,
            }),
          [],
        )
      : [],
  ]);

  // Calculate DAU
  const dau = Array.isArray(dauResult) ? dauResult.length : 0;

  // Calculate LLM stats
  const llmCalls = llmCallsData?._count?._all ?? 0;
  const tokensTotal = llmCallsData?._sum?.totalTokens ?? 0;
  const allybiVisits = Number(allybiVisitsCount || 0);
  const allybiClicks = Number(allybiClicksCount || 0);
  const allybiClickThroughRate =
    allybiVisits > 0 ? (allybiClicks / allybiVisits) * 100 : 0;

  // Calculate LLM error rate
  let llmErrorRate = 0;
  if (supportsModel(prisma, "modelCall") && llmCalls > 0) {
    const errorCount = await safe(
      () =>
        prisma.modelCall.count({
          where: { at: { gte: from, lt: to }, status: "fail" },
        }),
      0,
    );
    llmErrorRate = (errorCount / llmCalls) * 100;
  }

  // Calculate evidence quality rates
  let weakEvidenceRate = 0;
  let noEvidenceRate = 0;
  if (Array.isArray(retrievalData) && retrievalData.length > 0) {
    const total = retrievalData.length;
    const weakCount = retrievalData.filter(
      (r) =>
        (r.evidenceStrength !== null && r.evidenceStrength < 0.35) ||
        r.fallbackReasonCode === "WEAK_EVIDENCE",
    ).length;
    const noCount = retrievalData.filter(
      (r) =>
        r.evidenceStrength === null || r.fallbackReasonCode === "NO_EVIDENCE",
    ).length;
    weakEvidenceRate = (weakCount / total) * 100;
    noEvidenceRate = (noCount / total) * 100;
  }

  // Calculate ingestion failures
  let ingestionFailures = 0;
  if (Array.isArray(ingestionData)) {
    const failGroup = ingestionData.find((g) => g.status === "fail");
    ingestionFailures = (failGroup?._count as number) ?? 0;
  }

  // Calculate latency percentiles
  const latencies = Array.isArray(latencyData)
    ? latencyData.map((l) => l.durationMs ?? 0).filter((v) => v > 0)
    : [];
  const latencyMsP50 = p50(latencies);
  const latencyMsP95 = p95(latencies);

  return {
    dau,
    messages: messagesCount as number,
    conversationsCreated: conversationsCount as number,
    uploads: uploadsCount as number,
    allybiVisits,
    allybiClicks,
    allybiClickThroughRate: Math.round(allybiClickThroughRate * 100) / 100,
    llmCalls,
    tokensTotal,
    llmErrorRate: Math.round(llmErrorRate * 100) / 100,
    weakEvidenceRate: Math.round(weakEvidenceRate * 100) / 100,
    noEvidenceRate: Math.round(noEvidenceRate * 100) / 100,
    ingestionFailures,
    latencyMsP50,
    latencyMsP95,
  };
}

async function calculateTimeseries(
  prisma: PrismaClient,
  window: TimeWindow,
  metric: MetricName,
  rangeKey: string,
): Promise<TimeseriesPoint[]> {
  const { from, to } = window;

  // Determine bucket size based on range
  const bucketMs = rangeKey === "24h" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000; // hourly for 24h, daily otherwise
  const buckets: Map<string, number> = new Map();

  // Initialize buckets
  let current = new Date(from);
  while (current < to) {
    const key = current.toISOString();
    buckets.set(key, 0);
    current = new Date(current.getTime() + bucketMs);
  }

  // Get data based on metric
  switch (metric) {
    case "dau": {
      if (!supportsModel(prisma, "usageEvent")) break;
      const events = await prisma.usageEvent.findMany({
        where: { at: { gte: from, lt: to } },
        select: { userId: true, at: true },
        take: 100000,
      });

      // Group by bucket and count distinct users
      const bucketUsers: Map<string, Set<string>> = new Map();
      for (const e of events) {
        const bucketTime = new Date(
          Math.floor(e.at.getTime() / bucketMs) * bucketMs,
        ).toISOString();
        if (!bucketUsers.has(bucketTime))
          bucketUsers.set(bucketTime, new Set());
        bucketUsers.get(bucketTime)!.add(e.userId);
      }
      for (const [key, users] of bucketUsers) {
        buckets.set(key, users.size);
      }
      break;
    }

    case "messages": {
      if (!supportsModel(prisma, "message")) break;
      const messages = await prisma.message.findMany({
        where: { createdAt: { gte: from, lt: to } },
        select: { createdAt: true },
        take: 100000,
      });

      for (const m of messages) {
        const bucketTime = new Date(
          Math.floor(m.createdAt.getTime() / bucketMs) * bucketMs,
        ).toISOString();
        buckets.set(bucketTime, (buckets.get(bucketTime) ?? 0) + 1);
      }
      break;
    }

    case "uploads": {
      if (!supportsModel(prisma, "document")) break;
      const docs = await prisma.document.findMany({
        where: { createdAt: { gte: from, lt: to } },
        select: { createdAt: true },
        take: 100000,
      });

      for (const d of docs) {
        const bucketTime = new Date(
          Math.floor(d.createdAt.getTime() / bucketMs) * bucketMs,
        ).toISOString();
        buckets.set(bucketTime, (buckets.get(bucketTime) ?? 0) + 1);
      }
      break;
    }

    case "allybi_visits": {
      if (!supportsModel(prisma, "usageEvent")) break;
      const visits = await prisma.usageEvent.findMany({
        where: {
          at: { gte: from, lt: to },
          eventType: { in: [...ALLYBI_VISIT_EVENT_TYPES] },
        },
        select: { at: true },
        take: 100000,
      });

      for (const v of visits) {
        const bucketTime = new Date(
          Math.floor(v.at.getTime() / bucketMs) * bucketMs,
        ).toISOString();
        buckets.set(bucketTime, (buckets.get(bucketTime) ?? 0) + 1);
      }
      break;
    }

    case "allybi_clicks": {
      if (!supportsModel(prisma, "usageEvent")) break;
      const clicks = await prisma.usageEvent.findMany({
        where: {
          at: { gte: from, lt: to },
          eventType: { in: [...ALLYBI_CLICK_EVENT_TYPES] },
        },
        select: { at: true },
        take: 100000,
      });

      for (const c of clicks) {
        const bucketTime = new Date(
          Math.floor(c.at.getTime() / bucketMs) * bucketMs,
        ).toISOString();
        buckets.set(bucketTime, (buckets.get(bucketTime) ?? 0) + 1);
      }
      break;
    }

    case "tokens": {
      if (!supportsModel(prisma, "modelCall")) break;
      const calls = await prisma.modelCall.findMany({
        where: { at: { gte: from, lt: to } },
        select: { at: true, totalTokens: true },
        take: 100000,
      });

      for (const c of calls) {
        const bucketTime = new Date(
          Math.floor(c.at.getTime() / bucketMs) * bucketMs,
        ).toISOString();
        buckets.set(
          bucketTime,
          (buckets.get(bucketTime) ?? 0) + (c.totalTokens ?? 0),
        );
      }
      break;
    }

    case "llm_errors": {
      if (!supportsModel(prisma, "modelCall")) break;
      const errors = await prisma.modelCall.findMany({
        where: { at: { gte: from, lt: to }, status: "fail" },
        select: { at: true },
        take: 100000,
      });

      for (const e of errors) {
        const bucketTime = new Date(
          Math.floor(e.at.getTime() / bucketMs) * bucketMs,
        ).toISOString();
        buckets.set(bucketTime, (buckets.get(bucketTime) ?? 0) + 1);
      }
      break;
    }

    case "ingestion_failures": {
      if (!supportsModel(prisma, "ingestionEvent")) break;
      const failures = await prisma.ingestionEvent.findMany({
        where: { at: { gte: from, lt: to }, status: "fail" },
        select: { at: true },
        take: 100000,
      });

      for (const f of failures) {
        const bucketTime = new Date(
          Math.floor(f.at.getTime() / bucketMs) * bucketMs,
        ).toISOString();
        buckets.set(bucketTime, (buckets.get(bucketTime) ?? 0) + 1);
      }
      break;
    }

    case "weak_evidence_rate": {
      if (!supportsModel(prisma, "retrievalEvent")) break;
      const events = await prisma.retrievalEvent.findMany({
        where: { at: { gte: from, lt: to } },
        select: { at: true, evidenceStrength: true, fallbackReasonCode: true },
        take: 100000,
      });

      // Group by bucket
      const bucketData: Map<string, { total: number; weak: number }> =
        new Map();
      for (const e of events) {
        const bucketTime = new Date(
          Math.floor(e.at.getTime() / bucketMs) * bucketMs,
        ).toISOString();
        if (!bucketData.has(bucketTime))
          bucketData.set(bucketTime, { total: 0, weak: 0 });
        const data = bucketData.get(bucketTime)!;
        data.total++;
        if (
          (e.evidenceStrength !== null && e.evidenceStrength < 0.35) ||
          e.fallbackReasonCode === "WEAK_EVIDENCE"
        ) {
          data.weak++;
        }
      }
      for (const [key, data] of bucketData) {
        buckets.set(
          key,
          data.total > 0
            ? Math.round((data.weak / data.total) * 10000) / 100
            : 0,
        );
      }
      break;
    }
  }

  // Convert to array
  return Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([t, value]) => ({ t, value }));
}
