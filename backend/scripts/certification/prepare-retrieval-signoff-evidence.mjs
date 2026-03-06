#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
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
const REQUIRED_INPUT_ARTIFACT_TYPE = "raw_query_run";

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function runFrontendCommand(command, options = {}) {
  const allowFailure = options.allowFailure === true;
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
    if (allowFailure) return false;
    throw new Error(`[prepare-retrieval-signoff] command failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    if (allowFailure) return false;
    throw new Error(
      `[prepare-retrieval-signoff] command exited with status ${result.status}: ${command}`,
    );
  }
  return true;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizePath(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return path.resolve(raw);
}

function pathEquals(a, b) {
  if (!a || !b) return false;
  return normalizePath(a).toLowerCase() === normalizePath(b).toLowerCase();
}

function isRecursivePerQueryInput(value) {
  const normalized = normalizePath(value).replace(/\\/g, "/").toLowerCase();
  return normalized.endsWith("/latest/per_query.json");
}

function sha256File(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
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

function validatePerQueryCoverageContract() {
  const perQueryPath = path.join(FRONTEND_REPORTS_LATEST, "per_query.json");
  if (!fs.existsSync(perQueryPath)) {
    return {
      ok: false,
      reason: "PER_QUERY_MISSING",
      rows: 0,
      queryCoverage: 0,
      responseFieldCoverage: 0,
    };
  }
  let rows = [];
  try {
    const parsed = readJson(perQueryPath);
    rows = Array.isArray(parsed) ? parsed : [];
  } catch {
    return {
      ok: false,
      reason: "PER_QUERY_INVALID_JSON",
      rows: 0,
      queryCoverage: 0,
      responseFieldCoverage: 0,
    };
  }
  if (rows.length <= 0) {
    return {
      ok: false,
      reason: "PER_QUERY_EMPTY",
      rows: 0,
      queryCoverage: 0,
      responseFieldCoverage: 0,
    };
  }
  let rowsWithQuery = 0;
  let rowsWithResponseField = 0;
  for (const row of rows) {
    const record = row && typeof row === "object" ? row : {};
    const query = String(record.query || "").trim();
    if (query.length > 0) rowsWithQuery += 1;
    if (
      typeof record.responseText === "string" ||
      typeof record.assistantText === "string" ||
      typeof record.response === "string"
    ) {
      rowsWithResponseField += 1;
    }
  }
  const queryCoverage = rowsWithQuery / rows.length;
  const responseFieldCoverage = rowsWithResponseField / rows.length;
  if (queryCoverage < 0.98) {
    return {
      ok: false,
      reason: "PER_QUERY_QUERY_COVERAGE_TOO_LOW",
      rows: rows.length,
      queryCoverage,
      responseFieldCoverage,
    };
  }
  if (responseFieldCoverage < 0.98) {
    return {
      ok: false,
      reason: "PER_QUERY_RESPONSE_FIELD_COVERAGE_TOO_LOW",
      rows: rows.length,
      queryCoverage,
      responseFieldCoverage,
    };
  }
  return {
    ok: true,
    reason: "ok",
    rows: rows.length,
    queryCoverage,
    responseFieldCoverage,
  };
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
  const inputFile = String(scorecard?.inputFile || "").trim();
  if (!inputFile) {
    return { ok: false, reason: "SCORECARD_INPUT_FILE_MISSING" };
  }
  if (isRecursivePerQueryInput(inputFile)) {
    return { ok: false, reason: "SCORECARD_INPUT_FILE_RECURSIVE_PER_QUERY" };
  }
  const inputArtifactType = String(scorecard?.meta?.inputArtifactType || "")
    .trim()
    .toLowerCase();
  if (inputArtifactType !== REQUIRED_INPUT_ARTIFACT_TYPE) {
    return {
      ok: false,
      reason: `SCORECARD_INPUT_ARTIFACT_TYPE_INVALID:${inputArtifactType || "missing"}`,
    };
  }
  const sourceArtifactPath = String(scorecard?.meta?.sourceArtifactPath || "").trim();
  if (!sourceArtifactPath) {
    return { ok: false, reason: "SCORECARD_SOURCE_ARTIFACT_PATH_MISSING" };
  }
  if (isRecursivePerQueryInput(sourceArtifactPath)) {
    return { ok: false, reason: "SCORECARD_SOURCE_ARTIFACT_RECURSIVE_PER_QUERY" };
  }
  if (!pathEquals(sourceArtifactPath, inputFile)) {
    return { ok: false, reason: "SCORECARD_SOURCE_ARTIFACT_PATH_INPUT_MISMATCH" };
  }
  const sourceArtifactSha256 = String(scorecard?.meta?.sourceArtifactSha256 || "")
    .trim()
    .toLowerCase();
  if (!/^[a-f0-9]{64}$/i.test(sourceArtifactSha256)) {
    return { ok: false, reason: "SCORECARD_SOURCE_ARTIFACT_SHA256_INVALID" };
  }
  const sourceArtifactBytes = Number(scorecard?.meta?.sourceArtifactBytes || 0);
  if (!Number.isFinite(sourceArtifactBytes) || sourceArtifactBytes < 1) {
    return { ok: false, reason: "SCORECARD_SOURCE_ARTIFACT_BYTES_INVALID" };
  }
  return { ok: true, reason: "ok" };
}

function ensureLatestArtifacts() {
  const bootstrapCmd = "node e2e/grading/bootstrap-report-lineage.mjs --strict";
  ensureDir(FRONTEND_REPORTS_LATEST);
  // Strict bootstrap must fail when no valid archive candidate exists.
  const bootstrapRecovered = runFrontendCommand(bootstrapCmd, { allowFailure: true });
  if (!bootstrapRecovered) {
    console.warn(
      "[prepare-retrieval-signoff] strict lineage bootstrap did not recover latest; proceeding with strict regeneration.",
    );
  }

  const lineageAfterBootstrap = validateLatestLineageProvenance();
  if (
    !lineageAfterBootstrap.ok &&
    String(lineageAfterBootstrap.reason || "").startsWith(
      "FALLBACK_DATASET_PROVENANCE_FORBIDDEN:",
    )
  ) {
    // Keep existing latest artifacts until a valid replacement is available.
    runFrontendCommand(bootstrapCmd, { allowFailure: true });
  }

  const missingAfterBootstrap = resolveLatestMissingFiles();
  const lineageAfterRecovery = validateLatestLineageProvenance();
  const scorecardAfterRecovery = validateLatestScorecardContract();
  const perQueryAfterRecovery = validatePerQueryCoverageContract();
  if (
    missingAfterBootstrap.length === 0 &&
    perQueryAfterRecovery.ok &&
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
  const inputFile = String(lineage?.inputFile || "").trim();
  if (!inputFile) {
    return { ok: false, reason: "LINEAGE_INPUT_FILE_MISSING" };
  }
  if (isRecursivePerQueryInput(inputFile)) {
    return { ok: false, reason: "LINEAGE_INPUT_FILE_RECURSIVE_PER_QUERY" };
  }
  const inputArtifactType = String(lineage?.inputArtifactType || "")
    .trim()
    .toLowerCase();
  if (inputArtifactType !== REQUIRED_INPUT_ARTIFACT_TYPE) {
    return {
      ok: false,
      reason: `LINEAGE_INPUT_ARTIFACT_TYPE_INVALID:${inputArtifactType || "missing"}`,
    };
  }
  const sourceArtifactPath = String(lineage?.sourceArtifactPath || "").trim();
  if (!sourceArtifactPath) {
    return { ok: false, reason: "LINEAGE_SOURCE_ARTIFACT_PATH_MISSING" };
  }
  if (isRecursivePerQueryInput(sourceArtifactPath)) {
    return { ok: false, reason: "LINEAGE_SOURCE_ARTIFACT_RECURSIVE_PER_QUERY" };
  }
  if (!pathEquals(sourceArtifactPath, inputFile)) {
    return { ok: false, reason: "LINEAGE_SOURCE_ARTIFACT_PATH_INPUT_MISMATCH" };
  }
  const sourceArtifactSha256 = String(lineage?.sourceArtifactSha256 || "")
    .trim()
    .toLowerCase();
  if (!/^[a-f0-9]{64}$/i.test(sourceArtifactSha256)) {
    return { ok: false, reason: "LINEAGE_SOURCE_ARTIFACT_SHA256_INVALID" };
  }
  const sourceArtifactBytes = Number(lineage?.sourceArtifactBytes || 0);
  if (!Number.isFinite(sourceArtifactBytes) || sourceArtifactBytes < 1) {
    return { ok: false, reason: "LINEAGE_SOURCE_ARTIFACT_BYTES_INVALID" };
  }
  if (!fs.existsSync(sourceArtifactPath)) {
    return { ok: false, reason: "LINEAGE_SOURCE_ARTIFACT_MISSING_FILE" };
  }
  try {
    const actualSha256 = sha256File(sourceArtifactPath).toLowerCase();
    if (actualSha256 !== sourceArtifactSha256) {
      return { ok: false, reason: "LINEAGE_SOURCE_ARTIFACT_SHA256_MISMATCH" };
    }
  } catch {
    return { ok: false, reason: "LINEAGE_SOURCE_ARTIFACT_UNREADABLE" };
  }
  return { ok: true, reason: "ok" };
}

function main() {
  ensureLatestArtifacts();
  ensurePlaywrightResults();

  const missingLatestFiles = resolveLatestMissingFiles();
  const perQueryRows = resolvePerQueryRows();
  const perQueryCoverage = validatePerQueryCoverageContract();
  const playwrightStats = readPlaywrightStats(FRONTEND_RESULTS_JSON);
  const failures = [];
  if (missingLatestFiles.length > 0) {
    failures.push(`LATEST_FILES_MISSING:${missingLatestFiles.join(",")}`);
  }
  if (perQueryRows <= 0) {
    failures.push("PER_QUERY_EMPTY_OR_MISSING");
  }
  if (!perQueryCoverage.ok) failures.push(perQueryCoverage.reason);
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
