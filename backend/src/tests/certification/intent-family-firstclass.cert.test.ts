import { describe, expect, test } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { writeCertificationGateReport } from "./reporting";

function readJson(rel: string) {
  return JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../data_banks", rel), "utf8"),
  );
}

describe("Certification: intent-family-firstclass", () => {
  test("intent_config declares calc/navigation/integrations as first-class families", () => {
    const bank = readJson("routing/intent_config.any.json");
    const families = Array.isArray(bank?.intentFamilies) ? bank.intentFamilies : [];
    const byId = new Map<string, any>();
    for (const family of families) {
      const id = String(family?.id || "").trim();
      if (id) byId.set(id, family);
    }

    for (const familyId of ["calc", "navigation", "integrations"]) {
      expect(byId.has(familyId)).toBe(true);
      const allowed = Array.isArray(byId.get(familyId)?.operatorsAllowed)
        ? byId.get(familyId).operatorsAllowed
        : [];
      expect(allowed.length).toBeGreaterThan(0);
    }
  });

  test("defaultOperatorByFamily includes first-class alias families", () => {
    const bank = readJson("routing/intent_config.any.json");
    const defaults = bank?.config?.defaultOperatorByFamily || {};
    expect(typeof defaults.calc).toBe("string");
    expect(typeof defaults.navigation).toBe("string");
    expect(typeof defaults.integrations).toBe("string");
    expect(String(defaults.calc).trim().length).toBeGreaterThan(0);
    expect(String(defaults.navigation).trim().length).toBeGreaterThan(0);
    expect(String(defaults.integrations).trim().length).toBeGreaterThan(0);
  });

  test("turnRouter maps alias forms to canonical first-class families", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../services/chat/turnRouter.service.ts"),
      "utf8",
    );
    expect(src).toContain("const INTENT_FAMILY_ALIASES");
    expect(src).toContain('calculation: "calc"');
    expect(src).toContain('nav: "navigation"');
    expect(src).toContain('integration: "integrations"');
    expect(src).toContain("function canonicalIntentFamily");
  });

  test("write certification gate report", () => {
    const failures: string[] = [];

    const bank = readJson("routing/intent_config.any.json");
    const families = Array.isArray(bank?.intentFamilies) ? bank.intentFamilies : [];
    const familyIds = new Set(
      families.map((f: any) => String(f?.id || "").trim()).filter(Boolean),
    );
    const defaults = bank?.config?.defaultOperatorByFamily || {};

    for (const familyId of ["calc", "navigation", "integrations"]) {
      if (!familyIds.has(familyId)) failures.push(`MISSING_FAMILY_${familyId}`);
      if (typeof defaults[familyId] !== "string" || !String(defaults[familyId]).trim()) {
        failures.push(`MISSING_DEFAULT_OPERATOR_${familyId}`);
      }
    }

    const src = fs.readFileSync(
      path.resolve(__dirname, "../../services/chat/turnRouter.service.ts"),
      "utf8",
    );
    if (!src.includes('calculation: "calc"')) {
      failures.push("MISSING_CANONICAL_CALC_MAPPING");
    }
    if (!src.includes('nav: "navigation"')) {
      failures.push("MISSING_CANONICAL_NAVIGATION_MAPPING");
    }
    if (!src.includes('integration: "integrations"')) {
      failures.push("MISSING_CANONICAL_INTEGRATIONS_MAPPING");
    }

    writeCertificationGateReport("intent-family-firstclass", {
      passed: failures.length === 0,
      metrics: {
        totalFamilies: familyIds.size,
        hasCalc: familyIds.has("calc"),
        hasNavigation: familyIds.has("navigation"),
        hasIntegrations: familyIds.has("integrations"),
      },
      thresholds: {
        requiredFirstClassFamilies: 3,
        maxFailures: 0,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
