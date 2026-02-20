// fallbackEngine.service.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Koda Fallback Engine (ChatGPT-parity)
 * ------------------------------------
 * This service is *not* an answer template generator.
 * It deterministically selects a fallback plan (type + strategy + UI tokens/fragment intents)
 * based on:
 *  - shared reason codes (scope_empty, scoped_not_found, extraction_failed, indexing_in_progress, no_docs_indexed, low_confidence, doc_ambiguous)
 *  - scope state (explicit locks, active doc)
 *  - retrieval metrics (retrievedChunks, searchConfidence, extractionCoverage, evidenceSufficiency)
 *  - anti-repetition (cooldowns, entropy windows, dedupe keys)
 *  - strict banned-phrase enforcement (never let that phrase pass downstream)
 *
 * Output: a structured plan for the renderer/composer to realize:
 *  - answerMode / outputShape constraints (nav_pills vs doc_grounded)
 *  - semantic UI tokens + fragment intents (NOT hardcoded sentences)
 *  - optional: single clarification question intent (max 1)
 *
 * The composer/renderer should turn tokens into unique, adaptive wording.
 */

import crypto from "crypto";

type EnvName = "production" | "staging" | "dev" | "local";
type AnswerMode =
  | "nav_pills"
  | "doc_grounded_single"
  | "doc_grounded_multi"
  | "doc_grounded_quote"
  | "doc_grounded_table"
  | "general_answer"
  | "help_steps"
  | "rank_disambiguate"
  | "rank_autopick";

export type FallbackReasonCode =
  | "indexing_in_progress"
  | "extraction_failed"
  | "scope_hard_constraints_empty"
  | "no_relevant_chunks_in_scoped_docs"
  | "no_docs_indexed"
  | "low_confidence"
  | "doc_ambiguous"
  | "scoped_not_found"
  | "wrong_doc_detected"
  | "grounding_fail_soft"
  | "hallucination_risk_high"
  | "numeric_truncation_detected"
  | "numeric_not_in_source";

export type FallbackType =
  | "processing"
  | "extraction_failed"
  | "scope_empty"
  | "not_found_in_scope"
  | "no_docs_indexed"
  | "low_confidence"
  | "doc_ambiguous"
  | "wrong_doc"
  | "numeric_integrity"
  | "hallucination_risk";

export type FallbackStrategy =
  | "guide_next_step"
  | "offer_scope_relaxation"
  | "acknowledge_and_offer_next_steps"
  | "offer_variant_confirmation"
  | "offer_scope_expansion"
  | "answer_with_coverage_notice"
  | "offer_alternative_sources"
  | "request_clarification_or_rephrase"
  | "disambiguate_with_options"
  | "retry_retrieval_then_regen";

/**
 * Bank loader interface (wire your existing bankLoader.service.ts)
 */
export interface BankLoader {
  getBank<T = any>(bankId: string): T;
}

/**
 * Minimal state slice required by fallback engine.
 * This should match the shape in conversation_state_schema.any.json
 */
export interface ConversationStateLike {
  session: { env: EnvName };
  persistent: {
    scope: {
      activeDocId: string | null;
      hardDocLock: boolean;
      hardSheetLock: boolean;
      activeSheetName?: string | null;
      activeRangeA1?: string | null;
    };
  };
  history: {
    recentFallbacks: Array<{
      reasonCode: string;
      fallbackType: string;
      strategy: string;
      turnId: number;
    }>;
    recentTokens: string[];
  };
  ephemeral: {
    turn: { turnId: number };
  };
}

/**
 * Runtime context computed by routing/retrieval/quality gates.
 * These are inputs; fallbackEngine does not decide routing outside fallback mode selection.
 */
export interface FallbackRuntimeContext {
  env: EnvName;

  // Primary reason codes produced by routing/retrieval/quality/policies
  reasonCodes: FallbackReasonCode[];

