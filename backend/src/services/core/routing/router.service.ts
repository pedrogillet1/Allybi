// src/services/core/router.service.ts
//
// ROUTER SERVICE (ChatGPT-like, bank-driven)
// ------------------------------------------------------------
// Job: turn a user message into a RoutingDecision (intentFamily, operator,
// answerMode, signals, constraints, and rewritten query hints).
//
// Hard rules:
// - NO hardcoded “answers” here (routing only).
// - nav_pills actions (open/where/discover) must route to answerMode=nav_pills
// - greetings/thanks/ack must route to conversation (microcopy bank), not tools
// - if signals.policyRefusalRequired is set upstream, router must not override it
//
// Expected pipeline placement:
// followup_detection → query_rewrite → intent_patterns/operator resolution → answer_mode_router
//
// Banks used (by ID):
// - routing/intent_patterns.any.json
// - routing/routing_priority.any.json
// - routing/operator_priority.any.json
// - routing/routing_operator_tiebreakers.any.json
// - routing/tool_router.any.json
// - routing/intent_config.any.json
// - operators/operator_aliases.any.json
// - operators/operator_contracts.any.json
// - operators/operator_output_shapes.any.json
// - operators/operator_negatives.any.json
// - triggers/* (intent/operator/format/nav/domain/language triggers)
//
// Services used (preferred):
// - queryRewriter.service.ts
// - operatorResolver.service.ts
// - answerModeRouter.service.ts
//
// NOTE: This file is intentionally “routing-only”. Retrieval, scope resolution,
// candidate filters, and answer composition happen in other services.

import { getBank } from "../banks/bankLoader.service";
import type { LanguageCode } from "../../../types/intents.types";

// Optional dependencies (if you have them)
import queryRewriterModule from "./queryRewriter.service";
const getQueryRewriter = (): any => ({
  rewrite: (input: any) => ({
    rewrittenText: input?.text ?? "",
    hints: {},
  }),
  ...queryRewriterModule,
});
import { getOperatorResolver } from "./operatorResolver.service";
import { AnswerModeRouterService } from "./answerModeRouter.service";
const getAnswerModeRouter = (): any => new AnswerModeRouterService();

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type EnvName = "production" | "staging" | "dev" | "local";

export interface RouterInput {
  conversationId: string;
  turnId: string;
  userText: string;

  env: EnvName;

  // Prior state (for follow-ups, active doc pinning, etc.)
  state?: any;

  // Doc context summary (counts only; retrieval happens later)
  docContext?: {
    docCount: number;
    // optionally: filenames, ids, lastUsed, etc.
    attachedDocumentIds?: string[];
  };

  // Upstream signals (e.g., policy refusal)
  signals?: Record<string, any>;

  // User prefs (optional)
  userPrefs?: {
    language?: LanguageCode;
    noQuotes?: boolean;
    shortByDefault?: boolean;
  };
}

export interface QueryRewriteOutput {
  rewrittenText: string;
  hints: any; // keep flexible; you already have a bank-driven contract
  debug?: any;
}

export interface RoutingDecision {
  intentFamily: string; // e.g. documents | file_actions | help | conversation
  operator: string; // e.g. summarize | extract | open | locate_docs | conversation
  answerMode: string; // e.g. doc_grounded_single | nav_pills | no_docs | refusal | scoped_not_found

  language: LanguageCode;

  // “Signals” are your global boolean feature flags for downstream stages.
  signals: Record<string, any>;

  // Formatting / behavior constraints for composer and render policy
  constraints: {
    outputShape?:
      | "paragraph"
      | "bullets"
      | "numbered_list"
      | "table"
      | "file_list"
      | "button_only";
    exactBulletCount?: number;
    maxSentences?: number;
    requireTable?: boolean;
    requireSourceButtons?: boolean;
    maxFollowups?: number;
    userRequestedShort?: boolean;
  };

  // Produced by query rewrite
  query: QueryRewriteOutput;

  // Optional debug trace
  trace?: {
    matchedIntentPatterns?: string[];
    matchedOperatorTriggers?: string[];
    operatorScoreTop?: Array<{
      operator: string;
      score: number;
      reasons: string[];
    }>;
    answerModeReason?: string;
  };
}

// -----------------------------------------------------------------------------
// Bank contracts (minimal, tolerant)
// -----------------------------------------------------------------------------

type RegexEntry = { id: string; pattern: string; weight?: number };

type IntentPatternsBank = {
  _meta: any;
  config?: {
    enabled?: boolean;
    caseInsensitive?: boolean;
    stripDiacritics?: boolean;
  };
  families: Array<{
    id: string; // intent family
    weight?: number;
    triggers: { en?: RegexEntry[]; pt?: RegexEntry[]; es?: RegexEntry[] };
  }>;
};

