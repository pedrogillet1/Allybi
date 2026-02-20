import type { TurnContext, TurnRouteDecision } from "./chat.types";
import { EditorModeGuard } from "./guardrails/editorMode.guard";
import { TurnRoutePolicyService } from "./turnRoutePolicy.service";
import type {
  IntentDecisionOutput,
  IntentSignals,
  RouterCandidate,
} from "../config/intentConfig.service";
import { IntentConfigService } from "../config/intentConfig.service";

function resolveEnv(): "production" | "staging" | "dev" | "local" {
  const raw = String(process.env.NODE_ENV || "").toLowerCase();
  if (raw === "production") return "production";
  if (raw === "staging") return "staging";
  if (raw === "development" || raw === "dev") return "dev";
  return "local";
}

function isStrictIntentConfigEnv(): boolean {
  const env = resolveEnv();
  return env === "production" || env === "staging";
}

function low(value: string): string {
  return String(value || "").toLowerCase();
}

function hasDocRefSignal(message: string): boolean {
  const input = low(message);
  return (
    /\b(document|doc|pdf|file|spreadsheet|sheet|slide|presentation|arquivo|documento|planilha|apresentacao|apresentação)\b/.test(
      input,
    ) ||
    /[a-z0-9_ -]+\.(pdf|docx|xlsx|pptx|txt|csv)\b/.test(input)
  );
}

function isDiscoveryQuery(message: string): boolean {
  return /\b(find|locate|search|which|where|encontre|localize|procure|qual|onde)\b/.test(
    low(message),
  );
}

function isNavQuery(message: string): boolean {
  return /\b(open|show|list|go to|abrir|mostrar|listar|ir para)\b/.test(
    low(message),
  );
}

function mapIntentFamilyToRoute(
  intentFamily: string,
  docsAvailable: boolean,
): TurnRouteDecision {
  const family = low(intentFamily);
  if (family === "connectors" || family === "email") return "CONNECTOR";
  if (
    family === "documents" ||
    family === "editing" ||
    family === "doc_stats" ||
    family === "file_actions"
  ) {
    return "KNOWLEDGE";
  }
  if (family === "help" || family === "conversation" || family === "error") {
    return docsAvailable ? "KNOWLEDGE" : "GENERAL";
  }
  return docsAvailable ? "KNOWLEDGE" : "GENERAL";
}

export class TurnRouterService {
  constructor(
    private readonly routePolicy: Pick<
      TurnRoutePolicyService,
      "isConnectorTurn"
    > = new TurnRoutePolicyService(),
    private readonly editorGuard: Pick<
      EditorModeGuard,
      "enforce"
    > = new EditorModeGuard(routePolicy),
    private readonly intentConfig: Pick<IntentConfigService, "decide"> = new IntentConfigService(),
  ) {}

  private buildCandidates(
    ctx: TurnContext,
    docsAvailable: boolean,
  ): RouterCandidate[] {
    const query = String(ctx.messageText || "");
    const nav = isNavQuery(query);
    const discovery = isDiscoveryQuery(query);

    const candidates: RouterCandidate[] = [];
    if (docsAvailable || discovery || hasDocRefSignal(query)) {
      candidates.push({
        intentId: "documents",
        operatorId: discovery ? "locate_docs" : "extract",
        intentFamily: "documents",
        domainId: "general",
        score: docsAvailable ? 0.88 : 0.74,
      });
    }
    if (nav) {
      candidates.push({
        intentId: "file_actions",
        operatorId: "open",
        intentFamily: "file_actions",
        domainId: "general",
        score: docsAvailable ? 0.8 : 0.86,
      });
    }
    candidates.push({
      intentId: "help",
      operatorId: "how_to",
      intentFamily: "help",
      domainId: "general",
      score: docsAvailable ? 0.42 : 0.65,
    });
    return candidates;
  }

  private buildSignals(ctx: TurnContext): IntentSignals {
    const contextSignals = (ctx.request.context as any)?.signals || {};
    const query = String(ctx.messageText || "");
    return {
      isFollowup: contextSignals.isFollowup === true,
      followupConfidence:
        typeof contextSignals.followupConfidence === "number"
          ? contextSignals.followupConfidence
          : undefined,
      hasExplicitDocRef:
        contextSignals.explicitDocRef === true || hasDocRefSignal(query),
      discoveryQuery:
        contextSignals.discoveryQuery === true || isDiscoveryQuery(query),
      navQuery: contextSignals.navQuery === true || isNavQuery(query),
      userRequestedShort: contextSignals.userRequestedShort === true,
      userRequestedDetailed: contextSignals.userRequestedDetailed === true,
      userSaidPickForMe: contextSignals.userSaidPickForMe === true,
    };
  }

  private resolveIntentDecision(
    ctx: TurnContext,
    docsAvailable: boolean,
  ): IntentDecisionOutput | null {
    try {
      return this.intentConfig.decide({
        env: resolveEnv(),
        language: ctx.locale,
        queryText: String(ctx.messageText || ""),
        candidates: this.buildCandidates(ctx, docsAvailable),
        signals: this.buildSignals(ctx),
        state:
          ((ctx.request.context as any)?.intentState as
            | {
                lastRoutingDecision?: {
                  intentId?: string;
                  operatorId?: string;
                  intentFamily?: string;
                  domainId?: string;
                  confidence?: number;
                };
                activeDomain?: string;
              }
            | undefined) || undefined,
      });
    } catch (error) {
      if (isStrictIntentConfigEnv()) {
        throw error;
      }
      return null;
    }
  }

  decide(ctx: TurnContext): TurnRouteDecision {
    const guard = this.editorGuard.enforce(ctx);
    if (guard.routeForcedToEditor) return "EDITOR";
    const connectorIntent = ctx.viewer?.mode
      ? guard.allowConnectorEscape
      : this.routePolicy.isConnectorTurn(ctx.messageText || "", ctx.locale);

    if (ctx.viewer?.mode) {
      if (connectorIntent) return "CONNECTOR";
      return "EDITOR";
    }

    if (connectorIntent) return "CONNECTOR";
    const docsAvailable = Boolean(
      ctx.attachedDocuments.length > 0 || ctx.activeDocument,
    );
    const decision = this.resolveIntentDecision(ctx, docsAvailable);
    if (decision) {
      return mapIntentFamilyToRoute(decision.intentFamily, docsAvailable);
    }
    return docsAvailable ? "KNOWLEDGE" : "GENERAL";
  }
}
