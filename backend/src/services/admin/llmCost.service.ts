/**
 * LLM Cost Service
 * LLM call analytics, token usage, and cost tracking
 */

import type { PrismaClient } from "@prisma/client";
import { parseRange, normalizeRange } from "./_shared/rangeWindow";
import { clampLimit } from "./_shared/clamp";
import { processPage, buildCursorClause } from "./_shared/pagination";
import { p50, p95 } from "./_shared/percentiles";
import { supportsModel } from "./_shared/prismaAdapter";

export interface AdminLLMRow {
  at: string;
  userId: string;
  provider: string;
  model: string;
  stage: string;
  status: string;
  errorCode: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  firstTokenMs: number | null;
  durationMs: number | null;
  traceId: string;
  turnId: string | null;
  meta?: Record<string, unknown> | null;
}

export interface LLMListResult {
  range: string;
  items: AdminLLMRow[];
  nextCursor?: string;
}

export interface ProviderSummary {
  provider: string;
  calls: number;
  tokens: number;
  errorRate: number;
  latencyP50: number;
}

export interface ModelSummary {
  model: string;
  calls: number;
  tokens: number;
  errorRate: number;
  latencyP50: number;
}

export interface StageSummary {
  stage: string;
  calls: number;
  tokens: number;
  errorRate: number;
  latencyP50: number;
}

export interface LLMSummary {
  calls: number;
  tokensTotal: number;
  avgTokensPerCall: number;
  latencyMsP50: number;
  latencyMsP95: number;
  errorRate: number;
  byProvider: ProviderSummary[];
  byModel: ModelSummary[];
  byStage: StageSummary[];
}

export interface LLMSummaryResult {
  range: string;
  summary: LLMSummary;
}

export interface ListLLMCallsParams {
  range?: string;
  limit?: number;
  cursor?: string;
  provider?: string;
  model?: string;
  stage?: string;
}

/**
 * List LLM calls with optional filtering
 */
export async function listLlmCalls(
  prisma: PrismaClient,
  params: ListLLMCallsParams,
): Promise<LLMListResult> {
  const rangeKey = normalizeRange(params.range, "7d");
  const window = parseRange(rangeKey);
  const limit = clampLimit(params.limit, 50);
  const cursorClause = buildCursorClause(params.cursor);

  const { from, to } = window;

  // Check if we have modelCall model
  if (!supportsModel(prisma, "modelCall")) {
    return { range: rangeKey, items: [] };
  }

  // Build where clause
  const where: Record<string, unknown> = {
    at: { gte: from, lt: to },
  };

  if (params.provider) where.provider = params.provider;
  if (params.model) where.model = params.model;
  if (params.stage) where.stage = params.stage;

  // Get model calls
  const calls = await prisma.modelCall.findMany({
    where,
    take: limit + 1,
    ...cursorClause,
    orderBy: { at: "desc" },
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
      meta: true,
    },
  });

  const { page, nextCursor } = processPage(calls, limit);

  const items: AdminLLMRow[] = page.map((c) => ({
    at: c.at.toISOString(),
    userId: c.userId,
    provider: c.provider,
    model: c.model,
    stage: c.stage,
    status: c.status,
    errorCode: c.errorCode,
    promptTokens: c.promptTokens,
    completionTokens: c.completionTokens,
    totalTokens: c.totalTokens,
    firstTokenMs: c.firstTokenMs,
    durationMs: c.durationMs,
    traceId: c.traceId,
    turnId: c.turnId,
    meta:
      c.meta && typeof c.meta === "object"
        ? (c.meta as Record<string, unknown>)
        : null,
  }));

  return {
    range: rangeKey,
    items,
    ...(nextCursor ? { nextCursor } : {}),
  };
}

/**
 * Get LLM summary with breakdowns
 */
