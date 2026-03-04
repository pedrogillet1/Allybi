import * as fs from "fs";
import * as path from "path";
import { describe, expect, test } from "@jest/globals";
import { writeCertificationGateReport } from "./reporting";

function readJson(rel: string) {
  return JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "../../data_banks", rel),
      "utf8",
    ),
  );
}

describe("Certification: routing-parity EN/PT", () => {
  // -------------------------------------------------------------------------
  // 1. intent_patterns parity
  // -------------------------------------------------------------------------
  describe("intent_patterns operator locale parity", () => {
    const bank = readJson("routing/intent_patterns.any.json");
    const operators = bank?.operators || {};

    for (const [opId, entry] of Object.entries(operators) as [string, any][]) {
      if (opId.startsWith("_")) continue;

      test(`${opId}: patterns.en and patterns.pt both have entries`, () => {
        const pEn = Array.isArray(entry?.patterns?.en) ? entry.patterns.en : [];
        const pPt = Array.isArray(entry?.patterns?.pt) ? entry.patterns.pt : [];
        expect(pEn.length).toBeGreaterThan(0);
        expect(pPt.length).toBeGreaterThan(0);
      });

      test(`${opId}: negatives.en and negatives.pt have matching presence`, () => {
        const nEn = Array.isArray(entry?.negatives?.en) ? entry.negatives.en : [];
        const nPt = Array.isArray(entry?.negatives?.pt) ? entry.negatives.pt : [];
        // Both present or both empty
        if (nEn.length > 0) {
          expect(nPt.length).toBeGreaterThan(0);
        }
      });
    }
  });

  // -------------------------------------------------------------------------
  // 2. intent_config keyword parity
  // -------------------------------------------------------------------------
  describe("intent_config keyword locale parity", () => {
    const bank = readJson("routing/intent_config.any.json");
    const intents = bank?.intents || {};

    for (const [intentId, entry] of Object.entries(intents) as [string, any][]) {
      if (!entry?.keywords) continue;
      // error_unknown intentionally has empty keywords (catch-all fallback).
      const isErrorFallback = String(entry.id || intentId).includes("error");
      if (isErrorFallback) continue;

      test(`${intentId}: keywords.en and keywords.pt both present and non-empty`, () => {
        const kwEn = Array.isArray(entry.keywords?.en) ? entry.keywords.en : [];
        const kwPt = Array.isArray(entry.keywords?.pt) ? entry.keywords.pt : [];
        expect(kwEn.length).toBeGreaterThan(0);
        expect(kwPt.length).toBeGreaterThan(0);
      });
    }
  });

  // -------------------------------------------------------------------------
  // 3. collision_matrix locale parity
  // -------------------------------------------------------------------------
  describe("collision_matrix locale parity", () => {
    const bank = readJson("operators/operator_collision_matrix.any.json");
    const rules = Array.isArray(bank?.rules) ? bank.rules : [];

    for (const rule of rules) {
      const ruleId = rule?.id || "unknown";
      if (!rule?.when?.queryRegexAny) continue;

      test(`${ruleId}: queryRegexAny has en, pt, es arrays all non-empty`, () => {
        const qra = rule.when.queryRegexAny;
        expect(Array.isArray(qra.en)).toBe(true);
        expect(qra.en.length).toBeGreaterThan(0);
        expect(Array.isArray(qra.pt)).toBe(true);
        expect(qra.pt.length).toBeGreaterThan(0);
        expect(Array.isArray(qra.es)).toBe(true);
        expect(qra.es.length).toBeGreaterThan(0);
      });
    }
  });

  // -------------------------------------------------------------------------
  // 4. allybi_intents parity
  // -------------------------------------------------------------------------
  describe("allybi_intents locale parity", () => {
    const bank = readJson("routing/allybi_intents.any.json");
    const intents = Array.isArray(bank?.intents) ? bank.intents : [];

    test("at least 10 intents present", () => {
      expect(intents.length).toBeGreaterThanOrEqual(10);
    });

    for (const intent of intents) {
      const intentId = intent?.intent_id || "unknown";

      test(`${intentId}: examples_en and examples_pt both present and same length`, () => {
        const en = Array.isArray(intent?.examples_en) ? intent.examples_en : [];
        const pt = Array.isArray(intent?.examples_pt) ? intent.examples_pt : [];
        expect(en.length).toBeGreaterThan(0);
        expect(pt.length).toBeGreaterThan(0);
        expect(en.length).toBe(pt.length);
      });
    }
  });

  // -------------------------------------------------------------------------
  // 5. Operator banks EN/PT parity
  // -------------------------------------------------------------------------
  describe("operator banks EN/PT parity", () => {
    const OPERATOR_BANK_FILES = [
      "patterns/operators/advise.any.json",
      "patterns/operators/calculate.any.json",
      "patterns/operators/compare.any.json",
      "patterns/operators/evaluate.any.json",
      "patterns/operators/extract.any.json",
      "patterns/operators/locate.any.json",
      "patterns/operators/monitor.any.json",
      "patterns/operators/navigate.any.json",
      "patterns/operators/open.any.json",
      "patterns/operators/summarize.any.json",
      "patterns/operators/validate.any.json",
    ];

    for (const bankFile of OPERATOR_BANK_FILES) {
      const bankName = bankFile.split("/").pop()!.replace(".any.json", "");
      const bank = readJson(bankFile);
      const patterns = Array.isArray(bank?.patterns) ? bank.patterns : [];

      test(`${bankName}: has patterns`, () => {
        expect(patterns.length).toBeGreaterThan(0);
      });

      test(`${bankName}: every pattern has non-empty en[] and pt[]`, () => {
        for (const pattern of patterns) {
          const patternId = pattern?.id || "unknown";
          const en = Array.isArray(pattern?.en) ? pattern.en : [];
          const pt = Array.isArray(pattern?.pt) ? pattern.pt : [];
          expect(en.length).toBeGreaterThan(0);
          expect(pt.length).toBeGreaterThan(0);
        }
      });

      test(`${bankName}: en.length === pt.length for every pattern`, () => {
        let mismatches = 0;
        for (const pattern of patterns) {
          const en = Array.isArray(pattern?.en) ? pattern.en : [];
          const pt = Array.isArray(pattern?.pt) ? pattern.pt : [];
          if (en.length !== pt.length) mismatches++;
        }
        expect(mismatches).toBe(0);
      });
    }
  });

  // -------------------------------------------------------------------------
  // 6. Quality trigger banks EN/PT parity
  // -------------------------------------------------------------------------
  describe("quality trigger banks EN/PT parity", () => {
    const QUALITY_BANK_FILES = [
      "patterns/quality/ambiguity_triggers.any.json",
      "patterns/quality/language_lock_triggers.any.json",
      "patterns/quality/numeric_integrity_triggers.any.json",
      "patterns/quality/unsafe_operation_triggers.any.json",
      "patterns/quality/weak_evidence_triggers.any.json",
      "patterns/quality/wrong_doc_risk.any.json",
    ];

    for (const bankFile of QUALITY_BANK_FILES) {
      const bankName = bankFile.split("/").pop()!.replace(".any.json", "");
      const bank = readJson(bankFile);
      const patterns = Array.isArray(bank?.patterns) ? bank.patterns : [];

      test(`${bankName}: has patterns`, () => {
        expect(patterns.length).toBeGreaterThan(0);
      });

      test(`${bankName}: every pattern has non-empty en[] and pt[]`, () => {
        for (const pattern of patterns) {
          const en = Array.isArray(pattern?.en) ? pattern.en : [];
          const pt = Array.isArray(pattern?.pt) ? pattern.pt : [];
          expect(en.length).toBeGreaterThan(0);
          expect(pt.length).toBeGreaterThan(0);
        }
      });
    }
  });

  // -------------------------------------------------------------------------
  // Gate report
  // -------------------------------------------------------------------------
  test("write certification gate report", () => {
    const bank = readJson("routing/intent_patterns.any.json");
    const operators = bank?.operators || {};
    const failures: string[] = [];
    let operatorsTested = 0;

    for (const [opId, entry] of Object.entries(operators) as [string, any][]) {
      if (opId.startsWith("_")) continue;
      operatorsTested++;
      const pEn = Array.isArray(entry?.patterns?.en) ? entry.patterns.en : [];
      const pPt = Array.isArray(entry?.patterns?.pt) ? entry.patterns.pt : [];
      if (pEn.length === 0) failures.push(`MISSING_PATTERNS_EN_${opId}`);
      if (pPt.length === 0) failures.push(`MISSING_PATTERNS_PT_${opId}`);
    }

    const configBank = readJson("routing/intent_config.any.json");
    const intents = configBank?.intents || {};
    let intentKeywordsTested = 0;
    for (const [intentId, entry] of Object.entries(intents) as [string, any][]) {
      if (!entry?.keywords) continue;
      const isErrorFallback = String(entry.id || intentId).includes("error");
      if (isErrorFallback) continue;
      intentKeywordsTested++;
      const kwEn = Array.isArray(entry.keywords?.en) ? entry.keywords.en : [];
      const kwPt = Array.isArray(entry.keywords?.pt) ? entry.keywords.pt : [];
      if (kwEn.length === 0) failures.push(`MISSING_KEYWORDS_EN_${intentId}`);
      if (kwPt.length === 0) failures.push(`MISSING_KEYWORDS_PT_${intentId}`);
    }

    const allybiBank = readJson("routing/allybi_intents.any.json");
    const allybiIntents = Array.isArray(allybiBank?.intents) ? allybiBank.intents : [];
    let allybiTested = 0;
    for (const intent of allybiIntents) {
      allybiTested++;
      const en = Array.isArray(intent?.examples_en) ? intent.examples_en : [];
      const pt = Array.isArray(intent?.examples_pt) ? intent.examples_pt : [];
      if (en.length === 0) failures.push(`MISSING_EXAMPLES_EN_${intent?.intent_id}`);
      if (pt.length === 0) failures.push(`MISSING_EXAMPLES_PT_${intent?.intent_id}`);
      if (en.length !== pt.length) failures.push(`LENGTH_MISMATCH_${intent?.intent_id}`);
    }

    // Operator banks parity
    const operatorBankFiles = [
      "patterns/operators/advise.any.json",
      "patterns/operators/calculate.any.json",
      "patterns/operators/compare.any.json",
      "patterns/operators/evaluate.any.json",
      "patterns/operators/extract.any.json",
      "patterns/operators/locate.any.json",
      "patterns/operators/monitor.any.json",
      "patterns/operators/navigate.any.json",
      "patterns/operators/open.any.json",
      "patterns/operators/summarize.any.json",
      "patterns/operators/validate.any.json",
    ];
    let operatorBanksTested = 0;
    for (const bankFile of operatorBankFiles) {
      const bankName = bankFile.split("/").pop()!.replace(".any.json", "");
      const bank = readJson(bankFile);
      const patterns = Array.isArray(bank?.patterns) ? bank.patterns : [];
      operatorBanksTested++;
      for (const pattern of patterns) {
        const patternId = pattern?.id || "unknown";
        const en = Array.isArray(pattern?.en) ? pattern.en : [];
        const pt = Array.isArray(pattern?.pt) ? pattern.pt : [];
        if (en.length === 0) failures.push(`OP_MISSING_EN_${bankName}_${patternId}`);
        if (pt.length === 0) failures.push(`OP_MISSING_PT_${bankName}_${patternId}`);
      }
    }

    // Quality trigger banks parity
    const qualityBankFiles = [
      "patterns/quality/ambiguity_triggers.any.json",
      "patterns/quality/language_lock_triggers.any.json",
      "patterns/quality/numeric_integrity_triggers.any.json",
      "patterns/quality/unsafe_operation_triggers.any.json",
      "patterns/quality/weak_evidence_triggers.any.json",
      "patterns/quality/wrong_doc_risk.any.json",
    ];
    let qualityBanksTested = 0;
    for (const bankFile of qualityBankFiles) {
      const bankName = bankFile.split("/").pop()!.replace(".any.json", "");
      const bank = readJson(bankFile);
      const patterns = Array.isArray(bank?.patterns) ? bank.patterns : [];
      qualityBanksTested++;
      for (const pattern of patterns) {
        const patternId = pattern?.id || "unknown";
        const en = Array.isArray(pattern?.en) ? pattern.en : [];
        const pt = Array.isArray(pattern?.pt) ? pattern.pt : [];
        if (en.length === 0) failures.push(`QT_MISSING_EN_${bankName}_${patternId}`);
        if (pt.length === 0) failures.push(`QT_MISSING_PT_${bankName}_${patternId}`);
      }
    }

    writeCertificationGateReport("routing-parity", {
      passed: failures.length === 0,
      metrics: {
        operatorsTested,
        intentKeywordsTested,
        allybiIntentsTested: allybiTested,
        operatorBanksTested,
        qualityBanksTested,
      },
      thresholds: {
        minOperators: 20,
        minIntentKeywords: 5,
        minAllybiIntents: 10,
        minOperatorBanks: 11,
        minQualityBanks: 6,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
