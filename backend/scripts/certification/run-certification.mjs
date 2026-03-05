#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { resolveCommitHash } from "./git-commit.mjs";
import { packageCertificationEvidence } from "./package-evidence-bundle.mjs";
import {
  isCiRuntime,
  requireLiveRuntimeGraphEvidence,
  resolveCertificationProfileFromArgs,
  resolveLocalCertRunPolicy,
} from "./certification-policy.mjs";
import { resolveCertificationGateSet } from "./certification-gate-manifest.mjs";

const strict = !process.argv.includes("--no-strict");
const repairMode =
  process.argv.includes("--repair") ||
  process.argv.includes("--mode=repair");
const verifyOnly =
  process.argv.includes("--verify-only") ||
  process.argv.includes("--mode=verify");
const mode = repairMode ? "repair" : "verify";
const autoRefresh = repairMode
  ? true
  : !verifyOnly &&
    !process.argv.includes("--no-auto-refresh") &&
    !process.argv.includes("--no-refresh-missing");

const ROOT = process.cwd();
const certRoot = path.resolve(ROOT, "reports/cert");
const gatesDir = path.join(certRoot, "gates");
const summaryJsonPath = path.join(certRoot, "certification-summary.json");
const summaryMdPath = path.join(certRoot, "certification-summary.md");
const activeGateManifestPath = path.join(certRoot, "active-gates-manifest.json");
const localCertRunPath = path.join(certRoot, "local-cert-run.json");
const maxAgeHours = Number(process.env.CERT_GATE_MAX_AGE_HOURS || 24);
const maxAgeMs = Number.isFinite(maxAgeHours) && maxAgeHours > 0
  ? maxAgeHours * 60 * 60 * 1000
  : 24 * 60 * 60 * 1000;

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
  "collision-matrix-exhaustive": "test:cert:collision-matrix-exhaustive",
  "telemetry-completeness": "test:cert:telemetry-completeness",
  "rollout-safety": "test:cert:rollout-safety",
  "query-latency": "test:cert:query-latency",
  "turn-debug-packet": "test:cert:turn-debug-packet",
  "security-auth": "test:cert:security-auth",
  "observability-integrity": "test:cert:observability-integrity",
  "doc-identity-behavioral": "test:cert:doc-identity-behavioral",
  "retrieval-behavioral": "test:cert:retrieval-behavioral",
  "retrieval-golden-eval": "test:cert:retrieval-golden-eval",
  "retrieval-realistic-eval": "test:cert:retrieval-realistic-eval",
  "retrieval-openworld-eval": "test:cert:retrieval-openworld-eval",
  "frontend-retrieval-evidence": "test:cert:frontend-retrieval-evidence",
  "indexing-live-integration":
    "jest:path:src/tests/certification/indexing-live-integration.cert.test.ts",
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

function safeReadJson(filePath) {
  try {
    return readJson(filePath);
  } catch {
    return null;
  }
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
    CERT_MODE: repairMode ? "repair" : "verify",
    CERT_STRICT: strict ? "1" : "0",
    ...(commitHash ? { GIT_COMMIT_HASH: commitHash } : {}),
  };
  if (scriptName.startsWith("jest:path:")) {
    const testPath = scriptName.slice("jest:path:".length).trim();
    if (!testPath) return false;
    const args = [
      "run",
      "-s",
      "test",
      "--",
      "--runInBand",
      "--runTestsByPath",
      testPath,
    ];
    const jestResult = process.platform === "win32"
      ? spawnSync(
        "cmd.exe",
        [
          "/d",
          "/s",
          "/c",
          `npm.cmd run -s test -- --runInBand --runTestsByPath ${testPath}`,
        ],
        {
          cwd: ROOT,
          stdio: "inherit",
          env: childEnv,
        },
      )
      : spawnSync("npm", args, {
        cwd: ROOT,
        stdio: "inherit",
        env: childEnv,
      });
    if (jestResult.error) {
      console.error(
        `[certification] failed to execute inline jest gate '${scriptName}': ${jestResult.error.message}`,
      );
    }
    return jestResult.status === 0;
  }
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

