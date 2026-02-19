// src/services/core/responseContractEnforcer.service.ts
//
// RESPONSE CONTRACT ENFORCER (ChatGPT-like)
// ------------------------------------------------------------
// Purpose:
// - Enforce the *output contract* BEFORE returning anything to the user.
// - Prevent UI/UX regressions: "Sources:" leakage, inline file lists in nav_pills,
//   JSON/code blocks, broken bullets/tables, excessive length, etc.
// - Keep it bank-driven: render_policy + ui_contracts + formatting policies.
//
// This service should be called in the final stage of orchestrator, AFTER:
// - answer_mode_router decided answerMode
// - answerComposer produced content + attachments
// - render_policy normalized markdown blocks
// - quality_gates potentially modified/replaced content
//
// Inputs: draft response + context
// Outputs: enforced response (content + attachments) + enforcement trace
//
// Banks used:
// - formatting/render_policy.any.json          (block rules + sources contract)
// - overlays/ui_contracts.any.json            (frontend UI rules)
// - formatting/banned_phrases.any.json        (source leakage patterns, robotic phrases)
// - formatting/truncation_and_limits.any.json (max length/blocks)
// - formatting/bullet_rules.any.json          (bullet hygiene)
// - formatting/table_rules.any.json           (table hygiene)
//
// IMPORTANT:
// - This is NOT where you generate different wording. This is "last mile compliance".
// - Never invent data. Only transform formatting or strip invalid parts.
// - If enforcement makes answer empty, return a safe fallback with reasonCode
//   (let fallback engine decide the microcopy).

import type { Attachment } from "../../../types/handlerResult.types";
import { getBank } from "../banks/bankLoader.service";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type AnswerMode =
  | "nav_pills"
  | "doc_grounded_single"
  | "doc_grounded_table"
  | "doc_grounded_quote"
  | "doc_grounded_multi"
  | "doc_discovery_list"
  | "rank_disambiguate"
  | "rank_autopick"
  | "help_steps"
  | "no_docs"
  | "scoped_not_found"
  | "refusal"
  | "general_answer"
  | string;

export interface ResponseContractContext {
  answerMode: AnswerMode;
  navType?:
    | "open"
    | "where"
    | "discover"
    | "disambiguate"
    | "not_found"
    | string;
  language: "en" | "pt" | "es";
  operator?: string;
  intentFamily?: string;

  constraints?: {
    maxChars?: number;
    maxSentences?: number;
    exactBulletCount?: number;
    outputShape?:
      | "paragraph"
      | "bullets"
      | "numbered_list"
      | "table"
      | "file_list"
      | "button_only";
    userRequestedShort?: boolean;
  };

  signals?: Record<string, unknown>;
}

export interface DraftResponse {
  content: string;
  attachments?: Attachment[];
}

export interface EnforcedResponse {
  content: string;
  attachments: Attachment[];
  enforcement: {
    repairs: string[];
    warnings: string[];
    blocked: boolean;
    reasonCode?: string;
  };
}

// -----------------------------------------------------------------------------
// Bank contracts (tolerant)
// -----------------------------------------------------------------------------

type RenderPolicyBank = {
  _meta: unknown;
  config?: {
    enabled?: boolean;
    markdown?: {
      allowCodeBlocks?: boolean;
      bulletMarker?: string;
      maxConsecutiveNewlines?: number;
    };
    sourcesUIContract?: Record<
      string,
      {
        showSourcesLabel?: boolean;
        showDivider?: boolean;
        pillsOnly?: boolean;
        maxPills?: number;
      }
    >;
    followupUIContract?: Record<string, unknown>;
    noJsonOutput?: { enabled?: boolean; detectJsonLike?: boolean };
  };
  enforcementRules?: { rules?: Array<unknown> };
};

