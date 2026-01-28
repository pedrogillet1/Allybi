// backend/src/services/telemetry/telemetry.aggregations.ts
//
// Telemetry aggregations for the Admin Dashboard (50% coverage).
// - Read-only queries (no writes)
// - Deterministic, stable outputs
// - No user-facing microcopy
//
// Assumptions (Prisma models):
// - usageEvent
// - modelCall
// - retrievalEvent
// - ingestionEvent
//
// If your generated Prisma model names differ, adjust the (this.prisma as any).X references.

import type { PrismaClient } from "@prisma/client";
import type { TelemetryRange } from "./telemetry.types";

export type TimeseriesMetric =
  | "dau"
  | "messages"
  | "uploads"
  | "tokens"
  | "weak_evidence_rate"
  | "llm_errors"
  | "ingestion_failures";

export interface OverviewResult {
  range: TelemetryRange;
  window: { from: string; to: string };

  // Usage
  dau: number;
  messages: number;
  conversationsCreated: number;
  uploads: number;

  // Quality
  weakEvidenceRate: number; // 0..1 (based on retrieval events)
  noEvidenceRate: number; // 0..1

  // LLM
  llmCalls: number;
  tokensTotal: number;
  latencyMsP50: number | null;
  latencyMsP95: number | null;
  llmErrorRate: number; // 0..1

  // Ingestion
  ingestionFailures: number;
}

export interface PagedResult<T> {
  items: T[];
  nextCursor?: string;
}

export interface AdminUserRow {
  userId: string;
  firstSeenAt: string | null;
  lastSeenAt: string | null;

  messages: number;
  uploads: number;

  tokensTotal: number;
  llmCalls: number;
  llmErrorRate: number; // 0..1

  weakEvidenceRate: number; // 0..1
}

export interface AdminFileRow {
  documentId: string | null;
  filename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;

  uploadedAt: string | null;

  statusOk: number;
  statusFail: number;

  extractionMethod: string | null;
  chunkCountAvg: number | null;
  durationMsAvg: number | null;
}

export interface AdminQueryRow {
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
}

export interface AdminLLMRow {
  at: string;
  userId: string;

  provider: string;
  model: string;
  stage: string;

  status: "ok" | "fail";
  errorCode: string | null;

  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;

  firstTokenMs: number | null;
  durationMs: number | null;

  traceId: string;
  turnId: string | null;
}

export interface AdminErrorRow {
  at: string;
  userId: string;

  provider: string;
  model: string;
  stage: string;

  errorCode: string;
  traceId: string;
  turnId: string | null;
}

export interface TimeseriesPoint {
  t: string; // ISO bucket start
  value: number;
}

export class TelemetryAggregations {
  constructor(private readonly prisma: PrismaClient) {}

  /* ----------------------------- Overview ----------------------------- */