export async function getLlmSummary(
  prisma: PrismaClient,
  params: { range?: string },
): Promise<LLMSummaryResult> {
  const rangeKey = normalizeRange(params.range, "7d");
  const window = parseRange(rangeKey);

  const { from, to } = window;

  // Check if we have modelCall model
  if (!supportsModel(prisma, "modelCall")) {
    return {
      range: rangeKey,
      summary: {
        calls: 0,
        tokensTotal: 0,
        avgTokensPerCall: 0,
        latencyMsP50: 0,
        latencyMsP95: 0,
        errorRate: 0,
        byProvider: [],
        byModel: [],
        byStage: [],
      },
    };
  }

  // Get all calls for analysis (capped)
  const allCalls = await prisma.modelCall.findMany({
    where: { at: { gte: from, lt: to } },
    take: 100000,
    select: {
      provider: true,
      model: true,
      stage: true,
      status: true,
      totalTokens: true,
      durationMs: true,
    },
  });

  // Calculate totals
  const calls = allCalls.length;
  const tokensTotal = allCalls.reduce(
    (sum, c) => sum + (c.totalTokens ?? 0),
    0,
  );
  const errorCount = allCalls.filter((c) => c.status === "fail").length;
  const latencies = allCalls.map((c) => c.durationMs ?? 0).filter((v) => v > 0);

  // Calculate breakdowns
  const providerMap = new Map<
    string,
    { calls: number; tokens: number; errors: number; latencies: number[] }
  >();
  const modelMap = new Map<
    string,
    { calls: number; tokens: number; errors: number; latencies: number[] }
  >();
  const stageMap = new Map<
    string,
    { calls: number; tokens: number; errors: number; latencies: number[] }
  >();

  for (const c of allCalls) {
    // Provider
    if (!providerMap.has(c.provider)) {
      providerMap.set(c.provider, {
        calls: 0,
        tokens: 0,
        errors: 0,
        latencies: [],
      });
    }
    const providerData = providerMap.get(c.provider)!;
    providerData.calls++;
    providerData.tokens += c.totalTokens ?? 0;
    if (c.status === "fail") providerData.errors++;
    if (c.durationMs) providerData.latencies.push(c.durationMs);

    // Model
    if (!modelMap.has(c.model)) {
      modelMap.set(c.model, { calls: 0, tokens: 0, errors: 0, latencies: [] });
    }
    const modelData = modelMap.get(c.model)!;
    modelData.calls++;
    modelData.tokens += c.totalTokens ?? 0;
    if (c.status === "fail") modelData.errors++;
    if (c.durationMs) modelData.latencies.push(c.durationMs);

    // Stage
    if (!stageMap.has(c.stage)) {
      stageMap.set(c.stage, { calls: 0, tokens: 0, errors: 0, latencies: [] });
    }
    const stageData = stageMap.get(c.stage)!;
    stageData.calls++;
    stageData.tokens += c.totalTokens ?? 0;
    if (c.status === "fail") stageData.errors++;
    if (c.durationMs) stageData.latencies.push(c.durationMs);
  }

  // Build summary
  const summary: LLMSummary = {
    calls,
    tokensTotal,
    avgTokensPerCall: calls > 0 ? Math.round(tokensTotal / calls) : 0,
    latencyMsP50: p50(latencies),
    latencyMsP95: p95(latencies),
    errorRate: calls > 0 ? Math.round((errorCount / calls) * 10000) / 100 : 0,

    byProvider: Array.from(providerMap.entries())
      .map(([provider, data]) => ({
        provider,
        calls: data.calls,
        tokens: data.tokens,
        errorRate:
          data.calls > 0
            ? Math.round((data.errors / data.calls) * 10000) / 100
            : 0,
        latencyP50: p50(data.latencies),
      }))
      .sort((a, b) => b.calls - a.calls),

    byModel: Array.from(modelMap.entries())
      .map(([model, data]) => ({
        model,
        calls: data.calls,
        tokens: data.tokens,
        errorRate:
          data.calls > 0
            ? Math.round((data.errors / data.calls) * 10000) / 100
            : 0,
        latencyP50: p50(data.latencies),
      }))
      .sort((a, b) => b.calls - a.calls),

    byStage: Array.from(stageMap.entries())
      .map(([stage, data]) => ({
        stage,
        calls: data.calls,
        tokens: data.tokens,
        errorRate:
          data.calls > 0
            ? Math.round((data.errors / data.calls) * 10000) / 100
            : 0,
        latencyP50: p50(data.latencies),
      }))
      .sort((a, b) => b.calls - a.calls),
  };

  return {
    range: rangeKey,
    summary,
  };
}