type UIContractsBank = {
  _meta: unknown;
  config?: { enabled?: boolean };
  // optional, depends on your design
  sources?: {
    nav_pills?: {
      hideLabel?: boolean;
      hideDivider?: boolean;
      pillsOnly?: boolean;
    };
    default?: { showLabel?: boolean; showDivider?: boolean };
  };
};

type BannedPhrasesBank = {
  _meta: unknown;
  sourceLeakage?: { patterns?: string[] };
  robotic?: Record<"en" | "pt" | "es", string[]>;
};

type TruncationLimitsBank = {
  _meta: unknown;
  config?: {
    maxCharsHard?: number;
    maxSentencesHard?: number;
  };
};

type BulletRulesBank = {
  _meta: unknown;
  config?: {
    enabled?: boolean;
    bulletMarker?: "-" | "*" | "•";
    maxSentencesPerBullet?: number;
    maxCharsPerBullet?: number;
  };
};

type TableRulesBank = {
  _meta: unknown;
  config?: {
    enabled?: boolean;
    strictGfm?: boolean;
    maxColumnsBeforeWrap?: number;
  };
};

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function normalizeNewlines(text: string, maxConsecutive: number = 2): string {
  let t = (text || "").replace(/\r\n/g, "\n");
  const re = new RegExp(`\\n{${maxConsecutive + 1},}`, "g");
  t = t.replace(re, "\n".repeat(maxConsecutive));
  return t.trim();
}

function stripInlineSourcesSections(text: string): {
  text: string;
  changed: boolean;
} {
  let t = text;
  const before = t;

  // common "Sources:" blocks
  t = t.replace(/\n{0,2}^\s*(Sources|Fontes|Fuentes)\s*:\s*$/gim, "");
  // remove any trailing "Sources:" + following lines that look like filenames/ids
  t = t.replace(
    /\n{0,2}^\s*(Sources|Fontes|Fuentes)\s*:\s*\n([\s\S]{0,800})$/gim,
    (m, _label, body) => {
      // Only strip if the body is mostly file-like lines
      const lines = String(body).split("\n").slice(0, 12);
      const fileish = lines.filter((l) =>
        /\.(pdf|xlsx?|docx?|pptx?|csv|txt|png|jpe?g)\b/i.test(l),
      ).length;
      if (fileish >= 1) return "\n";
      return m;
    },
  );

  return { text: t.trim(), changed: t.trim() !== before.trim() };
}

function stripInlineFileLists(text: string): {
  text: string;
  changed: boolean;
} {
  const before = text;

  // Remove bullet/numbered lists containing filenames
  const lines = text.split("\n");
  const out: string[] = [];

  for (const line of lines) {
    const isListLine =
      /^\s*[-*]\s+.+\.(pdf|xlsx?|docx?|pptx?|csv|txt|png|jpe?g)\b/i.test(
        line,
      ) ||
      /^\s*\d+\.\s+.+\.(pdf|xlsx?|docx?|pptx?|csv|txt|png|jpe?g)\b/i.test(line);

    if (!isListLine) out.push(line);
  }

  const after = out.join("\n").trim();
  return { text: after, changed: after !== before.trim() };
}