function buildActiveGateManifest({
  generatedAt,
  commitHash,
  commitHashSource,
  profile,
  strict,
  requiredGateIds,
  optionalGateIds,
  gates,
}) {
  const requiredSet = new Set(requiredGateIds);
  const optionalSet = new Set(optionalGateIds);
  const artifactEntries = fs.existsSync(gatesDir)
    ? fs
      .readdirSync(gatesDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => {
        const gateId = entry.name.replace(/\.json$/i, "");
        const filePath = path.join(gatesDir, entry.name);
        const parsed = safeReadJson(filePath);
        const freshness = parsed
          ? analyzeFreshness(parsed, commitHash)
          : { stale: true, reasons: ["invalid_json"] };
        return {
          gateId,
          filePath,
          parseOk: Boolean(parsed),
          freshness,
          category: requiredSet.has(gateId)
            ? "required"
            : optionalSet.has(gateId)
              ? "optional"
              : "extra",
          passed: parsed?.passed === true,
          generatedAt: String(parsed?.generatedAt || "").trim() || null,
          commitHash: String(parsed?.meta?.commitHash || "").trim() || null,
        };
      })
    : [];

  const byGateId = new Map(artifactEntries.map((entry) => [entry.gateId, entry]));
  const requiredArtifacts = requiredGateIds.map((gateId) => {
    const entry = byGateId.get(gateId);
    if (entry) return entry;
    return {
      gateId,
      filePath: path.join(gatesDir, `${gateId}.json`),
      parseOk: false,
      freshness: { stale: true, reasons: ["missing_artifact"] },
      category: "required",
      passed: false,
      generatedAt: null,
      commitHash: null,
    };
  });
  const extraArtifacts = artifactEntries.filter((entry) => entry.category === "extra");
  const staleExtraArtifacts = extraArtifacts.filter((entry) => entry.freshness?.stale);

  const requiredSummary = Array.isArray(gates)
    ? gates.map((gate) => ({
      gateId: String(gate?.gateId || ""),
      passed: gate?.passed === true,
      freshness: gate?.freshness || null,
    }))
    : [];

  return {
    generatedAt,
    commitHash,
    commitHashSource,
    profile,
    strict,
    requiredGateIds: [...requiredGateIds],
    optionalGateIds: [...optionalGateIds],
    requiredGateSummary: requiredSummary,
    requiredGateArtifacts: requiredArtifacts,
    extraGateArtifacts: extraArtifacts,
    stats: {
      totalArtifacts: artifactEntries.length,
      requiredArtifacts: requiredArtifacts.length,
      optionalArtifacts: artifactEntries.filter((entry) => entry.category === "optional").length,
      extraArtifacts: extraArtifacts.length,
      staleExtraArtifacts: staleExtraArtifacts.length,
      missingRequiredArtifacts: requiredArtifacts.filter((entry) =>
        entry.freshness?.reasons?.includes("missing_artifact")
      ).length,
    },
  };
}

