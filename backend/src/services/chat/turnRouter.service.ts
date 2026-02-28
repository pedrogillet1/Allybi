import type { TurnContext, TurnRouteDecision } from "./chat.types";
import { TurnRoutePolicyService } from "./turnRoutePolicy.service";
import {
  getDocumentIntelligenceBanksInstance,
  type DocumentIntelligenceBanksService,
} from "../core/banks/documentIntelligenceBanks.service";
import type {
  IntentDecisionOutput,
  IntentSignals,
  RouterCandidate,
} from "../config/intentConfig.service";
import { IntentConfigService } from "../config/intentConfig.service";

export interface RoutedTurnDecision {
  route: TurnRouteDecision;
  intentDecision: IntentDecisionOutput | null;
}

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

function normalizeForMatching(
  value: string,
  opts?: {
    caseInsensitive?: boolean;
    stripDiacritics?: boolean;
    collapseWhitespace?: boolean;
  },
): string {
  let out = String(value || "");
  if (opts?.stripDiacritics) {
    out = out.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  if (opts?.collapseWhitespace) {
    out = out.replace(/\s+/g, " ");
  }
  if (opts?.caseInsensitive !== false) {
    out = out.toLowerCase();
  }
  return out.trim();
}

function hasDocRefSignal(message: string): boolean {
  const input = low(message);
  return (
    /\b(document|doc|pdf|file|spreadsheet|sheet|slide|presentation|arquivo|documento|planilha|apresentacao|apresentação)\b/.test(
      input,
    ) || /[a-z0-9_ -]+\.(pdf|docx|xlsx|pptx|txt|csv)\b/.test(input)
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
  private readonly fileActionBankProvider:
    | Pick<DocumentIntelligenceBanksService, "getFileActionOperators">
    | ((bankId: string) => any | null);

  constructor(
    private readonly routePolicy: Pick<
      TurnRoutePolicyService,
      "isConnectorTurn"
    > = new TurnRoutePolicyService(),
    private readonly intentConfig: Pick<
      IntentConfigService,
      "decide"
    > = new IntentConfigService(),
    fileActionBankProvider:
      | Pick<DocumentIntelligenceBanksService, "getFileActionOperators">
      | ((
          bankId: string,
        ) => any | null) = getDocumentIntelligenceBanksInstance(),
  ) {
    this.fileActionBankProvider = fileActionBankProvider;
  }

  private getFileActionBank(): any | null {
    try {
      if (typeof this.fileActionBankProvider === "function") {
        return this.fileActionBankProvider("file_action_operators");
      }
      return this.fileActionBankProvider.getFileActionOperators();
    } catch {
      return null;
    }
  }

  private getPatterns(value: unknown): string[] {
    if (!value || typeof value !== "object") return [];
    const obj = value as Record<string, unknown>;
    return [
      ...(Array.isArray(obj.en) ? obj.en : []),
      ...(Array.isArray(obj.pt) ? obj.pt : []),
      ...(Array.isArray(obj.any) ? obj.any : []),
    ]
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  private detectFileAction(query: string): {
    operatorId: string;
    confidence: number;
  } | null {
    const bank = this.getFileActionBank();
    const detection = bank?.config?.operatorDetection;
    if (!bank || !detection?.enabled) return null;

    const normalized = normalizeForMatching(query, {
      caseInsensitive: detection.caseInsensitive !== false,
      stripDiacritics: detection.stripDiacritics !== false,
      collapseWhitespace: detection.collapseWhitespace !== false,
    });
    if (!normalized) return null;

    const mustNotContain = this.getPatterns(
      detection?.guards?.mustNotContain || {},
    );
    for (const pattern of mustNotContain) {
      try {
        if (new RegExp(pattern, "i").test(normalized)) return null;
      } catch {
        continue;
      }
    }

    const mustNotMatchWholeMessage = this.getPatterns(
      detection?.guards?.mustNotMatchWholeMessage || {},
    );
    for (const pattern of mustNotMatchWholeMessage) {
      try {
        if (new RegExp(pattern, "i").test(normalized)) return null;
      } catch {
        continue;
      }
    }

    const minConfidence = Number(detection.minConfidence || 0.55);
    const maxCandidates = Math.max(
      1,
      Number(detection.maxCandidatesPerMessage || 3),
    );
    const rules = Array.isArray(bank?.detectionRules)
      ? bank.detectionRules
      : [];
    const matches: Array<{
      operator: string;
      confidence: number;
      priority: number;
    }> = [];

    for (const rule of rules) {
      const operator = String(rule?.operator || "")
        .trim()
        .toLowerCase();
      if (!operator) continue;

      const patterns = this.getPatterns(rule?.patterns || {});
      if (patterns.length === 0) continue;

      let matched = false;
      for (const pattern of patterns) {
        try {
          if (new RegExp(pattern, "i").test(normalized)) {
            matched = true;
            break;
          }
        } catch {
          continue;
        }
      }
      if (!matched) continue;

      const ruleMustContain = this.getPatterns(rule?.mustContain || {});
      if (ruleMustContain.length > 0) {
        const hasRequired = ruleMustContain.some((pattern) => {
          try {
            return new RegExp(pattern, "i").test(normalized);
          } catch {
            return false;
          }
        });
        if (!hasRequired) continue;
      }

      const ruleMustNotContain = this.getPatterns(rule?.mustNotContain || {});
      const hasForbidden = ruleMustNotContain.some((pattern) => {
        try {
          return new RegExp(pattern, "i").test(normalized);
        } catch {
          return false;
        }
      });
      if (hasForbidden) continue;

      const confidence = Math.max(
        minConfidence,
        Number(rule?.confidence || minConfidence),
      );
      const priority = Number(rule?.priority || 0);

      matches.push({ operator, confidence, priority });
    }

    if (matches.length === 0) return null;

    matches.sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.operator.localeCompare(b.operator);
    });

    const top = matches.slice(0, maxCandidates)[0];
    if (!top || top.confidence < minConfidence) return null;
    return {
      operatorId: top.operator,
      confidence: top.confidence,
    };
  }

  private buildCandidates(
    ctx: TurnContext,
    docsAvailable: boolean,
  ): RouterCandidate[] {
    const query = String(ctx.messageText || "");
    const nav = isNavQuery(query);
    const discovery = isDiscoveryQuery(query);
    const fileAction = this.detectFileAction(query);

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
    if (fileAction) {
      candidates.push({
        intentId: "file_actions",
        operatorId: fileAction.operatorId,
        intentFamily: "file_actions",
        domainId: "general",
        score: Math.max(0.9, fileAction.confidence),
      });
    } else if (nav) {
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
      userRequestedShort:
        contextSignals.userRequestedShort === true ||
        ctx.request.truncationRetry === true,
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

  decideWithIntent(ctx: TurnContext): RoutedTurnDecision {
    const connectorIntent = this.routePolicy.isConnectorTurn(
      ctx.messageText || "",
      ctx.locale,
    );

    if (ctx.viewer?.mode) {
      if (connectorIntent) {
        return {
          route: "CONNECTOR",
          intentDecision: null,
        };
      }
      return {
        route: "KNOWLEDGE",
        intentDecision: null,
      };
    }

    if (connectorIntent) {
      return {
        route: "CONNECTOR",
        intentDecision: null,
      };
    }
    const docsAvailable = Boolean(
      ctx.attachedDocuments.length > 0 || ctx.activeDocument,
    );
    const decision = this.resolveIntentDecision(ctx, docsAvailable);
    if (decision) {
      return {
        route: mapIntentFamilyToRoute(decision.intentFamily, docsAvailable),
        intentDecision: decision,
      };
    }
    return {
      route: docsAvailable ? "KNOWLEDGE" : "GENERAL",
      intentDecision: null,
    };
  }

  decide(ctx: TurnContext): TurnRouteDecision {
    return this.decideWithIntent(ctx).route;
  }
}
