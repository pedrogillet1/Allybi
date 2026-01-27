// routingSignals.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Koda Routing Signals (ChatGPT-parity, canonical contract)
 * --------------------------------------------------------
 * This file defines the *shared signal vocabulary* used across:
 *  - routing (intent_patterns, routing_priority, operator_priority, routing_overlays)
 *  - operators (operator_aliases, operator_families, operator_constraints)
 *  - scope (scope_hints, followup_indicators, discourse_markers)
 *  - retrieval (semantic_search_config, retrieval_overlays, retrieval_negatives)
 *  - formatting (format_triggers, formatting_overlays, ui_contracts)
 *  - ambiguity (ambiguity_rank_features, confidence_calibration, disambiguation_policies)
 *  - policies (doc_access_policy, grounding_policy, numeric_policy, fallback_policy, etc.)
 *  - state (conversation_state_schema, state_update_rules)
 *  - probes (parity_queries, routing_probes, ui_probes, failure_mode_tests, ...)
 *
 * These signals are NOT user-facing. They are runtime-only.
 *
 * Design goals:
 *  - Deterministic: avoid "maybe" fields; each field has clear semantics
 *  - Minimal but sufficient: no redundant fields; leave extra fields for debug only
 *  - Stable: field names should not change often, because policies and banks depend on them
 *
 * NOTE:
 * The orchestrator should treat this as the type contract for "signals" passed between stages.
 */

export type EnvName = "production" | "staging" | "dev" | "local";
export type LangCode = "any" | "en" | "pt" | "es";

export type IntentFamily =
  | "documents"
  | "doc_discovery"
  | "file_actions"
  | "doc_stats"
  | "help"
  | "conversation"
  | "unknown";

export type AnswerMode =
  | "nav_pills"
  | "doc_grounded_single"
  | "doc_grounded_multi"
  | "doc_grounded_quote"
  | "doc_grounded_table"
  | "general_answer"
  | "help_steps"
  | "rank_disambiguate"
  | "rank_autopick";

export type OutputShape = "button_only" | "paragraph" | "bullets" | "table" | "quote" | "breadcrumbs" | "file_list" | "steps";

/**
 * Canonical operators used by your operator_families / operator_aliases.
 * Keep this aligned with your bank definitions.
 */
export type OperatorId =
  | "open"
  | "locate_file"
  | "locate_docs"
  | "locate_content"
  | "list"
  | "filter"
  | "sort"
  | "group"
  | "count_files"
  | "summarize"
  | "extract"
  | "quote"
  | "compare"
  | "compute"
  | "set_active_doc"
  | "capabilities"
  | "how_to"
  | "greeting"
  | "thanks"
  | "goodbye"
  | "ack"
  | "refusal"
  | "unknown";

/**
 * Reason codes are shared across banks and policies.
 * Keep this list aligned with your policy handoff "Shared Reason Codes".
 */
export type SharedReasonCode =
  | "explicit_doc_required"
  | "wrong_doc_detected"
  | "scope_hard_constraints_empty"
  | "no_relevant_chunks_in_scoped_docs"
  | "indexing_in_progress"
  | "extraction_failed"
  | "no_docs_indexed"
  | "scoped_not_found"
  | "needs_doc_choice"
  | "needs_time_range"
  | "needs_metric"
  | "json_denied"
  | "nav_pills_contract_violation"
  | "numeric_truncation_detected"
  | "numeric_not_in_source"
  | "hallucination_risk_high"
  | "grounding_fail_soft"
  | "privacy_redaction_required"
  | "refusal_required";

/**
 * RoutingSignals are passed through pipeline stages.
 * Convention:
 *  - signals.* are runtime facts
 *  - metrics.* are computed scores/statistics
 */
export interface RoutingSignals {
  // ---------------------------------------------------------------------------
  // Identity & environment
  // ---------------------------------------------------------------------------
  env: EnvName;
  language: {
    detected: LangCode; // from languageDetector
    selected: LangCode; // from languageEnforcement
    requested: boolean; // explicit directive
    mixed: boolean; // mixed-language input detected
    confidence: number; // 0..1
    scoreGap: number; // 0..1 (top - second)
  };

  // ---------------------------------------------------------------------------
  // Intent / operator selection
  // ---------------------------------------------------------------------------
  intentFamily: IntentFamily;
  operator: OperatorId;
  operatorFamily?: string | null; // bank-defined family id, e.g. "documents", "file_actions"
  answerMode: AnswerMode;
  outputShape?: OutputShape | null;

  // Confidence for routing
  metrics: {
    intentConfidence?: number; // 0..1
    operatorConfidence?: number; // 0..1
    topScore?: number | null; // ambiguity ranking top score
    scoreGap?: number | null; // ambiguity ranking margin
    queryAmbiguity?: number | null; // 0..1 (higher = more ambiguous)
  };

  // ---------------------------------------------------------------------------
  // Scope & doc access
  // ---------------------------------------------------------------------------
  scope: {
    // Active doc context (persistent)
    activeDocId: string | null;
    activeDocTitle?: string | null;
    activeFilename?: string | null;

    // Hard locks (persistent)
    explicitDocLock: boolean; // hard doc lock active
    hardScopeActive: boolean; // any hard constraints exist this turn
    singleDocIntent: boolean; // doc-only intent (even if no explicit lock)

    // Explicit references in this turn
    explicitDocRef: boolean; // user named a doc/filename/alias explicitly
    resolvedDocId: string | null; // resolved id if explicit doc ref

    // Discovery override
    corpusSearchAllowed: boolean; // discovery can ignore lock

    // Spreadsheet scoping
    sheetHintPresent: boolean;
    resolvedSheetName: string | null;
    rangeExplicit: boolean;
    resolvedRangeA1: string | null;

    // Page/slide hints (soft)
    pageRefPresent?: boolean;
    slideRefPresent?: boolean;
    sectionRefPresent?: boolean;
  };

