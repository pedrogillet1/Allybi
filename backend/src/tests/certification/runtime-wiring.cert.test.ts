import { describe, expect, test } from "@jest/globals";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { pathToFileURL } from "url";

import { writeCertificationGateReport } from "./reporting";

function resolveBackendRoot(): string {
  const cwd = process.cwd();
  const candidateRoots = [cwd, path.resolve(cwd, "backend")];
  for (const root of candidateRoots) {
    if (
      fs.existsSync(path.join(root, "src")) &&
      fs.existsSync(path.join(root, "scripts"))
    ) {
      return root;
    }
  }
  return cwd;
}

function readThresholds() {
  const backendRoot = resolveBackendRoot();
  const defaultThresholds = {
    minReachableFiles: 350,
    minReachableRuntimeFiles: 360,
    minRuntimeCoverage: 0.8,
    maxMissingLocalRefs: 0,
    maxLegacyRouteWrappers: 0,
    maxMissingCriticalPaths: 0,
  };
  const budgetPath = path.resolve(backendRoot, "scripts/audit/reachability-budget.json");
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

function isCiRuntime(): boolean {
  const flags = [
    process.env.CI,
    process.env.GITHUB_ACTIONS,
    process.env.BUILD_BUILDID,
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  return flags.some((value) => value === "1" || value === "true");
}

function requireLiveRuntimeGraphEvidence(): boolean {
  const override = String(process.env.CERT_REQUIRE_RUNTIME_GRAPH_LIVE || "")
    .trim()
    .toLowerCase();
  if (override === "1" || override === "true") return true;
  if (override === "0" || override === "false") return false;
  return isCiRuntime();
}

async function runRuntimeGraphAudit(): Promise<{
  ok: boolean;
  status: number;
  mode: "live" | "cached";
  strategy: "import" | "spawn" | "cached";
}> {
  const backendRoot = resolveBackendRoot();
  const scriptPath = path.resolve(backendRoot, "scripts/audit/runtime-import-graph.mjs");
  const scriptPathFromRoot = path
    .relative(backendRoot, scriptPath)
    .replace(/\\/g, "/");
  const graphPath = path.resolve(backendRoot, "docs/runtime/runtime-import-graph.json");
  const previousGraphMtimeMs = fs.existsSync(graphPath)
    ? fs.statSync(graphPath).mtimeMs
    : 0;
  const scriptUrl = pathToFileURL(scriptPath).href;

  try {
    await import(scriptUrl);
    return { ok: true, status: 0, mode: "live", strategy: "import" };
  } catch {
    const result =
      process.platform === "win32"
        ? spawnSync(
            "cmd.exe",
            ["/d", "/s", "/c", `node ${scriptPathFromRoot}`],
            {
              cwd: backendRoot,
              env: process.env,
              encoding: "utf8",
            },
          )
        : spawnSync("node", [scriptPathFromRoot], {
            cwd: backendRoot,
            env: process.env,
            encoding: "utf8",
          });
    if (result.status === 0) {
      return { ok: true, status: 0, mode: "live", strategy: "spawn" };
    }
    const npmResult = process.platform === "win32"
      ? spawnSync("cmd.exe", ["/d", "/s", "/c", "npm.cmd run -s audit:runtime-graph"], {
        cwd: backendRoot,
        env: process.env,
        encoding: "utf8",
      })
      : spawnSync("npm", ["run", "-s", "audit:runtime-graph"], {
        cwd: backendRoot,
        env: process.env,
        encoding: "utf8",
      });
    if (npmResult.status === 0) {
      return { ok: true, status: 0, mode: "live", strategy: "spawn" };
    }

    if (fs.existsSync(graphPath)) {
      const refreshedGraphMtimeMs = fs.statSync(graphPath).mtimeMs;
      const regeneratedDuringRun = refreshedGraphMtimeMs > previousGraphMtimeMs;
      if (regeneratedDuringRun) {
        return { ok: true, status: 0, mode: "live", strategy: "spawn" };
      }
      return {
        ok: true,
        status: 0,
        mode: "cached",
        strategy: "cached",
      };
    }

    return {
      ok: false,
      status: result.status ?? 1,
      mode: "live",
      strategy: "spawn",
    };
  }
}

describe("Certification: runtime wiring reachability", () => {
  test("runtime graph and critical wiring contracts are present", async () => {
    const backendRoot = resolveBackendRoot();
    const run = await runRuntimeGraphAudit();

    const graphPath = path.resolve(backendRoot, "docs/runtime/runtime-import-graph.json");
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
      "src/services/chat/guardrails/editorMode.guard.test.ts",
      "src/services/core/banks/runtimeWiringIntegrity.service.test.ts",
      "src/modules/chat/runtime/ChatRuntimeOrchestrator.test.ts",
    ];
    const missingCriticalPaths = criticalPaths.filter(
      (relPath) => !fs.existsSync(path.resolve(backendRoot, relPath)),
    );

    const failures: string[] = [];
    if (!run.ok) failures.push("RUNTIME_GRAPH_COMMAND_FAILED");
    const requireLiveMode = requireLiveRuntimeGraphEvidence();
    if (requireLiveMode && run.mode !== "live") {
      failures.push("RUNTIME_GRAPH_DEGRADED_EVIDENCE_MODE");
    }
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
        commandStatus: run.status,
        commandMode: run.mode,
        commandStrategy: run.strategy,
        requireLiveMode,
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
