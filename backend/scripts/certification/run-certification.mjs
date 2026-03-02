#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const strict = !process.argv.includes("--no-strict");
const autoRefresh =
  !process.argv.includes("--no-auto-refresh") &&
  !process.argv.includes("--no-refresh-missing");

const ROOT = process.cwd();
const certRoot = path.resolve(ROOT, "reports/cert");
const gatesDir = path.join(certRoot, "gates");
const summaryJsonPath = path.join(certRoot, "certification-summary.json");
const summaryMdPath = path.join(certRoot, "certification-summary.md");
const maxAgeHours = Number(process.env.CERT_GATE_MAX_AGE_HOURS || 24);
const maxAgeMs = Number.isFinite(maxAgeHours) && maxAgeHours > 0
  ? maxAgeHours * 60 * 60 * 1000
  : 24 * 60 * 60 * 1000;

const requiredGates = [
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
  "builder-payload-budget",
  "gateway-json-routing",
  "query-latency",
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

function currentCommitHash() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) return null;
  const hash = String(result.stdout || "").trim();
  return hash || null;
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

function runGateGenerator(scriptName) {
  const result = spawnSync("npm", ["run", "-s", scriptName], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
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
    if (runGateGenerator(generator)) {
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
      if (runGateGenerator(generator)) {
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
  lines.push(`- Auto refresh: ${summary.autoRefresh ? "yes" : "no"}`);
  lines.push(`- Commit hash: ${summary.commitHash || "unknown"}`);
  lines.push(`- Passed: ${summary.passed ? "yes" : "no"}`);
  lines.push(`- Passed gates: ${summary.passedGates}/${summary.totalGates}`);
  lines.push("");
  lines.push("| Gate | Passed | Fresh | Failures |");
  lines.push("|---|---:|---:|---:|");
  for (const gate of summary.gates) {
    const fresh = gate.freshness?.stale ? "no" : "yes";
    lines.push(
      `| ${gate.gateId} | ${gate.passed ? "yes" : "no"} | ${fresh} | ${Array.isArray(gate.failures) ? gate.failures.length : 0} |`,
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
  const commitHash = currentCommitHash();
  const gates = [];
  const failures = [];
  const regenerated = [];

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
      freshness: state.freshness,
    });
    if (!report.passed) {
      failures.push(`GATE_FAILED:${gateId}`);
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    strict,
    autoRefresh,
    commitHash,
    maxAgeHours,
    regenerated,
    passed: failures.length === 0,
    totalGates: requiredGates.length,
    passedGates: gates.filter((gate) => gate.passed).length,
    failedGates: requiredGates.length - gates.filter((gate) => gate.passed).length,
    failures,
    gates,
  };

  fs.writeFileSync(summaryJsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  fs.writeFileSync(summaryMdPath, `${toMarkdown(summary)}\n`, "utf8");

  console.log(`[certification] summary written: ${summaryJsonPath}`);
  console.log(`[certification] markdown written: ${summaryMdPath}`);
  console.log(
    `[certification] passed=${summary.passed} gates=${summary.passedGates}/${summary.totalGates}`,
  );
  if (!summary.passed) {
    for (const failure of failures) console.error(`[certification] ${failure}`);
    process.exit(1);
  }
}

main();
