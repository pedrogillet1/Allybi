// src/services/core/answerModeRouter.service.ts
//
// ANSWER MODE ROUTER (CLEAN + CHATGPT-LIKE)
//
// Responsibility:
// - Choose *how* to respond (mode), not *what* to answer.
// - Uses upstream context: intent/operator + doc availability + candidate confidence + scope hardness + signals.
// - Never hardcodes user-facing messages. It only returns mode + reason codes + routing metadata.
// - Ensures nav_pills is pills-only and terminal.
// - Ensures "no relevant information found" never becomes final: routes to scoped_not_found / fallbacks.
//
// Consumes banks (recommended):
// - data_banks/routing/answer_mode_router.any.json (rules + thresholds)
// - data_banks/formatting/answer_style_policy.any.json (profile hints; optional)
// - data_banks/quality/quality_gates.any.json (enforcement; downstream)
//
// Output consumed by:
// - Orchestrator (next pipeline step selection)
// - Composer/Renderer (block plan and UI contract)
// - Quality gates (final enforcement)
//
// Modes (canonical):
// - no_docs
// - scoped_not_found
// - refusal
// - nav_pills
// - rank_disambiguate
// - rank_autopick
// - doc_grounded_single
// - doc_grounded_table
// - doc_grounded_quote
// - doc_grounded_multi
// - help_steps
// - general_answer
//
// IMPORTANT: This router should be deterministic given the same inputs.
// Variation belongs in prompt/composition, not in routing.
//
// ---------------------------------------------------------------------------------------

import { getBank } from "./bankLoader.service";

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

export type NavType = "open" | "where" | "discover" | "disambiguate" | "not_found";

export interface AnswerModeRouterInput {
  operator: string; // open, locate_file, locate_docs, summarize, extract, compute, compare...
  intentFamily: string; // documents, file_actions, help, conversation...
  signals: Record<string, any>;

  // document corpus context
  docContext: {
    docCount: number; // indexed docs in workspace
    candidateCount: number; // candidates after scope/candidate filtering
    topScore?: number; // ranking score of top candidate
    margin?: number; // topScore - secondScore
  };

  // scope constraints
  scope: {
    hard?: {
      docIdAllowlist?: string[];
      filenameMustContain?: string[];
    };
    soft?: {
      docIdAllowlist?: string[];
    };
  };

  // conversation state (optional)
  state?: {
    activeDocRef?: { docId?: string; lockType?: "hard" | "soft" };
  };

  // policy / safety / refusal
  policy: {
    refusalRequired?: boolean;
  };

  // user prefs if you have them
  userPrefs?: {
    noQuotes?: boolean;
  };
}

export interface AnswerModeRouterResult {
  mode: AnswerMode;
  reason: string;

  // optional extras
  navType?: NavType;
  // for discovery nav_pills behavior
  pillCount?: { single: boolean; maxPills: number; introOverride?: Record<string, string> };

  // for disambiguation
  clarify?: {
    reasonCode: string;
    maxOptions?: number;
  };

  // trace (not user-facing)
  debug?: {
    appliedRuleId?: string;
  };
}

// -----------------------------
// Bank shapes (minimal)
// -----------------------------

interface AnswerModeRouterBank {
  _meta: any;
  config: {
    enabled: boolean;
    thresholds: {
      autoPickTopScoreGte: number;
      autoPickMarginGte: number;
      ambiguousMarginLt: number;
      forceClarifyTopScoreBelow: number;
    };
    guardrails: {
      maxClarifyQuestions: number;
      neverReturnDocGroundedModesIfNoDocs: boolean;
    };
  };
  rules: Array<{
    id: string;
    priority: number;
    when?: any; // bank-driven conditions (handled by evaluator)
    then: any;
    terminal?: boolean;
  }>;
}

export class AnswerModeRouterService {
  private bank?: AnswerModeRouterBank;

  constructor() {
    this.bank = getBank<AnswerModeRouterBank>("answer_mode_router");
  }

  route(input: AnswerModeRouterInput): AnswerModeRouterResult {
    // If bank is available, try bank-driven routing first.
    if (this.bank?.config?.enabled && Array.isArray(this.bank.rules) && this.bank.rules.length > 0) {
      const bankResult = this.routeWithBank(input);
      if (bankResult) return bankResult;
    }

    // Fallback deterministic router (safe defaults).
    return this.routeWithDefaults(input);
  }

  // -----------------------------
  // Bank-driven routing
  // -----------------------------
  private routeWithBank(input: AnswerModeRouterInput): AnswerModeRouterResult | null {
    // Rules are evaluated by priority desc
    const rules = [...this.bank!.rules].sort((a, b) => b.priority - a.priority);

    for (const r of rules) {
      const match = this.evalWhen(r.when, input);
      if (!match) continue;

      const then = r.then || {};
      const mode = then.mode as AnswerMode;

      const out: AnswerModeRouterResult = {
        mode,
        reason: then.reason || r.id,
        navType: then.navType,
        pillCount: then.pillCount,
        clarify: then.clarify,
        debug: { appliedRuleId: r.id },
      };

      // Minimal guardrails even in bank mode
      return this.applyHardGuardrails(out, input);
    }

    return null;
  }

