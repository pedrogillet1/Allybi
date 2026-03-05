#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const FRONTEND_ROOT = path.resolve(ROOT, "../frontend");
const FRONTEND_REPORTS_ROOT = path.join(FRONTEND_ROOT, "e2e", "reports");
const FRONTEND_REPORTS_LATEST = path.join(FRONTEND_REPORTS_ROOT, "latest");
const FRONTEND_REPORTS_ARCHIVE = path.join(FRONTEND_REPORTS_ROOT, "archive");
const FRONTEND_RESULTS_JSON = path.join(FRONTEND_REPORTS_ROOT, "results.json");
const EVIDENCE_CONTRACT_PATH = path.join(
  ROOT,
  "scripts/certification/retrieval-evidence-contract.json",
);

function readEvidenceContract() {
  if (!fs.existsSync(EVIDENCE_CONTRACT_PATH)) {
    throw new Error(
      `[prepare-retrieval-signoff] missing evidence contract: ${EVIDENCE_CONTRACT_PATH}`,
    );
  }
  const parsed = JSON.parse(fs.readFileSync(EVIDENCE_CONTRACT_PATH, "utf8"));
  const requiredLatestFiles = Array.isArray(parsed?.requiredLatestFiles)
    ? parsed.requiredLatestFiles
      .map((value) => String(value || "").trim())
      .filter(Boolean)
    : [];
  const forbiddenFallbackDatasetMarkers = Array.isArray(
    parsed?.forbiddenFallbackDatasetMarkers,
  )
    ? parsed.forbiddenFallbackDatasetMarkers
      .map((value) => String(value || "").trim())
      .filter(Boolean)
    : [];
  if (requiredLatestFiles.length === 0) {
    throw new Error(
      `[prepare-retrieval-signoff] invalid evidence contract (requiredLatestFiles empty): ${EVIDENCE_CONTRACT_PATH}`,
    );
  }
  return {
    requiredLatestFiles,
    forbiddenFallbackDatasetMarkers,
  };
}

const EVIDENCE_CONTRACT = readEvidenceContract();
const REQUIRED_LATEST_FILES = EVIDENCE_CONTRACT.requiredLatestFiles;
const FORBIDDEN_FALLBACK_DATASET_MARKERS =
  EVIDENCE_CONTRACT.forbiddenFallbackDatasetMarkers;

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function clearDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  for (const entry of fs.readdirSync(dirPath)) {
    const fullPath = path.join(dirPath, entry);
    fs.rmSync(fullPath, { recursive: true, force: true });
  }
}

