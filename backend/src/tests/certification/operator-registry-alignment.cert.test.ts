import * as fs from "fs";
import * as path from "path";
import { describe, expect, test } from "@jest/globals";

function readJson(rel: string) {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../data_banks", rel), "utf8"));
}

describe("operator-registry-alignment", () => {
  test("canonical registry exists and maps all known operator aliases", () => {
    const registry = readJson("operators/operator_canonical_registry.any.json");
    expect(registry._meta.id).toBe("operator_canonical_registry");
    expect(Array.isArray(registry.operators)).toBe(true);
    expect(registry.operators.length).toBeGreaterThan(0);

    for (const op of registry.operators) {
      expect(op.canonicalId).toBeTruthy();
      expect(op.family).toBeTruthy();
      expect(Array.isArray(op.aliases)).toBe(true);
    }
  });

  test("collision matrix operators all map to canonical IDs", () => {
    const registry = readJson("operators/operator_canonical_registry.any.json");
    const collisionMatrix = readJson("operators/operator_collision_matrix.any.json");
    const allAliases = new Set<string>();
    for (const op of registry.operators) {
      allAliases.add(op.canonicalId.toLowerCase());
      for (const alias of op.aliases) allAliases.add(alias.toLowerCase());
    }

    for (const rule of collisionMatrix.rules) {
      for (const opRef of rule.when.operators || []) {
        expect(allAliases.has(opRef.toLowerCase())).toBe(true);
      }
    }
  });

  test("intent_config operatorsAllowed all map to canonical IDs", () => {
    const registry = readJson("operators/operator_canonical_registry.any.json");
    const intentConfig = readJson("routing/intent_config.any.json");
    const allAliases = new Set<string>();
    for (const op of registry.operators) {
      allAliases.add(op.canonicalId.toLowerCase());
      for (const alias of op.aliases) allAliases.add(alias.toLowerCase());
    }

    for (const family of intentConfig.intentFamilies) {
      for (const opId of family.operatorsAllowed || []) {
        expect(allAliases.has(opId.toLowerCase())).toBe(true);
      }
    }
  });
});
