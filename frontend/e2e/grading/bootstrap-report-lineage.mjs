#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.resolve(__dirname, "..", "reports");
const LATEST_DIR = path.join(REPORTS_DIR, "latest");
const ARCHIVE_DIR = path.join(REPORTS_DIR, "archive");
const REQUIRED_ARTIFACTS = [
  "scorecard.json",
  "grading.md",
  "a-plus-gap-deep-dive.md",
  "per_query.json",
  "lineage.json",
];

function isCompleteRun(dirPath) {
  return REQUIRED_ARTIFACTS.every((name) => fs.existsSync(path.join(dirPath, name)));
}

function main() {
  fs.mkdirSync(LATEST_DIR, { recursive: true });
  if (isCompleteRun(LATEST_DIR)) {
    console.log("[lineage-bootstrap] latest already complete");
    return;
  }

  if (!fs.existsSync(ARCHIVE_DIR)) {
    console.error(
      `[lineage-bootstrap] no archive directory found: ${ARCHIVE_DIR}`,
    );
    process.exit(1);
  }

  const candidates = fs
    .readdirSync(ARCHIVE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(ARCHIVE_DIR, entry.name))
    .filter((dirPath) => isCompleteRun(dirPath))
    .sort((a, b) => b.localeCompare(a));

  if (candidates.length === 0) {
    console.error(
      "[lineage-bootstrap] no complete archive run found to restore latest artifacts.",
    );
    process.exit(1);
  }

  const selected = candidates[0];
  for (const name of REQUIRED_ARTIFACTS) {
    const from = path.join(selected, name);
    const to = path.join(LATEST_DIR, name);
    fs.copyFileSync(from, to);
  }
  console.log(
    `[lineage-bootstrap] restored latest artifacts from ${selected}`,
  );
}

main();
