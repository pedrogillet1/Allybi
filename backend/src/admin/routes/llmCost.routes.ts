/**
 * LLM Cost Routes
 * GET /api/admin/llm-cost
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { listLlmCalls, getLlmSummary } from '../../services/admin';
import { parseRange, normalizeRange } from '../../services/admin/_shared/rangeWindow';
import { getGoogleMetrics } from '../../services/admin/googleMetrics.service';

const router = Router();
const prisma = new PrismaClient();

/**
 * LLM Pricing Table (USD per 1M tokens)
 * Based on Google AI pricing as of 2024
 */
const LLM_PRICING: Record<string, { input: number; output: number }> = {
  // Gemini 2.0 Flash (context <= 128k)
  'gemini-2.0-flash': { input: 0.10, output: 0.40 },
  'gemini-2.0-flash-exp': { input: 0.10, output: 0.40 },
  'gemini-2.0-flash-001': { input: 0.10, output: 0.40 },
  // Gemini 1.5 Flash (context <= 128k)
  'gemini-1.5-flash': { input: 0.075, output: 0.30 },
  'gemini-1.5-flash-latest': { input: 0.075, output: 0.30 },
  'gemini-1.5-flash-001': { input: 0.075, output: 0.30 },
  'gemini-1.5-flash-002': { input: 0.075, output: 0.30 },
  // Gemini 1.5 Pro (context <= 128k)
  'gemini-1.5-pro': { input: 1.25, output: 5.00 },
  'gemini-1.5-pro-latest': { input: 1.25, output: 5.00 },
  'gemini-1.5-pro-001': { input: 1.25, output: 5.00 },
  'gemini-1.5-pro-002': { input: 1.25, output: 5.00 },
  // Gemini 1.0 Pro
  'gemini-1.0-pro': { input: 0.50, output: 1.50 },
  'gemini-pro': { input: 0.50, output: 1.50 },
  // OpenAI (for reference if used)
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4-turbo': { input: 10.00, output: 30.00 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
};

/**
 * Calculate cost for a single LLM call
 */
function calculateCallCost(model: string, promptTokens: number | null, completionTokens: number | null): number {
  const pricing = LLM_PRICING[model] || LLM_PRICING['gemini-1.5-flash']; // Default fallback
  const inputCost = ((promptTokens || 0) / 1_000_000) * pricing.input;
  const outputCost = ((completionTokens || 0) / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

/**
 * GET /api/admin/llm-cost
 * Returns LLM cost summary with breakdowns
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const range = (req.query.range as string) || '7d';
    const rangeKey = normalizeRange(range, '7d');
    const window = parseRange(rangeKey);

    const [result, google] = await Promise.all([
      getLlmSummary(prisma, { range: rangeKey }),
      getGoogleMetrics(prisma, window),
    ]);

    // Get recent calls for cost calculation
    const recentCalls = await listLlmCalls(prisma, { range: rangeKey, limit: 10000 });

    // Calculate total cost and cost per model
    let totalCostUsd = 0;
    const modelCosts = new Map<string, { tokens: number; cost: number }>();

    for (const call of recentCalls.items) {
      const cost = calculateCallCost(call.model, call.promptTokens, call.completionTokens);
      totalCostUsd += cost;

      const existing = modelCosts.get(call.model) || { tokens: 0, cost: 0 };
      existing.tokens += call.totalTokens || 0;
      existing.cost += cost;
      modelCosts.set(call.model, existing);
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
    const recentErrors = recentCalls.items.filter(c => c.status === 'fail').length;

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
        calls: recentCalls.items.slice(0, 50).map(c => ({
          ...c,
          costUsd: calculateCallCost(c.model, c.promptTokens, c.completionTokens),
        })),
        google: { gemini: google.gemini },
      },
      meta: {
        cache: 'miss',
        generatedAt: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || null,
      },
    });
  } catch (error) {
    console.error('[Admin] LLM cost error:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch LLM cost',
      code: 'LLM_COST_ERROR',
    });
  }
});

/**
 * GET /api/admin/llm-cost/calls
 * Returns paginated list of LLM calls with cost
 */
router.get('/calls', async (req: Request, res: Response) => {
  try {
    const range = (req.query.range as string) || '7d';
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

    // Add cost to each call
    const callsWithCost = result.items.map(call => ({
      ...call,
      costUsd: calculateCallCost(call.model, call.promptTokens, call.completionTokens),
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
        cache: 'miss',
        generatedAt: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || null,
      },
      ...(result.nextCursor && { nextCursor: result.nextCursor }),
    });
  } catch (error) {
    console.error('[Admin] LLM calls error:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch LLM calls',
      code: 'LLM_CALLS_ERROR',
    });
  }
});

export default router;
