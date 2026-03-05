#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { resolveCommitHash } from "./git-commit.mjs";
import { resolveCertificationProfileFromArgs } from "./certification-policy.mjs";

const strict =
  process.argv.includes("--strict") ||
  process.argv.includes("--mode=strict");
const profile = resolveCertificationProfileFromArgs({ args: process.argv });
const maxAgeHours = Number(process.env.CERT_GATE_MAX_AGE_HOURS || 24);
const maxAgeMs = Number.isFinite(maxAgeHours) && maxAgeHours > 0
  ? maxAgeHours * 60 * 60 * 1000
  : 24 * 60 * 60 * 1000;

const root = process.cwd();
const gatesDir = path.resolve(root, "reports/cert/gates");
const commitMetadata = resolveCommitHash(root);
const commitHash = commitMetadata.commitHash;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function analyzeFreshness(gate) {
  const reasons = [];
  const generatedAt = String(gate?.generatedAt || "").trim();
  if (!generatedAt) {
    reasons.push("missing_generatedAt");
  } else {
    const ts = Date.parse(generatedAt);
    if (!Number.isFinite(ts)) {
      reasons.push("invalid_generatedAt");
    } else if (Date.now() - ts > maxAgeMs) {
      reasons.push(`stale_age_gt_${maxAgeHours}h`);
    }
  }

  const gateCommitHash = String(gate?.meta?.commitHash || "").trim();
  if (strict && !gateCommitHash) {
    reasons.push("missing_commit_hash_metadata");
  } else if (gateCommitHash && commitHash && gateCommitHash !== commitHash) {
    reasons.push("commit_hash_mismatch");
  }
  return reasons;
}

function main() {
  if (!fs.existsSync(gatesDir)) {
    console.error(`[cert:preflight] missing gates dir: ${gatesDir}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(gatesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    console.error("[cert:preflight] no gate reports found");
    process.exit(1);
  }

  const failures = [];
  for (const fileName of files) {
    const filePath = path.join(gatesDir, fileName);
    let gate;
    try {
      gate = readJson(filePath);
    } catch {
      failures.push(`${fileName}:invalid_json`);
      continue;
    }
    const reasons = analyzeFreshness(gate);
    if (reasons.length > 0) {
      failures.push(`${fileName}:${reasons.join("|")}`);
    }
  }

  if (failures.length > 0) {
    console.error(
      `[cert:preflight] FAIL strict=${strict} profile=${profile} commit=${commitHash || "unknown"}`,
    );
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log(
    `[cert:preflight] PASS strict=${strict} profile=${profile} files=${files.length} commit=${commitHash || "unknown"}`,
  );
}

main();
