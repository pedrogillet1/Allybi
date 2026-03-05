#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  summarizeIngestionSloEvents,
  evaluateIngestionSloMetrics,
} = require("../../src/services/admin/ingestionSloContract.shared.js");

function arg(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] || fallback;
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function shouldRequireByProfile(profile) {
  return (
    profile === "ci" || profile === "release" || profile === "retrieval_signoff"
  );
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
  const fallbackReportRel = arg(
    "--fallback-report",
    process.env.INGESTION_SLO_FALLBACK_REPORT ||
      "src/data_banks/manifest/ingestion_slo_baseline_summary.any.json",
  );
  const outRel = arg("--out", "reports/cert/ingestion-slo-gate.json");
  const reportPath = path.resolve(rootDir, reportRel);
  const fallbackReportPath = path.resolve(rootDir, fallbackReportRel);
  const outPath = path.resolve(rootDir, outRel);

  const thresholds = {
    minDocsProcessed: toNumber(
      arg("--min-docs", process.env.INGESTION_SLO_MIN_DOCS || "100"),
      100,
    ),
    maxGlobalP95LatencyMs: toNumber(
      arg("--max-global-p95-ms", process.env.INGESTION_SLO_MAX_GLOBAL_P95_MS || "120000"),
      120000,
    ),
    maxGlobalFailureRatePct: toNumber(
      arg(
        "--max-global-failure-rate",
        process.env.INGESTION_SLO_MAX_GLOBAL_FAILURE_RATE || "5",
      ),
      5,
    ),
    maxGlobalP95PeakRssMb: toNumber(
      arg(
        "--max-global-p95-peak-rss-mb",
        process.env.INGESTION_SLO_MAX_GLOBAL_P95_PEAK_RSS_MB || "1536",
      ),
      1536,
    ),
  };

  const warnings = [];
  const failures = [];
  let collectionError = null;
  let summary = null;
  let collectedWindow = null;
  let fallbackUsed = false;
  let collectionFailed = false;

  try {
    const collected = await collectEvents(windowHours);
    collectedWindow = { from: collected.from, to: collected.to };
    summary = summarizeIngestionSloEvents(collected.events);
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
    collectionFailed = true;
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
      if (fs.existsSync(fallbackReportPath)) {
        try {
          summary = JSON.parse(fs.readFileSync(fallbackReportPath, "utf8"));
          fallbackUsed = true;
          warnings.push("COLLECTION_FAILED_USING_FALLBACK_REPORT");
        } catch {
          warnings.push("COLLECTION_FAILED_INVALID_FALLBACK_REPORT");
        }
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
    const evaluation = evaluateIngestionSloMetrics(summary, thresholds);
    if (
      Number(summary.docsProcessed || 0) < thresholds.minDocsProcessed &&
      !required
    ) {
      warnings.push("INSUFFICIENT_SAMPLE_NON_BLOCKING");
    } else {
      failures.push(...evaluation.failures);
    }
  }

  if (required && collectionFailed) {
    failures.push("INGESTION_SLO_COLLECTION_FAILED");
    if (fallbackUsed) {
      failures.push("FALLBACK_REPORT_NOT_ALLOWED_IN_REQUIRED_MODE");
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
    fallbackReportPath: path
      .relative(rootDir, fallbackReportPath)
      .replace(/\\/g, "/"),
    outPath: path.relative(rootDir, outPath).replace(/\\/g, "/"),
    collectionError,
    fallbackUsed,
    thresholds,
    metrics: {
      docsProcessed: Number(summary?.docsProcessed || 0),
      p95LatencyMs: Number(summary?.p95LatencyMs || 0),
      p95PeakRssMb: Number(summary?.p95PeakRssMb || 0),
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
