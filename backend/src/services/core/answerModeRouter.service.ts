/**
 * Answer Mode Router Service (Bank-driven)
 *
 * Purpose
 * - Reads `answer_mode_router.any.json` from data_banks via BankLoaderService
 * - Evaluates prioritized rules to choose the answer mode deterministically
 * - Enforces a few hard guardrails so the system behaves predictably
 *
 * Inputs (the orchestrator should pass these)
 * - intentId: string (from your intent router)
 * - docContext: { docCount, candidateCount, topScore?, margin?, ... }
 * - signals: { userAskedForQuote/table/json/comparison/summary/steps/help, queryIsGeneric, policyRefusalRequired, ... }
 * - userPrefs: { format, verbosity, noFollowups, justAnswer, noQuotes, noCitations }
 *
 * Output
 * - { mode, reason, ruleId, terminal, trace }
 */

import { bankLoader, LoadedBank } from './bankLoader.service';
import type { RetrievalSummary, RetrievalReasonCode } from '../retrieval/retrievalSummary.types';

// =============================================================================
// TYPES
// =============================================================================

export type AnswerMode =
  | 'no_docs'
  | 'processing'           // Docs are still being indexed
  | 'extraction_failed'    // Document extraction/OCR failed
  | 'scope_empty'          // Hard scope constraints matched no docs
  | 'scoped_not_found'     // Docs in scope but no matching chunks
  | 'nav_pills'            // Discovery/open/locate → show file pills
  | 'doc_grounded_single'
  | 'doc_grounded_multi'
  | 'doc_grounded_quote'
  | 'doc_grounded_table'
  | 'general_steps'
  | 'general_answer'
  | 'correction'
  | 'refusal'
  | 'error'
  // Internal modes (remapped before output - for backward compatibility with bank rules)
  | 'rank_disambiguate'    // → remapped to nav_pills
  | 'rank_autopick';       // → remapped to doc_grounded_single

export interface AnswerModeInput {
  intentId?: string;

  // Doc and ranking context (from retrieval/ranking)
  docContext?: {
    docCount?: number;
    candidateCount?: number;
    topScore?: number;
    margin?: number;
    topDocId?: string;
    topDocTitle?: string;
    hasTablesLikely?: boolean;
    processingCount?: number;  // Docs still being indexed
    failedCount?: number;      // Docs that failed extraction
  };

  // Canonical retrieval summary (from buildRetrievalSummary)
  // This is the PRIMARY source for routing decisions
  retrieval?: RetrievalSummary;

  // Derived signals (from query_normalizer/query_rewrite/intent/guards)
  signals?: {
    queryIsGeneric?: boolean;

    userAskedForQuote?: boolean;
    userAskedForTable?: boolean;
    userAskedForJson?: boolean;
    userAskedForComparison?: boolean;
    userAskedForSummary?: boolean;
    userAskedForSteps?: boolean;
    userAskedForHelp?: boolean;

    policyRefusalRequired?: boolean;
    noDocsState?: boolean;
    truncationLikely?: boolean;

    // New signals for scoped routing
    hasExplicitDocRef?: boolean;
    discoveryQuery?: boolean;
  };

  // User preferences (from not_help / not_content_guard / UI toggles)
  userPrefs?: {
    verbosity?: 'short' | 'medium' | 'long';
    format?: 'table' | 'json' | 'bullets' | 'paragraph';
    noFollowups?: boolean;
    justAnswer?: boolean;
    noQuotes?: boolean;
    noCitations?: boolean;
  };

  // Optional: provide previous answer mode or state hints if you want
  state?: {
    clarificationPending?: boolean;
  };
}

type Op =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'notIn'
  | 'exists'
  | 'contains'
  | 'containsAny'
  | 'containsAll'
  | 'matchesRegex';

export type ConditionExpr =
  | {
      // Composite
      all?: ConditionExpr[];
      any?: ConditionExpr[];
      not?: ConditionExpr;

      // Atomic
      path?: string;
      op?: Op;
      value?: any;
    }
  | Record<string, any>; // allow future extensions

export interface AnswerModeRule {
  id: string;
  priority?: number;
  when?: ConditionExpr;
  then: {
    mode: AnswerMode;
    reason?: string;
  };
  terminal?: boolean;
}

