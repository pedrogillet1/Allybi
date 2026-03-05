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
import { getBank, getOptionalBank } from "../banks/bankLoader.service";
import {
  UIContractsSchema,
  UIReceiptShapesSchema,
} from "../banks/bankSchemas";
import type { ChatProvenanceDTO } from "../../../modules/chat/domain/chat.contracts";
import { validateChatProvenance } from "../../../modules/chat/runtime/provenance/ProvenanceValidator";
import {
  estimateTokenCount,
  resolveOutputTokenBudget,
  trimTextToTokenBudget,
} from "./tokenBudget.service";
import {
  countSentences,
  detectJsonLike,
  normalizeNewlines,
} from "./responseContractEnforcer.text";
import {
  UiContractInterpreterService,
  type UiContractDecision,
} from "./uiContractInterpreter.service";
import { UiReceiptContractValidatorService } from "./uiReceiptContractValidator.service";

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
  operatorFamily?: string;

  constraints?: {
    maxChars?: number;
    maxOutputTokens?: number;
    hardMaxOutputTokens?: number;
    expectedOutputTokens?: number;
    maxSentences?: number;
    exactBulletCount?: number;
    outputShape?:
      | "paragraph"
      | "bullets"
      | "numbered_list"
      | "steps"
      | "table"
      | "quote"
      | "breadcrumbs"
      | "file_list"
      | "button_only"
      | "doc_discovery_list";
    userRequestedShort?: boolean;
  };

  signals?: Record<string, unknown>;
  evidenceRequired?: boolean;
  allowedDocumentIds?: string[];
  provenance?: ChatProvenanceDTO | null;
  evidenceMapSchemaVersion?: "v1" | string;
  evidenceMap?: Array<{
    evidenceId: string;
    documentId: string;
    locationKey: string;
    snippetHash: string;
  }>;
  provenanceFailOpenWithEvidence?: boolean;
}

export interface DraftResponse {
  content: string;
  attachments?: Attachment[];
  receipts?: unknown[];
  renderPlan?: Record<string, unknown> | null;
  editPlan?: Record<string, unknown> | null;
  undoToken?: string | null;
}

export interface EnforcedResponse {
  content: string;
  attachments: Attachment[];
  enforcement: {
    repairs: string[];
    warnings: string[];
    blocked: boolean;
    reasonCode?: string;
    uiContracts?: {
      version?: string | null;
      appliedRuleIds?: string[];
      appliedContracts?: string[];
    };
    uiReceiptContracts?: {
      version?: string | null;
      mappingId?: string | null;
    };
    provenance?: {
      action: "allow" | "hedge" | "block";
      reasonCode: string | null;
      severity: "warning" | "error" | null;
    };
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
  _meta?: { id?: string; version?: string };
  config?: {
    enabled?: boolean;
    contracts?: Record<
      string,
      {
        maxIntroSentences?: number;
        maxIntroChars?: number;
        noSourcesHeader?: boolean;
        noInlineCitations?: boolean;
        disallowedTextPatterns?: string[];
        allowedOutputShapes?: string[];
        allowedAttachments?: string[];
        disallowedAttachments?: string[];
        suppressActions?: boolean;
      }
    >;
    actionsContract?: {
      combination?: {
        multipleMatches?: "apply_most_restrictive" | "apply_first_match";
        hardBlockIsTerminal?: boolean;
      };
      conflictResolution?: {
        ifActionsAndNoToolExecution?: string;
        ifMultipleViolations?: string;
      };
      thresholds?: {
        maxIntroSentencesNavPills?: number;
        maxClarificationQuestions?: number;
      };
    };
  };
  contracts?: Record<string, Record<string, unknown>>;
  rules?: Array<{
    id?: string;
    reasonCode?: string;
    when?: Record<string, unknown>;
    triggerPatterns?: Record<string, string[]>;
    action?: {
      type?: string;
      contract?: string;
      stripDisallowedTextPatterns?: boolean;
      suppressActions?: boolean;
    };
  }>;
};

type UiReceiptShapesBank = {
  _meta?: {
    id?: string;
    version?: string;
  };
  config?: {
    enabled?: boolean;
    strictEnvelopeEnforcement?: boolean;
  };
  mappings?: Array<{
    id?: string;
    domain?: string;
    operator?: string;
    intent?: string;
    mode?: string;
    priority?: number;
    contract?: {
      requiredEnvelopeFields?: string[];
    };
  }>;
};

type BannedPhrasesBank = {
  _meta: unknown;
  config?: {
    enabled?: boolean;
    strictMode?: boolean;
    actionOnMatch?: "strip" | "replace" | "strip_or_replace";
  };
  categories?: Record<
    string,
    {
      severity?: "critical" | "high" | "medium" | "low" | string;
      action?: "strip" | "replace" | "strip_or_replace" | string;
    }
  >;
  patterns?: Array<{
    id?: string;
    category?: string;
    regex?: string;
    action?: "strip" | "replace" | "strip_or_replace" | string;
    replacement?: string;
    languages?: string[];
  }>;
  postProcessing?: {
    removeDoubleSpaces?: boolean;
    removeLeadingPunctuation?: boolean;
    capitalizeAfterStrip?: boolean;
    trimWhitespace?: boolean;
  };
  sourceLeakage?: { patterns?: string[] };
  robotic?: Record<"en" | "pt" | "es", string[]>;
};

type TruncationLimitsBank = {
  _meta: unknown;
  config?: {
    maxCharsHard?: number;
    maxSentencesHard?: number;
  };
  globalLimits?: {
    maxResponseCharsHard?: number;
    maxResponseTokensHard?: number;
  };
  answerModeLimits?: Record<
    string,
    {
      maxChars?: number;
      maxCharsDefault?: number;
      maxTokens?: number;
      maxTokensDefault?: number;
      maxOutputTokens?: number;
      maxOutputTokensDefault?: number;
    }
  >;
};

type BulletRulesBank = {
  _meta: unknown;
  config?: {
    enabled?: boolean;
    bulletMarker?: "-" | "*" | "•";
    maxSentencesPerBullet?: number;
    maxCharsPerBullet?: number;
    actionsContract?: {
      thresholds?: {
        maxBulletsHard?: number;
        maxBulletsSoft?: number;
        maxBulletCharsHard?: number;
        maxBulletCharsSoft?: number;
        maxBulletSentencesHard?: number;
        maxBulletSentencesSoft?: number;
      };
    };
  };
};

type TableRulesBank = {
  _meta: unknown;
  config?: {
    enabled?: boolean;
    strictGfm?: boolean;
    maxColumns?: number;
    maxColumnsBeforeWrap?: number;
    maxRowsSoft?: number;
    maxRowsHard?: number;
    maxCellCharsSoft?: number;
    maxCellCharsHard?: number;
    truncateEllipsis?: string;
    fallbackOnTooWide?: "kv_lines" | string;
    fallbackOnTooLong?: "truncate_rows_then_offer_more" | string;
  };
  formatting?: {
    separatorCell?: string;
  };
  repairs?: {
    fallbacks?: {
      truncate_rows_then_offer_more?: {
        maxRows?: number;
        addTailLine?: Record<"en" | "pt" | "es", string>;
      };
    };
  };
};

type QuoteStylesBank = {
  _meta: unknown;
  config?: {
    enabled?: boolean;
    maxLines?: number;
    requireAttribution?: boolean;
    attributionPrefixByLang?: Record<"en" | "pt" | "es", string>;
  };
};

type CitationStylesBank = {
  _meta: unknown;
  config?: {
    enabled?: boolean;
  };
};

type ListStylesBank = {
  _meta: unknown;
  config?: {
    enabled?: boolean;
    marker?: "-" | "*" | "•";
  };
};

type TableStylesBank = {
  _meta: unknown;
  config?: {
    enabled?: boolean;
  };
};

type AnswerStyleModeOverride = {
  suppressBodyFormatting?: boolean;
  maxBodySentences?: number;
  requireIntro?: boolean;
  requireConclusion?: boolean;
  allowBullets?: boolean;
  allowTables?: boolean;
  allowQuotes?: boolean;
  allowFollowup?: boolean;
  maxQuestions?: number;
};

type AnswerStyleProfile = {
  budget?: {
    maxChars?: number;
    maxQuestions?: number;
  };
  behavior?: {
    allowFollowup?: boolean;
  };
};

type AnswerStylePolicyBank = {
  _meta: unknown;
  config?: {
    enabled?: boolean;
    globalRules?: {
      maxQuestionsPerAnswer?: number;
      forceDoubleNewlineBetweenBlocks?: boolean;
      paragraphRules?: {
        maxSentencesPerParagraph?: number;
        maxCharsPerParagraph?: number;
      };
      answerModeOverrides?: Record<string, AnswerStyleModeOverride>;
    };
  };
  profiles?: Record<string, AnswerStyleProfile>;
};

type BoldingRulesBank = {
  _meta: unknown;
  config?: {
    enabled?: boolean;
    defaultBoldingEnabled?: boolean;
  };
  densityControl?: {
    maxBoldRatioSoft?: number;
    maxBoldRatioHard?: number;
    maxBoldSpansPerParagraph?: number;
    maxBoldSpansPerBullet?: number;
    maxBoldSpansTotal?: number;
    minCharsBetweenBoldSpans?: number;
  };
  spanLimits?: {
    maxCharsPerSpanSoft?: number;
    maxCharsPerSpanHard?: number;
    maxWordsPerSpanSoft?: number;
    maxWordsPerSpanHard?: number;
    neverBoldEntireSentence?: boolean;
    neverBoldEntireBullet?: boolean;
  };
  modeSuppressions?: Record<
    string,
    {
      boldingEnabled?: boolean;
      reason?: string;
    }
  >;
  rules?: Array<{
    id?: string;
    action?: { type?: string };
  }>;
  boldingTargets?: {
    keyTerms?: {
      onlyFirstMention?: boolean;
    };
  };
};

type OperatorContractEntry = {
  id?: string;
  preferredAnswerMode?: string;
  outputs?: {
    primaryShape?: string;
    allowedShapes?: string[];
  };
};

type OperatorContractsBank = {
  _meta: unknown;
  operators?: OperatorContractEntry[] | Record<string, OperatorContractEntry>;
};

type OperatorOutputShapeEntry = {
  defaultShape?: string;
  allowedShapes?: string[];
};

type OperatorOutputShapesBank = {
  _meta: unknown;
  mapping?: Record<string, OperatorOutputShapeEntry>;
};

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

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

function toPositiveInt(input: unknown): number | null {
  const value = Number(input);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
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
  const lastWhitespace = Math.max(
    slice.lastIndexOf(" "),
    slice.lastIndexOf("\n"),
    slice.lastIndexOf("\t"),
  );
  if (lastWhitespace > 80) {
    return { text: slice.slice(0, lastWhitespace).trim(), changed: true };
  }
  return { text: slice.trim(), changed: true };
}

function charsPerToken(language: ResponseContractContext["language"]): number {
  // PT/ES have diacritics and multi-byte chars → fewer chars per token than English
  if (language === "pt" || language === "es") return 3.5;
  return 4.0;
}

function resolveShortMaxChars(
  ctx: ResponseContractContext,
  shortTokenLimit: number,
): number {
  const explicitMaxChars = toPositiveInt(ctx.constraints?.maxChars);
  if (explicitMaxChars) return explicitMaxChars;
  return Math.max(
    420,
    Math.ceil(shortTokenLimit * charsPerToken(ctx.language)),
  );
}

function normalizeMarkdownTableSeparators(
  text: string,
  tableRules?: TableRulesBank,
): { text: string; changed: boolean } {
  if (!tableRules?.config?.enabled) return { text, changed: false };

  const separatorCellRaw = String(
    tableRules.formatting?.separatorCell || "---",
  ).trim();
  const separatorCell = separatorCellRaw
    .replace(/[^:-]/g, "-")
    .replace(/-+/g, "-")
    .padEnd(3, "-")
    .slice(0, 3);
  const lines = text.split("\n");
  let changed = false;
  const normalized = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed.includes("|")) return line;
    if (!/^-?[:|\s-]+$/.test(trimmed.replace(/\|/g, ""))) {
      return line;
    }

