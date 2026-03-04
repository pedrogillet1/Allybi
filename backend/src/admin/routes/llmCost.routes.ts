/**
 * LLM Cost Routes
 * GET /api/admin/llm-cost
 */

import { Router, Request, Response } from "express";
import prisma from "../../config/database";
import { listLlmCalls, getLlmSummary } from "../../services/admin";
import {
  parseRange,
  normalizeRange,
} from "../../services/admin/_shared/rangeWindow";
import { getGoogleMetrics } from "../../services/admin/googleMetrics.service";
import { getOptionalBank } from "../../services/core/banks/bankLoader.service";
import {
  computeCostUsd,
  lookupCostEntry,
  type CostTable,
} from "../../services/llm/core/llmCostCalculator";
import { canonicalizeProviderWithUnknown } from "../../services/llm/core/providerNormalization";

const router = Router();

type CostDiagnostics = {
  pricedCalls: number;
  callsWithUsage: number;
  familyMatchedCalls: number;
  unpricedModelKeys: Set<string>;
};

function calculateCallCost(
  provider: string,
  model: string,
  promptTokens: number | null,
  completionTokens: number | null,
  costTable: CostTable | null,
  diagnostics?: CostDiagnostics,
): number {
  const canonicalProvider = canonicalizeProviderWithUnknown(provider);
  const pricedProvider = canonicalProvider === "unknown" ? String(provider || "") : canonicalProvider;

  const usagePresent = (promptTokens ?? 0) > 0 || (completionTokens ?? 0) > 0;
  if (usagePresent && diagnostics) diagnostics.callsWithUsage += 1;

  const lookup = lookupCostEntry(
    pricedProvider,
    model,
    costTable,
  );
  if (usagePresent && lookup.entry && diagnostics) {
    diagnostics.pricedCalls += 1;
    if (lookup.matchedBy === "family") diagnostics.familyMatchedCalls += 1;
  } else if (usagePresent && !lookup.entry && diagnostics) {
    diagnostics.unpricedModelKeys.add(`${pricedProvider}:${model}`);
  }

  return computeCostUsd(
    pricedProvider,
    model,
    promptTokens,
    completionTokens,
    costTable,
  );
}

