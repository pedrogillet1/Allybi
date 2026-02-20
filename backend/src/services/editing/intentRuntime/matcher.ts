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

// ---------------------------------------------------------------------------
// A1 range detection
// ---------------------------------------------------------------------------

const A1_RANGE_RE =
  /(?:(?:'[^']+'|[A-Za-z0-9_][A-Za-z0-9_ ]*)!)?[A-Za-z]{1,3}\d{1,7}(?::[A-Za-z]{1,3}\d{1,7})?/;

function hasExplicitA1Range(text: string): boolean {
  return A1_RANGE_RE.test(text);
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
      const normTok = normalize(tok);
      if (textTokens.has(normTok) || normText.includes(normTok)) {
        score += POINTS.TOKEN_ANY_MATCH;
        matchedTriggers.push(`token_any:${tok}`);
      }
    }
  }

  // tokens_all: +20 bonus if ALL tokens found
  if (pattern.triggers.tokens_all && pattern.triggers.tokens_all.length > 0) {
    const allFound = pattern.triggers.tokens_all.every((tok) => {
      const normTok = normalize(tok);
      return textTokens.has(normTok) || normText.includes(normTok);
    });
    if (allFound) {
      score += POINTS.TOKEN_ALL_BONUS;
      matchedTriggers.push("tokens_all:matched");
    }
  }

  // tokens_none: hard-block if ANY of these tokens are found in the text.
  // Used to prevent collisions like "format as currency" matching a value-set pattern.
  if (pattern.triggers.tokens_none && pattern.triggers.tokens_none.length > 0) {
    for (const tok of pattern.triggers.tokens_none) {
      const normTok = normalize(tok);
      if (textTokens.has(normTok) || normText.includes(normTok)) {
        return { score: 0, matchedTriggers: [] };
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

  // Sort by score descending, take top 3
  candidates.sort((a, b) => b.score - a.score);
  const top3 = candidates.slice(0, 3);

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
