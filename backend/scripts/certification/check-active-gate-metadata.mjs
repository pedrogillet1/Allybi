#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { resolveCertificationGateSet } from "./certification-gate-manifest.mjs";

const root = process.cwd();
const summaryPath = path.resolve(root, "reports/cert/certification-summary.json");
const activeManifestPath = path.resolve(root, "reports/cert/active-gates-manifest.json");

if (!fs.existsSync(summaryPath)) {
  console.error(`[cert:metadata] missing summary: ${summaryPath}`);
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
const activeManifest = fs.existsSync(activeManifestPath)
  ? JSON.parse(fs.readFileSync(activeManifestPath, "utf8"))
  : null;
const gates = Array.isArray(summary?.gates) ? summary.gates : [];
const gatesById = new Map(
  gates.map((gate) => [String(gate?.gateId || "").trim(), gate]),
);
const profile = String(summary?.profile || "").trim() || "local";
const strict = summary?.strict === true;
const queryLatencyRequired = summary?.policy?.queryLatency?.required === true;
const gateSet = resolveCertificationGateSet({
  scope: "cert",
  strict,
  profile,
  hasQueryLatencyInput: queryLatencyRequired,
  env: process.env,
});
const failures = [];
if (!activeManifest) {
  failures.push("missing_active_gate_manifest");
}
const manifestRequiredGateIds = new Set(
  Array.isArray(activeManifest?.requiredGateIds)
    ? activeManifest.requiredGateIds.map((value) => String(value || "").trim())
    : [],
);

for (const gateId of gateSet.requiredGateIds) {
  if (!manifestRequiredGateIds.has(gateId)) {
    failures.push(`missing_required_gate_in_manifest:${gateId}`);
  }
  const gate = gatesById.get(gateId);
  if (!gate) {
    failures.push(`missing_required_gate:${gateId}`);
    continue;
  }
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

console.log(
  `[cert:metadata] active gate metadata check passed (required=${gateSet.requiredGateIds.length})`,
);
