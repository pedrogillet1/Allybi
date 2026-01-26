// src/services/core/answerComposer.service.ts
//
// CLEAN ANSWER COMPOSER (ChatGPT-like formatting + zero hardcoded “answers”)
//
// What this file does (ONLY):
// - Takes a draft answer (from LLM or downstream engines) + routing outcome (answerMode)
// - Applies style policy (short paragraphs, intro+conclusion rules, bullet hygiene)
// - Applies markdown normalization + banned-phrase stripping + smart bolding
// - Attaches sources via source_buttons attachments (never prints “Sources:”)
// - Emits *reason codes* for fallbacks (no_docs / scoped_not_found / refusal) and asks microcopy picker to render
//
// What this file does NOT do:
// - It does not retrieve documents
// - It does not choose which doc to use
// - It does not do “semantic search”
// - It does not hardcode user-visible answers (only pulls from microcopy banks as fragments)
//
// NOTE:
// - Regen uniqueness MUST be driven upstream by passing `regenCount` + `variationSeed` into the LLM prompt.
//   This composer only varies microcopy fragments and optional opener/closer/followup selection.

import type { Attachment } from "../../types/handlerResult.types";
import type { SourceButtonsAttachment } from "./sourceButtons.service";

import { getBank } from "./bankLoader.service";
import { getMarkdownNormalizer } from "./markdownNormalizer.service";
import { getBoldingNormalizer } from "./boldingNormalizer.service";
import { getBoilerplateStripper } from "./boilerplateStripper.service";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

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

export type LanguageCode = "en" | "pt" | "es";

export interface ComposerContext {
  conversationId: string;
  turnId: string;
  regenCount: number; // 0 first answer, 1+ regenerate

  answerMode: AnswerMode;
  operator: string; // summarize, extract, compute, open, locate_docs...
  intentFamily: string; // documents, file_actions, help, conversation...
  domain?: string | null;

  language: LanguageCode;
  originalQuery: string;

  // signals from upstream (query_rewrite, domain_detection, etc.)
  signals?: Record<string, any>;

  // constraints from upstream (format parser, answer_style_policy selection, etc.)
  constraints?: {
    outputShape?: "paragraph" | "bullets" | "steps" | "table" | "file_list" | "button_only";
    exactBulletCount?: number;
    maxSentences?: number;
    userRequestedShort?: boolean;
    userRequestedDetailed?: boolean;
    maxFollowups?: number;
  };

  // doc availability context (used ONLY to decide which fallback bucket to use)
  docContext?: {
    docCount?: number;
    candidateCount?: number;
    hardScopeActive?: boolean; // explicit filename/docId allowlist or hard lock
  };

  // optional: recent microcopy ids for anti-repetition (store in memory service)
  microcopyHistory?: {
    ids: string[]; // last N used ids
    max?: number; // default 12
  };
}

export interface ComposeInput {
  ctx: ComposerContext;

  // The model-produced answer (already doc-grounded by upstream pipeline), OR empty for fallback modes.
  draft?: string;

  // Attachments (source_buttons) produced by retrieval/ranking stage.
  sourceButtons?: SourceButtonsAttachment;

  // Nav routing metadata (used ONLY for nav_pills intro selection)
  navType?: "open" | "where" | "discover" | "disambiguate" | "not_found";

  // Fallback reason codes (so we can pick the right microcopy bank category)
  failureReasonCode?: string; // e.g. scope_hard_constraints_empty | no_relevant_chunks_in_scoped_docs | indexing_in_progress
}

export interface ComposeOutput {
  content: string; // final markdown (no sources printed)
  attachments: Attachment[];
  language: LanguageCode;
  meta: {
    answerMode: AnswerMode;
    operator: string;
    intentFamily: string;
    domain?: string | null;

    profile: StyleProfile;
    plannedBlocks: string[];

    repairsApplied: string[];
    warnings: string[];

    variationSeed: string;
    regenCount: number;
  };
}

// -----------------------------------------------------------------------------
// Banks (minimal contracts used by this service)
// -----------------------------------------------------------------------------

type StyleProfile = "micro" | "brief" | "concise" | "standard" | "detailed" | "deep";

