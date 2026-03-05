#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const jsonPath = path.resolve(root, "reports/cert/certification-summary.json");
const mdPath = path.resolve(root, "reports/cert/certification-summary.md");
const localCertRunPath = path.resolve(root, "reports/cert/local-cert-run.json");
const maxAgeHours = Number(process.env.CERT_GATE_MAX_AGE_HOURS || 24);
const maxAgeMs = Number.isFinite(maxAgeHours) && maxAgeHours > 0
  ? maxAgeHours * 60 * 60 * 1000
  : 24 * 60 * 60 * 1000;

if (!fs.existsSync(jsonPath) || !fs.existsSync(mdPath)) {
  console.error(
    `[cert:summary] missing summary artifact(s): json=${fs.existsSync(jsonPath)} md=${fs.existsSync(mdPath)}`,
  );
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const md = fs.readFileSync(mdPath, "utf8");

function capture(pattern) {
  const match = md.match(pattern);
  return match ? String(match[1]).trim() : null;
}

const mdGenerated = capture(/^- Generated:\s*(.+)$/m);
const mdPassed = capture(/^- Passed:\s*(yes|no)$/m);
const mdPassedGates = capture(/^- Passed gates:\s*([0-9]+\/[0-9]+)$/m);
const mdLineageRunId = capture(/^- Lineage run id:\s*(.+)$/m);
const mdLineageDatasetId = capture(/^- Lineage dataset id:\s*(.+)$/m);
const mdLineageProfile = capture(/^- Lineage profile:\s*(.+)$/m);
const expectedPassed = summary.passed ? "yes" : "no";
const expectedPassedGates = `${summary.passedGates}/${summary.totalGates}`;
const expectedRunId = String(summary?.lineage?.runId || "").trim();
const expectedDatasetId = String(summary?.lineage?.datasetId || "").trim();
const expectedProfile = String(summary?.lineage?.profile || "").trim();

const failures = [];
if (!mdGenerated) failures.push("MD_MISSING_GENERATED");
if (mdGenerated && mdGenerated !== String(summary.generatedAt || "").trim()) {
  failures.push("GENERATED_TIMESTAMP_MISMATCH");
}
if (!mdPassed) failures.push("MD_MISSING_PASSED");
if (mdPassed && mdPassed !== expectedPassed) {
  failures.push("PASSED_FLAG_MISMATCH");
}
if (!mdPassedGates) failures.push("MD_MISSING_PASSED_GATES");
if (mdPassedGates && mdPassedGates !== expectedPassedGates) {
  failures.push("PASSED_GATES_MISMATCH");
}
if (!mdLineageRunId) failures.push("MD_MISSING_LINEAGE_RUN_ID");
if (!mdLineageDatasetId) failures.push("MD_MISSING_LINEAGE_DATASET_ID");
if (!mdLineageProfile) failures.push("MD_MISSING_LINEAGE_PROFILE");
if (!expectedRunId) failures.push("SUMMARY_MISSING_LINEAGE_RUN_ID");
if (!expectedDatasetId) failures.push("SUMMARY_MISSING_LINEAGE_DATASET_ID");
if (!expectedProfile) failures.push("SUMMARY_MISSING_LINEAGE_PROFILE");
if (mdLineageRunId && expectedRunId && mdLineageRunId !== expectedRunId) {
  failures.push("LINEAGE_RUN_ID_MISMATCH");
}
if (
  mdLineageDatasetId &&
  expectedDatasetId &&
  mdLineageDatasetId !== expectedDatasetId
) {
  failures.push("LINEAGE_DATASET_ID_MISMATCH");
}
if (mdLineageProfile && expectedProfile && mdLineageProfile !== expectedProfile) {
  failures.push("LINEAGE_PROFILE_MISMATCH");
}

const runtimeWiringGate = Array.isArray(summary.gates)
  ? summary.gates.find((gate) => String(gate?.gateId || "") === "runtime-wiring")
  : null;
if (!runtimeWiringGate) {
  failures.push("RUNTIME_WIRING_GATE_MISSING_IN_SUMMARY");
} else {
  const commandMode = String(runtimeWiringGate?.metrics?.commandMode || "").trim();
  if (commandMode !== "live" && commandMode !== "cached") {
    failures.push(
      `RUNTIME_WIRING_DEGRADED_EVIDENCE_MODE:${commandMode || "missing"}`,
    );
  }
}

const allowFailedLocalRun =
  String(process.env.CERT_ALLOW_FAILED_LOCAL_RUN || "").trim().toLowerCase() ===
    "true" || process.env.CERT_ALLOW_FAILED_LOCAL_RUN === "1";
const localRunHealthOverride = String(
  process.env.CERT_ENFORCE_LOCAL_CERT_RUN || "",
)
  .trim()
  .toLowerCase();
const enforceLocalRunHealth =
  localRunHealthOverride === "1" ||
  localRunHealthOverride === "true" ||
  (localRunHealthOverride !== "0" && localRunHealthOverride !== "false");
if (fs.existsSync(localCertRunPath)) {
  try {
    const localRun = JSON.parse(fs.readFileSync(localCertRunPath, "utf8"));
    const endTimeMs = Number(localRun?.endTime || 0);
    const startTimeMs = Number(localRun?.startTime || 0);
    const bestTimestamp = Number.isFinite(endTimeMs) && endTimeMs > 0
      ? endTimeMs
      : Number.isFinite(startTimeMs) && startTimeMs > 0
        ? startTimeMs
        : null;
    const isRecent = typeof bestTimestamp === "number"
      ? Date.now() - bestTimestamp <= maxAgeMs
      : false;
    const localFailed =
      localRun?.success !== true ||
      Number(localRun?.numFailedTestSuites || 0) > 0 ||
      Number(localRun?.numRuntimeErrorTestSuites || 0) > 0 ||
      Number(localRun?.numFailedTests || 0) > 0;
    if (
      enforceLocalRunHealth &&
      isRecent &&
      localFailed &&
      !allowFailedLocalRun
    ) {
      failures.push("RECENT_LOCAL_CERT_RUN_FAILED");
    }
  } catch {
    if (enforceLocalRunHealth) failures.push("INVALID_LOCAL_CERT_RUN_JSON");
  }
}

if (failures.length > 0) {
  console.error("[cert:summary] consistency check failed");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("[cert:summary] consistency check passed");
