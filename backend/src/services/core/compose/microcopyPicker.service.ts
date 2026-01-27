// microcopyPicker.service.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Koda Microcopy Picker (ChatGPT-parity, uniqueness-first)
 * -------------------------------------------------------
 * This service selects microcopy *tokens and fragment intents* from your microcopy banks
 * WITHOUT hardcoding user-facing sentences in code.
 *
 * It is responsible for:
 *  - Deterministic selection of semantic UI tokens and fragment intents
 *  - Anti-repetition across turns (cooldowns, entropy window, dedupe keys)
 *  - Mode compliance:
 *      - nav_pills => intro-only, no sources header, no actions, no extra body text
 *      - doc-grounded => short intro + optional next-step fragment + optional soft close
 *      - conversation => minimal, no fallback fragments
 *  - Language selection compatibility:
 *      - outputLanguage can be en/pt/es/any; actual rendering is handled downstream
 *
 * It does NOT:
 *  - produce final text
 *  - embed literal phrases
 *  - violate your "no hardcoded copy" rule
 *
 * Instead it outputs a MicrocopyPlan that the renderer realizes using:
 *  - ui_copy_tokens.any.json (token dictionary / realization rules)
 *  - ui_next_step_suggestion.any.json (fragment intents)
 *  - ui_soft_close.any.json (fragment intents)
 *  - nav_microcopy.any.json, file_actions_microcopy.any.json, disambiguation_microcopy.any.json, etc.
 *
 * NOTE:
 * This file assumes you already keep anti-repetition state in conversation_state.history.recentTokens
 * and recentFallbacks.
 */

import crypto from "crypto";

type EnvName = "production" | "staging" | "dev" | "local";
type LangCode = "any" | "en" | "pt" | "es";
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

export interface BankLoader {
  getBank<T = any>(bankId: string): T;
}

export interface ConversationStateLike {
  session: { env: EnvName };
  persistent: {
    preferences?: { language?: LangCode };
    scope: { hardDocLock: boolean; activeDocId: string | null };
  };
  history: {
    recentTokens: string[];
    recentFallbacks: Array<{ reasonCode: string; fallbackType: string; strategy: string; turnId: number }>;
  };
  ephemeral: {
    turn: { turnId: number };
  };
}

export interface MicrocopyContext {
  env: EnvName;
  outputLanguage: LangCode;

  answerMode: AnswerMode;
  intentFamily?: string | null;
  operator?: string | null;
  operatorFamily?: string | null;

  // Used for selecting fallback/disambiguation microcopy tokens
  fallback?: {
    triggered: boolean;
    reasonCode?: string | null;
    fallbackType?: string | null;
    strategy?: string | null;
  };

  disambiguation?: {
    active: boolean;
    candidateType?: "document" | "sheet" | "operator" | null;
    optionCount?: number | null;
  };

  // UI constraints / flags
  isFollowup?: boolean;
  hasEvidence?: boolean;

  // Ensure no user-facing "sources header"
  suppressSourcesHeader?: boolean;

  // Ensure no actions in nav_pills
  suppressActions?: boolean;

  // For uniqueness control
  seedKey?: string | null; // optional deterministic seed from orchestrator (sessionId/turnId)
}

export interface FragmentSelection {
  bankId: string;
  fragmentIntent: string;
  selectorKey: string;
  constraints?: Record<string, any>;
}

export interface MicrocopyPlan {
  // Tokens to be realized by ui_copy_tokens + other microcopy banks (not full sentences here)
  uiTokens: string[];

  // Fragment intents (for fragment banks)
  fragments: FragmentSelection[];

  // Mode-specific notes for renderer (not user-visible)
  renderHints: {
    introOnly: boolean;
    maxIntroSentences: number;
    maxQuestions: number;
    suppressSourcesHeader: boolean;
    suppressActions: boolean;
  };

  // Tokens to record for anti-repetition
  recordTokens: string[];

  debug?: {
    selectedBy: string[];
    rejectedBy: string[];
    seed: string;
  };
}

// --------------------
// Helpers
// --------------------

function isProd(env: EnvName): boolean {
  return env === "production";
}

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function safeBool(x: any): boolean {
  return x === true;
}

function normalizeToken(s: string): string {
  return (s ?? "").trim();
}

/**
 * Deterministic pseudo-random selection from a list using a seed.
 * This is NOT cryptographic randomness; it is for stable variation.
 */
function pickBySeed<T>(items: T[], seed: string): T | null {
  if (!items.length) return null;
  const h = sha256(seed);
  const n = parseInt(h.slice(0, 8), 16);
  return items[n % items.length];
}

// --------------------
// Service
// --------------------

export class MicrocopyPickerService {
  constructor(private readonly bankLoader: BankLoader) {}

