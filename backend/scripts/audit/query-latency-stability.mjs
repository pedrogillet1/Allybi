#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";

function arg(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] || fallback;
}

function normalizePath(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  return path.resolve(raw);
}

function toNumber(value, fallback) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const clamped = Math.max(0, Math.min(100, Number(p) || 0));
  const rank = (clamped / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  const w = rank - lower;
  return sorted[lower] * (1 - w) + sorted[upper] * w;
}

function isRuntimeFailureCode(value) {
  const code = String(value || "")
    .trim()
    .toLowerCase();
  if (!code) return false;
  const markers = [
    "timeout",
    "network",
    "connection",
    "transport",
    "provider",
    "gateway",
    "rate_limit",
    "internal",
    "server_error",
    "unavailable",
  ];
  return markers.some((marker) => code.includes(marker));
}

function resolvePerQueryReportPath(rootDir, explicitPath) {
  if (explicitPath) {
    const normalized = normalizePath(explicitPath);
    if (normalized && fs.existsSync(normalized)) return normalized;
    return null;
  }

  const reportsRoots = [
    path.resolve(rootDir, "../frontend/e2e/reports"),
    path.resolve(rootDir, "frontend/e2e/reports"),
  ];

  for (const reportsRoot of reportsRoots) {
    const latestPath = path.join(reportsRoot, "latest", "per_query.json");
    if (fs.existsSync(latestPath)) return latestPath;

    const lineagePath = path.join(reportsRoot, "latest", "lineage.json");
    if (fs.existsSync(lineagePath)) {
      try {
        const lineage = JSON.parse(fs.readFileSync(lineagePath, "utf8"));
        const archivePath = normalizePath(lineage?.archivePerQueryPath);
        if (archivePath && fs.existsSync(archivePath)) return archivePath;
      } catch {
        // keep searching
      }
    }

    const archiveRoot = path.join(reportsRoot, "archive");
    if (!fs.existsSync(archiveRoot)) continue;
    const dirs = fs
      .readdirSync(archiveRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => b.localeCompare(a));
    for (const dirName of dirs) {
      const archived = path.join(archiveRoot, dirName, "per_query.json");
      if (fs.existsSync(archived)) return archived;
    }
  }

  return null;
}

function resolveBaseline(rootDir, explicitPath) {
  const baselinePath =
    normalizePath(explicitPath) ||
    path.resolve(rootDir, "notes", "RUNTIME_SLO_BASELINE.json");
  if (!fs.existsSync(baselinePath)) return null;
  try {
    return {
      baselinePath,
      baseline: JSON.parse(fs.readFileSync(baselinePath, "utf8")),
    };
  } catch {
    return null;
  }
}

