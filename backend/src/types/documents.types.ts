// backend/src/types/documents.types.ts

/**
 * Document types used by ingestion and file management.
 */

export type DocumentType =
  | "pdf"
  | "docx"
  | "pptx"
  | "xlsx"
  | "csv"
  | "txt"
  | "image"
  | "unknown";

export type DocMimeType =
  | "application/pdf"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  | "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  | "text/csv"
  | "text/plain"
  | "image/png"
  | "image/jpeg"
  | "image/webp"
  | string;

export type DocExtension =
  | ".pdf"
  | ".docx"
  | ".pptx"
  | ".xlsx"
  | ".csv"
  | ".txt"
  | ".png"
  | ".jpg"
  | ".jpeg"
  | ".webp";

/**
 * Conversation State Types (ChatGPT-parity, stable runtime contract)
 * -----------------------------------------------------------------
 * Centralizes the canonical in-memory/state-persistence shape used across:
 *  - scopeGate.service.ts
 *  - retrievalEngine.service.ts / evidenceGate.service.ts
 *  - trustGate.service.ts / qualityGateRunner.service.ts
 *  - microcopyPicker.service.ts / response contracts
 *  - conversationMemory.service.ts (optional integration)
 *
 * Design principles:
 *  - Deterministic fields (no ambiguous semantics)
 *  - Bank-aligned keys (reason codes, signals, locks)
 *  - Safe to persist (no raw embeddings, no full evidence dumps)
 *  - Bounded histories for anti-repetition
 */

export type EnvName = "production" | "staging" | "dev" | "local";
export type LangCode = "any" | "en" | "pt" | "es";

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

export type OutputShape =
  | "button_only"
  | "paragraph"
  | "bullets"
  | "table"
  | "quote"
  | "breadcrumbs"
  | "file_list"
  | "steps";

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

export interface ConversationScopeState {
  // Active doc context
  activeDocId: string | null;
  activeDocTitle?: string | null;
  activeFilename?: string | null;

  // Hard locks (persist)
  hardDocLock: boolean;

  // Sub-scope for spreadsheets
  hardSheetLock: boolean;
  activeSheetName: string | null;
  activeRangeA1: string | null;

  // Soft hints
  activePageHint?: number | null;
  activeSlideHint?: number | null;

  // For debugging/trace
  lockSetTurn?: number | null;
  lockReasonCodes?: SharedReasonCode[];
}

export interface ConversationPreferencesState {
  language: LangCode;

  // Formatting biases (soft preferences; policies enforce caps)
  formatBias: {
    preferConcise: boolean;
    preferBullets: boolean;
    preferTables: boolean;
  };
}

export interface ConversationHistoryState {
  // Anti-repetition: semantic UI tokens chosen recently
  recentTokens: string[]; // e.g., ["ui_token:ui_intro_neutral", "ui_soft_close:doc_grounded_single"]

  // Reason codes seen recently (for debugging + repetition control)
  recentReasonCodes: SharedReasonCode[];

  // Recent operators (for continuity/analytics)
  recentOperators: OperatorId[];

  // Recent fallback decisions
  recentFallbacks: Array<{
    reasonCode: SharedReasonCode;
    fallbackType: string;
    strategy: string;
    turnId: number;
  }>;

  // Bounded by memory_decay_rules
}

export interface ConversationEphemeralState {
  turn: {
    turnId: number;
    startedAtTs?: number;
  };

  // Signals derived per-turn (do not persist long-term)
  signals: {
    // language
    languageDetected?: LangCode;
    languageSelected?: LangCode;
    languageRequested?: boolean;
    mixedLanguageDetected?: boolean;

    // followup / discourse
    isFollowup?: boolean;
    followupStrength?: "weak" | "medium" | "strong" | null;

    discourse?: {
      isContinuation?: boolean;
      isAdditive?: boolean;
      isCorrection?: boolean;
      isContrast?: boolean;
      isTopicShift?: boolean;
      isFormatShift?: boolean;
      isNarrowing?: boolean;
      isBroadening?: boolean;
      isHedged?: boolean;
      discourseScore?: number;
    };

    // routing/operator
    operator?: OperatorId;
    operatorFamily?: string | null;
    intentFamily?: string | null;
    answerMode?: AnswerMode;
    outputShape?: OutputShape;

    // scope
    explicitDocRef?: boolean;
    resolvedDocId?: string | null;
    corpusSearchAllowed?: boolean;

    // retrieval hints
    allowExpansion?: boolean;
    hasQuotedText?: boolean;
    hasFilename?: boolean;

    // formatting triggers
    userAskedForTable?: boolean;
    userAskedForQuote?: boolean;
    userAskedForJson?: boolean;

    // safety/privacy
    unsafeGate?: boolean;
    piiDetected?: boolean;
  };

  // Computed metrics for decisions (do not persist long-term)
  metrics?: {
    candidateDocCount?: number;
    topScore?: number | null;
    scoreGap?: number | null;
    topScopeCompliance?: number | null;

    retrievedChunks?: number;
    evidenceSufficiency?: number | null;
    evidenceDocsOutsideActiveCount?: number;

    hallucinationRisk?: number | null;
    numericRisk?: number | null;

    turnsSinceSameToken?: number;
    recentSameFallbackCount?: number;
    turnsSinceSameFallback?: number;

    // logging/debug
    lastDecisionStage?: string;
  };
}

export interface ConversationSessionState {
  env: EnvName;
  sessionId?: string | null;

  // For rendering / preferences
  userLanguage?: LangCode;
}

export interface ConversationState {
  session: ConversationSessionState;
  persistent: {
    scope: ConversationScopeState;
    preferences: ConversationPreferencesState;
  };
  history: ConversationHistoryState;
  ephemeral: ConversationEphemeralState;
}

/**
 * Create a minimal initialized state.
 */
export function createInitialConversationState(
  env: EnvName,
): ConversationState {
  return {
    session: { env, sessionId: null, userLanguage: "any" },
    persistent: {
      scope: {
        activeDocId: null,
        activeDocTitle: null,
        activeFilename: null,
        hardDocLock: false,
        hardSheetLock: false,
        activeSheetName: null,
        activeRangeA1: null,
        activePageHint: null,
        activeSlideHint: null,
        lockSetTurn: null,
        lockReasonCodes: [],
      },
      preferences: {
        language: "any",
        formatBias: {
          preferConcise: false,
          preferBullets: false,
          preferTables: false,
        },
      },
    },
    history: {
      recentTokens: [],
      recentReasonCodes: [],
      recentOperators: [],
      recentFallbacks: [],
    },
    ephemeral: {
      turn: { turnId: 0, startedAtTs: Date.now() },
      signals: {},
      metrics: {},
    },
  };
}
