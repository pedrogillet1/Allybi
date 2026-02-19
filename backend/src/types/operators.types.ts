// src/types/operator.types.ts
/**
 * OPERATOR TYPES
 *
 * Canonical operator contract types shared by:
 * - intent engine (candidate selection)
 * - router (mode decisions)
 * - answer composer (format constraints)
 * - tools/nav (open/where/locate_docs)
 *
 * Keep the Operator union in ONE place: here.
 * JSON banks should reference these ids exactly.
 */

export type Operator =
  // Document-grounded
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

  // Navigation/UI actions
  | "open"
  | "where"

  // Help / meta
  | "help"
  | "capabilities"
  | "how_to"

  // Conversation micro intents
  | "greeting"
  | "thanks"
  | "ack"
  | "goodbye"

  // Safety / refusal / fallback
  | "refusal"
  | "fallback";

export type OperatorCategory =
  | "documents"
  | "file_actions"
  | "navigation"
  | "help"
  | "conversation"
  | "safety";

export type OutputShape =
  | "paragraph"
  | "bullets"
  | "numbered_list"
  | "table"
  | "file_list"
  | "button_only";

export type AnswerMode =
  | "no_docs"
  | "scoped_not_found"
  | "refusal"
  | "nav_pills"
  | "rank_disambiguate"
  | "rank_autopick"
  | "doc_grounded_single"
  | "doc_grounded_table"
  | "doc_grounded_quote"
  | "doc_grounded_multi"
  | "help_steps"
  | "general_answer";

export interface OperatorConstraints {
  outputShape?: OutputShape;

  /** e.g. “Give me 5 bullets” */
  exactBulletCount?: number;

  /** e.g. “2–3 sentences” */
  maxSentences?: number;

  /** table required (compute/compare or explicit request) */
  requireTable?: boolean;

  /** sources button required for doc grounded */
  requireSourceButtons?: boolean;

  /** followups allowed for this operator */
  maxFollowups?: number;

  /** user asked for short */
  userRequestedShort?: boolean;
}

export interface OperatorContract {
  id: Operator;
  category: OperatorCategory;

  /** default output shape if no user format requested */
  defaultOutputShape: OutputShape;

  /** which answer modes this operator may route to */
  allowedAnswerModes: AnswerMode[];

  /** whether the operator requires documents */
  requiresDocs: boolean;

  /** if docs exist, whether we must ground */
  requiresGrounding: boolean;

  /** whether operator is nav_pills style (open/where/discovery) */
  isNavOperator: boolean;

  /** for discovery style queries */
  isDiscoveryOperator?: boolean;

  /** for file inventory */
  isFileActionOperator?: boolean;

  /** static constraints */
  constraints?: OperatorConstraints;
}

export interface OperatorCandidate {
  operator: Operator;
  score: number; // 0..1
  reasons: string[];
  blocked?: boolean;
  blockReason?: string;
}

export interface OperatorDecision {
  selected: Operator;
  candidates: OperatorCandidate[];
  confidence: {
    topScore: number;
    margin: number;
    level: "low" | "medium" | "high";
  };
}

/** Helper: convenience mapping for core operator groups */
export const NAV_OPERATORS: ReadonlySet<Operator> = new Set([
  "open",
  "where",
  "locate_docs",
]);
export const FILE_ACTION_OPERATORS: ReadonlySet<Operator> = new Set([
  "list",
  "filter",
  "sort",
  "group",
  "count",
  "stats",
]);
export const DOC_OPERATORS: ReadonlySet<Operator> = new Set([
  "summarize",
  "extract",
  "compute",
  "compare",
  "quote",
  "locate_content",
]);

/** Helper: determine category from operator */
export function getOperatorCategory(op: Operator): OperatorCategory {
  if (NAV_OPERATORS.has(op)) return "navigation";
  if (FILE_ACTION_OPERATORS.has(op)) return "file_actions";
  if (DOC_OPERATORS.has(op)) return "documents";
  if (op === "help" || op === "capabilities" || op === "how_to") return "help";
  if (op === "greeting" || op === "thanks" || op === "ack" || op === "goodbye")
    return "conversation";
  return "safety";
}
