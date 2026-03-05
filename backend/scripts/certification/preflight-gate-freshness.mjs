#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { resolveCommitHash } from "./git-commit.mjs";
import { resolveCertificationProfileFromArgs } from "./certification-policy.mjs";
import { resolveCertificationGateSet } from "./certification-gate-manifest.mjs";

const strict =
  process.argv.includes("--strict") ||
  process.argv.includes("--mode=strict");
const profile = resolveCertificationProfileFromArgs({ args: process.argv });
const scopeArg = (Array.isArray(process.argv) ? process.argv : [])
  .map((arg) => String(arg || "").trim())
  .find((arg) => arg.startsWith("--scope="));
const scope = (() => {
  const value = String(scopeArg || "").split("=", 2)[1] || "";
  return value.trim().toLowerCase() === "p0" ? "p0" : "cert";
})();
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

function hasQueryLatencyInput() {
  const reportsRoots = [
    path.resolve(root, "../frontend/e2e/reports"),
    path.resolve(root, "frontend/e2e/reports"),
  ];
  for (const reportsRoot of reportsRoots) {
    const latestPath = path.join(reportsRoot, "latest", "per_query.json");
    if (fs.existsSync(latestPath)) return true;
    const lineagePath = path.join(reportsRoot, "latest", "lineage.json");
    if (fs.existsSync(lineagePath)) {
      try {
        const lineage = readJson(lineagePath);
        const archivePerQueryPath = String(
          lineage?.archivePerQueryPath || "",
        ).trim();
        if (archivePerQueryPath && fs.existsSync(archivePerQueryPath)) return true;
      } catch {
        // ignore malformed lineage and continue archive probing
      }
    }
    const archiveRoot = path.join(reportsRoot, "archive");
    if (fs.existsSync(archiveRoot)) {
      const dirs = fs
        .readdirSync(archiveRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((a, b) => b.localeCompare(a));
      for (const dirName of dirs) {
        const archivedPerQueryPath = path.join(
          archiveRoot,
          dirName,
          "per_query.json",
        );
        if (fs.existsSync(archivedPerQueryPath)) return true;
      }
    }
  }
  return false;
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

  const gateSet = resolveCertificationGateSet({
    scope,
    strict,
    profile,
    hasQueryLatencyInput: hasQueryLatencyInput(),
    env: process.env,
  });
  if (gateSet.requiredGateIds.length === 0) {
    console.error("[cert:preflight] no active required gates resolved");
    process.exit(1);
  }

  const failures = [];
  for (const gateId of gateSet.requiredGateIds) {
    const fileName = `${gateId}.json`;
    const filePath = path.join(gatesDir, fileName);
    if (!fs.existsSync(filePath)) {
      failures.push(`${fileName}:missing_gate_report`);
      continue;
    }
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
      `[cert:preflight] FAIL strict=${strict} profile=${profile} scope=${scope} required=${gateSet.requiredGateIds.length} commit=${commitHash || "unknown"}`,
    );
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log(
    `[cert:preflight] PASS strict=${strict} profile=${profile} scope=${scope} required=${gateSet.requiredGateIds.length} commit=${commitHash || "unknown"}`,
  );
}

main();