export interface AnswerModeRouterBank {
  _meta: { id: string; version: string; lastUpdated?: string };
  config: {
    enabled: boolean;
    defaults?: {
      fallbackMode?: AnswerMode;
      maxClarifyQuestions?: number;
      preferDocGroundedWhenDocsAvailable?: boolean;
    };
    thresholds?: {
      autoPickTopScoreGte?: number;
      autoPickMarginGte?: number;
      ambiguousMarginLt?: number;
      ambiguousTopScoreLt?: number;
      forceClarifyTopScoreBelow?: number;
      preferMultiDocIfDocsUsedGte?: number;
    };
    guardrails?: Record<string, any>;
  };
  answerModes?: AnswerMode[];
  rules: AnswerModeRule[];
}

export interface AnswerModeResult {
  mode: AnswerMode;
  reason: string;
  ruleId: string;
  confidence: number;
  terminal: boolean;
  thresholds: {
    autoPickTopScoreGte: number;
    autoPickMarginGte: number;
    ambiguousMarginLt: number;
    ambiguousTopScoreLt: number;
    forceClarifyTopScoreBelow: number;
  };
  trace: {
    bankVersion: string;
    evaluatedRules: number;
    matchedRules: Array<{ id: string; priority: number; reason?: string }>;
    guardrailsApplied: string[];
  };
}

// =============================================================================
// ANSWER MODE ROUTER SERVICE
// =============================================================================

class AnswerModeRouterService {
  private static instance: AnswerModeRouterService;

  // cached bank + sorted rules
  private cachedBank: AnswerModeRouterBank | null = null;
  private cachedBankVersion: string | null = null;
  private cachedRulesSorted: AnswerModeRule[] = [];

  private constructor() {}

  static getInstance(): AnswerModeRouterService {
    if (!AnswerModeRouterService.instance) {
      AnswerModeRouterService.instance = new AnswerModeRouterService();
    }
    return AnswerModeRouterService.instance;
  }

  // ===========================================================================
  // MAIN API
  // ===========================================================================

