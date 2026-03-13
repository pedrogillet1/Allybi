import { getOptionalBank } from "../../core/banks/bankLoader.service";
import { toCostFamilyModel } from "./llmCostCalculator";

export function resolveMaxInputTokensForRoute(route: {
  provider: string;
  model: string;
}): number {
  try {
    const bank =
      getOptionalBank<Record<string, unknown>>("provider_capabilities") ??
      getOptionalBank<Record<string, unknown>>("providerCapabilities");
    if (!bank) return 0;
    const providers = bank.providers as Record<string, Record<string, unknown>> | undefined;
    if (!providers) return 0;
    const providerKey =
      route.provider === "openai"
        ? "openai"
        : route.provider === "local"
          ? "local"
          : "gemini";
    const models = providers[providerKey]?.models as
      | Record<string, Record<string, unknown>>
      | undefined;
    if (!models) return 0;
    const routeModel = String(route.model || "").trim();
    if (!routeModel) return 0;

    const exactEntry = models[routeModel];
    if (exactEntry && typeof exactEntry.maxInputTokens === "number") {
      return exactEntry.maxInputTokens;
    }

    const familyModel = toCostFamilyModel(routeModel);
    if (familyModel && familyModel !== routeModel) {
      const familyEntry = models[familyModel];
      if (familyEntry && typeof familyEntry.maxInputTokens === "number") {
        return familyEntry.maxInputTokens;
      }
    }

    for (const [pattern, entry] of Object.entries(models)) {
      if (!pattern.includes("*")) continue;
      const regex = new RegExp(
        `^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`,
      );
      if (regex.test(routeModel) && typeof entry.maxInputTokens === "number") {
        return entry.maxInputTokens;
      }
    }
  } catch {
    // fail-open
  }
  return 0;
}
