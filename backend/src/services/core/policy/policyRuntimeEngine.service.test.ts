import { describe, expect, test } from "@jest/globals";
import { extractPolicyRules, PolicyRuntimeEngine } from "./policyRuntimeEngine.service";

describe("PolicyRuntimeEngine", () => {
  test("returns highest-priority matching rule", () => {
    const engine = new PolicyRuntimeEngine();
    const match = engine.firstMatch({
      runtime: { signals: { score: 0.92, blocked: true } },
      rules: [
        {
          id: "low_priority",
          priority: 10,
          when: { path: "signals.blocked", op: "eq", value: true },
          then: { action: "warn" },
        },
        {
          id: "high_priority",
          priority: 50,
          when: {
            all: [
              { path: "signals.blocked", op: "eq", value: true },
              { path: "signals.score", op: "gte", value: 0.9 },
            ],
          },
          then: { action: "block" },
          reasonCode: "high_risk",
        },
      ],
    });

    expect(match?.ruleId).toBe("high_priority");
    expect(match?.reasonCode).toBe("high_risk");
    expect(match?.then.action).toBe("block");
  });

  test("supports any/contains/in predicates", () => {
    const engine = new PolicyRuntimeEngine();
    const match = engine.firstMatch({
      runtime: {
        signals: {
          tags: ["pii", "sensitive"],
          channel: "chat",
        },
      },
      rules: [
        {
          id: "rule_any",
          priority: 1,
          when: {
            any: [
              { path: "signals.tags", op: "contains", value: "sensitive" },
              { path: "signals.channel", op: "in", value: ["api", "admin"] },
            ],
          },
          then: { action: "redact" },
        },
      ],
    });

    expect(match?.ruleId).toBe("rule_any");
    expect(match?.then.action).toBe("redact");
  });

  test("loads rules from nested policies.rules and supports defaultAction", () => {
    const engine = new PolicyRuntimeEngine();
    const noMatch = engine.firstMatch({
      runtime: { signals: { blocked: false } },
      policyBank: {
        config: {
          defaultAction: "allow",
        },
        policies: {
          rules: [
            {
              ruleId: "needs_block",
              priority: 10,
              when: { path: "signals.blocked", op: "eq", value: true },
              then: { action: "block" },
            },
          ],
        },
      },
    });

    expect(noMatch?.ruleId).toBe("__default__");
    expect(noMatch?.then.action).toBe("allow");
  });

  test("treats when.any=true as an always-match fallback", () => {
    const engine = new PolicyRuntimeEngine();
    const match = engine.firstMatch({
      runtime: {},
      rules: [
        {
          id: "fallback",
          when: { any: true as any },
          then: { action: "use_default_agent" },
        },
      ],
    });
    expect(match?.ruleId).toBe("fallback");
    expect(match?.then.action).toBe("use_default_agent");
  });

  test("extractPolicyRules merges top-level and nested rules", () => {
    const rules = extractPolicyRules({
      rules: [{ id: "one" }],
      policies: { rules: [{ ruleId: "two" }] },
    });
    expect(rules).toHaveLength(2);
  });
});
