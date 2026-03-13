import type {
  BankMatch,
  ConnectorDecisionContext,
  RoutingBank,
} from "./turnRoutePolicy.types";
import { TurnRouteProviderResolver } from "./TurnRouteProviderResolver";

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export class TurnRouteGuardrailPolicy {
  constructor(
    private readonly providerResolver = new TurnRouteProviderResolver(),
  ) {}

  applyGuardrails(
    top: BankMatch,
    connectorsRouting: RoutingBank | null,
    context?: ConnectorDecisionContext,
    message?: string,
  ): BankMatch {
    if (top.intentFamily === "connectors") {
      const guardrails = connectorsRouting?.config?.guardrails || {};
      const providerId =
        top.providerId ||
        this.providerResolver.resolveProviderForMatch(
          "",
          connectorsRouting || {},
          top.operatorId,
          context,
        );
      const readsConnectorContent = top.operatorId === "CONNECTOR_SEARCH";
      if (
        guardrails.neverReadConnectorContentWithoutUserPermission !== false &&
        readsConnectorContent &&
        context?.hasConnectorReadPermission !== true
      ) {
        return {
          ...top,
          operatorId: "CONNECTOR_STATUS",
          providerId,
          decisionNotes: [
            ...top.decisionNotes,
            "guardrail:permission_required_for_connector_content",
            "reroute:CONNECTOR_STATUS",
          ],
        };
      }

      if (
        guardrails.requireConnectBeforeSyncOrSearch &&
        (top.operatorId === "CONNECTOR_SYNC" ||
          top.operatorId === "CONNECTOR_SEARCH")
      ) {
        const connected = this.providerResolver.isProviderConnected(
          context,
          providerId,
        );
        if (!connected) {
          return {
            ...top,
            operatorId: "CONNECT_START",
            providerId,
            confidence: clamp01(Math.max(top.confidence, 0.62)),
            decisionNotes: [
              ...top.decisionNotes,
              "guardrail:require_connect_before_sync_or_search",
              `reroute_from:${top.operatorId}`,
              "reroute:CONNECT_START",
            ],
          };
        }
      }

      if (
        guardrails.disconnectAlwaysConfirm &&
        top.operatorId === "CONNECTOR_DISCONNECT" &&
        !top.requiresConfirmation
      ) {
        return {
          ...top,
          requiresConfirmation: true,
          decisionNotes: [...top.decisionNotes, "requires_confirmation"],
        };
      }
    }

    if (
      top.intentFamily === "email" &&
      top.operatorId === "EMAIL_SEND" &&
      !top.requiresConfirmation
    ) {
      return {
        ...top,
        requiresConfirmation: true,
        decisionNotes: [...top.decisionNotes, "requires_confirmation"],
      };
    }

    if (top.intentFamily === "email") {
      const normalized = String(message || "").toLowerCase();
      const mentionsSlack =
        /\b(slack|channel|channels|dm|dms|thread|threads)\b/.test(normalized);
      const mentionsEmail =
        /\b(email|emails|mail|gmail|outlook|inbox)\b/.test(normalized);
      if (mentionsSlack && !mentionsEmail) {
        return this.applyGuardrails(
          {
            ...top,
            intentId: "connectors",
            intentFamily: "connectors",
            operatorId: "CONNECTOR_SEARCH",
            domainId: "connectors",
            scopeId: "connectors",
            providerId: "slack",
            requiresConfirmation: false,
            confidence: clamp01(Math.max(top.confidence, 0.74)),
            decisionNotes: [
              ...top.decisionNotes,
              "guardrail:slack_terms_prefer_connector_search",
              "reroute:CONNECTOR_SEARCH",
            ],
          },
          connectorsRouting,
          context,
          message,
        );
      }
    }

    return top;
  }
}