    const hasLeadingPipe = trimmed.startsWith("|");
    const hasTrailingPipe = trimmed.endsWith("|");
    const cells = trimmed
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());

    if (cells.length < 2) return line;

    const repairedCells = cells.map((cell) => {
      const leftAligned = cell.startsWith(":");
      const rightAligned = cell.endsWith(":");
      const normalizedCell = `${leftAligned ? ":" : ""}${separatorCell}${rightAligned ? ":" : ""}`;
      return normalizedCell;
    });
    const rebuilt = `${hasLeadingPipe ? "|" : ""}${repairedCells.join("|")}${hasTrailingPipe ? "|" : ""}`;
    if (rebuilt !== line) changed = true;
    return rebuilt;
  });

  const dashClamped = normalized.map((line) => {
    const repaired = line.replace(/-{4,}/g, "---");
    if (repaired !== line) changed = true;
    return repaired;
  });

  return { text: dashClamped.join("\n"), changed };
}

function splitPipeCells(line: string): string[] {
  return String(line || "")
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function normalizeHeaderKey(input: string): string {
  return String(input || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isTableSeparatorLine(line: string): boolean {
  const trimmed = String(line || "").trim();
  if (!trimmed.includes("|")) return false;
  return /^[:\-\|\s]+$/.test(trimmed);
}

function sanitizeMarkdownTables(text: string): {
  text: string;
  changed: boolean;
} {
  const lines = String(text || "").split("\n");
  const out: string[] = [];
  let changed = false;
  const sourceHeaderPatterns = [
    "source",
    "sources",
    "fonte",
    "fontes",
    "documento fonte",
    "document source",
    "evidencia",
    "evidence",
  ];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const next = lines[i + 1] || "";
    const isTableStart = line.includes("|") && isTableSeparatorLine(next);
    if (!isTableStart) {
      out.push(line);
      continue;
    }

    const tableBlock: string[] = [line, next];
    let j = i + 2;
    while (j < lines.length && lines[j].includes("|")) {
      tableBlock.push(lines[j]);
      j += 1;
    }
    i = j - 1;

    const headerCells = splitPipeCells(tableBlock[0]);
    if (headerCells.length < 2) {
      out.push(...tableBlock);
      continue;
    }
    const colCount = headerCells.length;
    const sourceColumnIndexes = new Set<number>();
    for (let c = 0; c < headerCells.length; c += 1) {
      const key = normalizeHeaderKey(headerCells[c]);
      if (sourceHeaderPatterns.some((token) => key.includes(token))) {
        sourceColumnIndexes.add(c);
      }
    }

    const rewriteRow = (rowLine: string): string => {
      const cells = splitPipeCells(rowLine);
      const padded =
        cells.length >= colCount
          ? [
              ...cells.slice(0, colCount - 1),
              cells
                .slice(colCount - 1)
                .join(" | ")
                .trim(),
            ]
          : [
              ...cells,
              ...Array.from({ length: colCount - cells.length }, () => ""),
            ];
      const filtered = padded.filter((_, idx) => !sourceColumnIndexes.has(idx));
      const finalCells = filtered.length > 0 ? filtered : padded;
      return `| ${finalCells.join(" | ")} |`;
    };

    const rewrittenHeader = rewriteRow(tableBlock[0]);
    if (rewrittenHeader !== tableBlock[0]) changed = true;
    out.push(rewrittenHeader);

    const effectiveCols = splitPipeCells(rewrittenHeader).length;
    const sep = `| ${Array.from({ length: effectiveCols }, () => "---").join(" | ")} |`;
    if (sep !== tableBlock[1]) changed = true;
    out.push(sep);

    for (let k = 2; k < tableBlock.length; k += 1) {
      const rewritten = rewriteRow(tableBlock[k]);
      if (rewritten !== tableBlock[k]) changed = true;
      out.push(rewritten);
    }
  }

  return { text: out.join("\n"), changed };
}

function stripInlineCitationArtifacts(text: string): {
  text: string;
  changed: boolean;
} {
  const before = String(text || "");
  let out = before;

  // Remove inline retrieval markers like:
  // (d:ed290aeb-029f-4737-961f-5974e09bd083|p:-1|c:14)
  // and bare variants without parentheses.
  const marker =
    /d:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\|p:-?\d+\|c:\d+/gi;
  out = out.replace(new RegExp(`\\(\\s*${marker.source}\\s*\\)`, "gi"), "");
  out = out.replace(marker, "");

  // Clean up dangling punctuation left behind after marker removal.
  out = out
    .replace(/\(\s*[,;]+\s*\)/g, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ");

  return { text: out.trim(), changed: out.trim() !== before.trim() };
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

function keepFirstNSentences(
  text: string,
  maxSentences: number,
  maxChars: number,
): string {
  const t = String(text || "").trim();
  if (!t) return "";
  const sentences = t.split(/(?<=[.!?])\s+/).filter(Boolean);
  const limited = sentences.slice(0, Math.max(1, maxSentences));
  const joined = limited.join(" ").trim();
  if (!joined) return "";
  return joined.length > maxChars ? joined.slice(0, maxChars).trim() : joined;
}

function applyDisallowedPatterns(
  text: string,
  patterns: string[],
): { text: string; changed: boolean } {
  let out = String(text || "");
  const before = out.trim();
  for (const pattern of patterns) {
    const raw = String(pattern || "").trim();
    if (!raw) continue;
    try {
      const rx = new RegExp(raw, "gi");
      out = out.replace(rx, "");
    } catch {
      continue;
    }
  }
  out = out.replace(/\s{2,}/g, " ").trim();
  return { text: out, changed: out !== before };
}

function suppressActionLanguage(
  text: string,
  patterns: string[],
): { text: string; changed: boolean } {
  const source = String(text || "").trim();
  if (!source) return { text: source, changed: false };
  const regexes = patterns
    .map((pattern) => {
      try {
        return new RegExp(String(pattern || "").trim(), "i");
      } catch {
        return null;
      }
    })
    .filter((rx): rx is RegExp => Boolean(rx));
  if (regexes.length === 0) return { text: source, changed: false };

  const sentences = source
    .split(/(?<=[.!?])\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
  if (sentences.length === 0) return { text: source, changed: false };

  const kept = sentences.filter((sentence) =>
    regexes.every((regex) => !regex.test(sentence)),
  );
  const out = kept.join(" ").trim();
  if (!out) return { text: "", changed: true };
  return { text: out, changed: out !== source };
}

function normalizeOperatorId(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeShape(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function uniqueShapes(values: Array<string | undefined | null>): string[] {
  const out = new Set<string>();
  for (const value of values) {
    const shape = normalizeShape(value);
    if (shape) out.add(shape);
  }
  return Array.from(out);
}

function toNumberedSteps(text: string): string | null {
  const lines = String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^\s*[-*]\s+/, "").trim())
    .filter(Boolean);
  if (lines.length < 2) return null;
  return lines
    .slice(0, 8)
    .map((line, idx) => `${idx + 1}. ${line}`)
    .join("\n");
}

function stripTables(text: string): { text: string; changed: boolean } {
  const before = String(text || "");
  const lines = before.split("\n");
  const kept = lines.filter((line) => !line.includes("|"));
  const after = kept.join("\n").trim();
  return { text: after, changed: after !== before.trim() };
}

function stripQuoteMarkers(text: string): { text: string; changed: boolean } {
  const before = String(text || "");
  const after = before
    .split("\n")
    .map((line) => line.replace(/^\s*>\s?/, ""))
    .join("\n")
    .trim();
  return { text: after, changed: after !== before.trim() };
}

function flattenBulletMarkers(text: string): { text: string; changed: boolean } {
  const before = String(text || "");
  const after = before
    .split("\n")
    .map((line) =>
      line.replace(/^\s*[-*+]\s+/, "").replace(/^\s*\d+\.\s+/, ""),
    )
    .join("\n")
    .trim();
  return { text: after, changed: after !== before.trim() };
}

function enforceParagraphCaps(params: {
  text: string;
  maxSentencesPerParagraph?: number | null;
  maxCharsPerParagraph?: number | null;
}): { text: string; changed: boolean } {
  const maxSentences = toPositiveInt(params.maxSentencesPerParagraph);
  const maxChars = toPositiveInt(params.maxCharsPerParagraph);
  if (!maxSentences && !maxChars) {
    return { text: params.text, changed: false };
  }

  const before = String(params.text || "").trim();
  if (!before) return { text: before, changed: false };
  const blocks = before.split(/\n{2,}/);
  const normalizedBlocks: string[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    if (
      /^\s*[-*+]\s+/.test(trimmed) ||
      /^\s*\d+\.\s+/.test(trimmed) ||
      /^\s*>/.test(trimmed) ||
      trimmed.includes("|")
    ) {
      normalizedBlocks.push(trimmed);
      continue;
    }
    const sentences = trimmed
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (sentences.length <= 1) {
      if (maxChars && trimmed.length > maxChars) {
        const shortened = limitChars(trimmed, maxChars).text;
        normalizedBlocks.push(shortened);
      } else {
        normalizedBlocks.push(trimmed);
      }
      continue;
    }

    let cursor = 0;
    while (cursor < sentences.length) {
      const sentenceCap = maxSentences || sentences.length;
      const chunkSentences = sentences.slice(cursor, cursor + sentenceCap);
      let chunk = chunkSentences.join(" ").trim();
      if (maxChars && chunk.length > maxChars) {
        chunk = limitChars(chunk, maxChars).text;
      }
      if (chunk) normalizedBlocks.push(chunk);
      cursor += sentenceCap;
    }
  }

  const after = normalizedBlocks.join("\n\n").trim();
  return { text: after, changed: after !== before };
}

type AnswerStyleApplyResult = {
  text: string;
  changed: boolean;
  repairs: string[];
  warnings: string[];
  maxQuestions: number | null;
  profileMaxChars: number | null;
};

function enforceAnswerStylePolicies(params: {
  text: string;
  answerMode: string;
  bank?: AnswerStylePolicyBank;
  requestedProfile?: string | null;
}): AnswerStyleApplyResult {
  const repairs: string[] = [];
  const warnings: string[] = [];
  const bank = params.bank;
  if (!bank || bank?.config?.enabled === false) {
    return {
      text: params.text,
      changed: false,
      repairs,
      warnings,
      maxQuestions: null,
      profileMaxChars: null,
    };
  }

  const globalRules = bank.config?.globalRules || {};
  const modeOverrides = globalRules.answerModeOverrides || {};
  const modeOverride =
    modeOverrides[String(params.answerMode || "").trim()] || null;
  let out = String(params.text || "");
  const before = out.trim();

  if (modeOverride?.suppressBodyFormatting) {
    const noBullets = flattenBulletMarkers(out);
    if (noBullets.changed) repairs.push("STYLE_SUPPRESS_BODY_BULLETS");
    out = noBullets.text;
    const noTables = stripTables(out);
    if (noTables.changed) repairs.push("STYLE_SUPPRESS_BODY_TABLES");
    out = noTables.text;
    const noQuotes = stripQuoteMarkers(out);
    if (noQuotes.changed) repairs.push("STYLE_SUPPRESS_BODY_QUOTES");
    out = noQuotes.text;
  } else {
    if (modeOverride?.allowBullets === false) {
      const noBullets = flattenBulletMarkers(out);
      if (noBullets.changed) repairs.push("STYLE_BULLETS_DISABLED_FOR_MODE");
      out = noBullets.text;
    }
    if (modeOverride?.allowTables === false) {
      const noTables = stripTables(out);
      if (noTables.changed) repairs.push("STYLE_TABLES_DISABLED_FOR_MODE");
      out = noTables.text;
    }
    if (modeOverride?.allowQuotes === false) {
      const noQuotes = stripQuoteMarkers(out);
      if (noQuotes.changed) repairs.push("STYLE_QUOTES_DISABLED_FOR_MODE");
      out = noQuotes.text;
    }
  }

  const maxBodySentences = toPositiveInt(modeOverride?.maxBodySentences);
  if (maxBodySentences && countSentences(out) > maxBodySentences) {
    const parts = out.split(/(?<=[.!?])\s+/).slice(0, maxBodySentences);
    out = parts.join(" ").trim();
    repairs.push("STYLE_MODE_MAX_BODY_SENTENCES_ENFORCED");
  }

  const paragraphCaps = enforceParagraphCaps({
    text: out,
    maxSentencesPerParagraph: toPositiveInt(
      globalRules.paragraphRules?.maxSentencesPerParagraph,
    ),
    maxCharsPerParagraph: toPositiveInt(
      globalRules.paragraphRules?.maxCharsPerParagraph,
    ),
  });
  if (paragraphCaps.changed) {
    out = paragraphCaps.text;
    repairs.push("STYLE_PARAGRAPH_CAPS_ENFORCED");
  }

  if (globalRules.forceDoubleNewlineBetweenBlocks) {
    const normalized = out.replace(/\n{3,}/g, "\n\n").trim();
    if (normalized !== out.trim()) {
      out = normalized;
      repairs.push("STYLE_BLOCK_SPACING_ENFORCED");
    }
  }

  const requestedProfile = String(params.requestedProfile || "")
    .trim()
    .toLowerCase();
  const profileEntry =
    requestedProfile && bank.profiles
      ? bank.profiles[requestedProfile] || null
      : null;
  if (requestedProfile && !profileEntry) {
    warnings.push("STYLE_PROFILE_NOT_FOUND");
  }
  const profileMaxChars = toPositiveInt(profileEntry?.budget?.maxChars);
  const profileQuestions = toPositiveInt(profileEntry?.budget?.maxQuestions);
  const overrideQuestions = Number.isFinite(Number(modeOverride?.maxQuestions))
    ? Math.max(0, Math.floor(Number(modeOverride?.maxQuestions)))
    : null;
  const globalQuestions = toPositiveInt(globalRules.maxQuestionsPerAnswer);
  const maxQuestions =
    overrideQuestions ??
    (typeof profileQuestions === "number" ? profileQuestions : null) ??
    (typeof globalQuestions === "number" ? globalQuestions : null);

  return {
    text: out.trim(),
    changed: out.trim() !== before,
    repairs,
    warnings,
    maxQuestions:
      typeof maxQuestions === "number" ? Math.max(0, maxQuestions) : null,
    profileMaxChars: profileMaxChars || null,
  };
}

type BoldSpan = {
  start: number;
  end: number;
  inner: string;
  raw: string;
};

function stripMarkdownBold(text: string): { text: string; changed: boolean } {
  const before = String(text || "");
  const out = before
    .replace(/\*\*([^*]+?)\*\*/g, "$1")
    .replace(/__([^_]+?)__/g, "$1")
    .trim();
  return { text: out, changed: out !== before.trim() };
}

function collectBoldSpans(text: string): BoldSpan[] {
  const spans: BoldSpan[] = [];
  const regex = /\*\*([^*\n]+?)\*\*|__([^_\n]+?)__/g;
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(text))) {
    const raw = String(match[0] || "");
    const inner = String(match[1] || match[2] || "");
    spans.push({
      start: match.index,
      end: match.index + raw.length,
      inner,
      raw,
    });
  }
  return spans;
}

function resolveParagraphRanges(text: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const input = String(text || "");
  if (!input) return ranges;
  let idx = 0;
  while (idx < input.length) {
    const sep = input.indexOf("\n\n", idx);
    if (sep === -1) {
      ranges.push({ start: idx, end: input.length });
      break;
    }
    ranges.push({ start: idx, end: sep });
    idx = sep;
    while (idx < input.length && input[idx] === "\n") idx += 1;
  }
  return ranges;
}

function lineWindow(text: string, index: number): { start: number; end: number; line: string } {
  const start = Math.max(0, String(text || "").lastIndexOf("\n", index - 1) + 1);
  const nextNl = String(text || "").indexOf("\n", index);
  const end = nextNl === -1 ? String(text || "").length : nextNl;
  const line = String(text || "").slice(start, end);
  return { start, end, line };
}

function enforceBoldingPolicies(params: {
  text: string;
  bank?: BoldingRulesBank;
  answerMode: string;
  operatorFamily?: string | null;
}): { text: string; changed: boolean; repairs: string[] } {
  const repairs: string[] = [];
  const bank = params.bank;
  if (!bank || bank?.config?.enabled === false) {
    return { text: params.text, changed: false, repairs };
  }

  const answerMode = String(params.answerMode || "").trim().toLowerCase();
  const operatorFamily = String(params.operatorFamily || "")
    .trim()
    .toLowerCase();
  const modeSuppression = bank.modeSuppressions?.[answerMode];
  const familySuppression =
    operatorFamily && bank.modeSuppressions
      ? bank.modeSuppressions[operatorFamily]
      : null;
  const suppress =
    bank.config?.defaultBoldingEnabled === false ||
    modeSuppression?.boldingEnabled === false ||
    familySuppression?.boldingEnabled === false;
  if (suppress) {
    const stripped = stripMarkdownBold(params.text);
    if (stripped.changed) repairs.push("BOLDING_SUPPRESSED_FOR_MODE");
    return { text: stripped.text, changed: stripped.changed, repairs };
  }

  const before = String(params.text || "");
  const spans = collectBoldSpans(before);
  if (spans.length === 0) return { text: before, changed: false, repairs };
  const keep = spans.map(() => true);

  const density = bank.densityControl || {};
  const spanLimits = bank.spanLimits || {};
  const maxSpansTotal = toPositiveInt(density.maxBoldSpansTotal) || 8;
  const maxPerParagraph = toPositiveInt(density.maxBoldSpansPerParagraph) || 2;
  const maxPerBullet = toPositiveInt(density.maxBoldSpansPerBullet) || 1;
  const minCharsBetween = toPositiveInt(density.minCharsBetweenBoldSpans) || 0;
  const maxSpanCharsHard = toPositiveInt(spanLimits.maxCharsPerSpanHard) || 50;
  const maxSpanWordsHard = toPositiveInt(spanLimits.maxWordsPerSpanHard) || 7;
  const maxRatioSoft = Number(density.maxBoldRatioSoft) || 0.1;
  const maxRatioHard = Number(density.maxBoldRatioHard) || 0.15;
  const enforceFirstMentionOnly =
    bank.boldingTargets?.keyTerms?.onlyFirstMention === true ||
    (Array.isArray(bank.rules)
      ? bank.rules.some(
          (rule) =>
            String(rule?.action?.type || "").trim() ===
            "bold_first_mention_only",
        )
      : false);

  const paragraphRanges = resolveParagraphRanges(before);
  const paragraphCounts = new Map<number, number>();
  const bulletCounts = new Map<number, number>();
  const seenTerms = new Set<string>();

  for (let i = 0; i < spans.length; i += 1) {
    const span = spans[i];
    const inner = String(span.inner || "").trim();
    const wordCount = inner ? inner.split(/\s+/).length : 0;
    if (inner.length > maxSpanCharsHard || wordCount > maxSpanWordsHard) {
      keep[i] = false;
      repairs.push("BOLD_SPAN_LIMIT_ENFORCED");
      continue;
    }

    if (enforceFirstMentionOnly) {
      const key = inner.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (key) {
        if (seenTerms.has(key)) {
          keep[i] = false;
          repairs.push("BOLD_FIRST_MENTION_ENFORCED");
          continue;
        }
        seenTerms.add(key);
      }
    }

    const lineInfo = lineWindow(before, span.start);
    const lineTrimmed = lineInfo.line.trim();
    const plainLine = lineTrimmed
      .replace(/^\s*[-*+]\s+/, "")
      .replace(/^\s*\d+\.\s+/, "")
      .trim();
    const isBulletLine =
      /^\s*[-*+]\s+/.test(lineTrimmed) || /^\s*\d+\.\s+/.test(lineTrimmed);

    if (spanLimits.neverBoldEntireSentence && plainLine) {
      const ratio = inner.length / Math.max(plainLine.length, 1);
      if (ratio >= 0.85) {
        keep[i] = false;
        repairs.push("BOLD_ENTIRE_SENTENCE_BLOCKED");
        continue;
      }
    }
    if (spanLimits.neverBoldEntireBullet && isBulletLine && plainLine) {
      const ratio = inner.length / Math.max(plainLine.length, 1);
      if (ratio >= 0.8) {
        keep[i] = false;
        repairs.push("BOLD_ENTIRE_BULLET_BLOCKED");
        continue;
      }
    }
    if (lineTrimmed.includes("|")) {
      keep[i] = false;
      repairs.push("BOLD_REMOVED_FROM_TABLE");
      continue;
    }

    if (isBulletLine) {
      const key = lineInfo.start;
      const current = bulletCounts.get(key) || 0;
      if (current >= maxPerBullet) {
        keep[i] = false;
        repairs.push("BOLD_BULLET_DENSITY_ENFORCED");
        continue;
      }
      bulletCounts.set(key, current + 1);
    }

    const paragraphIdx = paragraphRanges.findIndex(
      (range) => span.start >= range.start && span.start < range.end,
    );
    if (paragraphIdx >= 0) {
      const current = paragraphCounts.get(paragraphIdx) || 0;
      if (current >= maxPerParagraph) {
        keep[i] = false;
        repairs.push("BOLD_PARAGRAPH_DENSITY_ENFORCED");
        continue;
      }
      paragraphCounts.set(paragraphIdx, current + 1);
    }
  }

  let keptCount = keep.filter(Boolean).length;
  if (keptCount > maxSpansTotal) {
    for (let i = spans.length - 1; i >= 0; i -= 1) {
      if (!keep[i]) continue;
      keep[i] = false;
      keptCount -= 1;
      repairs.push("BOLD_TOTAL_SPAN_LIMIT_ENFORCED");
      if (keptCount <= maxSpansTotal) break;
    }
  }

  if (minCharsBetween > 0) {
    let lastEnd = -1;
    for (let i = 0; i < spans.length; i += 1) {
      if (!keep[i]) continue;
      const gap = spans[i].start - lastEnd;
      if (lastEnd >= 0 && gap < minCharsBetween) {
        keep[i] = false;
        repairs.push("BOLD_MIN_SPACING_ENFORCED");
        continue;
      }
      lastEnd = spans[i].end;
    }
  }

  const textLength = Math.max(1, before.length);
  const keptBoldChars = () =>
    spans.reduce(
      (sum, span, idx) => sum + (keep[idx] ? String(span.inner || "").length : 0),
      0,
    );
  let ratio = keptBoldChars() / textLength;
  if (ratio > maxRatioHard) {
    repairs.push("BOLD_RATIO_HARD_LIMIT_ENFORCED");
  }
  if (ratio > maxRatioSoft || ratio > maxRatioHard) {
    for (let i = spans.length - 1; i >= 0; i -= 1) {
      if (!keep[i]) continue;
      keep[i] = false;
      ratio = keptBoldChars() / textLength;
      if (ratio <= maxRatioSoft && ratio <= maxRatioHard) break;
    }
    repairs.push("BOLD_RATIO_SOFT_LIMIT_ENFORCED");
  }

  let out = "";
  let cursor = 0;
  for (let i = 0; i < spans.length; i += 1) {
    const span = spans[i];
    out += before.slice(cursor, span.start);
    out += keep[i] ? span.raw : span.inner;
    cursor = span.end;
  }
  out += before.slice(cursor);
  const normalized = out.trim();
  return {
    text: normalized,
    changed: normalized !== before.trim(),
    repairs,
  };
}

type AppliedBannedPhrase = {
  id: string;
  category: string;
  severity: string;
};

type BannedPhraseApplyResult = {
  text: string;
  changed: boolean;
  applied: AppliedBannedPhrase[];
  warnings: string[];
  criticalResidual: boolean;
};

function languageMatches(
  entryLanguages: unknown,
  language: "en" | "pt" | "es",
): boolean {
  if (!Array.isArray(entryLanguages) || entryLanguages.length === 0)
    return true;
  const normalized = entryLanguages
    .map((value) =>
      String(value || "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
  return normalized.includes("any") || normalized.includes(language);
}

function compileLooseRegex(raw: string): RegExp | null {
  let source = String(raw || "").trim();
  if (!source) return null;
  let flags = "g";
  if (source.startsWith("(?i)")) {
    source = source.slice(4);
    flags += "i";
  }
  try {
    return new RegExp(source, flags);
  } catch {
    return null;
  }
}

function resolveBannedAction(input: {
  entryAction?: unknown;
  categoryAction?: unknown;
  defaultAction?: unknown;
}): "strip" | "replace" | "strip_or_replace" {
  const normalized = String(
    input.entryAction || input.categoryAction || input.defaultAction || "strip",
  )
    .trim()
    .toLowerCase();
  if (normalized === "replace") return "replace";
  if (normalized === "strip_or_replace") return "strip_or_replace";
  return "strip";
}

function capitalizeFirst(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function applyBannedPhrasePolicies(params: {
  text: string;
  bank?: BannedPhrasesBank;
  language: "en" | "pt" | "es";
}): BannedPhraseApplyResult {
  const warnings: string[] = [];
  const applied: AppliedBannedPhrase[] = [];
  const bank = params.bank;
  if (!bank?.config?.enabled && !Array.isArray(bank?.patterns)) {
    return {
      text: params.text,
      changed: false,
      applied,
      warnings,
      criticalResidual: false,
    };
  }

  let out = String(params.text || "");
  const before = out;
  const categories = bank?.categories || {};
  const entryPatterns = Array.isArray(bank?.patterns) ? bank!.patterns! : [];

  for (let idx = 0; idx < entryPatterns.length; idx += 1) {
    const entry = entryPatterns[idx];
    const regex = compileLooseRegex(String(entry?.regex || ""));
    if (!regex) {
      warnings.push(`BANNED_PATTERN_INVALID_REGEX_${idx + 1}`);
      continue;
    }
    if (!languageMatches(entry?.languages, params.language)) continue;

    const category = String(entry?.category || "uncategorized")
      .trim()
      .toLowerCase();
    const categoryConfig = categories[category] || {};
    const severity = String(categoryConfig?.severity || "medium")
      .trim()
      .toLowerCase();
    const action = resolveBannedAction({
      entryAction: entry?.action,
      categoryAction: categoryConfig?.action,
      defaultAction: bank?.config?.actionOnMatch,
    });
    const replacement = String(entry?.replacement || "").trim();

    regex.lastIndex = 0;
    if (!regex.test(out)) continue;
    regex.lastIndex = 0;

    if (
      action === "replace" ||
      (action === "strip_or_replace" && replacement)
    ) {
      out = out.replace(regex, replacement || " ");
    } else {
      out = out.replace(regex, " ");
    }
    applied.push({
      id: String(entry?.id || `pattern_${idx + 1}`),
      category,
      severity,
    });
  }

  const legacyPatterns = Array.isArray(bank?.sourceLeakage?.patterns)
    ? bank!.sourceLeakage!.patterns!
    : [];
  for (let idx = 0; idx < legacyPatterns.length; idx += 1) {
    const regex = compileLooseRegex(String(legacyPatterns[idx] || ""));
    if (!regex) {
      warnings.push(`BANNED_LEGACY_PATTERN_INVALID_REGEX_${idx + 1}`);
      continue;
    }
    regex.lastIndex = 0;
    if (!regex.test(out)) continue;
    out = out.replace(regex, " ");
    applied.push({
      id: `legacy_source_leakage_${idx + 1}`,
      category: "source_leakage",
      severity: "high",
    });
  }

  if (bank?.postProcessing?.removeDoubleSpaces !== false) {
    out = out.replace(/\s{2,}/g, " ");
  }
  if (bank?.postProcessing?.removeLeadingPunctuation !== false) {
    out = out.replace(/^[\s,.;:!?-]+/, "");
  }
  if (bank?.postProcessing?.capitalizeAfterStrip) {
    out = capitalizeFirst(out.trim());
  }
  if (bank?.postProcessing?.trimWhitespace !== false) {
    out = out.trim();
  }

  let criticalResidual = false;
  if (applied.some((entry) => entry.severity === "critical")) {
    for (let idx = 0; idx < entryPatterns.length; idx += 1) {
      const entry = entryPatterns[idx];
      if (!languageMatches(entry?.languages, params.language)) continue;
      const category = String(entry?.category || "uncategorized")
        .trim()
        .toLowerCase();
      const severity = String(categories[category]?.severity || "medium")
        .trim()
        .toLowerCase();
      if (severity !== "critical") continue;
      const regex = compileLooseRegex(String(entry?.regex || ""));
      if (!regex) continue;
      regex.lastIndex = 0;
      if (regex.test(out)) {
        criticalResidual = true;
        break;
      }
    }
  }

  return {
    text: out,
    changed: out.trim() !== before.trim(),
    applied,
    warnings,
    criticalResidual,
  };
}

type BulletPolicyApplyResult = {
  text: string;
  changed: boolean;
  repairs: string[];
};

function enforceBulletPolicies(params: {
  text: string;
  answerMode: string;
  bulletRules?: BulletRulesBank;
  renderPolicy?: RenderPolicyBank;
}): BulletPolicyApplyResult {
  const bank = params.bulletRules;
  if (bank?.config?.enabled === false) {
    return { text: params.text, changed: false, repairs: [] };
  }
  const outLines = String(params.text || "").split("\n");
  const preferredMarker = String(
    params.renderPolicy?.config?.markdown?.bulletMarker || "-",
  )
    .trim()
    .charAt(0);
  const marker = preferredMarker === "*" || preferredMarker === "+" ? "-" : "-";
  const repairs: string[] = [];
  const thresholds = bank?.config?.actionsContract?.thresholds || {};
  const maxBulletsHard = toPositiveInt(thresholds.maxBulletsHard) || 7;
  const maxBulletCharsHard =
    toPositiveInt(thresholds.maxBulletCharsHard) ||
    toPositiveInt(bank?.config?.maxCharsPerBullet) ||
    320;
  const maxBulletSentencesHard =
    toPositiveInt(thresholds.maxBulletSentencesHard) ||
    toPositiveInt(bank?.config?.maxSentencesPerBullet) ||
    3;

  if (
    String(params.answerMode || "").trim() === "rank_disambiguate" ||
    String(params.answerMode || "").trim() === "nav_pills"
  ) {
    const flattened = outLines
      .map((line) =>
        line.replace(/^\s*[-*+]\s+/, "").replace(/^\s*\d+\.\s+/, ""),
      )
      .join("\n")
      .trim();
    if (flattened !== params.text.trim()) {
      return {
        text: flattened,
        changed: true,
        repairs: ["BULLETS_SUPPRESSED_FOR_MODE"],
      };
    }
    return { text: params.text, changed: false, repairs: [] };
  }

  let bulletSeen = 0;
  for (let i = 0; i < outLines.length; i += 1) {
    const line = outLines[i];
    if (!/^\s*[-*+]\s+/.test(line)) continue;
    bulletSeen += 1;
    if (bulletSeen > maxBulletsHard) {
      outLines[i] = "";
      repairs.push("BULLET_COUNT_TRIMMED");
      continue;
    }

    const stripped = line.replace(/^\s*[-*+]\s+/, "").trim();
    const sentenceCount = countSentences(stripped);
    let normalized = stripped;
    if (sentenceCount > maxBulletSentencesHard) {
      const parts = stripped.split(/(?<=[.!?])\s+/);
      normalized = parts.slice(0, maxBulletSentencesHard).join(" ").trim();
      repairs.push("BULLET_SENTENCE_LIMIT_ENFORCED");
    }
    if (normalized.length > maxBulletCharsHard) {
      normalized = limitChars(normalized, maxBulletCharsHard).text;
      repairs.push("BULLET_CHAR_LIMIT_ENFORCED");
    }
    outLines[i] = `${marker} ${normalized}`;
    if (!line.trimStart().startsWith(`${marker} `)) {
      repairs.push("BULLET_MARKER_NORMALIZED");
    }
  }

  const out = outLines
    .filter((line) => line !== "")
    .join("\n")
    .trim();
  return { text: out, changed: out !== params.text.trim(), repairs };
}

type TablePolicyApplyResult = {
  text: string;
  changed: boolean;
  repairs: string[];
  criticalViolation: boolean;
};

function kvFallbackFromTable(input: {
  header: string[];
  rows: string[][];
  maxRows: number;
}): string {
  const header = input.header;
  const rows = input.rows.slice(0, input.maxRows);
  const bullets = rows.map((row) => {
    const parts: string[] = [];
    for (let i = 0; i < Math.min(header.length, row.length); i += 1) {
      const key = String(header[i] || "").trim();
      const value = String(row[i] || "").trim();
      if (!key || !value) continue;
      parts.push(`**${key}**: ${value}`);
    }
    return `- ${parts.join("; ") || row.join(" | ")}`;
  });
  return bullets.join("\n").trim();
}

function enforceTablePolicies(params: {
  text: string;
  tableRules?: TableRulesBank;
  language: "en" | "pt" | "es";
}): TablePolicyApplyResult {
  const bank = params.tableRules;
  if (bank?.config?.enabled === false) {
    return {
      text: params.text,
      changed: false,
      repairs: [],
      criticalViolation: false,
    };
  }
  const lines = String(params.text || "").split("\n");
  const out: string[] = [];
  const repairs: string[] = [];
  let changed = false;
  let criticalViolation = false;
  const maxColumnsHard = toPositiveInt(bank?.config?.maxColumns) || 6;
  const maxRowsHard =
    toPositiveInt(bank?.config?.maxRowsHard) ||
    toPositiveInt(bank?.config?.maxRowsSoft) ||
    25;
  const maxCellCharsHard =
    toPositiveInt(bank?.config?.maxCellCharsHard) ||
    toPositiveInt(bank?.config?.maxCellCharsSoft) ||
    120;
  const ellipsis = String(bank?.config?.truncateEllipsis || "…");

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const next = lines[i + 1] || "";
    const isTableStart = line.includes("|") && isTableSeparatorLine(next);
    if (!isTableStart) {
      out.push(line);
      continue;
    }

    const block: string[] = [line, next];
    let j = i + 2;
    while (j < lines.length && lines[j].includes("|")) {
      block.push(lines[j]);
      j += 1;
    }
    i = j - 1;

    const header = splitPipeCells(block[0]);
    if (header.length < 2) {
      criticalViolation = true;
      out.push(...block);
      continue;
    }

    const colCount = Math.min(header.length, maxColumnsHard);
    const dataRows = block.slice(2).map((row) => splitPipeCells(row));
    if (header.length > maxColumnsHard) {
      changed = true;
      repairs.push("TABLE_FALLBACK_KV_TOO_WIDE");
      out.push(
        kvFallbackFromTable({
          header,
          rows: dataRows,
          maxRows: Math.min(maxRowsHard, 8),
        }),
      );
      continue;
    }

    const trimmedRows = dataRows.slice(0, maxRowsHard).map((row) => {
      const normalized =
        row.length >= colCount
          ? row.slice(0, colCount)
          : [
              ...row,
              ...Array.from({ length: colCount - row.length }, () => ""),
            ];
      return normalized.map((cell) => {
        const value = String(cell || "").trim();
        if (value.length <= maxCellCharsHard) return value;
        return `${value.slice(0, Math.max(1, maxCellCharsHard - ellipsis.length)).trim()}${ellipsis}`;
      });
    });

    const clippedCount = dataRows.length - trimmedRows.length;
    if (clippedCount > 0) {
      changed = true;
      repairs.push("TABLE_ROWS_TRUNCATED");
    }
    if (trimmedRows.length === 0) {
      criticalViolation = true;
      out.push(...block);
      continue;
    }

    const normalizedHeader = `| ${header
      .slice(0, colCount)
      .map((cell) => String(cell || "").trim())
      .join(" | ")} |`;
    out.push(normalizedHeader);
    out.push(
      `| ${Array.from({ length: colCount }, () => "---").join(" | ")} |`,
    );
    for (const row of trimmedRows) {
      out.push(`| ${row.join(" | ")} |`);
    }
    if (clippedCount > 0) {
      const addTailLine =
        bank?.repairs?.fallbacks?.truncate_rows_then_offer_more?.addTailLine;
      const tailTemplate = String(
        addTailLine?.[params.language] || "({remaining} more rows not shown)",
      );
      out.push(
        tailTemplate.replace(
          /\{remaining\}/g,
          String(Math.max(0, clippedCount)),
        ),
      );
    }
    if (
      block.join("\n").trim() !==
      out
        .slice(out.length - (2 + trimmedRows.length))
        .join("\n")
        .trim()
    ) {
      changed = true;
      repairs.push("TABLE_LIMITS_ENFORCED");
    }
  }

  return {
    text: out.join("\n").trim(),
    changed,
    repairs,
    criticalViolation,
  };
}

function enforceMaxQuestions(
  text: string,
  maxQuestions: number,
): { text: string; changed: boolean } {
  if (!Number.isFinite(maxQuestions) || maxQuestions < 0) {
    return { text, changed: false };
  }
  let count = 0;
  let changed = false;
  const chars = Array.from(String(text || ""));
  for (let i = 0; i < chars.length; i += 1) {
    if (chars[i] !== "?") continue;
    count += 1;
    if (count > maxQuestions) {
      chars[i] = ".";
      changed = true;
    }
  }
  return { text: chars.join(""), changed };
}

function enforceQuoteStyle(params: {
  text: string;
  quoteStyles?: QuoteStylesBank;
  language: "en" | "pt" | "es";
}): { text: string; changed: boolean; warnings: string[]; repairs: string[] } {
  const warnings: string[] = [];
  const repairs: string[] = [];
  const lines = String(params.text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return { text: "", changed: false, warnings, repairs };
  }

  const maxLines = toPositiveInt(params.quoteStyles?.config?.maxLines) || 8;
  let quoteLines = lines.map((line) =>
    line.startsWith(">") ? line : `> ${line}`,
  );
  if (quoteLines.length > maxLines) {
    quoteLines = quoteLines.slice(0, maxLines);
    repairs.push("QUOTE_MAX_LINES_ENFORCED");
  }
  const out = quoteLines.join("\n").trim();

  const requireAttribution =
    params.quoteStyles?.config?.requireAttribution === true;
  const hasAttribution =
    /(?:^|\n)\s*(?:source|fonte|fuente)\s*:/i.test(out) ||
    /(?:^|\n)\s*[-–—]\s+/.test(out);
  if (requireAttribution && !hasAttribution) {
    warnings.push("QUOTE_ATTRIBUTION_MISSING");
  }

  return {
    text: out,
    changed: out !== params.text.trim(),
    warnings,
    repairs,
  };
}

function validateProvenanceAgainstEvidenceMap(params: {
  provenance?: ChatProvenanceDTO | null;
  evidenceMap?: Array<{
    evidenceId: string;
    documentId: string;
    locationKey: string;
    snippetHash: string;
  }>;
  required: boolean;
}): { ok: boolean; failureCode?: string; warnings: string[] } {
  if (!params.required) return { ok: true, warnings: [] };
  const provenance = params.provenance || null;
  const evidenceMap = Array.isArray(params.evidenceMap)
    ? params.evidenceMap
    : [];
  if (!provenance || provenance.snippetRefs.length === 0) {
    return { ok: false, failureCode: "missing_provenance", warnings: [] };
  }
  if (evidenceMap.length === 0) {
    return { ok: false, failureCode: "missing_evidence_map", warnings: [] };
  }
  const map = new Map(
    evidenceMap.map((entry) => [
      String(entry.evidenceId || "").trim(),
      {
        documentId: String(entry.documentId || "").trim(),
        locationKey: String(entry.locationKey || "").trim(),
        snippetHash: String(entry.snippetHash || "").trim(),
      },
    ]),
  );

  for (const ref of provenance.snippetRefs) {
    const key = String(ref.evidenceId || "").trim();
    const mapped = map.get(key);
    if (!mapped) {
      return {
        ok: false,
        failureCode: "evidence_map_mismatch",
        warnings: ["PROVENANCE_REF_NOT_IN_EVIDENCE_MAP"],
      };
    }
    if (
      mapped.documentId !== String(ref.documentId || "").trim() ||
      mapped.locationKey !== String(ref.locationKey || "").trim()
    ) {
      return {
        ok: false,
        failureCode: "evidence_map_mismatch",
        warnings: ["PROVENANCE_REF_LOCATION_MISMATCH"],
      };
    }
    if (mapped.snippetHash !== String(ref.snippetHash || "").trim()) {
      return {
        ok: false,
        failureCode: "evidence_map_hash_mismatch",
        warnings: ["PROVENANCE_REF_HASH_MISMATCH"],
      };
    }
  }
  return { ok: true, warnings: [] };
}

function getSourceButtonsCount(attachments: Attachment[] = []): number {
  return attachments.filter(
    (a) => a && (a as Record<string, unknown>).type === "source_buttons",
  ).length;
}

function normalizeAttachmentType(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function filterAttachmentsByUiPolicy(
  attachments: Attachment[],
  policy: {
    allowedTypes?: string[];
    disallowedTypes?: string[];
    suppressActions?: boolean;
  },
): {
  attachments: Attachment[];
  removed: number;
} {
  const allowed = new Set(
    (Array.isArray(policy.allowedTypes) ? policy.allowedTypes : [])
      .map((entry) => normalizeAttachmentType(entry))
      .filter(Boolean),
  );
  const disallowed = new Set(
    (Array.isArray(policy.disallowedTypes) ? policy.disallowedTypes : [])
      .map((entry) => normalizeAttachmentType(entry))
      .filter(Boolean),
  );
  if (policy.suppressActions) {
    disallowed.add("action");
    disallowed.add("actions");
  }
  if (allowed.size < 1 && disallowed.size < 1) {
    return { attachments, removed: 0 };
  }

  const filtered = attachments.filter((attachment) => {
    const payload = asObjectRecord(attachment);
    if (!payload) return false;
    const type = normalizeAttachmentType(payload.type);
    if (!type) return false;
    if (disallowed.has(type)) return false;
    if (allowed.size > 0 && !allowed.has(type)) return false;
    return true;
  });
  return {
    attachments: filtered,
    removed: Math.max(0, attachments.length - filtered.length),
  };
}

function asObjectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseBoolish(input: unknown): boolean {
  if (input === true) return true;
  if (typeof input === "number") return Number.isFinite(input) && input > 0;
  const normalized = String(input || "")
    .trim()
    .toLowerCase();
  return (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "on"
  );
}

function resolveUiContractsMap(
  bank: UIContractsBank | undefined,
): Record<string, Record<string, unknown>> {
  const config = asObjectRecord(bank?.config);
  const contracts = asObjectRecord(config?.contracts);
  if (!contracts) return {};
  const out: Record<string, Record<string, unknown>> = {};
  for (const [key, value] of Object.entries(contracts)) {
    const asRecord = asObjectRecord(value);
    if (!asRecord) continue;
    out[String(key || "").trim().toLowerCase()] = asRecord;
  }
  return out;
}

function resolveUiContractIdFromAnswerMode(answerMode: unknown): string | null {
  const normalized = String(answerMode || "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.startsWith("doc_grounded")) return "doc_grounded";
  if (normalized === "general_answer") return "conversation";
  return normalized;
}

function resolveUiModeContract(
  bank: UIContractsBank | undefined,
  answerMode: unknown,
): Record<string, unknown> | null {
  const contractId = resolveUiContractIdFromAnswerMode(answerMode);
  if (!contractId) return null;
  const contracts = resolveUiContractsMap(bank);
  return contracts[contractId] || null;
}

function normalizeShapeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeShape(entry))
    .filter(Boolean);
}

function shouldEnforceAnalyticalStructure(
  ctx: ResponseContractContext,
): boolean {
  const signals =
    ctx.signals && typeof ctx.signals === "object" ? ctx.signals : null;
  if (!signals) return false;
  if (parseBoolish((signals as Record<string, unknown>).enforceStructuredAnswer))
    return true;
  const queryProfile = String(
    (signals as Record<string, unknown>).queryProfile || "",
  )
    .trim()
    .toLowerCase();
  return queryProfile === "analytical";
}

function parseLocationFromLocationKey(rawLocationKey: unknown): {
  page: number | null;
  chunk: number | null;
} {
  const locationKey = String(rawLocationKey || "").trim();
  if (!locationKey) return { page: null, chunk: null };
  const pageMatch = locationKey.match(/\|p:(-?\d+)/i);
  const chunkMatch = locationKey.match(/\|c:(-?\d+)/i);
  const page = pageMatch ? Number(pageMatch[1] || Number.NaN) : Number.NaN;
  const chunk = chunkMatch ? Number(chunkMatch[1] || Number.NaN) : Number.NaN;
  return {
    page: Number.isFinite(page) && page > 0 ? page : null,
    chunk: Number.isFinite(chunk) && chunk >= 0 ? chunk : null,
  };
}

function listSourceButtons(attachments: Attachment[] = []): Array<Record<string, unknown>> {
  const buttons: Array<Record<string, unknown>> = [];
  for (const attachment of attachments) {
    const payload = asObjectRecord(attachment);
    if (!payload) continue;
    if (String(payload.type || "").trim().toLowerCase() !== "source_buttons")
      continue;
    const items = Array.isArray(payload.buttons) ? payload.buttons : [];
    for (const item of items) {
      const button = asObjectRecord(item);
      if (button) buttons.push(button);
    }
  }
  return buttons;
}

function buildSourceLabel(button: Record<string, unknown>): string {
  const title = String(
    button.title || button.filename || button.name || "Document",
  ).trim();
  const location = asObjectRecord(button.location);
  const locationType = String(location?.type || "")
    .trim()
    .toLowerCase();
  const locationValue = location?.value;
  const explicitLocationLabel = String(location?.label || "").trim();
  const fallbackFromType =
    locationType === "page" && Number.isFinite(Number(locationValue))
      ? `Page ${Number(locationValue)}`
      : locationType === "slide" && Number.isFinite(Number(locationValue))
        ? `Slide ${Number(locationValue)}`
        : locationType === "sheet" && String(locationValue || "").trim()
          ? String(locationValue || "").trim()
          : locationType === "cell" && String(locationValue || "").trim()
            ? String(locationValue || "").trim().toUpperCase()
            : locationType === "section" && String(locationValue || "").trim()
              ? String(locationValue || "").trim()
              : "";
  const locationFromKey = parseLocationFromLocationKey(button.locationKey);
  const fallbackFromKey = locationFromKey.page
    ? `Page ${locationFromKey.page}`
    : locationFromKey.chunk !== null
      ? `chunk_${locationFromKey.chunk}`
      : "";
  const locationLabel =
    explicitLocationLabel || fallbackFromType || fallbackFromKey;
  return locationLabel ? `${title} | ${locationLabel}` : title;
}

function analyticalSynthesisLine(language: "en" | "pt" | "es"): string {
  if (language === "pt") {
    return "Em resumo, esta resposta está limitada às evidências citadas nos documentos.";
  }
  if (language === "es") {
    return "En resumen, esta respuesta está limitada a la evidencia citada en los documentos.";
  }
  return "In summary, this answer is constrained to the cited document evidence.";
}

function analyticalFollowupLine(language: "en" | "pt" | "es"): string {
  if (language === "pt") {
    return "Se quiser, também posso detalhar isso por seção do documento.";
  }
  if (language === "es") {
    return "Si quieres, también puedo desglosarlo por sección del documento.";
  }
  return "If you'd like, I can also break this down by document section.";
}

function enforceAnalyticalStructuredTemplate(
  text: string,
  attachments: Attachment[],
  language: "en" | "pt" | "es",
): string {
  const normalizedText = String(text || "").trim();
  const directMatch = normalizedText.match(
    /direct answer:\s*([\s\S]*?)(?:key evidence:|sources used:|$)/i,
  );
  let directAnswer = directMatch ? String(directMatch[1] || "").trim() : "";
  if (!directAnswer) {
    const firstSentence = normalizedText.match(/(.+?[.!?])(?:\s|$)/);
    directAnswer = firstSentence
      ? String(firstSentence[1] || "").trim()
      : normalizedText || "Not enough evidence in the provided documents.";
  }

  const evidenceLines: string[] = [];
  const sourceLines: string[] = [];
  const seenEvidence = new Set<string>();
  const seenSources = new Set<string>();
  const sourceButtons = listSourceButtons(attachments);

  for (const button of sourceButtons) {
    const label = buildSourceLabel(button);
    const evidenceLine = label
      ? `Evidence referenced from ${label}.`
      : null;
    if (evidenceLine && !seenEvidence.has(evidenceLine)) {
      seenEvidence.add(evidenceLine);
      evidenceLines.push(evidenceLine);
      if (evidenceLines.length >= 2) break;
    }
  }
  if (evidenceLines.length === 0) {
    evidenceLines.push(
      "Evidence references were available only as source metadata.",
    );
  }

  for (const button of sourceButtons) {
    const label = buildSourceLabel(button);
    if (!label || seenSources.has(label)) continue;
    seenSources.add(label);
    sourceLines.push(label);
    if (sourceLines.length >= 2) break;
  }
  if (sourceLines.length === 0) {
    sourceLines.push("No source metadata provided");
  }

  return [
    `Direct answer: ${directAnswer}`,
    "Key evidence:",
    ...evidenceLines.map((line) => `- ${line}`),
    "Sources used:",
    ...sourceLines.map((line) => `- ${line}`),
    analyticalSynthesisLine(language),
    analyticalFollowupLine(language),
  ].join("\n");
}

// -----------------------------------------------------------------------------
// Main Service
// -----------------------------------------------------------------------------

export class ResponseContractEnforcerService {
  private renderPolicy?: RenderPolicyBank;
  private uiContracts?: UIContractsBank;
  private uiReceiptShapes?: UiReceiptShapesBank;
  private bannedPhrases?: BannedPhrasesBank;
  private truncation?: TruncationLimitsBank;
  private bulletRules?: BulletRulesBank;
  private tableRules?: TableRulesBank;
  private quoteStyles?: QuoteStylesBank;
  private citationStyles?: CitationStylesBank;
  private listStyles?: ListStylesBank;
  private tableStyles?: TableStylesBank;
  private answerStylePolicy?: AnswerStylePolicyBank;
  private boldingRules?: BoldingRulesBank;
  private operatorContracts?: OperatorContractsBank;
  private operatorOutputShapes?: OperatorOutputShapesBank;
  private uiContractsLoadWarnings: string[] = [];
  private readonly uiContractInterpreter = new UiContractInterpreterService();
  private readonly uiReceiptValidator = new UiReceiptContractValidatorService();

  constructor() {
    this.reloadBanks();
  }

  private buildFallbackUiContracts(): UIContractsBank {
    return {
      _meta: {
        id: "ui_contracts_fallback",
        version: "0.0.0-fallback",
      },
      config: {
        enabled: false,
        contracts: {},
      },
      rules: [],
    };
  }

  private shouldFailClosedUiContracts(): boolean {
    const override = String(process.env.UI_CONTRACTS_FAIL_CLOSED || "").trim();
    if (override) return parseBoolish(override);
    return process.env.NODE_ENV === "production" || parseBoolish(process.env.CI);
  }

  private shouldAllowLegacyUiContracts(): boolean {
    return parseBoolish(process.env.UI_CONTRACTS_ALLOW_LEGACY);
  }

  private validateUiContractsCanonicalShape(
    bank: UIContractsBank,
    strictMode: boolean,
  ): string[] {
    const warnings: string[] = [];
    const configContracts = asObjectRecord(asObjectRecord(bank.config)?.contracts);
    const legacyContracts = asObjectRecord(bank.contracts);
    const hasConfigContracts =
      !!configContracts && Object.keys(configContracts).length > 0;
    const hasLegacyContracts =
      !!legacyContracts && Object.keys(legacyContracts).length > 0;

    if (hasConfigContracts && hasLegacyContracts) {
      warnings.push("UI_CONTRACT_DUPLICATE_CONTRACT_PATHS_CONFIG_WINS");
      if (!this.shouldAllowLegacyUiContracts() && strictMode) {
        throw new Error(
          "ui_contracts contains both config.contracts and legacy contracts path",
        );
      }
    } else if (!hasConfigContracts && hasLegacyContracts) {
      warnings.push("UI_CONTRACT_LEGACY_CONTRACT_PATH");
      if (!this.shouldAllowLegacyUiContracts()) {
        if (strictMode) {
          throw new Error(
            "ui_contracts legacy contracts path is not allowed in strict mode",
          );
        }
        warnings.push("UI_CONTRACT_LEGACY_CONTRACT_PATH_NOT_ALLOWED");
      }
    }

    if (!hasConfigContracts && !hasLegacyContracts) {
      const message = "ui_contracts has no contracts configured";
      if (strictMode) throw new Error(message);
      warnings.push("UI_CONTRACT_MISSING_CONTRACTS");
    }

    return warnings;
  }

  reloadBanks(): void {
    this.renderPolicy = getBank<RenderPolicyBank>("render_policy");
    this.uiContractsLoadWarnings = [];
    const strictUiContracts = this.shouldFailClosedUiContracts();
    try {
      let rawUiContracts: unknown;
      try {
        rawUiContracts = getBank<unknown>("ui_contracts");
      } catch {
        rawUiContracts = getOptionalBank<unknown>("ui_contracts");
      }
      if (!rawUiContracts) {
        throw new Error("ui_contracts bank not found");
      }
      this.uiContracts = UIContractsSchema.parse(rawUiContracts) as UIContractsBank;
      this.uiContractsLoadWarnings.push(
        ...this.validateUiContractsCanonicalShape(
          this.uiContracts,
          strictUiContracts,
        ),
      );
    } catch (error) {
      if (strictUiContracts) {
        const reason =
          error instanceof Error ? error.message : "unknown ui_contracts load failure";
        throw new Error(`ui_contracts load failed in strict mode: ${reason}`);
      }
      this.uiContracts = this.buildFallbackUiContracts();
      this.uiContractsLoadWarnings.push(
        "UI_CONTRACTS_PARSE_FAILED_FAIL_OPEN_FALLBACK",
      );
    }
    const uiReceiptRaw = getOptionalBank<unknown>("ui_receipt_shapes");
    if (!uiReceiptRaw) {
      this.uiReceiptShapes = undefined;
    } else {
      try {
        this.uiReceiptShapes = UIReceiptShapesSchema.parse(
          uiReceiptRaw,
        ) as UiReceiptShapesBank;
      } catch {
        // Optional bank: fail open on schema mismatch, runtime guardrails still apply.
        this.uiReceiptShapes = uiReceiptRaw as UiReceiptShapesBank;
      }
    }
    this.bannedPhrases = getBank<BannedPhrasesBank>("banned_phrases");
    this.truncation = getBank<TruncationLimitsBank>("truncation_and_limits");
    this.bulletRules = getBank<BulletRulesBank>("bullet_rules");
    this.tableRules = getBank<TableRulesBank>("table_rules");
    this.quoteStyles = getOptionalBank<QuoteStylesBank>("quote_styles") || undefined;
    this.citationStyles =
      getOptionalBank<CitationStylesBank>("citation_styles") || undefined;
    this.listStyles = getOptionalBank<ListStylesBank>("list_styles") || undefined;
    this.tableStyles = getOptionalBank<TableStylesBank>("table_styles") || undefined;
    this.answerStylePolicy = getBank<AnswerStylePolicyBank>("answer_style_policy");
    this.boldingRules = getOptionalBank<BoldingRulesBank>("bolding_rules") || undefined;
    this.operatorContracts =
      getOptionalBank<OperatorContractsBank>("operator_contracts") || undefined;
    this.operatorOutputShapes =
      getOptionalBank<OperatorOutputShapesBank>("operator_output_shapes") ||
      undefined;
  }

  private resolveOperatorContract(operatorId: unknown): {
    preferredAnswerMode: string | null;
    defaultShape: string | null;
    allowedShapes: string[];
  } {
    const normalizedOperator = normalizeOperatorId(operatorId);
    if (!normalizedOperator) {
      return {
        preferredAnswerMode: null,
        defaultShape: null,
        allowedShapes: [],
      };
    }

    let contractEntry: OperatorContractEntry | null = null;
    const contracts = this.operatorContracts?.operators;
    if (Array.isArray(contracts)) {
      contractEntry =
        contracts.find(
          (entry) => normalizeOperatorId(entry?.id) === normalizedOperator,
        ) || null;
    } else if (contracts && typeof contracts === "object") {
      for (const [id, entry] of Object.entries(contracts)) {
        if (normalizeOperatorId(id) === normalizedOperator) {
          contractEntry = entry;
          break;
        }
      }
    }

    let shapeEntry: OperatorOutputShapeEntry | null = null;
    const mapping =
      this.operatorOutputShapes?.mapping &&
      typeof this.operatorOutputShapes.mapping === "object"
        ? this.operatorOutputShapes.mapping
        : {};
    for (const [id, entry] of Object.entries(mapping)) {
      if (normalizeOperatorId(id) === normalizedOperator) {
        shapeEntry = entry;
        break;
      }
    }

    const preferredAnswerMode =
      String(contractEntry?.preferredAnswerMode || "").trim() || null;
    const defaultShape =
      normalizeShape(shapeEntry?.defaultShape) ||
      normalizeShape(contractEntry?.outputs?.primaryShape) ||
      null;
    const allowedShapes = uniqueShapes([
      ...(Array.isArray(shapeEntry?.allowedShapes)
        ? shapeEntry!.allowedShapes
        : []),
      ...(Array.isArray(contractEntry?.outputs?.allowedShapes)
        ? contractEntry!.outputs!.allowedShapes!
        : []),
      defaultShape,
    ]);

    return { preferredAnswerMode, defaultShape, allowedShapes };
  }

  private resolveSoftTokenLimitInternal(ctx: ResponseContractContext): number {
    const explicit = toPositiveInt(ctx.constraints?.maxOutputTokens);
    if (explicit) return explicit;

    const modeLimits =
      this.truncation?.answerModeLimits?.[String(ctx.answerMode || "")];
    const modeTokenLimit =
      toPositiveInt(modeLimits?.maxOutputTokens) ??
      toPositiveInt(modeLimits?.maxOutputTokensDefault) ??
      toPositiveInt(modeLimits?.maxTokens) ??
      toPositiveInt(modeLimits?.maxTokensDefault);
    if (modeTokenLimit) return modeTokenLimit;

    const charBasedModeLimit =
      toPositiveInt(modeLimits?.maxChars) ??
      toPositiveInt(modeLimits?.maxCharsDefault);
    if (charBasedModeLimit)
      return Math.max(120, Math.floor(charBasedModeLimit / 4));

    return resolveOutputTokenBudget({
      answerMode: ctx.answerMode,
      outputLanguage: ctx.language,
      routeStage: "final",
      operator: ctx.operator,
    }).maxOutputTokens;
  }

  private resolveHardTokenLimitInternal(
    ctx: ResponseContractContext,
    softLimit: number,
  ): number {
    const explicit = toPositiveInt(ctx.constraints?.hardMaxOutputTokens);
    if (explicit) return explicit;

    const bankHard = toPositiveInt(
      this.truncation?.globalLimits?.maxResponseTokensHard,
    );
    if (bankHard) return bankHard;

    const expected = toPositiveInt(ctx.constraints?.expectedOutputTokens);
    if (expected) return Math.max(softLimit, Math.ceil(expected * 1.15));

    return Math.max(Math.ceil(softLimit * 1.2), softLimit + 120);
  }

  private resolveHardCharLimitInternal(ctx: ResponseContractContext): number {
    const configuredLimit =
      toPositiveInt(this.truncation?.globalLimits?.maxResponseCharsHard) ??
      toPositiveInt(this.truncation?.config?.maxCharsHard);
    if (configuredLimit) return configuredLimit;

    const hardOutputTokens = this.resolveHardTokenLimitInternal(
      ctx,
      this.resolveSoftTokenLimitInternal(ctx),
    );
    return Math.max(1800, Math.ceil(hardOutputTokens * 4.5));
  }

  private resolveModeCharLimit(ctx: ResponseContractContext): number | null {
    const modeLimits =
      this.truncation?.answerModeLimits?.[String(ctx.answerMode || "")];
    return (
      toPositiveInt(modeLimits?.maxChars) ??
      toPositiveInt(modeLimits?.maxCharsDefault)
    );
  }

  enforce(
    draft: DraftResponse,
    ctx: ResponseContractContext,
  ): EnforcedResponse {
    const repairs: string[] = [];
    const warnings: string[] = [...this.uiContractsLoadWarnings];
    let attachments: Attachment[] = Array.isArray(draft.attachments)
      ? draft.attachments
      : [];
    let content = draft.content || "";
    const listStyleEnabled = this.listStyles?.config?.enabled !== false;
    const tableStyleEnabled = this.tableStyles?.config?.enabled !== false;
    const requiresProvenance = String(ctx.answerMode || "").startsWith(
      "doc_grounded",
    );
    let provenanceEnforcement:
      | EnforcedResponse["enforcement"]["provenance"]
      | undefined;
    const operatorContract = this.resolveOperatorContract(ctx.operator);
    let effectiveOutputShape =
      normalizeShape(ctx.constraints?.outputShape) ||
      operatorContract.defaultShape;
    const requestedStyleProfile = String(
      (ctx.signals as Record<string, unknown> | null)?.styleProfile || "",
    )
      .trim()
      .toLowerCase();
    let styleMaxQuestions: number | null = null;
    let styleProfileMaxChars: number | null = null;
    let uiDecision: UiContractDecision | null = null;
    let uiReceiptTrace:
      | EnforcedResponse["enforcement"]["uiReceiptContracts"]
      | undefined;
    const buildUiTrace = () => ({
      ...(uiDecision
        ? {
            uiContracts: {
              version: uiDecision.version,
              appliedRuleIds: uiDecision.appliedRuleIds,
              appliedContracts: uiDecision.appliedContracts,
            },
          }
        : {}),
      ...(uiReceiptTrace ? { uiReceiptContracts: uiReceiptTrace } : {}),
    });

    if (
      operatorContract.preferredAnswerMode &&
      String(ctx.answerMode || "").trim() !==
        operatorContract.preferredAnswerMode
    ) {
      warnings.push("ANSWER_MODE_CONTRACT_DRIFT");
    }

    // 0) Normalize whitespace/newlines
    const maxNL =
      this.renderPolicy?.config?.markdown?.maxConsecutiveNewlines ?? 2;
    content = normalizeNewlines(content, maxNL);

    uiDecision = this.uiContractInterpreter.resolve({
      bank: this.uiContracts,
      answerMode: String(ctx.answerMode || ""),
      language: ctx.language,
      signals: ctx.signals,
      metrics: {},
      content,
    });
    const resolvedUiDecision = uiDecision;
    if (resolvedUiDecision.warnings.length > 0) {
      warnings.push(...resolvedUiDecision.warnings);
    }
    const uiModeContract = resolveUiModeContract(this.uiContracts, ctx.answerMode);
    const uiAllowedShapes = normalizeShapeList(uiModeContract?.allowedOutputShapes);
    if (uiAllowedShapes.length > 0) {
      if (!effectiveOutputShape) {
        effectiveOutputShape = uiAllowedShapes[0] || null;
        warnings.push("OUTPUT_SHAPE_DEFAULTED_FROM_UI_CONTRACT");
      } else if (!uiAllowedShapes.includes(effectiveOutputShape)) {
        warnings.push("OUTPUT_SHAPE_NOT_ALLOWED_FOR_UI_CONTRACT");
        effectiveOutputShape = uiAllowedShapes[0] || null;
      }
    }
    if (
      effectiveOutputShape &&
      operatorContract.allowedShapes.length > 0 &&
      !operatorContract.allowedShapes.includes(effectiveOutputShape)
    ) {
      warnings.push("OUTPUT_SHAPE_NOT_ALLOWED_FOR_OPERATOR");
      const intersection = operatorContract.allowedShapes
        .map((shape) => normalizeShape(shape))
        .filter((shape) =>
          uiAllowedShapes.length > 0 ? uiAllowedShapes.includes(shape) : true,
        );
      if (intersection.length > 0) {
        effectiveOutputShape = intersection[0];
        warnings.push("OUTPUT_SHAPE_CONTRACT_INTERSECTION_APPLIED");
      } else {
        effectiveOutputShape = normalizeShape(operatorContract.defaultShape);
      }
    }
    if (
      effectiveOutputShape &&
      uiAllowedShapes.length > 0 &&
      !uiAllowedShapes.includes(effectiveOutputShape)
    ) {
      return {
        content: "",
        attachments,
        enforcement: {
          repairs,
          warnings: [...warnings, "OUTPUT_SHAPE_CONTRACT_CONFLICT"],
          blocked: true,
          reasonCode: "output_shape_contract_conflict",
          ...buildUiTrace(),
          ...(provenanceEnforcement ? { provenance: provenanceEnforcement } : {}),
        },
      };
    }
    if (
      String(ctx.answerMode || "").trim() === "nav_pills" &&
      uiAllowedShapes.length > 0 &&
      !uiAllowedShapes.includes("button_only")
    ) {
      return {
        content: "",
        attachments,
        enforcement: {
          repairs,
          warnings: [...warnings, "NAV_PILLS_OUTPUT_SHAPE_CONTRACT_CONFLICT"],
          blocked: true,
          reasonCode: "nav_pills_output_shape_contract_conflict",
          ...buildUiTrace(),
          ...(provenanceEnforcement ? { provenance: provenanceEnforcement } : {}),
        },
      };
    }
    const uiReceiptValidation = this.uiReceiptValidator.validate({
      bank: this.uiReceiptShapes,
      domain:
        String(
          (ctx.signals as Record<string, unknown> | null)?.classifiedDomain ||
            (ctx.signals as Record<string, unknown> | null)?.domain ||
            "",
        )
          .trim()
          .toLowerCase() || undefined,
      operator: ctx.operator,
      intentFamily: ctx.intentFamily,
      answerMode: String(ctx.answerMode || ""),
      requireHard: parseBoolish(
        (ctx.signals as Record<string, unknown> | null)?.enforceReceiptContracts,
      ),
      draft: {
        receipts: draft.receipts,
        renderPlan: draft.renderPlan || undefined,
        editPlan: draft.editPlan || undefined,
        undoToken: draft.undoToken || undefined,
      },
    });
    if (uiReceiptValidation.matchedMappingId) {
      uiReceiptTrace = {
        version: uiReceiptValidation.version,
        mappingId: uiReceiptValidation.matchedMappingId,
      };
    }
    if (uiReceiptValidation.warnings.length > 0) {
      warnings.push(...uiReceiptValidation.warnings);
    }
    if (uiReceiptValidation.blocked) {
      return {
        content: "",
        attachments,
        enforcement: {
          repairs,
          warnings,
          blocked: true,
          reasonCode:
            uiReceiptValidation.reasonCode || "ui_receipt_contract_missing_fields",
          ...buildUiTrace(),
          ...(provenanceEnforcement
            ? { provenance: provenanceEnforcement }
            : {}),
        },
      };
    }
    if (resolvedUiDecision.shouldHardBlock) {
      return {
        content: "",
        attachments,
        enforcement: {
          repairs,
          warnings,
          blocked: true,
          reasonCode:
            resolvedUiDecision.hardBlockReasonCode || "ui_contract_hard_block",
          ...buildUiTrace(),
          ...(provenanceEnforcement
            ? { provenance: provenanceEnforcement }
            : {}),
        },
      };
    }
    if (resolvedUiDecision.suppressActionLanguage) {
      const suppressed = suppressActionLanguage(
        content,
        resolvedUiDecision.suppressRegexes,
      );
      if (suppressed.changed) {
        repairs.push("UI_ACTION_LANGUAGE_SUPPRESSED");
        content = suppressed.text;
      }
    }
    if (
      ctx.answerMode !== "nav_pills" &&
      resolvedUiDecision.activeContractDisallowedTextPatterns.length > 0
    ) {
      const strippedByContract = applyDisallowedPatterns(
        content,
        resolvedUiDecision.activeContractDisallowedTextPatterns,
      );
      if (strippedByContract.changed) {
        repairs.push("UI_CONTRACT_DISALLOWED_PATTERNS_STRIPPED");
        content = strippedByContract.text;
      }
    }
    const attachmentPolicyApplied = filterAttachmentsByUiPolicy(attachments, {
      allowedTypes: resolvedUiDecision.attachmentPolicy.allowedTypes,
      disallowedTypes: resolvedUiDecision.attachmentPolicy.disallowedTypes,
      suppressActions: resolvedUiDecision.attachmentPolicy.suppressActions,
    });
    if (attachmentPolicyApplied.removed > 0) {
      repairs.push("UI_CONTRACT_ATTACHMENTS_FILTERED");
      warnings.push(
        `UI_CONTRACT_ATTACHMENTS_REMOVED:${attachmentPolicyApplied.removed}`,
      );
      attachments = attachmentPolicyApplied.attachments;
    }

    // 1) nav_pills contract
    if (ctx.answerMode === "nav_pills") {
      // No inline sources headers or lists
      if (resolvedUiDecision.navPills.noSourcesHeader) {
        const s1 = stripInlineSourcesSections(content);
        if (s1.changed) repairs.push("STRIPPED_INLINE_SOURCES_HEADER");
        content = s1.text;
      }

      const s2 = stripInlineFileLists(content);
      if (s2.changed) repairs.push("STRIPPED_INLINE_FILE_LIST");
      content = s2.text;
      const strippedPatterns = applyDisallowedPatterns(
        content,
        resolvedUiDecision.navPills.disallowedTextPatterns,
      );
      if (strippedPatterns.changed) {
        repairs.push("NAV_PILLS_DISALLOWED_PATTERNS_STRIPPED");
        content = strippedPatterns.text;
      }

      const intro = keepFirstNSentences(
        content,
        resolvedUiDecision.navPills.maxIntroSentences,
        resolvedUiDecision.navPills.maxIntroChars,
      );
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
            ...buildUiTrace(),
            ...(provenanceEnforcement
              ? { provenance: provenanceEnforcement }
              : {}),
          },
        };
      }

      return {
        content,
        attachments,
        enforcement: {
          repairs,
          warnings,
          blocked: false,
          ...buildUiTrace(),
          ...(provenanceEnforcement
            ? { provenance: provenanceEnforcement }
            : {}),
        },
      };
    }

    // 1b) Apply operator-linked output shape contracts in non-nav modes.
    // Skip button_only truncation for doc_grounded modes — those produce
    // full content answers, not navigation buttons.
    const isDocGrounded = String(ctx.answerMode || "").startsWith(
      "doc_grounded",
    );
    if (effectiveOutputShape === "button_only" && !isDocGrounded) {
      const s1 = stripInlineSourcesSections(content);
      if (s1.changed) repairs.push("BUTTON_ONLY_STRIPPED_INLINE_SOURCES");
      content = s1.text;
      const s2 = stripInlineFileLists(content);
      if (s2.changed) repairs.push("BUTTON_ONLY_STRIPPED_INLINE_FILE_LIST");
      content = s2.text;
      const noTables = stripTables(content);
      if (noTables.changed) repairs.push("BUTTON_ONLY_STRIPPED_TABLES");
      content = noTables.text;
      const intro = keepFirstSentence(content, 110);
      if (intro !== content) repairs.push("BUTTON_ONLY_BODY_TRIMMED");
      content = intro;
    } else if (effectiveOutputShape === "quote" && content.trim()) {
      const quoted = enforceQuoteStyle({
        text: content,
        quoteStyles: this.quoteStyles,
        language: ctx.language,
      });
      if (quoted.changed) repairs.push("QUOTE_SHAPE_ENFORCED");
      if (quoted.repairs.length > 0) repairs.push(...quoted.repairs);
      if (quoted.warnings.length > 0) warnings.push(...quoted.warnings);
      content = quoted.text;
    } else if (effectiveOutputShape === "steps" && content.trim()) {
      if (!/^\s*\d+\.\s+/m.test(content)) {
        const steps = toNumberedSteps(content);
        if (steps) {
          content = steps;
          repairs.push("STEPS_SHAPE_ENFORCED");
        }
      }
    } else if (effectiveOutputShape === "file_list") {
      const stripped = stripInlineFileLists(content);
      if (stripped.changed) {
        repairs.push("FILE_LIST_SHAPE_STRIPPED_INLINE_LIST");
        content = stripped.text;
      }
      if (content.length > 220) {
        const shortened = limitChars(content, 220);
        if (shortened.changed) repairs.push("FILE_LIST_SHAPE_BODY_TRIMMED");
        content = shortened.text;
      }
    }

    if (requiresProvenance) {
      let provenanceDecision:
        | EnforcedResponse["enforcement"]["provenance"]
        | undefined;
      const provenanceCheck = validateChatProvenance({
        provenance: ctx.provenance,
        answerMode: ctx.answerMode as string as import("../../../modules/chat/domain/chat.contracts").AnswerMode,
        allowedDocumentIds: ctx.allowedDocumentIds || [],
      });
      if (!provenanceCheck.ok) {
        const reasonCode = provenanceCheck.failureCode || "missing_provenance";
        provenanceDecision = {
          action: "block",
          reasonCode,
          severity: "error",
        };
        return {
          content: "",
          attachments,
          enforcement: {
            repairs,
            warnings: [...warnings, ...provenanceCheck.warnings],
            blocked: true,
            reasonCode,
            ...buildUiTrace(),
            ...(provenanceDecision
              ? { provenance: provenanceDecision }
              : {}),
          },
        };
      }

      if (provenanceCheck.ok) {
        const mapCheck = validateProvenanceAgainstEvidenceMap({
          provenance: ctx.provenance,
          evidenceMap: ctx.evidenceMap,
          required: requiresProvenance,
        });
        if (!mapCheck.ok) {
          const mapReasonCode = mapCheck.failureCode || "missing_evidence_map";
          provenanceDecision = {
            action: "block",
            reasonCode: mapReasonCode,
            severity: "error",
          };
          return {
            content: "",
            attachments,
            enforcement: {
              repairs,
              warnings: [...warnings, ...mapCheck.warnings],
              blocked: true,
              reasonCode: mapReasonCode,
              ...buildUiTrace(),
              ...(provenanceDecision
                ? { provenance: provenanceDecision }
                : {}),
            },
          };
        }
      }
      provenanceEnforcement = provenanceDecision;
    }


    // 2) Strip "Sources:" leakage (all non-nav modes)
    {
      const s = stripInlineSourcesSections(content);
      if (s.changed) repairs.push("STRIPPED_INLINE_SOURCES");
      content = s.text;
    }

    // 2b) Strip leaked inline citation artifacts from model text.
    {
      const citationStyleEnabled = this.citationStyles?.config?.enabled !== false;
      if (citationStyleEnabled) {
        const citations = stripInlineCitationArtifacts(content);
        if (citations.changed)
          repairs.push("STRIPPED_INLINE_CITATION_ARTIFACTS");
        content = citations.text;
      }
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
            ...buildUiTrace(),
            ...(provenanceEnforcement
              ? { provenance: provenanceEnforcement }
              : {}),
          },
        };
      }
      repairs.push("JSON_STRIPPED");
    }


    // 4) Normalize bullet lines before table/length checks.
    {
      if (listStyleEnabled) {
        const bullets = enforceBulletPolicies({
          text: content,
          answerMode: String(ctx.answerMode || ""),
          bulletRules: this.bulletRules,
          renderPolicy: this.renderPolicy,
        });
        if (bullets.changed) {
          repairs.push(...bullets.repairs);
          content = bullets.text;
        }
      }
    }

    // 5) Normalize markdown table separators early so pathological
    // dash runs do not consume token budget before truncation checks.
    {
      const normalizedTables = normalizeMarkdownTableSeparators(
        content,
        this.tableRules,
      );
      if (normalizedTables.changed) {
        repairs.push("TABLE_SEPARATOR_NORMALIZED");
        content = normalizedTables.text;
      }
      const sanitizedTables = sanitizeMarkdownTables(content);
      if (sanitizedTables.changed) {
        repairs.push("TABLE_LAYOUT_NORMALIZED");
        content = sanitizedTables.text;
      }
      if (tableStyleEnabled) {
        const tablePolicies = enforceTablePolicies({
          text: content,
          tableRules: this.tableRules,
          language: ctx.language,
        });
        if (tablePolicies.changed) {
          repairs.push(...tablePolicies.repairs);
          content = tablePolicies.text;
        }
        if (tablePolicies.criticalViolation) {
          warnings.push("TABLE_CONTRACT_VIOLATION_DEMOTED");
        }
      }
      const citationStyleEnabled = this.citationStyles?.config?.enabled !== false;
      if (citationStyleEnabled) {
        const citations = stripInlineCitationArtifacts(content);
        if (citations.changed) {
          repairs.push("STRIPPED_INLINE_CITATION_ARTIFACTS");
          content = citations.text;
        }
      }
    }


    // 5c) Apply answer-style policy contracts (mode suppressions, paragraph caps).
    {
      const style = enforceAnswerStylePolicies({
        text: content,
        answerMode: String(ctx.answerMode || ""),
        bank: this.answerStylePolicy,
        requestedProfile: requestedStyleProfile,
      });
      if (style.changed) {
        repairs.push(...style.repairs);
        content = style.text;
      }
      if (style.warnings.length > 0) warnings.push(...style.warnings);
      styleMaxQuestions = style.maxQuestions;
      styleProfileMaxChars = style.profileMaxChars;
    }


    // 5d) Enforce max-question constraint.
    {
      const maxQuestionsRule =
        this.renderPolicy?.enforcementRules?.rules &&
        Array.isArray(this.renderPolicy.enforcementRules.rules)
          ? this.renderPolicy.enforcementRules.rules.find(
              (rule: unknown) => String((rule as Record<string, unknown>)?.id || "").trim() === "RP6_MAX_ONE_QUESTION",
            )
          : null;
      const renderPolicyMaxQuestions =
        toPositiveInt(((maxQuestionsRule as Record<string, unknown> | null)?.then as Record<string, unknown> | undefined)?.maxQuestions) || 1;
      const uiContractMaxQuestions =
        uiDecision && Number.isFinite(Number(uiDecision.maxClarificationQuestions))
          ? Math.max(0, Math.floor(Number(uiDecision.maxClarificationQuestions)))
          : null;
      const effectiveMaxQuestions =
        typeof styleMaxQuestions === "number"
          ? Math.max(0, Math.min(renderPolicyMaxQuestions, styleMaxQuestions))
          : renderPolicyMaxQuestions;
      const finalMaxQuestions =
        typeof uiContractMaxQuestions === "number"
          ? Math.max(0, Math.min(effectiveMaxQuestions, uiContractMaxQuestions))
          : effectiveMaxQuestions;
      const limitedQuestions = enforceMaxQuestions(
        content,
        finalMaxQuestions,
      );
      if (limitedQuestions.changed) {
        repairs.push("MAX_QUESTIONS_ENFORCED");
        content = limitedQuestions.text;
      }
    }


    // 6) Enforce short constraints (if user requested short)
    if (
      ctx.constraints?.userRequestedShort ||
      (ctx.constraints?.maxSentences && ctx.constraints.maxSentences <= 3)
    ) {
      const requestedShortTokenLimit = toPositiveInt(
        ctx.constraints?.maxOutputTokens,
      );
      const shortTokenLimit = Math.max(
        24,
        requestedShortTokenLimit ??
          Math.min(this.resolveSoftTokenLimitInternal(ctx), 180),
      );
      const maxChars = resolveShortMaxChars(ctx, shortTokenLimit);
      const shortTokenLimited = trimTextToTokenBudget(
        content,
        shortTokenLimit,
        {
          preserveSentenceBoundary: true,
        },
      );
      if (shortTokenLimited.truncated) {
        repairs.push("SHORT_CONSTRAINT_TRIMMED_TOKENS");
      }
      content = shortTokenLimited.text;

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


    // 7) Token-aware hard max length (safety)
    const softTokenLimit = this.resolveSoftTokenLimitInternal(ctx);
    const softTokenLimited = trimTextToTokenBudget(content, softTokenLimit, {
      preserveSentenceBoundary: true,
    });
    if (softTokenLimited.truncated) {
      repairs.push("SOFT_MAX_TOKENS_TRIMMED");
    }
    content = softTokenLimited.text;

    const hardTokenLimit = this.resolveHardTokenLimitInternal(
      ctx,
      softTokenLimit,
    );
    const hardTokenLimited = trimTextToTokenBudget(content, hardTokenLimit, {
      preserveSentenceBoundary: true,
    });
    if (hardTokenLimited.truncated) {
      repairs.push("HARD_MAX_TOKENS_TRIMMED");
    }
    content = hardTokenLimited.text;

    // 7b) Char fallback guard (legacy safety net)
    const hardMaxChars = this.resolveHardCharLimitInternal(ctx);
    const hardLimited = limitChars(content, hardMaxChars);
    if (hardLimited.changed) repairs.push("HARD_MAX_CHARS_TRIMMED");
    content = hardLimited.text;

    const estimatedTokens = estimateTokenCount(content);
    if (estimatedTokens > hardTokenLimit) {
      const emergency = trimTextToTokenBudget(content, hardTokenLimit, {
        preserveSentenceBoundary: true,
      });
      if (emergency.truncated)
        repairs.push("HARD_MAX_TOKENS_EMERGENCY_TRIMMED");
      content = emergency.text;
    }


    // 7c) Apply answer-mode max char limit.
    {
      const modeMaxChars = this.resolveModeCharLimit(ctx);
      if (modeMaxChars) {
        const modeLimited = limitChars(content, modeMaxChars);
        if (modeLimited.changed) {
          repairs.push("MODE_MAX_CHARS_TRIMMED");
          content = modeLimited.text;
        }
      }
      if (styleProfileMaxChars) {
        const styleLimited = limitChars(content, styleProfileMaxChars);
        if (styleLimited.changed) {
          repairs.push("STYLE_PROFILE_MAX_CHARS_TRIMMED");
          content = styleLimited.text;
        }
      }
    }


    // 8) Remove banned phrases / leakage patterns.
    {
      const banned = applyBannedPhrasePolicies({
        text: content,
        bank: this.bannedPhrases,
        language: ctx.language,
      });
      if (banned.changed) {
        repairs.push("BANNED_PHRASES_APPLIED");
        for (const entry of banned.applied) {
          repairs.push(`BANNED_${entry.id}`);
        }
        content = banned.text;
      }
      if (banned.warnings.length > 0) warnings.push(...banned.warnings);
      if (banned.criticalResidual) {
        return {
          content: "",
          attachments,
          enforcement: {
            repairs,
            warnings: [...warnings, "BANNED_PHRASE_CRITICAL_RESIDUAL"],
            blocked: true,
            reasonCode: "banned_phrase_critical",
            ...buildUiTrace(),
            ...(provenanceEnforcement
              ? { provenance: provenanceEnforcement }
              : {}),
          },
        };
      }
    }

    // 8b) Bolding controls (density/span/mode suppressions).
    {
      const bolding = enforceBoldingPolicies({
        text: content,
        bank: this.boldingRules,
        answerMode: String(ctx.answerMode || ""),
        operatorFamily:
          ctx.operatorFamily ||
          String(
            (ctx.signals as Record<string, unknown> | null)?.operatorFamily ||
              "",
          ),
      });
      if (bolding.changed) {
        repairs.push(...bolding.repairs);
        content = bolding.text;
      }
    }

    // 9) Final markdown table separator normalize pass (idempotent).
    {
      const normalizedTables = normalizeMarkdownTableSeparators(
        content,
        this.tableRules,
      );
      if (normalizedTables.changed) {
        repairs.push("TABLE_SEPARATOR_NORMALIZED");
        content = normalizedTables.text;
      }
      const sanitizedTables = sanitizeMarkdownTables(content);
      if (sanitizedTables.changed) {
        repairs.push("TABLE_LAYOUT_NORMALIZED");
        content = sanitizedTables.text;
      }
    }

    // 10) Enforce analytical response template when requested by query profile/signals.
    {
      if (shouldEnforceAnalyticalStructure(ctx)) {
        const structured = enforceAnalyticalStructuredTemplate(
          content,
          attachments,
          ctx.language,
        );
        if (structured !== content) {
          repairs.push("ANALYTICAL_STRUCTURE_ENFORCED");
          content = structured;
        }
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
          ...buildUiTrace(),
          ...(provenanceEnforcement
            ? { provenance: provenanceEnforcement }
            : {}),
        },
      };
    }

    return {
      content,
      attachments,
      enforcement: {
        repairs,
        warnings,
        blocked: false,
        ...buildUiTrace(),
        ...(provenanceEnforcement ? { provenance: provenanceEnforcement } : {}),
      },
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
