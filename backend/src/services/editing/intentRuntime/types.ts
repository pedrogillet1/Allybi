/**
 * IntentRuntime type system.
 *
 * Defines the core schema that all intent-pattern banks conform to,
 * plus the runtime structures produced by the pipeline:
 *   segment → match → slotFill → assemble → worklog
 */

import type { EditOperator, EditDomain } from "../editing.types";

// ---------------------------------------------------------------------------
// Slot Extractor Types
// ---------------------------------------------------------------------------

export type SlotType =
  | "A1_RANGE"
  | "SHEET_NAME"
  | "NUMBER_OR_TEXT"
  | "COLOR"
  | "FONT_FAMILY"
  | "FONT_SIZE"
  | "CHART_TYPE"
  | "SORT_SPEC"
  | "FORMULA"
  | "FORMAT_PATTERN"
  | "HEADING_LEVEL"
  | "LANGUAGE"
  | "BOOLEAN_FLAG"
  | "STYLE_NAME"
  | "LOCATOR_TEXT"
  | "PERCENTAGE"
  | "ALIGNMENT"
  | "AXIS"
  | "SCOPE"
  | "TEXT_CASE"
  | "LIST_TYPE"
  | "DIRECTION";

export interface SlotExtractor {
  /** Parser type — selects the extraction strategy. */
  type: SlotType;
  /** Slot name referenced in planTemplate via `$slotName`. */
  out: string;
  /** Optional override regex (takes precedence over built-in parser). */
  regex?: string;
  /** Reference to a parser-bank ID for dictionary lookups. */
  dictionary?: string;
  /** Default value when no match is found and the slot is optional. */
  defaultValue?: unknown;
}

// ---------------------------------------------------------------------------
// Plan Template
// ---------------------------------------------------------------------------

