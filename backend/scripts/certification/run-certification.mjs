#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const certRoot = path.resolve(ROOT, "reports/cert");
const gatesDir = path.join(certRoot, "gates");
const summaryJsonPath = path.join(certRoot, "certification-summary.json");
const summaryMdPath = path.join(certRoot, "certification-summary.md");

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
  "turn-debug-packet",
  "security-auth",
  "observability-integrity",
  "retrieval-behavioral",
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function toMarkdown(summary) {
  const lines = [];
  lines.push("# Certification Summary");
  lines.push("");
  lines.push(`- Generated: ${summary.generatedAt}`);
  lines.push(`- Passed: ${summary.passed ? "yes" : "no"}`);
  lines.push(`- Passed gates: ${summary.passedGates}/${summary.totalGates}`);
  lines.push("");
  lines.push("| Gate | Passed | Failures |");
  lines.push("|---|---:|---:|");
  for (const gate of summary.gates) {
    lines.push(
      `| ${gate.gateId} | ${gate.passed ? "yes" : "no"} | ${Array.isArray(gate.failures) ? gate.failures.length : 0} |`,
    );
  }
  lines.push("");
  for (const gate of summary.gates) {
    lines.push(`## ${gate.gateId}`);
    lines.push(`- Passed: ${gate.passed ? "yes" : "no"}`);
    lines.push(`- Failures: ${(gate.failures || []).join(", ") || "none"}`);
    lines.push(`- Metrics: \`${JSON.stringify(gate.metrics || {})}\``);
    lines.push("");
  }
  return lines.join("\n");
}

function main() {
  fs.mkdirSync(certRoot, { recursive: true });
  const gates = [];
  const failures = [];

  for (const gateId of requiredGates) {
    const gatePath = path.join(gatesDir, `${gateId}.json`);
    if (!fs.existsSync(gatePath)) {
      failures.push(`MISSING_GATE_REPORT:${gateId}`);
      continue;
    }
    const report = readJson(gatePath);
    gates.push(report);
    if (!report.passed) {
      failures.push(`GATE_FAILED:${gateId}`);
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
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
