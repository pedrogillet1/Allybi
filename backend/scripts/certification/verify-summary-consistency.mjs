#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import {
  isCiRuntime,
  requireLiveRuntimeGraphEvidence,
  resolveCertificationProfile,
  resolveLocalCertRunPolicy,
} from "./certification-policy.mjs";

const root = process.cwd();
const jsonPath = path.resolve(root, "reports/cert/certification-summary.json");
const mdPath = path.resolve(root, "reports/cert/certification-summary.md");
const activeManifestPath = path.resolve(root, "reports/cert/active-gates-manifest.json");
const localCertRunPath = path.resolve(root, "reports/cert/local-cert-run.json");
const routingGradeLegacyPath = path.resolve(root, "reports/cert/routing-grade.json");
const routingGradeArtifactsRoot = path.resolve(
  root,
  "reports/cert/routing-grade-artifacts",
);
const maxAgeHours = Number(process.env.CERT_GATE_MAX_AGE_HOURS || 24);
const maxAgeMs = Number.isFinite(maxAgeHours) && maxAgeHours > 0
  ? maxAgeHours * 60 * 60 * 1000
  : 24 * 60 * 60 * 1000;

function sanitizeSegment(value, fallback) {
  const raw = String(value || "").trim().toLowerCase();
  const cleaned = raw.replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}

function resolveRoutingLatestPointerPath(profile, strictMode) {
  return path.join(
    routingGradeArtifactsRoot,
    sanitizeSegment(profile, "local"),
    strictMode ? "strict" : "relaxed",
    "latest.json",
  );
}

function freshArtifactReasons(generatedAt) {
  const reasons = [];
  const ts = Date.parse(String(generatedAt || "").trim());
  if (!Number.isFinite(ts)) return ["invalid_generatedAt"];
  if (Date.now() - ts > maxAgeMs) {
    reasons.push(`stale_age_gt_${maxAgeHours}h`);
  }
  return reasons;
}

