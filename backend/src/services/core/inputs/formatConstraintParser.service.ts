// src/services/core/formatConstraintParser.service.ts
//
// FORMAT CONSTRAINT PARSER (ChatGPT-like)
// -----------------------------------------------------------------------------
// Purpose
// - Parse user formatting instructions from natural language into machine
//   constraints used by the router + composer.
// - This is NOT answer generation. It only returns constraints + trace.
// - Supports EN/PT/ES with tolerant parsing (hyphens, diacritics, punctuation).
//
// Outputs (canonical)
// - outputShape: paragraph | bullets | numbered_list | table | file_list | button_only
// - exactBulletCount
// - maxSentences (for "2–3 sentences", "one-liner")
// - requireTable
// - requireSourceButtons / forbidSourceButtons
// - maxFollowups / forbidFollowups
// - userRequestedShort
// - userAskedForJson (denied later; mapped to table/bullets)
// - userAskedForQuote
//
// Notes
// - "JSON" is a formatting request. Koda never outputs JSON; we set userAskedForJson,
//   then downstream (answer_style_policy / render_policy / quality_gates) maps it.
// - "Open/locate" actions should be handled by routing; we still set a nav hint.
// -----------------------------------------------------------------------------

import { getBank } from "../banks/bankLoader.service";
import { runtimePatterns } from "./runtimePatterns.service";
const getRuntimePatterns = () => runtimePatterns;
import type { LanguageCode } from "../../../types/intents.types";

export type OutputShape =
  | "paragraph"
  | "bullets"
  | "numbered_list"
  | "table"
  | "file_list"
  | "button_only"
  | "quote"
  | "breadcrumbs"
  | "steps";

export interface FormatConstraints {
  // core output shape
  outputShape?: OutputShape;

  // counts / sizes
  exactBulletCount?: number;
  exactStepCount?: number;
  maxSentences?: number;

  // explicit format requirements
  requireTable?: boolean;

  // UX preferences
  userRequestedShort?: boolean;
  userAskedForJson?: boolean;
  userAskedForQuote?: boolean;
  userAskedForTable?: boolean;
  userAskedForBullets?: boolean;
  userAskedForSteps?: boolean;
  userAskedForComparison?: boolean;

  // sources/followups
  requireSourceButtons?: boolean;
  forbidSourceButtons?: boolean;
  maxFollowups?: number;
  forbidFollowups?: boolean;

  // navigation hints (router still decides operator)
  navQuery?: boolean;
  discoveryQuery?: boolean;
}

export interface FormatParseResult {
  constraints: FormatConstraints;
  trace: string[];
  language: LanguageCode;
}