export interface PlanStep {
  /** Canonical operator ID (e.g. "XLSX_SET_VALUE", "DOCX_REWRITE_PARAGRAPH"). */
  op: string;
  /** All other keys are slot references (values may contain "$slotName"). */
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Clarification
// ---------------------------------------------------------------------------

export interface ClarifyRule {
  slot: string;
  ask_en: string;
  ask_pt: string;
}

// ---------------------------------------------------------------------------
// Scope Rules
// ---------------------------------------------------------------------------

export interface ScopeRules {
  defaultScope: string;
  allowScopeOverrideByExplicitRange: boolean;
  allowNoSelectionIfRangeProvided: boolean;
}

// ---------------------------------------------------------------------------
// Intent Pattern (one entry in a pattern bank)
// ---------------------------------------------------------------------------

export interface IntentPattern {
  /** Globally unique, dot-namespaced ID. e.g. "excel.set_value.range" */
  id: string;
  /** Domain this pattern applies to. */
  domain: "excel" | "docx";
  /** Language this pattern is authored for. */
  lang: "en" | "pt";
  /** 0–100, higher = preferred when scores are tied. */
  priority: number;
  /** Trigger token/regex rules — at least one must match. */
  triggers: {
    tokens_any?: string[];
    tokens_all?: string[];
    regex_any?: string[];
    /** Hard-block tokens: if ANY of these are found, this pattern scores 0. */
    tokens_none?: string[];
  };
  /** Ordered slot extraction rules, run in sequence. */
  slotExtractors: SlotExtractor[];
  /** Scope resolution configuration. */
  scopeRules: ScopeRules;
  /** Template plan steps with $slot references to be filled. */
  planTemplate: PlanStep[];
  /** Optional clarification prompts for missing required slots. */
  clarifyIfMissing?: ClarifyRule[];
  /** Positive and negative example phrases for testing & scoring. */
  examples: {
    positive: string[];
    negative: string[];
  };
}

// ---------------------------------------------------------------------------
// Segmenter output
// ---------------------------------------------------------------------------

export interface Segment {
  text: string;
  index: number;
}

// ---------------------------------------------------------------------------
// Matcher output
// ---------------------------------------------------------------------------

export interface MatchCandidate {
  pattern: IntentPattern;
  score: number;
  matchedTriggers: string[];
}

export interface MatchResult {
  segment: Segment;
  candidates: MatchCandidate[];
  bestMatch: MatchCandidate | null;
}

// ---------------------------------------------------------------------------
// Slot Fill output
// ---------------------------------------------------------------------------

export type FilledSlots = Record<string, unknown>;

export interface SlotFillResult {
  filled: FilledSlots;
  missing: string[];
  /** Locale conversions applied to formulas (e.g. "SOMA → SUM", "; → ,"). */
  localeConversions?: string[];
}

// ---------------------------------------------------------------------------
// Plan Assembler output
// ---------------------------------------------------------------------------

export interface ResolvedPlanStep {
  op: string;
  params: Record<string, unknown>;
  stepId: string;
  /** Locale conversions applied during slot fill (e.g. "SOMA → SUM"). */
  localeConversions?: string[];
}

export interface IntentPlan {
  kind: "plan";
  ops: ResolvedPlanStep[];
  worklog: WorklogStep[];
  sourcePatternIds: string[];
  language: "en" | "pt";
  domain: "excel" | "docx";
}

export interface ClarificationNeeded {
  kind: "clarification";
  missingSlots: Array<{
    slot: string;
    message: string;
  }>;
  partialOps: ResolvedPlanStep[];
  sourcePatternIds: string[];
}

// ---------------------------------------------------------------------------
// Worklog output
// ---------------------------------------------------------------------------

export interface WorklogStep {
  stepId: string;
  title: string;
  status: "queued" | "running" | "done" | "failed";
}

// ---------------------------------------------------------------------------
// analyzeMessageToPlan input
// ---------------------------------------------------------------------------

export interface AnalyzeInput {
  message: string;
  domain: "excel" | "docx";
  viewerContext: {
    selection?: unknown;
    sheetName?: string;
    frozenSelection?: unknown;
  };
  language?: "en" | "pt";
}

// ---------------------------------------------------------------------------
// Operator Catalog entry (parsers/operator_catalog.any.json)
// ---------------------------------------------------------------------------

export interface OperatorCatalogEntry {
  domain: "excel" | "docx";
  runtimeOperator: string;
  engine?: string;
  requiresSelection: "required" | "optional" | "forbidden";
  supportsMultiTarget: boolean;
  requiredSlots: string[];
  optionalSlots: string[];
  slotSchema?: Record<string, unknown>;
  allowedScopes?: string[];
  scopeDefaults?: Record<string, unknown>;
  previewType?: string;
  diffType?: string;
  validationRules?: Array<Record<string, unknown>>;
  confirmationPolicy?: {
    requiresExplicitConfirm?: boolean;
  };
  microcopyKeys?: Record<string, string>;
  capabilityKey?: string;
  conflictsWith: string[];
  previewable: boolean;
  undoable: boolean;
  uiStepTemplate: {
    en: string;
    pt: string;
  };
}

export type OperatorCatalog = Record<string, OperatorCatalogEntry>;

// ---------------------------------------------------------------------------
// Pattern Bank file shape (what the JSON looks like on disk)
// ---------------------------------------------------------------------------

export interface PatternBankFile {
  _meta: {
    id: string;
    version: string;
    description: string;
    domain: "excel" | "docx";
    lang: "en" | "pt";
    lastUpdated: string;
  };
  patterns: IntentPattern[];
}

// ---------------------------------------------------------------------------
// Lexicon Bank file shape
// ---------------------------------------------------------------------------

export interface LexiconBankFile {
  _meta: {
    id: string;
    version: string;
    description: string;
    lang: "en" | "pt" | "any";
    lastUpdated: string;
  };
  entries: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Parser Dictionary file shape
// ---------------------------------------------------------------------------

export interface ParserDictionaryFile {
  _meta: {
    id: string;
    version: string;
    description: string;
    lang: "en" | "pt" | "any";
    lastUpdated: string;
  };
  entries: Record<string, string>;
}