interface AnswerStylePolicyBank {
  _meta: any;
  config: { enabled: boolean; globalRules?: any };
  profiles: Record<
    StyleProfile,
    {
      name: string;
      budget: {
        maxChars: number;
        maxParagraphs: number;
        maxBullets: number;
        maxTableRows: number;
        maxQuoteLines: number;
        maxQuestions: number;
      };
      behavior: { intro: "never" | "always" | "usually"; conclusion: "never" | "always" | "usually"; allowFollowup: boolean };
    }
  >;
  blockPlanner: {
    plansByProfile: Record<StyleProfile, { default: string[] }>;
    operatorOverrides?: Record<string, Partial<Record<StyleProfile, string[]>>>;
  };
  blockRules?: any;
  tests?: any;
}

interface RenderPolicyBank {
  _meta: any;
  config: {
    enabled: boolean;
    sources?: { renderInAnswerBody: boolean };
  };
  navPillsIntro?: Record<string, Record<LanguageCode, string>>;
}

interface MicrocopyBank {
  _meta: any;
  config?: any;
  routing?: any;
  categories?: Record<
    string,
    {
      weight?: number;
      messages?: Array<{ id: string; text: string }>;
      details?: Array<{ id: string; text: string; useOnlyIfProvided?: boolean }>;
      nextSteps?: Array<{ id: string; text: string }>;
    }
  >;
}

// -----------------------------------------------------------------------------
// Seeded variation (deterministic, for regen)
// -----------------------------------------------------------------------------

import * as crypto from "crypto";

function makeVariationSeed(conversationId: string, turnId: string, regenCount: number): string {
  return crypto.createHash("sha256").update(`${conversationId}:${turnId}:${regenCount}`).digest("hex").slice(0, 12);
}

