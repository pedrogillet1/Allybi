#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { evaluateIngestionSloMetrics } = require("../../src/services/admin/ingestionSloContract.shared.js");

function arg(name, fallback = "") {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return fallback;
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const inputRel = arg("--report", "reports/cert/ingestion-slo-summary.json");
const strict = process.argv.includes("--strict");
const reportPath = path.resolve(repoRoot, inputRel);

if (!fs.existsSync(reportPath)) {
  console.error(`[ingestion-slo] Missing report: ${reportPath}`);
  process.exit(2);
}

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const docsProcessed = num(report?.docsProcessed, 0);
const p95LatencyMs = num(report?.p95LatencyMs, 0);
const byMimeSize = Array.isArray(report?.byMimeSize) ? report.byMimeSize : [];

const minDocs = num(arg("--min-docs", process.env.INGESTION_SLO_MIN_DOCS || "100"), 100);
const maxP95 = num(
  arg("--max-global-p95-ms", process.env.INGESTION_SLO_MAX_GLOBAL_P95_MS || "120000"),
  120000,
);
const maxFailureRate = num(
  arg("--max-global-failure-rate", process.env.INGESTION_SLO_MAX_GLOBAL_FAILURE_RATE || "5"),
  5,
);

let weightedFailure = 0;
for (const row of byMimeSize) {
  const count = num(row?.count, 0);
  const failureRate = num(row?.failureRate, 0);
  weightedFailure += count * (failureRate / 100);
}
const globalFailureRate = docsProcessed > 0 ? (weightedFailure / docsProcessed) * 100 : 0;
const p95PeakRssMb = num(report?.p95PeakRssMb, 0);
const maxPeakRssMb = num(
  arg(
    "--max-global-p95-peak-rss-mb",
    process.env.INGESTION_SLO_MAX_GLOBAL_P95_PEAK_RSS_MB || "1536",
  ),
  1536,
);
const evaluation = evaluateIngestionSloMetrics(
  {
    docsProcessed,
    p95LatencyMs,
    p95PeakRssMb,
    byMimeSize,
  },
  {
    minDocsProcessed: minDocs,
    maxGlobalP95LatencyMs: maxP95,
    maxGlobalFailureRatePct: maxFailureRate,
    maxGlobalP95PeakRssMb: maxPeakRssMb,
  },
);
const failures = evaluation.failures;

const summary = {
  passed: failures.length === 0,
  docsProcessed,
  p95LatencyMs,
  p95PeakRssMb,
  globalFailureRate: Number(globalFailureRate.toFixed(2)),
  thresholds: {
    minDocs,
    maxP95,
    maxFailureRate,
    maxPeakRssMb,
  },
  failures,
  reportPath: path.relative(repoRoot, reportPath),
};

console.log(`[ingestion-slo] docs=${docsProcessed} p95=${p95LatencyMs}ms failRate=${summary.globalFailureRate}%`);
if (summary.passed) {
  console.log("[ingestion-slo] gate passed");
} else {
  for (const failure of failures) console.error(`[ingestion-slo] ${failure}`);
}

const outRel = arg("--out", "reports/cert/ingestion-slo-gate.json");
const outPath = path.resolve(repoRoot, outRel);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(`[ingestion-slo] wrote ${path.relative(repoRoot, outPath)}`);

if (strict && !summary.passed) {
  process.exit(1);
}
