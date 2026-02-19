// src/types/validation.types.ts

/**
 * Validation types used across Koda:
 * - core quality gates
 * - output contract enforcement
 * - markdown/numeric validators
 * - ingestion/extraction validation
 *
 * Keep this file pure types (no runtime logic).
 */

export type ValidationSeverity = "info" | "warning" | "error";

export type ValidationPhase =
  | "intent"
  | "scope"
  | "retrieval"
  | "grounding"
  | "formatting"
  | "privacy"
  | "safety"
  | "final_output";

export type ValidationActionType =
  | "pass"
  | "warn"
  | "transform"
  | "route"
  | "block"
  | "regenerate"
  | "retry_retrieval_then_regen";

export interface ValidationRuleRef {
  /** Stable id like "QG_NUM_001" or "MD_002" */
  id: string;
  /** Human-readable name for logs/trace */
  name?: string;
  /** Optional bank id (quality_gates, doc_grounding_checks, etc.) */
  bankId?: string;
}

export interface ValidationEvidence {
  /** Short snippet or example of the offending content (never huge) */
  snippet?: string;
  /** Regex/pattern string that matched */
  pattern?: string;
  /** Fields that failed (e.g., ["sources", "answerMode"]) */
  fields?: string[];
  /** Numbers found (for numeric validators) */
  numbers?: Array<{
    raw: string;
    normalized?: string;
    kind?: "currency" | "percent" | "int" | "float";
  }>;
  /** Optional debug object, must be safe for logs (no secrets) */
  debug?: Record<string, any>;
}

export interface ValidationFinding {
  rule: ValidationRuleRef;
  phase: ValidationPhase;
  severity: ValidationSeverity;

  /**
   * Machine reason code for routing and tests.
   * Examples: "scope_hard_constraints_empty", "no_relevant_chunks_in_scoped_docs"
   */
  reasonCode: string;

  /** Human-friendly message for logs (not user-facing microcopy) */
  message: string;

  /** Optional evidence payload */
  evidence?: ValidationEvidence;

  /**
   * Suggested action for orchestrator/quality gate runner.
   * - transform: do a local fix (strip sources, fix markdown)
   * - route: change answer mode (scoped_not_found, no_docs, disambiguate)
   * - regenerate: rerun model with hints
   */
  action: ValidationActionType;

  /**
   * Optional action id used by gate runners (matches quality_gates actions).
   * Example: "strip_inline_sources", "emit_adaptive_failure_message"
   */
  actionId?: string;

  /** How confident we are this is a true failure */
  confidence?: number; // 0..1

  /** Whether this finding is blocking (must not ship as-is) */
  blocking?: boolean;
}

export interface ValidationTraceItem {
  at: string; // ISO
  phase: ValidationPhase;
  ruleId: string;
  passed: boolean;
  severity?: ValidationSeverity;
  reasonCode?: string;
  action?: ValidationActionType;
}

export interface ValidationResult {
  ok: boolean;

  /** Highest severity seen */
  maxSeverity: ValidationSeverity;

  /** All findings (sorted by severity + phase) */
  findings: ValidationFinding[];

  /** Trace for debugging, can be omitted in prod */
  trace?: ValidationTraceItem[];

  /**
   * If ok=false, orchestrator may use this to decide what to do next.
   * Example: "emit_adaptive_failure_message", "retry_retrieval_then_regen"
   */
  recommendedAction?: {
    type: ValidationActionType;
    actionId?: string;
    reasonCode?: string;
    regenHint?: string;
  };
}

/**
 * Generic validator interface implemented by validators in services/validation/validators.
 */
export interface Validator<TInput = any> {
  id: string;
  phase: ValidationPhase;
  run(input: TInput): Promise<ValidationResult> | ValidationResult;
}

/**
 * Common inputs that validators may consume (core pipeline).
 * You can extend these as your pipeline evolves.
 */
export interface ValidationContext {
  env: "production" | "staging" | "dev" | "local";

  answerMode?: string;
  language?: string;

  // Query + signals
  queryText?: string;
  operator?: string;
  intentFamily?: string;
  signals?: Record<string, any>;

  // Scope + retrieval
  explicitDocRef?: { present: boolean; value?: string | null };
  chosenDocs?: { count: number; ids?: string[]; allMatchExplicit?: boolean };
  sources?: { docIds?: string[]; containsNonExplicit?: boolean };

  // Output
  answerText: string;
  attachments?: any[];

  // Constraints
  constraints?: {
    maxSentences?: number;
    exactBulletCount?: number;
    userRequestedShort?: boolean;
  };

  // Evidence stats
  evidenceStats?: {
    docsUsed?: number;
    snippets?: number;
    tokenOverlap?: number;
    numericClaims?: number;
    numericClaimsGrounded?: number;
  };
}