  buildPlan(state: ConversationStateLike, ctx: MicrocopyContext): MicrocopyPlan {
    const debug = { selectedBy: [] as string[], rejectedBy: [] as string[], seed: "" };

    // Load relevant banks (soft)
    const uiTokensBank = this.safeGetBank<any>("ui_copy_tokens");
    const navMicrocopy = this.safeGetBank<any>("nav_microcopy");
    const fileActionsMicrocopy = this.safeGetBank<any>("file_actions_microcopy");
    const disambigMicrocopy = this.safeGetBank<any>("disambiguation_microcopy");
    const nextStepBank = this.safeGetBank<any>("ui_next_step_suggestion");
    const softCloseBank = this.safeGetBank<any>("ui_soft_close");

    // Variation controls (default if bank missing)
    const entropyWindow = Number(uiTokensBank?.config?.variationControl?.entropyWindow ?? 7);
    const cooldownTurns = Number(uiTokensBank?.config?.variationControl?.cooldownTurns ?? 3);

    const turnId = state.ephemeral?.turn?.turnId ?? 0;
    const seedBase =
      ctx.seedKey ??
      `${state.session.env}|t:${turnId}|m:${ctx.answerMode}|op:${ctx.operator ?? ""}|fb:${ctx.fallback?.reasonCode ?? ""}`;
    debug.seed = seedBase;

    // Render hints (strict)
    const isNav = ctx.answerMode === "nav_pills";
    const introOnly = isNav; // nav mode: intro only
    const maxIntroSentences = isNav ? 1 : 2;
    const maxQuestions = 1;

    const suppressSourcesHeader = ctx.suppressSourcesHeader ?? isNav;
    const suppressActions = ctx.suppressActions ?? true;

    // Build candidates
    const uiTokens: string[] = [];
    const fragments: FragmentSelection[] = [];
    const recordTokens: string[] = [];

    // -----------------------------
    // 1) Mode-specific base tokens
    // -----------------------------

    if (isNav) {
      // Nav pills: use nav_microcopy intent token only; no extra fragments
      debug.selectedBy.push("mode:nav_pills");
      uiTokens.push("ui_nav_intro");
      uiTokens.push(this.navTypeToken(ctx, navMicrocopy) ?? "ui_nav_generic");

      // Ensure no additional fragments in nav
      debug.rejectedBy.push("fragments:suppressed_in_nav");
    } else if (ctx.disambiguation?.active) {
      // Disambiguation: token for option selection prompt, no long copy
      debug.selectedBy.push("mode:disambiguation");
      uiTokens.push("ui_disambiguation_intro");
      uiTokens.push("ui_variant_confirmation_prompt");
    } else if (ctx.fallback?.triggered) {
      // Fallback: neutral intro token + next-step fragment intent token
      debug.selectedBy.push("mode:fallback");
      uiTokens.push("ui_intro_neutral");
      uiTokens.push("ui_next_step_suggestion");
    } else if (ctx.operatorFamily === "conversation") {
      // Conversation: minimal
      debug.selectedBy.push("mode:conversation");
      uiTokens.push("ui_conversation_minimal");
    } else {
      // Default doc-grounded: intro + optional soft close
      debug.selectedBy.push("mode:doc_grounded_default");
      uiTokens.push("ui_intro_neutral");
    }

    // ----------------------------------------
    // 2) Add fragments (next steps / soft close)
    // ----------------------------------------

    if (!isNav && ctx.fallback?.triggered) {
      // Next-step fragment intent based on reason code
      const reason = ctx.fallback.reasonCode ?? "grounding_fail_soft";
      const fragmentIntent = this.nextStepFragmentIntent(reason);

      const selectorKey = `next:${reason}:${fragmentIntent}`;
      fragments.push({
        bankId: "ui_next_step_suggestion",
        fragmentIntent,
        selectorKey: this.rotateSelectorKeyIfRepeated(state, selectorKey, cooldownTurns),
        constraints: {
          maxSentences: 1,
          maxQuestions: 1,
          avoidTimeEstimates: reason === "indexing_in_progress",
          mustNotAssertAbsence: reason === "scope_hard_constraints_empty" || reason === "no_relevant_chunks_in_scoped_docs"
        }
      });

      recordTokens.push(`ui_next_step_suggestion:${reason}:${fragmentIntent}`);
    }

    // Soft close is allowed only when not fallback/disambiguation and not nav and not conversation
    const allowSoftClose =
      !isNav &&
      !ctx.fallback?.triggered &&
      !ctx.disambiguation?.active &&
      ctx.operatorFamily !== "conversation";

    if (allowSoftClose) {
      const selectorKey = `close:${ctx.answerMode}:${ctx.operator ?? "generic"}`;
      fragments.push({
        bankId: "ui_soft_close",
        fragmentIntent: "soft_close",
        selectorKey: this.rotateSelectorKeyIfRepeated(state, selectorKey, cooldownTurns),
        constraints: { maxSentences: 1, mustNotAskQuestion: true }
      });

      recordTokens.push(`ui_soft_close:${ctx.answerMode}`);
    }

    // ----------------------------------------
    // 3) Anti-repetition (tokens + fragments)
    // ----------------------------------------

    const { finalTokens, changed } = this.applyTokenAntiRepetition(state, uiTokens, seedBase, cooldownTurns);
    if (changed) debug.selectedBy.push("anti_repetition:tokens_rotated");

    // Record final tokens
    for (const t of finalTokens) recordTokens.push(`ui_token:${t}`);

    // Deduplicate final tokens
    const finalUiTokens = uniq(finalTokens.map(normalizeToken).filter(Boolean));

    const plan: MicrocopyPlan = {
      uiTokens: finalUiTokens,
      fragments,
      renderHints: {
        introOnly,
        maxIntroSentences,
        maxQuestions,
        suppressSourcesHeader,
        suppressActions
      },
      recordTokens: uniq(recordTokens),
      debug: isProd(ctx.env) ? undefined : debug
    };

    return plan;
  }