  // Signals that affect fallback selection and wording constraints
  signals: {
    answerMode?: AnswerMode | null; // current mode; fallback may adjust
    intentFamily?: string | null;
    operatorFamily?: string | null;

    explicitDocLock?: boolean;
    explicitDocRef?: boolean;

    hardScopeActive?: boolean;
    searchExecuted?: boolean;

    hasIndexedDocs?: boolean;
    indexingInProgress?: boolean;

    // extraction coverage in [0,1]
    extractionCoverage?: number | null;

    // retrieval
    retrievedChunks?: number | null;
    searchConfidence?: number | null;

    // ambiguity
    isAmbiguous?: boolean;
    candidateCount?: number | null;

    // confidence
    topConfidence?: number | null;

    // UI
    hasConcreteOptions?: boolean;
    hasSafeAlternative?: boolean;

    // Ban phrase detection upstream (optional); engine also scans output drafts if provided.
    bannedPhraseDetected?: boolean;
  };

  // Optional pre-render draft text (if some component generated it) — we will strip banned phrases.
  draftText?: string | null;

  // Optional candidates for disambiguation (doc options, sheet options)
  options?: Array<{
    id: string;
    label: string;
    type: "document" | "sheet" | "operator";
    score?: number;
  }>;
}

/**
 * Plan emitted by fallback engine — the renderer/composer realizes tokens into language.
 */
export interface FallbackPlan {
  fallback: {
    reasonCode: FallbackReasonCode;
    type: FallbackType;
    strategy: FallbackStrategy;
    severity: "info" | "warning" | "error" | "fatal";
  };

  // Output constraints for UI/formatting layers
  output: {
    answerMode: AnswerMode;
    outputShape: "button_only" | "paragraph" | "bullets" | "table" | "quote";
    maxQuestions: number;
    maxOptions?: number;
    suppressSourcesHeader: boolean;
    suppressActions: boolean;
  };

  // Semantic UI tokens (must be realized by fragment banks)
  uiTokens: string[];

  // Fragment intents (realized by fragment banks like ui_next_step_suggestion / ui_soft_close)
  fragments: Array<{
    bankId: string;
    fragmentIntent: string;
    selectorKey: string;
    constraints?: Record<string, any>;
  }>;

  // Optional: disambiguation payload
  disambiguation?: {
    renderMode: "nav_pills" | "short_list";
    options: Array<{ id: string; label: string; type: string; score?: number }>;
    questionIntent?: string; // semantic intent for a single question if required
  };

  // Sanitized draft text (if any) after banned-phrase stripping — usually empty because we prefer tokens.
  sanitizedDraftText?: string;

  // Engine-side diagnostics only (do not show to user)
  debug?: {
    appliedRules: string[];
    suppressedBecause: string[];
    antiRepetition: {
      usedHistory: boolean;
      changedStrategy: boolean;
      changedTokens: boolean;
    };
  };
}

// ----------------------------
// Helpers
// ----------------------------

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

function isProd(env: EnvName): boolean {
  return env === "production";
}

function hasReason(
  ctx: FallbackRuntimeContext,
  code: FallbackReasonCode,
): boolean {
  return ctx.reasonCodes.includes(code);
}

/**
 * Strict banned phrases (policy-level), multilingual. Keep here as a guardrail.
 * The real banned_phrases bank should also exist; this engine uses a minimal set.
 */
const BANNED_EMPTY_RESULT_PATTERNS: RegExp[] = [
  /\bno relevant information found\b/i,
  /\bn[aã]o foi encontrada informa[cç][aã]o relevante\b/i,
  /\bno se encontr[oó] informaci[oó]n relevante\b/i,
];

// ----------------------------
// Fallback Engine
// ----------------------------

export class FallbackEngineService {
  constructor(private readonly bankLoader: BankLoader) {}