function seededRand(seed: string): () => number {
  let x = parseInt(seed.slice(0, 8), 16) || 123456;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

function seededPick<T>(items: T[], rand: () => number): T {
  if (!items || items.length === 0) throw new Error("seededPick: empty");
  const idx = Math.floor(rand() * items.length);
  return items[idx];
}

// -----------------------------------------------------------------------------
// AnswerComposerService
// -----------------------------------------------------------------------------

export class AnswerComposerService {
  private styleBank: AnswerStylePolicyBank;
  private renderBank?: RenderPolicyBank;

  // microcopy banks (fragments, not hardcoded answers)
  private noDocsBank?: MicrocopyBank;
  private scopedNotFoundBank?: MicrocopyBank;
  private refusalBank?: MicrocopyBank;
  private helpBank?: MicrocopyBank;

  constructor() {
    this.styleBank = getBank<AnswerStylePolicyBank>("answer_style_policy")!;
    this.renderBank = getBank<RenderPolicyBank>("render_policy");

    // microcopy/fallback banks
    this.noDocsBank = getBank<MicrocopyBank>("no_docs_messages");
    this.scopedNotFoundBank = getBank<MicrocopyBank>("scoped_not_found_messages");
    this.refusalBank = getBank<MicrocopyBank>("refusal_phrases");

    // (optional) help microcopy bank if you have one
    this.helpBank = getBank<MicrocopyBank>("conversation_messages");
  }

  compose(input: ComposeInput): ComposeOutput {
    const ctx = input.ctx;
    const variationSeed = makeVariationSeed(ctx.conversationId, ctx.turnId, ctx.regenCount || 0);
    const rand = seededRand(variationSeed);

    const repairsApplied: string[] = [];
    const warnings: string[] = [];

    // 1) Handle special modes first (these must never fall through)
    if (ctx.answerMode === "nav_pills") {
      const { content, attachments } = this.composeNavPills(input, rand);
      return {
        content,
        attachments,
        language: ctx.language,
        meta: {
          answerMode: ctx.answerMode,
          operator: ctx.operator,
          intentFamily: ctx.intentFamily,
          domain: ctx.domain ?? null,
          profile: "micro",
          plannedBlocks: ["nav_intro"],
          repairsApplied,
          warnings,
          variationSeed,
          regenCount: ctx.regenCount || 0,
        },
      };
    }

    if (ctx.answerMode === "refusal") {
      const content = this.composeMicrocopyFallback("refusal", input, rand, repairsApplied, warnings);
      return this.wrap(content, [], ctx, "micro", ["answer_direct"], repairsApplied, warnings, variationSeed);
    }

    if (ctx.answerMode === "no_docs") {
      const content = this.composeMicrocopyFallback("no_docs", input, rand, repairsApplied, warnings);
      return this.wrap(content, [], ctx, "brief", ["answer_direct"], repairsApplied, warnings, variationSeed);
    }

    if (ctx.answerMode === "scoped_not_found") {
      const content = this.composeMicrocopyFallback("scoped_not_found", input, rand, repairsApplied, warnings);
      return this.wrap(content, [], ctx, "brief", ["answer_direct"], repairsApplied, warnings, variationSeed);
    }

    // 2) Determine profile + plan (bank-driven)
    const profile = this.selectProfile(ctx);
    const plannedBlocks = this.planBlocks(profile, ctx.operator);

    // 3) Build draft (no hardcoded “answers”)
    let draft = (input.draft || "").trim();

    // If empty draft in a doc-grounded mode, do not emit “no relevant info found”
    // Route to scoped_not_found microcopy (docs exist) or no_docs (no docs).
    if (this.isDocGroundedMode(ctx.answerMode) && draft.length < 10) {
      warnings.push("EMPTY_DRAFT_DOC_GROUNDED");
      const fallbackMode = (ctx.docContext?.docCount ?? 0) > 0 ? "scoped_not_found" : "no_docs";
      const content = this.composeMicrocopyFallback(fallbackMode, input, rand, repairsApplied, warnings);
      return this.wrap(content, [], ctx, "brief", ["answer_direct"], repairsApplied, warnings, variationSeed);
    }

    // 4) Attach sources via attachments only (never inline)
    const attachments: Attachment[] = [];
    if (input.sourceButtons && input.sourceButtons.buttons?.length) {
      attachments.push(input.sourceButtons as unknown as Attachment);
    }

    // 5) Apply finalization pipeline (strip boilerplate -> normalize markdown -> bullet hygiene -> bolding)
    draft = this.stripBoilerplate(draft, ctx.language, repairsApplied);
    draft = this.stripInlineSourcesLabels(draft, repairsApplied);
    draft = this.normalizeMarkdown(draft, ctx.intentFamily, repairsApplied, warnings);

    // bullet hygiene: 1–3 sentences per bullet, split long bullets
    draft = this.enforceBulletHygiene(draft, repairsApplied);

    // short paragraphs: already enforced by markdownNormalizer, but re-check for safety
    draft = this.enforceShortParagraphs(draft, repairsApplied);

    // smart bolding (numbers + query keywords)
    draft = this.applySmartBolding(draft, ctx, repairsApplied, warnings);

    // budgets (max chars, max bullets)
    draft = this.applyBudgets(draft, profile, repairsApplied);

    // 6) Optionally append 1 follow-up question (text, not pills) if allowed
    const followup = this.pickFollowup(ctx, rand);
    if (followup) {
      draft = `${draft}\n\n${followup}`;
      repairsApplied.push("FOLLOWUP_APPENDED");
    }

    return this.wrap(draft, attachments, ctx, profile, plannedBlocks, repairsApplied, warnings, variationSeed);
  }

  // ---------------------------------------------------------------------------
  // Profile + planning
  // ---------------------------------------------------------------------------

  private selectProfile(ctx: ComposerContext): StyleProfile {
    // Minimal deterministic selection; your intent engine can override this by passing constraints/profile.
    if (ctx.answerMode === "nav_pills") return "micro";

    const short = !!ctx.constraints?.userRequestedShort || !!ctx.constraints?.maxSentences && ctx.constraints.maxSentences <= 3;
    const deep = !!ctx.constraints?.userRequestedDetailed;

    if (short) return "brief";
    if (deep) return "deep";

    // table/numeric default to concise
    if (ctx.operator === "compute" || ctx.signals?.numericIntentStrong || ctx.signals?.userAskedForTable) return "concise";

    // help tends to be brief/concise
    if (ctx.intentFamily === "help") return "concise";

    return "standard";
  }

  private planBlocks(profile: StyleProfile, operator: string): string[] {
    const planner = this.styleBank?.blockPlanner;
    if (!planner) return ["intro", "answer_direct", "conclusion"];

    const op = (operator || "").toLowerCase();
    const override = planner.operatorOverrides?.[op]?.[profile];
    if (override && override.length) return override;

    const base = planner.plansByProfile?.[profile]?.default;
    return base && base.length ? base : ["intro", "answer_direct", "conclusion"];
  }

  private isDocGroundedMode(mode: AnswerMode): boolean {
    return mode.startsWith("doc_grounded") || mode === "rank_autopick" || mode === "rank_disambiguate";
  }

  // ---------------------------------------------------------------------------
  // Nav pills (pills-only; text = single line intro)
  // ---------------------------------------------------------------------------

  private composeNavPills(input: ComposeInput, rand: () => number): { content: string; attachments: Attachment[] } {
    const ctx = input.ctx;
    const navType = input.navType || "open";
    const lang = ctx.language;

    // Intro from render_policy.navPillsIntro (bank-driven)
    const bankIntro = this.renderBank?.navPillsIntro?.[navType]?.[lang];
    const intro = (bankIntro || "Here it is:").trim();

    const attachments: Attachment[] = [];
    if (input.sourceButtons && input.sourceButtons.buttons?.length) {
      attachments.push(input.sourceButtons as unknown as Attachment);
    }

    // If no buttons, still return intro (frontend will show nothing else) – but orchestrator should route not_found
    return { content: intro, attachments };
  }

  // ---------------------------------------------------------------------------
  // Microcopy-based fallbacks (fragments; adaptive but not “hardcoded answers”)
  // ---------------------------------------------------------------------------

  private composeMicrocopyFallback(
    kind: "no_docs" | "scoped_not_found" | "refusal",
    input: ComposeInput,
    rand: () => number,
    repairsApplied: string[],
    warnings: string[]
  ): string {
    const ctx = input.ctx;

    const bank =
      kind === "no_docs"
        ? this.noDocsBank
        : kind === "scoped_not_found"
        ? this.scopedNotFoundBank
        : this.refusalBank;

    if (!bank?.categories) {
      warnings.push(`MISSING_MICROCOPY_BANK:${kind}`);
      // last resort safe text (still not “no relevant info found”)
      return ctx.language === "pt"
        ? "Não consegui completar isso com as informações disponíveis agora."
        : ctx.language === "es"
        ? "No pude completar esto con la información disponible ahora."
        : "I couldn’t complete that with the information available right now.";
    }

    // Determine category: keep simple; your bank can include routing.byState logic too.
    const categoryKey = this.pickFallbackCategory(kind, input);
    const cat = bank.categories[categoryKey] || bank.categories["generic"];

    const message = this.pickMicrocopyLine(cat?.messages, rand, ctx, repairsApplied);
    const next = this.pickMicrocopyLine(cat?.nextSteps, rand, ctx, repairsApplied);

    const assembled = [message, next].filter(Boolean).join(" ").trim();
    return assembled || (message || next || "");
  }

  private pickFallbackCategory(kind: string, input: ComposeInput): string {
    // Use reason codes if present
    const reason = (input.failureReasonCode || "").toLowerCase();

    if (kind === "no_docs") {
      if (reason.includes("indexing")) return "processing";
      if (reason.includes("extraction")) return "failed_extraction";
      return "empty";
    }

    if (kind === "scoped_not_found") {
      if (reason.includes("scope_hard_constraints_empty")) return "scope_excluded";
      if (reason.includes("no_relevant_chunks")) return "scope_excluded";
      return "scope_excluded";
    }

    return "generic";
  }

  private pickMicrocopyLine(
    items: Array<{ id: string; text: string }> | undefined,
    rand: () => number,
    ctx: ComposerContext,
    repairsApplied: string[]
  ): string {
    if (!items || items.length === 0) return "";
    const picked = seededPick(items, rand);
    repairsApplied.push(`MICROCOPY:${picked.id}`);
    return this.localizePlaceholders(picked.text, ctx);
  }

  private localizePlaceholders(text: string, ctx: ComposerContext): string {
    // Minimal placeholder sanitization; your placeholders_and_sanitization pipeline can do more.
    return text
      .replace(/\{\{reasonShort\}\}/g, "")
      .replace(/\{\{nextStep\}\}/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  // ---------------------------------------------------------------------------
  // Finalization steps
  // ---------------------------------------------------------------------------

  private stripBoilerplate(text: string, language: LanguageCode, repairsApplied: string[]): string {
    const stripper = getBoilerplateStripper();
    const result = stripper.strip(text, language === "es" ? "en" : (language as any));
    if (result.modified) repairsApplied.push("BOILERPLATE_STRIPPED");
    return result.modified ? result.text : text;
  }

  private stripInlineSourcesLabels(text: string, repairsApplied: string[]): string {
    const before = text;
    // Never show “Sources:” blocks in body
    const cleaned = before.replace(/\n{0,2}\b(Sources|Fontes|Fuentes)\s*:\s*[\s\S]*$/i, "").trim();
    if (cleaned !== before) repairsApplied.push("INLINE_SOURCES_STRIPPED");
    return cleaned;
  }

  private normalizeMarkdown(text: string, intent: string, repairsApplied: string[], warnings: string[]): string {
    const normalizer = getMarkdownNormalizer();
    const res = normalizer.normalize(text, {
      maxConsecutiveNewlines: 2,
      allowTables: true,
      allowCodeBlocks: false,
      intent,
    });
    repairsApplied.push(...res.repairs.map((r) => `MD:${r}`));
    warnings.push(...res.warnings.map((w) => `MDWARN:${w}`));
    return res.text.trim();
  }

  private enforceShortParagraphs(text: string, repairsApplied: string[]): string {
    // markdownNormalizer already splits long paragraphs; this is a safety re-pass.
    const normalizer = getMarkdownNormalizer();
    const res = normalizer.enforceShortParagraphs(text, 2);
    if (res.repaired) repairsApplied.push("PARAGRAPHS_SPLIT");
    return res.text.trim();
  }

  private enforceBulletHygiene(text: string, repairsApplied: string[]): string {
    // Rule: 1–3 sentences per bullet, split long bullets into multiple bullets.
    const lines = text.split("\n");
    const out: string[] = [];

    const isBullet = (l: string) => /^\s*-\s+/.test(l);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!isBullet(line)) {
        out.push(line);
        continue;
      }

      const item = line.replace(/^\s*-\s+/, "").trim();
      const sentences = splitSentences(item);

      // Split by sentence count first
      if (sentences.length > 3) {
        repairsApplied.push("BULLET_SPLIT_SENTENCES");
        const chunks = chunkByCount(sentences, 3).map((chunk) => chunk.join(" ").trim());
        for (const c of chunks) out.push(`- ${c}`);
        continue;
      }

      // Split by char length if needed
      if (item.length > 320) {
        repairsApplied.push("BULLET_SPLIT_CHARS");
        const chunks = chunkByChars(sentences.length ? sentences : [item], 320);
        for (const c of chunks) out.push(`- ${c}`);
        continue;
      }

      out.push(`- ${item}`);
    }

    return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  private applySmartBolding(text: string, ctx: ComposerContext, repairsApplied: string[], warnings: string[]): string {
    // No bolding for nav_pills (handled earlier).
    const bolding = getBoldingNormalizer();

    // Max bold items: slightly higher for dense domains
    let maxBoldItems = 12;
    if (ctx.constraints?.userRequestedShort) maxBoldItems = 8;
    if (ctx.constraints?.userRequestedDetailed) maxBoldItems = 14;
    if (ctx.domain === "medical" || ctx.domain === "personal_docs") maxBoldItems = 10;

    const before = text;
    const smart = bolding.smartBold(before, maxBoldItems, ctx.originalQuery);

    const norm = bolding.normalize(smart, {
      maxBoldSegmentsPerKChars: 12,
      maxBoldSegmentLength: 60,
      allowBoldInTables: false,
      allowBoldHeaders: true,
    });

    repairsApplied.push(...norm.repairs.map((r) => `BOLD:${r}`));
    warnings.push(...norm.warnings.map((w) => `BOLDWARN:${w}`));

    return norm.text.trim();
  }

  private applyBudgets(text: string, profile: StyleProfile, repairsApplied: string[]): string {
    const budget = this.styleBank?.profiles?.[profile]?.budget;
    if (!budget) return text;

    let out = text;

    // Cap bullets count (only trim if excessive; never expand)
    const bulletLines = out.match(/^\s*-\s+.+$/gm) || [];
    if (bulletLines.length > budget.maxBullets) {
      repairsApplied.push("BUDGET_TRIM_BULLETS");
      // keep first N bullets, preserve rest of text outside bullet blocks
      out = trimBulletListsToMax(out, budget.maxBullets);
    }

    // Cap chars (hard)
    if (out.length > budget.maxChars) {
      repairsApplied.push("BUDGET_TRIM_CHARS");
      out = out.slice(0, budget.maxChars).trim();
      // end at last sentence if possible
      const m = out.match(/[\s\S]*[.!?](?=\s|$)/);
      if (m) out = m[0].trim();
    }

    return out.trim();
  }

  private pickFollowup(ctx: ComposerContext, rand: () => number): string | null {
    // Only for doc-grounded modes and when allowed
    const allow = this.styleBank?.profiles?.[this.selectProfile(ctx)]?.behavior?.allowFollowup ?? true;
    if (!allow) return null;
    if (ctx.answerMode === "nav_pills") return null;

    const max = ctx.constraints?.maxFollowups ?? 1;
    if (max <= 0) return null;

    // Keep followups *text-only* and generic enough to not be “hardcoded answers”.
    // You should ideally pull these from followup_templates bank; this is a minimal placeholder.
    const lang = ctx.language;

    const pool =
      lang === "pt"
        ? ["Quer que eu aponte onde isso aparece no documento?", "Quer que eu resuma só os pontos principais?"]
        : lang === "es"
        ? ["¿Quieres que te indique dónde aparece eso en el documento?", "¿Quieres un resumen solo con los puntos clave?"]
        : ["Want me to point to where this appears in the document?", "Want a shorter summary of just the key points?"];

    return seededPick(pool, rand);
  }

  // ---------------------------------------------------------------------------
  // Output wrapper
  // ---------------------------------------------------------------------------

  private wrap(
    content: string,
    attachments: Attachment[],
    ctx: ComposerContext,
    profile: StyleProfile,
    plannedBlocks: string[],
    repairsApplied: string[],
    warnings: string[],
    variationSeed: string
  ): ComposeOutput {
    // Final safety cleanup: no triple blank lines
    const finalContent = (content || "").replace(/\n{3,}/g, "\n\n").trim();

    return {
      content: finalContent,
      attachments,
      language: ctx.language,
      meta: {
        answerMode: ctx.answerMode,
        operator: ctx.operator,
        intentFamily: ctx.intentFamily,
        domain: ctx.domain ?? null,
        profile,
        plannedBlocks,
        repairsApplied,
        warnings,
        variationSeed,
        regenCount: ctx.regenCount || 0,
      },
    };
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function splitSentences(text: string): string[] {
  // Lightweight sentence splitter. Keeps abbreviations imperfectly; that’s okay for bullet hygiene.
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function chunkByCount<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function chunkByChars(sentences: string[], maxChars: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if (!cur) {
      cur = s;
      continue;
    }
    const next = `${cur} ${s}`.trim();
    if (next.length <= maxChars) {
      cur = next;
    } else {
      out.push(cur);
      cur = s;
    }
  }
  if (cur) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

function trimBulletListsToMax(text: string, maxBullets: number): string {
  const lines = text.split("\n");
  const out: string[] = [];

  let inBullets = false;
  let bulletsKept = 0;

  for (const line of lines) {
    const isBullet = /^\s*-\s+/.test(line);

    if (isBullet) {
      inBullets = true;
      if (bulletsKept < maxBullets) {
        out.push(line);
        bulletsKept++;
      }
      continue;
    }

    // leaving bullet block
    if (inBullets && line.trim() === "") {
      inBullets = false;
      out.push(line);
      continue;
    }

    // normal line
    out.push(line);
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
