import { describe, expect, test } from "@jest/globals";

import { createAdminTelemetryAdapter } from "./adminTelemetryAdapter";

function buildPrismaMock(events: any[]) {
  return {
    retrievalEvent: {
      findMany: async () => events,
    },
  } as any;
}

describe("adminTelemetryAdapter retrieval rule analytics", () => {
  test("returns top rewrite rules by hit-rate", async () => {
    const events = [
      {
        id: "1",
        at: new Date(),
        domain: "finance",
        operator: "extract",
        intent: "documents",
        meta: {
          eventType: "retrieval.rewrite_applied",
          ruleId: "finance_ap_guarded",
          variantCount: 2,
        },
      },
      {
        id: "2",
        at: new Date(),
        domain: "finance",
        operator: "extract",
        intent: "documents",
        meta: {
          eventType: "retrieval.rewrite_applied",
          ruleId: "finance_ap_guarded",
          variantCount: 1,
        },
      },
      {
        id: "3",
        at: new Date(),
        domain: "finance",
        operator: "summarize",
        intent: "documents",
        meta: {
          eventType: "retrieval.rewrite_applied",
          ruleId: "finance_dre_expand",
          variantCount: 1,
        },
      },
    ];
    const adapter = createAdminTelemetryAdapter(buildPrismaMock(events));
    const result = await adapter.retrievalRewriteRulesTop({
      range: "7d",
      limit: 10,
    });

    expect(result.items[0].ruleId).toBe("finance_ap_guarded");
    expect(result.items[0].hitCount).toBe(2);
    expect(result.totalHits).toBe(3);
  });

  test("returns top boost rules by positive score delta", async () => {
    const events = [
      {
        id: "1",
        at: new Date(),
        domain: "finance",
        operator: "extract",
        intent: "documents",
        meta: { eventType: "retrieval.boost_rule_hit", ruleId: "rule_a" },
      },
      {
        id: "2",
        at: new Date(),
        domain: "finance",
        operator: "extract",
        intent: "documents",
        meta: {
          eventType: "retrieval.boost_rule_applied",
          ruleId: "rule_a",
          scoreDeltaSummary: { totalDelta: 0.2 },
        },
      },
      {
        id: "3",
        at: new Date(),
        domain: "finance",
        operator: "extract",
        intent: "documents",
        meta: {
          eventType: "retrieval.boost_rule_applied",
          ruleId: "rule_b",
          scoreDeltaSummary: { totalDelta: 0.1 },
        },
      },
    ];
    const adapter = createAdminTelemetryAdapter(buildPrismaMock(events));
    const result = await adapter.retrievalBoostRulesTop({
      range: "7d",
      limit: 10,
    });

    expect(result.items[0].ruleId).toBe("rule_a");
    expect(result.items[0].positiveDeltaTotal).toBeGreaterThan(
      result.items[1].positiveDeltaTotal,
    );
  });

  test("returns worst rules with high hits and no positive delta", async () => {
    const events = [
      {
        id: "1",
        at: new Date(),
        domain: "finance",
        operator: "extract",
        intent: "documents",
        meta: { eventType: "retrieval.boost_rule_hit", ruleId: "rule_c" },
      },
      {
        id: "2",
        at: new Date(),
        domain: "finance",
        operator: "extract",
        intent: "documents",
        meta: { eventType: "retrieval.boost_rule_hit", ruleId: "rule_c" },
      },
      {
        id: "3",
        at: new Date(),
        domain: "finance",
        operator: "extract",
        intent: "documents",
        meta: {
          eventType: "retrieval.boost_rule_applied",
          ruleId: "rule_c",
          scoreDeltaSummary: { totalDelta: 0 },
        },
      },
    ];
    const adapter = createAdminTelemetryAdapter(buildPrismaMock(events));
    const result = await adapter.retrievalWorstRules({
      range: "7d",
      limit: 10,
      minHits: 2,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].ruleId).toBe("rule_c");
    expect(result.items[0].positiveDeltaTotal).toBe(0);
  });
});
