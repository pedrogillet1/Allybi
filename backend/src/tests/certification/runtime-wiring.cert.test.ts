import { describe, expect, test } from "@jest/globals";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

import { writeCertificationGateReport } from "./reporting";
import { CHAT_ANSWER_MODES } from "../../modules/chat/domain/answerModes";

function readThresholds() {
  const defaultThresholds = {
    minReachableFiles: 350,
    minReachableRuntimeFiles: 360,
    minRuntimeCoverage: 0.8,
    maxMissingLocalRefs: 0,
    maxLegacyRouteWrappers: 0,
    maxMissingCriticalPaths: 0,
  };
  const budgetPath = path.resolve(
    process.cwd(),
    "scripts/audit/reachability-budget.json",
  );
  if (!fs.existsSync(budgetPath)) return defaultThresholds;
  try {
    const budget = JSON.parse(fs.readFileSync(budgetPath, "utf8")) as {
      minRuntimeCoverage?: number;
      minReachableFiles?: number;
      minReachableRuntimeFiles?: number;
    };
    return {
      ...defaultThresholds,
      minReachableFiles:
        typeof budget.minReachableFiles === "number"
          ? budget.minReachableFiles
          : defaultThresholds.minReachableFiles,
      minReachableRuntimeFiles:
        typeof budget.minReachableRuntimeFiles === "number"
          ? budget.minReachableRuntimeFiles
          : defaultThresholds.minReachableRuntimeFiles,
      minRuntimeCoverage:
        typeof budget.minRuntimeCoverage === "number"
          ? budget.minRuntimeCoverage
          : defaultThresholds.minRuntimeCoverage,
    };
  } catch {
    return defaultThresholds;
  }
}

describe("Certification: runtime wiring reachability", () => {
  test("runtime graph and critical wiring contracts are present", () => {
    const run = spawnSync(
      process.execPath,
      ["scripts/audit/runtime-import-graph.mjs"],
      {
        cwd: process.cwd(),
        env: process.env,
        encoding: "utf8",
      },
    );

    const graphPath = path.resolve(
      process.cwd(),
      "docs/runtime/runtime-import-graph.json",
    );
    const graphExists = fs.existsSync(graphPath);
    const graph = graphExists
      ? (JSON.parse(fs.readFileSync(graphPath, "utf8")) as any)
      : null;

    const totals = graph?.totals || {};
    const runtimeTotals = graph?.runtimeTotals || {};
    const reachableFiles = Number(totals.reachableFiles || 0);
    const reachableRuntimeFiles = Number(runtimeTotals.reachableFiles || 0);
    const runtimeCoverage = Number(runtimeTotals.coverage || 0);
    const missingLocalRefs = Number(totals.missingLocalRefs || 0);
    const legacyRouteWrappers = Array.isArray(graph?.legacyRouteWrappers)
      ? graph.legacyRouteWrappers.length
      : 0;
    const thresholds = readThresholds();

    const criticalPaths = [
      "src/controllers/rag.controller.test.ts",
      "src/services/chat/turnRouter.service.test.ts",
      "src/services/core/banks/runtimeWiringIntegrity.service.test.ts",
      "src/modules/chat/runtime/ChatRuntimeOrchestrator.test.ts",
    ];
    const missingCriticalPaths = criticalPaths.filter(
      (relPath) => !fs.existsSync(path.resolve(process.cwd(), relPath)),
    );

    const failures: string[] = [];
    if ((run.status ?? 1) !== 0) failures.push("RUNTIME_GRAPH_COMMAND_FAILED");
    if (!graphExists) failures.push("RUNTIME_GRAPH_MISSING");
    if (reachableFiles < thresholds.minReachableFiles) {
      failures.push("REACHABLE_FILES_BELOW_THRESHOLD");
    }
    if (reachableRuntimeFiles < thresholds.minReachableRuntimeFiles) {
      failures.push("RUNTIME_REACHABLE_FILES_BELOW_THRESHOLD");
    }
    if (runtimeCoverage < thresholds.minRuntimeCoverage) {
      failures.push("RUNTIME_COVERAGE_BELOW_THRESHOLD");
    }
    if (missingLocalRefs > 0)
      failures.push("MISSING_LOCAL_REFS_ABOVE_THRESHOLD");
    if (legacyRouteWrappers > 0) failures.push("LEGACY_ROUTE_WRAPPERS_PRESENT");
    if (missingCriticalPaths.length > 0) {
      failures.push("MISSING_CRITICAL_WIRING_TEST_PATHS");
    }

    writeCertificationGateReport("runtime-wiring", {
      passed: failures.length === 0,
      metrics: {
        commandStatus: run.status ?? 1,
        reachableFiles,
        reachableRuntimeFiles,
        runtimeCoverage,
        missingLocalRefs,
        legacyRouteWrappers,
        missingCriticalPaths: missingCriticalPaths.length,
      },
      thresholds,
      failures,
    });

    expect(failures).toEqual([]);
  });
});

describe("Certification: type-bank alignment", () => {
  const KNOWN_BANK_FAMILIES = new Set([
    "documents",
    "file_actions",
    "navigation",
    "help",
    "conversation",
    "account",
    "unknown",
    "editing",
    "connectors",
    "email",
    "error",
    "doc_stats",
  ]);

  function loadOperatorContracts(): Array<{
    id: string;
    family?: string;
    preferredAnswerMode?: string;
  }> {
    const candidates = [
      path.resolve(
        process.cwd(),
        "src/data_banks/operators/operator_contracts.any.json",
      ),
      path.resolve(
        process.cwd(),
        "backend/src/data_banks/operators/operator_contracts.any.json",
      ),
    ];
    for (const candidate of candidates) {
      if (!fs.existsSync(candidate)) continue;
      const parsed = JSON.parse(fs.readFileSync(candidate, "utf8"));
      return Array.isArray(parsed?.operators) ? parsed.operators : [];
    }
    return [];
  }

  test("every operator_contracts family is a known family", () => {
    const operators = loadOperatorContracts();
    expect(operators.length).toBeGreaterThan(0);
    const unknownFamilies = operators
      .filter((op) => op.family && !KNOWN_BANK_FAMILIES.has(op.family))
      .map((op) => `${op.id}:${op.family}`);
    expect(unknownFamilies).toEqual([]);
  });

  test("every operator_contracts preferredAnswerMode is a known CHAT_ANSWER_MODE or extended mode", () => {
    const operators = loadOperatorContracts();
    expect(operators.length).toBeGreaterThan(0);
    // Extended modes used by non-chat pipelines (editing/connectors/conversation)
    const extendedModes = new Set([
      ...CHAT_ANSWER_MODES,
      "file_list",
      "conversation",
    ]);
    const unknownModes = operators
      .filter(
        (op) =>
          op.preferredAnswerMode && !extendedModes.has(op.preferredAnswerMode),
      )
      .map((op) => `${op.id}:${op.preferredAnswerMode}`);
    expect(unknownModes).toEqual([]);
  });
});
