import type { TurnContext, TurnRouteDecision } from "./chat.types";
import {
  TurnRoutePolicyService,
  type ConnectorIntentDecision,
  type ConnectorDecisionContext,
} from "./turnRoutePolicy.service";
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
import { getOptionalBank } from "../core/banks/bankLoader.service";

export interface RoutedTurnDecision {
  route: TurnRouteDecision;
  intentDecision: IntentDecisionOutput | null;
}

type RoutePolicy = Pick<TurnRoutePolicyService, "isConnectorTurn"> &
  Partial<Pick<TurnRoutePolicyService, "resolveConnectorDecision">>;

type FollowupDetectionResult = {
  isFollowup: boolean;
  confidence: number | null;
  source: "context" | "followup_indicators" | "intent_patterns" | "none";
  reasonCodes: string[];
};

type FileActionDetectionResult =
  | {
      kind: "matched";
      operatorId: string;
      confidence: number;
    }
  | {
      kind: "suppressed";
    }
  | {
      kind: "none";
    };

type PersistedIntentState = {
  lastRoutingDecision?: {
    intentId?: string;
    operatorId?: string;
    intentFamily?: string;
    domainId?: string;
    confidence?: number;
  };
  activeDomain?: string;
};

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

function allowIntentDecisionFailOpen(): boolean {
  const raw = String(process.env.TURN_ROUTER_FAIL_OPEN || "")
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
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
  if (/[a-z0-9_ -]+\.(pdf|docx|xlsx|pptx|txt|csv)\b/.test(input)) {
    return true;
  }

  return /\b(?:document|doc|file|spreadsheet|sheet|slide|presentation|arquivo|documento|planilha|apresentacao|apresentação)\s+(?:named|called|titled|nomeado|chamado|intitulado|denominado)\s+["'`][^"'`]{1,160}["'`]/.test(
    input,
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

function isHowToQuery(message: string): boolean {
  return /\b(how to|how do i|como|cómo|tutorial|passo a passo|step by step)\b/.test(
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

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function getContextRecord(ctx: TurnContext): Record<string, unknown> {
  return asRecord(ctx.request.context);
}

function getContextSignals(ctx: TurnContext): Record<string, unknown> {
  return asRecord(getContextRecord(ctx).signals);
}

function getPersistedIntentState(ctx: TurnContext): PersistedIntentState | undefined {
  const state = asRecord(getContextRecord(ctx).intentState);
  if (Object.keys(state).length === 0) return undefined;
  const last = asRecord(state.lastRoutingDecision);
  return {
    lastRoutingDecision:
      Object.keys(last).length > 0
        ? {
            intentId: String(last.intentId || "").trim() || undefined,
            operatorId: String(last.operatorId || "").trim() || undefined,
            intentFamily: String(last.intentFamily || "").trim() || undefined,
            domainId: String(last.domainId || "").trim() || undefined,
            confidence:
              typeof last.confidence === "number"
                ? last.confidence
                : undefined,
          }
        : undefined,
    activeDomain: String(state.activeDomain || "").trim() || undefined,
  };
}

export class TurnRouterService {
  private static _followupMisconfigWarned = false;
  private readonly fileActionBankProvider:
    | Pick<DocumentIntelligenceBanksService, "getFileActionOperators">
    | ((bankId: string) => any | null);
  private readonly routingBankProvider: (bankId: string) => any | null;

  constructor(
    private readonly routePolicy: RoutePolicy = new TurnRoutePolicyService(),
    private readonly intentConfig: Pick<
      IntentConfigService,
      "decide"
    > = new IntentConfigService(),
    fileActionBankProvider:
      | Pick<DocumentIntelligenceBanksService, "getFileActionOperators">
      | ((
          bankId: string,
        ) => any | null) = getDocumentIntelligenceBanksInstance(),
    routingBankProvider: (bankId: string) => any | null = (bankId) =>
      getOptionalBank<any>(bankId),
  ) {
    this.fileActionBankProvider = fileActionBankProvider;
    this.routingBankProvider = routingBankProvider;
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

  private getOperatorCollisionMatrixBank(): any | null {
    try {
      return this.routingBankProvider("operator_collision_matrix");
    } catch {
      return null;
    }
  }

  /**
   * Loads a per-operator pattern bank (e.g. "operator_patterns_advise").
   * Returns null when bank is unavailable (fail-open).
   */
  private getOperatorPatternBank(operatorId: string): any | null {
    try {
      return this.routingBankProvider(`operator_patterns_${operatorId}`);
    } catch {
      return null;
    }
  }

  /**
   * Loads a navigation pattern bank for the given locale.
   * Returns null when bank is unavailable (fail-open).
   */
  private getNavIntentsBank(locale: "en" | "pt" | "es"): any | null {
    const bankId = locale === "es" ? "nav_intents_en" : `nav_intents_${locale}`;
    try {
      return this.routingBankProvider(bankId);
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

  private getLocalizedPatterns(
    value: unknown,
    locale: "en" | "pt" | "es",
  ): string[] {
    if (!value || typeof value !== "object") return [];
    const obj = value as Record<string, unknown>;
    return [
      ...(Array.isArray(obj[locale]) ? (obj[locale] as unknown[]) : []),
      ...(Array.isArray(obj.any) ? obj.any : []),
    ]
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  private regexMatchesAny(
    text: string,
    patterns: string[],
    opts?: { caseSensitive?: boolean },
  ): boolean {
    for (const pattern of patterns) {
      try {
        const regex = new RegExp(pattern, opts?.caseSensitive ? "g" : "gi");
        if (regex.test(text)) return true;
      } catch {
        continue;
      }
    }
    return false;
  }

  private getRoutingPriorityBoost(intentFamily: string): number {
    const bank = this.routingBankProvider("routing_priority");
    const priorities =
      bank?.intentFamilyBasePriority &&
      typeof bank.intentFamilyBasePriority === "object"
        ? (bank.intentFamilyBasePriority as Record<string, unknown>)
        : {};
    const values = Object.values(priorities)
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v) && v > 0);
    if (values.length === 0) return 0;
    const maxPriority = Math.max(...values);
    const familyPriority = Number(priorities[intentFamily] ?? 0);
    if (!Number.isFinite(familyPriority) || familyPriority <= 0) return 0;
    return Math.max(0, Math.min(0.08, (familyPriority / maxPriority) * 0.08));
  }

  private mapIntentFamilyToIntentId(intentFamily: string): string {
    const family = low(intentFamily);
    if (
      family === "documents" ||
      family === "file_actions" ||
      family === "doc_stats" ||
      family === "help" ||
      family === "conversation" ||
      family === "error" ||
      family === "connectors" ||
      family === "email" ||
      family === "editing"
    ) {
      return family;
    }
    return "documents";
  }

  private detectIntentPatternCandidates(
    query: string,
    locale: "en" | "pt" | "es",
    docsAvailable: boolean,
  ): RouterCandidate[] {
    const bank = this.routingBankProvider("intent_patterns");
    if (!bank?.config?.enabled) return [];
    const matching = bank?.config?.matching || {};
    const normalized = normalizeForMatching(query, {
      caseInsensitive: matching.caseSensitive !== true,
      stripDiacritics: matching.stripDiacriticsForMatching !== false,
      collapseWhitespace: matching.collapseWhitespace !== false,
    });
    if (!normalized) return [];

    const operators =
      bank?.operators && typeof bank.operators === "object"
        ? (bank.operators as Record<string, any>)
        : {};
    const out: RouterCandidate[] = [];
    for (const [operatorId, entry] of Object.entries(operators)) {
      if (!entry || typeof entry !== "object" || operatorId.startsWith("_")) {
        continue;
      }
      const positives = this.getLocalizedPatterns(entry.patterns || {}, locale);
      if (positives.length === 0) continue;
      if (!this.regexMatchesAny(normalized, positives)) continue;
      const negatives = this.getLocalizedPatterns(
        entry.negatives || {},
        locale,
      );
      if (negatives.length > 0 && this.regexMatchesAny(normalized, negatives)) {
        continue;
      }
      const intentFamily = String(entry.intentFamily || "")
        .trim()
        .toLowerCase();
      if (!intentFamily) continue;
      const minConfidence = Number(
        entry.minConfidence ?? matching.minConfidenceFallback ?? 0.5,
      );
      const priority = Number(entry.priority || 0);
      const priorityBoost = Math.max(0, Math.min(0.18, priority / 600));
      const docBoost = docsAvailable && intentFamily === "documents" ? 0.03 : 0;
      const familyBoost = this.getRoutingPriorityBoost(intentFamily);
      const score = Math.max(
        0,
        Math.min(
          1,
          Math.max(0.35, Number.isFinite(minConfidence) ? minConfidence : 0.5) +
            priorityBoost +
            docBoost +
            familyBoost,
        ),
      );
      out.push({
        intentId: this.mapIntentFamilyToIntentId(intentFamily),
        operatorId,
        intentFamily,
        domainId:
          intentFamily === "email"
            ? "email"
            : intentFamily === "connectors"
              ? "connectors"
              : "general",
        score,
      });
    }
    // Supplement with per-operator pattern banks (fail-open: missing banks are skipped).
    for (const candidate of out) {
      const opBank = this.getOperatorPatternBank(candidate.operatorId);
      if (!opBank?.config?.enabled) continue;
      // If the per-operator bank has supplementary confidence boosts, apply them.
      const supplementaryBoost = Number(opBank?.config?.confidenceBoost || 0);
      if (supplementaryBoost > 0 && supplementaryBoost < 0.1) {
        candidate.score = Math.min(1, candidate.score + supplementaryBoost);
      }
    }

    out.sort((a, b) => b.score - a.score);
    return out;
  }

  private hasOperatorCandidate(
    candidates: RouterCandidate[],
    operators: string[],
  ): boolean {
    const wanted = new Set(operators.map((op) => low(op)));
    return candidates.some((candidate) =>
      wanted.has(low(String(candidate.operatorId || ""))),
    );
  }

  private detectFollowupFromPatterns(
    query: string,
    locale: "en" | "pt" | "es",
  ): FollowupDetectionResult {
    const bank = this.routingBankProvider("intent_patterns");
    const matching = bank?.config?.matching || {};
    const normalized = normalizeForMatching(query, {
      caseInsensitive: matching.caseSensitive !== true,
      stripDiacritics: matching.stripDiacriticsForMatching !== false,
      collapseWhitespace: matching.collapseWhitespace !== false,
    });
    if (!normalized) {
      return {
        isFollowup: false,
        confidence: null,
        source: "none",
        reasonCodes: [],
      };
    }
    const overlayPatterns = this.getLocalizedPatterns(
      bank?.overlays?.followupIndicators || {},
      locale,
    );
    if (overlayPatterns.length === 0) {
      if (!TurnRouterService._followupMisconfigWarned) {
        TurnRouterService._followupMisconfigWarned = true;
        console.warn("[turn-router] followup detection disabled: overlayPatterns is empty for locale", locale);
      }
      return {
        isFollowup: false,
        confidence: null,
        source: "none",
        reasonCodes: [],
      };
    }
    const matched = this.regexMatchesAny(normalized, overlayPatterns);
    return {
      isFollowup: matched,
      confidence: matched ? 0.64 : null,
      source: matched ? "intent_patterns" : "none",
      reasonCodes: matched ? ["followup_overlay_pattern"] : [],
    };
  }

  private evaluateFollowupWhenClause(
    clause: Array<{ path?: string; op?: string; value?: unknown }> | undefined,
    runtimeSignals: Record<string, unknown>,
  ): boolean {
    if (!Array.isArray(clause) || clause.length === 0) return true;
    for (const condition of clause) {
      const path = String(condition?.path || "").trim();
      const op = String(condition?.op || "")
        .trim()
        .toLowerCase();
      if (!path.startsWith("signals.")) return false;
      const key = path.slice("signals.".length);
      const current = runtimeSignals[key];
      const expected = condition?.value;
      if (op === "eq") {
        if (current !== expected) return false;
        continue;
      }
      if (op === "neq") {
        if (current === expected) return false;
        continue;
      }
      return false;
    }
    return true;
  }

  private detectFollowupFromIndicatorsBank(
    ctx: TurnContext,
    query: string,
    locale: "en" | "pt" | "es",
    hasExplicitDocRef: boolean,
  ): FollowupDetectionResult {
    const bank = this.routingBankProvider("followup_indicators");
    if (!bank?.config?.enabled) {
      return {
        isFollowup: false,
        confidence: null,
        source: "none",
        reasonCodes: [],
      };
    }
    const normalized = normalizeForMatching(query, {
      caseInsensitive: true,
      stripDiacritics: true,
      collapseWhitespace: true,
    });
    if (!normalized) {
      return {
        isFollowup: false,
        confidence: null,
        source: "none",
        reasonCodes: [],
      };
    }

    const contextSignals = getContextSignals(ctx);
    const runtimeSignals: Record<string, unknown> = {
      hasActiveDoc: Boolean(ctx.activeDocument || ctx.viewer?.documentId),
      explicitDocRef:
        contextSignals.explicitDocRef === true || hasExplicitDocRef,
      hasPriorTurn: Boolean(
        getPersistedIntentState(ctx)?.lastRoutingDecision ||
        contextSignals.hasPriorTurn === true,
      ),
    };

    let score = 0;
    let overrideNewTurn = false;
    const reasonCodes: string[] = [];
    for (const rule of Array.isArray(bank?.rules) ? bank.rules : []) {
      const patterns = this.getLocalizedPatterns(
        rule?.triggerPatterns || {},
        locale,
      );
      if (patterns.length === 0) continue;
      if (!this.regexMatchesAny(normalized, patterns)) continue;
      const whenAll = Array.isArray(rule?.when?.all) ? rule.when.all : [];
      if (!this.evaluateFollowupWhenClause(whenAll, runtimeSignals)) continue;
      const actionType = String(rule?.action?.type || "").trim();
      if (actionType === "add_followup_score") {
        score += Number(rule?.action?.score || 0);
        reasonCodes.push(String(rule?.reasonCode || "followup_rule_match"));
      } else if (actionType === "set_followup_override") {
        if (String(rule?.action?.override || "").trim() === "new_turn") {
          overrideNewTurn = true;
          reasonCodes.push(String(rule?.reasonCode || "followup_override"));
        }
      }
    }

    const minScore = Number(
      bank?.config?.actionsContract?.thresholds?.followupScoreMin ?? 0.65,
    );
    const capped = Math.max(0, Math.min(1, score));
    const isFollowup = !overrideNewTurn && capped >= minScore;
    return {
      isFollowup,
      confidence: capped > 0 ? capped : null,
      source: "followup_indicators",
      reasonCodes,
    };
  }

  private detectFollowupSignal(
    ctx: TurnContext,
    query: string,
    hasExplicitDocRef: boolean,
  ): FollowupDetectionResult {
    const contextSignals = getContextSignals(ctx);
    if (typeof contextSignals.isFollowup === "boolean") {
      return {
        isFollowup: contextSignals.isFollowup,
        confidence:
          typeof contextSignals.followupConfidence === "number"
            ? contextSignals.followupConfidence
            : null,
        source: "context",
        reasonCodes: [],
      };
    }
    const fromBank = this.detectFollowupFromIndicatorsBank(
      ctx,
      query,
      ctx.locale,
      hasExplicitDocRef,
    );
    if (fromBank.source !== "none") return fromBank;
    return this.detectFollowupFromPatterns(query, ctx.locale);
  }

  private getTiebreakWeight(stageId: string): number {
    const bank = this.routingBankProvider("routing_priority");
    const stages = Array.isArray(bank?.tiebreakStages)
      ? bank.tiebreakStages
      : [];
    if (stages.length === 0) return 0;
    const maxWeight = Math.max(
      ...stages
        .map((stage: any) => Number(stage?.weight || 0))
        .filter((weight: number) => Number.isFinite(weight) && weight > 0),
      0,
    );
    if (maxWeight <= 0) return 0;
    const stage = stages.find(
      (entry: any) => String(entry?.id || "").trim() === stageId,
    );
    const raw = Number(stage?.weight || 0);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return Math.max(0, Math.min(1, raw / maxWeight));
  }

  private applyRoutingTiebreakers(
    ctx: TurnContext,
    candidates: RouterCandidate[],
    args: {
      hasExplicitDocRef: boolean;
      isFollowup: boolean;
    },
  ): RouterCandidate[] {
    const hasLockedScope = Boolean(
      ctx.activeDocument ||
      ctx.viewer?.documentId ||
      getContextSignals(ctx).explicitDocLock === true,
    );
    const lastIntentFamily = low(
      String(
        getPersistedIntentState(ctx)?.lastRoutingDecision?.intentFamily || "",
      ),
    );
    const lockedScopeWeight = this.getTiebreakWeight("locked_scope_first");
    const explicitDocWeight = this.getTiebreakWeight(
      "explicit_document_reference",
    );
    const followupWeight = this.getTiebreakWeight("recency_and_followup");
    const confidenceWeight = this.getTiebreakWeight("operator_confidence");

    for (const candidate of candidates) {
      const family = low(String(candidate.intentFamily || ""));
      let delta = 0;
      if (
        hasLockedScope &&
        ["documents", "editing", "doc_stats", "file_actions"].includes(family)
      ) {
        delta += 0.03 * lockedScopeWeight;
      }
      if (
        args.hasExplicitDocRef &&
        ["documents", "editing", "doc_stats"].includes(family)
      ) {
        delta += 0.05 * explicitDocWeight;
      }
      if (args.isFollowup && lastIntentFamily && family === lastIntentFamily) {
        delta += 0.03 * followupWeight;
      }
      delta +=
        Math.max(0, Math.min(0.02, candidate.score * 0.02)) * confidenceWeight;
      candidate.score = Math.max(0, Math.min(1, candidate.score + delta));
    }
    return candidates;
  }

  private detectFileAction(query: string): FileActionDetectionResult {
    const bank = this.getFileActionBank();
    const detection = bank?.config?.operatorDetection;
    if (!bank || !detection?.enabled) return { kind: "none" };

    const normalized = normalizeForMatching(query, {
      caseInsensitive: detection.caseInsensitive !== false,
      stripDiacritics: detection.stripDiacritics !== false,
      collapseWhitespace: detection.collapseWhitespace !== false,
    });
    if (!normalized) return { kind: "none" };

    const isCaseSensitive = detection.caseInsensitive === false;
    const regexOpts = { caseSensitive: isCaseSensitive };
    const matchesAny = (patterns: string[]): boolean =>
      this.regexMatchesAny(normalized, patterns, regexOpts);

    const mustNotContain = this.getPatterns(
      detection?.guards?.mustNotContain || {},
    );
    if (matchesAny(mustNotContain)) {
      return { kind: "suppressed" };
    }

    const mustNotMatchWholeMessage = this.getPatterns(
      detection?.guards?.mustNotMatchWholeMessage || {},
    );
    if (matchesAny(mustNotMatchWholeMessage)) {
      return { kind: "suppressed" };
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

      const matched = matchesAny(patterns);
      if (!matched) continue;

      const ruleMustContain = this.getPatterns(rule?.mustContain || {});
      if (ruleMustContain.length > 0) {
        const hasRequired = matchesAny(ruleMustContain);
        if (!hasRequired) continue;
      }

      const ruleMustNotContain = this.getPatterns(rule?.mustNotContain || {});
      const hasForbidden = matchesAny(ruleMustNotContain);
      if (hasForbidden) continue;

      const confidence = Math.max(
        minConfidence,
        Number(rule?.confidence || minConfidence),
      );
      const priority = Number(rule?.priority || 0);

      matches.push({ operator, confidence, priority });
    }

    if (matches.length === 0) return { kind: "none" };

    matches.sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.operator.localeCompare(b.operator);
    });

    const collisionBank = this.getOperatorCollisionMatrixBank();
    const collisionEnabled = collisionBank?.config?.enabled !== false;
    const collisionRules = Array.isArray(collisionBank?.rules)
      ? collisionBank.rules
      : [];

    const isSuppressedByCollisionMatrix = (operator: string): boolean => {
      if (!collisionEnabled || collisionRules.length === 0) return false;
      for (const rule of collisionRules) {
        if (!rule || typeof rule !== "object") continue;
        const when = asRecord(asRecord(rule).when);
        const operators = Array.isArray(when?.operators)
          ? when.operators.map((value: unknown) =>
              String(value || "")
                .trim()
                .toLowerCase(),
            )
          : [];
        if (operators.length > 0 && !operators.includes(operator)) continue;
        const patterns = this.getPatterns(when?.queryRegexAny || {});
        if (patterns.length === 0) continue;
        if (this.regexMatchesAny(normalized, patterns, regexOpts)) return true;
      }
      return false;
    };

    for (const candidate of matches.slice(0, maxCandidates)) {
      if (candidate.confidence < minConfidence) continue;
      if (isSuppressedByCollisionMatrix(candidate.operator)) continue;
      return {
        kind: "matched",
        operatorId: candidate.operator,
        confidence: candidate.confidence,
      };
    }
    return { kind: "suppressed" };
  }

  private buildCandidates(
    ctx: TurnContext,
    docsAvailable: boolean,
  ): RouterCandidate[] {
    const query = String(ctx.messageText || "");
    const locale = ctx.locale || "en";
    const nav = isNavQuery(query);
    const discovery = isDiscoveryQuery(query);
    const howTo = isHowToQuery(query);
    const fileAction = this.detectFileAction(query);
    const docRef = hasDocRefSignal(query);
    const followup = this.detectFollowupSignal(ctx, query, docRef);
    const patternCandidates = this.detectIntentPatternCandidates(
      query,
      locale,
      docsAvailable,
    );

    const candidates: RouterCandidate[] = [...patternCandidates];
    const hasFamily = (family: string) =>
      candidates.some(
        (candidate) => low(candidate.intentFamily || "") === low(family),
      );

    if (!hasFamily("documents") && (docsAvailable || discovery || docRef)) {
      candidates.push({
        intentId: "documents",
        operatorId: discovery ? "locate_docs" : "extract",
        intentFamily: "documents",
        domainId: "general",
        score:
          (docsAvailable ? 0.82 : 0.72) +
          this.getRoutingPriorityBoost("documents"),
      });
    }
    if (fileAction.kind === "matched" && !hasFamily("file_actions")) {
      candidates.push({
        intentId: "file_actions",
        operatorId: fileAction.operatorId,
        intentFamily: "file_actions",
        domainId: "general",
        score: Math.max(
          0.84 + this.getRoutingPriorityBoost("file_actions"),
          fileAction.confidence + this.getRoutingPriorityBoost("file_actions"),
        ),
      });
    } else if (
      fileAction.kind !== "suppressed" &&
      nav &&
      !hasFamily("file_actions")
    ) {
      // Load supplementary nav intent bank for locale-aware score refinement.
      const navBank = this.getNavIntentsBank(locale);
      const navBoost = navBank?.config?.enabled ? 0.01 : 0;
      candidates.push({
        intentId: "file_actions",
        operatorId: "open",
        intentFamily: "file_actions",
        domainId: "general",
        score:
          (docsAvailable ? 0.76 : 0.82) +
          this.getRoutingPriorityBoost("file_actions") +
          navBoost,
      });
    }
    if (howTo && !hasFamily("help")) {
      candidates.push({
        intentId: "help",
        operatorId: "how_to",
        intentFamily: "help",
        domainId: "general",
        score: 0.72 + this.getRoutingPriorityBoost("help"),
      });
    }
    if (!hasFamily("help")) {
      candidates.push({
        intentId: "help",
        operatorId: "capabilities",
        intentFamily: "help",
        domainId: "general",
        score:
          (docsAvailable ? 0.36 : 0.58) + this.getRoutingPriorityBoost("help"),
      });
    }
    this.applyRoutingTiebreakers(ctx, candidates, {
      hasExplicitDocRef: docRef,
      isFollowup: followup.isFollowup,
    });
    candidates.sort((a, b) => b.score - a.score);
    return candidates;
  }

  private buildSignals(
    ctx: TurnContext,
    docsAvailable: boolean,
    candidates: RouterCandidate[],
  ): IntentSignals {
    const contextSignals = getContextSignals(ctx);
    const query = String(ctx.messageText || "");
    const docRef = hasDocRefSignal(query);
    const followup = this.detectFollowupSignal(ctx, query, docRef);
    const discoveryFromPattern = this.hasOperatorCandidate(candidates, [
      "locate_docs",
    ]);
    const navFromPattern = this.hasOperatorCandidate(candidates, [
      "open",
      "locate_file",
      "list",
      "filter",
      "sort",
      "group",
      "count_files",
    ]);
    const explicitFollowup =
      typeof contextSignals.isFollowup === "boolean"
        ? contextSignals.isFollowup
        : null;
    return {
      isFollowup:
        explicitFollowup !== null ? explicitFollowup : followup.isFollowup,
      followupConfidence:
        typeof contextSignals.followupConfidence === "number"
          ? contextSignals.followupConfidence
          : followup.confidence != null
            ? followup.confidence
            : undefined,
      hasExplicitDocRef: contextSignals.explicitDocRef === true || docRef,
      discoveryQuery:
        contextSignals.discoveryQuery === true ||
        discoveryFromPattern ||
        (isDiscoveryQuery(query) && (docsAvailable || docRef)),
      navQuery:
        contextSignals.navQuery === true ||
        navFromPattern ||
        (isNavQuery(query) && (docsAvailable || docRef)),
      userRequestedShort:
        contextSignals.userRequestedShort === true ||
        ctx.request.truncationRetry === true,
      userRequestedDetailed: contextSignals.userRequestedDetailed === true,
      userSaidPickForMe: contextSignals.userSaidPickForMe === true,
    };
  }

  private buildConnectorDecisionContext(
    ctx: TurnContext,
  ): ConnectorDecisionContext {
    const contextSignals = getContextSignals(ctx);
    const activeProvider = String(ctx.connectors?.activeConnector || "")
      .trim()
      .toLowerCase();
    const normalizedActive =
      activeProvider === "gmail" ||
      activeProvider === "outlook" ||
      activeProvider === "slack" ||
      activeProvider === "email"
        ? (activeProvider as "gmail" | "outlook" | "slack" | "email")
        : null;
    return {
      activeProvider: normalizedActive,
      connectedProviders: {
        ...(ctx.connectors?.connected || {}),
      },
      hasConnectorReadPermission:
        contextSignals.hasConnectorReadPermission === true,
    };
  }

  private resolveIntentDecision(
    ctx: TurnContext,
    docsAvailable: boolean,
  ): IntentDecisionOutput | null {
    try {
      const candidates = this.buildCandidates(ctx, docsAvailable);
      return this.intentConfig.decide({
        env: resolveEnv(),
        language: ctx.locale,
        queryText: String(ctx.messageText || ""),
        candidates,
        signals: this.buildSignals(ctx, docsAvailable, candidates),
        state: getPersistedIntentState(ctx),
      });
    } catch (error) {
      if (isStrictIntentConfigEnv()) {
        throw error;
      }
      if (allowIntentDecisionFailOpen()) return null;
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

  decideWithIntent(ctx: TurnContext): RoutedTurnDecision {
    const connectorContext = this.buildConnectorDecisionContext(ctx);
    const connectorDecision =
      typeof this.routePolicy.resolveConnectorDecision === "function"
        ? this.routePolicy.resolveConnectorDecision(
            ctx.messageText || "",
            ctx.locale,
            connectorContext,
          )
        : null;
    const connectorIntent =
      connectorDecision ||
      (this.routePolicy.isConnectorTurn(
        ctx.messageText || "",
        ctx.locale,
        connectorContext,
      )
        ? true
        : false);

    if (ctx.viewer?.mode) {
      if (connectorDecision) {
        return {
          route: "CONNECTOR",
          intentDecision: this.toConnectorIntentDecision(connectorDecision),
        };
      }
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

    if (connectorDecision) {
      return {
        route: "CONNECTOR",
        intentDecision: this.toConnectorIntentDecision(connectorDecision),
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
        route: decision.requiresClarification
          ? "CLARIFY"
          : mapIntentFamilyToRoute(decision.intentFamily, docsAvailable),
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