function runFrontendCommand(command) {
  const result = process.platform === "win32"
    ? spawnSync("cmd.exe", ["/d", "/s", "/c", command], {
      cwd: FRONTEND_ROOT,
      stdio: "inherit",
      env: process.env,
    })
    : spawnSync("sh", ["-lc", command], {
      cwd: FRONTEND_ROOT,
      stdio: "inherit",
      env: process.env,
    });
  if (result.error) {
    throw new Error(`[prepare-retrieval-signoff] command failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `[prepare-retrieval-signoff] command exited with status ${result.status}: ${command}`,
    );
  }
  return true;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function listArchiveDirs() {
  if (!fs.existsSync(FRONTEND_REPORTS_ARCHIVE)) return [];
  return fs
    .readdirSync(FRONTEND_REPORTS_ARCHIVE, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a));
}

function resolveLatestMissingFiles() {
  if (!fs.existsSync(FRONTEND_REPORTS_LATEST)) {
    return [...REQUIRED_LATEST_FILES];
  }
  return REQUIRED_LATEST_FILES.filter(
    (fileName) => !fs.existsSync(path.join(FRONTEND_REPORTS_LATEST, fileName)),
  );
}

function resolvePerQueryRows() {
  const perQueryPath = path.join(FRONTEND_REPORTS_LATEST, "per_query.json");
  if (!fs.existsSync(perQueryPath)) return 0;
  try {
    const parsed = readJson(perQueryPath);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function readPlaywrightStats(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = readJson(filePath);
    return {
      expected: Number(parsed?.stats?.expected || 0),
      skipped: Number(parsed?.stats?.skipped || 0),
    };
  } catch {
    return null;
  }
}

function isHealthyPlaywrightStats(stats) {
  if (!stats) return false;
  return stats.expected > 0 && stats.skipped === 0;
}

function findHealthyArchivedResults() {
  for (const dirName of listArchiveDirs()) {
    const candidate = path.join(FRONTEND_REPORTS_ARCHIVE, dirName, "results.json");
    const stats = readPlaywrightStats(candidate);
    if (isHealthyPlaywrightStats(stats)) {
      return candidate;
    }
  }
  return null;
}

function findBestInputDataset() {
  const preferredNames = [
    "query-test-100-results.json",
    "query-test-50-gate-results.json",
    "queries-40-run.json",
    "query-test-25-api-results.json",
  ];
  const candidates = [];
  for (const name of preferredNames) {
    candidates.push(path.join(FRONTEND_REPORTS_ROOT, name));
    candidates.push(path.join(FRONTEND_REPORTS_LATEST, name));
  }
  for (const dirName of listArchiveDirs()) {
    for (const name of preferredNames) {
      candidates.push(path.join(FRONTEND_REPORTS_ARCHIVE, dirName, name));
    }
  }
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      const parsed = readJson(candidate);
      const rows = Array.isArray(parsed?.results)
        ? parsed.results.length
        : Array.isArray(parsed)
          ? parsed.length
          : 0;
      if (rows < 100) continue;
      const attachedDocCount = Array.isArray(parsed?.meta?.documentsAttached)
        ? parsed.meta.documentsAttached.length
        : 0;
      // Retrieval signoff must use strict doc-grounded artifact input.
      if (attachedDocCount <= 0) continue;
      if (!Array.isArray(parsed?.results)) continue;
      return candidate;
    } catch {
      // ignore
    }
  }
  return null;
}

function validateLatestScorecardContract() {
  const scorecardPath = path.join(FRONTEND_REPORTS_LATEST, "scorecard.json");
  if (!fs.existsSync(scorecardPath)) {
    return { ok: false, reason: "SCORECARD_MISSING" };
  }
  let scorecard;
  try {
    scorecard = readJson(scorecardPath);
  } catch {
    return { ok: false, reason: "SCORECARD_INVALID_JSON" };
  }
  const pack = String(scorecard?.pack || "").trim();
  if (pack !== "100") {
    return { ok: false, reason: `SCORECARD_PACK_INVALID:${pack || "missing"}` };
  }
  const totalQueries = Number(scorecard?.meta?.totalQueries || 0);
  if (!Number.isFinite(totalQueries) || totalQueries < 100) {
    return { ok: false, reason: "SCORECARD_TOTAL_QUERIES_TOO_LOW" };
  }
  const allowedDocs =
    Number(scorecard?.meta?.allowedDocIdsCount || 0) +
    Number(scorecard?.meta?.allowedDocNamesCount || 0);
  if (!Number.isFinite(allowedDocs) || allowedDocs <= 0) {
    return { ok: false, reason: "SCORECARD_DOC_SCOPE_MISSING" };
  }
  return { ok: true, reason: "ok" };
}

function ensureLatestArtifacts() {
  ensureDir(FRONTEND_REPORTS_LATEST);
  runFrontendCommand("node e2e/grading/bootstrap-report-lineage.mjs --strict");

  const lineageAfterBootstrap = validateLatestLineageProvenance();
  if (
    !lineageAfterBootstrap.ok &&
    String(lineageAfterBootstrap.reason || "").startsWith(
      "FALLBACK_DATASET_PROVENANCE_FORBIDDEN:",
    )
  ) {
    clearDirectory(FRONTEND_REPORTS_LATEST);
    runFrontendCommand("node e2e/grading/bootstrap-report-lineage.mjs --strict");
  }

  const missingAfterBootstrap = resolveLatestMissingFiles();
  const lineageAfterRecovery = validateLatestLineageProvenance();
  const scorecardAfterRecovery = validateLatestScorecardContract();
  if (
    missingAfterBootstrap.length === 0 &&
    resolvePerQueryRows() > 0 &&
    lineageAfterRecovery.ok &&
    scorecardAfterRecovery.ok
  ) {
    return;
  }

  let inputPath = findBestInputDataset();
  if (!inputPath) {
    throw new Error(
      "[prepare-retrieval-signoff] no strict input dataset found (requires 100+ rows and meta.documentsAttached).",
    );
  }

  const runId = `retrieval_signoff_${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const relativeInputPath = path.relative(FRONTEND_ROOT, inputPath).replace(/\\/g, "/");
  const cmd = [
    "node e2e/grading/run-harsh-rubric.mjs",
    "--pack 100",
    `--input ${relativeInputPath}`,
    `--run-id ${runId}`,
  ].join(" ");
  runFrontendCommand(cmd);
}

function ensurePlaywrightResults() {
  const currentStats = readPlaywrightStats(FRONTEND_RESULTS_JSON);
  if (isHealthyPlaywrightStats(currentStats)) return;

  const archived = findHealthyArchivedResults();
  if (archived) {
    fs.copyFileSync(archived, FRONTEND_RESULTS_JSON);
    return;
  }
}

function validateLatestLineageProvenance() {
  const lineagePath = path.join(FRONTEND_REPORTS_LATEST, "lineage.json");
  if (!fs.existsSync(lineagePath)) {
    return { ok: false, reason: "LINEAGE_MISSING" };
  }
  let lineage;
  try {
    lineage = readJson(lineagePath);
  } catch {
    return { ok: false, reason: "LINEAGE_INVALID_JSON" };
  }
  const markers = FORBIDDEN_FALLBACK_DATASET_MARKERS;
  if (!Array.isArray(markers) || markers.length === 0) {
    return { ok: true, reason: "ok" };
  }
  const fields = [
    String(lineage?.datasetId || "").trim().toLowerCase(),
    String(lineage?.inputFile || "").trim().toLowerCase(),
    String(lineage?.source || "").trim().toLowerCase(),
  ];
  const violatedMarker = markers.find((marker) => {
    const normalized = String(marker || "").trim().toLowerCase();
    return normalized && fields.some((field) => field.includes(normalized));
  });
  if (violatedMarker) {
    return {
      ok: false,
      reason: `FALLBACK_DATASET_PROVENANCE_FORBIDDEN:${violatedMarker}`,
    };
  }
  return { ok: true, reason: "ok" };
}

function main() {
  ensureLatestArtifacts();
  ensurePlaywrightResults();

  const missingLatestFiles = resolveLatestMissingFiles();
  const perQueryRows = resolvePerQueryRows();
  const playwrightStats = readPlaywrightStats(FRONTEND_RESULTS_JSON);
  const failures = [];
  if (missingLatestFiles.length > 0) {
    failures.push(`LATEST_FILES_MISSING:${missingLatestFiles.join(",")}`);
  }
  if (perQueryRows <= 0) {
    failures.push("PER_QUERY_EMPTY_OR_MISSING");
  }
  if (!playwrightStats) {
    failures.push("PLAYWRIGHT_RESULTS_MISSING");
  } else {
    if (playwrightStats.expected <= 0) failures.push("PLAYWRIGHT_EXPECTED_ZERO");
    if (playwrightStats.skipped > 0) failures.push("PLAYWRIGHT_SKIPPED_TESTS_PRESENT");
  }
  const lineageProvenance = validateLatestLineageProvenance();
  if (!lineageProvenance.ok) failures.push(lineageProvenance.reason);
  const latestScorecard = validateLatestScorecardContract();
  if (!latestScorecard.ok) failures.push(latestScorecard.reason);

  if (failures.length > 0) {
    console.error("[prepare-retrieval-signoff] evidence preparation failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log("[prepare-retrieval-signoff] evidence artifacts ready");
  console.log(`- latest: ${FRONTEND_REPORTS_LATEST}`);
  console.log(`- per_query rows: ${perQueryRows}`);
  console.log(`- playwright expected: ${playwrightStats?.expected || 0}`);
  console.log(`- playwright skipped: ${playwrightStats?.skipped || 0}`);
}

main();
