import { describe, expect, test } from "@jest/globals";

import { evaluateRuleBooleanExpression } from "./qualityGateRunner.expression";

const helpers = {
  diAny: (value: unknown, predicate: unknown): boolean => {
    if (!Array.isArray(value) || typeof predicate !== "function") return false;
    return value.some((entry, index) =>
      (predicate as (x: unknown, i: number) => boolean)(entry, index),
    );
  },
  diCount: (value: unknown): number => (Array.isArray(value) ? value.length : 0),
  diDistinctCount: (value: unknown): number =>
    Array.isArray(value) ? new Set(value).size : 0,
  diIn: (value: unknown, candidates: unknown): boolean =>
    Array.isArray(candidates) ? candidates.includes(value) : false,
  diStartsWith: (value: unknown, prefix: unknown): boolean =>
    String(value || "").startsWith(String(prefix || "")),
  diMatchesPattern: (value: unknown, pattern: unknown, flags?: unknown): boolean => {
    const regex = new RegExp(String(pattern || ""), String(flags || ""));
    return regex.test(String(value || ""));
  },
  diIncludes: (container: unknown, item: unknown): boolean =>
    Array.isArray(container)
      ? container.includes(item)
      : String(container || "").includes(String(item || "")),
  diSum: (values: unknown): number =>
    Array.isArray(values)
      ? values.reduce((sum, value) => sum + Number(value || 0), 0)
      : 0,
  diLog10: (value: unknown): number => Math.log10(Number(value || 0)),
};

describe("qualityGateRunner.expression", () => {
  test("evaluates expression against provided scope and helpers", () => {
    const triggered = evaluateRuleBooleanExpression({
      normalizedExpression:
        "answerMode === 'nav_pills' && diCount(output.items) === 2 && diMatchesPattern(output.text, 'sources:', 'i')",
      scope: {
        answerMode: "nav_pills",
        context: {},
        output: { items: ["a", "b"], text: "Sources: Budget.xlsx" },
        attachments: {},
        source: {},
        config: {},
      },
      helpers,
    });

    expect(triggered).toBe(true);
  });

  test("throws when expression is syntactically invalid", () => {
    expect(() =>
      evaluateRuleBooleanExpression({
        normalizedExpression: "context. === true",
        scope: {
          answerMode: "general_answer",
          context: {},
          output: {},
          attachments: {},
          source: {},
          config: {},
        },
        helpers,
      }),
    ).toThrow();
  });
});
