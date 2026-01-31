/* eslint-disable @typescript-eslint/no-explicit-any */

import type { AnalyticsConfig } from "../config";
import type { DateRange, LlmCostResponse } from "../types";
import TokenUsageRepo from "../repositories/tokenUsage.repo";

/**
 * llmCost.aggregator.ts (Koda)
 * ----------------------------
 * Builds the Admin "LLM Cost" payload:
 *  - totals: cost + tokens
 *  - breakdown by provider
 *  - breakdown by model
 *  - paginated TokenUsage table rows
 *
 * Source of truth: TokenUsage table (written by postgres telemetry sink).
 */

export interface LlmCostDeps {
  prisma: any;
  redis?: any;
  config: AnalyticsConfig;
}

export interface LlmCostInput {
  range: DateRange;

  // Optional filters
  userId?: string;
  conversationId?: string;
  provider?: string;
  model?: string;
  requestType?: string;
  success?: boolean;

  // Pagination
  limit?: number;
  cursor?: string | null;
}

function toDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export class LlmCostAggregator {
  private tokenRepo: TokenUsageRepo;
  private cfg: AnalyticsConfig;

  constructor(private deps: LlmCostDeps) {
    this.cfg = deps.config;
    this.tokenRepo = new TokenUsageRepo(deps.prisma, {
      maxLimit: deps.config.maxPageSize,
      defaultLimit: deps.config.defaultPageSize,
    });
  }

  async build(input: LlmCostInput): Promise<LlmCostResponse> {
    const filters = {
      range: input.range,
      userId: input.userId,
      conversationId: input.conversationId,
      provider: input.provider,
      model: input.model,
      requestType: input.requestType,
      success: input.success,
    };

    const [agg, page, byProvider, byModel] = await Promise.all([
      this.tokenRepo.aggregate(filters as any),
      this.tokenRepo.list(filters as any, { limit: input.limit, cursor: input.cursor || null }),
      this.groupByProvider(filters),
      this.groupByModel(filters),
    ]);

    return {
      range: input.range,
      totals: {
        totalCostUsd: agg.sum.totalCostUsd,
        totalTokens: agg.sum.totalTokens,
      },
      byProvider,
      byModel,
      page: page
        ? {
            items: page.items.map((r: any) => ({
              id: r.id,
              ts: r.ts,
              provider: r.provider,
              model: r.model,
              requestType: r.requestType,
              inputTokens: r.inputTokens,
              outputTokens: r.outputTokens,
              totalTokens: r.totalTokens,
              totalCostUsd: r.totalCostUsd,
              latencyMs: r.latencyMs ?? null,
              cached: r.cached ?? null,
            })),
            nextCursor: page.nextCursor,
          }
        : undefined,
    };
  }

  private async groupByProvider(filters: any) {
    const where = this.tokenWhere(filters);
    const rows = await this.deps.prisma.tokenUsage.groupBy({
      by: ["provider"],
      where,
      _sum: { totalCost: true, totalTokens: true },
      orderBy: { _sum: { totalCost: "desc" } },
      take: 20,
    });

    return rows.map((r: any) => ({
      provider: r.provider ?? "unknown",
      costUsd: Number(r._sum.totalCost ?? 0),
      tokens: Number(r._sum.totalTokens ?? 0),
    }));
  }

  private async groupByModel(filters: any) {
    const where = this.tokenWhere(filters);
    const rows = await this.deps.prisma.tokenUsage.groupBy({
      by: ["model"],
      where,
      _sum: { totalCost: true, totalTokens: true },
      orderBy: { _sum: { totalCost: "desc" } },
      take: 30,
    });

    return rows.map((r: any) => ({
      model: r.model ?? "unknown",
      costUsd: Number(r._sum.totalCost ?? 0),
      tokens: Number(r._sum.totalTokens ?? 0),
    }));
  }

  private tokenWhere(filters: any) {
    const where: any = {
      createdAt: { gte: toDate(filters.range.from), lt: toDate(filters.range.to) },
    };

    if (filters.userId) where.userId = filters.userId;
    if (filters.conversationId) where.conversationId = filters.conversationId;
    if (filters.provider) where.provider = filters.provider;
    if (filters.model) where.model = filters.model;
    if (filters.requestType) where.requestType = filters.requestType;
    if (typeof filters.success === "boolean") where.success = filters.success;

    return where;
  }
}

export default LlmCostAggregator;
