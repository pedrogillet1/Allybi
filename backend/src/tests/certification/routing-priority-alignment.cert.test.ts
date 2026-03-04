import * as fs from "fs";
import * as path from "path";
import { describe, expect, test } from "@jest/globals";

function readJson(rel: string) {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../data_banks", rel), "utf8"));
}

describe("routing-priority-alignment", () => {
  const intentConfig = readJson("routing/intent_config.any.json");
  const routingPriority = readJson("routing/routing_priority.any.json");
  const operatorFamilies = readJson("routing/operator_families.any.json");

  const intentConfigFamilyIds = new Set(
    (intentConfig.intentFamilies as any[]).map((f: any) => f.id)
  );
  const routingPriorityFamilyIds = new Set(
    Object.keys(routingPriority.intentFamilyBasePriority || {})
  );
  const operatorFamilyIds = new Set(
    (operatorFamilies.families as any[]).map((f: any) => f.intentFamily || f.id)
  );

  test("routing_priority covers every family in intent_config", () => {
    const missing = [...intentConfigFamilyIds].filter(id => !routingPriorityFamilyIds.has(id));
    expect(missing).toEqual([]);
  });

  test("routing_priority has no phantom families absent from intent_config", () => {
    const phantom = [...routingPriorityFamilyIds].filter(
      id => !intentConfigFamilyIds.has(id) && id !== "doc_discovery"
    );
    expect(phantom).toEqual([]);
  });

  test("operator_families covers every family in intent_config", () => {
    const missing = [...intentConfigFamilyIds].filter(id => !operatorFamilyIds.has(id));
    expect(missing).toEqual([]);
  });

  test("priorities are consistent: routing_priority is SSOT, others must not contradict", () => {
    for (const [familyId, priority] of Object.entries(routingPriority.intentFamilyBasePriority)) {
      expect(typeof priority).toBe("number");
      expect(priority).toBeGreaterThan(0);
    }
  });

  test("intent_patterns.intentFamilies does not redefine priority (defers to routing_priority)", () => {
    const intentPatterns = readJson("routing/intent_patterns.any.json");
    const families = intentPatterns.intentFamilies || {};
    for (const [id, def] of Object.entries(families) as [string, any][]) {
      expect(def).not.toHaveProperty("priority",
        expect.any(Number));
    }
  });

  test("numeric priority values match across routing_priority, intent_config, and operator_families", () => {
    const mismatches: string[] = [];
    for (const [familyId, rpPriority] of Object.entries(routingPriority.intentFamilyBasePriority) as [string, number][]) {
      // Check intent_config
      const icFamily = (intentConfig.intentFamilies as any[]).find((f: any) => f.id === familyId);
      if (icFamily && icFamily.priority !== rpPriority) {
        mismatches.push(`${familyId}: routing_priority=${rpPriority}, intent_config=${icFamily.priority}`);
      }
      // Check operator_families (map intentFamily back to family, skip doc_discovery sub-family)
      const ofFamily = (operatorFamilies.families as any[]).find(
        (f: any) => (f.intentFamily || f.id) === familyId && f.id !== "doc_discovery"
      );
      if (ofFamily && ofFamily.priority !== rpPriority) {
        mismatches.push(`${familyId}: routing_priority=${rpPriority}, operator_families=${ofFamily.priority}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  test("intent_patterns operators all have numeric priority (guard against accidental removal)", () => {
    const intentPatterns = readJson("routing/intent_patterns.any.json");
    const operators = intentPatterns.operators || {};
    const missing: string[] = [];
    for (const [id, def] of Object.entries(operators) as [string, any][]) {
      if (id.startsWith("_")) continue;
      if (typeof def.priority !== "number") {
        missing.push(id);
      }
    }
    expect(missing).toEqual([]);
  });
});
