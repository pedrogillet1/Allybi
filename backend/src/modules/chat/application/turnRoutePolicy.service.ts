import {
  getDocumentIntelligenceBanksInstance,
  type DocumentIntelligenceBanksService,
} from "../../../services/core/banks/documentIntelligenceBanks.service";
import { resolveTurnRouterConfig } from "../config/chatRuntimeConfig";
import {
  type BankMatch,
  type ConnectorDecisionContext,
  type ConnectorIntentDecision,
  type Locale,
  type RoutingBank,
} from "./turnRoutePolicy.types";
import { TurnRoutePatternMatcher } from "./TurnRoutePatternMatcher";
import { TurnRouteGuardrailPolicy } from "./TurnRouteGuardrailPolicy";

export class TurnRoutePolicyService {
  private readonly connectorsRouting: RoutingBank | null;
  private readonly emailRouting: RoutingBank | null;
  private readonly strict: boolean;
  private readonly banks: Pick<
    DocumentIntelligenceBanksService,
    "getRoutingBank"
  >;
  private readonly patternMatcher = new TurnRoutePatternMatcher();
  private readonly guardrailPolicy = new TurnRouteGuardrailPolicy();

  constructor(opts?: {
    strict?: boolean;
    banks?: Pick<DocumentIntelligenceBanksService, "getRoutingBank">;
  }) {
    this.strict = opts?.strict ?? resolveTurnRouterConfig().strictIntentConfig;
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

    this.patternMatcher.validateRegexPatterns(
      "connectors_routing",
      this.connectorsRouting,
      this.strict,
    );
    this.patternMatcher.validateRegexPatterns(
      "email_routing",
      this.emailRouting,
      this.strict,
    );
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
    const email = this.patternMatcher.resolveBestBankMatch(
      "email_routing",
      message,
      normalizedLocale,
      this.emailRouting,
      context,
    );
    if (email) matches.push(email);
    const connectors = this.patternMatcher.resolveBestBankMatch(
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
    const top = this.guardrailPolicy.applyGuardrails(
      matches[0],
      this.connectorsRouting,
      context,
      message,
    );
    return {
      intentId: top.intentId,
      intentFamily: top.intentFamily,
      operatorId: top.operatorId,
      domainId: top.domainId,
      scopeId: top.scopeId,
      providerId: top.providerId,
      requiresConfirmation: top.requiresConfirmation,
      confidence: Math.max(0, Math.min(1, top.confidence)),
      decisionNotes: top.decisionNotes,
    };
  }
}

export type {
  ConnectorDecisionContext,
  ConnectorIntentDecision,
} from "./turnRoutePolicy.types";