if (!fs.existsSync(jsonPath) || !fs.existsSync(mdPath)) {
  console.error(
    `[cert:summary] missing summary artifact(s): json=${fs.existsSync(jsonPath)} md=${fs.existsSync(mdPath)}`,
  );
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const md = fs.readFileSync(mdPath, "utf8");
const activeManifest = fs.existsSync(activeManifestPath)
  ? JSON.parse(fs.readFileSync(activeManifestPath, "utf8"))
  : null;

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
const profile = resolveCertificationProfile({
  ...process.env,
  CERT_PROFILE:
    String(summary?.profile || "").trim() ||
    String(summary?.lineage?.profile || "").trim() ||
    process.env.CERT_PROFILE,
});
const strict = summary?.strict === true;
const isRetrievalSignoff = profile === "retrieval_signoff";
const requiresCiEvidenceGates =
  profile === "ci" || profile === "release" || isRetrievalSignoff;

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
if (!activeManifest) failures.push("MISSING_ACTIVE_GATE_MANIFEST");
if (activeManifest) {
  const manifestRequired = Array.isArray(activeManifest.requiredGateIds)
    ? activeManifest.requiredGateIds.map((value) => String(value || "").trim())
    : [];
  const summaryRequired = Array.isArray(summary?.gates)
    ? summary.gates.map((gate) => String(gate?.gateId || "").trim())
    : [];
  const manifestRequiredSet = new Set(manifestRequired);
  for (const gateId of summaryRequired) {
    if (!manifestRequiredSet.has(gateId)) {
      failures.push(`ACTIVE_MANIFEST_MISSING_REQUIRED_GATE:${gateId}`);
    }
  }
  const missingRequiredArtifacts = Number(
    activeManifest?.stats?.missingRequiredArtifacts ?? 0,
  );
  if (missingRequiredArtifacts > 0) {
    failures.push(
      `ACTIVE_MANIFEST_MISSING_REQUIRED_ARTIFACTS:${missingRequiredArtifacts}`,
    );
  }
}

const runtimeWiringGate = Array.isArray(summary.gates)
  ? summary.gates.find((gate) => String(gate?.gateId || "") === "runtime-wiring")
  : null;
if (!runtimeWiringGate) {
  failures.push("RUNTIME_WIRING_GATE_MISSING_IN_SUMMARY");
} else {
  const requireLiveMode = requireLiveRuntimeGraphEvidence({ profile, strict });
  const commandMode = String(runtimeWiringGate?.metrics?.commandMode || "").trim();
  const embeddingRuntimeModeAllowed =
    runtimeWiringGate?.metrics?.embeddingRuntimeModeAllowed;
  if (
    (requireLiveMode && commandMode !== "live") ||
    (!requireLiveMode && commandMode !== "live" && commandMode !== "cached")
  ) {
    failures.push(
      `RUNTIME_WIRING_DEGRADED_EVIDENCE_MODE:${commandMode || "missing"}`,
    );
  }
  if (strict && embeddingRuntimeModeAllowed !== true) {
    failures.push("RUNTIME_WIRING_EMBEDDING_RUNTIME_MODE_NOT_ALLOWED");
  }
}

const allowFailedLocalRun =
  String(process.env.CERT_ALLOW_FAILED_LOCAL_RUN || "").trim().toLowerCase() ===
    "true" ||
  process.env.CERT_ALLOW_FAILED_LOCAL_RUN === "1" ||
  (!isCiRuntime(process.env) && profile !== "local_hard");
const localRunPolicy = resolveLocalCertRunPolicy({
  strict,
  profile,
  verifyOnly: summary?.verifyOnly === true,
});
const enforceLocalRunHealth = localRunPolicy.enforce;
if (enforceLocalRunHealth && !fs.existsSync(localCertRunPath)) {
  failures.push("MISSING_LOCAL_CERT_RUN_JSON");
}
if (fs.existsSync(localCertRunPath)) {
  try {
    const localRun = JSON.parse(fs.readFileSync(localCertRunPath, "utf8"));
    const endTimeMs = Number(localRun?.testResults?.endTime || localRun?.endTime || 0);
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
    if (strict) {
      const expectedStatus = !isRecent
        ? "unknown"
        : localFailed && enforceLocalRunHealth && !allowFailedLocalRun
          ? "fail_blocking"
          : localFailed
            ? "fail_non_blocking"
            : "pass";
      const observedStatus = String(summary?.localHealth?.status || "").trim();
      if (observedStatus !== expectedStatus) {
        failures.push(
          `LOCAL_HEALTH_STATUS_MISMATCH:${observedStatus || "missing"}!=${expectedStatus}`,
        );
      }
    }
  } catch {
    if (enforceLocalRunHealth) failures.push("INVALID_LOCAL_CERT_RUN_JSON");
  }
}

if (isRetrievalSignoff) {
  const skippedOptional = Array.isArray(summary?.skippedOptionalGates)
    ? summary.skippedOptionalGates
    : [];
  if (skippedOptional.length > 0) {
    failures.push("SIGNOFF_OPTIONAL_GATES_SKIPPED");
  }

  const requiredSignoffGates = new Set([
    "query-latency",
    "retrieval-golden-eval",
    "retrieval-realistic-eval",
    "retrieval-openworld-eval",
    "frontend-retrieval-evidence",
    "indexing-live-integration",
  ]);
  const presentGateIds = new Set(
    Array.isArray(summary?.gates)
      ? summary.gates.map((gate) => String(gate?.gateId || ""))
      : [],
  );
  const missingRequiredSignoffGates = Array.from(requiredSignoffGates).filter(
    (gateId) => !presentGateIds.has(gateId),
  );
  if (missingRequiredSignoffGates.length > 0) {
    failures.push(
      `SIGNOFF_REQUIRED_GATES_MISSING:${missingRequiredSignoffGates.join(",")}`,
    );
  }
}

if (requiresCiEvidenceGates) {
  const requiredCiEvidenceGates = new Set([
    "query-latency",
    "frontend-retrieval-evidence",
    "indexing-live-integration",
  ]);
  const presentGateIds = new Set(
    Array.isArray(summary?.gates)
      ? summary.gates.map((gate) => String(gate?.gateId || ""))
      : [],
  );
  const missingCiEvidenceGates = Array.from(requiredCiEvidenceGates).filter(
    (gateId) => !presentGateIds.has(gateId),
  );
  if (missingCiEvidenceGates.length > 0) {
    failures.push(
      `CI_REQUIRED_EVIDENCE_GATES_MISSING:${missingCiEvidenceGates.join(",")}`,
    );
  }
}

if (strict) {
  const pointerPath = resolveRoutingLatestPointerPath(profile, true);
  if (!fs.existsSync(pointerPath)) {
    failures.push(`ROUTING_GRADE_POINTER_MISSING:${pointerPath}`);
  } else {
    try {
      const pointer = JSON.parse(fs.readFileSync(pointerPath, "utf8"));
      const pointerProfile = String(pointer?.profile || "").trim().toLowerCase();
      if (pointerProfile !== profile) {
        failures.push(
          `ROUTING_GRADE_POINTER_PROFILE_MISMATCH:${pointerProfile || "missing"}!=${profile}`,
        );
      }
      if (pointer?.strict !== true) {
        failures.push("ROUTING_GRADE_POINTER_STRICT_FALSE");
      }
      const reportRelPath = String(pointer?.jsonPath || "").trim();
      const reportPath = reportRelPath
        ? path.resolve(root, reportRelPath)
        : routingGradeLegacyPath;
      if (!reportRelPath || !fs.existsSync(reportPath)) {
        failures.push("ROUTING_GRADE_ARTIFACT_MISSING");
      } else {
        const routingGrade = JSON.parse(fs.readFileSync(reportPath, "utf8"));
        if (routingGrade?.strict !== true) {
          failures.push("ROUTING_GRADE_STRICT_FALSE");
        }
        const reportProfile = String(routingGrade?.profile || "")
          .trim()
          .toLowerCase();
        if (reportProfile !== profile) {
          failures.push(
            `ROUTING_GRADE_PROFILE_MISMATCH:${reportProfile || "missing"}!=${profile}`,
          );
        }
        const freshnessReasons = freshArtifactReasons(routingGrade?.generatedAt);
        if (freshnessReasons.length > 0) {
          failures.push(
            `ROUTING_GRADE_STALE:${freshnessReasons.join("|")}`,
          );
        }
        const expectedCommit = String(summary?.commitHash || "").trim();
        const observedCommit = String(routingGrade?.commitHash || "").trim();
        if (expectedCommit && observedCommit && expectedCommit !== observedCommit) {
          failures.push("ROUTING_GRADE_COMMIT_HASH_MISMATCH");
        }
        if (String(routingGrade?.verdict || "").trim().toLowerCase() !== "ready") {
          failures.push("ROUTING_GRADE_VERDICT_NOT_READY");
        }
      }
    } catch {
      failures.push("ROUTING_GRADE_POINTER_INVALID_JSON");
    }
  }
}

if (failures.length > 0) {
  console.error("[cert:summary] consistency check failed");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("[cert:summary] consistency check passed");
