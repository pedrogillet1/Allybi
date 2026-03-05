#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.resolve(__dirname, '..', 'reports');
const LATEST_DIR = path.join(REPORTS_DIR, 'latest');
const ARCHIVE_DIR = path.join(REPORTS_DIR, 'archive');

const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check');
const prepare = args.has('--prepare');
const resetLatest = args.has('--reset-latest');
const dryRun = args.has('--dry-run');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function isCanonicalTopLevel(name) {
  return name === 'latest' || name === 'archive' || name === '.gitkeep';
}

function listNonCanonicalEntries() {
  if (!fs.existsSync(REPORTS_DIR)) return [];
  return fs
    .readdirSync(REPORTS_DIR, { withFileTypes: true })
    .map((d) => d.name)
    .filter((name) => !isCanonicalTopLevel(name));
}

function validateLatestContract() {
  const scorecard = path.join(LATEST_DIR, 'scorecard.json');
  const grading = path.join(LATEST_DIR, 'grading.md');
  const deepDive = path.join(LATEST_DIR, 'a-plus-gap-deep-dive.md');
  const perQuery = path.join(LATEST_DIR, 'per_query.json');
  const lineage = path.join(LATEST_DIR, 'lineage.json');
  const exists = {
    scorecard: fs.existsSync(scorecard),
    grading: fs.existsSync(grading),
    deepDive: fs.existsSync(deepDive),
    perQuery: fs.existsSync(perQuery),
    lineage: fs.existsSync(lineage),
  };

  const anyPresent = Object.values(exists).some(Boolean);
  if (!anyPresent) return { ok: true, failures: [] };

  const failures = [];
  if (!exists.scorecard) failures.push('latest_missing_scorecard');
  if (!exists.grading) failures.push('latest_missing_grading');
  if (!exists.deepDive) failures.push('latest_missing_a_plus_gap_deep_dive');
  if (!exists.perQuery) failures.push('latest_missing_per_query');
  if (!exists.lineage) failures.push('latest_missing_lineage');
  return { ok: failures.length === 0, failures };
}

function removeContents(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    fs.rmSync(full, { recursive: true, force: true });
  }
}

function archiveNonCanonical(entries) {
  if (entries.length === 0) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runArchiveDir = path.join(ARCHIVE_DIR, stamp);
  ensureDir(runArchiveDir);

  for (const name of entries) {
    const src = path.join(REPORTS_DIR, name);
    const dest = path.join(runArchiveDir, name);
    if (!dryRun) fs.renameSync(src, dest);
  }

  return runArchiveDir;
}

ensureDir(REPORTS_DIR);
ensureDir(LATEST_DIR);
ensureDir(ARCHIVE_DIR);

const nonCanonical = listNonCanonicalEntries();

if (checkOnly) {
  const latestContract = validateLatestContract();
  if (nonCanonical.length > 0) {
    console.error('[report-hygiene] FAIL: non-canonical top-level report artifacts found');
    for (const name of nonCanonical) {
      console.error(` - ${name}`);
    }
    process.exit(1);
  }
  if (!latestContract.ok) {
    console.error('[report-hygiene] FAIL: latest contract broken');
    for (const failure of latestContract.failures) {
      console.error(` - ${failure}`);
    }
    process.exit(1);
  }
  console.log('[report-hygiene] PASS: report tree is canonical (latest/archive only)');
  process.exit(0);
}

if (prepare) {
  const archivedTo = archiveNonCanonical(nonCanonical);
  if (resetLatest) {
    if (!dryRun) removeContents(LATEST_DIR);
  }

  if (archivedTo) {
    console.log(
      `[report-hygiene] ${dryRun ? 'would archive' : 'archived'} ${nonCanonical.length} entries -> ${archivedTo}`,
    );
  } else {
    console.log('[report-hygiene] nothing to archive');
  }
  if (resetLatest) {
    console.log(`[report-hygiene] latest directory ${dryRun ? 'would be reset' : 'reset'}`);
  }
  process.exit(0);
}

console.log('[report-hygiene] no action taken');
