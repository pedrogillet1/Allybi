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
