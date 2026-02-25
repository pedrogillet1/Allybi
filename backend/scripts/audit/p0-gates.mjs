#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";

const strict =
  process.argv.includes("--strict") ||
  process.argv.includes("--mode=strict") ||
  (process.argv.includes("--mode") && process.argv.includes("strict"));

const ROOT = process.cwd();
const gatesDir = path.resolve(ROOT, "reports/cert/gates");
const outputPath = path.resolve(ROOT, "reports/cert/p0-gates-summary.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getGate(gateId) {
  const filePath = path.join(gatesDir, `${gateId}.json`);
  if (!fs.existsSync(filePath)) {
    return { gateId, missing: true };
  }
  return readJson(filePath);
}

function main() {
  const failures = [];
  const checks = [];

  const wrongDoc = getGate("wrong-doc");
  if (wrongDoc.missing) {
    failures.push("P0-4_GATE_MISSING_WRONG_DOC");
  } else {
    const wrongDocRate = Number(wrongDoc?.metrics?.wrongDocRate ?? 1);
    const emptyEvidenceRate = Number(wrongDoc?.metrics?.emptyEvidenceRate ?? 1);
    const multiDocsetCases = Number(wrongDoc?.metrics?.multiDocsetCases ?? 0);
    const multiDocsetWrongDocRate = Number(
      wrongDoc?.metrics?.multiDocsetWrongDocRate ?? 1,
    );
    checks.push({
      gateId: "wrong-doc",
      passed: wrongDoc?.passed === true,
      metrics: {
        wrongDocRate,
        emptyEvidenceRate,
        multiDocsetCases,
        multiDocsetWrongDocRate,
      },
    });
    if (wrongDocRate !== 0) failures.push("P0-4_WRONG_DOC_RATE_NON_ZERO");
    if (emptyEvidenceRate !== 0)
      failures.push("P0-4_EMPTY_EVIDENCE_RATE_NON_ZERO");
    if (strict && multiDocsetCases < 1) failures.push("P0-6_MULTI_DOCSET_NOT_TESTED");
    if (strict && multiDocsetWrongDocRate !== 0) {
      failures.push("P0-6_MULTI_DOCSET_WRONG_DOC_RATE_NON_ZERO");
    }
  }

  const enforcerFailClosed = getGate("enforcer-failclosed");
  if (enforcerFailClosed.missing) {
    failures.push("P0-7_GATE_MISSING_ENFORCER_FAIL_CLOSED");
  } else {
    const outputChanged = Boolean(enforcerFailClosed?.metrics?.outputChanged);
    const hasWarning = Boolean(enforcerFailClosed?.metrics?.hasWarning);
    const failureCode = String(enforcerFailClosed?.metrics?.failureCode || "");
    checks.push({
      gateId: "enforcer-failclosed",
      passed: enforcerFailClosed?.passed === true,
      metrics: { outputChanged, hasWarning, failureCode },
    });
    if (!outputChanged) failures.push("P0-7_OUTPUT_NOT_REPLACED");
    if (!hasWarning) failures.push("P0-7_FAIL_CLOSED_WARNING_MISSING");
    if (strict && failureCode !== "enforcer_runtime_error") {
      failures.push("P0-7_FAILURE_CODE_INVALID");
    }
  }

  const evidenceFidelity = getGate("evidence-fidelity");
  if (evidenceFidelity.missing) {
    failures.push("P0-5_GATE_MISSING_EVIDENCE_FIDELITY");
  } else {
    const missingMapBlocked = Boolean(
      evidenceFidelity?.metrics?.missingMapBlocked,
    );
    const validMapPasses = Boolean(evidenceFidelity?.metrics?.validMapPasses);
    checks.push({
      gateId: "evidence-fidelity",
      passed: evidenceFidelity?.passed === true,
      metrics: {
        missingMapBlocked,
        validMapPasses,
      },
    });
    if (!missingMapBlocked) failures.push("P0-5_MISSING_MAP_NOT_BLOCKED");
    if (!validMapPasses) failures.push("P0-5_VALID_MAP_REJECTED");
  }

  const securityAuth = getGate("security-auth");
  if (securityAuth.missing) {
    failures.push("P0-1_GATE_MISSING_SECURITY_AUTH");
  } else {
    const headerTrustPathPresent = Boolean(
      securityAuth?.metrics?.headerTrustPathPresent,
    );
    const missingTokenRejected = Boolean(
      securityAuth?.metrics?.missingTokenRejected,
    );
    checks.push({
      gateId: "security-auth",
      passed: securityAuth?.passed === true,
      metrics: { headerTrustPathPresent, missingTokenRejected },
    });
    if (headerTrustPathPresent) failures.push("P0-1_HEADER_TRUST_PATH_PRESENT");
    if (!missingTokenRejected) failures.push("P0-1_MISSING_TOKEN_NOT_REJECTED");
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    strict,
    passed: failures.length === 0,
    failures,
    checks,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log(`P0 Gates: ${summary.passed ? "PASS" : "FAIL"}`);
  for (const check of checks) {
    console.log(`- ${check.gateId}: ${check.passed ? "PASS" : "FAIL"}`);
  }
  if (!summary.passed) {
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }
}

main();
