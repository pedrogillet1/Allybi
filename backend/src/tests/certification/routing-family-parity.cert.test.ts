import * as fs from "fs";
import * as path from "path";
import { describe, expect, test } from "@jest/globals";
import { writeCertificationGateReport } from "./reporting";

function readJson(rel: string) {
  return JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../data_banks", rel), "utf8"),
  );
}

describe("Certification: routing-family-parity", () => {
  const intentConfig = readJson("routing/intent_config.any.json");
  const intentPatterns = readJson("routing/intent_patterns.any.json");

  const configFamilies = new Set(
    (Array.isArray(intentConfig?.intentFamilies) ? intentConfig.intentFamilies : [])
      .map((entry: any) => String(entry?.id || "").trim())
      .filter(Boolean),
  );

  const patternFamilies = new Set(
    Object.keys(
      intentPatterns?.intentFamilies &&
        typeof intentPatterns.intentFamilies === "object"
        ? intentPatterns.intentFamilies
        : {},
    ).map((id) => String(id || "").trim()),
  );

  test("intent_patterns covers required first-class routing families", () => {
    for (const familyId of [
      "documents",
      "editing",
      "calc",
      "navigation",
      "integrations",
    ]) {
      expect(patternFamilies.has(familyId)).toBe(true);
    }
  });

  test("intent_patterns includes all families declared in intent_config", () => {
    const missing = Array.from(configFamilies).filter(
      (familyId) => !patternFamilies.has(familyId),
    );
    expect(missing).toEqual([]);
  });

  test("write certification gate report", () => {
    const failures: string[] = [];
    const missing = Array.from(configFamilies).filter(
      (familyId) => !patternFamilies.has(familyId),
    );
    for (const familyId of missing) {
      failures.push(`MISSING_PATTERN_FAMILY_${familyId}`);
    }

    writeCertificationGateReport("routing-family-parity", {
      passed: failures.length === 0,
      metrics: {
        configFamilyCount: configFamilies.size,
        patternFamilyCount: patternFamilies.size,
      },
      thresholds: {
        maxFailures: 0,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
