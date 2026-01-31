/* eslint-disable @typescript-eslint/no-explicit-any */

import type { DateRange } from "../types";

/**
 * tokenUsage.repo.ts (Koda)
 * -------------------------
 * Read-only repository for TokenUsage (LLM cost + tokens table).
 *
 * Goals:
 *  - Cursor pagination (id-based)
 *  - Filter by provider/model/requestType/user/conversation
 *  - Provide summary aggregates for dashboard
 */

export interface TokenUsageRepoConfig {
  maxLimit: number;
  defaultLimit: number;
}

export interface TokenUsageFilters {
  range: DateRange;
  userId?: string;
  conversationId?: string;
  provider?: string;
  model?: string;
  requestType?: string;
  success?: boolean;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface TokenUsageRow {
  id: string;
  ts: string; // ISO

  userId?: string | null;
  conversationId?: string | null;
  messageId?: string | null;

  provider: string;
  model: string;
  requestType: string;

  inputTokens: number;
  outputTokens: number;
  totalTokens: number;

  totalCostUsd: number;
  latencyMs?: number | null;

  success: boolean;
  cached?: boolean | null;
  cacheHit?: boolean | null;
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

export class TokenUsageRepo {
  constructor(private prisma: any, private cfg: TokenUsageRepoConfig) {}

  async list(filters: TokenUsageFilters, opts: { limit?: number; cursor?: string | null } = {}): Promise<CursorPage<TokenUsageRow>> {
    const limit = clampInt(opts.limit, 1, this.cfg.maxLimit, this.cfg.defaultLimit);
    const cursor = opts.cursor || null;

    const where: any = {
      createdAt: { gte: toDate(filters.range.from), lt: toDate(filters.range.to) },
    };

    if (filters.userId) where.userId = filters.userId;
    if (filters.conversationId) where.conversationId = filters.conversationId;
    if (filters.provider) where.provider = filters.provider;
    if (filters.model) where.model = filters.model;
    if (filters.requestType) where.requestType = filters.requestType;
    if (typeof filters.success === "boolean") where.success = filters.success;

    const rows = await this.prisma.tokenUsage.findMany({
      where,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        createdAt: true,
        userId: true,
        conversationId: true,
        messageId: true,
        provider: true,
        model: true,
        requestType: true,
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
        totalCost: true,
        latencyMs: true,
        success: true,
        wasCached: true,
        cacheHit: true,
      },
    });

    const hasNext = rows.length > limit;
    const page = hasNext ? rows.slice(0, limit) : rows;
    const nextCursor = hasNext ? page[page.length - 1]?.id ?? null : null;

    return {
      items: page.map((r: any) => ({
        id: r.id,
        ts: new Date(r.createdAt).toISOString(),

        userId: r.userId ?? null,
        conversationId: r.conversationId ?? null,
        messageId: r.messageId ?? null,

        provider: r.provider ?? "unknown",
        model: r.model ?? "unknown",
        requestType: r.requestType ?? "unknown",

        inputTokens: Number(r.inputTokens ?? 0),
        outputTokens: Number(r.outputTokens ?? 0),
        totalTokens: Number(r.totalTokens ?? 0),

        totalCostUsd: Number(r.totalCost ?? 0),
        latencyMs: r.latencyMs ?? null,

        success: Boolean(r.success),
        cached: Boolean(r.wasCached ?? false),
        cacheHit: Boolean(r.cacheHit ?? false),
      })),
      nextCursor,
    };
  }

  async aggregate(filters: TokenUsageFilters) {
    const where: any = {
      createdAt: { gte: toDate(filters.range.from), lt: toDate(filters.range.to) },
    };

    if (filters.userId) where.userId = filters.userId;
    if (filters.conversationId) where.conversationId = filters.conversationId;
    if (filters.provider) where.provider = filters.provider;
    if (filters.model) where.model = filters.model;
    if (filters.requestType) where.requestType = filters.requestType;
    if (typeof filters.success === "boolean") where.success = filters.success;

    const agg = await this.prisma.tokenUsage.aggregate({
      where,
      _sum: { inputTokens: true, outputTokens: true, totalTokens: true, totalCost: true },
      _count: { _all: true },
    });

    return {
      count: agg._count._all ?? 0,
      sum: {
        inputTokens: Number(agg._sum.inputTokens ?? 0),
        outputTokens: Number(agg._sum.outputTokens ?? 0),
        totalTokens: Number(agg._sum.totalTokens ?? 0),
        totalCostUsd: Number(agg._sum.totalCost ?? 0),
      },
    };
  }
}

export default TokenUsageRepo;
