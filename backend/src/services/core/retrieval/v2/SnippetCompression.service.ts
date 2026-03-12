/**
 * SnippetCompression — v2 extraction
 *
 * Standalone snippet compression extracted from RetrievalEngineService.
 * Truncates long snippets while preserving numeric-unit tokens, headings,
 * and negation context.  Respects sentence/newline boundaries when possible.
 */

import { logger } from "../../../../utils/logger";

// ── Main compression function ────────────────────────────────────────

/**
 * Compress a snippet to fit within `opts.maxChars`, applying the SCP_*
 * rule set:
 *
 * - SCP_QUOTE: If `hasQuotedText` is true the snippet is returned as-is
 *   (user asked for a literal quote).
 * - SCP_COMPARE: Compare-intent queries get a 1.3x budget.
 * - SCP_NUM_UNIT: Truncation avoids splitting numeric-unit tokens
 *   (e.g. "R$ 1,500.00", "12 months").
 * - SCP_HEADING: Truncation avoids splitting section headings that
 *   fall near the cut point.
 * - SCP_NEG: Truncation extends past negation phrases ("not", "never",
 *   "excluding", etc.) so that negation context is preserved.
 * - Sentence/newline boundary snapping when the boundary falls in the
 *   second half of the budget.
 */
export function compressSnippet(
  snippet: string,
  opts: {
    maxChars: number;
    preserveNumericUnits: boolean;
    preserveHeadings: boolean;
    hasQuotedText: boolean;
    compareIntent: boolean;
  },
): string {
  if (opts.hasQuotedText) return snippet;

  const effectiveMax = opts.compareIntent
    ? Math.ceil(opts.maxChars * 1.3)
    : opts.maxChars;

  if (snippet.length <= effectiveMax) return snippet;

  let truncPoint = effectiveMax;

  if (opts.preserveNumericUnits) {
    const numUnitPattern =
      /\d[\d.,]*\s*(?:R\$|\$|EUR|%|kg|months?|years?|days?|hours?)/gi;
    let match: RegExpExecArray | null;
    while ((match = numUnitPattern.exec(snippet)) !== null) {
      const tokenStart = match.index;
      const tokenEnd = tokenStart + match[0].length;
      if (tokenStart < truncPoint && tokenEnd > truncPoint) {
        truncPoint = tokenEnd;
        break;
      }
    }
  }

  if (opts.preserveHeadings) {
    const headingPattern = /^#+\s+.+$|^[A-Z][A-Z\s]{2,}$/gm;
    let match: RegExpExecArray | null;
    while ((match = headingPattern.exec(snippet)) !== null) {
      const hStart = match.index;
      const hEnd = hStart + match[0].length;
      if (
        hStart > truncPoint - 60 &&
        hStart <= truncPoint &&
        hEnd > truncPoint
      ) {
        truncPoint = hEnd;
        break;
      }
    }
  }

  // SCP: Extend truncation to preserve negation context
  const negPattern =
    /\b(not|never|no|excluding|without|except|none|nem|não|nunca|exceto|sem)\b\s+\S{3,}/gi;
  let negMatch: RegExpExecArray | null;
  while ((negMatch = negPattern.exec(snippet)) !== null) {
    const nStart = negMatch.index;
    const nEnd = nStart + negMatch[0].length;
    if (nStart < truncPoint && nEnd > truncPoint) {
      truncPoint = nEnd;
      break;
    }
  }

  // Record post-extension truncPoint so sentence boundary never regresses past it
  const extensionFloor = truncPoint;

  const sentenceBoundary = snippet.lastIndexOf(". ", truncPoint);
  const newlineBoundary = snippet.lastIndexOf("\n", truncPoint);
  const boundary = Math.max(sentenceBoundary, newlineBoundary);
  if (boundary > effectiveMax * 0.5 && boundary >= extensionFloor) {
    truncPoint = boundary + 1;
  }

  const truncated = snippet.slice(0, truncPoint).trimEnd();
  return truncated.length < snippet.length ? truncated + "..." : truncated;
}