type FormatSemanticsBank = {
  _meta?: any;
  config?: { enabled?: boolean };
  // Optional: bank can define language-specific regex patterns or keywords
  patterns?: {
    bullets?: Record<string, string[]>;
    steps?: Record<string, string[]>;
    table?: Record<string, string[]>;
    quote?: Record<string, string[]>;
    json?: Record<string, string[]>;
    short?: Record<string, string[]>;
    noFollowups?: Record<string, string[]>;
    noSources?: Record<string, string[]>;
    sources?: Record<string, string[]>;
    discovery?: Record<string, string[]>;
    nav?: Record<string, string[]>;
    compare?: Record<string, string[]>;
  };
};

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function normalizeText(input: string): string {
  // Keep it simple and deterministic (avoid heavy libs)
  return (input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[_/]+/g, " ")
    .replace(/[""'']/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function anyMatch(text: string, patterns: Array<string | RegExp>): boolean {
  return patterns.some((p) => {
    if (p instanceof RegExp) return p.test(text);
    try {
      return new RegExp(p, "i").test(text);
    } catch {
      // treat as literal substring fallback
      return text.includes(String(p).toLowerCase());
    }
  });
}

function extractFirstInt(text: string): number | undefined {
  const m = text.match(/\b(\d{1,3})\b/);
  if (!m) return undefined;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function extractRangeMaxSentences(text: string): number | undefined {
  // "2-3 sentences", "2–3 frases", "2 a 3 frases", "no more than 3 sentences"
  const range = text.match(
    /\b(\d{1,2})\s*(?:-|a|to)\s*(\d{1,2})\s*(?:sentences|sentence|frases|frase|oracoes|oracao)\b/i,
  );
  if (range) {
    const hi = parseInt(range[2], 10);
    return Number.isFinite(hi) ? hi : undefined;
  }

  const max = text.match(
    /\b(?:no more than|at most|up to|max(?:imum)?|no maximo|ate|no mas de)\s*(\d{1,2})\s*(?:sentences|sentence|frases|frase|oracoes|oracao)\b/i,
  );
  if (max) {
    const n = parseInt(max[1], 10);
    return Number.isFinite(n) ? n : undefined;
  }

  const exact = text.match(
    /\b(\d{1,2})\s*(?:sentences|sentence|frases|frase|oracoes|oracao)\b/i,
  );
  if (exact) {
    const n = parseInt(exact[1], 10);
    return Number.isFinite(n) ? n : undefined;
  }

  return undefined;
}

function extractExactBullets(text: string): number | undefined {
  // "5 bullets", "exactly 5 bullet points", "5 pontos", "5 itens"
  const m = text.match(
    /\b(?:exactly|exact|just|somente|apenas|exatamente)?\s*(\d{1,2})\s*(?:bullets?|bullet points?|points?|pontos?|itens?|items?)\b/i,
  );
  if (!m) return undefined;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function extractExactSteps(text: string): number | undefined {
  // "3 steps", "in 4 steps", "4 passos"
  const m = text.match(
    /\b(?:in|em)?\s*(\d{1,2})\s*(?:steps?|passos?|etapas?|pasos?)\b/i,
  );
  if (!m) return undefined;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

export class FormatConstraintParserService {
  private semanticsBank?: FormatSemanticsBank;

  constructor() {
    this.reloadBanks();
  }

  reloadBanks() {
    this.semanticsBank = getBank<FormatSemanticsBank>("format_semantics");
  }

  parse(queryRaw: string, languageHint?: LanguageCode): FormatParseResult {
    const trace: string[] = [];
    const rp = getRuntimePatterns();

    const detectedLang: LanguageCode = languageHint || "en";

    const q = normalizeText(queryRaw);

    const constraints: FormatConstraints = {};

    // --- Bank patterns (optional) ------------------------------------------------
    const bankEnabled = this.semanticsBank?.config?.enabled !== false;
    const bankPatterns = this.semanticsBank?.patterns;

    const bankList = (
      key: keyof NonNullable<FormatSemanticsBank["patterns"]>,
    ): string[] => {
      if (!bankEnabled) return [];
      const perLang = (bankPatterns?.[key] || {}) as Record<string, string[]>;
      return perLang[detectedLang] || perLang["any"] || [];
    };

    // --- Core detections --------------------------------------------------------

    // 0) Strong nav/discovery detection (these are routing hints, not final mode)
    const navPatterns: Array<string | RegExp> = [
      ...bankList("nav"),
      /\b(open|abrir|abre|show|mostrar|mostre|ver|view|see)\b/,
      /\b(where is|onde fica|onde esta|localiza|localizar|locate)\b/,
    ];
    const discoveryPatterns: Array<string | RegExp> = [
      ...bankList("discovery"),
      /\b(which file|which document|what file|what document|qual arquivo|qual documento|em qual arquivo|em qual documento)\b/,
    ];

    if (anyMatch(q, discoveryPatterns)) {
      constraints.discoveryQuery = true;
      trace.push("discoveryQuery=true");
    }
    if (anyMatch(q, navPatterns)) {
      constraints.navQuery = true;
      trace.push("navQuery=true");
    }

    // 1) JSON requests (denied later, but recorded)
    const jsonPatterns: Array<string | RegExp> = [
      ...bankList("json"),
      /\bjson\b/,
      /\b(formato\s*json|em\s*json|en\s*json)\b/,
    ];
    if (anyMatch(q, jsonPatterns)) {
      constraints.userAskedForJson = true;
      trace.push("userAskedForJson=true");
      // We do NOT set outputShape=json (not allowed). We hint table/bullets later.
    }

    // 2) Quote requests
    const quotePatterns: Array<string | RegExp> = [
      ...bankList("quote"),
      /\bquote\b/,
      /\bverbatim\b/,
      /\bexact (line|words|wording)\b/,
      /\bcite\b/,
      /\bcitar\b/,
      /\btextualmente\b/,
      /\bliteral(mente)?\b/,
      /\baspa(s)?\b/,
    ];
    if (anyMatch(q, quotePatterns)) {
      constraints.userAskedForQuote = true;
      trace.push("userAskedForQuote=true");
    }

    // 3) Table requests
    const tablePatterns: Array<string | RegExp> = [
      ...bankList("table"),
      /\btable\b/,
      /\btabela\b/,
      /\btabla\b/,
      /\btabulate\b/,
      /\bspreadsheet\b/,
      /\bin a table\b/,
    ];
    if (anyMatch(q, tablePatterns)) {
      constraints.userAskedForTable = true;
      constraints.requireTable = true;
      trace.push("userAskedForTable=true requireTable=true");
    }

    // 4) Bullet requests
    const bulletsPatterns: Array<string | RegExp> = [
      ...bankList("bullets"),
      /\bbullets?\b/,
      /\bbullet points?\b/,
      /\bpoints?\b/,
      /\bpontos?\b/,
      /\bitens?\b/,
      /\bitems?\b/,
      /\blist\b/,
      /\blista\b/,
    ];
    if (anyMatch(q, bulletsPatterns)) {
      constraints.userAskedForBullets = true;
      trace.push("userAskedForBullets=true");
    }

    // 5) Steps requests
    const stepsPatterns: Array<string | RegExp> = [
      ...bankList("steps"),
      /\bstep by step\b/,
      /\bsteps?\b/,
      /\bpasso a passo\b/,
      /\bpassos?\b/,
      /\betapas?\b/,
      /\bpaso a paso\b/,
      /\bpasos?\b/,
    ];
    if (anyMatch(q, stepsPatterns)) {
      constraints.userAskedForSteps = true;
      trace.push("userAskedForSteps=true");
    }

    // 6) Compare requests
    const comparePatterns: Array<string | RegExp> = [
      ...bankList("compare"),
      /\bcompare\b/,
      /\bcomparison\b/,
      /\bvs\b/,
      /\bversus\b/,
      /\bcomparar\b/,
      /\bcomparacao\b/,
      /\bcomparación\b/,
    ];
    if (anyMatch(q, comparePatterns)) {
      constraints.userAskedForComparison = true;
      trace.push("userAskedForComparison=true");
    }

    // 7) Shortness requests
    const shortPatterns: Array<string | RegExp> = [
      ...bankList("short"),
      /\btldr\b/,
      /\btoo long\b/,
      /\bshort\b/,
      /\bbrief\b/,
      /\bquick\b/,
      /\boverview\b/,
      /\bresumo\b/,
      /\bcurto\b/,
      /\brapido\b/,
      /\bobjetivo\b/,
      /\b2\s*-\s*3\b/,
      /\bone[- ]liner\b/,
      /\bin one sentence\b/,
      /\bem (uma|1) frase\b/,
    ];
    if (anyMatch(q, shortPatterns)) {
      constraints.userRequestedShort = true;
      trace.push("userRequestedShort=true");
    }

    // 8) Followup preferences
    const noFollowupsPatterns: Array<string | RegExp> = [
      ...bankList("noFollowups"),
      /\bno follow[- ]?up(s)?\b/,
      /\bdont ask (me )?questions\b/,
      /\bsem perguntas\b/,
      /\bnao pergunte\b/,
      /\bsem followup\b/,
    ];
    if (anyMatch(q, noFollowupsPatterns)) {
      constraints.forbidFollowups = true;
      constraints.maxFollowups = 0;
      trace.push("forbidFollowups=true maxFollowups=0");
    }

    // 9) Sources preferences (rare, but supported)
    const noSourcesPatterns: Array<string | RegExp> = [
      ...bankList("noSources"),
      /\bno sources\b/,
      /\bwithout sources\b/,
      /\bsem fontes\b/,
      /\bsem sources\b/,
    ];
    const yesSourcesPatterns: Array<string | RegExp> = [
      ...bankList("sources"),
      /\bshow sources\b/,
      /\bwith sources\b/,
      /\bmostre as fontes\b/,
      /\bcom fontes\b/,
    ];
    if (anyMatch(q, noSourcesPatterns)) {
      constraints.forbidSourceButtons = true;
      constraints.requireSourceButtons = false;
      trace.push("forbidSourceButtons=true");
    } else if (anyMatch(q, yesSourcesPatterns)) {
      constraints.requireSourceButtons = true;
      trace.push("requireSourceButtons=true");
    }

    // --- Count extraction -------------------------------------------------------

    const bulletN = extractExactBullets(q);
    if (bulletN !== undefined) {
      constraints.exactBulletCount = clampInt(bulletN, 1, 25);
      constraints.userAskedForBullets = true;
      trace.push(`exactBulletCount=${constraints.exactBulletCount}`);
    }

    const stepN = extractExactSteps(q);
    if (stepN !== undefined && constraints.userAskedForSteps) {
      constraints.exactStepCount = clampInt(stepN, 1, 25);
      trace.push(`exactStepCount=${constraints.exactStepCount}`);
    }

    const maxSent = extractRangeMaxSentences(q);
    if (maxSent !== undefined) {
      constraints.maxSentences = clampInt(maxSent, 1, 12);
      trace.push(`maxSentences=${constraints.maxSentences}`);
      // If user explicitly caps sentences, treat as "short"
      if (constraints.maxSentences <= 3) {
        constraints.userRequestedShort = true;
        trace.push("userRequestedShort=true (via maxSentences<=3)");
      }
    } else if (constraints.userRequestedShort) {
      // Default short cap if user said "quick/brief/tldr" but no explicit number
      constraints.maxSentences = 3;
      trace.push("maxSentences=3 (default_short)");
    }

    // --- Decide outputShape (best-effort; router/composer still final) ---------
    // Priority order (most explicit wins):
    // 1) Steps
    // 2) Table
    // 3) Bullets
    // 4) Paragraph (default)
    //
    // JSON requests map to table if numeric/tabular cues exist, else bullets.
    // We DO NOT output JSON.

    if (constraints.userAskedForSteps) {
      constraints.outputShape = "numbered_list";
      trace.push("outputShape=numbered_list");
    } else if (constraints.userAskedForTable) {
      constraints.outputShape = "table";
      trace.push("outputShape=table");
    } else if (constraints.userAskedForBullets) {
      constraints.outputShape = "bullets";
      trace.push("outputShape=bullets");
    }

    if (constraints.userAskedForJson && !constraints.outputShape) {
      // Heuristic mapping: if query mentions table-ish or numbers, map to table else bullets.
      const numericCue = anyMatch(q, [
        /[\d$€]/,
        /\b(sum|total|percent|%|avg|average|media)\b/,
        /\bvalor|total|soma|porcentagem\b/,
      ]);
      constraints.outputShape = numericCue ? "table" : "bullets";
      trace.push(`jsonMappedOutputShape=${constraints.outputShape}`);
    }

    // If user asked for quote, that doesn't force outputShape, but it can bias extraction formatting downstream.
    // If short answer + no explicit shape, keep paragraph (composer will keep 1–3 short paragraphs).
    if (!constraints.outputShape && constraints.userRequestedShort) {
      constraints.outputShape = "paragraph";
      trace.push("outputShape=paragraph (short default)");
    }

    // If nothing detected, leave undefined and let upstream logic decide
    // (operatorResolver + answer_style_policy).
    if (Object.keys(constraints).length === 0) {
      trace.push("no_constraints_detected");
    }

    return { constraints, trace, language: detectedLang };
  }
}

// Singleton
let instance: FormatConstraintParserService | null = null;

export function getFormatConstraintParser(): FormatConstraintParserService {
  if (!instance) instance = new FormatConstraintParserService();
  return instance;
}