  /** Main entry point */
  public route(inputs: AnswerModeInput): AnswerModeResult {
    const bank = this.loadBank();
    const thresholds = this.getThresholds(bank);

    if (!bank.config.enabled) {
      // If disabled, behave safely.
      return this.makeDecision(
        bank,
        bank.config.defaults?.fallbackMode ?? 'general_answer',
        'router_disabled',
        'BANK_DISABLED',
        true,
        0.5,
        thresholds,
        [],
        ['router_disabled']
      );
    }

    // ---- Hard, always-on guardrails (make behavior stable) ----
    // 1) Policy refusal required => refusal (highest priority)
    if (inputs.signals?.policyRefusalRequired === true) {
      return this.makeDecision(
        bank,
        'refusal',
        'policy_refusal_required',
        'GUARD_POLICY_REFUSAL',
        true,
        1.0,
        thresholds,
        [],
        ['policy_refusal_guard']
      );
    }

    // 2) No docs => no_docs (never guess)
    const docCount = inputs.docContext?.docCount ?? 0;
    if (docCount <= 0) {
      return this.makeDecision(
        bank,
        'no_docs',
        'no_docs_indexed',
        'GUARD_NO_DOCS',
        true,
        1.0,
        thresholds,
        [],
        ['no_docs_guard']
      );
    }

    // 3) If clarification is pending, avoid modes that would pretend we know the doc
    const clarificationPending = inputs.state?.clarificationPending === true;

    // ---- Evaluate bank rules (priority-desc) ----
    const matched: Array<{ id: string; priority: number; reason?: string }> = [];
    const ctx = this.buildEvalContext(inputs);

    let chosen: AnswerModeRule | null = null;

    for (const rule of this.cachedRulesSorted) {
      // skip doc-grounded quote if user forbids quotes
      if (
        rule.then?.mode === 'doc_grounded_quote' &&
        inputs.userPrefs?.noQuotes === true
      ) {
        continue;
      }

      // skip disambiguation mode if single candidate and bank says avoid (guardrails)
      if (
        rule.then?.mode === 'rank_disambiguate' &&
        (inputs.docContext?.candidateCount ?? 0) <= 1
      ) {
        continue;
      }

      // If clarification is pending, don't autopick another doc silently
      if (
        clarificationPending &&
        (rule.then?.mode === 'rank_autopick' ||
          rule.then?.mode === 'doc_grounded_single' ||
          rule.then?.mode === 'doc_grounded_table' ||
          rule.then?.mode === 'doc_grounded_quote')
      ) {
        // allow only if explicitly requested by user (quote/table) and docCount is 1
        const cand = inputs.docContext?.candidateCount ?? 0;
        const explicit =
          inputs.signals?.userAskedForQuote ||
          inputs.signals?.userAskedForTable ||
          inputs.signals?.userAskedForJson;
        if (!(explicit && cand === 1)) continue;
      }

      const ok = this.evalWhen(rule.when, ctx);
      if (!ok) continue;

      matched.push({
        id: rule.id,
        priority: typeof rule.priority === 'number' ? rule.priority : 0,
        reason: rule.then?.reason,
      });

      chosen = rule;
      if (rule.terminal === true) break;
    }

    if (!chosen) {
      const fallback = bank.config.defaults?.fallbackMode ?? 'general_answer';
      return this.makeDecision(
        bank,
        fallback,
        'no_rule_matched',
        'FALLBACK',
        true,
        0.5,
        thresholds,
        matched,
        []
      );
    }

    // Apply chosen mode, then enforce post-guardrails (minimal, predictable)
    let mode = chosen.then.mode;
    let reason = chosen.then.reason ?? 'matched_rule';

    const guardrailsApplied: string[] = [];

    // Post guardrail: if user forbids quotes but rule returned quote, downgrade
    if (mode === 'doc_grounded_quote' && inputs.userPrefs?.noQuotes === true) {
      mode = 'doc_grounded_single';
      reason = `${reason}; downgraded_no_quotes`;
      guardrailsApplied.push('downgrade_quote_when_noQuotes');
    }

    // Post guardrail: if user asked for table or json, prefer table mode when docs exist
    if (
      (inputs.signals?.userAskedForTable === true ||
        inputs.signals?.userAskedForJson === true ||
        inputs.userPrefs?.format === 'table') &&
      docCount > 0
    ) {
      // only upgrade if safe and not disambiguation
      if (
        mode === 'doc_grounded_single' ||
        mode === 'rank_autopick' ||
        mode === 'general_answer'
      ) {
        mode = 'doc_grounded_table';
        reason = `${reason}; upgraded_table_preference`;
        guardrailsApplied.push('upgrade_table_when_requested');
      }
    }

    // If user asked for steps, ensure steps mode unless refusal/no_docs
    if (
      inputs.signals?.userAskedForSteps === true &&
      mode !== 'no_docs' &&
      mode !== 'refusal'
    ) {
      mode = 'general_steps';
      reason = `${reason}; steps_preference`;
      guardrailsApplied.push('force_steps_when_requested');
    }

    // Calculate confidence based on rule priority and signals
    const confidence = this.calculateConfidence(chosen, inputs);

    return this.makeDecision(
      bank,
      mode,
      reason,
      chosen.id,
      chosen.terminal === true,
      confidence,
      thresholds,
      matched,
      guardrailsApplied
    );
  }

  /**
   * Get thresholds from bank (for trace output and external use)
   * BANK-DRIVEN: Thresholds MUST come from answer_mode_router bank.
   * In dev mode, fail-fast if thresholds are missing.
   */
  getThresholds(bank?: AnswerModeRouterBank): AnswerModeResult['thresholds'] {
    const b = bank || this.loadBank();
    const t = b.config.thresholds;

    // BANK-DRIVEN: Fail-fast in dev if thresholds missing
    if (!t && process.env.NODE_ENV !== 'production') {
      throw new Error('[AnswerModeRouter] CRITICAL: answer_mode_router bank missing config.thresholds - add them to the bank');
    }

    // In production, use safe defaults that prefer clarification
    const defaults = {
      autoPickTopScoreGte: 0.70,
      autoPickMarginGte: 0.05,
      ambiguousMarginLt: 0.03,
      ambiguousTopScoreLt: 0.70,
      forceClarifyTopScoreBelow: 0.40,
    };

    if (!t) {
      console.warn('[AnswerModeRouter] Bank missing thresholds, using production defaults');
      return defaults;
    }

    return {
      autoPickTopScoreGte: t.autoPickTopScoreGte ?? defaults.autoPickTopScoreGte,
      autoPickMarginGte: t.autoPickMarginGte ?? defaults.autoPickMarginGte,
      ambiguousMarginLt: t.ambiguousMarginLt ?? defaults.ambiguousMarginLt,
      ambiguousTopScoreLt: t.ambiguousTopScoreLt ?? defaults.ambiguousTopScoreLt,
      forceClarifyTopScoreBelow: t.forceClarifyTopScoreBelow ?? defaults.forceClarifyTopScoreBelow,
    };
  }

