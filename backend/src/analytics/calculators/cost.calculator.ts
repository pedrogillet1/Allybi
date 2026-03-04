// file: src/analytics/calculators/cost.calculator.ts
// LLM cost calculator - pure function, no DB/IO

export type LlmCallEvent = {
  ts: string;
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  latencyMs?: number;
  status?: "ok" | "error";
};

export type CostOptions = {
  includeErrors?: boolean; // Default: false (exclude errored calls from cost totals)
};

export type ProviderModelCost = {
  provider: string;
  model: string;
  calls: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
};

export type CostResult = {
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCalls: number;
  avgCostPerCallUsd: number | null;
  costPer1kTokensUsd: number | null;
  byProviderModel: ProviderModelCost[];
};

/**
 * Calculate LLM cost metrics
 *
 * Aggregates cost, tokens, and calls from LLM call events.
 * By default, excludes calls with status="error" from cost totals.
 *
 * @param llmCalls - Array of LLM call events
 * @param opts - Options including whether to include errored calls
 * @returns Cost statistics overall and by provider/model
 */
export function calculateCost(
  llmCalls: LlmCallEvent[],
  opts?: CostOptions,
): CostResult {
  const includeErrors = opts?.includeErrors === true; // Default false

  const emptyResult: CostResult = {
    totalCostUsd: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCalls: 0,
    avgCostPerCallUsd: null,
    costPer1kTokensUsd: null,
    byProviderModel: [],
  };

  if (!llmCalls || llmCalls.length === 0) {
    return emptyResult;
  }

  // Aggregate by provider+model
  const providerModelStats = new Map<string, ProviderModelCost>();

  let totalCostUsd = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCalls = 0;

  for (const call of llmCalls) {
    // Skip errors unless includeErrors is true
    if (!includeErrors && call.status === "error") {
      continue;
    }

    const provider = call.provider || "unknown";
    const model = call.model || "unknown";
    const key = `${provider}::${model}`;

    if (!providerModelStats.has(key)) {
      providerModelStats.set(key, {
        provider,
        model,
        calls: 0,
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
      });
    }

    const stats = providerModelStats.get(key)!;
    stats.calls++;
    totalCalls++;

    // Add cost (handle missing/invalid values)
    const cost =
      typeof call.costUsd === "number" && !isNaN(call.costUsd)
        ? call.costUsd
        : 0;
    stats.costUsd += cost;
    totalCostUsd += cost;

    // Add tokens (handle missing/invalid values)
    const inputTokens =
      typeof call.inputTokens === "number" && !isNaN(call.inputTokens)
        ? call.inputTokens
        : 0;
    const outputTokens =
      typeof call.outputTokens === "number" && !isNaN(call.outputTokens)
        ? call.outputTokens
        : 0;

    stats.inputTokens += inputTokens;
    stats.outputTokens += outputTokens;
    totalInputTokens += inputTokens;
    totalOutputTokens += outputTokens;
  }

  // Calculate derived metrics
  const avgCostPerCallUsd =
    totalCalls > 0
      ? Math.round((totalCostUsd / totalCalls) * 1000000) / 1000000 // 6 decimal places
      : null;

  const totalTokens = totalInputTokens + totalOutputTokens;
  const costPer1kTokensUsd =
    totalTokens > 0
      ? Math.round((totalCostUsd / totalTokens) * 1000 * 1000000) / 1000000 // per 1k tokens, 6 decimal places
      : null;

  // Build byProviderModel array
  const byProviderModel = Array.from(providerModelStats.values());

  // Sort by cost descending
  byProviderModel.sort((a, b) => b.costUsd - a.costUsd);

  // Round costs for cleaner output
  for (const pm of byProviderModel) {
    pm.costUsd = Math.round(pm.costUsd * 1000000) / 1000000;
  }

  return {
    totalCostUsd: Math.round(totalCostUsd * 1000000) / 1000000,
    totalInputTokens,
    totalOutputTokens,
    totalCalls,
    avgCostPerCallUsd,
    costPer1kTokensUsd,
    byProviderModel,
  };
}

/**
 * Calculate cost over time series (by day)
 */
export function calculateCostSeries(
  llmCalls: LlmCallEvent[],
  opts?: CostOptions,
): Array<{ day: string; costUsd: number; calls: number; tokens: number }> {
  const includeErrors = opts?.includeErrors === true;

  if (!llmCalls || llmCalls.length === 0) {
    return [];
  }

  // Group by day
  const byDay = new Map<
    string,
    { costUsd: number; calls: number; tokens: number }
  >();

  for (const call of llmCalls) {
    if (!includeErrors && call.status === "error") {
      continue;
    }

    const d = new Date(call.ts);
    if (isNaN(d.getTime())) continue;

    const day = d.toISOString().slice(0, 10);

    if (!byDay.has(day)) {
      byDay.set(day, { costUsd: 0, calls: 0, tokens: 0 });
    }

    const stats = byDay.get(day)!;
    stats.calls++;

    const cost =
      typeof call.costUsd === "number" && !isNaN(call.costUsd)
        ? call.costUsd
        : 0;
    stats.costUsd += cost;

    const inputTokens =
      typeof call.inputTokens === "number" && !isNaN(call.inputTokens)
        ? call.inputTokens
        : 0;
    const outputTokens =
      typeof call.outputTokens === "number" && !isNaN(call.outputTokens)
        ? call.outputTokens
        : 0;
    stats.tokens += inputTokens + outputTokens;
  }

  // Build sorted series
  const days = Array.from(byDay.keys()).sort();

  return days.map((day) => {
    const stats = byDay.get(day)!;
    return {
      day,
      costUsd: Math.round(stats.costUsd * 1000000) / 1000000,
      calls: stats.calls,
      tokens: stats.tokens,
    };
  });
}

// Test vectors
// Input: [
//   { ts: "2024-01-15T10:00:00Z", provider: "openai", model: "gpt-5.2", inputTokens: 1000, outputTokens: 500, costUsd: 0.05, status: "ok" },
//   { ts: "2024-01-15T10:01:00Z", provider: "openai", model: "gpt-5.2", inputTokens: 2000, outputTokens: 1000, costUsd: 0.10, status: "ok" },
//   { ts: "2024-01-15T10:02:00Z", provider: "gemini", model: "gemini-2.5-flash", inputTokens: 500, outputTokens: 200, costUsd: 0.02, status: "error" }
// ]
// opts: { includeErrors: false }
// Expected: totalCostUsd: 0.15, totalInputTokens: 3000, totalOutputTokens: 1500, totalCalls: 2
// (error call excluded)
