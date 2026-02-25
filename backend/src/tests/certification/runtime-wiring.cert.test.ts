import { describe, expect, test } from "@jest/globals";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

import { writeCertificationGateReport } from "./reporting";

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

    const criticalPaths = [
      "src/controllers/rag.controller.test.ts",
      "src/services/chat/turnRouter.service.test.ts",
      "src/services/chat/guardrails/editorMode.guard.test.ts",
      "src/services/core/banks/runtimeWiringIntegrity.service.test.ts",
      "src/modules/chat/runtime/ChatRuntimeOrchestrator.test.ts",
    ];
    const missingCriticalPaths = criticalPaths.filter(
      (relPath) => !fs.existsSync(path.resolve(process.cwd(), relPath)),
    );

    const failures: string[] = [];
    if ((run.status ?? 1) !== 0) failures.push("RUNTIME_GRAPH_COMMAND_FAILED");
    if (!graphExists) failures.push("RUNTIME_GRAPH_MISSING");
    if (reachableFiles < 350) failures.push("REACHABLE_FILES_BELOW_THRESHOLD");
    if (reachableRuntimeFiles < 360) {
      failures.push("RUNTIME_REACHABLE_FILES_BELOW_THRESHOLD");
    }
    if (runtimeCoverage < 0.59) {
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
      thresholds: {
        minReachableFiles: 350,
        minReachableRuntimeFiles: 360,
        minRuntimeCoverage: 0.59,
        maxMissingLocalRefs: 0,
        maxLegacyRouteWrappers: 0,
        maxMissingCriticalPaths: 0,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