  // ===========================================================================
  // INTERNALS
  // ===========================================================================

  /**
   * Load bank with fail-fast behavior in dev mode
   * BANK-DRIVEN: In dev, throw if bank missing. In prod, use safe fallbacks.
   */
  private loadBank(): AnswerModeRouterBank {
    try {
      const loaded = bankLoader.requireBank<AnswerModeRouterBank>('answer_mode_router');
      const bank = loaded.data;

      const version = bank?._meta?.version ?? 'unknown';
      if (this.cachedBank && this.cachedBankVersion === version) return this.cachedBank;

      // validate minimal shape
      if (!bank || !bank.config || !Array.isArray(bank.rules)) {
        throw new Error(
          `[answer_mode_router] invalid bank shape (missing config or rules[])`
        );
      }

      // cache sorted rules
      const rules = [...bank.rules].filter((r) => r && r.id && r.then && r.then.mode);
      rules.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

      this.cachedBank = bank;
      this.cachedBankVersion = version;
      this.cachedRulesSorted = rules;

      console.log(`[AnswerModeRouter] Loaded bank v${version} with ${rules.length} rules`);
      return bank;
    } catch (error) {
      // BANK-DRIVEN: Fail-fast in dev mode - bank is REQUIRED
      if (process.env.NODE_ENV !== 'production') {
        console.error('[AnswerModeRouter] CRITICAL: answer_mode_router bank missing or invalid');
        throw error; // Fail-fast in dev
      }

      // In production only, fall back to safe defaults
      console.warn('[AnswerModeRouter] Failed to load bank, using production defaults');
      return this.getDefaultBank();
    }
  }

  private getDefaultBank(): AnswerModeRouterBank {
    return {
      _meta: { id: 'answer_mode_router', version: '0.0.0-fallback' },
      config: {
        enabled: true,
        defaults: {
          fallbackMode: 'general_answer',
          maxClarifyQuestions: 2,
          preferDocGroundedWhenDocsAvailable: true,
        },
        thresholds: {
          autoPickTopScoreGte: 0.70,
          autoPickMarginGte: 0.05,
          ambiguousMarginLt: 0.03,
          ambiguousTopScoreLt: 0.70,
          forceClarifyTopScoreBelow: 0.40,
        },
        guardrails: {},
      },
      answerModes: [
        'no_docs', 'rank_disambiguate', 'rank_autopick', 'doc_grounded_single',
        'doc_grounded_multi', 'doc_grounded_quote', 'doc_grounded_table',
        'general_steps', 'general_answer', 'correction', 'refusal', 'error',
      ],
      rules: [],
    };
  }

  private buildEvalContext(inputs: AnswerModeInput): Record<string, any> {
    return {
      intentId: inputs.intentId ?? 'unknown',
      docContext: {
        docCount: inputs.docContext?.docCount ?? 0,
        candidateCount: inputs.docContext?.candidateCount ?? 0,
        topScore: inputs.docContext?.topScore,
        margin: inputs.docContext?.margin,
        topDocId: inputs.docContext?.topDocId,
        topDocTitle: inputs.docContext?.topDocTitle,
        hasTablesLikely: inputs.docContext?.hasTablesLikely ?? false,
      },
      signals: {
        queryIsGeneric: inputs.signals?.queryIsGeneric ?? false,
        userAskedForQuote: inputs.signals?.userAskedForQuote ?? false,
        userAskedForTable: inputs.signals?.userAskedForTable ?? false,
        userAskedForJson: inputs.signals?.userAskedForJson ?? false,
        userAskedForComparison: inputs.signals?.userAskedForComparison ?? false,
        userAskedForSummary: inputs.signals?.userAskedForSummary ?? false,
        userAskedForSteps: inputs.signals?.userAskedForSteps ?? false,
        userAskedForHelp: inputs.signals?.userAskedForHelp ?? false,
        policyRefusalRequired: inputs.signals?.policyRefusalRequired ?? false,
        noDocsState: inputs.signals?.noDocsState ?? false,
        truncationLikely: inputs.signals?.truncationLikely ?? false,
      },
      userPrefs: {
        verbosity: inputs.userPrefs?.verbosity,
        format: inputs.userPrefs?.format,
        noFollowups: inputs.userPrefs?.noFollowups ?? false,
        justAnswer: inputs.userPrefs?.justAnswer ?? false,
        noQuotes: inputs.userPrefs?.noQuotes ?? false,
        noCitations: inputs.userPrefs?.noCitations ?? false,
      },
      state: {
        clarificationPending: inputs.state?.clarificationPending ?? false,
      },
    };
  }

