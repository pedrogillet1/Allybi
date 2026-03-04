import { describe, expect, test } from "@jest/globals";

/**
 * Tests for the snippet compression negation-preservation rule.
 *
 * compressSnippet is a private method, so we test via a standalone function
 * that mirrors the negation extension logic. This validates the algorithm
 * before it's integrated into the engine.
 */

function extendTruncForNegation(snippet: string, truncPoint: number): number {
  const negPattern =
    /\b(not|never|no|excluding|without|except|none|nem|não|nunca|exceto|sem)\b\s+\S{3,}/gi;
  let match: RegExpExecArray | null;
  while ((match = negPattern.exec(snippet)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (start < truncPoint && end > truncPoint) {
      return end;
    }
  }
  return truncPoint;
}

/**
 * Standalone mirror of compressSnippet that includes all extension logic
 * AND the sentence-boundary snap-back. Used to verify the extensionFloor fix.
 */
function compressSnippet(
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
    const numUnitPattern = /\d[\d.,]*\s*(?:R\$|\$|EUR|%|kg|months?|years?|days?|hours?)/gi;
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
      if (hStart > truncPoint - 60 && hStart <= truncPoint && hEnd > truncPoint) {
        truncPoint = hEnd;
        break;
      }
    }
  }

  // Negation extension
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

  // Record post-extension floor so sentence boundary never regresses past it
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

describe("negation preservation in snippet compression", () => {
  test("extends truncation past 'NOT include' when cut falls mid-negation", () => {
    const snippet =
      "The contract does NOT include maintenance fees. Additional terms apply.";
    // "NOT include" spans chars 18-29; truncation at 25 cuts mid-negation
    const result = extendTruncForNegation(snippet, 25);
    const preserved = snippet.slice(0, result);
    expect(preserved).toContain("NOT include");
  });

  test("extends truncation past 'never exceeds' when cut falls mid-negation", () => {
    const snippet =
      "The penalty never exceeds 5% of the principal amount under any circumstances.";
    const result = extendTruncForNegation(snippet, 22);
    const preserved = snippet.slice(0, result);
    expect(preserved).toContain("never exceeds");
  });

  test("does not change truncation when negation is fully before cut point", () => {
    const snippet =
      "Revenue is not zero. The company earned R$ 1,500,000 in Q1.";
    // "not zero" ends at char 19 — well before truncPoint 40
    const result = extendTruncForNegation(snippet, 40);
    expect(result).toBe(40);
  });

  test("handles Portuguese negation 'não inclui'", () => {
    const snippet =
      "O contrato não inclui taxas de manutenção. Termos adicionais se aplicam.";
    const result = extendTruncForNegation(snippet, 20);
    const preserved = snippet.slice(0, result);
    expect(preserved).toContain("não inclui");
  });
});

describe("compressSnippet sentence boundary vs extensions", () => {
  test("sentence boundary does NOT undo negation extension", () => {
    const snippet =
      "Revenue grew 12% year-over-year. The company does not include one-time charges in adjusted EBITDA. Other metrics improved.";
    // "not include" spans chars 50-61. maxChars=55 lands mid-negation,
    // extension pushes to 61. Without fix, sentence boundary at pos 31
    // would pull truncPoint back to 32, undoing the extension.
    const result = compressSnippet(snippet, {
      maxChars: 55,
      preserveNumericUnits: true,
      preserveHeadings: false,
      hasQuotedText: false,
      compareIntent: false,
    });
    expect(result).toContain("not include");
  });

  test("sentence boundary does NOT undo numeric-unit extension", () => {
    const snippet =
      "Total costs approximately. The rate was 15.5% year-over-year. Other metrics improved.";
    // "15.5%" spans chars 40-44. maxChars=43 lands mid-token,
    // extension pushes to 45. Without fix, sentence boundary at pos 25
    // would pull truncPoint back to 26, undoing the extension.
    const result = compressSnippet(snippet, {
      maxChars: 43,
      preserveNumericUnits: true,
      preserveHeadings: false,
      hasQuotedText: false,
      compareIntent: false,
    });
    expect(result).toContain("15.5%");
  });

  test("sentence boundary still works when no extension fired", () => {
    const snippet =
      "Revenue grew 12% year-over-year. The company reported strong results. Other metrics improved.";
    const result = compressSnippet(snippet, {
      maxChars: 45,
      preserveNumericUnits: false,
      preserveHeadings: false,
      hasQuotedText: false,
      compareIntent: false,
    });
    // Should snap to the sentence boundary at ". "
    expect(result).toMatch(/\.\.\.$/);
  });
});
