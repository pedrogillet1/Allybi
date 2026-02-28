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
  let score = 0;
  const matchedTriggers: string[] = [];

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
        if (new RegExp(rgx, "i").test(normText)) {
          score += POINTS.REGEX_MATCH;
          matchedTriggers.push(`regex:${rgx.slice(0, 40)}`);
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