  async overview(range: TelemetryRange): Promise<OverviewResult> {
    const { from, to } = rangeToWindow(range);
    const window = { from: from.toISOString(), to: to.toISOString() };

    const usage = (this.prisma as any).usageEvent;
    const model = (this.prisma as any).modelCall;
    const retrieval = (this.prisma as any).retrievalEvent;
    const ingestion = (this.prisma as any).ingestionEvent;

    // Usage metrics
    const [dau, messages, conversationsCreated, uploads] = await Promise.all([
      usage.countDistinct?.("userId", { at: { gte: from, lt: to } }) ??
        countDistinctFallback(usage, "userId", { at: { gte: from, lt: to } }),
      usage.count({ where: { at: { gte: from, lt: to }, eventType: "CHAT_MESSAGE_SENT" } }),
      usage.count({ where: { at: { gte: from, lt: to }, eventType: "CONVERSATION_CREATED" } }),
      usage.count({ where: { at: { gte: from, lt: to }, eventType: "DOCUMENT_UPLOADED" } }),
    ]);

    // Retrieval quality rates
    const [retrievalTotal, weakCount, noCount] = await Promise.all([
      retrieval.count({ where: { at: { gte: from, lt: to } } }),
      retrieval.count({
        where: {
          at: { gte: from, lt: to },
          OR: [
            { fallbackReasonCode: "WEAK_EVIDENCE" },
            { evidenceStrength: { lt: 0.35 } },
          ],
        },
      }),
      retrieval.count({
        where: {
          at: { gte: from, lt: to },
          OR: [
            { fallbackReasonCode: "NO_EVIDENCE" },
            { evidenceStrength: { equals: null } },
          ],
        },
      }),
    ]);

    const weakEvidenceRate = ratio(weakCount, retrievalTotal);
    const noEvidenceRate = ratio(noCount, retrievalTotal);

    // LLM metrics
    const [llmCalls, tokensTotal, llmFails] = await Promise.all([
      model.count({ where: { at: { gte: from, lt: to } } }),
      sumNumberField(model, "totalTokens", { at: { gte: from, lt: to } }),
      model.count({ where: { at: { gte: from, lt: to }, status: "fail" } }),
    ]);

    const llmErrorRate = ratio(llmFails, llmCalls);

    const durations = await model.findMany({
      where: { at: { gte: from, lt: to }, durationMs: { not: null } },
      select: { durationMs: true },
      take: 2000, // safety cap
      orderBy: { at: "desc" },
    });

    const latencyValues = durations.map((d: any) => Number(d.durationMs)).filter(Number.isFinite);
    const latencyMsP50 = percentile(latencyValues, 50);
    const latencyMsP95 = percentile(latencyValues, 95);

    // Ingestion failures
    const ingestionFailures = await ingestion.count({
      where: { at: { gte: from, lt: to }, status: "fail" },
    });

    return {
      range,
      window,
      dau,
      messages,
      conversationsCreated,
      uploads,
      weakEvidenceRate,
      noEvidenceRate,
      llmCalls,
      tokensTotal,
      latencyMsP50,
      latencyMsP95,
      llmErrorRate,
      ingestionFailures,
    };
  }

  /* ----------------------------- Users ----------------------------- */

  async users(params: { range: TelemetryRange; limit: number; cursor?: string }): Promise<PagedResult<AdminUserRow>> {
    const { from, to } = rangeToWindow(params.range);
    const limit = clampLimit(params.limit, 50);

    // We page on userId deterministically.
    // Strategy:
    // 1) get distinct userIds from usage events (sorted)
    // 2) for each userId, compute stats (in parallel, capped)
    const usage = (this.prisma as any).usageEvent;

    const userIds = await distinctUserIdsPaged(usage, {
      from,
      to,
      limit,
      cursor: params.cursor,
    });

    const rows = await Promise.all(
      userIds.items.map((userId) => this.userSummary(userId, { from, to }))
    );

    return { items: rows, nextCursor: userIds.nextCursor };
  }

  async userDetail(params: { userId: string; range: TelemetryRange }): Promise<AdminUserRow> {
    const { from, to } = rangeToWindow(params.range);
    return this.userSummary(params.userId, { from, to });
  }

  private async userSummary(userId: string, window: { from: Date; to: Date }): Promise<AdminUserRow> {
    const usage = (this.prisma as any).usageEvent;
    const model = (this.prisma as any).modelCall;
    const retrieval = (this.prisma as any).retrievalEvent;

    const [firstSeen, lastSeen] = await Promise.all([
      usage.findFirst({
        where: { userId, at: { gte: window.from, lt: window.to } },
        orderBy: { at: "asc" },
        select: { at: true },
      }),
      usage.findFirst({
        where: { userId, at: { gte: window.from, lt: window.to } },
        orderBy: { at: "desc" },
        select: { at: true },
      }),
    ]);

    const [messages, uploads] = await Promise.all([
      usage.count({
        where: { userId, at: { gte: window.from, lt: window.to }, eventType: "CHAT_MESSAGE_SENT" },
      }),
      usage.count({
        where: { userId, at: { gte: window.from, lt: window.to }, eventType: "DOCUMENT_UPLOADED" },
      }),
    ]);

    const [llmCalls, llmFails, tokensTotal] = await Promise.all([
      model.count({ where: { userId, at: { gte: window.from, lt: window.to } } }),
      model.count({ where: { userId, at: { gte: window.from, lt: window.to }, status: "fail" } }),
      sumNumberField(model, "totalTokens", { userId, at: { gte: window.from, lt: window.to } }),
    ]);

    const [retrievalTotal, weakCount] = await Promise.all([
      retrieval.count({ where: { userId, at: { gte: window.from, lt: window.to } } }),
      retrieval.count({
        where: {
          userId,
          at: { gte: window.from, lt: window.to },
          OR: [{ fallbackReasonCode: "WEAK_EVIDENCE" }, { evidenceStrength: { lt: 0.35 } }],
        },
      }),
    ]);

    return {
      userId,
      firstSeenAt: firstSeen?.at ? new Date(firstSeen.at).toISOString() : null,
      lastSeenAt: lastSeen?.at ? new Date(lastSeen.at).toISOString() : null,
      messages,
      uploads,
      tokensTotal,
      llmCalls,
      llmErrorRate: ratio(llmFails, llmCalls),
      weakEvidenceRate: ratio(weakCount, retrievalTotal),
    };
  }

