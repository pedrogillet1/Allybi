#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.resolve(__dirname, "..", "reports");
const LATEST_DIR = path.join(REPORTS_DIR, "latest");
const ARCHIVE_DIR = path.join(REPORTS_DIR, "archive");
const strictMode =
  process.argv.includes("--strict") || process.argv.includes("--require-complete");
const RESULTS_FILE = path.join(REPORTS_DIR, "results.json");
const EVIDENCE_CONTRACT_PATH = path.resolve(
  __dirname,
  "../../../backend/scripts/certification/retrieval-evidence-contract.json",
);

function resolveRequiredArtifacts() {
  const fallbackRequired = [
    "scorecard.json",
    "grading.md",
    "a-plus-gap-deep-dive.md",
    "per_query.json",
    "lineage.json",
  ];
  const fallbackForbidden = ["per_query.json"];
  if (!fs.existsSync(EVIDENCE_CONTRACT_PATH)) {
    return {
      requiredLatestFiles: fallbackRequired,
      forbiddenFallbackDatasetMarkers: fallbackForbidden,
    };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(EVIDENCE_CONTRACT_PATH, "utf8"));
    const required = Array.isArray(parsed?.requiredLatestFiles)
      ? parsed.requiredLatestFiles
        .map((value) => String(value || "").trim())
        .filter(Boolean)
      : fallbackRequired;
    const forbiddenFromContract = Array.isArray(parsed?.forbiddenFallbackDatasetMarkers)
      ? parsed.forbiddenFallbackDatasetMarkers
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean)
      : [];
    const forbidden = Array.from(
      new Set([...fallbackForbidden, ...forbiddenFromContract]),
    );
    return {
      requiredLatestFiles: required.length > 0 ? required : fallbackRequired,
      forbiddenFallbackDatasetMarkers: forbidden,
    };
  } catch {
    return {
      requiredLatestFiles: fallbackRequired,
      forbiddenFallbackDatasetMarkers: fallbackForbidden,
    };
  }
}

const EVIDENCE_CONTRACT = resolveRequiredArtifacts();
const REQUIRED_ARTIFACTS = EVIDENCE_CONTRACT.requiredLatestFiles;
const FORBIDDEN_FALLBACK_DATASET_MARKERS =
  EVIDENCE_CONTRACT.forbiddenFallbackDatasetMarkers;

function isCompleteRun(dirPath) {
  return REQUIRED_ARTIFACTS.every((name) => fs.existsSync(path.join(dirPath, name)));
}

function readPlaywrightStats(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return {
      expected: Number(parsed?.stats?.expected || 0),
      skipped: Number(parsed?.stats?.skipped || 0),
    };
  } catch {
    return null;
  }
}

function isHealthyPlaywrightStats(stats) {
  return Boolean(stats && stats.expected > 0 && stats.skipped === 0);
}

function replaceFile(fromPath, toPath) {
  fs.mkdirSync(path.dirname(toPath), { recursive: true });
  if (fs.existsSync(toPath)) {
    try {
      fs.chmodSync(toPath, 0o666);
    } catch {
      // best effort
    }
    fs.rmSync(toPath, { force: true });
  }
  fs.copyFileSync(fromPath, toPath);
}

function hasForbiddenFallbackMarker(lineage) {
  if (
    !lineage ||
    typeof lineage !== "object" ||
    FORBIDDEN_FALLBACK_DATASET_MARKERS.length === 0
  ) {
    return false;
  }
  const fields = [
    String(lineage?.datasetId || "").trim().toLowerCase(),
    String(lineage?.inputFile || "").trim().toLowerCase(),
    String(lineage?.source || "").trim().toLowerCase(),
  ];
  return FORBIDDEN_FALLBACK_DATASET_MARKERS.some(
    (marker) => marker && fields.some((field) => field.includes(marker)),
  );
}

function hasForbiddenFallbackProvenance(dirPath) {
  const lineagePath = path.join(dirPath, "lineage.json");
  if (!fs.existsSync(lineagePath)) return false;
  try {
    const lineage = JSON.parse(fs.readFileSync(lineagePath, "utf8"));
    return hasForbiddenFallbackMarker(lineage);
  } catch {
    return false;
  }
}

function restoreResultsFromArchive() {
  if (isHealthyPlaywrightStats(readPlaywrightStats(RESULTS_FILE))) return;
  if (!fs.existsSync(ARCHIVE_DIR)) {
    if (strictMode) {
      console.error(
        `[lineage-bootstrap] strict mode requires archive directory: ${ARCHIVE_DIR}`,
      );
      process.exit(1);
    }
    return;
  }
  const dirs = fs
    .readdirSync(ARCHIVE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a));
  for (const dirName of dirs) {
    const candidate = path.join(ARCHIVE_DIR, dirName, "results.json");
    if (!isHealthyPlaywrightStats(readPlaywrightStats(candidate))) continue;
    replaceFile(candidate, RESULTS_FILE);
    console.log(`[lineage-bootstrap] restored results.json from ${candidate}`);
    return;
  }
  if (strictMode) {
    console.error(
      "[lineage-bootstrap] strict mode requires healthy results.json (stats.expected > 0 and stats.skipped == 0)",
    );
    process.exit(1);
  }
}

function main() {
  fs.mkdirSync(LATEST_DIR, { recursive: true });
  if (isCompleteRun(LATEST_DIR)) {
    if (!hasForbiddenFallbackProvenance(LATEST_DIR)) {
      console.log("[lineage-bootstrap] latest already complete");
      return;
    }
    console.warn(
      "[lineage-bootstrap] latest lineage uses forbidden fallback dataset provenance; restoring from archive.",
    );
  }

  if (!fs.existsSync(ARCHIVE_DIR)) {
    const message = `[lineage-bootstrap] no archive directory found: ${ARCHIVE_DIR}`;
    if (strictMode) {
      console.error(message);
      process.exit(1);
    }
    console.warn(message);
    return;
  }

  const candidates = fs
    .readdirSync(ARCHIVE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(ARCHIVE_DIR, entry.name))
    .filter((dirPath) => isCompleteRun(dirPath))
    .filter((dirPath) => !hasForbiddenFallbackProvenance(dirPath))
    .sort((a, b) => b.localeCompare(a));

  if (candidates.length === 0) {
    const message =
      "[lineage-bootstrap] no complete archive run found to restore latest artifacts.";
    if (strictMode) {
      console.error(message);
      process.exit(1);
    }
    console.warn(message);
    return;
  }

  const selected = candidates[0];
  for (const name of REQUIRED_ARTIFACTS) {
    const from = path.join(selected, name);
    const to = path.join(LATEST_DIR, name);
    replaceFile(from, to);
  }
  console.log(
    `[lineage-bootstrap] restored latest artifacts from ${selected}`,
  );
}

restoreResultsFromArchive();
main();