  // -----------------------------
  // Nav type token resolution
  // -----------------------------

  private navTypeToken(ctx: MicrocopyContext, navMicrocopy: any | null): string | null {
    // If nav_microcopy defines nav types, prefer them; else infer from operator/intent.
    const op = (ctx.operator ?? "").toLowerCase();
    const intent = (ctx.intentFamily ?? "").toLowerCase();

    // Minimal inference (no hardcoded phrases): only return semantic token keys.
    if (op === "open" || /open/.test(op)) return "ui_nav_open";
    if (op === "locate_file") return "ui_nav_where";
    if (op === "locate_docs" || intent === "doc_discovery") return "ui_nav_discover";

    // If answerMode is nav and operator unknown, generic nav token
    return "ui_nav_generic";
  }

  // -----------------------------
  // Next step fragment intent resolution
  // -----------------------------

  private nextStepFragmentIntent(reasonCode: string): string {
    // Must match fragment intents used in ui_next_step_suggestion.any.json
    switch (reasonCode) {
      case "scope_hard_constraints_empty":
        return "scope_adjustment";
      case "no_relevant_chunks_in_scoped_docs":
        return "variant_or_expand";
      case "extraction_failed":
        return "extraction_recovery";
      case "indexing_in_progress":
      case "no_docs_indexed":
        return "indexing_wait_or_retry";
      case "low_confidence":
        return "rephrase_or_specify";
      case "numeric_truncation_detected":
      case "numeric_not_in_source":
        return "numeric_recheck";
      case "hallucination_risk_high":
        return "tighten_grounding";
      default:
        return "guide_next_step";
    }
  }

  // -----------------------------
  // Anti-repetition helpers
  // -----------------------------

  private rotateSelectorKeyIfRepeated(state: ConversationStateLike, selectorKey: string, cooldownTurns: number): string {
    const recentTokens = state.history?.recentTokens ?? [];
    // If the selectorKey was used recently, rotate with a deterministic suffix.
    const wasUsed = recentTokens.some(t => t.includes(selectorKey));
    if (!wasUsed) return selectorKey;

    const turnId = state.ephemeral?.turn?.turnId ?? 0;
    const suffix = sha256(`${selectorKey}|t:${turnId}`).slice(0, 6);
    return `${selectorKey}:alt:${suffix}`;
  }

  private applyTokenAntiRepetition(
    state: ConversationStateLike,
    tokens: string[],
    seedBase: string,
    cooldownTurns: number
  ): { finalTokens: string[]; changed: boolean } {
    const recent = state.history?.recentTokens ?? [];
    const turnId = state.ephemeral?.turn?.turnId ?? 0;

    // If any token appears too recently, rotate a secondary token (keep meaning stable).
    const finalTokens = [...tokens];
    let changed = false;

    for (let i = 0; i < finalTokens.length; i++) {
      const t = finalTokens[i];
      const key = `ui_token:${t}`;

      // Heuristic: if token appears in recentTokens within window, substitute a sibling token.
      const seen = recent.includes(key);
      if (!seen) continue;

      // Stable sibling mapping: same semantic role but different realization path in ui_copy_tokens
      const sibling = this.siblingToken(t, seedBase, turnId);
      if (sibling && sibling !== t) {
        finalTokens[i] = sibling;
        changed = true;
      }
    }

    return { finalTokens, changed };
  }

  private siblingToken(token: string, seedBase: string, turnId: number): string | null {
    // Small semantic-preserving alternatives.
    // These are token keys, not phrases.
    const siblings: Record<string, string[]> = {
      ui_intro_neutral: ["ui_intro_neutral", "ui_intro_direct", "ui_intro_compact"],
      ui_next_step_suggestion: ["ui_next_step_suggestion", "ui_next_step_prompt"],
      ui_disambiguation_intro: ["ui_disambiguation_intro", "ui_disambiguation_compact"],
      ui_nav_intro: ["ui_nav_intro", "ui_nav_intro_compact"],
      ui_conversation_minimal: ["ui_conversation_minimal", "ui_conversation_ack"]
    };

    const list = siblings[token] ?? null;
    if (!list || list.length <= 1) return null;

    const pick = pickBySeed(list, `${seedBase}|tok:${token}|t:${turnId}`);
    return pick ?? token;
  }

  // -----------------------------
  // Bank loader safety
  // -----------------------------

  private safeGetBank<T = any>(bankId: string): T | null {
    try {
      return this.bankLoader.getBank<T>(bankId);
    } catch {
      return null;
    }
  }
}