type RoutingPriorityBank = {
  _meta: any;
  config?: { enabled?: boolean };
  // Base scores by intent family/operator (optional)
  intentFamilyBoost?: Record<string, number>;
  operatorBoost?: Record<string, number>;
};

type OperatorPriorityBank = {
  _meta: any;
  config?: { enabled?: boolean };
  basePriority?: Record<string, number>; // operator -> base score
};

type ToolRouterBank = {
  _meta: any;
  config?: { enabled?: boolean };
  // If your system uses tools, route here (you already have tool_router.any.json)
  // This service only emits tool hints; orchestrator/toolRouter executes tools.
  rules?: Array<{
    id: string;
    when: any; // your DSL
    then: { tool?: string; operator?: string; reason?: string };
  }>;
};

type TriggerBank = {
  _meta: any;
  config?: { enabled?: boolean; useRegex?: boolean; caseInsensitive?: boolean };
  triggers: Array<{
    id: string;
    sets: Record<string, any>; // signals to set
    patterns: { en?: string[]; pt?: string[]; es?: string[] };
  }>;
};

function normalizeText(
  input: string,
  opts: { stripDiacritics: boolean; collapseWhitespace: boolean },
): string {
  let t = input ?? "";
  if (opts.stripDiacritics)
    t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (opts.collapseWhitespace) t = t.replace(/\s+/g, " ");
  return t.trim();
}

function toLang(userPrefsLang?: LanguageCode): LanguageCode {
  return (userPrefsLang || "en") as LanguageCode;
}

function compileRegex(
  pattern: string,
  caseInsensitive: boolean,
): RegExp | null {
  try {
    return new RegExp(pattern, caseInsensitive ? "i" : undefined);
  } catch {
    return null;
  }
}

function countSentences(text: string): number {
  // heuristic, good enough for routing constraints
  const m = text.match(/[.!?]+(?:\s|$)/g);
  return m ? m.length : 0;
}

// -----------------------------------------------------------------------------
// Router Service
// -----------------------------------------------------------------------------

export class RouterService {
  private intentPatterns?: IntentPatternsBank;
  private routingPriority?: RoutingPriorityBank;
  private operatorPriority?: OperatorPriorityBank;
  private toolRouter?: ToolRouterBank;

  private triggersIntent?: TriggerBank;
  private triggersOperator?: TriggerBank;
  private triggersFormat?: TriggerBank;
  private triggersNav?: TriggerBank;
  private triggersDomain?: TriggerBank;
  private triggersLanguage?: TriggerBank;

  private compiledAt = 0;

  constructor() {
    this.reloadBanks();
  }

  reloadBanks(): void {
    this.intentPatterns = getBank<IntentPatternsBank>("intent_patterns");
    this.routingPriority = getBank<RoutingPriorityBank>("routing_priority");
    this.operatorPriority = getBank<OperatorPriorityBank>("operator_priority");
    this.toolRouter = getBank<ToolRouterBank>("tool_router");

    this.triggersIntent = getBank<TriggerBank>("intent_triggers");
    this.triggersOperator = getBank<TriggerBank>("operator_triggers");
    this.triggersFormat = getBank<TriggerBank>("format_triggers");
    this.triggersNav = getBank<TriggerBank>("nav_triggers");
    this.triggersDomain = getBank<TriggerBank>("domain_triggers");
    this.triggersLanguage = getBank<TriggerBank>("language_triggers");

    this.compiledAt = Date.now();
  }

