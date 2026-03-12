/**
 * numeric-consistency.cert.test.ts
 * Cross-bank numeric parameter consistency certification.
 *
 * Verifies that all data banks agree on shared numeric parameters so that
 * conflicting values (different maxChars, different hard caps, etc.) never
 * silently drift apart again.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "@jest/globals";
import { writeCertificationGateReport } from "./reporting";

/* ------------------------------------------------------------------ */
/*  Bank loading — read JSON files directly (same pattern as           */
/*  prompt-mode-coverage.cert.test.ts)                                 */
/* ------------------------------------------------------------------ */

const BANK_ROOT = path.resolve(process.cwd(), "src/data_banks");

function loadBank<T = any>(subdir: string, bankId: string): T {
  const filePath = path.join(BANK_ROOT, subdir, `${bankId}.any.json`);
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

const answerStylePolicy = loadBank("formatting", "answer_style_policy");
const truncationAndLimits = loadBank("formatting", "truncation_and_limits");
const qualityGates = loadBank("quality", "quality_gates");
const rankerConfig = loadBank("retrieval", "retrieval_ranker_config");
const semanticSearchConfig = loadBank("retrieval", "semantic_search_config");

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

const profiles = ["micro", "brief", "concise", "standard", "detailed", "deep"] as const;

describe("Cross-Bank Numeric Consistency", () => {
  /* ====== Profile budget alignment ====== */

  describe("profile budget alignment", () => {
    it("maxChars match between answer_style_policy and truncation_and_limits", () => {
      const failures: string[] = [];
      for (const p of profiles) {
        const asp = answerStylePolicy.profiles[p]?.budget?.maxChars;
        const tal = truncationAndLimits.profileBudgets[p]?.maxChars;
        if (asp !== tal) {
          failures.push(`${p}: answer_style_policy=${asp} vs truncation_and_limits=${tal}`);
        }
      }

      writeCertificationGateReport("numeric-consistency-maxChars", {
        passed: failures.length === 0,
        metrics: Object.fromEntries(
          profiles.map((p) => [
            p,
            {
              answerStylePolicy: answerStylePolicy.profiles[p]?.budget?.maxChars,
              truncationAndLimits: truncationAndLimits.profileBudgets[p]?.maxChars,
            },
          ]),
        ),
        thresholds: { requirement: "values must match across both banks" },
        failures,
      });

      expect(failures).toEqual([]);
    });

    it("maxParagraphs match between answer_style_policy and truncation_and_limits", () => {
      const failures: string[] = [];
      for (const p of profiles) {
        const asp = answerStylePolicy.profiles[p]?.budget?.maxParagraphs;
        const tal = truncationAndLimits.profileBudgets[p]?.maxParagraphs;
        if (asp !== tal) {
          failures.push(`${p}: answer_style_policy=${asp} vs truncation_and_limits=${tal}`);
        }
      }

      writeCertificationGateReport("numeric-consistency-maxParagraphs", {
        passed: failures.length === 0,
        metrics: Object.fromEntries(
          profiles.map((p) => [
            p,
            {
              answerStylePolicy: answerStylePolicy.profiles[p]?.budget?.maxParagraphs,
              truncationAndLimits: truncationAndLimits.profileBudgets[p]?.maxParagraphs,
            },
          ]),
        ),
        thresholds: { requirement: "values must match across both banks" },
        failures,
      });

      expect(failures).toEqual([]);
    });

    it("maxBullets match between answer_style_policy and truncation_and_limits", () => {
      const failures: string[] = [];
      for (const p of profiles) {
        const asp = answerStylePolicy.profiles[p]?.budget?.maxBullets;
        const tal = truncationAndLimits.profileBudgets[p]?.maxBullets;
        if (asp !== tal) {
          failures.push(`${p}: answer_style_policy=${asp} vs truncation_and_limits=${tal}`);
        }
      }

      writeCertificationGateReport("numeric-consistency-maxBullets", {
        passed: failures.length === 0,
        metrics: Object.fromEntries(
          profiles.map((p) => [
            p,
            {
              answerStylePolicy: answerStylePolicy.profiles[p]?.budget?.maxBullets,
              truncationAndLimits: truncationAndLimits.profileBudgets[p]?.maxBullets,
            },
          ]),
        ),
        thresholds: { requirement: "values must match across both banks" },
        failures,
      });

      expect(failures).toEqual([]);
    });
  });

  /* ====== Hard cap consistency ====== */

  describe("hard cap consistency", () => {
    it("no profile maxTableRows exceeds globalLimits.maxTableRowsHard", () => {
      const hardCap = truncationAndLimits.globalLimits.maxTableRowsHard;
      const failures: string[] = [];
      for (const p of profiles) {
        const rows = answerStylePolicy.profiles[p]?.budget?.maxTableRows;
        if (typeof rows === "number" && rows > hardCap) {
          failures.push(`${p}: maxTableRows=${rows} exceeds hard cap ${hardCap}`);
        }
      }

      writeCertificationGateReport("numeric-consistency-maxTableRows-cap", {
        passed: failures.length === 0,
        metrics: {
          hardCap,
          profileValues: Object.fromEntries(
            profiles.map((p) => [p, answerStylePolicy.profiles[p]?.budget?.maxTableRows]),
          ),
        },
        thresholds: { maxTableRowsHard: hardCap },
        failures,
      });

      expect(failures).toEqual([]);
    });

    it("no profile maxBullets exceeds globalLimits.maxBulletsHard", () => {
      const hardCap = truncationAndLimits.globalLimits.maxBulletsHard;
      const failures: string[] = [];
      for (const p of profiles) {
        const bullets = answerStylePolicy.profiles[p]?.budget?.maxBullets;
        if (typeof bullets === "number" && bullets > hardCap) {
          failures.push(`${p}: maxBullets=${bullets} exceeds hard cap ${hardCap}`);
        }
      }

      writeCertificationGateReport("numeric-consistency-maxBullets-cap", {
        passed: failures.length === 0,
        metrics: {
          hardCap,
          profileValues: Object.fromEntries(
            profiles.map((p) => [p, answerStylePolicy.profiles[p]?.budget?.maxBullets]),
          ),
        },
        thresholds: { maxBulletsHard: hardCap },
        failures,
      });

      expect(failures).toEqual([]);
    });

    it("quality_gates does not own formatting hard caps covered by truncation_and_limits", () => {
      const forbiddenKeys = [
        "maxCharsHard",
        "maxBlocksHard",
        "maxBulletsHard",
        "maxTablesHard",
        "maxQuotesHard",
      ] as const;
      const present = forbiddenKeys.filter(
        (key) => qualityGates?.config?.limits?.[key] != null,
      );
      const failures = present.map(
        (key) => `QUALITY_GATES_DUPLICATE_LIMIT:${key}`,
      );

      writeCertificationGateReport("numeric-consistency-quality-gates-ownership", {
        passed: failures.length === 0,
        metrics: {
          qualityGateLimitKeys: Object.keys(qualityGates?.config?.limits || {}),
          truncationOwnedKeys: forbiddenKeys,
        },
        thresholds: {
          requirement: "quality_gates must not duplicate formatting or truncation hard caps",
        },
        failures,
      });

      expect(failures).toEqual([]);
    });

    it("maxCharsPerCell in answer_style_policy does not exceed truncation_and_limits maxCellCharsHard", () => {
      const aspCell = answerStylePolicy.config.globalRules.tableRules.maxCharsPerCell;
      const talHard = truncationAndLimits.tableLimits.maxCellCharsHard;
      const failures: string[] = [];
      if (aspCell > talHard) {
        failures.push(`answer_style_policy.maxCharsPerCell=${aspCell} exceeds truncation_and_limits.maxCellCharsHard=${talHard}`);
      }

      writeCertificationGateReport("numeric-consistency-maxCellChars", {
        passed: failures.length === 0,
        metrics: { answerStylePolicyMaxCharsPerCell: aspCell, truncationMaxCellCharsHard: talHard },
        thresholds: { requirement: "maxCharsPerCell <= maxCellCharsHard" },
        failures,
      });

      expect(failures).toEqual([]);
    });
  });

  /* ====== Retrieval ranker weights ====== */

  describe("retrieval ranker weights", () => {
    const expectedComponents = [
      "semantic",
      "lexical",
      "structural",
      "titleBoost",
      "documentIntelligenceBoost",
      "routingPriorityBoost",
      "typeBoost",
      "recencyBoost",
    ] as const;

    it("all 8 scoring components are present", () => {
      const weights = rankerConfig.config.weights;
      const failures: string[] = [];
      for (const key of expectedComponents) {
        if (typeof weights[key] !== "number") {
          failures.push(`missing or non-numeric weight: ${key}`);
        }
      }

      writeCertificationGateReport("numeric-consistency-ranker-components", {
        passed: failures.length === 0,
        metrics: { presentKeys: Object.keys(weights), expectedCount: expectedComponents.length },
        thresholds: { allPresent: true },
        failures,
      });

      expect(failures).toEqual([]);
    });

    it("weights sum to 1.0", () => {
      const weights = rankerConfig.config.weights;
      const sum = expectedComponents.reduce((acc, key) => acc + (weights[key] || 0), 0);
      const failures: string[] = [];
      if (Math.abs(sum - 1.0) > 0.005) {
        failures.push(`weight sum=${sum}, expected 1.0`);
      }

      writeCertificationGateReport("numeric-consistency-ranker-weight-sum", {
        passed: failures.length === 0,
        metrics: { sum, componentValues: Object.fromEntries(expectedComponents.map((k) => [k, weights[k]])) },
        thresholds: { expectedSum: 1.0, tolerance: 0.005 },
        failures,
      });

      expect(sum).toBeCloseTo(1.0, 2);
    });

    it("minFinalScore is below encrypted-mode semantic cap", () => {
      const minFinalScore = rankerConfig.config.actionsContract.thresholds.minFinalScore;
      const semanticWeight = rankerConfig.config.weights.semantic;
      const failures: string[] = [];
      if (minFinalScore >= semanticWeight) {
        failures.push(
          `minFinalScore=${minFinalScore} >= semantic weight=${semanticWeight}; encrypted mode (semantic-only) would never pass`,
        );
      }

      writeCertificationGateReport("numeric-consistency-minFinalScore-vs-semantic", {
        passed: failures.length === 0,
        metrics: { minFinalScore, semanticWeight },
        thresholds: { requirement: "minFinalScore < semantic weight" },
        failures,
      });

      expect(failures).toEqual([]);
    });
  });

  /* ====== Stale penalty consistency ====== */

  describe("stale penalty consistency", () => {
    it("staleContextPenalty is consistent across semantic_search_config and retrieval_ranker_config", () => {
      const sscPenalty = semanticSearchConfig.config.memoryContinuity.staleContextPenalty;
      const rrcPenalty = rankerConfig.config.memoryContinuity.penalties.staleScope;
      const failures: string[] = [];
      if (sscPenalty !== rrcPenalty) {
        failures.push(
          `semantic_search_config.staleContextPenalty=${sscPenalty} vs retrieval_ranker_config.staleScope=${rrcPenalty}`,
        );
      }

      writeCertificationGateReport("numeric-consistency-stalePenalty", {
        passed: failures.length === 0,
        metrics: { semanticSearchConfig: sscPenalty, retrievalRankerConfig: rrcPenalty },
        thresholds: { requirement: "both must be 0.12" },
        failures,
      });

      expect(failures).toEqual([]);
    });
  });
});