  /* ----------------------------- Files ----------------------------- */

  async files(params: { range: TelemetryRange; limit: number; cursor?: string }): Promise<PagedResult<AdminFileRow>> {
    const { from, to } = rangeToWindow(params.range);
    const limit = clampLimit(params.limit, 50);

    const ingestion = (this.prisma as any).ingestionEvent;

    // Page by (at,id) in ingestion logs. If you store fileId in ingestionEvent.documentId, we use that.
    const rows = await ingestion.findMany({
      where: { at: { gte: from, lt: to } },
      orderBy: [{ at: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        documentId: true,
        filename: true,
        mimeType: true,
        sizeBytes: true,
        status: true,
        extractionMethod: true,
        chunkCount: true,
        durationMs: true,
        at: true,
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    // Aggregate to “file rows” grouped by documentId/filename in this page window.
    // (MVP: simple view of ingestion rows. You can upgrade to groupBy later.)
    const items: AdminFileRow[] = page.map((r: any) => ({
      documentId: r.documentId ?? null,
      filename: r.filename ?? null,
      mimeType: r.mimeType ?? null,
      sizeBytes: r.sizeBytes ?? null,
      uploadedAt: r.at ? new Date(r.at).toISOString() : null,
      statusOk: r.status === "ok" ? 1 : 0,
      statusFail: r.status === "fail" ? 1 : 0,
      extractionMethod: r.extractionMethod ?? null,
      chunkCountAvg: r.chunkCount ?? null,
      durationMsAvg: r.durationMs ?? null,
    }));

    return {
      items,
      nextCursor: hasMore ? String(rows[limit].id) : undefined,
    };
  }

  async fileDetail(params: { fileId: string; range: TelemetryRange }): Promise<any> {
    const { from, to } = rangeToWindow(params.range);
    const ingestion = (this.prisma as any).ingestionEvent;

    // fileId may map to documentId or ingestionEvent.id depending on your system.
    // We try documentId match first, then fallback to id.
    const rows = await ingestion.findMany({
      where: {
        at: { gte: from, lt: to },
        OR: [{ documentId: params.fileId }, { id: params.fileId }],
      },
      orderBy: { at: "desc" },
      take: 200,
    });

    return { events: rows };
  }

  /* ----------------------------- Queries ----------------------------- */

  async queries(params: {
    range: TelemetryRange;
    limit: number;
    cursor?: string;
    domain?: string;
  }): Promise<PagedResult<AdminQueryRow>> {
    const { from, to } = rangeToWindow(params.range);
    const limit = clampLimit(params.limit, 50);

    const retrieval = (this.prisma as any).retrievalEvent;

    const where: any = { at: { gte: from, lt: to } };
    if (params.domain) where.domain = params.domain;

    const rows = await retrieval.findMany({
      where,
      orderBy: [{ at: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        at: true,
        userId: true,
        intent: true,
        operator: true,
        domain: true,
        docLockEnabled: true,
        strategy: true,
        evidenceStrength: true,
        refined: true,
        fallbackReasonCode: true,
        sourcesCount: true,
        navPillsUsed: true,
        traceId: true,
        turnId: true,
        conversationId: true,
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const items: AdminQueryRow[] = page.map((r: any) => ({
      at: r.at ? new Date(r.at).toISOString() : new Date().toISOString(),
      userId: String(r.userId),
      intent: String(r.intent),
      operator: String(r.operator),
      domain: String(r.domain),
      docLockEnabled: !!r.docLockEnabled,
      strategy: String(r.strategy),
      evidenceStrength: r.evidenceStrength ?? null,
      refined: r.refined ?? null,
      fallbackReasonCode: r.fallbackReasonCode ?? null,
      sourcesCount: r.sourcesCount ?? null,
      navPillsUsed: r.navPillsUsed ?? null,
      traceId: String(r.traceId),
      turnId: r.turnId ?? null,
      conversationId: r.conversationId ?? null,
    }));

    return {
      items,
      nextCursor: hasMore ? String(rows[limit].id) : undefined,
    };
  }

  /* ----------------------------- Quality ----------------------------- */

  async quality(params: { range: TelemetryRange; limit: number; cursor?: string }): Promise<any> {
    // MVP: reuse queries() output + add aggregate rates
    const { from, to } = rangeToWindow(params.range);
    const retrieval = (this.prisma as any).retrievalEvent;

    const [total, weak, none] = await Promise.all([
      retrieval.count({ where: { at: { gte: from, lt: to } } }),
      retrieval.count({
        where: { at: { gte: from, lt: to }, OR: [{ fallbackReasonCode: "WEAK_EVIDENCE" }, { evidenceStrength: { lt: 0.35 } }] },
      }),
      retrieval.count({
        where: { at: { gte: from, lt: to }, OR: [{ fallbackReasonCode: "NO_EVIDENCE" }, { evidenceStrength: { equals: null } }] },
      }),
    ]);

    const page = await this.queries({ range: params.range, limit: params.limit, cursor: params.cursor });

    return {
      totals: {
        total,
        weak,
        none,
        weakRate: ratio(weak, total),
        noneRate: ratio(none, total),
      },
      ...page,
    };
  }

  /* ----------------------------- LLM ----------------------------- */

  async llm(params: {
    range: TelemetryRange;
    limit: number;
    cursor?: string;
    provider?: string;
    model?: string;
  }): Promise<PagedResult<AdminLLMRow>> {
    const { from, to } = rangeToWindow(params.range);
    const limit = clampLimit(params.limit, 50);

    const modelCall = (this.prisma as any).modelCall;

    const where: any = { at: { gte: from, lt: to } };
    if (params.provider) where.provider = params.provider;
    if (params.model) where.model = params.model;

    const rows = await modelCall.findMany({
      where,
      orderBy: [{ at: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        at: true,
        userId: true,
        provider: true,
        model: true,
        stage: true,
        status: true,
        errorCode: true,
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
        firstTokenMs: true,
        durationMs: true,
        traceId: true,
        turnId: true,
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const items: AdminLLMRow[] = page.map((r: any) => ({
      at: r.at ? new Date(r.at).toISOString() : new Date().toISOString(),
      userId: String(r.userId),
      provider: String(r.provider),
      model: String(r.model),
      stage: String(r.stage),
      status: r.status,
      errorCode: r.errorCode ?? null,
      promptTokens: r.promptTokens ?? null,
      completionTokens: r.completionTokens ?? null,
      totalTokens: r.totalTokens ?? null,
      firstTokenMs: r.firstTokenMs ?? null,
      durationMs: r.durationMs ?? null,
      traceId: String(r.traceId),
      turnId: r.turnId ?? null,
    }));

    return {
      items,
      nextCursor: hasMore ? String(rows[limit].id) : undefined,
    };
  }

  async errors(params: { range: TelemetryRange; limit: number; cursor?: string }): Promise<PagedResult<AdminErrorRow>> {
    const { from, to } = rangeToWindow(params.range);
    const limit = clampLimit(params.limit, 50);

    const modelCall = (this.prisma as any).modelCall;

    const rows = await modelCall.findMany({
      where: {
        at: { gte: from, lt: to },
        status: "fail",
        errorCode: { not: null },
      },
      orderBy: [{ at: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        at: true,
        userId: true,
        provider: true,
        model: true,
        stage: true,
        errorCode: true,
        traceId: true,
        turnId: true,
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const items: AdminErrorRow[] = page.map((r: any) => ({
      at: r.at ? new Date(r.at).toISOString() : new Date().toISOString(),
      userId: String(r.userId),
      provider: String(r.provider),
      model: String(r.model),
      stage: String(r.stage),
      errorCode: String(r.errorCode),
      traceId: String(r.traceId),
      turnId: r.turnId ?? null,
    }));

    return {
      items,
      nextCursor: hasMore ? String(rows[limit].id) : undefined,
    };
  }

  /* ----------------------------- Timeseries ----------------------------- */

  async timeseries(params: { metric: TimeseriesMetric; range: TelemetryRange }): Promise<TimeseriesPoint[]> {
    const { from, to } = rangeToWindow(params.range);
    const bucketMs = bucketSizeMs(params.range);

    switch (params.metric) {
      case "dau":
        return this.timeseriesCountDistinct("usageEvent", "userId", { at: { gte: from, lt: to } }, bucketMs);
      case "messages":
        return this.timeseriesCount("usageEvent", { at: { gte: from, lt: to }, eventType: "CHAT_MESSAGE_SENT" }, bucketMs);
      case "uploads":
        return this.timeseriesCount("usageEvent", { at: { gte: from, lt: to }, eventType: "DOCUMENT_UPLOADED" }, bucketMs);
      case "tokens":
        return this.timeseriesSum("modelCall", "totalTokens", { at: { gte: from, lt: to } }, bucketMs);
      case "llm_errors":
        return this.timeseriesCount("modelCall", { at: { gte: from, lt: to }, status: "fail" }, bucketMs);
      case "ingestion_failures":
        return this.timeseriesCount("ingestionEvent", { at: { gte: from, lt: to }, status: "fail" }, bucketMs);
      case "weak_evidence_rate":
        return this.timeseriesWeakEvidenceRate({ from, to, bucketMs });
      default:
        return [];
    }
  }

  private async timeseriesCount(modelName: string, where: any, bucketMs: number): Promise<TimeseriesPoint[]> {
    const model = (this.prisma as any)[modelName];
    const rows = await model.findMany({
      where,
      select: { at: true },
      take: 50000, // safety cap
      orderBy: { at: "asc" },
    });
    return bucketCount(rows.map((r: any) => new Date(r.at).getTime()), bucketMs);
  }

  private async timeseriesCountDistinct(modelName: string, field: string, where: any, bucketMs: number): Promise<TimeseriesPoint[]> {
    const model = (this.prisma as any)[modelName];
    const rows = await model.findMany({
      where,
      select: { at: true, [field]: true },
      take: 100000,
      orderBy: { at: "asc" },
    });

    // bucket distinct sets
    const buckets = new Map<number, Set<string>>();
    for (const r of rows) {
      const t = new Date(r.at).getTime();
      const b = Math.floor(t / bucketMs) * bucketMs;
      const v = r[field];
      if (!v) continue;
      if (!buckets.has(b)) buckets.set(b, new Set());
      buckets.get(b)!.add(String(v));
    }

    return Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([b, set]) => ({ t: new Date(b).toISOString(), value: set.size }));
  }

  private async timeseriesSum(modelName: string, field: string, where: any, bucketMs: number): Promise<TimeseriesPoint[]> {
    const model = (this.prisma as any)[modelName];
    const rows = await model.findMany({
      where,
      select: { at: true, [field]: true },
      take: 100000,
      orderBy: { at: "asc" },
    });

    const buckets = new Map<number, number>();
    for (const r of rows) {
      const t = new Date(r.at).getTime();
      const b = Math.floor(t / bucketMs) * bucketMs;
      const v = Number(r[field]);
      if (!Number.isFinite(v)) continue;
      buckets.set(b, (buckets.get(b) ?? 0) + v);
    }

    return Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([b, sum]) => ({ t: new Date(b).toISOString(), value: sum }));
  }

  private async timeseriesWeakEvidenceRate(params: { from: Date; to: Date; bucketMs: number }): Promise<TimeseriesPoint[]> {
    const retrieval = (this.prisma as any).retrievalEvent;

    const rows = await retrieval.findMany({
      where: { at: { gte: params.from, lt: params.to } },
      select: { at: true, evidenceStrength: true, fallbackReasonCode: true },
      take: 100000,
      orderBy: { at: "asc" },
    });

    const total = new Map<number, number>();
    const weak = new Map<number, number>();

    for (const r of rows) {
      const t = new Date(r.at).getTime();
      const b = Math.floor(t / params.bucketMs) * params.bucketMs;

      total.set(b, (total.get(b) ?? 0) + 1);

      const isWeak =
        r.fallbackReasonCode === "WEAK_EVIDENCE" ||
        (typeof r.evidenceStrength === "number" && r.evidenceStrength < 0.35);

      if (isWeak) weak.set(b, (weak.get(b) ?? 0) + 1);
    }

    const keys = Array.from(total.keys()).sort((a, b) => a - b);
    return keys.map((b) => ({
      t: new Date(b).toISOString(),
      value: ratio(weak.get(b) ?? 0, total.get(b) ?? 0),
    }));
  }
}

/* ----------------------------- helpers ----------------------------- */

function clampLimit(n: unknown, fallback: number): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return Math.min(Math.max(Math.floor(v), 1), 200);
}

function rangeToWindow(range: TelemetryRange): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date(to);

  if (range === "24h") from.setHours(from.getHours() - 24);
  else if (range === "7d") from.setDate(from.getDate() - 7);
  else if (range === "30d") from.setDate(from.getDate() - 30);
  else from.setDate(from.getDate() - 90);

  return { from, to };
}

function bucketSizeMs(range: TelemetryRange): number {
  // deterministic default buckets
  if (range === "24h") return 60 * 60 * 1000; // 1 hour
  if (range === "7d") return 6 * 60 * 60 * 1000; // 6 hours
  return 24 * 60 * 60 * 1000; // 1 day
}

function ratio(num: number, den: number): number {
  if (!den) return 0;
  return num / den;
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[idx] ?? null;
}

async function sumNumberField(model: any, field: string, where: any): Promise<number> {
  // Prisma aggregate might not exist for all setups; fallback to findMany sum.
  try {
    const agg = await model.aggregate({
      where,
      _sum: { [field]: true },
    });
    const v = agg?._sum?.[field];
    return Number.isFinite(Number(v)) ? Number(v) : 0;
  } catch {
    const rows = await model.findMany({
      where,
      select: { [field]: true },
      take: 100000,
    });
    let s = 0;
    for (const r of rows) {
      const v = Number(r[field]);
      if (Number.isFinite(v)) s += v;
    }
    return s;
  }
}

async function countDistinctFallback(model: any, field: string, where: any): Promise<number> {
  const rows = await model.findMany({
    where,
    select: { [field]: true },
    take: 200000,
  });
  const set = new Set<string>();
  for (const r of rows) {
    const v = r[field];
    if (v) set.add(String(v));
  }
  return set.size;
}

function bucketCount(times: number[], bucketMs: number): TimeseriesPoint[] {
  const m = new Map<number, number>();
  for (const t of times) {
    const b = Math.floor(t / bucketMs) * bucketMs;
    m.set(b, (m.get(b) ?? 0) + 1);
  }
  return Array.from(m.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([b, c]) => ({ t: new Date(b).toISOString(), value: c }));
}

async function distinctUserIdsPaged(
  usageModel: any,
  params: { from: Date; to: Date; limit: number; cursor?: string }
): Promise<{ items: string[]; nextCursor?: string }> {
  // Deterministic approach:
  // - fetch distinct userIds by scanning events in window (MVP)
  // - sort lexicographically, page by cursor
  const rows = await usageModel.findMany({
    where: { at: { gte: params.from, lt: params.to } },
    select: { userId: true },
    take: 200000,
  });

  const all: string[] = Array.from(new Set(rows.map((r: any) => String(r.userId)))).sort() as string[];
  const start = params.cursor ? all.findIndex((u) => u === params.cursor) + 1 : 0;

  const page: string[] = all.slice(start, start + params.limit);
  const next: string | undefined = all[start + params.limit] ? all[start + params.limit - 1] : undefined;

  return { items: page, nextCursor: next };
}