  route(input: RouterInput): RoutingDecision {
    // If upstream already forced a refusal, do not fight it.
    if (input.signals?.policyRefusalRequired === true) {
      return this.forcedRefusalDecision(input);
    }

    const language = toLang(input.userPrefs?.language);
    const raw = input.userText || "";
    const normalized = normalizeText(raw, {
      stripDiacritics: true,
      collapseWhitespace: true,
    });

    // 1) Trigger signals (bank-driven, cheap)
    const signals: Record<string, any> = { ...(input.signals || {}) };
    const matchedTriggers: string[] = [];

    this.applyTriggerBank(
      this.triggersLanguage,
      normalized,
      language,
      signals,
      matchedTriggers,
    );
    this.applyTriggerBank(
      this.triggersNav,
      normalized,
      language,
      signals,
      matchedTriggers,
    );
    this.applyTriggerBank(
      this.triggersFormat,
      normalized,
      language,
      signals,
      matchedTriggers,
    );
    this.applyTriggerBank(
      this.triggersOperator,
      normalized,
      language,
      signals,
      matchedTriggers,
    );
    this.applyTriggerBank(
      this.triggersIntent,
      normalized,
      language,
      signals,
      matchedTriggers,
    );
    this.applyTriggerBank(
      this.triggersDomain,
      normalized,
      language,
      signals,
      matchedTriggers,
    );

    // 2) Follow-up detection (via state continuity signals)
    // Follow-up detection is handled by state signals from prior turns
    signals.isFollowup = !!(
      input.state?.activeDocRef?.docId || input.signals?.isFollowup
    );
    signals.followupConfidence = signals.isFollowup ? 0.7 : 0;

    // 3) Query rewrite (extract doc refs, time, numeric, format hints)
    const queryRewriter = getQueryRewriter?.();
    let query: QueryRewriteOutput = { rewrittenText: raw, hints: {} };
    if (queryRewriter?.rewrite) {
      const q = queryRewriter.rewrite({
        text: raw,
        language,
        signals,
        state: input.state,
      });
      query = {
        rewrittenText: q?.rewrittenText ?? raw,
        hints: q?.hints ?? {},
        debug: q?.debug,
      };
    }

    // Convenience signals from hints
    signals.hasExplicitDocRef = !!(
      query?.hints?.docRefs?.docIds?.length ||
      query?.hints?.docRefs?.filenames?.length
    );

    // 4) Intent family detection (bank-driven)
    const intentFamily = this.detectIntentFamily(normalized, language, signals);

    // 5) Operator resolution (bank-driven, with negatives + priority)
    const operatorResolver = getOperatorResolver?.();
    let operator = "qa";
    let operatorTrace:
      | Array<{ operator: string; score: number; reasons: string[] }>
      | undefined;

    if (operatorResolver?.resolve) {
      const resolved = operatorResolver.resolve(query.rewrittenText, language);

      operator = resolved?.operator || operator;
      operatorTrace = (resolved as any)?.trace;
      // merge in resolver signals if provided
      if ((resolved as any)?.signals)
        Object.assign(signals, (resolved as any).signals);
    } else {
      // minimal fallback if resolver service missing
      operator = this.minimalOperatorHeuristic(intentFamily, signals);
    }

    // 6) Constraints (format/UX), derived from signals + query
    const constraints = this.buildConstraints(raw, signals, query, operator);

    // 7) Answer mode router (bank-driven)
    const answerModeRouter = getAnswerModeRouter?.();
    let answerMode = "general_answer";
    let answerModeReason = "fallback";

    if (answerModeRouter?.route) {
      const routed = answerModeRouter.route({
        operator,
        intentFamily,
        signals,
        scope: undefined,
        docContext: input.docContext || { docCount: 0 },
        state: input.state,
        constraints,
      });
      answerMode = routed?.mode || answerMode;
      answerModeReason = routed?.reason || answerModeReason;
      if (routed?.signals) Object.assign(signals, routed.signals);
    } else {
      // Minimal fallback: nav signals -> nav_pills; docs available -> doc_grounded_single
      if (this.isNavOperator(operator) || signals.navQuery) {
        answerMode = "nav_pills";
        answerModeReason = "nav_fallback";
      } else if (
        (input.docContext?.docCount || 0) > 0 &&
        intentFamily === "documents"
      ) {
        answerMode = "doc_grounded_single";
        answerModeReason = "docs_available";
      }
    }

    // 8) Tool routing hint (optional)
    // Router does not execute tools. It can set signals.toolHint / operator override if your system supports.
    // If you already use tool_router service, keep it there—this stays a hint only.
    // (Leaving it passive avoids accidental tool hijacks.)
    // signals.toolHint = ...

    return {
      intentFamily,
      operator,
      answerMode,
      language,
      signals,
      constraints,
      query,
      trace: {
        matchedIntentPatterns: signals.__intentMatches || [],
        matchedOperatorTriggers: matchedTriggers,
        operatorScoreTop: operatorTrace?.slice(0, 5),
        answerModeReason,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Forced decisions
  // ---------------------------------------------------------------------------

  private forcedRefusalDecision(input: RouterInput): RoutingDecision {
    const language = toLang(input.userPrefs?.language);
    const raw = input.userText || "";
    return {
      intentFamily: "policy",
      operator: "refusal",
      answerMode: "refusal",
      language,
      signals: { ...(input.signals || {}), policyRefusalRequired: true },
      constraints: { maxFollowups: 0 },
      query: { rewrittenText: raw, hints: {} },
      trace: { answerModeReason: "policy_refusal_required" },
    };
  }

  // ---------------------------------------------------------------------------
  // Intent family detection
  // ---------------------------------------------------------------------------

  private detectIntentFamily(
    normalized: string,
    lang: LanguageCode,
    signals: Record<string, any>,
  ): string {
    // If triggers already pinned intent family, trust it
    if (
      typeof signals.intentFamily === "string" &&
      signals.intentFamily.length
    ) {
      return signals.intentFamily;
    }

    const bank = this.intentPatterns;
    if (!bank?.families?.length) {
      // minimal fallback
      if (signals.navQuery) return "file_actions";
      if (signals.isConversationOnly) return "conversation";
      return "documents";
    }

    const caseInsensitive = bank.config?.caseInsensitive !== false;
    const matches: Array<{
      family: string;
      score: number;
      matchIds: string[];
    }> = [];

    for (const fam of bank.families) {
      const triggers = (fam.triggers?.[lang] ||
        fam.triggers?.en ||
        []) as RegexEntry[];
      let score = 0;
      const matchIds: string[] = [];
      for (const t of triggers) {
        const re = compileRegex(t.pattern, caseInsensitive);
        if (!re) continue;
        if (re.test(normalized)) {
          score += t.weight ?? 1;
          matchIds.push(t.id);
        }
      }
      if (score > 0)
        matches.push({
          family: fam.id,
          score: score * (fam.weight ?? 1),
          matchIds,
        });
    }

    matches.sort((a, b) => b.score - a.score);

    if (matches.length) {
      signals.__intentMatches = matches[0].matchIds;
      return matches[0].family;
    }

    return "documents";
  }

  // ---------------------------------------------------------------------------
  // Triggers
  // ---------------------------------------------------------------------------

  private applyTriggerBank(
    bank: TriggerBank | undefined,
    normalized: string,
    lang: LanguageCode,
    signals: Record<string, any>,
    matchedIds: string[],
  ): void {
    if (!bank?.config?.enabled && bank?.config?.enabled !== undefined) return;
    if (!bank?.triggers?.length) return;

    const caseInsensitive = bank.config?.caseInsensitive !== false;

    for (const t of bank.triggers) {
      const patterns = t.patterns?.[lang] || t.patterns?.en || [];
      if (!patterns?.length) continue;

      let matched = false;
      for (const p of patterns) {
        const re = compileRegex(p, caseInsensitive);
        if (!re) continue;
        if (re.test(normalized)) {
          matched = true;
          break;
        }
      }

      if (matched) {
        Object.assign(signals, t.sets || {});
        matchedIds.push(t.id);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Constraints
  // ---------------------------------------------------------------------------

  private buildConstraints(
    raw: string,
    signals: Record<string, any>,
    query: QueryRewriteOutput,
    operator: string,
  ): RoutingDecision["constraints"] {
    const constraints: RoutingDecision["constraints"] = {};

    // Nav: always button-only + pills
    if (this.isNavOperator(operator) || signals.navQuery === true) {
      constraints.outputShape = "button_only";
      constraints.requireSourceButtons = true;
      constraints.maxFollowups = 0;
      return constraints;
    }

    // User asked for table or JSON => table (ChatGPT-like behavior)
    if (signals.userAskedForTable || signals.userAskedForJson) {
      constraints.outputShape = "table";
      constraints.requireTable = true;
    }

    // Quote requested
    if (signals.userAskedForQuote) {
      // Let answer_mode_router pick doc_grounded_quote
      // No need to set outputShape here unless you want to force it.
    }

    // Bullet count requests (“top 3”, “5 bullets”, etc.)
    const bulletCount = this.extractExactBulletCount(raw);
    if (bulletCount) {
      constraints.outputShape = "bullets";
      constraints.exactBulletCount = bulletCount;
    }

    // Short overview (2–3 sentences)
    if (signals.userRequestedShort || signals.shortOverview) {
      constraints.userRequestedShort = true;
      constraints.maxSentences = 3;
    }

    // Default followups (ChatGPT-like: 0–1)
    constraints.maxFollowups =
      typeof constraints.maxFollowups === "number"
        ? constraints.maxFollowups
        : 1;

    return constraints;
  }

  private extractExactBulletCount(text: string): number | undefined {
    const m =
      text.match(/\b(\d{1,2})\s*(bullets?|points?|itens?|pontos?)\b/i) ||
      text.match(/\btop\s+(\d{1,2})\b/i);
    if (!m) return undefined;
    const n = parseInt(m[1], 10);
    if (!Number.isFinite(n) || n <= 0 || n > 20) return undefined;
    return n;
  }

  // ---------------------------------------------------------------------------
  // Minimal fallbacks
  // ---------------------------------------------------------------------------

  private minimalOperatorHeuristic(
    intentFamily: string,
    signals: Record<string, any>,
  ): string {
    if (signals.isConversationOnly) return "conversation";
    if (signals.discoveryQuery) return "locate_docs";
    if (signals.navQuery) return "open";
    if (intentFamily === "help") return "how_to";
    if (intentFamily === "file_actions") return "list";
    return "qa";
  }

  private isNavOperator(operator: string): boolean {
    return (
      operator === "open" ||
      operator === "locate_file" ||
      operator === "locate_docs" ||
      operator === "where"
    );
  }
}

// Singleton
let routerInstance: RouterService | null = null;
export function getRouter(): RouterService {
  if (!routerInstance) routerInstance = new RouterService();
  return routerInstance;
}
