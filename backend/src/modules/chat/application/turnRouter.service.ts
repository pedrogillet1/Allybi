import type { TurnContext, TurnRouteDecision } from "../domain/chat.types";
import {
  TurnRoutePolicyService,
  type ConnectorIntentDecision,
  type ConnectorDecisionContext,
} from "./turnRoutePolicy.service";
import {
  getDocumentIntelligenceBanksInstance,
  type DocumentIntelligenceBanksService,
} from "../../../services/core/banks/documentIntelligenceBanks.service";
import type {
  IntentDecisionOutput,
  RouterCandidate,
} from "../../../services/config/intentConfig.service";
import { IntentConfigService } from "../../../services/config/intentConfig.service";
import { getOptionalBank } from "../../../services/core/banks/bankLoader.service";
import {
  resolveTurnRouterConfig,
  type TurnRouterConfig,
} from "../config/chatRuntimeConfig";
import { TurnRouterCandidateService } from "./TurnRouterCandidateService";
import { TurnRouterFollowupService } from "./TurnRouterFollowupService";
import {
  hasDocRefSignal,
  getPersistedIntentState,
  mapIntentFamilyToRoute,
} from "./turnRouter.shared";

export interface RoutedTurnDecision {
  route: TurnRouteDecision;
  intentDecision: IntentDecisionOutput | null;
}

type RoutePolicy = Pick<TurnRoutePolicyService, "isConnectorTurn"> &
  Partial<Pick<TurnRoutePolicyService, "resolveConnectorDecision">>;

type FileActionBankProvider =
  | Pick<DocumentIntelligenceBanksService, "getFileActionOperators">
  | ((bankId: string) => any | null);

export class TurnRouterService {
  private readonly candidateService: TurnRouterCandidateService;
  private readonly followupService: TurnRouterFollowupService;

  constructor(
    private readonly routePolicy: RoutePolicy = new TurnRoutePolicyService(),
    private readonly intentConfig: Pick<
      IntentConfigService,
      "decide"
    > = new IntentConfigService(),
    fileActionBankProvider: FileActionBankProvider = getDocumentIntelligenceBanksInstance(),
    routingBankProvider: (bankId: string) => any | null = (bankId) =>
      getOptionalBank<any>(bankId),
    private readonly routerConfig: TurnRouterConfig = resolveTurnRouterConfig(),
  ) {
    this.candidateService = new TurnRouterCandidateService(
      fileActionBankProvider,
      routingBankProvider,
    );
    this.followupService = new TurnRouterFollowupService(routingBankProvider);
  }

  decideWithIntent(ctx: TurnContext): RoutedTurnDecision {
    const connectorContext = this.candidateService.buildConnectorDecisionContext(
      ctx,
    );
    const connectorDecision = this.resolveConnectorDecision(
      ctx,
      connectorContext,
    );
    if (connectorDecision) {
      return {
        route: "CONNECTOR",
        intentDecision:
          connectorDecision === true
            ? null
            : this.toConnectorIntentDecision(connectorDecision),
      };
    }

    if (ctx.viewer?.mode) {
      return {
        route: "KNOWLEDGE",
        intentDecision: null,
      };
    }

    const docsAvailable = Boolean(
      ctx.attachedDocuments.length > 0 || ctx.activeDocument,
    );
    const intentDecision = this.resolveIntentDecision(ctx, docsAvailable);
    if (!intentDecision) {
      return {
        route: docsAvailable ? "KNOWLEDGE" : "GENERAL",
        intentDecision: null,
      };
    }

    return {
      route: intentDecision.requiresClarification
        ? "CLARIFY"
        : mapIntentFamilyToRoute(intentDecision.intentFamily, docsAvailable),
      intentDecision,
    };
  }

  decide(ctx: TurnContext): TurnRouteDecision {
    return this.decideWithIntent(ctx).route;
  }

  private resolveConnectorDecision(
    ctx: TurnContext,
    connectorContext: ConnectorDecisionContext,
  ): ConnectorIntentDecision | true | null {
    const query = ctx.messageText || "";
    const connectorDecision =
      typeof this.routePolicy.resolveConnectorDecision === "function"
        ? this.routePolicy.resolveConnectorDecision(
            query,
            ctx.locale,
            connectorContext,
          )
        : null;
    if (connectorDecision) return connectorDecision;
    return this.routePolicy.isConnectorTurn(query, ctx.locale, connectorContext)
      ? true
      : null;
  }

  private resolveIntentDecision(
    ctx: TurnContext,
    docsAvailable: boolean,
  ): IntentDecisionOutput | null {
    try {
      const followup = this.followupService.detectFollowupSignal(
        ctx,
        String(ctx.messageText || ""),
        hasDocRefSignal(String(ctx.messageText || "")),
      );
      const candidates = this.candidateService.buildCandidates(
        ctx,
        docsAvailable,
        followup,
      );
      return this.intentConfig.decide({
        env: this.routerConfig.environment,
        language: ctx.locale,
        queryText: String(ctx.messageText || ""),
        candidates,
        signals: this.candidateService.buildSignals(
          ctx,
          docsAvailable,
          candidates,
          followup,
        ),
        state: getPersistedIntentState(ctx),
      });
    } catch (error) {
      if (this.routerConfig.strictIntentConfig) throw error;
      if (this.routerConfig.failOpen) return null;
      throw error;
    }
  }

  private toConnectorIntentDecision(
    decision: ConnectorIntentDecision,
  ): IntentDecisionOutput {
    const notes = [...decision.decisionNotes];
    if (decision.providerId) notes.push(`provider:${decision.providerId}`);
    if (decision.requiresConfirmation) notes.push("requires_confirmation");
    notes.push("source:turn_route_policy");
    return {
      intentId: decision.intentId,
      intentFamily: decision.intentFamily,
      operatorId: decision.operatorId,
      domainId: decision.domainId,
      confidence: Math.max(0, Math.min(1, decision.confidence)),
      decisionNotes: notes,
      persistable: {
        intentId: decision.intentId,
        intentFamily: decision.intentFamily,
        operatorId: decision.operatorId,
        domainId: decision.domainId,
        confidence: Math.max(0, Math.min(1, decision.confidence)),
      },
    };
  }
}
