/**
 * Pattern matcher.
 *
 * For each segment, loads candidate patterns for (domain, lang),
 * scores them, and returns ranked candidates.
 */

import type {
  IntentPattern,
  Segment,
  MatchCandidate,
  MatchAmbiguity,
  MatchResult,
} from "./types";
import { loadPatterns } from "./loaders";

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

function normalize(value: string): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): Set<string> {
  return new Set(
    normalize(value)
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
}

function containsTokenOrPhrase(
  normText: string,
  textTokens: Set<string>,
  rawToken: string,
): boolean {
  const token = normalize(rawToken);
  if (!token) return false;
  if (token.includes(" ")) {
    return normText.includes(token);
  }
  return textTokens.has(token);
}

function compileIntentRegex(rawPattern: string): RegExp {
  // Some bank entries are double-escaped (e.g. "\\\\s+") due legacy generators.
  // Collapse one escape layer so runtime matching remains stable.
  const normalized = String(rawPattern || "").replace(/\\\\/g, "\\");
  return new RegExp(normalized, "i");
}

// ---------------------------------------------------------------------------
// A1 range detection
// ---------------------------------------------------------------------------

const A1_RANGE_RE =
  /(?:(?:'[^']+'|[A-Za-z0-9_][A-Za-z0-9_ ]*)!)?[A-Za-z]{1,3}\d{1,7}(?::[A-Za-z]{1,3}\d{1,7})?/;

function hasExplicitA1Range(text: string): boolean {
  return A1_RANGE_RE.test(text);
}

const SHEET_HINT_RE =
  /(?:'[^']+'\s*!|[A-Za-z0-9_][A-Za-z0-9_ ]*!|\b(?:sheet|worksheet|tab|planilha|aba)\b)/i;
const SELECTION_HINT_RE =
  /\b(?:selected|selection|this cell|these cells|célula selecionada|sele[cç][aã]o|c[ée]lulas selecionadas)\b/i;

function hasSheetReference(text: string): boolean {
  return SHEET_HINT_RE.test(text);
}

function hasSelectionHint(text: string): boolean {
  return SELECTION_HINT_RE.test(text);
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

const POINTS = {
  REGEX_MATCH: 30,
  TOKEN_ANY_MATCH: 10,
  TOKEN_ALL_BONUS: 20,
  A1_RANGE_BONUS: 25,
  NEGATIVE_PENALTY: 15,
  ADJUSTMENT_BOOST_DEFAULT: 12,
  ADJUSTMENT_PENALTY_DEFAULT: 12,
};

const DISAMBIGUATION_MARGIN = 0.15;

const DIRECTIONAL_HINTS_BY_GROUP: Record<
  string,
  Array<{ idPattern: RegExp; hints: string[] }>
> = {
  "excel.fill_direction": [
    {
      idPattern: /fill_down$/,
      hints: ["down", "below", "baixo", "para baixo"],
    },
    {
      idPattern: /fill_right$/,
      hints: ["right", "direita", "to the right", "a direita"],
    },
  ],
  "docx.align_mode": [
    {
      idPattern: /align\.left$/,
      hints: ["left", "esquerda", "a esquerda"],
    },
    {
      idPattern: /align\.right$/,
      hints: ["right", "direita", "a direita"],
    },
    {
      idPattern: /align\.center$/,
      hints: ["center", "centre", "centro", "centralizar", "centralize"],
    },
    {
      idPattern: /align\.justify$/,
      hints: ["justify", "justified", "justificar", "justificado"],
    },
  ],
  "docx.insert_position": [
    {
      idPattern: /insert\.before$/,
      hints: ["before", "antes", "above", "acima"],
    },
    {
      idPattern: /insert\.after$/,
      hints: ["after", "depois", "below", "abaixo"],
    },
  ],
  "docx.paragraph_structure": [
    {
      idPattern: /merge\.paragraphs$/,
      hints: ["merge", "combine", "join", "mesclar", "combinar", "juntar"],
    },
    {
      idPattern: /split\.paragraph$/,
      hints: ["split", "separate", "break", "dividir", "separar", "quebrar"],
    },
  ],
  "docx.text_case": [
    {
      idPattern: /case\.title$/,
      hints: ["title case", "capitalize each word", "titulo", "título"],
    },
    {
      idPattern: /case\.upper$/,
      hints: [
        "uppercase",
        "upper case",
        "all caps",
        "maiusculas",
        "maiúsculas",
      ],
    },
    {
      idPattern: /case\.lower$/,
      hints: ["lowercase", "lower case", "minusculas", "minúsculas"],
    },
    {
      idPattern: /case\.sentence$/,
      hints: ["sentence case", "sentence", "sentenca", "sentença", "frase"],
    },
  ],
  "docx.toc_action": [
    {
      idPattern: /toc\.insert$/,
      hints: [
        "insert toc",
        "add toc",
        "table of contents",
        "inserir sumario",
        "inserir sumário",
      ],
    },
    {
      idPattern: /toc\.update$/,
      hints: [
        "update toc",
        "refresh toc",
        "update table of contents",
        "atualizar sumario",
        "atualizar sumário",
      ],
    },
  ],
  "docx.break_action": [
    {
      idPattern: /page_break$/,
      hints: ["page break", "new page", "quebra de pagina", "quebra de página"],
    },
    {
      idPattern: /section_break$/,
      hints: [
        "section break",
        "new section",
        "quebra de secao",
        "quebra de seção",
      ],
    },
  ],
  "excel.cond_format": [
    {
      idPattern: /cond_format\.color_scale$/,
      hints: ["color scale", "escala de cor"],
    },
    {
      idPattern: /cond_format\.data_bars$/,
      hints: ["data bars", "barras de dados"],
    },
    {
      idPattern: /cond_format\.top_n$/,
      hints: ["top n", "top 10", "top 5", "maiores", "top"],
    },
  ],
  "excel.rows_structural": [
    {
      idPattern: /insert_rows$/,
      hints: [
        "insert row",
        "insert rows",
        "add row",
        "inserir linha",
        "inserir linhas",
        "adicionar linha",
      ],
    },
    {
      idPattern: /delete_rows$/,
      hints: [
        "delete row",
        "delete rows",
        "remove row",
        "excluir linha",
        "excluir linhas",
        "remover linha",
      ],
    },
  ],
  "excel.columns_structural": [
    {
      idPattern: /insert_columns$/,
      hints: [
        "insert column",
        "insert columns",
        "add column",
        "inserir coluna",
        "inserir colunas",
        "adicionar coluna",
      ],
    },
    {
      idPattern: /delete_columns$/,
      hints: [
        "delete column",
        "delete columns",
        "remove column",
        "excluir coluna",
        "excluir colunas",
        "remover coluna",
      ],
    },
  ],
  "excel.sheet_structural": [
    {
      idPattern: /add_sheet$/,
      hints: [
        "add sheet",
        "new sheet",
        "create sheet",
        "adicionar aba",
        "nova aba",
        "criar aba",
      ],
    },
    {
      idPattern: /rename_sheet$/,
      hints: [
        "rename sheet",
        "rename tab",
        "renomear aba",
        "renomear planilha",
      ],
    },
    {
      idPattern: /delete_sheet$/,
      hints: [
        "delete sheet",
        "remove sheet",
        "delete tab",
        "excluir aba",
        "remover aba",
      ],
    },
  ],
  "excel.rows_visibility": [
    {
      idPattern: /hide_rows$/,
      hints: ["hide rows", "hide row", "ocultar linhas", "ocultar linha"],
    },
    {
      idPattern: /show_rows$/,
      hints: ["show rows", "unhide rows", "mostrar linhas", "reexibir linhas"],
    },
  ],
  "excel.columns_visibility": [
    {
      idPattern: /hide_columns$/,
      hints: [
        "hide columns",
        "hide column",
        "ocultar colunas",
        "ocultar coluna",
      ],
    },
    {
      idPattern: /show_columns$/,
      hints: [
        "show columns",
        "unhide columns",
        "mostrar colunas",
        "reexibir colunas",
      ],
    },
  ],
  "excel.protection": [
    {
      idPattern: /set_protection$/,
      hints: [
        "protect sheet",
        "sheet protection",
        "lock sheet",
        "proteger planilha",
        "proteção da planilha",
        "protecao da planilha",
      ],
    },
    {
      idPattern: /lock_cells$/,
      hints: [
        "lock cells",
        "unlock cells",
        "protect cells",
        "lock range",
        "bloquear células",
        "desbloquear células",
        "proteger células",
      ],
    },
  ],
};

type PatternScore = {
  score: number;
  matchedTriggers: string[];
};

function isStrictIntentRuntimeEnv(): boolean {
  const env = String(process.env.NODE_ENV || "").toLowerCase();
  return env === "production" || env === "staging";
}

function scorePattern(pattern: IntentPattern, text: string): PatternScore {
  const normText = normalize(text);
  const textTokens = tokenize(text);
  const hasRegexRules =
    Array.isArray(pattern.triggers.regex_any) &&
    pattern.triggers.regex_any.length > 0;
  let score = 0;
  const matchedTriggers: string[] = [];
  let matchedPositiveTrigger = false;
  let matchedRegex = false;

  const requiresContext = pattern.requiresContext || {};
  if (requiresContext.explicitRange && !hasExplicitA1Range(text)) {
    return { score: 0, matchedTriggers: [] };
  }
  if (requiresContext.sheetReference && !hasSheetReference(text)) {
    return { score: 0, matchedTriggers: [] };
  }
  if (requiresContext.selectionHint && !hasSelectionHint(text)) {
    return { score: 0, matchedTriggers: [] };
  }

  // regex_any: +30 per match
  if (pattern.triggers.regex_any) {
    for (const rgx of pattern.triggers.regex_any) {
      try {
        if (compileIntentRegex(rgx).test(normText)) {
          score += POINTS.REGEX_MATCH;
          matchedTriggers.push(`regex:${rgx.slice(0, 40)}`);
          matchedPositiveTrigger = true;
          matchedRegex = true;
        }
      } catch {
        if (isStrictIntentRuntimeEnv()) {
          throw new Error(
            `Invalid regex in intent pattern ${pattern.id}: ${String(rgx)}`,
          );
        }
      }
    }
  }

  // tokens_any: +10 per matched token
  if (pattern.triggers.tokens_any) {
    for (const tok of pattern.triggers.tokens_any) {
      if (containsTokenOrPhrase(normText, textTokens, tok)) {
        score += POINTS.TOKEN_ANY_MATCH;
        matchedTriggers.push(`token_any:${tok}`);
        matchedPositiveTrigger = true;
      }
    }
  }

  // tokens_all: +20 bonus if ALL tokens found
  if (pattern.triggers.tokens_all && pattern.triggers.tokens_all.length > 0) {
    const allFound = pattern.triggers.tokens_all.every((tok) =>
      containsTokenOrPhrase(normText, textTokens, tok),
    );
    if (allFound) {
      score += POINTS.TOKEN_ALL_BONUS;
      matchedTriggers.push("tokens_all:matched");
      matchedPositiveTrigger = true;
    }
  }

  // tokens_none: hard-block if ANY of these tokens are found in the text.
  // Used to prevent collisions like "format as currency" matching a value-set pattern.
  if (pattern.triggers.tokens_none && pattern.triggers.tokens_none.length > 0) {
    for (const tok of pattern.triggers.tokens_none) {
      if (containsTokenOrPhrase(normText, textTokens, tok)) {
        return { score: 0, matchedTriggers: [] };
      }
    }
  }
  if (hasRegexRules && !matchedRegex) {
    return { score: 0, matchedTriggers: [] };
  }

  // Require at least one positive trigger match before applying contextual bonuses.
  if (!matchedPositiveTrigger) {
    return { score: 0, matchedTriggers: [] };
  }

  const scoreAdjustments = pattern.scoreAdjustments;
  if (scoreAdjustments) {
    const boostPoints =
      scoreAdjustments.boostPoints ?? POINTS.ADJUSTMENT_BOOST_DEFAULT;
    const penaltyPoints =
      scoreAdjustments.penaltyPoints ?? POINTS.ADJUSTMENT_PENALTY_DEFAULT;

    if (scoreAdjustments.boostIfTokensPresent?.length) {
      const hasBoost = scoreAdjustments.boostIfTokensPresent.some((tok) =>
        containsTokenOrPhrase(normText, textTokens, tok),
      );
      if (hasBoost) {
        score += boostPoints;
        matchedTriggers.push("score_adjustment:boost");
      }
    }

    if (scoreAdjustments.penalizeIfTokensPresent?.length) {
      const hasPenalty = scoreAdjustments.penalizeIfTokensPresent.some((tok) =>
        containsTokenOrPhrase(normText, textTokens, tok),
      );
      if (hasPenalty) {
        score -= penaltyPoints;
        matchedTriggers.push("score_adjustment:penalty");
      }
    }
  }

  // A1 range bonus
  if (hasExplicitA1Range(text)) {
    score += POINTS.A1_RANGE_BONUS;
  }

  // Negative example penalty
  if (pattern.examples.negative) {
    for (const neg of pattern.examples.negative) {
      const negNorm = normalize(neg);
      const overlap = jaccardScore(normText, negNorm);
      if (overlap > 0.4) {
        score -= POINTS.NEGATIVE_PENALTY;
      }
    }
  }

  return { score, matchedTriggers };
}

function jaccardScore(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  ta.forEach((t) => {
    if (tb.has(t)) inter += 1;
  });
  const union = ta.size + tb.size - inter;
  return union > 0 ? inter / union : 0;
}

function scoreCmp(a: MatchCandidate, b: MatchCandidate): number {
  if (b.score !== a.score) return b.score - a.score;
  if (b.pattern.priority !== a.pattern.priority) {
    return b.pattern.priority - a.pattern.priority;
  }
  return a.pattern.id.localeCompare(b.pattern.id);
}

function directionalHintsForCandidate(
  candidate: MatchCandidate,
): string[] | null {
  const group = String(candidate.pattern.disambiguationGroup || "").trim();
  const groupRules = DIRECTIONAL_HINTS_BY_GROUP[group];
  if (!groupRules || groupRules.length === 0) return null;
  for (const rule of groupRules) {
    if (rule.idPattern.test(candidate.pattern.id)) {
      return rule.hints;
    }
  }
  return null;
}

function hasDirectionalEvidence(
  candidate: MatchCandidate,
  text: string,
): boolean {
  const hints = directionalHintsForCandidate(candidate);
  if (!hints || hints.length === 0) return false;
  const normText = normalize(text);
  const textTokens = tokenize(text);
  return hints.some((hint) =>
    containsTokenOrPhrase(normText, textTokens, hint),
  );
}

function detectGroupAmbiguity(
  candidates: MatchCandidate[],
  text: string,
): MatchAmbiguity | null {
  const byGroup = new Map<string, MatchCandidate[]>();
  for (const candidate of candidates) {
    const group = String(candidate.pattern.disambiguationGroup || "").trim();
    if (!group) continue;
    const groupRules = DIRECTIONAL_HINTS_BY_GROUP[group];
    if (!groupRules || groupRules.length === 0) continue;
    const bucket = byGroup.get(group) || [];
    bucket.push(candidate);
    byGroup.set(group, bucket);
  }

  let selected: { group: string; items: MatchCandidate[] } | null = null;
  for (const [group, items] of byGroup.entries()) {
    if (items.length < 2) continue;
    items.sort(scoreCmp);
    const top = items[0];
    const second = items[1];
    const margin = Math.abs(top.score - second.score);
    if (margin > DISAMBIGUATION_MARGIN) continue;

    const topHasDirectional = hasDirectionalEvidence(top, text);
    const secondHasDirectional = hasDirectionalEvidence(second, text);
    if (topHasDirectional !== secondHasDirectional) continue;

    if (!selected || scoreCmp(top, selected.items[0]) < 0) {
      selected = { group, items };
    }
  }

  if (!selected) return null;
  const top = selected.items[0];
  const second = selected.items[1];
  const margin = Math.abs(top.score - second.score);
  return {
    group: selected.group,
    candidateIds: selected.items
      .slice(0, 3)
      .map((candidate) => candidate.pattern.id),
    reason: margin === 0 ? "tie_score" : "low_margin",
  };
}

function keepTopPerDisambiguationGroup(
  candidates: MatchCandidate[],
): MatchCandidate[] {
  const byGroup = new Map<string, MatchCandidate>();
  const passthrough: MatchCandidate[] = [];

  for (const candidate of candidates) {
    const group = String(candidate.pattern.disambiguationGroup || "").trim();
    if (!group) {
      passthrough.push(candidate);
      continue;
    }
    const existing = byGroup.get(group);
    if (!existing || scoreCmp(candidate, existing) < 0) {
      byGroup.set(group, candidate);
    }
  }

  return [...passthrough, ...Array.from(byGroup.values())];
}

function pruneMutuallyExclusive(
  candidates: MatchCandidate[],
): MatchCandidate[] {
  const selected: MatchCandidate[] = [];

  for (const candidate of candidates) {
    const excludes = new Set(candidate.pattern.mutuallyExclusiveWith || []);
    const conflicts = selected.some((picked) => {
      if (excludes.has(picked.pattern.id)) return true;
      return (picked.pattern.mutuallyExclusiveWith || []).includes(
        candidate.pattern.id,
      );
    });
    if (conflicts) continue;
    selected.push(candidate);
  }

  return selected;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function matchSegment(
  segment: Segment,
  domain: "excel" | "docx",
  lang: "en" | "pt",
): MatchResult {
  const patterns = loadPatterns(domain, lang);
  const candidates: MatchCandidate[] = [];

  for (const pattern of patterns) {
    const result = scorePattern(pattern, segment.text);

    if (result.score <= 0) continue;

    // Apply priority weighting: effective = score * (priority / 100)
    const effective = result.score * (pattern.priority / 100);

    candidates.push({
      pattern,
      score: effective,
      matchedTriggers: result.matchedTriggers,
    });
  }

  candidates.sort(scoreCmp);
  const ambiguity = detectGroupAmbiguity(candidates, segment.text);
  if (ambiguity) {
    const ambiguousCandidates = candidates
      .filter(
        (candidate) =>
          candidate.pattern.disambiguationGroup === ambiguity.group,
      )
      .sort(scoreCmp)
      .slice(0, 3);
    return {
      segment,
      candidates: ambiguousCandidates,
      bestMatch: null,
      ambiguity,
    };
  }

  const grouped = keepTopPerDisambiguationGroup(candidates).sort(scoreCmp);
  const pruned = pruneMutuallyExclusive(grouped).sort(scoreCmp);
  const top3 = pruned.slice(0, 3);

  return {
    segment,
    candidates: top3,
    bestMatch: top3[0] ?? null,
  };
}

export function matchAllSegments(
  segments: Segment[],
  domain: "excel" | "docx",
  lang: "en" | "pt",
): MatchResult[] {
  return segments.map((seg) => matchSegment(seg, domain, lang));
}