  /**
   * Build a fallback plan. This is deterministic and policy-driven.
   */
  buildPlan(
    state: ConversationStateLike,
    ctx: FallbackRuntimeContext,
  ): FallbackPlan {
    const debug = {
      appliedRules: [] as string[],
      suppressedBecause: [] as string[],
      antiRepetition: {
        usedHistory: true,
        changedStrategy: false,
        changedTokens: false,
      },
    };

    // 0) Load banks used for selection + variation constraints (no user-facing copy)
    const fallbackPolicy = this.safeGetBank<any>("fallback_policy");
    const fbProcessing = this.safeGetBank<any>("fallback_processing");
    const fbExtraction = this.safeGetBank<any>("fallback_extraction_recovery");
    const fbScopeEmpty = this.safeGetBank<any>("fallback_scope_empty");
    const fbNotFound = this.safeGetBank<any>("fallback_not_found_scope");
    const clarificationPolicy = this.safeGetBank<any>("clarification_policy");
    const clarificationPhrases = this.safeGetBank<any>("clarification_phrases");
    const uiContracts = this.safeGetBank<any>("ui_contracts");
    const nextStepFragments = this.safeGetBank<any>("ui_next_step_suggestion");
    const softCloseFragments = this.safeGetBank<any>("ui_soft_close");

    // 1) Determine primary reasonCode (prefer more specific)
    // Order matters: refusal/safety and wrong-doc/numeric/hallucination override generic fallbacks.
    const primaryReason = this.selectPrimaryReason(ctx);

    // 2) Map reasonCode -> fallback type + default strategy (bank mapping if present)
    const mapping = fallbackPolicy?.config?.reasonCodeRoutingMap ?? {};
    const mappedRoute = mapping[primaryReason] ?? null;

    const fallbackType = this.mapReasonToFallbackType(primaryReason);
    const baseStrategy = this.defaultStrategyFor(primaryReason);

    // 3) Determine output constraints by answerMode and ui_contracts
    const answerMode = this.chooseAnswerMode(ctx, primaryReason);
    const outputShape = this.chooseOutputShape(answerMode, primaryReason);

    // 4) Build UI tokens + fragments (no hardcoded sentences)
    const uiTokens: string[] = [];
    const fragments: FallbackPlan["fragments"] = [];

    // Always keep fallbacks minimal, actionable, and unique: intro token + next-step token.
    // We do not inject literal text; we emit semantic tokens that renderer realizes.
    uiTokens.push("ui_intro_neutral");

    // Next step suggestion fragments (unless nav_pills)
    if (answerMode !== "nav_pills") {
      uiTokens.push("ui_next_step_suggestion");
      const fragmentIntent = this.fragmentIntentFor(primaryReason);
      fragments.push({
        bankId: "ui_next_step_suggestion",
        fragmentIntent,
        selectorKey: `${primaryReason}:${fragmentIntent}`,
        constraints: {
          maxSentences: 1,
          maxQuestions: 1,
          mustNotAssertAbsence:
            primaryReason === "scope_hard_constraints_empty" ||
            primaryReason === "no_relevant_chunks_in_scoped_docs",
          preferVariantFirst:
            primaryReason === "no_relevant_chunks_in_scoped_docs",
          avoidTimeEstimates: primaryReason === "indexing_in_progress",
        },
      });
    } else {
      // nav_pills must be intro-only + buttons; no fragments
      debug.suppressedBecause.push("nav_pills_mode_suppresses_fragments");
    }

    // Soft close only when not fallback-triggered? In our system fallback IS triggered; keep close suppressed
    // to avoid “double prompts”. The soft close bank also suppresses on fallbackTriggered.
    // If you want soft close for non-error assistance, you can enable it via policy.
    // Here we keep it suppressed by default for fallbacks.

    // 5) Disambiguation handling (doc ambiguity)
    let disambiguation: FallbackPlan["disambiguation"] | undefined;
    if (primaryReason === "doc_ambiguous") {
      debug.appliedRules.push("doc_ambiguity_requires_disambiguation");

      const opts = (ctx.options ?? []).slice(0, 8);
      const capped = this.limitOptions(opts, 4);
      disambiguation = {
        renderMode:
          ctx.signals.intentFamily === "doc_discovery"
            ? "nav_pills"
            : "short_list",
        options: capped,
        questionIntent: "ui_clarification_question",
      };

      uiTokens.push("ui_variant_confirmation_prompt");
    }

    // 6) Anti-repetition: if same fallback (reason+strategy) occurred recently, rotate strategy/tokens
    const antiRep = this.applyAntiRepetition(
      state,
      primaryReason,
      baseStrategy,
      uiTokens,
      fragments,
    );
    debug.antiRepetition.changedStrategy = antiRep.changedStrategy;
    debug.antiRepetition.changedTokens = antiRep.changedTokens;

    // 7) Banned phrase stripping on any draft text (if provided)
    const sanitizedDraftText = this.sanitizeDraftText(ctx);

    // 8) Final plan
    const plan: FallbackPlan = {
      fallback: {
        reasonCode: primaryReason,
        type: fallbackType,
        strategy: antiRep.strategy,
        severity: this.severityFor(primaryReason),
      },
      output: {
        answerMode,
        outputShape,
        maxQuestions: 1,
        maxOptions: primaryReason === "doc_ambiguous" ? 4 : undefined,
        suppressSourcesHeader: answerMode === "nav_pills",
        suppressActions: true,
      },
      uiTokens: antiRep.uiTokens,
      fragments: antiRep.fragments,
      disambiguation,
      sanitizedDraftText: sanitizedDraftText ?? undefined,
      debug: isProd(ctx.env) ? undefined : debug,
    };

    // Enforce nav_pills contract: no extra text fragments, no sources header, no actions
    if (answerMode === "nav_pills") {
      plan.fragments = [];
      plan.sanitizedDraftText = undefined;
    }

    return plan;
  }

