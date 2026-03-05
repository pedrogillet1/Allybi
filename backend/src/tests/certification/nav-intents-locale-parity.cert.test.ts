import { describe, expect, test } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { writeCertificationGateReport } from "./reporting";

function readJson(rel: string) {
  return JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../data_banks", rel), "utf8"),
  );
}

describe("Certification: nav-intents-locale-parity", () => {
  const REQUIRED_LOCALES = ["en", "pt", "es"] as const;

  test("bank_registry has nav intent banks for en/pt/es", () => {
    const registry = readJson("manifest/bank_registry.any.json");
    const banks = Array.isArray(registry?.banks) ? registry.banks : [];
    const ids = new Set(banks.map((b: any) => String(b?.id || "").trim()));
    for (const locale of REQUIRED_LOCALES) {
      expect(ids.has(`nav_intents_${locale}`)).toBe(true);
    }
  });

  test("each locale nav bank exists and has non-empty patterns", () => {
    for (const locale of REQUIRED_LOCALES) {
      const bank = readJson(`patterns/navigation/nav_intents.${locale}.any.json`);
      expect(bank?._meta?.id).toBe(`nav_intents_${locale}`);
      expect(Array.isArray(bank?.patterns)).toBe(true);
      expect(bank.patterns.length).toBeGreaterThan(0);
    }
  });

  test("all locale banks expose deterministic config", () => {
    for (const locale of REQUIRED_LOCALES) {
      const bank = readJson(`patterns/navigation/nav_intents.${locale}.any.json`);
      expect(bank?.config?.enabled).toBe(true);
      expect(bank?.config?.deterministic).toBe(true);
    }
  });

  test("write certification gate report", () => {
    const failures: string[] = [];
    const registry = readJson("manifest/bank_registry.any.json");
    const banks = Array.isArray(registry?.banks) ? registry.banks : [];
    const ids = new Set(banks.map((b: any) => String(b?.id || "").trim()));

    for (const locale of REQUIRED_LOCALES) {
      const id = `nav_intents_${locale}`;
      if (!ids.has(id)) {
        failures.push(`MISSING_REGISTRY_BANK_${id}`);
        continue;
      }
      const file = path.resolve(
        __dirname,
        "../../data_banks",
        `patterns/navigation/nav_intents.${locale}.any.json`,
      );
      if (!fs.existsSync(file)) {
        failures.push(`MISSING_FILE_nav_intents.${locale}.any.json`);
        continue;
      }
      const bank = JSON.parse(fs.readFileSync(file, "utf8"));
      const patterns = Array.isArray(bank?.patterns) ? bank.patterns : [];
      if (!bank?.config?.enabled) failures.push(`DISABLED_nav_intents_${locale}`);
      if (!bank?.config?.deterministic) {
        failures.push(`NON_DETERMINISTIC_nav_intents_${locale}`);
      }
      if (patterns.length === 0) failures.push(`EMPTY_PATTERNS_nav_intents_${locale}`);
    }

    writeCertificationGateReport("nav-intents-locale-parity", {
      passed: failures.length === 0,
      metrics: {
        requiredLocales: REQUIRED_LOCALES.length,
        localesCovered: REQUIRED_LOCALES.filter((locale) =>
          ids.has(`nav_intents_${locale}`),
        ).length,
      },
      thresholds: {
        minLocalesCovered: 3,
        maxFailures: 0,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});

