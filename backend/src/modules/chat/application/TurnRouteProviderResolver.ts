import type {
  ConnectorDecisionContext,
  RoutingBank,
} from "./turnRoutePolicy.types";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class TurnRouteProviderResolver {
  resolveProviderForMatch(
    normalizedMessage: string,
    bank: RoutingBank,
    operatorId: string,
    context?: ConnectorDecisionContext,
  ): "gmail" | "outlook" | "slack" | "email" | null {
    const allowed = Array.isArray(bank?.providers?.allowed)
      ? bank.providers.allowed
          .map((provider) => String(provider || "").trim().toLowerCase())
          .filter(Boolean)
      : [];
    if (allowed.length === 0) return null;

    const aliases = bank?.providers?.aliases || {};
    for (const [aliasRaw, mappedRaw] of Object.entries(aliases)) {
      const alias = String(aliasRaw || "").trim().toLowerCase();
      const mapped = String(mappedRaw || "").trim().toLowerCase();
      if (!alias || !mapped || !allowed.includes(mapped)) continue;
      const aliasRegex = new RegExp(`\\b${escapeRegex(alias)}\\b`, "i");
      if (aliasRegex.test(normalizedMessage)) {
        return mapped as "gmail" | "outlook" | "slack" | "email";
      }
    }

    for (const provider of allowed) {
      const providerRegex = new RegExp(`\\b${escapeRegex(provider)}\\b`, "i");
      if (providerRegex.test(normalizedMessage)) {
        return provider as "gmail" | "outlook" | "slack" | "email";
      }
    }

    const activeProvider = String(context?.activeProvider || "")
      .trim()
      .toLowerCase();
    if (activeProvider && allowed.includes(activeProvider)) {
      return activeProvider as "gmail" | "outlook" | "slack" | "email";
    }

    const connected = this.getConnectedAllowedProviders(context, allowed);
    if (connected.length === 1) {
      return connected[0] as "gmail" | "outlook" | "slack" | "email";
    }

    const missingProviderOps = Array.isArray(
      bank?.disambiguation?.requiredWhen?.missingProviderForOperators,
    )
      ? bank.disambiguation.requiredWhen?.missingProviderForOperators || []
      : [];
    const requiresProvider = missingProviderOps.some(
      (op) =>
        String(op || "").trim().toLowerCase() === operatorId.toLowerCase(),
    );
    if (!requiresProvider && allowed.includes("email")) {
      return "email";
    }

    return null;
  }

  getConnectedAllowedProviders(
    context: ConnectorDecisionContext | undefined,
    allowed: string[],
  ): string[] {
    const connectedMap = context?.connectedProviders || {};
    return allowed.filter((provider) => connectedMap[provider] === true);
  }

  isProviderConnected(
    context: ConnectorDecisionContext | undefined,
    providerId: string | null,
  ): boolean {
    if (!providerId) return false;
    const connected = context?.connectedProviders || {};
    return connected[providerId] === true;
  }
}