  // ----------------------------
  // Reason selection
  // ----------------------------

  private selectPrimaryReason(ctx: FallbackRuntimeContext): FallbackReasonCode {
    // Strong precedence: wrong doc / numeric / hallucination / extraction / scope / no docs / ambiguity / low confidence / processing
    const order: FallbackReasonCode[] = [
      "wrong_doc_detected",
      "numeric_truncation_detected",
      "numeric_not_in_source",
      "hallucination_risk_high",
      "extraction_failed",
      "scope_hard_constraints_empty",
      "no_relevant_chunks_in_scoped_docs",
      "no_docs_indexed",
      "doc_ambiguous",
      "low_confidence",
      "indexing_in_progress",
      "grounding_fail_soft",
      "scoped_not_found",
    ];

    for (const code of order) {
      if (ctx.reasonCodes.includes(code)) return code;
    }

    // Derive reason codes if upstream didn’t provide them (deterministic)
    if (ctx.signals.indexingInProgress) return "indexing_in_progress";
    if (ctx.signals.hasIndexedDocs === false) return "no_docs_indexed";
    if (
      ctx.signals.extractionCoverage != null &&
      ctx.signals.extractionCoverage < 0.6
    )
      return "extraction_failed";
    if (ctx.signals.hardScopeActive && (ctx.signals.retrievedChunks ?? 0) === 0)
      return "scope_hard_constraints_empty";
    if (
      ctx.signals.searchExecuted &&
      (ctx.signals.retrievedChunks ?? 0) === 0 &&
      (ctx.signals.searchConfidence ?? 0) >= 0.7
    ) {
      return "no_relevant_chunks_in_scoped_docs";
    }
    if (ctx.signals.isAmbiguous) return "doc_ambiguous";
    if (ctx.signals.topConfidence != null && ctx.signals.topConfidence < 0.55)
      return "low_confidence";

    // Last resort
    return "grounding_fail_soft";
  }

  private mapReasonToFallbackType(reason: FallbackReasonCode): FallbackType {
    switch (reason) {
      case "indexing_in_progress":
        return "processing";
      case "extraction_failed":
        return "extraction_failed";
      case "scope_hard_constraints_empty":
        return "scope_empty";
      case "no_relevant_chunks_in_scoped_docs":
        return "not_found_in_scope";
      case "no_docs_indexed":
        return "no_docs_indexed";
      case "doc_ambiguous":
        return "doc_ambiguous";
      case "low_confidence":
        return "low_confidence";
      case "wrong_doc_detected":
        return "wrong_doc";
      case "numeric_truncation_detected":
      case "numeric_not_in_source":
        return "numeric_integrity";
      case "hallucination_risk_high":
        return "hallucination_risk";
      default:
        return "processing";
    }
  }

