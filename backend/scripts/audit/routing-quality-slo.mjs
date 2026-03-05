#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";

const strict = process.argv.includes("--strict");
const ROOT = process.cwd();
const gatesDir = path.resolve(ROOT, "reports/cert/gates");
const outPath = path.resolve(ROOT, "reports/cert/routing-quality-slo.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getGate(gateId) {
  const filePath = path.join(gatesDir, `${gateId}.json`);
  if (!fs.existsSync(filePath)) {
    return { gateId, ok: false, missing: true, filePath, report: null };
  }
  try {
    return {
      gateId,
      ok: true,
      missing: false,
      filePath,
      report: readJson(filePath),
    };
  } catch (error) {
    return {
      gateId,
      ok: false,
      missing: false,
      filePath,
      report: null,
      error: String(error?.message || error),
    };
  }
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

const failures = [];
const checks = [];

const routingBehavioral = getGate("routing-behavioral");
if (!routingBehavioral.ok || !routingBehavioral.report) {
  failures.push("routing-behavioral:missing_gate_report");
} else {
  const passed = routingBehavioral.report.passed === true;
  checks.push({
    gateId: "routing-behavioral",
    passed,
    metrics: routingBehavioral.report.metrics || {},
  });
  if (!passed) failures.push("routing-behavioral:gate_failed");
}

const followupCoverage = getGate("followup-source-coverage");
if (!followupCoverage.ok || !followupCoverage.report) {
  failures.push("followup-source-coverage:missing_gate_report");
} else {
  const coveredSourceCount = Number(
    followupCoverage.report.metrics?.coveredSourceCount || 0,
  );
  const passed =
    followupCoverage.report.passed === true && coveredSourceCount >= 4;
  checks.push({
    gateId: "followup-source-coverage",
    passed,
    metrics: {
      coveredSourceCount,
      coveredSources: String(
        followupCoverage.report.metrics?.coveredSources || "",
      ),
    },
  });
  if (coveredSourceCount < 4) {
    failures.push("followup-source-coverage:covered_sources_below_4");
  }
  if (followupCoverage.report.passed !== true) {
    failures.push("followup-source-coverage:gate_failed");
  }
}

const precedenceParity = getGate("routing-precedence-parity");
if (!precedenceParity.ok || !precedenceParity.report) {
  failures.push("routing-precedence-parity:missing_gate_report");
} else {
  const passed = precedenceParity.report.passed === true;
  checks.push({
    gateId: "routing-precedence-parity",
    passed,
    metrics: precedenceParity.report.metrics || {},
  });
  if (!passed) failures.push("routing-precedence-parity:gate_failed");
}

const runtimeWiring = getGate("runtime-wiring");
if (!runtimeWiring.ok || !runtimeWiring.report) {
  failures.push("runtime-wiring:missing_gate_report");
} else {
  const commandMode = String(runtimeWiring.report.metrics?.commandMode || "").trim();
  const needsLive = requireLiveRuntimeGraphEvidence();
  const validMode =
    commandMode === "live" || (!needsLive && commandMode === "cached");
  checks.push({
    gateId: "runtime-wiring",
    passed: runtimeWiring.report.passed === true && validMode,
    metrics: {
      commandMode,
      requireLiveMode: needsLive,
    },
  });
  if (!validMode) {
    failures.push(
      needsLive
        ? "runtime-wiring:command_mode_not_live"
        : "runtime-wiring:command_mode_invalid",
    );
  }
}

const summary = {
  generatedAt: new Date().toISOString(),
  strict,
  passed: failures.length === 0,
  checks,
  failures,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

console.log(
  `[routing-quality-slo] passed=${summary.passed} checks=${checks.length} failures=${failures.length}`,
);
console.log(`[routing-quality-slo] report=${outPath}`);

if (strict && failures.length > 0) {
  for (const failure of failures) console.error(`[routing-quality-slo] ${failure}`);
  process.exit(1);
}
