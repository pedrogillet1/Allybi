/* eslint-disable @typescript-eslint/no-explicit-any */

import type { DateRange } from "../types";

/**
 * apiPerf.repo.ts (Koda)
 * ----------------------
 * Read-only repository for APIPerformanceLog.
 *
 * Use cases:
 *  - Reliability dashboard: endpoint latency p50/p95, error spikes
 *  - Vendor/API health: pinecone/s3/gemini/openai call behavior
 *  - Debugging: see slow or failing endpoints
 *
 * Notes:
 *  - We keep payloads small by default (do not return requestData unless explicitly asked).
 */

export interface ApiPerfRepoConfig {
  maxLimit: number;
  defaultLimit: number;
}

export interface ApiPerfFilters {
  range: DateRange;
  service?: string;         // e.g. "s3", "pinecone", "openai", "gemini", "internal"
  endpoint?: string;        // substring match
  method?: string;          // GET/POST/etc
  success?: boolean;
  rateLimitHit?: boolean;
  userId?: string;
  conversationId?: string;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ApiPerfRow {
  id: string;
  ts: string;

  service: string;
  endpoint: string;
  method: string;

  statusCode: number;
  success: boolean;

  latencyMs?: number | null;
  retryCount?: number | null;
  rateLimitHit?: boolean | null;

  tokensUsed?: number | null;
  estimatedCost?: number | null;

  userId?: string | null;
  conversationId?: string | null;

  errorCode?: string | null;
  errorMessage?: string | null;
}

function clampInt(n: any, min: number, max: number, fallback: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

function toDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export class ApiPerfRepo {
  constructor(private prisma: any, private cfg: ApiPerfRepoConfig) {}

  async list(filters: ApiPerfFilters, opts: { limit?: number; cursor?: string | null } = {}): Promise<CursorPage<ApiPerfRow>> {
    const limit = clampInt(opts.limit, 1, this.cfg.maxLimit, this.cfg.defaultLimit);
    const cursor = opts.cursor || null;

    const where: any = {
      startedAt: { gte: toDate(filters.range.from), lt: toDate(filters.range.to) },
    };

    if (filters.service) where.service = filters.service;
    if (filters.method) where.method = filters.method;
    if (typeof filters.success === "boolean") where.success = filters.success;
    if (typeof filters.rateLimitHit === "boolean") where.rateLimitHit = filters.rateLimitHit;
    if (filters.userId) where.userId = filters.userId;
    if (filters.conversationId) where.conversationId = filters.conversationId;

    if (filters.endpoint) {
      where.endpoint = { contains: filters.endpoint, mode: "insensitive" };
    }

    const rows = await this.prisma.aPIPerformanceLog.findMany({
      where,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        service: true,
        endpoint: true,
        method: true,
        statusCode: true,
        success: true,
        errorCode: true,
        errorMessage: true,
        startedAt: true,
        latency: true,
        retryCount: true,
        rateLimitHit: true,
        tokensUsed: true,
        estimatedCost: true,
        userId: true,
        conversationId: true,
      },
    });

    const hasNext = rows.length > limit;
    const page = hasNext ? rows.slice(0, limit) : rows;
    const nextCursor = hasNext ? page[page.length - 1]?.id ?? null : null;

    return {
      items: page.map((r: any) => ({
        id: r.id,
        ts: new Date(r.startedAt).toISOString(),
        service: r.service,
        endpoint: r.endpoint,
        method: r.method,
        statusCode: r.statusCode,
        success: Boolean(r.success),
        latencyMs: r.latency ?? null,
        retryCount: r.retryCount ?? null,
        rateLimitHit: Boolean(r.rateLimitHit ?? false),
        tokensUsed: r.tokensUsed ?? null,
        estimatedCost: r.estimatedCost ?? null,
        userId: r.userId ?? null,
        conversationId: r.conversationId ?? null,
        errorCode: r.errorCode ?? null,
        errorMessage: r.errorMessage ?? null,
      })),
      nextCursor,
    };
  }

  /**
   * Lightweight aggregates for charts:
   * - p50/p95 latency
   * - error rate
   */
  async aggregate(filters: ApiPerfFilters) {
    const where: any = {
      startedAt: { gte: toDate(filters.range.from), lt: toDate(filters.range.to) },
    };

    if (filters.service) where.service = filters.service;
    if (filters.method) where.method = filters.method;
    if (filters.endpoint) where.endpoint = { contains: filters.endpoint, mode: "insensitive" };

    const total = await this.prisma.aPIPerformanceLog.count({ where });
    const errors = await this.prisma.aPIPerformanceLog.count({ where: { ...where, success: false } });

    // Prisma doesn't provide percentiles; use a small sample strategy or DB view later.
    const recent = await this.prisma.aPIPerformanceLog.findMany({
      where,
      take: 500,
      orderBy: { startedAt: "desc" },
      select: { latency: true },
    });

    const latencies = recent.map((x: any) => Number(x.latency ?? 0)).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);

    const p50 = percentile(latencies, 0.5);
    const p95 = percentile(latencies, 0.95);

    return {
      total,
      errors,
      errorRate: total > 0 ? errors / total : 0,
      p50LatencyMs: p50,
      p95LatencyMs: p95,
      sampleSize: latencies.length,
    };
  }
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return null;
  const idx = Math.floor(p * (sorted.length - 1));
  return sorted[idx] ?? null;
}

export default ApiPerfRepo;