  private defaultStrategyFor(reason: FallbackReasonCode): FallbackStrategy {
    switch (reason) {
      case "scope_hard_constraints_empty":
        return "offer_scope_relaxation";
      case "no_relevant_chunks_in_scoped_docs":
        return "acknowledge_and_offer_next_steps";
      case "extraction_failed":
        return "offer_alternative_sources";
      case "indexing_in_progress":
        return "guide_next_step";
      case "no_docs_indexed":
        return "guide_next_step";
      case "doc_ambiguous":
        return "disambiguate_with_options";
      case "low_confidence":
        return "request_clarification_or_rephrase";
      case "wrong_doc_detected":
        return "retry_retrieval_then_regen";
      case "numeric_truncation_detected":
      case "numeric_not_in_source":
      case "hallucination_risk_high":
        return "retry_retrieval_then_regen";
      default:
        return "guide_next_step";
    }
  }

  private severityFor(
    reason: FallbackReasonCode,
  ): FallbackPlan["fallback"]["severity"] {
    switch (reason) {
      case "wrong_doc_detected":
      case "numeric_truncation_detected":
      case "numeric_not_in_source":
      case "hallucination_risk_high":
        return "fatal";
      case "extraction_failed":
      case "scope_hard_constraints_empty":
        return "error";
      case "no_relevant_chunks_in_scoped_docs":
      case "doc_ambiguous":
      case "low_confidence":
      case "indexing_in_progress":
        return "warning";
      default:
        return "warning";
    }
  }

  // ----------------------------
  // Output constraints
  // ----------------------------

  private chooseAnswerMode(
    ctx: FallbackRuntimeContext,
    reason: FallbackReasonCode,
  ): AnswerMode {
    // Discovery-style ambiguity should use nav_pills/doc list, but our fallback policy routes to clarification_policy.
    // Here we keep fallback in doc_grounded unless it's explicitly nav.
    if (ctx.signals.answerMode === "nav_pills") return "nav_pills";

    // If the reason is doc_ambiguous and intent is discovery, nav_pills is acceptable.
    if (
      reason === "doc_ambiguous" &&
      ctx.signals.intentFamily === "doc_discovery"
    )
      return "nav_pills";

    // Otherwise default to doc grounded single (fallback explanation + next step)
    return "doc_grounded_single";
  }

  private chooseOutputShape(
    answerMode: AnswerMode,
    reason: FallbackReasonCode,
  ): FallbackPlan["output"]["outputShape"] {
    if (answerMode === "nav_pills") return "button_only";
    // Clarification fallback often renders short list; but shape remains paragraph (single short paragraph)
    return "paragraph";
  }

  // ----------------------------
  // Fragment intents
  // ----------------------------

  private fragmentIntentFor(reason: FallbackReasonCode): string {
    switch (reason) {
      case "scope_hard_constraints_empty":
        return "scope_adjustment";
      case "no_relevant_chunks_in_scoped_docs":
        return "variant_or_expand";
      case "extraction_failed":
        return "extraction_recovery";
      case "indexing_in_progress":
        return "indexing_wait_or_retry";
      case "low_confidence":
      case "grounding_fail_soft":
        return "rephrase_or_specify";
      case "doc_ambiguous":
        return "disambiguate_with_options";
      case "numeric_truncation_detected":
      case "numeric_not_in_source":
        return "numeric_recheck";
      case "hallucination_risk_high":
        return "tighten_grounding";
      default:
        return "guide_next_step";
    }
  }

  // ----------------------------
  // Anti-repetition
  // ----------------------------