function detectJsonLike(text: string): boolean {
  const t = text.trim();
  if (/^\s*```json\b/i.test(t)) return true;
  if (/^\s*\{\s*"/.test(t)) return true;
  if (/^\s*\[\s*\{/.test(t)) return true;
  return false;
}

function stripCodeFences(text: string): { text: string; changed: boolean } {
  const before = text;
  let t = text;

  // remove fenced code blocks entirely (ChatGPT-like for your constraints)
  t = t.replace(/```[\s\S]*?```/g, (m) => {
    // keep content but strip fences if needed
    const inner = m
      .replace(/```[a-z]*\n?/gi, "")
      .replace(/```/g, "")
      .trim();
    return inner ? inner : "";
  });

  return { text: t.trim(), changed: t.trim() !== before.trim() };
}

function countSentences(text: string): number {
  const m = text.match(/[.!?]+(?:\s|$)/g);
  return m ? m.length : 0;
}

function limitChars(
  text: string,
  maxChars: number,
): { text: string; changed: boolean } {
  const t = text.trim();
  if (t.length <= maxChars) return { text: t, changed: false };
  // Trim to last sentence boundary within limit
  const slice = t.slice(0, maxChars);
  const lastPunct = Math.max(
    slice.lastIndexOf("."),
    slice.lastIndexOf("!"),
    slice.lastIndexOf("?"),
  );
  if (lastPunct > 80)
    return { text: slice.slice(0, lastPunct + 1).trim(), changed: true };
  return { text: slice.trim(), changed: true };
}

function keepFirstSentence(text: string, maxChars: number = 90): string {
  const t = text.trim();
  if (!t) return "";
  // sentence split
  const parts = t.split(/(?<=[.!?])\s+/);
  const first = parts[0] || t;
  return first.length > maxChars
    ? first.slice(0, maxChars).trim()
    : first.trim();
}

function getSourceButtonsCount(attachments: Attachment[] = []): number {
  return attachments.filter(
    (a) => a && (a as Record<string, unknown>).type === "source_buttons",
  ).length;
}

// -----------------------------------------------------------------------------
// Main Service
// -----------------------------------------------------------------------------

export class ResponseContractEnforcerService {
  private renderPolicy?: RenderPolicyBank;
  private uiContracts?: UIContractsBank;
  private bannedPhrases?: BannedPhrasesBank;
  private truncation?: TruncationLimitsBank;
  private bulletRules?: BulletRulesBank;
  private tableRules?: TableRulesBank;

  constructor() {
    this.reloadBanks();
  }

  reloadBanks(): void {
    this.renderPolicy = getBank<RenderPolicyBank>("render_policy");
    this.uiContracts = getBank<UIContractsBank>("ui_contracts");
    this.bannedPhrases = getBank<BannedPhrasesBank>("banned_phrases");
    this.truncation = getBank<TruncationLimitsBank>("truncation_and_limits");
    this.bulletRules = getBank<BulletRulesBank>("bullet_rules");
    this.tableRules = getBank<TableRulesBank>("table_rules");
  }

  enforce(
    draft: DraftResponse,
    ctx: ResponseContractContext,
  ): EnforcedResponse {
    const repairs: string[] = [];
    const warnings: string[] = [];
    const attachments: Attachment[] = Array.isArray(draft.attachments)
      ? draft.attachments
      : [];
    let content = draft.content || "";

    // 0) Normalize whitespace/newlines
    const maxNL =
      this.renderPolicy?.config?.markdown?.maxConsecutiveNewlines ?? 2;
    content = normalizeNewlines(content, maxNL);

    // 1) nav_pills contract
    if (ctx.answerMode === "nav_pills") {
      // No inline sources headers or lists
      const s1 = stripInlineSourcesSections(content);
      if (s1.changed) repairs.push("STRIPPED_INLINE_SOURCES_HEADER");
      content = s1.text;

      const s2 = stripInlineFileLists(content);
      if (s2.changed) repairs.push("STRIPPED_INLINE_FILE_LIST");
      content = s2.text;

      // Max 1 sentence, max 90 chars
      const intro = keepFirstSentence(content, 90);
      if (intro !== content) repairs.push("NAV_PILLS_BODY_TRIMMED");
      content = intro;

      // Must have source_buttons attachment (otherwise downstream fallback engine handles)
      if (getSourceButtonsCount(attachments) < 1) {
        return {
          content: content || this.navNotFoundLine(ctx.language),
          attachments,
          enforcement: {
            repairs,
            warnings: [...warnings, "NAV_PILLS_MISSING_SOURCE_BUTTONS"],
            blocked: true,
            reasonCode: "nav_pills_missing_buttons",
          },
        };
      }

      return {
        content,
        attachments,
        enforcement: { repairs, warnings, blocked: false },
      };
    }

    // 2) Strip "Sources:" leakage (all non-nav modes)
    {
      const s = stripInlineSourcesSections(content);
      if (s.changed) repairs.push("STRIPPED_INLINE_SOURCES");
      content = s.text;
    }

    // 3) Remove code fences + JSON output (Koda never outputs code blocks)
    const allowCode =
      this.renderPolicy?.config?.markdown?.allowCodeBlocks ?? false;
    if (!allowCode) {
      const s = stripCodeFences(content);
      if (s.changed) repairs.push("STRIPPED_CODE_FENCES");
      content = s.text;
    }
    if (
      this.renderPolicy?.config?.noJsonOutput?.enabled !== false &&
      detectJsonLike(content)
    ) {
      // We don't "convert" here (composer should). We block or strip JSON-ish
      // and let quality gates or composer re-run.
      warnings.push("JSON_LIKE_DETECTED");
      content = content.replace(/```json[\s\S]*?```/gi, "").trim();
      if (detectJsonLike(content)) {
        // still JSON-ish
        return {
          content: "",
          attachments,
          enforcement: {
            repairs,
            warnings,
            blocked: true,
            reasonCode: "json_not_allowed",
          },
        };
      }
      repairs.push("JSON_STRIPPED");
    }

    // 4) Enforce short constraints (if user requested short)
    if (
      ctx.constraints?.userRequestedShort ||
      (ctx.constraints?.maxSentences && ctx.constraints.maxSentences <= 3)
    ) {
      const maxChars = ctx.constraints?.maxChars ?? 420;
      const limited = limitChars(content, maxChars);
      if (limited.changed) repairs.push("SHORT_CONSTRAINT_TRIMMED_CHARS");
      content = limited.text;

      const sent = countSentences(content);
      if (sent > 3) {
        // keep first 3 sentences
        const parts = content.split(/(?<=[.!?])\s+/);
        content = parts.slice(0, 3).join(" ").trim();
        repairs.push("SHORT_CONSTRAINT_TRIMMED_SENTENCES");
      }
    }

    // 5) Hard max length (safety)
    const hardMaxChars = this.truncation?.config?.maxCharsHard ?? 4200;
    const hardLimited = limitChars(content, hardMaxChars);
    if (hardLimited.changed) repairs.push("HARD_MAX_CHARS_TRIMMED");
    content = hardLimited.text;

    // 6) Remove banned leakage patterns (source leakage regexes, etc.)
    const leakagePatterns = this.bannedPhrases?.sourceLeakage?.patterns || [];
    for (const pat of leakagePatterns) {
      try {
        const re = new RegExp(pat, "gi");
        if (re.test(content)) {
          content = content.replace(re, "").trim();
          repairs.push("SOURCE_LEAKAGE_PATTERN_STRIPPED");
        }
      } catch {
        // ignore invalid regex from bank
      }
    }

    // Final normalize
    content = normalizeNewlines(content, maxNL);

    // If content became empty in a mode where content is required, flag
    if (!content && ctx.answerMode !== "refusal") {
      return {
        content: "",
        attachments,
        enforcement: {
          repairs,
          warnings: [...warnings, "EMPTY_AFTER_ENFORCEMENT"],
          blocked: true,
          reasonCode: "empty_after_contract_enforcement",
        },
      };
    }

    return {
      content,
      attachments,
      enforcement: { repairs, warnings, blocked: false },
    };
  }

  private navNotFoundLine(lang: "en" | "pt" | "es"): string {
    if (lang === "pt") return "Não encontrei esse arquivo.";
    if (lang === "es") return "No encontré ese archivo.";
    return "I couldn't find that file.";
  }
}

// Singleton
let instance: ResponseContractEnforcerService | null = null;
export function getResponseContractEnforcer(): ResponseContractEnforcerService {
  if (!instance) instance = new ResponseContractEnforcerService();
  return instance;
}
