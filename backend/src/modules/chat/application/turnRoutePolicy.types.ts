export type Locale = "en" | "pt" | "es";

export type RoutingRule = {
  ruleId?: string;
  priority?: number;
  confidenceBoost?: number;
  reasonCode?: string;
  when?: {
    any?: Array<{
      type?: string;
      locale?: string;
      patterns?: string[];
    }>;
  };
  then?: {
    intent?: string;
    operator?: string;
    domain?: string;
    scope?: string;
  };
};

export type RoutingBank = {
  config?: {
    enabled?: boolean;
    defaults?: {
      intent?: string;
      domain?: string;
      scope?: string;
    };
    thresholds?: {
      minConfidence?: number;
    };
    matching?: {
      caseSensitive?: boolean;
      stripDiacriticsForMatching?: boolean;
      collapseWhitespace?: boolean;
    };
    guardrails?: {
      requireConnectBeforeSyncOrSearch?: boolean;
      neverReadConnectorContentWithoutUserPermission?: boolean;
      disconnectAlwaysConfirm?: boolean;
    };
  };
  providers?: {
    allowed?: string[];
    aliases?: Record<string, string>;
  };
  operators?: {
    canonical?: string[];
    alwaysConfirm?: string[];
  };
  disambiguation?: {
    requiredWhen?: {
      missingProviderForOperators?: string[];
    };
  };
  rules?: RoutingRule[];
};

export interface ConnectorDecisionContext {
  activeProvider?: "gmail" | "outlook" | "slack" | "email" | null;
  connectedProviders?: Record<string, boolean>;
  hasConnectorReadPermission?: boolean;
}

export interface ConnectorIntentDecision {
  intentId: "connectors" | "email";
  intentFamily: "connectors" | "email";
  operatorId: string;
  domainId: string;
  scopeId: string;
  providerId: "gmail" | "outlook" | "slack" | "email" | null;
  requiresConfirmation: boolean;
  confidence: number;
  decisionNotes: string[];
}

export type BankMatch = ConnectorIntentDecision & {
  priority: number;
};