  private applyAntiRepetition(
    state: ConversationStateLike,
    reason: FallbackReasonCode,
    baseStrategy: FallbackStrategy,
    uiTokens: string[],
    fragments: FallbackPlan["fragments"],
  ): {
    strategy: FallbackStrategy;
    uiTokens: string[];
    fragments: FallbackPlan["fragments"];
    changedStrategy: boolean;
    changedTokens: boolean;
  } {
    const nowTurn = state?.ephemeral?.turn?.turnId ?? 0;
    const recent = state?.history?.recentFallbacks ?? [];

    // Find most recent fallback with same reason
    const same = recent
      .filter((r) => r.reasonCode === reason)
      .sort((a, b) => b.turnId - a.turnId)[0];

    // Cooldown default 3 turns (align with your banks)
    const cooldown = 3;
    const withinCooldown = same ? nowTurn - same.turnId < cooldown : false;

    if (!withinCooldown) {
      return {
        strategy: baseStrategy,
        uiTokens,
        fragments,
        changedStrategy: false,
        changedTokens: false,
      };
    }

    // If within cooldown, rotate strategy *within the same reason* without changing meaning.
    // This keeps behavior unique like ChatGPT: same situation -> different next-step angle.
    const rotated = this.rotateStrategy(
      reason,
      baseStrategy,
      same.strategy as FallbackStrategy,
    );
    const changedStrategy = rotated !== baseStrategy;

    // Also rotate selectorKey so fragment realization changes
    const rotatedFragments = fragments.map((f) => ({
      ...f,
      selectorKey: `${f.selectorKey}:alt:${sha256(`${nowTurn}|${reason}|${same.turnId}`).slice(0, 6)}`,
    }));
    const changedTokens = true;

    return {
      strategy: rotated,
      uiTokens,
      fragments: rotatedFragments,
      changedStrategy,
      changedTokens,
    };
  }

  private rotateStrategy(
    reason: FallbackReasonCode,
    base: FallbackStrategy,
    last: FallbackStrategy,
  ): FallbackStrategy {
    // Small, safe rotations per reason (avoid exploding strategy space)
    const rotations: Record<FallbackReasonCode, FallbackStrategy[]> = {
      scope_hard_constraints_empty: [
        "offer_scope_relaxation",
        "guide_next_step",
        "request_clarification_or_rephrase",
      ],
      no_relevant_chunks_in_scoped_docs: [
        "acknowledge_and_offer_next_steps",
        "offer_variant_confirmation",
        "offer_scope_expansion",
      ],
      extraction_failed: ["offer_alternative_sources", "guide_next_step"],
      indexing_in_progress: ["guide_next_step"],
      no_docs_indexed: ["guide_next_step"],
      low_confidence: ["request_clarification_or_rephrase", "guide_next_step"],
      doc_ambiguous: ["disambiguate_with_options"],
      wrong_doc_detected: ["retry_retrieval_then_regen"],
      numeric_truncation_detected: ["retry_retrieval_then_regen"],
      numeric_not_in_source: ["retry_retrieval_then_regen"],
      hallucination_risk_high: ["retry_retrieval_then_regen"],
      grounding_fail_soft: [
        "request_clarification_or_rephrase",
        "guide_next_step",
      ],
      scoped_not_found: ["acknowledge_and_offer_next_steps"],
    };

    const list = rotations[reason] ?? [base];
    if (list.length === 1) return base;

    // pick next different from last if possible
    for (const s of list) {
      if (s !== last) return s;
    }
    return base;
  }

  // ----------------------------
  // Disambiguation options
  // ----------------------------

  private limitOptions(
    options: Array<{ id: string; label: string; type: string; score?: number }>,
    max: number,
  ) {
    // Deterministic: sort by score desc then label asc, take max
    const sorted = [...options].sort((a, b) => {
      const sa = a.score ?? 0;
      const sb = b.score ?? 0;
      if (sb !== sa) return sb - sa;
      return a.label.localeCompare(b.label);
    });
    return sorted.slice(0, max);
  }

  // ----------------------------
  // Banned phrase sanitation
  // ----------------------------

  private sanitizeDraftText(ctx: FallbackRuntimeContext): string | null {
    const text = (ctx.draftText ?? "").trim();
    if (!text) return null;

    let out = text;
    for (const re of BANNED_EMPTY_RESULT_PATTERNS) {
      out = out.replace(re, "").trim();
    }

    // If sanitization removed everything, return null
    if (!out) return null;
    return out;
  }

  // ----------------------------
  // Bank loader safety
  // ----------------------------

  private safeGetBank<T = any>(bankId: string): T | null {
    try {
      return this.bankLoader.getBank<T>(bankId);
    } catch {
      return null;
    }
  }
}
