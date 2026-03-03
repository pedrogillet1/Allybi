#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";

function arg(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] || fallback;
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (Math.max(0, Math.min(100, p)) / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  const weight = rank - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function mkdirFor(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function resolveInputPath(explicitInput) {
  const candidates = [
    explicitInput,
    "frontend/e2e/reports/latest/runtime_slo_results.json",
    "frontend/e2e/reports/latest/per_query.json",
    "../frontend/e2e/reports/latest/runtime_slo_results.json",
    "../frontend/e2e/reports/latest/per_query.json",
  ]
    .map((candidate) => String(candidate || "").trim())
    .filter(Boolean)
    .map((candidate) =>
      path.isAbsolute(candidate)
        ? candidate
        : path.resolve(process.cwd(), candidate),
    );

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function toRows(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.results)) return parsed.results;
  return [];
}

function normalizeFailureCode(row) {
  return String(row?.failureCode || row?.responseStatus || "")
    .trim()
    .toLowerCase();
}

function isErrorRow(row) {
  const status = String(row?.status || "")
    .trim()
    .toLowerCase();
  if (status === "error" || status === "failed") return true;
  if (String(row?.errorDetail || "").trim()) return true;
  const failureCode = normalizeFailureCode(row);
  return (
    failureCode.includes("error") ||
    failureCode.includes("timeout") ||
    failureCode.includes("network") ||
    failureCode.includes("provider")
  );
}

function isTimeoutRow(row) {
  const failureCode = normalizeFailureCode(row);
  return failureCode.includes("timeout");
}

function extractLatencyMs(row) {
  const candidates = [row?.durationMs, row?.latencyMs, row?.responseTimeMs];
  for (const value of candidates) {
    const num = toNumber(value);
    if (num != null && num >= 0) return num;
  }
  return null;
}

function extractCacheHit(row) {
  const rawTelemetry =
    row?.assistantTelemetry && typeof row.assistantTelemetry === "object"
      ? row.assistantTelemetry
      : null;
  if (!rawTelemetry) return null;
  if (typeof rawTelemetry.cacheHit === "boolean") return rawTelemetry.cacheHit;
  return null;
}

function toMarkdown(report) {
  const m = report.metrics;
  const lines = [];
  lines.push("# Runtime SLO Report");
  lines.push("");
  lines.push(`- Generated at: ${report.generatedAt}`);
  lines.push(`- Input: ${report.inputPath}`);
  lines.push(`- Total queries: ${m.totalQueries}`);
  lines.push(`- Sampled latencies: ${m.latencySampleCount}`);
  lines.push(`- p50 (ms): ${m.p50Ms ?? "n/a"}`);
  lines.push(`- p95 (ms): ${m.p95Ms ?? "n/a"}`);
  lines.push(`- p99 (ms): ${m.p99Ms ?? "n/a"}`);
  lines.push(`- avg (ms): ${m.avgMs ?? "n/a"}`);
  lines.push(`- Error rate: ${m.errorRate}`);
  lines.push(`- Timeout rate: ${m.timeoutRate}`);
  lines.push(`- Compose cache hit rate: ${m.composeCacheHitRate ?? "n/a"}`);
  lines.push(`- Compose cache sampled rows: ${m.composeCacheSampleCount}`);
  lines.push("");
  lines.push("## Notes");
  lines.push("- `errorRate` = runtime/transport failure rows ÷ total rows.");
  lines.push("- `timeoutRate` = rows with timeout-like failure codes ÷ total rows.");
  lines.push(
    "- `composeCacheHitRate` is computed only from rows that expose `assistantTelemetry.cacheHit`.",
  );
  return `${lines.join("\n")}\n`;
}

function main() {
  const explicitInput = arg("--input", null);
  const outJson = path.resolve(
    process.cwd(),
    arg("--out-json", "reports/runtime-slo/runtime-slo-report.json"),
  );
  const outMd = path.resolve(
    process.cwd(),
    arg("--out-md", "reports/runtime-slo/runtime-slo-report.md"),
  );
  const inputPath = resolveInputPath(explicitInput);
  if (!inputPath) {
    console.error("[runtime-slo] No input file found.");
    process.exit(1);
  }

  const parsed = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const rows = toRows(parsed);
  if (!Array.isArray(rows) || rows.length === 0) {
    console.error(`[runtime-slo] Input has no result rows: ${inputPath}`);
    process.exit(1);
  }

  const latencies = rows
    .map((row) => extractLatencyMs(row))
    .filter((value) => value != null);
  const errorCount = rows.filter((row) => isErrorRow(row)).length;
  const timeoutCount = rows.filter((row) => isTimeoutRow(row)).length;

  const cacheSignals = rows
    .map((row) => extractCacheHit(row))
    .filter((value) => typeof value === "boolean");
  const cacheHitCount = cacheSignals.filter(Boolean).length;
  const cacheHitRate =
    cacheSignals.length > 0 ? cacheHitCount / cacheSignals.length : null;

  const avgMs =
    latencies.length > 0
      ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length
      : null;
  const report = {
    generatedAt: new Date().toISOString(),
    inputPath,
    metrics: {
      totalQueries: rows.length,
      latencySampleCount: latencies.length,
      p50Ms: percentile(latencies, 50),
      p95Ms: percentile(latencies, 95),
      p99Ms: percentile(latencies, 99),
      avgMs,
      errorCount,
      timeoutCount,
      errorRate: rows.length > 0 ? errorCount / rows.length : 1,
      timeoutRate: rows.length > 0 ? timeoutCount / rows.length : 1,
      composeCacheSampleCount: cacheSignals.length,
      composeCacheHitCount: cacheHitCount,
      composeCacheHitRate: cacheHitRate,
    },
  };

  mkdirFor(outJson);
  mkdirFor(outMd);
  fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(outMd, toMarkdown(report), "utf8");
  console.log(`[runtime-slo] report written: ${outJson}`);
  console.log(`[runtime-slo] markdown written: ${outMd}`);
}

main();
