#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { resolveCommitHash } from "../certification/git-commit.mjs";
import { resolveCertificationProfileFromArgs } from "../certification/certification-policy.mjs";

const strict = process.argv.includes("--strict");
const ROOT = process.cwd();
const CERT_DIR = path.resolve(ROOT, "reports/cert");
const GATES_DIR = path.join(CERT_DIR, "gates");
const SLO_PATH = path.join(CERT_DIR, "routing-quality-slo.json");
const OUT_ARTIFACTS_DIR = path.join(CERT_DIR, "routing-grade-artifacts");
const OUT_JSON_PATH = path.join(CERT_DIR, "routing-grade.json");
const OUT_MD_PATH = path.join(CERT_DIR, "routing-grade.md");
const maxAgeHours = Number(process.env.ROUTING_GRADE_MAX_AGE_HOURS || 24);
const maxAgeMs = Number.isFinite(maxAgeHours) && maxAgeHours > 0
  ? maxAgeHours * 60 * 60 * 1000
  : 24 * 60 * 60 * 1000;

const GATE_WEIGHTS = Object.freeze({
  "routing-behavioral": 14,
  "followup-source-coverage": 14,
  "followup-overlay-integrity": 8,
  "routing-precedence-parity": 10,
  "runtime-wiring": 12,
  "collision-matrix-exhaustive": 10,
  "collision-cross-family-tiebreak": 8,
  "routing-determinism": 8,
  "routing-determinism-runtime-e2e": 8,
  "scope-integrity": 10,
  "scope-boundary-locks": 8,
  "slot-contracts-wiring": 7,
  "slot-extraction-e2e": 8,
  "disambiguation-e2e": 7,
  "intent-precision": 10,
  "intent-family-firstclass": 10,
  "routing-family-alias-consistency": 8,
  "routing-integration-intents-parity": 8,
  "nav-intents-locale-parity": 10,
  "telemetry-completeness": 6,
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function safeReadJson(filePath) {
  try {
    return readJson(filePath);
  } catch {
    return null;
  }
}

function gradeFromScore(score) {
  if (score >= 97) return "A+";
  if (score >= 93) return "A";
  if (score >= 90) return "A-";
  if (score >= 87) return "B+";
  if (score >= 83) return "B";
  if (score >= 80) return "B-";
  if (score >= 77) return "C+";
  if (score >= 73) return "C";
  if (score >= 70) return "C-";
  if (score >= 67) return "D+";
  if (score >= 63) return "D";
  return "F";
}

function analyzeFreshness(artifact, commitHash) {
  const reasons = [];
  const generatedAt = String(artifact?.generatedAt || "").trim();
  if (!generatedAt) {
    reasons.push("missing_generatedAt");
  } else {
    const generatedAtMs = Date.parse(generatedAt);
    if (!Number.isFinite(generatedAtMs)) {
      reasons.push("invalid_generatedAt");
    } else if (Date.now() - generatedAtMs > maxAgeMs) {
      reasons.push(`stale_age_gt_${maxAgeHours}h`);
    }
  }
  const artifactCommitHash = String(artifact?.meta?.commitHash || "").trim();
  if (commitHash && artifactCommitHash && artifactCommitHash !== commitHash) {
    reasons.push("commit_hash_mismatch");
  }
  return {
    stale: reasons.length > 0,
    reasons,
  };
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function ratio(actual, expected) {
  const numActual = Number(actual);
  const numExpected = Number(expected);
  if (!Number.isFinite(numExpected) || numExpected <= 0) return 0;
  if (!Number.isFinite(numActual) || numActual <= 0) return 0;
  return clamp01(numActual / numExpected);
}

function sanitizeSegment(value, fallback) {
  const raw = String(value || "").trim().toLowerCase();
  const cleaned = raw.replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}

function toRunId(generatedAt) {
  const stamp = String(generatedAt || "")
    .trim()
    .replace(/[:.]/g, "-")
    .replace(/[^0-9a-zA-Z_-]/g, "");
  return stamp || `run_${Date.now()}`;
}

function resolveOutputArtifactPaths({ profile, strictMode, generatedAt }) {
  const profileSegment = sanitizeSegment(profile, "local");
  const strictSegment = strictMode ? "strict" : "relaxed";
  const runId = toRunId(generatedAt);
  const runDir = path.join(OUT_ARTIFACTS_DIR, profileSegment, strictSegment, runId);
  return {
    runId,
    runDir,
    runJsonPath: path.join(runDir, "routing-grade.json"),
    runMdPath: path.join(runDir, "routing-grade.md"),
    latestPointerPath: path.join(
      OUT_ARTIFACTS_DIR,
      profileSegment,
      strictSegment,
      "latest.json",
    ),
  };
}

function inverseRatio(actual, maxAllowed) {
  const numActual = Number(actual);
  const numMax = Number(maxAllowed);
  if (!Number.isFinite(numMax) || numMax <= 0) return 0;
  if (!Number.isFinite(numActual)) return 0;
  if (numActual <= numMax) return 1;
  return clamp01(numMax / numActual);
}

function getGate(gateId) {
  const filePath = path.join(GATES_DIR, `${gateId}.json`);
  const report = safeReadJson(filePath);
  if (!report) return { gateId, filePath, exists: false, report: null };
  return { gateId, filePath, exists: true, report };
}

function scoreGate(gateId, gate) {
  const report = gate?.report || null;
  if (!report) return { gateId, score: 0, detail: "missing_gate_report" };

  if (gateId === "followup-source-coverage") {
    const covered = Number(report.metrics?.coveredSourceCount ?? 0);
    const expectedSources = Number(report.thresholds?.expectedSourceCount ?? 4);
    const precision = Number(report.metrics?.followupPrecision ?? 0);
    const recall = Number(report.metrics?.followupRecall ?? 0);
    const falsePositiveRate = Number(report.metrics?.followupFalsePositiveRate ?? 1);
    const caseCount = Number(report.metrics?.caseCount ?? 0);
    const minPrecision = Number(report.thresholds?.minFollowupPrecision ?? 0.9);
    const minRecall = Number(report.thresholds?.minFollowupRecall ?? 0.9);
    const maxFalsePositiveRate = Number(
      report.thresholds?.maxFollowupFalsePositiveRate ?? 0.15,
    );
    const minCaseCount = Number(report.thresholds?.minCaseCount ?? 14);
    const score =
      (report.passed === true ? 0.4 : 0) +
      ratio(covered, expectedSources) * 0.2 +
      ratio(precision, minPrecision) * 0.15 +
      ratio(recall, minRecall) * 0.15 +
      inverseRatio(falsePositiveRate, maxFalsePositiveRate) * 0.05 +
      ratio(caseCount, minCaseCount) * 0.05;
    return {
      gateId,
      score: Math.round(clamp01(score) * 10000) / 100,
      detail: "threshold_weighted",
    };
  }

  if (gateId === "followup-overlay-integrity") {
    const missingLocaleCount = Number(report.metrics?.missingLocaleCount ?? 99);
    const requiredLocaleCount = Number(report.thresholds?.requiredLocaleCount ?? 3);
    const validModeCount = Number(report.metrics?.validModeCount ?? 0);
    const expectedValidModeCount = Number(
      report.thresholds?.expectedValidModeCount ?? 2,
    );
    const invalidRegexCount = Number(report.metrics?.invalidRegexCount ?? 99);
    const localeComponent = clamp01(
      1 - missingLocaleCount / Math.max(requiredLocaleCount, 1),
    );
    const modeComponent = ratio(validModeCount, expectedValidModeCount);
    const regexComponent = invalidRegexCount === 0 ? 1 : 0;
    const score =
      (report.passed === true ? 0.5 : 0) +
      localeComponent * 0.25 +
      modeComponent * 0.15 +
      regexComponent * 0.1;
    return {
      gateId,
      score: Math.round(clamp01(score) * 10000) / 100,
      detail: "integrity_weighted",
    };
  }

  if (gateId === "runtime-wiring") {
    const commandMode = String(report.metrics?.commandMode || "").trim();
    const requireLiveMode = report.metrics?.requireLiveMode === true;
    const commandModeValid =
      commandMode === "live" || (!requireLiveMode && commandMode === "cached");
    const score =
      (report.passed === true ? 0.7 : 0) +
      (commandModeValid ? 0.3 : 0);
    return {
      gateId,
      score: Math.round(clamp01(score) * 10000) / 100,
      detail: "runtime_mode_weighted",
    };
  }

  return {
    gateId,
    score: report.passed === true ? 100 : 0,
    detail: report.passed === true ? "pass" : "gate_failed",
  };
}

function classifyFailure(failureCode) {
  const failure = String(failureCode || "").trim();
  if (!failure) {
    return { severity: "medium", deduction: 5 };
  }
  if (
    failure.startsWith("routing-behavioral:") ||
    failure.startsWith("runtime-wiring:")
  ) {
    return { severity: "high", deduction: 14 };
  }
  if (
    failure.startsWith("followup-source-coverage:") ||
    failure.startsWith("followup-overlay-integrity:")
  ) {
    return { severity: "high", deduction: 12 };
  }
  if (failure.startsWith("scope-integrity:")) {
    return { severity: "high", deduction: 13 };
  }
  if (failure.startsWith("scope-boundary-locks:")) {
    return { severity: "high", deduction: 12 };
  }
  if (failure.startsWith("collision-matrix-exhaustive:")) {
    return { severity: "high", deduction: 12 };
  }
  if (failure.startsWith("collision-cross-family-tiebreak:")) {
    return { severity: "high", deduction: 11 };
  }
  if (failure.startsWith("routing-determinism:")) {
    return { severity: "high", deduction: 12 };
  }
  if (failure.startsWith("routing-determinism-runtime-e2e:")) {
    return { severity: "high", deduction: 12 };
  }
  if (failure.startsWith("slot-contracts-wiring:")) {
    return { severity: "medium", deduction: 9 };
  }
  if (failure.startsWith("slot-extraction-e2e:")) {
    return { severity: "medium", deduction: 9 };
  }
  if (failure.startsWith("disambiguation-e2e:")) {
    return { severity: "medium", deduction: 8 };
  }
  if (failure.startsWith("intent-precision:")) {
    return { severity: "high", deduction: 12 };
  }
  if (failure.startsWith("intent-family-firstclass:")) {
    return { severity: "high", deduction: 12 };
  }
  if (failure.startsWith("routing-family-alias-consistency:")) {
    return { severity: "high", deduction: 11 };
  }
  if (failure.startsWith("routing-integration-intents-parity:")) {
    return { severity: "high", deduction: 11 };
  }
  if (failure.startsWith("nav-intents-locale-parity:")) {
    return { severity: "high", deduction: 12 };
  }
  if (failure.startsWith("telemetry-completeness:")) {
    return { severity: "medium", deduction: 8 };
  }
  if (failure.startsWith("routing-precedence-parity:")) {
    return { severity: "medium", deduction: 9 };
  }
  return { severity: "medium", deduction: 7 };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Routing Grade");
  lines.push("");
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Profile: ${report.profile}`);
  lines.push(`- Strict: ${report.strict ? "yes" : "no"}`);
  lines.push(`- Routing SLO passed: ${report.routingSloPassed ? "yes" : "no"}`);
  lines.push(`- Final score: **${report.finalScore}**`);
  lines.push(`- Final grade: **${report.finalGrade}**`);
  lines.push(`- Verdict: **${report.verdict}**`);
  lines.push("");
  lines.push("## Weighted Gates");
  lines.push("");
  lines.push("| Gate | Weight | Gate score | Weighted points |");
  lines.push("|---|---:|---:|---:|");
  for (const gate of report.gates) {
    lines.push(
      `| ${gate.gateId} | ${gate.weight} | ${gate.gateScore} | ${gate.weightedPoints} |`,
    );
  }
  lines.push("");
  lines.push("## Findings");
  lines.push("");
  if (report.findings.length === 0) {
    lines.push("- none");
  } else {
    for (const finding of report.findings) {
      lines.push(
        `- [${finding.severity}] ${finding.id} (-${finding.deduction}) ${finding.detail}`,
      );
    }
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function writeReportArtifacts(report) {
  const artifactPaths = resolveOutputArtifactPaths({
    profile: report.profile,
    strictMode: report.strict === true,
    generatedAt: report.generatedAt,
  });

  fs.mkdirSync(path.dirname(artifactPaths.latestPointerPath), { recursive: true });
  fs.mkdirSync(path.dirname(OUT_JSON_PATH), { recursive: true });
  fs.mkdirSync(artifactPaths.runDir, { recursive: true });

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  const markdown = renderMarkdown(report);

  // Keep immutable per-run artifacts for trustworthy lineage.
  fs.writeFileSync(artifactPaths.runJsonPath, serialized, "utf8");
  fs.writeFileSync(artifactPaths.runMdPath, markdown, "utf8");

  // Keep backwards-compatible latest files.
  fs.writeFileSync(OUT_JSON_PATH, serialized, "utf8");
  fs.writeFileSync(OUT_MD_PATH, markdown, "utf8");

  const latestPointer = {
    generatedAt: report.generatedAt,
    runId: artifactPaths.runId,
    profile: report.profile,
    strict: report.strict === true,
    commitHash: report.commitHash || null,
    jsonPath: path.relative(ROOT, artifactPaths.runJsonPath).replace(/\\/g, "/"),
    mdPath: path.relative(ROOT, artifactPaths.runMdPath).replace(/\\/g, "/"),
    legacyJsonPath: path.relative(ROOT, OUT_JSON_PATH).replace(/\\/g, "/"),
    legacyMdPath: path.relative(ROOT, OUT_MD_PATH).replace(/\\/g, "/"),
  };
  fs.writeFileSync(
    artifactPaths.latestPointerPath,
    `${JSON.stringify(latestPointer, null, 2)}\n`,
    "utf8",
  );

  return {
    ...artifactPaths,
    latestPointerPath: artifactPaths.latestPointerPath,
  };
}

function main() {
  const commitMetadata = resolveCommitHash(ROOT);
  const commitHash = commitMetadata.commitHash;
  const requestedProfile = resolveCertificationProfileFromArgs({ args: process.argv });
  const findings = [];
  const routingSlo = safeReadJson(SLO_PATH);

  if (!routingSlo) {
    const report = {
      generatedAt: new Date().toISOString(),
      strict,
      profile: requestedProfile || "unknown",
      commitHash,
      commitHashSource: commitMetadata.source,
      routingSloPassed: false,
      finalScore: 0,
      finalGrade: "F",
      verdict: "blocked",
      gates: [],
      findings: [
        {
          id: "routing_slo_missing",
          severity: "high",
          deduction: 100,
          detail: "Missing reports/cert/routing-quality-slo.json. Run audit:routing:slo first.",
          evidence: "reports/cert/routing-quality-slo.json",
        },
      ],
      rawFailures: [],
      artifacts: {
        routingQualitySlo: {
          path: SLO_PATH,
          exists: false,
          freshness: { stale: true, reasons: ["missing_artifact"] },
        },
      },
    };
    const written = writeReportArtifacts(report);
    console.log("[routing-grade] score=0 grade=F verdict=blocked findings=1");
    console.log(`[routing-grade] json=${written.runJsonPath}`);
    console.log(`[routing-grade] md=${written.runMdPath}`);
    console.log(`[routing-grade] latest=${written.latestPointerPath}`);
    if (strict) process.exit(1);
    return;
  }

  const routingSloFreshness = analyzeFreshness(routingSlo, commitHash);
  const observedProfile = String(
    routingSlo?.profile || process.env.CERT_PROFILE || requestedProfile || "local",
  )
    .trim()
    .toLowerCase();
  const expectedProfile = String(requestedProfile || observedProfile || "local")
    .trim()
    .toLowerCase();
  if (routingSloFreshness.stale) {
    findings.push({
      id: "routing_slo_artifact_stale",
      severity: "high",
      deduction: 12,
      detail: `Routing SLO artifact stale: ${routingSloFreshness.reasons.join("|")}`,
      evidence: "reports/cert/routing-quality-slo.json",
    });
  }

  if (strict && expectedProfile && observedProfile && expectedProfile !== observedProfile) {
    findings.push({
      id: "routing_slo_profile_mismatch",
      severity: "high",
      deduction: 14,
      detail: `Routing SLO profile mismatch: expected='${expectedProfile}' observed='${observedProfile}'`,
      evidence: "reports/cert/routing-quality-slo.json",
    });
  }

  const gates = [];
  let weightedScore = 0;
  let totalWeight = 0;
  for (const [gateId, weight] of Object.entries(GATE_WEIGHTS)) {
    const gate = getGate(gateId);
    const gateFreshness = gate.exists
      ? analyzeFreshness(gate.report, commitHash)
      : { stale: true, reasons: ["missing_artifact"] };
    const score = scoreGate(gateId, gate);
    const weightedPoints = Math.round((weight * score.score) * 100) / 10000;
    weightedScore += weightedPoints;
    totalWeight += weight;
    gates.push({
      gateId,
      weight,
      gateScore: score.score,
      weightedPoints,
      scoreDetail: score.detail,
      path: gate.filePath,
      exists: gate.exists,
      freshness: gateFreshness,
      reportPassed: gate.report?.passed === true,
    });
    if (!gate.exists) {
      findings.push({
        id: `${gateId}_missing`,
        severity: "high",
        deduction: 12,
        detail: `Missing gate report for ${gateId}`,
        evidence: path.relative(ROOT, gate.filePath).replace(/\\/g, "/"),
      });
    } else if (gateFreshness.stale) {
      findings.push({
        id: `${gateId}_stale`,
        severity: "medium",
        deduction: 6,
        detail: `${gateId} artifact stale: ${gateFreshness.reasons.join("|")}`,
        evidence: path.relative(ROOT, gate.filePath).replace(/\\/g, "/"),
      });
    }
  }

  const rawFailures = Array.isArray(routingSlo.failures)
    ? routingSlo.failures.map((failure) => String(failure || "").trim()).filter(Boolean)
    : [];
  const emittedFailureIds = new Set();
  for (const failure of rawFailures) {
    const failureId = `routing_issue:${failure}`;
    if (emittedFailureIds.has(failureId)) continue;
    emittedFailureIds.add(failureId);
    const classification = classifyFailure(failure);
    findings.push({
      id: failureId,
      severity: classification.severity,
      deduction: classification.deduction,
      detail: `Routing SLO failure: ${failure}`,
      evidence: "reports/cert/routing-quality-slo.json",
    });
  }
  const checkFailures = Array.isArray(routingSlo.checks)
    ? routingSlo.checks
        .filter((check) => check?.passed !== true)
        .map((check) => String(check?.gateId || "").trim())
        .filter(Boolean)
    : [];
  for (const gateId of checkFailures) {
    const syntheticFailure = `${gateId}:gate_failed`;
    if (rawFailures.includes(syntheticFailure)) continue;
    const failureId = `routing_check_failed:${gateId}`;
    if (emittedFailureIds.has(failureId)) continue;
    emittedFailureIds.add(failureId);
    const classification = classifyFailure(`${gateId}:gate_failed`);
    findings.push({
      id: failureId,
      severity: classification.severity,
      deduction: classification.deduction,
      detail: `Routing SLO check failed: ${gateId}`,
      evidence: "reports/cert/routing-quality-slo.json",
    });
  }

  const normalizedBaseScore = totalWeight > 0 ? (weightedScore / totalWeight) * 100 : 0;
  let finalScore = normalizedBaseScore;
  for (const finding of findings) {
    finalScore -= Number(finding.deduction || 0);
  }
  finalScore = Math.max(0, Math.round(finalScore * 100) / 100);
  const finalGrade = gradeFromScore(finalScore);
  const hasHighFindings = findings.some((finding) => finding.severity === "high");
  const verdict =
    routingSlo.passed === true && !hasHighFindings && finalScore >= 97
      ? "ready"
      : "needs_work";

  const report = {
    generatedAt: new Date().toISOString(),
    strict,
    profile: expectedProfile || "local",
    commitHash,
    commitHashSource: commitMetadata.source,
    routingSloPassed: routingSlo.passed === true,
    baseScore: Math.round(normalizedBaseScore * 100) / 100,
    finalScore,
    finalGrade,
    verdict,
    gates,
    findings,
    rawFailures,
    artifacts: {
      routingQualitySlo: {
        path: SLO_PATH,
        exists: true,
        freshness: routingSloFreshness,
        observedProfile,
      },
    },
  };
  const written = writeReportArtifacts(report);

  console.log(
    `[routing-grade] score=${report.finalScore} grade=${report.finalGrade} verdict=${report.verdict} findings=${report.findings.length}`,
  );
  console.log(`[routing-grade] json=${written.runJsonPath}`);
  console.log(`[routing-grade] md=${written.runMdPath}`);
  console.log(`[routing-grade] latest=${written.latestPointerPath}`);

  if (strict && (report.verdict !== "ready" || report.findings.length > 0)) {
    process.exit(1);
  }
}

main();
