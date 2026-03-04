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

interface TiebreakStage {
  id: string;
  weight: number;
}

interface RoutingPriorityBank {
  config: {
    enabled: boolean;
    [k: string]: unknown;
  };
  intentFamilyBasePriority: Record<string, number>;
  tiebreakStages: TiebreakStage[];
}

const EXPECTED_STAGE_IDS = [
  "locked_scope_first",
  "explicit_document_reference",
  "operator_confidence",
  "intent_family_priority",
  "recency_and_followup",
];

const EXPECTED_WEIGHTS_DESCENDING = [100, 95, 90, 80, 60];

const EXPECTED_INTENT_PRIORITIES: Record<string, number> = {
  editing: 95,
  email: 94,
  connectors: 93,
  help: 92,
  file_actions: 90,
  doc_stats: 85,
  documents: 80,
  conversation: 50,
  error: 10,
};

describe("Certification: tiebreak-stage-ordering", () => {
  const bank: RoutingPriorityBank = readJson(
    "routing/routing_priority.any.json",
  );
  const { tiebreakStages, intentFamilyBasePriority, config } = bank;

  // -------------------------------------------------------------------------
  // Stage presence
  // -------------------------------------------------------------------------

  test("5 tiebreak stages present with expected IDs", () => {
    expect(tiebreakStages).toHaveLength(5);
    const stageIds = tiebreakStages.map((s) => s.id);
    for (const expectedId of EXPECTED_STAGE_IDS) {
      expect(stageIds).toContain(expectedId);
    }
  });

  // -------------------------------------------------------------------------
  // Weight ordering: strict descending 100 > 95 > 90 > 80 > 60
  // -------------------------------------------------------------------------

  test("weights follow strict descending order: 100 > 95 > 90 > 80 > 60", () => {
    const actualWeights = tiebreakStages.map((s) => s.weight);
    expect(actualWeights).toEqual(EXPECTED_WEIGHTS_DESCENDING);

    // Also verify strictly descending
    for (let i = 1; i < actualWeights.length; i++) {
      expect(actualWeights[i - 1]).toBeGreaterThan(actualWeights[i]);
    }
  });

  // -------------------------------------------------------------------------
  // Intent family priorities
  // -------------------------------------------------------------------------

  test("intent family base priorities match expected values", () => {
    for (const [family, expectedPriority] of Object.entries(
      EXPECTED_INTENT_PRIORITIES,
    )) {
      expect(intentFamilyBasePriority[family]).toBe(expectedPriority);
    }
  });

  // -------------------------------------------------------------------------
  // Stage weight uniqueness
  // -------------------------------------------------------------------------

  test("no two stages share the same weight", () => {
    const weights = tiebreakStages.map((s) => s.weight);
    const uniqueWeights = new Set(weights);
    expect(uniqueWeights.size).toBe(weights.length);
  });

  // -------------------------------------------------------------------------
  // Config
  // -------------------------------------------------------------------------

  test("config.enabled === true", () => {
    expect(config.enabled).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Gate report
  // -------------------------------------------------------------------------

  test("write certification gate report", () => {
    const failures: string[] = [];

    if (tiebreakStages.length !== 5) {
      failures.push("STAGE_COUNT_MISMATCH");
    }

    const stageIds = tiebreakStages.map((s) => s.id);
    for (const expectedId of EXPECTED_STAGE_IDS) {
      if (!stageIds.includes(expectedId)) {
        failures.push(`MISSING_STAGE_${expectedId}`);
      }
    }

    const actualWeights = tiebreakStages.map((s) => s.weight);
    for (let i = 0; i < EXPECTED_WEIGHTS_DESCENDING.length; i++) {
      if (actualWeights[i] !== EXPECTED_WEIGHTS_DESCENDING[i]) {
        failures.push(
          `WEIGHT_MISMATCH_stage_${i}_expected_${EXPECTED_WEIGHTS_DESCENDING[i]}_got_${actualWeights[i]}`,
        );
      }
    }

    const weights = tiebreakStages.map((s) => s.weight);
    if (new Set(weights).size !== weights.length) {
      failures.push("DUPLICATE_WEIGHTS");
    }

    for (const [family, expectedPriority] of Object.entries(
      EXPECTED_INTENT_PRIORITIES,
    )) {
      if (intentFamilyBasePriority[family] !== expectedPriority) {
        failures.push(
          `PRIORITY_MISMATCH_${family}_expected_${expectedPriority}_got_${intentFamilyBasePriority[family]}`,
        );
      }
    }

    if (!config.enabled) {
      failures.push("CONFIG_NOT_ENABLED");
    }

    writeCertificationGateReport("tiebreak-stage-ordering", {
      passed: failures.length === 0,
      metrics: {
        stageCount: tiebreakStages.length,
        uniqueWeights: new Set(weights).size,
        intentFamilyCount: Object.keys(intentFamilyBasePriority).length,
        configEnabled: config.enabled,
      },
      thresholds: {
        expectedStageCount: 5,
        expectedUniqueWeights: 5,
        expectedIntentFamilyCount: Object.keys(EXPECTED_INTENT_PRIORITIES)
          .length,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
