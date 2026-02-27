#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";

const strict =
  process.argv.includes("--strict") ||
  process.argv.includes("--mode=strict") ||
  (process.argv.includes("--mode") && process.argv.includes("strict"));

const ROOT = process.cwd();
const graphPath = path.resolve(ROOT, "docs/runtime/runtime-import-graph.json");
const budgetPath = path.resolve(ROOT, "scripts/audit/reachability-budget.json");
const allowlistPath = path.resolve(
  ROOT,
  "scripts/audit/reachability-allowlist.json",
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function isRuntimeSourceFile(relPath) {
  if (!relPath.startsWith("src/")) return false;
  if (relPath.endsWith(".d.ts")) return false;
  if (relPath.includes("/__tests__/")) return false;
  if (relPath.startsWith("src/admin/types/")) return false;
  if (relPath.startsWith("src/types/")) return false;
  if (relPath.includes("/types/")) return false;
  if (relPath.endsWith(".types.ts")) return false;
  if (relPath.endsWith(".contracts.ts")) return false;
  if (
    relPath.includes("/tests/") ||
    relPath.endsWith(".test.ts") ||
    relPath.endsWith(".test.tsx") ||
    relPath.endsWith(".spec.ts") ||
    relPath.endsWith(".spec.tsx")
  ) {
    return false;
  }
  if (relPath.startsWith("src/data_banks/")) return false;
  if (relPath.startsWith("src/analytics/")) return false;
  if (relPath.startsWith("src/main/health.ts")) return false;
  if (relPath.startsWith("src/jobs/")) return false;
  if (relPath.startsWith("src/services/core/certification/")) return false;
  return true;
}

function matchesAnyPattern(value, patterns) {
  return patterns.some((pattern) => {
    try {
      return new RegExp(pattern).test(value);
    } catch {
      return false;
    }
  });
}

function main() {
  if (!fs.existsSync(graphPath)) {
    console.error(`[reachability-budget] Missing runtime graph: ${graphPath}`);
    process.exit(1);
  }
  const graph = readJson(graphPath);
  const budget = fs.existsSync(budgetPath)
    ? readJson(budgetPath)
    : { minRuntimeCoverage: 0.59, maxRuntimeUnreachable: 9999 };
  const allowlist = fs.existsSync(allowlistPath)
    ? readJson(allowlistPath)
    : {
        corePrefixes: [],
        allowUnreachableExact: [],
        allowUnreachablePatterns: [],
      };

  const runtimeCoverage = Number(graph?.runtimeTotals?.coverage || 0);
  const reachableFiles = Number(graph?.totals?.reachableFiles || 0);
  const reachableRuntimeFiles = Number(
    graph?.runtimeTotals?.reachableFiles || 0,
  );
  const unreachable = Array.isArray(graph.unreachableFiles)
    ? graph.unreachableFiles
    : [];
  const runtimeUnreachable = unreachable.filter((relPath) =>
    isRuntimeSourceFile(relPath),
  );
  const corePrefixes = Array.isArray(allowlist.corePrefixes)
    ? allowlist.corePrefixes
    : [];
  const coreUnreachable = runtimeUnreachable.filter((relPath) =>
    corePrefixes.some((prefix) => relPath.startsWith(prefix)),
  );
  const allowExact = new Set(allowlist.allowUnreachableExact || []);
  const allowPatterns = Array.isArray(allowlist.allowUnreachablePatterns)
    ? allowlist.allowUnreachablePatterns
    : [];
  const unallowlistedCore = coreUnreachable.filter(
    (relPath) =>
      !allowExact.has(relPath) && !matchesAnyPattern(relPath, allowPatterns),
  );

  const failures = [];
  const minReachableFiles = Number(budget.minReachableFiles || 0);
  const minReachableRuntimeFiles = Number(budget.minReachableRuntimeFiles || 0);
  if (reachableFiles < minReachableFiles) {
    failures.push(
      `REACHABLE_FILES_BELOW_MIN (${reachableFiles} < ${minReachableFiles})`,
    );
  }
  if (reachableRuntimeFiles < minReachableRuntimeFiles) {
    failures.push(
      `RUNTIME_REACHABLE_FILES_BELOW_MIN (${reachableRuntimeFiles} < ${minReachableRuntimeFiles})`,
    );
  }
  if (runtimeCoverage < Number(budget.minRuntimeCoverage || 0)) {
    failures.push(
      `RUNTIME_COVERAGE_BELOW_MIN (${(runtimeCoverage * 100).toFixed(2)}% < ${(Number(budget.minRuntimeCoverage || 0) * 100).toFixed(2)}%)`,
    );
  }
  if (
    runtimeUnreachable.length > Number(budget.maxRuntimeUnreachable || 9999)
  ) {
    failures.push(
      `RUNTIME_UNREACHABLE_ABOVE_MAX (${runtimeUnreachable.length} > ${Number(budget.maxRuntimeUnreachable || 9999)})`,
    );
  }
  if (strict && unallowlistedCore.length > 0) {
    failures.push(
      `UNALLOWLISTED_CORE_UNREACHABLE (${unallowlistedCore.length})`,
    );
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    strict,
    runtimeCoverage,
    reachableFiles,
    reachableRuntimeFiles,
    runtimeUnreachable: runtimeUnreachable.length,
    coreUnreachable: coreUnreachable.length,
    unallowlistedCoreUnreachable: unallowlistedCore,
    minReachableFiles,
    minReachableRuntimeFiles,
    minRuntimeCoverage: Number(budget.minRuntimeCoverage || 0),
    maxRuntimeUnreachable: Number(budget.maxRuntimeUnreachable || 9999),
    targetTrajectory: budget.targetTrajectory || [],
    passed: failures.length === 0,
    failures,
  };

  const outPath = path.resolve(ROOT, "reports/cert/reachability-budget.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log(
    `[reachability-budget] coverage=${(runtimeCoverage * 100).toFixed(2)}% runtime-unreachable=${runtimeUnreachable.length} core-unreachable=${coreUnreachable.length}`,
  );
  console.log(`[reachability-budget] wrote ${path.relative(ROOT, outPath)}`);
  if (summary.targetTrajectory.length > 0) {
    console.log(
      `[reachability-budget] trajectory=${summary.targetTrajectory.join(" -> ")}`,
    );
  }

  if (!summary.passed) {
    for (const failure of failures)
      console.error(`[reachability-budget] ${failure}`);
    process.exit(1);
  }
}

main();
