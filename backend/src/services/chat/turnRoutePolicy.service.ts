import {
  getDocumentIntelligenceBanksInstance,
  type DocumentIntelligenceBanksService,
} from "../core/banks/documentIntelligenceBanks.service";

type Locale = "en" | "pt" | "es";

type RoutingRule = {
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

type RoutingBank = {
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

type BankMatch = ConnectorIntentDecision & {
  priority: number;
};

function isStrictEnv(): boolean {
  const env = String(process.env.NODE_ENV || "").toLowerCase();
  return env === "production" || env === "staging";
}

function normalizeText(
  input: string,
  opts?: { stripDiacritics?: boolean; collapseWhitespace?: boolean },
): string {
  let value = input;
  if (opts?.stripDiacritics) {
    value = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  if (opts?.collapseWhitespace) {
    value = value.replace(/\s+/g, " ");
  }
  return value.trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export class TurnRoutePolicyService {
  private readonly connectorsRouting: RoutingBank | null;
  private readonly emailRouting: RoutingBank | null;
  private readonly strict: boolean;
  private readonly banks: Pick<
    DocumentIntelligenceBanksService,
    "getRoutingBank"
  >;

  constructor(opts?: {
    strict?: boolean;
    banks?: Pick<DocumentIntelligenceBanksService, "getRoutingBank">;
  }) {
    this.strict = opts?.strict ?? isStrictEnv();
    this.banks = opts?.banks ?? getDocumentIntelligenceBanksInstance();
    this.connectorsRouting = this.banks.getRoutingBank("connectors_routing");
    this.emailRouting = this.banks.getRoutingBank("email_routing");

    const missingBanks: string[] = [];
    if (!this.connectorsRouting) missingBanks.push("connectors_routing");
    if (!this.emailRouting) missingBanks.push("email_routing");
    if (this.strict && missingBanks.length > 0) {
      throw new Error(
        `[TurnRoutePolicy] Missing required routing banks in strict mode: ${missingBanks.join(", ")}`,
      );
    }

    this.validateRegexPatterns("connectors_routing", this.connectorsRouting);
    this.validateRegexPatterns("email_routing", this.emailRouting);
  }

  isConnectorTurn(
    message: string,
    locale: Locale,
    context?: ConnectorDecisionContext,
  ): boolean {
    return this.resolveConnectorDecision(message, locale, context) !== null;
  }

  resolveConnectorDecision(
    message: string,
    locale: Locale,
    context?: ConnectorDecisionContext,
  ): ConnectorIntentDecision | null {
    if (!message.trim()) return null;
    const normalizedLocale = String(locale || "en").toLowerCase() as Locale;
    const matches: BankMatch[] = [];
    const email = this.resolveBestBankMatch(
      "email_routing",
      message,
      normalizedLocale,
      this.emailRouting,
      context,
    );
    if (email) matches.push(email);
    const connectors = this.resolveBestBankMatch(
      "connectors_routing",
      message,
      normalizedLocale,
      this.connectorsRouting,
      context,
    );
    if (connectors) matches.push(connectors);
    if (matches.length === 0) return null;
    matches.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return a.operatorId.localeCompare(b.operatorId);
    });
    const top = this.applyGuardrails(matches[0], context, message);
    return {
      intentId: top.intentId,
      intentFamily: top.intentFamily,
      operatorId: top.operatorId,
      domainId: top.domainId,
      scopeId: top.scopeId,
      providerId: top.providerId,
      requiresConfirmation: top.requiresConfirmation,
      confidence: clamp01(top.confidence),
      decisionNotes: top.decisionNotes,
    };
  }

  private resolveBestBankMatch(
    bankId: "connectors_routing" | "email_routing",
    message: string,
    locale: Locale,
    bank: RoutingBank | null,
    context?: ConnectorDecisionContext,
  ): BankMatch | null {
    if (!bank?.config?.enabled) return null;

    const caseSensitive = Boolean(bank.config.matching?.caseSensitive);
    const stripDiacritics = Boolean(
      bank.config.matching?.stripDiacriticsForMatching,
    );
    const collapseWhitespace = Boolean(
      bank.config.matching?.collapseWhitespace,
    );
    const normalized = normalizeText(message, {
      stripDiacritics,
      collapseWhitespace,
    });
    const minConfidence = Math.max(
      0,
      Math.min(1, Number(bank?.config?.thresholds?.minConfidence ?? 0.58)),
    );
    const matches: BankMatch[] = [];
    const collectMatches = (
      allowedLocales: Set<string>,
      pass: "strict" | "fallback",
    ) => {
      for (const rule of bank.rules || []) {
        let matched = false;
        let matchedClauseLocale = "any";
        for (const clause of rule.when?.any || []) {
          if (clause.type !== "regex") continue;
          const clauseLocale = String(clause.locale || "any").toLowerCase();
          if (!allowedLocales.has(clauseLocale)) continue;

          for (const pattern of clause.patterns || []) {
            try {
              const regex = new RegExp(pattern, caseSensitive ? "g" : "gi");
              if (regex.test(normalized)) {
                matched = true;
                matchedClauseLocale = clauseLocale;
                break;
              }
            } catch {
              continue;
            }
          }
          if (matched) break;
        }
        if (!matched) continue;
        const operatorId = String(
          rule?.then?.operator || this.defaultOperatorForBank(bankId),
        ).trim();
        if (!operatorId) continue;
        const priority = Number(rule?.priority || 0);
        const confidenceBoost = Number(rule?.confidenceBoost || 0);
        const confidence = Math.max(
          minConfidence,
          Math.min(
            0.99,
            minConfidence + confidenceBoost + Math.max(0, priority) / 1000,
          ),
        );
        const intentFamily = this.normalizeIntentFamily(
          String(rule?.then?.intent || bank?.config?.defaults?.intent || ""),
          bankId,
        );
        if (!intentFamily) continue;
        const domainId =
          String(rule?.then?.domain || bank?.config?.defaults?.domain || "")
            .trim()
            .toLowerCase() ||
          (intentFamily === "email" ? "email" : "connectors");
        const scopeId =
          String(rule?.then?.scope || bank?.config?.defaults?.scope || "")
            .trim()
            .toLowerCase() ||
          (intentFamily === "email" ? "email" : "connectors");
        const providerId = this.resolveProviderForMatch(
          normalized,
          bank,
          operatorId,
          context,
        );
        const requiresConfirmation = this.requiresConfirmation(bank, operatorId);
        matches.push({
          intentId: intentFamily,
          intentFamily,
          operatorId,
          domainId,
          scopeId,
          providerId,
          requiresConfirmation,
          confidence,
          priority,
          decisionNotes: [
            `bank:${bankId}`,
            `rule:${String(rule?.ruleId || "unknown")}`,
            `reason:${String(rule?.reasonCode || "pattern_match")}`,
            ...(pass === "fallback" &&
            matchedClauseLocale !== "any" &&
            matchedClauseLocale !== locale
              ? [`locale_fallback:${matchedClauseLocale}`]
              : []),
            `provider:${providerId || "none"}`,
            ...(requiresConfirmation ? ["requires_confirmation"] : []),
          ],
        });
      }
    };

    collectMatches(new Set(["any", locale]), "strict");
    if (matches.length === 0 && locale !== "en") {
      collectMatches(new Set(["any", "en", "pt", "es"]), "fallback");
    }
    if (matches.length === 0) return null;
    matches.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return a.operatorId.localeCompare(b.operatorId);
    });
    return matches[0];
  }

  private normalizeIntentFamily(
    raw: string,
    bankId: "connectors_routing" | "email_routing",
  ): "connectors" | "email" | null {
    const intent = String(raw || "")
      .trim()
      .toLowerCase();
    if (intent.includes("email")) return "email";
    if (intent.includes("connector")) return "connectors";
    if (bankId === "email_routing") return "email";
    if (bankId === "connectors_routing") return "connectors";
    return null;
  }

  private defaultOperatorForBank(
    bankId: "connectors_routing" | "email_routing",
  ): string {
    if (bankId === "connectors_routing") return "CONNECTOR_STATUS";
    return "EMAIL_LATEST";
  }

  private requiresConfirmation(bank: RoutingBank, operatorId: string): boolean {
    const alwaysConfirm = Array.isArray(bank?.operators?.alwaysConfirm)
      ? bank.operators.alwaysConfirm
      : [];
    const wanted = operatorId.trim().toLowerCase();
    return alwaysConfirm.some(
      (operator) =>
        String(operator || "")
          .trim()
          .toLowerCase() === wanted,
    );
  }

  private resolveProviderForMatch(
    normalizedMessage: string,
    bank: RoutingBank,
    operatorId: string,
    context?: ConnectorDecisionContext,
  ): "gmail" | "outlook" | "slack" | "email" | null {
    const allowed = Array.isArray(bank?.providers?.allowed)
      ? bank
          .providers!.allowed!.map((provider) =>
            String(provider || "")
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean)
      : [];
    if (allowed.length === 0) return null;

    const aliases = bank?.providers?.aliases || {};
    for (const [aliasRaw, mappedRaw] of Object.entries(aliases)) {
      const alias = String(aliasRaw || "")
        .trim()
        .toLowerCase();
      const mapped = String(mappedRaw || "")
        .trim()
        .toLowerCase();
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
      ? bank.disambiguation!.requiredWhen!.missingProviderForOperators!
      : [];
    const requiresProvider = missingProviderOps.some(
      (op) =>
        String(op || "")
          .trim()
          .toLowerCase() === operatorId.toLowerCase(),
    );
    if (!requiresProvider && allowed.includes("email")) {
      return "email";
    }

    return null;
  }

  private getConnectedAllowedProviders(
    context: ConnectorDecisionContext | undefined,
    allowed: string[],
  ): string[] {
    const connectedMap = context?.connectedProviders || {};
    return allowed.filter((provider) => connectedMap[provider] === true);
  }

  private isProviderConnected(
    context: ConnectorDecisionContext | undefined,
    providerId: string | null,
  ): boolean {
    if (!providerId) return false;
    const connected = context?.connectedProviders || {};
    return connected[providerId] === true;
  }

  private applyGuardrails(
    top: BankMatch,
    context?: ConnectorDecisionContext,
    message?: string,
  ): BankMatch {
    if (top.intentFamily === "connectors") {
      const guardrails = this.connectorsRouting?.config?.guardrails || {};
      const providerId =
        top.providerId ||
        this.resolveProviderForMatch(
          "",
          this.connectorsRouting || {},
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
        const connected = this.isProviderConnected(context, providerId);
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
          context,
          message,
        );
      }
    }

    return top;
  }

  private validateRegexPatterns(
    bankId: string,
    bank: RoutingBank | null,
  ): void {
    if (!bank) return;
    const caseSensitive = Boolean(bank.config?.matching?.caseSensitive);
    for (const rule of bank.rules || []) {
      for (const clause of rule.when?.any || []) {
        if (clause.type !== "regex") continue;
        for (const pattern of clause.patterns || []) {
          try {
            void new RegExp(pattern, caseSensitive ? "g" : "gi");
          } catch {
            if (this.strict) {
              throw new Error(
                `[TurnRoutePolicy] Invalid regex in ${bankId}: ${pattern}`,
              );
            }
          }
        }
      }
    }
  }
}