function main() {
  const strict = process.argv.includes("--strict");
  const profile = String(process.env.CERT_PROFILE || "local")
    .trim()
    .toLowerCase();
  const forceRequired = process.argv.includes("--require-input");
  const requiredByProfile =
    profile === "ci" || profile === "release" || profile === "retrieval_signoff";
  const requireInput = forceRequired || (strict && requiredByProfile);

  const rootDir = path.resolve(process.cwd());
  const reportPath = resolvePerQueryReportPath(rootDir, arg("--report"));
  const baselineResolved = resolveBaseline(rootDir, arg("--baseline"));

  const failures = [];
  const warnings = [];
  if (!reportPath) {
    if (requireInput) {
      failures.push("MISSING_PER_QUERY_REPORT");
    } else {
      warnings.push("MISSING_PER_QUERY_REPORT");
    }
  }

  let rows = [];
  if (reportPath) {
    try {
      const parsed = JSON.parse(fs.readFileSync(reportPath, "utf8"));
      rows = Array.isArray(parsed) ? parsed : [];
    } catch {
      failures.push("INVALID_PER_QUERY_REPORT_JSON");
    }
  }

  const total = rows.length;
  const latencies = rows
    .map((row) => Number(row?.latencyMs))
    .filter((value) => Number.isFinite(value) && value > 0);
  const p95Ms = percentile(latencies, 95);
  const p99Ms = percentile(latencies, 99);
  const runtimeErrorCount = rows.filter((row) => {
    const status = String(row?.status || "").trim().toUpperCase();
    const hasErrorField = String(row?.error || "").trim().length > 0;
    return status === "ERROR" || hasErrorField || isRuntimeFailureCode(row?.failureCode);
  }).length;
  const timeoutCount = rows.filter((row) =>
    String(row?.failureCode || "")
      .trim()
      .toLowerCase()
      .includes("timeout")
  ).length;
  const qualityFailCount = rows.filter((row) => {
    const status = String(row?.status || "").trim().toUpperCase();
    return status === "FAIL" || status === "PARTIAL";
  }).length;

  const errorRate = total > 0 ? runtimeErrorCount / total : 0;
  const timeoutRate = total > 0 ? timeoutCount / total : 0;
  const qualityFailRate = total > 0 ? qualityFailCount / total : 0;

  if (!baselineResolved && strict) {
    warnings.push("MISSING_RUNTIME_SLO_BASELINE");
  }
  const baseline = baselineResolved?.baseline || {};
  const thresholds = baseline?.thresholds || {};
  const baselineMetrics = baseline?.baseline || {};

  const minTotalQueries = toNumber(
    arg("--min-total-queries"),
    toNumber(thresholds.minTotalQueries, 40),
  );
  const maxP95Ms = toNumber(arg("--max-p95-ms"), toNumber(thresholds.maxP95Ms, 12000));
  const maxP99Ms = toNumber(arg("--max-p99-ms"), toNumber(thresholds.maxP99Ms, 20000));
  const maxErrorRate = toNumber(
    arg("--max-error-rate"),
    toNumber(thresholds.maxErrorRate, 0.02),
  );
  const maxTimeoutRate = toNumber(
    arg("--max-timeout-rate"),
    toNumber(thresholds.maxTimeoutRate, 0.01),
  );
  const maxP95RegressionPct = toNumber(
    arg("--max-p95-regression-pct"),
    toNumber(thresholds.maxP95RegressionPct, 0.1),
  );
  const maxP99RegressionPct = toNumber(
    arg("--max-p99-regression-pct"),
    toNumber(thresholds.maxP99RegressionPct, 0.1),
  );

  if (rows.length > 0) {
    if (total < minTotalQueries) failures.push("TOTAL_QUERIES_BELOW_MINIMUM");
    if (p95Ms == null) failures.push("P95_LATENCY_UNAVAILABLE");
    if (p99Ms == null) failures.push("P99_LATENCY_UNAVAILABLE");
    if (p95Ms != null && p95Ms > maxP95Ms) failures.push("P95_LATENCY_EXCEEDED");
    if (p99Ms != null && p99Ms > maxP99Ms) failures.push("P99_LATENCY_EXCEEDED");
    if (errorRate > maxErrorRate) failures.push("ERROR_RATE_EXCEEDED");
    if (timeoutRate > maxTimeoutRate) failures.push("TIMEOUT_RATE_EXCEEDED");

    const baselineP95 = toNumber(baselineMetrics.p95Ms, null);
    const baselineP99 = toNumber(baselineMetrics.p99Ms, null);
    if (baselineP95 && p95Ms != null) {
      const regression = (p95Ms - baselineP95) / baselineP95;
      if (regression > maxP95RegressionPct) failures.push("P95_REGRESSION_EXCEEDED");
    }
    if (baselineP99 && p99Ms != null) {
      const regression = (p99Ms - baselineP99) / baselineP99;
      if (regression > maxP99RegressionPct) failures.push("P99_REGRESSION_EXCEEDED");
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    strict,
    profile,
    requiredByProfile,
    requireInput,
    reportPath,
    baselinePath: baselineResolved?.baselinePath || null,
    thresholds: {
      minTotalQueries,
      maxP95Ms,
      maxP99Ms,
      maxErrorRate,
      maxTimeoutRate,
      maxP95RegressionPct,
      maxP99RegressionPct,
    },
    metrics: {
      totalQueries: total,
      latencyCount: latencies.length,
      p95Ms,
      p99Ms,
      runtimeErrorCount,
      timeoutCount,
      qualityFailCount,
      errorRate,
      timeoutRate,
      qualityFailRate,
      baselineP95Ms: toNumber(baselineMetrics.p95Ms, null),
      baselineP99Ms: toNumber(baselineMetrics.p99Ms, null),
    },
    failures,
    warnings,
    skipped: !reportPath,
    passed: failures.length === 0,
  };

  console.log(JSON.stringify(summary, null, 2));
  if (!summary.passed) process.exit(1);
}

main();