  private evalWhen(when: ConditionExpr | undefined, ctx: Record<string, any>): boolean {
    // Empty/undefined means match-all
    if (!when || (typeof when === 'object' && Object.keys(when).length === 0)) return true;

    // Composite
    const any = (when as any).any;
    const all = (when as any).all;
    const not = (when as any).not;

    if (Array.isArray(all)) {
      return all.every((c) => this.evalWhen(c, ctx));
    }
    if (Array.isArray(any)) {
      return any.some((c) => this.evalWhen(c, ctx));
    }
    if (not) {
      return !this.evalWhen(not, ctx);
    }

    // Atomic
    const path = (when as any).path;
    const op = (when as any).op;
    const value = (when as any).value;

    // If the bank used a different structure, treat unknown as "no match"
    if (!path || !op) return false;

    const actual = this.getByPath(ctx, path);

    switch (op as Op) {
      case 'exists':
        return actual !== undefined && actual !== null;

      case 'eq':
        return actual === value;
      case 'neq':
        return actual !== value;

      case 'gt':
        return typeof actual === 'number' && typeof value === 'number' && actual > value;
      case 'gte':
        return typeof actual === 'number' && typeof value === 'number' && actual >= value;
      case 'lt':
        return typeof actual === 'number' && typeof value === 'number' && actual < value;
      case 'lte':
        return typeof actual === 'number' && typeof value === 'number' && actual <= value;

      case 'in':
        return Array.isArray(value) ? value.includes(actual) : false;
      case 'notIn':
        return Array.isArray(value) ? !value.includes(actual) : false;

      case 'contains':
        if (typeof actual === 'string' && typeof value === 'string') return actual.includes(value);
        if (Array.isArray(actual)) return actual.includes(value);
        return false;

      case 'containsAny':
        if (!Array.isArray(value)) return false;
        if (typeof actual === 'string') return value.some((v) => actual.includes(String(v)));
        if (Array.isArray(actual)) return value.some((v) => actual.includes(v));
        return false;

      case 'containsAll':
        if (!Array.isArray(value)) return false;
        if (typeof actual === 'string') return value.every((v) => actual.includes(String(v)));
        if (Array.isArray(actual)) return value.every((v) => actual.includes(v));
        return false;

      case 'matchesRegex':
        if (typeof actual !== 'string' || typeof value !== 'string') return false;
        try {
          const rx = new RegExp(value, 'i');
          return rx.test(actual);
        } catch {
          return false;
        }

      default:
        return false;
    }
  }

  private getByPath(obj: Record<string, any>, path: string): any {
    const parts = path.split('.');
    let cur: any = obj;
    for (const p of parts) {
      if (cur == null) return undefined;
      cur = cur[p];
    }
    return cur;
  }

  private calculateConfidence(rule: AnswerModeRule, inputs: AnswerModeInput): number {
    // Base confidence from rule priority
    let confidence = Math.min((rule.priority ?? 0) / 1000, 0.95);

    // Boost for strong ranking signals
    if (inputs.docContext?.topScore && inputs.docContext.topScore >= 0.8) {
      confidence = Math.min(confidence + 0.1, 0.95);
    }

    // Reduce for generic queries
    if (inputs.signals?.queryIsGeneric) {
      confidence = Math.max(confidence - 0.1, 0.4);
    }

    return confidence;
  }

  private makeDecision(
    bank: AnswerModeRouterBank,
    mode: AnswerMode,
    reason: string,
    ruleId: string,
    terminal: boolean,
    confidence: number,
    thresholds: AnswerModeResult['thresholds'],
    matchedRules: Array<{ id: string; priority: number; reason?: string }>,
    guardrailsApplied: string[]
  ): AnswerModeResult {
    return {
      mode,
      reason,
      ruleId,
      confidence,
      terminal,
      thresholds,
      trace: {
        bankVersion: bank._meta?.version ?? 'unknown',
        evaluatedRules: this.cachedRulesSorted.length,
        matchedRules,
        guardrailsApplied,
      },
    };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const answerModeRouter = AnswerModeRouterService.getInstance();

export function routeAnswerMode(input: AnswerModeInput): AnswerModeResult {
  return answerModeRouter.route(input);
}

export function getAnswerModeThresholds(): AnswerModeResult['thresholds'] {
  return answerModeRouter.getThresholds();
}
