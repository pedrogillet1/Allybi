#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { resolveCommitHash } from "./git-commit.mjs";
import { packageCertificationEvidence } from "./package-evidence-bundle.mjs";

const strict = !process.argv.includes("--no-strict");
const autoRefresh =
  !process.argv.includes("--no-auto-refresh") &&
  !process.argv.includes("--no-refresh-missing");

const ROOT = process.cwd();
const certRoot = path.resolve(ROOT, "reports/cert");
const gatesDir = path.join(certRoot, "gates");
const summaryJsonPath = path.join(certRoot, "certification-summary.json");
const summaryMdPath = path.join(certRoot, "certification-summary.md");
const localCertRunPath = path.join(certRoot, "local-cert-run.json");
const maxAgeHours = Number(process.env.CERT_GATE_MAX_AGE_HOURS || 24);
const maxAgeMs = Number.isFinite(maxAgeHours) && maxAgeHours > 0
  ? maxAgeHours * 60 * 60 * 1000
  : 24 * 60 * 60 * 1000;

function resolveCertificationProfile() {
  const raw = String(process.env.CERT_PROFILE || "").trim().toLowerCase();
  if (raw === "ci" || raw === "release" || raw === "local") return raw;
  return "local";
}

function requireLiveRuntimeGraphEvidence() {
  const override = String(process.env.CERT_REQUIRE_RUNTIME_GRAPH_LIVE || "")
    .trim()
    .toLowerCase();
  if (override === "1" || override === "true") return true;
  if (override === "0" || override === "false") return false;
  const ciFlags = [
    process.env.CI,
    process.env.GITHUB_ACTIONS,
    process.env.BUILD_BUILDID,
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  return ciFlags.some((value) => value === "1" || value === "true");
}

const baseRequiredGates = [
  "wrong-doc",
  "truncation",
  "persistence-restart",
  "editing-roundtrip",
  "editing-capabilities",
  "editing-eval-suite",
  "editing-slo",
  "runtime-wiring",
  "enforcer-failclosed",
  "evidence-fidelity",
  "provenance-strictness",
  "prompt-mode-coverage",
  "composition-routing",
  "composition-fallback-order",
  "composition-pinned-model-resolution",
  "composition-telemetry-integrity",
  "composition-analytical-structure",
  "builder-payload-budget",
  "gateway-json-routing",
  "turn-debug-packet",
  "security-auth",
  "observability-integrity",
  "retrieval-behavioral",
];

const gateGenerators = {
  "wrong-doc": "test:cert:wrong-doc",
  "truncation": "test:cert:truncation",
  "persistence-restart": "test:cert:persistence-restart",
  "editing-roundtrip": "test:cert:editing-roundtrip",
  "editing-capabilities": "test:cert:editing-capabilities",
  "editing-eval-suite": "test:cert:editing-eval",
  "editing-slo": "test:cert:editing-slo",
  "runtime-wiring": "test:cert:wiring",
  "enforcer-failclosed": "test:cert:enforcer-failclosed",
  "evidence-fidelity": "test:cert:evidence-fidelity",
  "provenance-strictness": "test:cert:provenance-strictness",
  "prompt-mode-coverage": "test:cert:prompt-mode-coverage",
  "composition-routing": "test:cert:composition",
  "composition-fallback-order": "test:cert:composition",
  "composition-pinned-model-resolution": "test:cert:composition",
  "composition-telemetry-integrity": "test:cert:composition",
  "composition-analytical-structure": "test:cert:composition",
  "builder-payload-budget": "test:cert:builder-payload-budget",
  "gateway-json-routing": "test:cert:gateway-json-routing",
  "query-latency": "test:cert:query-latency",
  "turn-debug-packet": "test:cert:turn-debug-packet",
  "security-auth": "test:cert:security-auth",
  "observability-integrity": "test:cert:observability-integrity",
  "retrieval-behavioral": "test:cert:retrieval-behavioral",
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function analyzeLocalCertRun() {
  const out = {
    present: false,
    recent: false,
    success: null,
    startTimeMs: null,
    endTimeMs: null,
    ageMs: null,
    reasons: [],
    metrics: {},
  };
  if (!fs.existsSync(localCertRunPath)) return out;

  out.present = true;
  try {
    const report = readJson(localCertRunPath);
    const endTimeMs = Number(report?.testResults?.endTime || report?.endTime || 0);
    const startTimeMs = Number(report?.startTime || 0);
    const bestTimestamp = Number.isFinite(endTimeMs) && endTimeMs > 0
      ? endTimeMs
      : Number.isFinite(startTimeMs) && startTimeMs > 0
        ? startTimeMs
        : null;
    const ageMs = bestTimestamp == null ? null : Date.now() - bestTimestamp;
    const success = report?.success === true;
    out.success = success;
    out.startTimeMs = Number.isFinite(startTimeMs) && startTimeMs > 0
      ? startTimeMs
      : null;
    out.endTimeMs = Number.isFinite(endTimeMs) && endTimeMs > 0 ? endTimeMs : null;
    out.ageMs = ageMs;
    out.recent = typeof ageMs === "number" && ageMs >= 0 && ageMs <= maxAgeMs;
    out.metrics = {
      numFailedTestSuites: Number(report?.numFailedTestSuites || 0),
      numRuntimeErrorTestSuites: Number(report?.numRuntimeErrorTestSuites || 0),
      numFailedTests: Number(report?.numFailedTests || 0),
      numTotalTestSuites: Number(report?.numTotalTestSuites || 0),
      numTotalTests: Number(report?.numTotalTests || 0),
    };
    if (bestTimestamp == null) out.reasons.push("missing_run_timestamp");
  } catch {
    out.reasons.push("invalid_local_cert_run_json");
  }
  return out;
}

function hasQueryLatencyInput() {
  const reportsRoots = [
    path.resolve(ROOT, "../frontend/e2e/reports"),
    path.resolve(ROOT, "frontend/e2e/reports"),
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
        if (archivePerQueryPath && fs.existsSync(archivePerQueryPath)) {
          return true;
        }
      } catch {
        // ignore malformed lineage; fallback to archive probing below
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

function resolvePerQueryReportPath() {
  const reportsRoots = [
    path.resolve(ROOT, "../frontend/e2e/reports"),
    path.resolve(ROOT, "frontend/e2e/reports"),
  ];
  for (const reportsRoot of reportsRoots) {
    const latestPath = path.join(reportsRoot, "latest", "per_query.json");
    if (fs.existsSync(latestPath)) return latestPath;
  }
  return null;
}

function resolveGateSet() {
  const requiredGates = [...baseRequiredGates];
  const optionalGates = ["query-latency"];
  const skippedOptionalGates = [];
  const forceQueryLatency =
    String(process.env.CERT_REQUIRE_QUERY_LATENCY || "").trim() === "1" ||
    String(process.env.CERT_REQUIRE_QUERY_LATENCY || "")
      .trim()
      .toLowerCase() === "true";
  const requiresStrictQueryLatency = strict;

  if (forceQueryLatency || requiresStrictQueryLatency || hasQueryLatencyInput()) {
    requiredGates.push("query-latency");
  } else {
    skippedOptionalGates.push({
      gateId: "query-latency",
      criticality: "optional",
      reason: "missing_per_query_report",
    });
  }

  return { requiredGates, optionalGates, skippedOptionalGates };
}

function currentCommitMetadata() {
  return resolveCommitHash(ROOT);
}

function getGate(gateId) {
  const gatePath = path.join(gatesDir, `${gateId}.json`);
  if (!fs.existsSync(gatePath)) {
    return { gateId, missing: true, gatePath };
  }
  return { ...readJson(gatePath), gateId, missing: false, gatePath };
}

function analyzeFreshness(gate, commitHash) {
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

  return { stale: reasons.length > 0, reasons };
}

function runGateGenerator(scriptName, commitHash) {
  const childEnv = {
    ...process.env,
    ...(commitHash ? { GIT_COMMIT_HASH: commitHash } : {}),
  };
  const result = process.platform === "win32"
    ? spawnSync("cmd.exe", ["/d", "/s", "/c", `npm.cmd run -s ${scriptName}`], {
      cwd: ROOT,
      stdio: "inherit",
      env: childEnv,
    })
    : spawnSync("npm", ["run", "-s", scriptName], {
      cwd: ROOT,
      stdio: "inherit",
      env: childEnv,
    });
  if (result.error) {
    console.error(
      `[certification] failed to execute '${scriptName}': ${result.error.message}`,
    );
  }
  return result.status === 0;
}

function ensureGate(gateId, commitHash, regenerated) {
  const generator = gateGenerators[gateId] || null;
  let gate = getGate(gateId);
  let refreshed = false;

  if (gate.missing && autoRefresh && generator) {
    console.log(
      `[certification] gate '${gateId}' missing; running: npm run ${generator}`,
    );
    if (runGateGenerator(generator, commitHash)) {
      gate = getGate(gateId);
      refreshed = true;
    }
  }

  if (!gate.missing) {
    const freshness = analyzeFreshness(gate, commitHash);
    if (freshness.stale && autoRefresh && generator && !refreshed) {
      console.log(
        `[certification] gate '${gateId}' stale (${freshness.reasons.join(", ")}); running: npm run ${generator}`,
      );
      if (runGateGenerator(generator, commitHash)) {
        gate = getGate(gateId);
        refreshed = true;
      }
    }
  }

  const finalFreshness = gate.missing
    ? { stale: false, reasons: [] }
    : analyzeFreshness(gate, commitHash);
  if (refreshed) regenerated.push(gateId);
  return { gate, freshness: finalFreshness };
}

function toMarkdown(summary) {
  const lines = [];
  lines.push("# Certification Summary");
  lines.push("");
  lines.push(`- Generated: ${summary.generatedAt}`);
  lines.push(`- Strict mode: ${summary.strict ? "yes" : "no"}`);
  lines.push(`- Certification profile: ${summary.profile}`);
  lines.push(`- Auto refresh: ${summary.autoRefresh ? "yes" : "no"}`);
  lines.push(`- Commit hash: ${summary.commitHash || "unknown"}`);
  lines.push(`- Commit hash source: ${summary.commitHashSource || "unknown"}`);
  lines.push(`- Lineage run id: ${summary.lineage?.runId || "unknown"}`);
  lines.push(`- Lineage dataset id: ${summary.lineage?.datasetId || "unknown"}`);
  lines.push(`- Lineage profile: ${summary.lineage?.profile || "unknown"}`);
  lines.push(`- Passed: ${summary.passed ? "yes" : "no"}`);
  lines.push(`- Passed gates: ${summary.passedGates}/${summary.totalGates}`);
  if (summary.localCertRun?.present) {
    const localRunAgeHours = typeof summary.localCertRun.ageMs === "number"
      ? (summary.localCertRun.ageMs / (60 * 60 * 1000)).toFixed(2)
      : "n/a";
    lines.push(
      `- Local cert run: ${summary.localCertRun.success ? "pass" : "fail"} (${summary.localCertRun.recent ? "recent" : "stale"}, ageHours=${localRunAgeHours})`,
    );
  }
  if (Array.isArray(summary.skippedOptionalGates)) {
    for (const skipped of summary.skippedOptionalGates) {
      lines.push(
        `- Optional gate skipped: ${skipped.gateId} (${skipped.reason})`,
      );
    }
  }
  lines.push("");
  lines.push("| Gate | Criticality | Passed | Fresh | Failures |");
  lines.push("|---|---|---:|---:|---:|");
  for (const gate of summary.gates) {
    const fresh = gate.freshness?.stale ? "no" : "yes";
    lines.push(
      `| ${gate.gateId} | ${gate.criticality || "required"} | ${gate.passed ? "yes" : "no"} | ${fresh} | ${Array.isArray(gate.failures) ? gate.failures.length : 0} |`,
    );
  }
  lines.push("");
  for (const gate of summary.gates) {
    lines.push(`## ${gate.gateId}`);
    lines.push(`- Passed: ${gate.passed ? "yes" : "no"}`);
    lines.push(
      `- Freshness: ${gate.freshness?.stale ? `stale (${(gate.freshness.reasons || []).join(", ")})` : "fresh"}`,
    );
    lines.push(`- Failures: ${(gate.failures || []).join(", ") || "none"}`);
    lines.push(`- Metrics: \`${JSON.stringify(gate.metrics || {})}\``);
    lines.push("");
  }
  return lines.join("\n");
}

function main() {
  fs.mkdirSync(certRoot, { recursive: true });
  const commitMetadata = currentCommitMetadata();
  const commitHash = commitMetadata.commitHash;
  const profile = resolveCertificationProfile();
  const { requiredGates, optionalGates, skippedOptionalGates } = resolveGateSet();
  const generatedAt = new Date().toISOString();
  const reportPath = resolvePerQueryReportPath();
  const lineage = {
    runId: String(
      process.env.CERT_RUN_ID || `cert_${generatedAt.replace(/[:.]/g, "-")}`,
    ).trim(),
    datasetId: String(
      process.env.CERT_DATASET_ID ||
        (reportPath
          ? `per_query:${path.relative(ROOT, reportPath).replace(/\\/g, "/")}`
          : "none"),
    ).trim(),
    profile,
  };
  const gates = [];
  const failures = [];
  const regenerated = [];

  const hasLatencyInput = hasQueryLatencyInput();
  const strictLatencyRequired = strict;
  if (strictLatencyRequired && !hasLatencyInput) {
    failures.push("MISSING_QUERY_LATENCY_INPUT");
  }

  for (const gateId of requiredGates) {
    const state = ensureGate(gateId, commitHash, regenerated);
    const report = state.gate;
    if (report.missing) {
      failures.push(`MISSING_GATE_REPORT:${gateId}`);
      continue;
    }
    if (state.freshness.stale) {
      failures.push(
        `STALE_GATE_REPORT:${gateId}:${state.freshness.reasons.join("|")}`,
      );
    }
    gates.push({
      ...report,
      criticality: "required",
      freshness: state.freshness,
    });
    if (!report.passed) {
      failures.push(`GATE_FAILED:${gateId}`);
    }
    if (strict && gateId === "runtime-wiring") {
      const commandMode = String(report?.metrics?.commandMode || "").trim();
      if (
        (requireLiveRuntimeGraphEvidence() && commandMode !== "live") ||
        (!requireLiveRuntimeGraphEvidence() &&
          commandMode !== "live" &&
          commandMode !== "cached")
      ) {
        failures.push(
          `DEGRADED_GATE_EVIDENCE:${gateId}:commandMode_${commandMode || "missing"}`,
        );
      }
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
    localRunHealthOverride === "true";
  const localCertRun = analyzeLocalCertRun();
  if (
    strict &&
    enforceLocalRunHealth &&
    localCertRun.present &&
    localCertRun.recent &&
    !allowFailedLocalRun
  ) {
    if (localCertRun.success !== true) {
      failures.push("RECENT_LOCAL_CERT_RUN_FAILED");
    }
  }

  const summary = {
    generatedAt,
    strict,
    profile,
    autoRefresh,
    commitHash,
    commitHashSource: commitMetadata.source,
    lineage,
    maxAgeHours,
    regenerated,
    optionalGates,
    skippedOptionalGates,
    localCertRun,
    passed: failures.length === 0,
    totalGates: requiredGates.length,
    passedGates: gates.filter((gate) => gate.passed).length,
    failedGates: requiredGates.length - gates.filter((gate) => gate.passed).length,
    failures,
    gates,
  };

  const tmpJsonPath = `${summaryJsonPath}.tmp`;
  const tmpMdPath = `${summaryMdPath}.tmp`;
  fs.writeFileSync(tmpJsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  fs.writeFileSync(tmpMdPath, `${toMarkdown(summary)}\n`, "utf8");
  fs.renameSync(tmpJsonPath, summaryJsonPath);
  fs.renameSync(tmpMdPath, summaryMdPath);
  const evidenceMetadata = packageCertificationEvidence(ROOT);

  console.log(`[certification] summary written: ${summaryJsonPath}`);
  console.log(`[certification] markdown written: ${summaryMdPath}`);
  console.log(
    `[certification] evidence bundle: ${evidenceMetadata.bundleDir}`,
  );
  console.log(
    `[certification] passed=${summary.passed} gates=${summary.passedGates}/${summary.totalGates}`,
  );
  if (!summary.passed) {
    for (const failure of failures) console.error(`[certification] ${failure}`);
    process.exit(1);
  }
}

main();
