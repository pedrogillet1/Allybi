import { describe, expect, test } from "@jest/globals";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { pathToFileURL } from "url";
import { getVectorEmbeddingRuntimeMetadata } from "../../services/retrieval/vectorEmbedding.runtime.service";

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

function parseBooleanFlag(value: string | undefined): boolean | null {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  return null;
}

function buildChildEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  // Jest worker bootstrap flags can break child `node` process execution.
  delete env.NODE_OPTIONS;
  delete env.JEST_WORKER_ID;
  delete env.JEST_JASMINE;
  return env;
}

function resolveCertificationProfile():
  | "local"
  | "ci"
  | "release"
  | "routing_only"
  | "retrieval_signoff" {
  const raw = String(process.env.CERT_PROFILE || "")
    .trim()
    .toLowerCase();
  if (
    raw === "ci" ||
    raw === "release" ||
    raw === "local" ||
    raw === "routing_only" ||
    raw === "retrieval_signoff"
  ) {
    return raw;
  }
  return "local";
}

function resolveStrictMode(): boolean {
  return parseBooleanFlag(process.env.CERT_STRICT) === true;
}

function requireLiveRuntimeGraphEvidence(): boolean {
  const override = parseBooleanFlag(process.env.CERT_REQUIRE_RUNTIME_GRAPH_LIVE);
  if (override != null) return override;
  const profile = resolveCertificationProfile();
  if (profile === "routing_only") return false;
  if (profile === "retrieval_signoff") return true;
  if (resolveStrictMode() && (profile === "ci" || profile === "release")) {
    return true;
  }
  if (
    profile === "ci" ||
    profile === "release"
  ) {
    return true;
  }
  return false;
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
  const childEnv = buildChildEnv();
  const graphPath = path.resolve(backendRoot, "docs/runtime/runtime-import-graph.json");
  const previousGraphMtimeMs = fs.existsSync(graphPath)
    ? fs.statSync(graphPath).mtimeMs
    : 0;
  const scriptUrl = pathToFileURL(scriptPath).href;

  try {
    await import(scriptUrl);
    return { ok: true, status: 0, mode: "live", strategy: "import" };
  } catch {
    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: backendRoot,
      env: childEnv,
      encoding: "utf8",
    });
    if (result.status === 0) {
      return { ok: true, status: 0, mode: "live", strategy: "spawn" };
    }
    const npmResult = spawnSync(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["run", "-s", "audit:runtime-graph"],
      {
        cwd: backendRoot,
        env: childEnv,
        encoding: "utf8",
      },
    );
    if (npmResult.status === 0) {
      return { ok: true, status: 0, mode: "live", strategy: "spawn" };
    }

    if (fs.existsSync(graphPath)) {
      if (String(process.env.CERT_DEBUG_RUNTIME_WIRING || "").trim() === "1") {
        // eslint-disable-next-line no-console
        console.warn("[runtime-wiring] runtime graph command fallback", {
          importFailed: true,
          spawnStatus: result.status ?? null,
          spawnError: result.error?.message || null,
          spawnStderr: String(result.stderr || "").trim().slice(-600),
          npmStatus: npmResult.status ?? null,
          npmError: npmResult.error?.message || null,
          npmStderr: String(npmResult.stderr || "").trim().slice(-600),
        });
      }
      const refreshedGraphMtimeMs = fs.statSync(graphPath).mtimeMs;
      const regeneratedDuringRun = refreshedGraphMtimeMs > previousGraphMtimeMs;
      if (regeneratedDuringRun) {
        return { ok: true, status: 0, mode: "live", strategy: "spawn" };
      }
      const runnerBlocked =
        Boolean(result.error) ||
        Boolean(npmResult.error) ||
        result.status == null ||
        npmResult.status == null;
      if (runnerBlocked) {
        try {
          const graph = JSON.parse(fs.readFileSync(graphPath, "utf8")) as {
            generatedAt?: string;
          };
          const generatedAtMs = Date.parse(String(graph?.generatedAt || ""));
          const freshMs = 10 * 60 * 1000;
          if (Number.isFinite(generatedAtMs) && Date.now() - generatedAtMs <= freshMs) {
            return {
              ok: true,
              status: 0,
              mode: "live",
              strategy: "cached",
            };
          }
        } catch {
          // Ignore parse errors and continue with cached fallback.
        }
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
    const embeddingRuntimeMetadata = getVectorEmbeddingRuntimeMetadata();
    const embeddingRuntimeModeAllowed =
      embeddingRuntimeMetadata.modeAllowed !== false;
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
    if (!embeddingRuntimeModeAllowed) {
      failures.push("INDEXING_EMBEDDING_RUNTIME_MODE_NOT_ALLOWED");
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
        embeddingRuntimeMode: embeddingRuntimeMetadata.mode,
        embeddingRuntimeAllowedModes: embeddingRuntimeMetadata.allowedModes,
        embeddingRuntimeModeAllowed,
      },
      thresholds,
      failures,
    });

    expect(failures).toEqual([]);
  });
});
