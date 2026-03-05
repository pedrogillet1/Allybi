import * as fs from "fs";
import * as path from "path";
import { describe, expect, test } from "@jest/globals";
import { writeCertificationGateReport } from "./reporting";

function readJson(rel: string) {
  return JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../data_banks", rel), "utf8"),
  );
}

function slotExtractorSignature(pattern: any): string {
  const extractors = Array.isArray(pattern?.slotExtractors)
    ? pattern.slotExtractors
    : [];
  return extractors
    .map(
      (entry: any) =>
        `${String(entry?.type || "").trim()}->${String(entry?.out || "").trim()}`,
    )
    .filter(Boolean)
    .sort((a: string, b: string) => a.localeCompare(b))
    .join(",");
}

function patternSignature(pattern: any): string {
  return [
    String(pattern?.calcFamily || "").trim(),
    String(pattern?.disambiguationGroup || "").trim(),
    slotExtractorSignature(pattern),
  ].join("|");
}

describe("Certification: routing-calc-intents-parity", () => {
  const en = readJson("agents/excel_calc/routing/calc_intent_patterns.en.any.json");
  const pt = readJson("agents/excel_calc/routing/calc_intent_patterns.pt.any.json");
  const enPatterns = Array.isArray(en?.patterns) ? en.patterns : [];
  const ptPatterns = Array.isArray(pt?.patterns) ? pt.patterns : [];

  test("EN/PT calc banks are enabled and deterministic", () => {
    expect(en?.config?.enabled).toBe(true);
    expect(pt?.config?.enabled).toBe(true);
    expect(en?.config?.deterministic).toBe(true);
    expect(pt?.config?.deterministic).toBe(true);
  });

  test("EN/PT calc banks have equal pattern counts", () => {
    expect(enPatterns.length).toBe(ptPatterns.length);
  });

  test("EN/PT calc banks have matching parity signatures", () => {
    const enSignatures = new Set(enPatterns.map(patternSignature));
    const ptSignatures = new Set(ptPatterns.map(patternSignature));
    expect(enSignatures).toEqual(ptSignatures);
  });

  test("EN/PT calc patterns keep locale language labels", () => {
    for (const entry of enPatterns) {
      expect(String(entry?.lang || "").trim().toLowerCase()).toBe("en");
    }
    for (const entry of ptPatterns) {
      expect(String(entry?.lang || "").trim().toLowerCase()).toBe("pt");
    }
  });

  test("write certification gate report", () => {
    const failures: string[] = [];

    if (en?.config?.enabled !== true) failures.push("CALC_EN_DISABLED");
    if (pt?.config?.enabled !== true) failures.push("CALC_PT_DISABLED");
    if (en?.config?.deterministic !== true) failures.push("CALC_EN_NON_DETERMINISTIC");
    if (pt?.config?.deterministic !== true) failures.push("CALC_PT_NON_DETERMINISTIC");

    if (enPatterns.length !== ptPatterns.length) {
      failures.push(`PATTERN_COUNT_MISMATCH_EN_${enPatterns.length}_PT_${ptPatterns.length}`);
    }

    const enSignatures = new Set(enPatterns.map(patternSignature));
    const ptSignatures = new Set(ptPatterns.map(patternSignature));
    const enOnly = [...enSignatures].filter((sig) => !ptSignatures.has(sig));
    const ptOnly = [...ptSignatures].filter((sig) => !enSignatures.has(sig));
    if (enOnly.length > 0) failures.push(`EN_ONLY_SIGNATURES_${enOnly.length}`);
    if (ptOnly.length > 0) failures.push(`PT_ONLY_SIGNATURES_${ptOnly.length}`);

    writeCertificationGateReport("routing-calc-intents-parity", {
      passed: failures.length === 0,
      metrics: {
        enPatterns: enPatterns.length,
        ptPatterns: ptPatterns.length,
        enUniqueSignatures: enSignatures.size,
        ptUniqueSignatures: ptSignatures.size,
      },
      thresholds: {
        maxFailures: 0,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});

