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
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function p95(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil(0.95 * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function shouldRequireByProfile(profile) {
  return (
    profile === "ci" || profile === "release" || profile === "retrieval_signoff"
  );
}

function summaryFromEvents(events) {
  const durations = [];
  const bucketMap = new Map();

  for (const event of events) {
    const status = String(event?.status || "").trim().toLowerCase();
    const mimeType = String(event?.mimeType || "unknown").trim().toLowerCase();
    const meta = asRecord(event?.meta);
    const sizeBucket = String(meta?.sizeBucket || "unknown").trim().toLowerCase() || "unknown";
    const key = `${mimeType}||${sizeBucket}`;
    if (!bucketMap.has(key)) {
      bucketMap.set(key, { count: 0, failures: 0, latencies: [] });
    }
    const bucket = bucketMap.get(key);
    bucket.count += 1;
    if (status === "fail") bucket.failures += 1;
    if (typeof event?.durationMs === "number" && event.durationMs > 0) {
      bucket.latencies.push(event.durationMs);
      durations.push(event.durationMs);
    }
  }

  const byMimeSize = Array.from(bucketMap.entries())
    .map(([key, bucket]) => {
      const [mimeType, sizeBucket] = key.split("||");
      return {
        mimeType,
        sizeBucket,
        count: bucket.count,
        p95LatencyMs: p95(bucket.latencies),
        failureRate:
          bucket.count > 0 ? round2((bucket.failures / bucket.count) * 100) : 0,
      };
    })
    .sort((a, b) => b.count - a.count);

  return {
    docsProcessed: events.length,
    p95LatencyMs: p95(durations),
    byMimeSize,
  };
}

function evaluateSummary(summary, thresholds) {
  const failures = [];
  const docsProcessed = Number(summary?.docsProcessed || 0);
  const p95LatencyMs = Number(summary?.p95LatencyMs || 0);
  const byMimeSize = Array.isArray(summary?.byMimeSize) ? summary.byMimeSize : [];
  const minDocs = Math.max(0, Number(thresholds.minDocs || 0));
  const maxP95 = Math.max(1, Number(thresholds.maxP95 || 1));
  const maxFailureRate = Math.max(0, Number(thresholds.maxFailureRate || 0));

  let weightedFailure = 0;
  for (const row of byMimeSize) {
    const count = Number(row?.count || 0);
    const failureRate = Number(row?.failureRate || 0);
    weightedFailure += count * (failureRate / 100);
  }
  const globalFailureRate =
    docsProcessed > 0 ? round2((weightedFailure / docsProcessed) * 100) : 0;

  if (docsProcessed < minDocs) {
    failures.push(`INSUFFICIENT_SAMPLE: ${docsProcessed} < ${minDocs}`);
  }
  if (p95LatencyMs > maxP95) {
    failures.push(`GLOBAL_P95_EXCEEDED: ${p95LatencyMs} > ${maxP95}`);
  }
  if (globalFailureRate > maxFailureRate) {
    failures.push(
      `GLOBAL_FAILURE_RATE_EXCEEDED: ${globalFailureRate}% > ${maxFailureRate}%`,
    );
  }

  return {
    failures,
    globalFailureRate,
  };
}

async function collectEvents(windowHours) {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const to = new Date();
    const from = new Date(to.getTime() - windowHours * 60 * 60 * 1000);
    const events = await prisma.ingestionEvent.findMany({
      where: { at: { gte: from, lt: to } },
      select: {
        status: true,
        mimeType: true,
        durationMs: true,
        meta: true,
      },
      take: 100000,
    });
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      events,
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const strict = process.argv.includes("--strict");
  const rootDir = path.resolve(process.cwd());
  const profile = String(process.env.CERT_PROFILE || "local")
    .trim()
    .toLowerCase();
  const forceRequired =
    String(process.env.CERT_REQUIRE_INGESTION_SLO || "").trim().toLowerCase() ===
      "true" || process.env.CERT_REQUIRE_INGESTION_SLO === "1";
  const required = forceRequired || (strict && shouldRequireByProfile(profile));
  const windowHours = toNumber(
    arg("--window-hours", process.env.INGESTION_SLO_WINDOW_HOURS || "24"),
    24,
  );
  const reportRel = arg("--report", "reports/cert/ingestion-slo-summary.json");
  const outRel = arg("--out", "reports/cert/ingestion-slo-gate.json");
  const reportPath = path.resolve(rootDir, reportRel);
  const outPath = path.resolve(rootDir, outRel);

  const thresholds = {
    minDocs: toNumber(
      arg("--min-docs", process.env.INGESTION_SLO_MIN_DOCS || "100"),
      100,
    ),
    maxP95: toNumber(
      arg("--max-global-p95-ms", process.env.INGESTION_SLO_MAX_GLOBAL_P95_MS || "120000"),
      120000,
    ),
    maxFailureRate: toNumber(
      arg(
        "--max-global-failure-rate",
        process.env.INGESTION_SLO_MAX_GLOBAL_FAILURE_RATE || "5",
      ),
      5,
    ),
  };

  const warnings = [];
  const failures = [];
  let collectionError = null;
  let summary = null;
  let collectedWindow = null;

  try {
    const collected = await collectEvents(windowHours);
    collectedWindow = { from: collected.from, to: collected.to };
    summary = summaryFromEvents(collected.events);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(
      reportPath,
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          windowHours,
          ...collectedWindow,
          ...summary,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  } catch (error) {
    collectionError = error instanceof Error ? error.message : String(error);
    if (fs.existsSync(reportPath)) {
      try {
        summary = JSON.parse(fs.readFileSync(reportPath, "utf8"));
        warnings.push("COLLECTION_FAILED_USING_EXISTING_REPORT");
      } catch {
        summary = null;
      }
    }
    if (!summary) {
      warnings.push("COLLECTION_FAILED_NO_REPORT");
    }
  }

  if (!summary) {
    if (required) {
      failures.push("MISSING_INGESTION_SLO_REPORT");
    }
  } else {
    const evaluation = evaluateSummary(summary, thresholds);
    if (
      Number(summary.docsProcessed || 0) < thresholds.minDocs &&
      !required
    ) {
      warnings.push("INSUFFICIENT_SAMPLE_NON_BLOCKING");
    } else {
      failures.push(...evaluation.failures);
    }
  }

  const gateSummary = {
    generatedAt: new Date().toISOString(),
    strict,
    profile,
    required,
    windowHours,
    collectedWindow,
    reportPath: path.relative(rootDir, reportPath).replace(/\\/g, "/"),
    outPath: path.relative(rootDir, outPath).replace(/\\/g, "/"),
    collectionError,
    thresholds,
    metrics: {
      docsProcessed: Number(summary?.docsProcessed || 0),
      p95LatencyMs: Number(summary?.p95LatencyMs || 0),
      byMimeSizeCount: Array.isArray(summary?.byMimeSize)
        ? summary.byMimeSize.length
        : 0,
    },
    failures,
    warnings,
    passed: failures.length === 0,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(gateSummary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(gateSummary, null, 2));

  if (!gateSummary.passed) {
    process.exit(1);
  }
}

main();