  // ---------------------------------------------------------------------------
  // Follow-up & discourse
  // ---------------------------------------------------------------------------
  followup: {
    isFollowup: boolean;
    strength: "weak" | "medium" | "strong" | null;
    // Discourse markers (optional, if discourse_markers overlay ran)
    discourse: {
      isContinuation?: boolean;
      isAdditive?: boolean;
      isCorrection?: boolean;
      isContrast?: boolean;
      isTopicShift?: boolean;
      isFormatShift?: boolean;
      isNarrowing?: boolean;
      isBroadening?: boolean;
      isHedged?: boolean;
      discourseScore?: number; // 0..1
    };
  };

  // ---------------------------------------------------------------------------
  // Formatting / UI triggers
  // ---------------------------------------------------------------------------
  format: {
    userAskedForBullets: boolean;
    userAskedForTable: boolean;
    userAskedForQuote: boolean;
    userAskedForSteps: boolean;
    userAskedForShort: boolean;
    userAskedForMoreDetail: boolean;
    userAskedForJson: boolean; // must be denied/redirected by policy
    isListIntent: boolean;
  };

  // nav triggers (terminal UI)
  nav: {
    navOpenRequested: boolean;
    navWhereRequested: boolean;
    navDiscoverRequested: boolean;
    preferredNavType: "open" | "where" | "discover" | "none";
  };

  // UI execution flags
  ui: {
    toolExecuted: boolean; // whether a tool/action actually ran
    suppressSourcesHeader: boolean; // enforced by ui_contracts
    suppressActions: boolean; // enforced by ui_contracts
    clarificationQuestionCount: number; // composer output count
  };

  // ---------------------------------------------------------------------------
  // Retrieval signals (inputs/outputs)
  // ---------------------------------------------------------------------------
  retrieval: {
    allowExpansion: boolean; // must be explicitly true to allow expansion
    hasQuotedText: boolean; // quoted phrases present in query
    hasFilename: boolean; // filename-like token present

    // Retrieval results
    retrievedChunks: number; // count
    evidenceDocs: string[]; // docIds present in evidence pack
    topEvidenceScore: number | null;
    evidenceSufficiency?: number | null; // 0..1, computed by ranker/evidence gate
  };

  // ---------------------------------------------------------------------------
  // Safety / privacy
  // ---------------------------------------------------------------------------
  safety: {
    unsafeGate: boolean; // if true, route to refusal policy
    unsafeReasonCode?: string | null;
  };

  privacy: {
    containsInternalIds: boolean;
    containsDebugTrace: boolean;
    containsSystemPaths: boolean;
    piiDetected: boolean;
  };

  // ---------------------------------------------------------------------------
  // Shared reason codes emitted across pipeline
  // ---------------------------------------------------------------------------
  reasonCodes: SharedReasonCode[];

  // ---------------------------------------------------------------------------
  // Optional: non-user-visible debug breadcrumbs
  // ---------------------------------------------------------------------------
  debug?: {
    stage?: string;
    notes?: string[];
  };
}

/**
 * Helper: create a minimal default signals object.
 * This is useful for tests and for initializing new sessions.
 */
export function createDefaultRoutingSignals(env: EnvName): RoutingSignals {
  return {
    env,
    language: { detected: "any", selected: "any", requested: false, mixed: false, confidence: 0, scoreGap: 0 },
    intentFamily: "unknown",
    operator: "unknown",
    operatorFamily: null,
    answerMode: "general_answer",
    outputShape: null,
    metrics: {},
    scope: {
      activeDocId: null,
      activeDocTitle: null,
      activeFilename: null,
      explicitDocLock: false,
      hardScopeActive: false,
      singleDocIntent: false,
      explicitDocRef: false,
      resolvedDocId: null,
      corpusSearchAllowed: false,
      sheetHintPresent: false,
      resolvedSheetName: null,
      rangeExplicit: false,
      resolvedRangeA1: null,
    },
    followup: {
      isFollowup: false,
      strength: null,
      discourse: {},
    },
    format: {
      userAskedForBullets: false,
      userAskedForTable: false,
      userAskedForQuote: false,
      userAskedForSteps: false,
      userAskedForShort: false,
      userAskedForMoreDetail: false,
      userAskedForJson: false,
      isListIntent: false,
    },
    nav: {
      navOpenRequested: false,
      navWhereRequested: false,
      navDiscoverRequested: false,
      preferredNavType: "none",
    },
    ui: {
      toolExecuted: false,
      suppressSourcesHeader: false,
      suppressActions: true,
      clarificationQuestionCount: 0,
    },
    retrieval: {
      allowExpansion: false,
      hasQuotedText: false,
      hasFilename: false,
      retrievedChunks: 0,
      evidenceDocs: [],
      topEvidenceScore: null,
      evidenceSufficiency: null,
    },
    safety: {
      unsafeGate: false,
      unsafeReasonCode: null,
    },
    privacy: {
      containsInternalIds: false,
      containsDebugTrace: false,
      containsSystemPaths: false,
      piiDetected: false,
    },
    reasonCodes: [],
    debug: { stage: "init", notes: [] },
  };
}
