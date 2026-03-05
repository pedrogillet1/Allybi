#!/usr/bin/env node
/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.resolve(__dirname, '..', 'reports');
const LATEST_DIR = path.join(REPORTS_DIR, 'latest');

const scorecardPath = path.join(LATEST_DIR, 'scorecard.json');
const gradingPath = path.join(LATEST_DIR, 'grading.md');
const deepDivePath = path.join(LATEST_DIR, 'a-plus-gap-deep-dive.md');
const perQueryPath = path.join(LATEST_DIR, 'per_query.json');
const lineagePath = path.join(LATEST_DIR, 'lineage.json');

const failures = [];

function readUtf8(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function sha256File(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function normalizePath(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return path.resolve(raw);
}

function assertManifestArtifact(lineage, key, expectedLatestPath) {
  const artifact = lineage?.artifacts?.[key];
  if (!artifact || typeof artifact !== 'object') {
    failures.push(`lineage_missing_artifact_${key}`);
    return;
  }

  const latestPath = normalizePath(artifact.latestPath);
  const archivePath = normalizePath(artifact.archivePath);
  const digest = String(artifact.sha256 || '').trim().toLowerCase();
  const bytes = Number(artifact.bytes);

  if (!latestPath) failures.push(`lineage_${key}_missing_latestPath`);
  if (!archivePath) failures.push(`lineage_${key}_missing_archivePath`);
  if (!digest) failures.push(`lineage_${key}_missing_sha256`);
  if (!Number.isFinite(bytes) || bytes < 1) failures.push(`lineage_${key}_invalid_bytes`);

  if (latestPath && latestPath !== path.resolve(expectedLatestPath)) {
    failures.push(`lineage_${key}_latestPath_mismatch`);
  }
  if (latestPath && !fs.existsSync(latestPath)) failures.push(`lineage_${key}_latestPath_missing_file`);
  if (archivePath && !fs.existsSync(archivePath)) failures.push(`lineage_${key}_archivePath_missing_file`);

  if (latestPath && digest && fs.existsSync(latestPath)) {
    const actual = sha256File(latestPath);
    if (actual !== digest) failures.push(`lineage_${key}_latest_sha256_mismatch`);
  }
  if (archivePath && digest && fs.existsSync(archivePath)) {
    const actual = sha256File(archivePath);
    if (actual !== digest) failures.push(`lineage_${key}_archive_sha256_mismatch`);
  }
}

if (!fs.existsSync(scorecardPath)) failures.push('missing_scorecard_json');
if (!fs.existsSync(gradingPath)) failures.push('missing_grading_md');
if (!fs.existsSync(deepDivePath)) failures.push('missing_a_plus_gap_deep_dive_md');
if (!fs.existsSync(perQueryPath)) failures.push('missing_per_query_json');
if (!fs.existsSync(lineagePath)) failures.push('missing_lineage_json');

if (failures.length > 0) {
  console.error(`[report-lineage] missing artifacts: ${failures.join(', ')}`);
  process.exit(1);
}

const scorecard = JSON.parse(readUtf8(scorecardPath));
const grading = readUtf8(gradingPath);
const deepDive = readUtf8(deepDivePath);
const lineage = JSON.parse(readUtf8(lineagePath));

const generatedAt = String(scorecard?.generatedAt || '').trim();
const runId = String(scorecard?.meta?.runId || '').trim();
const pack = String(scorecard?.pack || '').trim();
const inputFile = String(scorecard?.inputFile || '').trim();
const totalQueries = Number(scorecard?.meta?.totalQueries || 0);
const rowsCount = Array.isArray(scorecard?.rows) ? scorecard.rows.length : 0;

if (!generatedAt) failures.push('scorecard_missing_generatedAt');
if (!runId) failures.push('scorecard_missing_meta_runId');
if (!pack) failures.push('scorecard_missing_pack');
if (!inputFile) failures.push('scorecard_missing_inputFile');
if (!Number.isFinite(totalQueries) || totalQueries < 1) {
  failures.push('scorecard_invalid_totalQueries');
}
if (rowsCount !== totalQueries) {
  failures.push('scorecard_rows_total_mismatch');
}

const lineageRunId = String(lineage?.runId || '').trim();
const lineagePack = String(lineage?.pack || '').trim();
const lineageInputFile = String(lineage?.inputFile || '').trim();
const lineageTotalQueries = Number(lineage?.totalQueries || 0);
if (!lineageRunId) failures.push('lineage_missing_runId');
if (!lineagePack) failures.push('lineage_missing_pack');
if (!lineageInputFile) failures.push('lineage_missing_inputFile');
if (!Number.isFinite(lineageTotalQueries) || lineageTotalQueries < 1) {
  failures.push('lineage_invalid_totalQueries');
}
if (lineageRunId && lineageRunId !== runId) failures.push('lineage_runId_mismatch');
if (lineagePack && lineagePack !== pack) failures.push('lineage_pack_mismatch');
if (lineageInputFile && lineageInputFile !== inputFile) failures.push('lineage_inputFile_mismatch');
if (Number.isFinite(lineageTotalQueries) && lineageTotalQueries !== totalQueries) {
  failures.push('lineage_totalQueries_mismatch');
}

assertManifestArtifact(lineage, 'scorecard', scorecardPath);
assertManifestArtifact(lineage, 'grading', gradingPath);
assertManifestArtifact(lineage, 'deepDive', deepDivePath);
assertManifestArtifact(lineage, 'perQuery', perQueryPath);

const legacyArchivePerQueryPath = String(lineage?.archivePerQueryPath || '').trim();
if (!legacyArchivePerQueryPath) failures.push('lineage_missing_archivePerQueryPath');
if (legacyArchivePerQueryPath && !fs.existsSync(legacyArchivePerQueryPath)) {
  failures.push('lineage_archivePerQueryPath_missing_file');
}

const gradingInputLine = grading.match(/^- Input:\s*(.+)$/m);
if (!gradingInputLine) failures.push('grading_missing_input_line');
if (gradingInputLine && String(gradingInputLine[1]).trim() !== inputFile) {
  failures.push('grading_input_mismatch');
}

const deepDiveSourceLine = deepDive.match(/^Source:\s*(.+)$/m);
if (!deepDiveSourceLine) failures.push('deep_dive_missing_source_line');
if (
  deepDiveSourceLine &&
  String(deepDiveSourceLine[1]).trim() !==
    'frontend/e2e/reports/latest/scorecard.json'
) {
  failures.push('deep_dive_source_not_latest_scorecard');
}

if (failures.length > 0) {
  console.error(`[report-lineage] failed: ${failures.join(', ')}`);
  process.exit(1);
}

console.log('[report-lineage] PASS');