  // Bank "when" evaluator:
  // Keep it simple: supports { all:[...], any:[...] } and leaf { path, op, value } like your other banks.
  private evalWhen(when: any, input: any): boolean {
    if (!when || Object.keys(when).length === 0) return true;

    if (when.all) return Array.isArray(when.all) && when.all.every((c: any) => this.evalWhen(c, input));
    if (when.any) return Array.isArray(when.any) && when.any.some((c: any) => this.evalWhen(c, input));

    // leaf
    const path = when.path;
    const op = when.op;
    const value = when.value;
    if (!path || !op) return false;

    const actual = getPath(input, path);

    switch (op) {
      case "eq":
        return actual === value;
      case "neq":
        return actual !== value;
      case "gte":
        return typeof actual === "number" && actual >= value;
      case "lte":
        return typeof actual === "number" && actual <= value;
      case "lt":
        return typeof actual === "number" && actual < value;
      case "gt":
        return typeof actual === "number" && actual > value;
      case "exists":
        return value === true ? actual !== undefined && actual !== null : actual === undefined || actual === null;
      case "in":
        return Array.isArray(value) && value.includes(actual);
      case "startsWith":
        return typeof actual === "string" && typeof value === "string" && actual.startsWith(value);
      default:
        return false;
    }
  }

  // -----------------------------
  // Default routing (deterministic)
  // -----------------------------
  private routeWithDefaults(input: AnswerModeRouterInput): AnswerModeRouterResult {
    // 1) Policy refusal
    if (input.policy?.refusalRequired) {
      return { mode: "refusal", reason: "policy_refusal_required" };
    }

    const docCount = input.docContext.docCount ?? 0;
    const candidateCount = input.docContext.candidateCount ?? 0;
    const topScore = input.docContext.topScore ?? 0;
    const margin = input.docContext.margin ?? 0;

    const hasHardScope =
      !!input.scope?.hard?.docIdAllowlist?.length ||
      !!input.scope?.hard?.filenameMustContain?.length ||
      input.state?.activeDocRef?.lockType === "hard";

    // 2) No docs
    if (docCount <= 0) {
      return { mode: "no_docs", reason: "no_docs_indexed" };
    }

    // 3) Scoped not found: docs exist but scope makes candidates empty
    if (docCount >= 1 && candidateCount === 0 && hasHardScope) {
      return { mode: "scoped_not_found", reason: "no_relevant_in_scoped_doc" };
    }

    // 4) Navigation operators -> nav_pills (terminal)
    if (input.operator === "open") {
      return { mode: "nav_pills", reason: "open_operator", navType: "open" };
    }
    if (input.operator === "locate_file" || input.operator === "where") {
      return { mode: "nav_pills", reason: "locate_file_operator", navType: "where" };
    }
    if (input.operator === "locate_docs" || input.signals?.discoveryQuery === true) {
      const single = topScore >= 0.8 && margin >= 0.08;
      return {
        mode: "nav_pills",
        reason: "document_discovery",
        navType: "discover",
        pillCount: {
          single,
          maxPills: single ? 1 : 5,
          introOverride: single
            ? undefined
            : {
                en: "I found a few matches — which one?",
                pt: "Encontrei algumas opções — qual?",
                es: "Encontré algunas opciones — cuál?",
              },
        },
      };
    }

    // 5) Help
    if (input.intentFamily === "help" || input.operator === "capabilities" || input.operator === "how_to") {
      return { mode: "help_steps", reason: "help_intent" };
    }

    // 6) Quote request
    if (input.signals?.userAskedForQuote === true && input.userPrefs?.noQuotes !== true) {
      return { mode: "doc_grounded_quote", reason: "explicit_quote_request" };
    }

    // 7) Table request or JSON request -> table (never JSON)
    if (input.signals?.userAskedForTable === true || input.signals?.userAskedForJson === true) {
      return { mode: "doc_grounded_table", reason: "table_or_json_request_mapped" };
    }

    // 8) Compare request
    if (input.signals?.userAskedForComparison === true || input.operator === "compare") {
      return { mode: "doc_grounded_multi", reason: "comparison_request" };
    }

    // 9) Disambiguate if ambiguous
    if (candidateCount >= 2) {
      if (margin < 0.03 || topScore < 0.4) {
        return { mode: "rank_disambiguate", reason: "ambiguous_doc_choice", clarify: { reasonCode: "needs_doc_choice" } };
      }
    }

    // 10) Autopick strong
    if (candidateCount >= 1 && topScore >= 0.7 && margin >= 0.05) {
      return { mode: "rank_autopick", reason: "strong_ranking" };
    }

    // 11) Single candidate doc
    if (candidateCount === 1) {
      return { mode: "doc_grounded_single", reason: "single_candidate" };
    }

    // 12) Docs exist default -> doc grounded
    if (docCount >= 1) {
      return { mode: "doc_grounded_single", reason: "docs_available" };
    }

    // 13) Last resort
    return { mode: "general_answer", reason: "fallback" };
  }

  // -----------------------------
  // Hard guardrails applied to any output
  // -----------------------------
  private applyHardGuardrails(out: AnswerModeRouterResult, input: AnswerModeRouterInput): AnswerModeRouterResult {
    // Never doc-grounded if no docs
    if ((input.docContext.docCount ?? 0) <= 0) {
      if (out.mode.startsWith("doc_grounded") || out.mode === "rank_autopick" || out.mode === "rank_disambiguate") {
        return { mode: "no_docs", reason: "no_docs_indexed", debug: out.debug };
      }
    }

    // nav_pills must be terminal + should not fall through to doc modes
    if (out.mode === "nav_pills") {
      // nothing else to do here; QualityGates will enforce pills-only rendering
      return out;
    }

    // scoped_not_found should only happen when docs exist
    if (out.mode === "scoped_not_found" && (input.docContext.docCount ?? 0) <= 0) {
      return { mode: "no_docs", reason: "no_docs_indexed", debug: out.debug };
    }

    return out;
  }
}

// -----------------------------
// Small helper
// -----------------------------
function getPath(obj: any, path: string): any {
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}
