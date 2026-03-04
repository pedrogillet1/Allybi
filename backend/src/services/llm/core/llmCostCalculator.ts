/**
 * llmCostCalculator.ts — Pure function for computing LLM call cost in USD.
 *
 * Uses a cost table (data bank) with per-model pricing.
 * Lookup key: `${provider}:${model}`, fallback to `${provider}:*`, fallback to 0.
 */

export interface CostTableEntry {
  inputPer1M: number;
  outputPer1M: number;
}

export interface CostTable {
  models: Record<string, CostTableEntry>;
}

export interface CostLookupResult {
  entry: CostTableEntry | null;
  matchedKey: string | null;
  matchedBy: "exact" | "family" | "wildcard" | null;
  provider: string;
  model: string;
  familyModel: string | null;
}

function normalizeToken(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

/**
 * Normalize pinned/versioned model IDs back to the family model key used in
 * pricing tables (e.g. gpt-5.2-2026-01-15 -> gpt-5.2).
 */
export function toCostFamilyModel(model: string): string | null {
  const normalized = normalizeToken(model);
  if (!normalized) return null;

  const withoutDate = normalized.replace(/-\d{4}-\d{2}-\d{2}$/, "");
  if (withoutDate !== normalized) return withoutDate;

  const withoutNumericBuild = normalized.replace(/-\d{3,4}$/, "");
  if (withoutNumericBuild !== normalized) return withoutNumericBuild;

  const withoutSuffix = normalized.replace(/-(latest|exp)$/, "");
  if (withoutSuffix !== normalized) return withoutSuffix;

  return normalized;
}

export function lookupCostEntry(
  provider: string,
  model: string,
  costTable: CostTable | null | undefined,
): CostLookupResult {
  const normalizedProvider = normalizeToken(provider);
  const normalizedModel = normalizeToken(model);
  const familyModel = toCostFamilyModel(normalizedModel);

  if (!costTable?.models || !normalizedProvider || !normalizedModel) {
    return {
      entry: null,
      matchedKey: null,
      matchedBy: null,
      provider: normalizedProvider,
      model: normalizedModel,
      familyModel,
    };
  }

  const exactKey = `${normalizedProvider}:${normalizedModel}`;
  const exact = costTable.models[exactKey];
  if (exact) {
    return {
      entry: exact,
      matchedKey: exactKey,
      matchedBy: "exact",
      provider: normalizedProvider,
      model: normalizedModel,
      familyModel,
    };
  }

  if (familyModel && familyModel !== normalizedModel) {
    const familyKey = `${normalizedProvider}:${familyModel}`;
    const family = costTable.models[familyKey];
    if (family) {
      return {
        entry: family,
        matchedKey: familyKey,
        matchedBy: "family",
        provider: normalizedProvider,
        model: normalizedModel,
        familyModel,
      };
    }
  }

  const wildcardKey = `${normalizedProvider}:*`;
  const wildcard = costTable.models[wildcardKey];
  if (wildcard) {
    return {
      entry: wildcard,
      matchedKey: wildcardKey,
      matchedBy: "wildcard",
      provider: normalizedProvider,
      model: normalizedModel,
      familyModel,
    };
  }

  return {
    entry: null,
    matchedKey: null,
    matchedBy: null,
    provider: normalizedProvider,
    model: normalizedModel,
    familyModel,
  };
}

/**
 * Compute the cost in USD for a given LLM call.
 */
export function computeCostUsd(
  provider: string,
  model: string,
  inputTokens: number | null | undefined,
  outputTokens: number | null | undefined,
  costTable: CostTable | null | undefined,
): number {
  if (!costTable?.models) return 0;
  if (!inputTokens && !outputTokens) return 0;

  const lookup = lookupCostEntry(provider, model, costTable);
  const entry = lookup.entry;

  if (!entry) return 0;

  const inputCost = ((inputTokens ?? 0) / 1_000_000) * (entry.inputPer1M ?? 0);
  const outputCost = ((outputTokens ?? 0) / 1_000_000) * (entry.outputPer1M ?? 0);

  return inputCost + outputCost;
}
