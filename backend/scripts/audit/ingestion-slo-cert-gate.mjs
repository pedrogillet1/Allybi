#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const {
  summarizeIngestionSloEvents,
  evaluateIngestionSloMetrics,
} = require("../../src/services/admin/ingestionSloContract.shared.js");
const {
  evaluateEvidenceCompliance,
  collectEventsPaginated,
} = require("../../src/services/admin/ingestionSloCertGatePolicy.shared.js");

function arg(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] || fallback;
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : fallback;
}

function toBool(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function isCiRuntime() {
  return (
    toBool(process.env.CI) ||
    toBool(process.env.GITHUB_ACTIONS) ||
    toBool(process.env.BUILD_BUILDID)
  );
}

export function shouldRequireByProfile(profile) {
  return (
    profile === "ci" || profile === "release" || profile === "retrieval_signoff"
  );
}

async function collectEvents(windowHours, options = {}) {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const pageSize = toPositiveInt(
    options.pageSize ?? process.env.INGESTION_SLO_QUERY_PAGE_SIZE,
    5000,
  );
  const maxEvents = toPositiveInt(
    options.maxEvents ?? process.env.INGESTION_SLO_MAX_EVENTS,
    0,
  );
  try {
    const to = new Date();
    const from = new Date(to.getTime() - windowHours * 60 * 60 * 1000);
    const collected = await collectEventsPaginated({
      prisma,
      from,
      to,
      pageSize,
      maxEvents,
    });
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      events: collected.events,
      collectionMeta: {
        pageSize,
        pagesFetched: collected.pagesFetched,
        capped: collected.capped,
        maxEvents: maxEvents > 0 ? maxEvents : null,
      },
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
  const required = forceRequired || strict || shouldRequireByProfile(profile);
  const defaultStrictLocalHermeticFallback =
    strict &&
    !isCiRuntime() &&
    (profile === "local" || profile === "local_hard");
  const allowStrictHermeticFallback =
    toBool(process.env.INGESTION_SLO_STRICT_ALLOW_HERMETIC_FALLBACK) ||
    process.argv.includes("--allow-strict-hermetic-fallback") ||
    defaultStrictLocalHermeticFallback;
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
  const hermeticReportRel = arg(
    "--hermetic-report",
    process.env.INGESTION_SLO_HERMETIC_REPORT || fallbackReportRel,
  );
  const outRel = arg("--out", "reports/cert/ingestion-slo-gate.json");
  const reportPath = path.resolve(rootDir, reportRel);
  const fallbackReportPath = path.resolve(rootDir, fallbackReportRel);
  const hermeticReportPath = path.resolve(rootDir, hermeticReportRel);
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
  let evidenceMode = "live_collection";
  let collectionMeta = {
    pageSize: null,
    pagesFetched: 0,
    capped: false,
    maxEvents: null,
  };

  {
    try {
      const collected = await collectEvents(windowHours);
      collectedWindow = { from: collected.from, to: collected.to };
      summary = summarizeIngestionSloEvents(collected.events);
      collectionMeta = {
        pageSize: collected.collectionMeta?.pageSize ?? null,
        pagesFetched: collected.collectionMeta?.pagesFetched ?? 0,
        capped: Boolean(collected.collectionMeta?.capped),
        maxEvents: collected.collectionMeta?.maxEvents ?? null,
      };
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
      if (!required && fs.existsSync(reportPath)) {
        try {
          summary = JSON.parse(fs.readFileSync(reportPath, "utf8"));
          warnings.push("COLLECTION_FAILED_USING_EXISTING_REPORT");
          evidenceMode = "existing_report";
        } catch {
          summary = null;
        }
      }
      if (!summary) {
        if (!required && fs.existsSync(fallbackReportPath)) {
          try {
            summary = JSON.parse(fs.readFileSync(fallbackReportPath, "utf8"));
            fallbackUsed = true;
            warnings.push("COLLECTION_FAILED_USING_FALLBACK_REPORT");
            evidenceMode = "fallback_report";
          } catch {
            warnings.push("COLLECTION_FAILED_INVALID_FALLBACK_REPORT");
          }
        }
      }
      if (!summary && required && allowStrictHermeticFallback) {
        if (fs.existsSync(hermeticReportPath)) {
          try {
            summary = JSON.parse(fs.readFileSync(hermeticReportPath, "utf8"));
            fallbackUsed = true;
            warnings.push("STRICT_HERMETIC_OVERRIDE_ENABLED");
            evidenceMode = "hermetic_override";
          } catch {
            failures.push("STRICT_HERMETIC_OVERRIDE_REPORT_INVALID");
          }
        } else {
          failures.push("STRICT_HERMETIC_OVERRIDE_REPORT_MISSING");
        }
      }
      if (!summary) {
        warnings.push("COLLECTION_FAILED_NO_REPORT");
      }
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

  const strictHermeticOverrideActive =
    required && allowStrictHermeticFallback && evidenceMode === "hermetic_override";

  if (required && collectionFailed && !strictHermeticOverrideActive) {
    failures.push("INGESTION_SLO_COLLECTION_FAILED");
    if (fallbackUsed && evidenceMode !== "hermetic_override") {
      failures.push("FALLBACK_REPORT_NOT_ALLOWED_IN_REQUIRED_MODE");
    }
  } else if (strictHermeticOverrideActive) {
    warnings.push("STRICT_HERMETIC_OVERRIDE_APPLIED");
  }

  const evidenceCompliance = evaluateEvidenceCompliance({
    required: strictHermeticOverrideActive ? false : required,
    evidenceMode,
    collectionCapped: collectionMeta.capped,
  });
  failures.push(...evidenceCompliance.failures);
  warnings.push(...evidenceCompliance.warnings);

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
    hermeticReportPath: path
      .relative(rootDir, hermeticReportPath)
      .replace(/\\/g, "/"),
    outPath: path.relative(rootDir, outPath).replace(/\\/g, "/"),
    evidenceMode,
    collectionError,
    fallbackUsed,
    allowStrictHermeticFallback,
    collectionMeta,
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

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main();
}
