import * as fs from "fs";
import * as path from "path";
import { describe, expect, test } from "@jest/globals";
import { writeCertificationGateReport } from "./reporting";

function readJson(rel: string) {
  return JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../data_banks", rel), "utf8"),
  );
}

type Pair = {
  id: string;
  enPath: string;
  ptPath: string;
};

const BANK_PAIRS: Pair[] = [
  {
    id: "connect",
    enPath: "patterns/integrations/connect_intents.en.any.json",
    ptPath: "patterns/integrations/connect_intents.pt.any.json",
  },
  {
    id: "search",
    enPath: "patterns/integrations/search_intents.en.any.json",
    ptPath: "patterns/integrations/search_intents.pt.any.json",
  },
  {
    id: "send",
    enPath: "patterns/integrations/send_intents.en.any.json",
    ptPath: "patterns/integrations/send_intents.pt.any.json",
  },
  {
    id: "sync",
    enPath: "patterns/integrations/sync_intents.en.any.json",
    ptPath: "patterns/integrations/sync_intents.pt.any.json",
  },
];

function asPatterns(bank: any): any[] {
  return Array.isArray(bank?.patterns) ? bank.patterns : [];
}

function signatureSet(patterns: any[]): Set<string> {
  const out = new Set<string>();
  for (const entry of patterns) {
    const operation = String(entry?.operation || "").trim().toUpperCase();
    const connectorHint = String(entry?.connectorHint || "").trim().toLowerCase();
    if (!operation || !connectorHint) continue;
    out.add(`${operation}|${connectorHint}`);
  }
  return out;
}

describe("Certification: routing-integration-intents-parity", () => {
  for (const pair of BANK_PAIRS) {
    test(`${pair.id}: EN/PT banks are enabled and deterministic`, () => {
      const en = readJson(pair.enPath);
      const pt = readJson(pair.ptPath);
      expect(en?.config?.enabled).toBe(true);
      expect(pt?.config?.enabled).toBe(true);
      expect(en?.config?.deterministic).toBe(true);
      expect(pt?.config?.deterministic).toBe(true);
    });

    test(`${pair.id}: EN/PT have matching operation+connectorHint signatures`, () => {
      const en = readJson(pair.enPath);
      const pt = readJson(pair.ptPath);
      expect(signatureSet(asPatterns(en))).toEqual(signatureSet(asPatterns(pt)));
    });

    test(`${pair.id}: locale payload keys and negatives are present`, () => {
      const en = readJson(pair.enPath);
      const pt = readJson(pair.ptPath);
      for (const entry of asPatterns(en)) {
        const localized = Array.isArray(entry?.en) ? entry.en : [];
        const negatives = Array.isArray(entry?.negatives) ? entry.negatives : [];
        expect(localized.length).toBeGreaterThan(0);
        expect(negatives.length).toBeGreaterThan(0);
      }
      for (const entry of asPatterns(pt)) {
        const localized = Array.isArray(entry?.pt) ? entry.pt : [];
        const negatives = Array.isArray(entry?.negatives) ? entry.negatives : [];
        expect(localized.length).toBeGreaterThan(0);
        expect(negatives.length).toBeGreaterThan(0);
      }
    });
  }

  test("write certification gate report", () => {
    const failures: string[] = [];
    let totalPatterns = 0;
    for (const pair of BANK_PAIRS) {
      const en = readJson(pair.enPath);
      const pt = readJson(pair.ptPath);
      const enPatterns = asPatterns(en);
      const ptPatterns = asPatterns(pt);
      totalPatterns += enPatterns.length + ptPatterns.length;

      if (en?.config?.enabled !== true) failures.push(`${pair.id}:EN_DISABLED`);
      if (pt?.config?.enabled !== true) failures.push(`${pair.id}:PT_DISABLED`);
      if (en?.config?.deterministic !== true) failures.push(`${pair.id}:EN_NON_DETERMINISTIC`);
      if (pt?.config?.deterministic !== true) failures.push(`${pair.id}:PT_NON_DETERMINISTIC`);

      const enSig = signatureSet(enPatterns);
      const ptSig = signatureSet(ptPatterns);
      if (JSON.stringify([...enSig].sort()) !== JSON.stringify([...ptSig].sort())) {
        failures.push(`${pair.id}:SIGNATURE_MISMATCH_EN_PT`);
      }

      if (enPatterns.length < 1) failures.push(`${pair.id}:MISSING_PATTERNS_EN`);
      if (ptPatterns.length < 1) failures.push(`${pair.id}:MISSING_PATTERNS_PT`);

      for (const entry of enPatterns) {
        if (!Array.isArray(entry?.en) || entry.en.length === 0) {
          failures.push(`${pair.id}:EMPTY_EN_PATTERN_${entry?.id || "unknown"}`);
        }
      }
      for (const entry of ptPatterns) {
        if (!Array.isArray(entry?.pt) || entry.pt.length === 0) {
          failures.push(`${pair.id}:EMPTY_PT_PATTERN_${entry?.id || "unknown"}`);
        }
      }
    }

    writeCertificationGateReport("routing-integration-intents-parity", {
      passed: failures.length === 0,
      metrics: {
        bankPairs: BANK_PAIRS.length,
        totalPatterns,
      },
      thresholds: {
        maxFailures: 0,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
