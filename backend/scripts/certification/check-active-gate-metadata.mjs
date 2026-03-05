#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const summaryPath = path.resolve(root, "reports/cert/certification-summary.json");

if (!fs.existsSync(summaryPath)) {
  console.error(`[cert:metadata] missing summary: ${summaryPath}`);
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
const gates = Array.isArray(summary?.gates) ? summary.gates : [];
const failures = [];

for (const gate of gates) {
  const gateId = String(gate?.gateId || "").trim() || "unknown_gate";
  const commitHash = String(gate?.meta?.commitHash || "").trim();
  if (!commitHash) {
    failures.push(`missing_commit_hash:${gateId}`);
  }
}

if (failures.length > 0) {
  console.error("[cert:metadata] active gate metadata check failed");
  for (const failure of failures) {
    console.error(` - ${failure}`);
  }
  process.exit(1);
}

console.log(`[cert:metadata] active gate metadata check passed (${gates.length} gates)`);