/**
 * GET /api/admin/llm-cost
 * Returns LLM cost summary with breakdowns
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const range = (req.query.range as string) || "7d";
    const rangeKey = normalizeRange(range, "7d");
    const window = parseRange(rangeKey);

    const costTable = getOptionalBank<CostTable>("llm_cost_table");
    const pricingSource = costTable
      ? String(
          (costTable as unknown as { _meta?: { version?: string } })._meta
            ?.version || "unknown",
        )
      : "missing";

    const [result, google] = await Promise.all([
      getLlmSummary(prisma, { range: rangeKey }),
      getGoogleMetrics(prisma, window),
    ]);

    // Get recent calls for cost calculation
    const recentCalls = await listLlmCalls(prisma, {
      range: rangeKey,
      limit: 10000,
    });

    // Calculate total cost and cost per model
    let totalCostUsd = 0;
    const modelCosts = new Map<string, { tokens: number; cost: number }>();
    const costDiagnostics: CostDiagnostics = {
      pricedCalls: 0,
      callsWithUsage: 0,
      familyMatchedCalls: 0,
      unpricedModelKeys: new Set<string>(),
    };
    const laneStats = new Map<
      string,
      { calls: number; fallbackCalls: number }
    >();

    for (const call of recentCalls.items) {
      const cost = calculateCallCost(
        call.provider,
        call.model,
        call.promptTokens,
        call.completionTokens,
        costTable,
        costDiagnostics,
      );
      totalCostUsd += cost;

      const existing = modelCosts.get(call.model) || { tokens: 0, cost: 0 };
      existing.tokens += call.totalTokens || 0;
      existing.cost += cost;
      modelCosts.set(call.model, existing);

      const meta =
        call.meta && typeof call.meta === "object"
          ? (call.meta as Record<string, unknown>)
          : {};
      const lane = String(meta.routeLane || "unknown");
      const fallbackUsed =
        meta.fallbackUsed === true || Number(meta.fallbackRank ?? 0) > 0;
      const laneEntry = laneStats.get(lane) || { calls: 0, fallbackCalls: 0 };
      laneEntry.calls += 1;
      if (fallbackUsed) laneEntry.fallbackCalls += 1;
      laneStats.set(lane, laneEntry);
    }

    // Transform byModel to chart format for frontend with actual costs
    const costByModel = Array.from(modelCosts.entries())
      .map(([model, data]) => ({
        label: model,
        valueUsd: Math.round(data.cost * 10000) / 10000, // Round to 4 decimals
        tokens: data.tokens,
      }))
      .sort((a, b) => b.valueUsd - a.valueUsd);

    // Count recent errors
    const recentErrors = recentCalls.items.filter(
      (c) => c.status === "fail",
    ).length;
    const compositionLaneBreakdown = Array.from(laneStats.entries())
      .map(([lane, stats]) => ({
        lane,
        calls: stats.calls,
        fallbackCalls: stats.fallbackCalls,
        fallbackRate:
          stats.calls > 0
            ? Math.round((stats.fallbackCalls / stats.calls) * 10000) / 10000
            : 0,
      }))
      .sort((a, b) => b.calls - a.calls);
    const fallbackByLane = compositionLaneBreakdown.map((row) => ({
      lane: row.lane,
      fallbackCalls: row.fallbackCalls,
      totalCalls: row.calls,
      fallbackRate: row.fallbackRate,
    }));

    res.json({
      ok: true,
      range: result.range,
      data: {
        v: 1,
        kpis: {
          costUsd: Math.round(totalCostUsd * 10000) / 10000,
          totalTokens: result.summary.tokensTotal,
          totalCalls: result.summary.calls,
          avgLatencyMs: result.summary.latencyMsP50,
          errorRate: result.summary.errorRate / 100, // Convert to decimal
          recentErrors,
        },
        // Include both summary (for LLMPage charts) and charts (for schema)
        summary: result.summary,
        charts: {
          costPerDay: [],
          tokensPerDay: [],
          costByModel,
        },
        pricingSource,
        costCoverage:
          costDiagnostics.callsWithUsage > 0
            ? Math.round(
                (costDiagnostics.pricedCalls / costDiagnostics.callsWithUsage) *
                  10000,
              ) / 10000
            : 1,
        pinnedFamilyCoverage:
          costDiagnostics.callsWithUsage > 0
            ? Math.round(
                (costDiagnostics.familyMatchedCalls /
                  costDiagnostics.callsWithUsage) *
                  10000,
              ) / 10000
            : 0,
        unpricedModelKeys: Array.from(costDiagnostics.unpricedModelKeys).sort(
          (a, b) => a.localeCompare(b),
        ),
        compositionLaneBreakdown,
        fallbackByLane,
        calls: recentCalls.items.slice(0, 50).map((c) => ({
          ...c,
          costUsd: calculateCallCost(
            c.provider,
            c.model,
            c.promptTokens,
            c.completionTokens,
            costTable,
          ),
        })),
        google: { gemini: google.gemini },
      },
      meta: {
        cache: "miss",
        generatedAt: new Date().toISOString(),
        requestId: (req.headers["x-request-id"] as string) || null,
      },
    });
  } catch (error) {
    console.error("[Admin] LLM cost error:", error);
    res.status(500).json({
      ok: false,
      error: "Failed to fetch LLM cost",
      code: "LLM_COST_ERROR",
    });
  }
});

/**
 * GET /api/admin/llm-cost/calls
 * Returns paginated list of LLM calls with cost
 */
router.get("/calls", async (req: Request, res: Response) => {
  try {
    const range = (req.query.range as string) || "7d";
    const limit = parseInt(req.query.limit as string) || 50;
    const cursor = req.query.cursor as string | undefined;
    const provider = req.query.provider as string | undefined;
    const model = req.query.model as string | undefined;
    const stage = req.query.stage as string | undefined;

    const result = await listLlmCalls(prisma, {
      range,
      limit,
      cursor,
      provider,
      model,
      stage,
    });
    const costTable = getOptionalBank<CostTable>("llm_cost_table");

    // Add cost to each call
    const callsWithCost = result.items.map((call) => ({
      ...call,
      costUsd: calculateCallCost(
        call.provider,
        call.model,
        call.promptTokens,
        call.completionTokens,
        costTable,
      ),
    }));

    res.json({
      ok: true,
      range: result.range,
      data: {
        v: 1,
        total: result.items.length,
        calls: callsWithCost,
      },
      meta: {
        cache: "miss",
        generatedAt: new Date().toISOString(),
        requestId: (req.headers["x-request-id"] as string) || null,
      },
      ...(result.nextCursor && { nextCursor: result.nextCursor }),
    });
  } catch (error) {
    console.error("[Admin] LLM calls error:", error);
    res.status(500).json({
      ok: false,
      error: "Failed to fetch LLM calls",
      code: "LLM_CALLS_ERROR",
    });
  }
});

export default router;
