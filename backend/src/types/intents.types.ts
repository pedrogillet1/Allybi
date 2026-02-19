// src/types/intent.types.ts
/**
 * INTENT TYPES
 *
 * These types represent the *intermediate* interpretation layer:
 * query → signals → intent family/operator candidates → final decision.
 *
 * Keep these stable: they become the contract between
 * runtimePatterns / triggers / intent engine / router.
 */

export type LanguageCode = "en" | "pt" | "es";

/** High-level family (used to choose routing branches + fallback style) */
export type IntentFamily =
  | "documents" // doc-grounded Q&A, summarize/extract/compute/compare/quote
  | "file_actions" // list/filter/sort/group/count/stats across workspace
  | "navigation" // open/where/discovery UI actions (nav_pills)
  | "help" // product help/how-to
  | "conversation" // greetings/thanks/ack/small talk (non-doc)
  | "account" // profile/settings/auth flows (if used)
  | "unknown";

/**
 * Operators are the atomic "what to do" instructions.
 * Use a small, stable set. If you add operators later,
 * update: data_banks/operators/operator_contracts.any.json
 * and: data_banks/operators/operator_output_shapes.any.json
 */
export type Operator =
  // Document work
  | "summarize"
  | "extract"
  | "compute"
  | "compare"
  | "quote"
  | "locate_content"
  | "locate_docs"
  // File actions
  | "list"
  | "filter"
  | "sort"
  | "group"
  | "count"
  | "stats"
  // Navigation actions (UI)
  | "open"
  | "where"
  // Meta/help/conversation
  | "help"
  | "capabilities"
  | "how_to"
  | "greeting"
  | "thanks"
  | "ack"
  | "goodbye"
  // Fallback
  | "fallback";

/** Output shape constraints requested/detected from the query */
export type OutputShape =
  | "paragraph"
  | "bullets"
  | "numbered_list"
  | "table"
  | "file_list"
  | "button_only";

/** Domain ids should match data_banks/semantics/domain_ontology.any.json */
export type DomainId =
  | "general"
  // Finance family
  | "finance_corporate"
  | "finance_real_estate"
  | "finance_markets"
  | "finance_lending"
  | "finance_payments"
  // Accounting family
  | "accounting_gl"
  | "accounting_ap_ar"
  | "accounting_tax"
  | "accounting_audit"
  // Excel family
  | "excel_modeling"
  | "excel_audit_tracing"
  | "excel_reporting"
  // Legal family
  | "legal_contracts"
  | "legal_compliance"
  | "legal_disputes"
  // Medical family
  | "medical_labs"
  | "medical_clinical"
  | "medical_insurance"
  // Personal documents family
  | "identity_docs"
  | "address_proof"
  | "vehicle_docs"
  | "housing_rent_mortgage"
  | "utilities_bills"
  | "invoices_billing";

/** Confidence helper (0..1 values are used by rank + mode routing) */
export interface ConfidenceInfo {
  score: number; // top score
  margin?: number; // score gap vs #2
  level: "low" | "medium" | "high";
  reasons?: string[];
}

/** Query-level signals computed from triggers/normalizers/semantics */
export interface IntentSignals {
  // Intent family hints
  navQuery?: boolean; // open/where style
  discoveryQuery?: boolean; // "which file" / "find docs"
  fileActionQuery?: boolean; // list/filter/sort/count
  helpQuery?: boolean;
  conversationOnly?: boolean;

  // Output format hints
  userAskedForTable?: boolean;
  userAskedForBullets?: boolean;
  userAskedForSteps?: boolean;
  userAskedForJson?: boolean;
  shortOverview?: boolean; // “2–3 sentences”
  userRequestedShort?: boolean;
  justAnswer?: boolean;

  // Document content intent
  userAskedForQuote?: boolean;
  numericIntent?: boolean;
  numericIntentStrong?: boolean;
  spreadsheetQuery?: boolean;
  calculationIntent?: boolean;

  // Scope hints
  hasExplicitDocRef?: boolean;
  explicitFilename?: string;
  explicitDocId?: string;
  activeDocHardLock?: boolean;

  // Disambiguation
  multiPartQuery?: boolean;
  hasMultipleAsks?: boolean;

  // OCR
  scannedDocQuery?: boolean;
  ocrLowConfidence?: boolean;

  // Misc
  languageDetected?: LanguageCode;
  domainDetected?: DomainId;
}

/** Operator candidate score used in routing */
export interface OperatorCandidate {
  operator: Operator;
  score: number; // 0..1
  reasons: string[];
  blocked?: boolean;
  blockReason?: string;
}

/** Final intent decision emitted by intent engine */
export interface IntentDecision {
  intentFamily: IntentFamily;
  operator: Operator;

  // Ranked candidates (for debug + disambiguation)
  candidates: OperatorCandidate[];

  // Signals snapshot used by router/composer
  signals: IntentSignals;

  // Domain + language
  domainId: DomainId;
  language: LanguageCode;

  // Constraints for the composer
  constraints: {
    outputShape?: OutputShape;
    exactBulletCount?: number;
    maxSentences?: number;
    requireTable?: boolean;
    requireSourceButtons?: boolean;
    maxFollowups?: number;
    userRequestedShort?: boolean;
  };

  confidence: ConfidenceInfo;
}

/** Minimal input into the intent engine (pre-normalized query) */
export interface IntentEngineInput {
  queryText: string;
  languageHint?: LanguageCode;
  conversationId?: string;
  turnId?: string;

  // Context hints
  activeDocId?: string | null;
  activeDocLockType?: "soft" | "hard" | null;

  // Attached/selected docs in UI
  attachedDocumentIds?: string[];

  // If user clicked regenerate
  regenCount?: number;
}

/** Output of runtime pattern matching (before scoring/ranking) */
export interface RuntimePatternMatch {
  matched: boolean;
  patternId?: string;
  intentFamilyHint?: IntentFamily;
  operatorHint?: Operator;
  scoreBoost?: number;
  extracted?: Record<string, string | number | boolean>;
}

/** Utility: determine confidence level */
export function confidenceLevel(
  score: number,
  margin: number = 0,
): ConfidenceInfo["level"] {
  if (score >= 0.8 && margin >= 0.08) return "high";
  if (score >= 0.55) return "medium";
  return "low";
}

/** Fallback scenario keys (used by fallbackConfig.service) */
export type FallbackScenarioKey =
  | "no_docs_indexed"
  | "no_relevant_chunks"
  | "scope_hard_empty"
  | "indexing_in_progress"
  | "extraction_failed"
  | "refusal"
  | "ambiguous_query"
  | "generic"
  | "NO_DOCUMENTS"
  | "OUT_OF_SCOPE"
  | "AMBIGUOUS_QUESTION"
  | "UNSUPPORTED_INTENT"
  | string;

/** Fallback style identifiers */
export type FallbackStyleId =
  | "gentle_redirect"
  | "suggest_upload"
  | "suggest_rephrase"
  | "scope_hint"
  | "hard_block"
  | "default"
  | "one_liner"
  | string;
