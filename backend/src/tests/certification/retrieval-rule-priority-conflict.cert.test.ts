import { describe, expect, test } from "@jest/globals";
import {
  matchBoostRules,
  applyBoostScoring,
  summarizeBoostRuleApplications,
  type RuleMatchContext,
  type BoostRule,
  type BoostScoringCandidate,
} from "../../services/retrieval/document_intelligence/ruleInterpreter";

function makeCtx(
  overrides: Partial<RuleMatchContext> = {},
): RuleMatchContext {
  return {
    intent: "extract",
    operator: "extract",
    domain: "finance",
    docLock: false,
    explicitDocsCount: 1,
    explicitDocIds: ["doc-a"],
    explicitDocTypes: ["ap_aging_report"],
    maxMatchedBoostRules: 3,
    maxDocumentIntelligenceBoost: 0.45,
    ...overrides,
  };
}

function makeRule(overrides: Partial<BoostRule> & { id: string }): BoostRule {
  return {
    enabled: true,
    priority: 50,
    weight: 1,
    operators: ["extract"],
    conditions: { requireDomainMatch: true, domains: ["finance"] },
    boostDocTypes: [{ docType: "ap_aging_report", weight: 3 }],
    boostSections: [{ section: "aging_bucket", weight: 2 }],
    ...overrides,
  };
}

function makeCandidate(
  id: string,
  overrides: Partial<BoostScoringCandidate> = {},
): BoostScoringCandidate {
  return {
    candidateId: id,
    docId: "doc-a",
    docType: "ap_aging_report",
    location: { sectionKey: "aging_bucket" },
    scores: { final: 0.5, documentIntelligenceBoost: 0 },
    ...overrides,
  };
}

describe("retrieval-rule-priority-conflict", () => {
  test("higher-priority rule is sorted first when 2 rules match same chunk", () => {
    const ctx = makeCtx();
    const rules: BoostRule[] = [
      makeRule({ id: "low_priority", priority: 2 }),
      makeRule({ id: "high_priority", priority: 15 }),
    ];

    const matched = matchBoostRules(ctx, rules);

    expect(matched.length).toBe(2);
    expect(matched[0].id).toBe("high_priority");
    expect(matched[0].priority).toBe(15);
    expect(matched[1].id).toBe("low_priority");
    expect(matched[1].priority).toBe(2);
  });

  test("diminishing returns apply to lower-priority rules", () => {
    const ctx = makeCtx();
    const rules: BoostRule[] = [
      makeRule({ id: "rule_a", priority: 15 }),
      makeRule({ id: "rule_b", priority: 10 }),
      makeRule({ id: "rule_c", priority: 5 }),
    ];

    const matched = matchBoostRules(ctx, rules);
    expect(matched.length).toBe(3);

    const candidates = [makeCandidate("c1")];
    const scored = applyBoostScoring(ctx, candidates, matched);

    // normalizeWeightedMap with baseWeight=1:
    //   docTypeWeights["ap_aging_report"] = normalizeWeight(3)*1 = 3
    //   sectionWeights["aging_bucket"] = normalizeWeight(2)*1 = 2
    // Per-rule full boost = 3*0.03 + 2*0.025 = 0.09 + 0.05 = 0.14
    // rule_a (i=0): 0.14 * 1/1 = 0.14
    // rule_b (i=1): 0.14 * 1/2 = 0.07
    // rule_c (i=2): 0.14 * 1/3 ≈ 0.04667
    const perRuleBoost = 3 * 0.03 + 2 * 0.025;
    const expectedBoost =
      perRuleBoost * 1 + perRuleBoost * (1 / 2) + perRuleBoost * (1 / 3);
    const clampedBoost = Math.min(expectedBoost, 0.45);

    expect(scored[0].scores.documentIntelligenceBoost).toBeCloseTo(
      clampedBoost,
      4,
    );
    expect(scored[0].scores.documentIntelligenceBoost).toBeGreaterThan(0);
    expect(scored[0].scores.final).toBeGreaterThan(0.5);
  });

  test("maxMatchedBoostRules limits applied rules", () => {
    const ctx = makeCtx({ maxMatchedBoostRules: 2 });
    const rules: BoostRule[] = [
      makeRule({ id: "rule_a", priority: 15 }),
      makeRule({ id: "rule_b", priority: 12 }),
      makeRule({ id: "rule_c", priority: 8 }),
      makeRule({ id: "rule_d", priority: 4 }),
      makeRule({ id: "rule_e", priority: 1 }),
    ];

    const matched = matchBoostRules(ctx, rules);
    expect(matched.length).toBe(5);

    const candidates = [makeCandidate("c1")];
    const scored = applyBoostScoring(ctx, candidates, matched);

    // Only top 2 rules should be applied (maxMatchedBoostRules=2)
    const perRuleBoost = 3 * 0.03 + 2 * 0.025; // 0.14
    const expectedBoost = perRuleBoost * 1 + perRuleBoost * (1 / 2);
    expect(scored[0].scores.documentIntelligenceBoost).toBeCloseTo(
      expectedBoost,
      4,
    );
  });

  test("summarizeBoostRuleApplications computes per-rule deltas", () => {
    const ctx = makeCtx();
    const rules: BoostRule[] = [
      makeRule({ id: "rule_a", priority: 15 }),
      makeRule({ id: "rule_b", priority: 8 }),
    ];

    const matched = matchBoostRules(ctx, rules);
    const candidates = [
      makeCandidate("c1"),
      makeCandidate("c2", { docType: "ap_aging_report" }),
    ];

    const summaries = summarizeBoostRuleApplications(ctx, candidates, matched);

    expect(summaries.length).toBeGreaterThan(0);
    for (const summary of summaries) {
      expect(typeof summary.ruleId).toBe("string");
      expect(typeof summary.candidateHits).toBe("number");
      expect(typeof summary.totalDelta).toBe("number");
      expect(typeof summary.averageDelta).toBe("number");
      expect(typeof summary.maxDelta).toBe("number");
      expect(summary.candidateHits).toBeGreaterThan(0);
    }
  });

  test("equal-priority rules are tie-broken by id alphabetically", () => {
    const ctx = makeCtx();
    const rules: BoostRule[] = [
      makeRule({ id: "zebra_rule", priority: 50 }),
      makeRule({ id: "alpha_rule", priority: 50 }),
    ];

    const matched = matchBoostRules(ctx, rules);
    expect(matched[0].id).toBe("alpha_rule");
    expect(matched[1].id).toBe("zebra_rule");
  });
});
