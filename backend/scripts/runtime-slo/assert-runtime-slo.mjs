#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";

function arg(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] || fallback;
}

function toNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function mkdirFor(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function regressionExceeded(current, baseline, maxRegressionPct) {
  if (!Number.isFinite(current) || !Number.isFinite(baseline)) return false;
  if (baseline <= 0) return false;
  return current > baseline * (1 + maxRegressionPct);
}

function main() {
  const reportPath = path.resolve(
    process.cwd(),
    arg("--report", "reports/runtime-slo/runtime-slo-report.json"),
  );
  const baselinePath = path.resolve(
    process.cwd(),
    arg("--baseline", "notes/RUNTIME_SLO_BASELINE.json"),
  );
  const outPath = path.resolve(
    process.cwd(),
    arg("--out", "reports/runtime-slo/runtime-slo-gate.json"),
  );

  if (!fs.existsSync(reportPath)) {
    console.error(`[runtime-slo] Missing report: ${reportPath}`);
    process.exit(1);
  }

  const report = readJson(reportPath);
  const baseline = fs.existsSync(baselinePath) ? readJson(baselinePath) : {};
  const baselineThresholds = baseline.thresholds || {};
  const baselineMetrics = baseline.baseline || {};

  const thresholds = {
    minTotalQueries: toNumber(
      process.env.RUNTIME_SLO_MIN_QUERIES,
      toNumber(baselineThresholds.minTotalQueries, 30),
    ),
    maxP95Ms: toNumber(
      process.env.RUNTIME_SLO_MAX_P95_MS,
      toNumber(baselineThresholds.maxP95Ms, 12000),
    ),
    maxP99Ms: toNumber(
      process.env.RUNTIME_SLO_MAX_P99_MS,
      toNumber(baselineThresholds.maxP99Ms, 20000),
    ),
    maxErrorRate: toNumber(
      process.env.RUNTIME_SLO_MAX_ERROR_RATE,
      toNumber(baselineThresholds.maxErrorRate, 0.02),
    ),
    maxTimeoutRate: toNumber(
      process.env.RUNTIME_SLO_MAX_TIMEOUT_RATE,
      toNumber(baselineThresholds.maxTimeoutRate, 0.01),
    ),
    minComposeCacheHitRate: toNumber(
      process.env.RUNTIME_SLO_MIN_COMPOSE_CACHE_HIT_RATE,
      toNumber(baselineThresholds.minComposeCacheHitRate, 0.1),
    ),
    maxP95RegressionPct: toNumber(
      process.env.RUNTIME_SLO_MAX_P95_REGRESSION_PCT,
      toNumber(baselineThresholds.maxP95RegressionPct, 0.1),
    ),
    maxP99RegressionPct: toNumber(
      process.env.RUNTIME_SLO_MAX_P99_REGRESSION_PCT,
      toNumber(baselineThresholds.maxP99RegressionPct, 0.1),
    ),
  };

  const metrics = report.metrics || {};
  const failures = [];

  if (toNumber(metrics.totalQueries, 0) < thresholds.minTotalQueries) {
    failures.push("TOTAL_QUERIES_BELOW_MIN");
  }
  if (toNumber(metrics.p95Ms, Infinity) > thresholds.maxP95Ms) {
    failures.push("P95_ABOVE_BUDGET");
  }
  if (toNumber(metrics.p99Ms, Infinity) > thresholds.maxP99Ms) {
    failures.push("P99_ABOVE_BUDGET");
  }
  if (toNumber(metrics.errorRate, 1) > thresholds.maxErrorRate) {
    failures.push("ERROR_RATE_ABOVE_BUDGET");
  }
  if (toNumber(metrics.timeoutRate, 1) > thresholds.maxTimeoutRate) {
    failures.push("TIMEOUT_RATE_ABOVE_BUDGET");
  }

  const composeCacheSampleCount = toNumber(metrics.composeCacheSampleCount, 0);
  if (
    composeCacheSampleCount > 0 &&
    toNumber(metrics.composeCacheHitRate, 0) < thresholds.minComposeCacheHitRate
  ) {
    failures.push("COMPOSE_CACHE_HIT_RATE_BELOW_MIN");
  }

  if (
    regressionExceeded(
      toNumber(metrics.p95Ms, NaN),
      toNumber(baselineMetrics.p95Ms, NaN),
      thresholds.maxP95RegressionPct,
    )
  ) {
    failures.push("P95_REGRESSION_EXCEEDED");
  }

  if (
    regressionExceeded(
      toNumber(metrics.p99Ms, NaN),
      toNumber(baselineMetrics.p99Ms, NaN),
      thresholds.maxP99RegressionPct,
    )
  ) {
    failures.push("P99_REGRESSION_EXCEEDED");
  }

  const gate = {
    generatedAt: new Date().toISOString(),
    reportPath,
    baselinePath: fs.existsSync(baselinePath) ? baselinePath : null,
    passed: failures.length === 0,
    metrics,
    thresholds,
    baseline: baselineMetrics,
    failures,
  };

  mkdirFor(outPath);
  fs.writeFileSync(outPath, `${JSON.stringify(gate, null, 2)}\n`, "utf8");

  if (!gate.passed) {
    for (const failure of failures) {
      console.error(`[runtime-slo] ${failure}`);
    }
    process.exit(1);
  }
  console.log(`[runtime-slo] gate passed: ${outPath}`);
}

main();
