import * as fs from "fs";
import * as path from "path";
import { describe, expect, test } from "@jest/globals";

/**
 * Disambiguation Real Bank Integration Test
 *
 * Loads real disambiguation_policies.any.json and validates:
 * 1. Autopick threshold behavior
 * 2. Ask threshold behavior
 * 3. maxQuestions and maxOptions enforcement
 * 4. Critical rules presence
 */

function readJson(rel: string) {
  return JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "../../data_banks", rel),
      "utf8",
    ),
  );
}

interface DisambiguationPolicies {
  config: {
    maxQuestions: number;
    actionsContract: {
      thresholds: {
        autopickTopScore: number;
        autopickGap: number;
        autopickMinScopeCompliance: number;
        disambiguateIfScoreBelow: number;
        disambiguateIfGapBelow: number;
        maxOptions: number;
        minOptions: number;
      };
      [k: string]: unknown;
    };
    optionPolicy: {
      maxOptions: number;
      minOptions: number;
      [k: string]: unknown;
    };
    [k: string]: unknown;
  };
  rules: Array<{
    id: string;
    scope: string;
    action: { type: string; [k: string]: unknown };
    reasonCode: string;
    severity: string;
    condition?: Record<string, unknown>;
    [k: string]: unknown;
  }>;
  [k: string]: unknown;
}

describe("Integration: disambiguation-real-bank", () => {
  const bank: DisambiguationPolicies = readJson(
    "ambiguity/disambiguation_policies.any.json",
  );
  const thresholds = bank.config.actionsContract.thresholds;
  const rules = Array.isArray(bank.rules) ? bank.rules : [];
  const optionPolicy = bank.config.optionPolicy;

  // -----------------------------------------------------------------------
  // 1. Autopick threshold
  // -----------------------------------------------------------------------
  test("autopick when topScore >= threshold and scoreGap >= threshold", () => {
    const topScore = 0.9;
    const scoreGap = 0.3;
    const scopeCompliance = 0.9;

    const shouldAutopick =
      topScore >= thresholds.autopickTopScore &&
      scoreGap >= thresholds.autopickGap &&
      scopeCompliance >= thresholds.autopickMinScopeCompliance;

    expect(shouldAutopick).toBe(true);
    expect(thresholds.autopickTopScore).toBe(0.85);
    expect(thresholds.autopickGap).toBe(0.25);
  });

  // -----------------------------------------------------------------------
  // 2. Ask (disambiguate) threshold
  // -----------------------------------------------------------------------
  test("disambiguate when topScore below threshold or gap too narrow", () => {
    const topScore = 0.6;
    const scoreGap = 0.1;

    const shouldDisambiguate =
      topScore < thresholds.disambiguateIfScoreBelow ||
      scoreGap < thresholds.disambiguateIfGapBelow;

    expect(shouldDisambiguate).toBe(true);
    expect(thresholds.disambiguateIfScoreBelow).toBe(0.7);
    expect(thresholds.disambiguateIfGapBelow).toBe(0.15);
  });

  test("no disambiguation when scores are clearly separated", () => {
    const topScore = 0.92;
    const scoreGap = 0.35;

    const shouldDisambiguate =
      topScore < thresholds.disambiguateIfScoreBelow ||
      scoreGap < thresholds.disambiguateIfGapBelow;

    expect(shouldDisambiguate).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 3. maxQuestions and maxOptions enforcement
  // -----------------------------------------------------------------------
  test("maxQuestions === 1", () => {
    expect(bank.config.maxQuestions).toBe(1);
  });

  test("maxOptions === 4", () => {
    expect(optionPolicy.maxOptions).toBe(4);
  });

  test("minOptions === 2", () => {
    expect(optionPolicy.minOptions).toBe(2);
  });

  // -----------------------------------------------------------------------
  // 4. Critical rules presence
  // -----------------------------------------------------------------------
  test("no_disambiguation_if_explicit_doc_lock rule present with severity CRITICAL", () => {
    const rule = rules.find((r) =>
      r.id === "no_disambiguation_if_explicit_doc_lock",
    );
    expect(rule).toBeDefined();
    expect(rule!.severity.toLowerCase()).toBe("critical");
  });

  test("single_question_enforced rule present with severity CRITICAL", () => {
    const rule = rules.find((r) => r.id === "single_question_enforced");
    expect(rule).toBeDefined();
    expect(rule!.severity.toLowerCase()).toBe("critical");
  });

  test("enforce_option_limits rule present", () => {
    const rule = rules.find((r) => r.id === "enforce_option_limits");
    expect(rule).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 5. Rule count and structural integrity
  // -----------------------------------------------------------------------
  test("at least 6 disambiguation rules", () => {
    expect(rules.length).toBeGreaterThanOrEqual(6);
  });

  test("all rules have id, scope, action, reasonCode, severity", () => {
    for (const rule of rules) {
      expect(typeof rule.id).toBe("string");
      expect(rule.id.length).toBeGreaterThan(0);
      expect(typeof rule.scope).toBe("string");
      expect(typeof rule.action).toBe("object");
      expect(typeof rule.action.type).toBe("string");
      expect(typeof rule.reasonCode).toBe("string");
      expect(typeof rule.severity).toBe("string");
    }
  });

  // -----------------------------------------------------------------------
  // 6. Built-in test cases
  // -----------------------------------------------------------------------
  test("bank ships built-in test cases", () => {
    const testCases = (bank as any).tests?.cases;
    expect(Array.isArray(testCases)).toBe(true);
    expect(testCases.length).toBeGreaterThanOrEqual(4);
  });
});