function toMarkdown(summary) {
  const lines = [];
  lines.push("# Certification Summary");
  lines.push("");
  lines.push(`- Generated: ${summary.generatedAt}`);
  lines.push(`- Strict mode: ${summary.strict ? "yes" : "no"}`);
  lines.push(`- Certification profile: ${summary.profile}`);
  lines.push(`- Mode: ${summary.mode || "verify"}`);
  lines.push(`- Verify only: ${summary.verifyOnly ? "yes" : "no"}`);
  lines.push(`- Auto refresh: ${summary.autoRefresh ? "yes" : "no"}`);
  lines.push(`- Commit hash: ${summary.commitHash || "unknown"}`);
  lines.push(`- Commit hash source: ${summary.commitHashSource || "unknown"}`);
  lines.push(`- Lineage run id: ${summary.lineage?.runId || "unknown"}`);
  lines.push(`- Lineage dataset id: ${summary.lineage?.datasetId || "unknown"}`);
  lines.push(`- Lineage profile: ${summary.lineage?.profile || "unknown"}`);
  lines.push(`- Passed: ${summary.passed ? "yes" : "no"}`);
  lines.push(`- Passed gates: ${summary.passedGates}/${summary.totalGates}`);
  if (summary.artifactInventory) {
    lines.push(
      `- Active gate artifact inventory: total=${summary.artifactInventory.totalGateArtifacts}, extra=${summary.artifactInventory.extraGateArtifacts}, staleExtra=${summary.artifactInventory.staleExtraGateArtifacts}`,
    );
  }
  if (summary.localCertRun?.present) {
    const localRunAgeHours = typeof summary.localCertRun.ageMs === "number"
      ? (summary.localCertRun.ageMs / (60 * 60 * 1000)).toFixed(2)
      : "n/a";
    lines.push(
      `- Local cert run: ${summary.localCertRun.success ? "pass" : "fail"} (${summary.localCertRun.recent ? "recent" : "stale"}, ageHours=${localRunAgeHours})`,
    );
  }
  if (summary.localHealth) {
    lines.push(
      `- Local cert health: ${summary.localHealth.status} (blocking=${summary.localHealth.blocking ? "yes" : "no"})`,
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
  const profile = resolveCertificationProfileFromArgs({ args: process.argv });
  process.env.CERT_PROFILE = profile;
  process.env.CERT_MODE = mode;
  process.env.CERT_STRICT = strict ? "true" : "false";
  const hasLatencyInput = hasQueryLatencyInput();
  const {
    requiredGateIds,
    optionalGateIds,
    skippedOptionalGates,
    queryLatencyPolicy,
  } = resolveCertificationGateSet({
    scope: "cert",
    strict,
    profile,
    hasQueryLatencyInput: hasLatencyInput,
    env: process.env,
  });
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

  const strictLatencyRequired = strict && queryLatencyPolicy.required;
  if (strictLatencyRequired && !hasLatencyInput) {
    failures.push("MISSING_QUERY_LATENCY_INPUT");
  }

  for (const gateId of requiredGateIds) {
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
      const embeddingRuntimeModeAllowed =
        report?.metrics?.embeddingRuntimeModeAllowed;
      const liveEvidenceRequired = requireLiveRuntimeGraphEvidence({
        profile,
        strict,
      });
      if (
        (liveEvidenceRequired && commandMode !== "live") ||
        (!liveEvidenceRequired && commandMode !== "live" && commandMode !== "cached")
      ) {
        failures.push(
          `DEGRADED_GATE_EVIDENCE:${gateId}:commandMode_${commandMode || "missing"}`,
        );
      }
      if (embeddingRuntimeModeAllowed !== true) {
        failures.push(
          `DEGRADED_GATE_EVIDENCE:${gateId}:embedding_runtime_mode_not_allowed`,
        );
      }
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
    verifyOnly,
  });
  const enforceLocalRunHealth = localRunPolicy.enforce;
  const localCertRun = analyzeLocalCertRun();
  const hasRecentLocalHealthSignal =
    localCertRun.present === true && localCertRun.recent === true;
  const localRunFailed =
    hasRecentLocalHealthSignal && localCertRun.success !== true;
  const localHealthBlocking =
    strict && enforceLocalRunHealth && !allowFailedLocalRun;
  const localHealthStatus = !hasRecentLocalHealthSignal
    ? "unknown"
    : localRunFailed && localHealthBlocking
      ? "fail_blocking"
      : localRunFailed
        ? "fail_non_blocking"
        : "pass";
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

  const activeGateManifest = buildActiveGateManifest({
    generatedAt,
    commitHash,
    commitHashSource: commitMetadata.source,
    profile,
    strict,
    requiredGateIds,
    optionalGateIds,
    gates,
  });

  const summary = {
    generatedAt,
    strict,
    profile,
    mode,
    verifyOnly,
    autoRefresh,
    commitHash,
    commitHashSource: commitMetadata.source,
    lineage,
    maxAgeHours,
    regenerated,
    policy: {
      queryLatency: queryLatencyPolicy,
      localCertRun: localRunPolicy,
      runtimeGraph: {
        requireLiveMode: requireLiveRuntimeGraphEvidence({ profile, strict }),
      },
    },
    optionalGates: optionalGateIds,
    skippedOptionalGates,
    artifactInventory: {
      manifestPath: path.relative(ROOT, activeGateManifestPath).replace(/\\/g, "/"),
      totalGateArtifacts: activeGateManifest.stats.totalArtifacts,
      extraGateArtifacts: activeGateManifest.stats.extraArtifacts,
      staleExtraGateArtifacts: activeGateManifest.stats.staleExtraArtifacts,
      missingRequiredArtifacts: activeGateManifest.stats.missingRequiredArtifacts,
    },
    localCertRun,
    localHealth: {
      status: localHealthStatus,
      hasRecentSignal: hasRecentLocalHealthSignal,
      blocking: localHealthBlocking,
      failed: localRunFailed,
      policySource: localRunPolicy.source,
    },
    passed: failures.length === 0,
    totalGates: requiredGateIds.length,
    passedGates: gates.filter((gate) => gate.passed).length,
    failedGates: requiredGateIds.length - gates.filter((gate) => gate.passed).length,
    failures,
    gates,
  };

  const tmpJsonPath = `${summaryJsonPath}.tmp`;
  const tmpMdPath = `${summaryMdPath}.tmp`;
  const tmpManifestPath = `${activeGateManifestPath}.tmp`;
  fs.writeFileSync(tmpJsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  fs.writeFileSync(tmpMdPath, `${toMarkdown(summary)}\n`, "utf8");
  fs.writeFileSync(
    tmpManifestPath,
    `${JSON.stringify(activeGateManifest, null, 2)}\n`,
    "utf8",
  );
  fs.renameSync(tmpJsonPath, summaryJsonPath);
  fs.renameSync(tmpMdPath, summaryMdPath);
  fs.renameSync(tmpManifestPath, activeGateManifestPath);
  const evidenceMetadata = verifyOnly
    ? null
    : packageCertificationEvidence(ROOT);

  console.log(`[certification] summary written: ${summaryJsonPath}`);
  console.log(`[certification] markdown written: ${summaryMdPath}`);
  console.log(`[certification] active gate manifest: ${activeGateManifestPath}`);
  if (evidenceMetadata?.bundleDir) {
    console.log(
      `[certification] evidence bundle: ${evidenceMetadata.bundleDir}`,
    );
  } else {
    console.log("[certification] evidence bundle: skipped (verify-only mode)");
  }
  console.log(
    `[certification] passed=${summary.passed} gates=${summary.passedGates}/${summary.totalGates}`,
  );
  if (!summary.passed) {
    for (const failure of failures) console.error(`[certification] ${failure}`);
    process.exit(1);
  }
}

main();
