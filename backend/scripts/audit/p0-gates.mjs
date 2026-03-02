#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const strict =
  process.argv.includes("--strict") ||
  process.argv.includes("--mode=strict") ||
  (process.argv.includes("--mode") && process.argv.includes("strict"));
const autoRefresh =
  !process.argv.includes("--no-auto-refresh") &&
  !process.argv.includes("--no-refresh-missing");

const ROOT = process.cwd();
const gatesDir = path.resolve(ROOT, "reports/cert/gates");
const outputPath = path.resolve(ROOT, "reports/cert/p0-gates-summary.json");
const maxAgeHours = Number(
  process.env.P0_GATE_MAX_AGE_HOURS || (strict ? 24 : 168),
);
const maxAgeMs = Number.isFinite(maxAgeHours) && maxAgeHours > 0
  ? maxAgeHours * 60 * 60 * 1000
  : 24 * 60 * 60 * 1000;

const GATE_GENERATORS = {
  "wrong-doc": "test:cert:wrong-doc",
  "enforcer-failclosed": "test:cert:enforcer-failclosed",
  "evidence-fidelity": "test:cert:evidence-fidelity",
  "security-auth": "test:cert:security-auth",
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getGate(gateId) {
  const filePath = path.join(gatesDir, `${gateId}.json`);
  if (!fs.existsSync(filePath)) {
    return { gateId, missing: true, filePath };
  }
  return { ...readJson(filePath), gateId, missing: false, filePath };
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

function analyzeFreshness(gate, commitHash) {
  const reasons = [];
  const generatedAt = String(gate?.generatedAt || "").trim();
  if (!generatedAt) {
    reasons.push("missing_generatedAt");
  } else {
    const ts = Date.parse(generatedAt);
    if (!Number.isFinite(ts)) {
      reasons.push("invalid_generatedAt");
    } else {
      const ageMs = Date.now() - ts;
      if (ageMs > maxAgeMs) {
        reasons.push(`stale_age_gt_${maxAgeHours}h`);
      }
    }
  }

  const gateCommit = String(gate?.meta?.commitHash || "").trim();
  if (strict && !gateCommit) {
    reasons.push("missing_commit_hash_metadata");
  } else if (gateCommit && commitHash && gateCommit !== commitHash) {
    reasons.push("commit_hash_mismatch");
  }

  return {
    stale: reasons.length > 0,
    reasons,
  };
}

function runScript(scriptName) {
  const result = spawnSync("npm", ["run", "-s", scriptName], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  return result.status === 0;
}

function ensureGate(gateId, commitHash, regenerated) {
  const generator = GATE_GENERATORS[gateId] || null;
  let gate = getGate(gateId);
  let refreshed = false;

  if (gate.missing) {
    if (autoRefresh && generator) {
      console.log(
        `[p0-gates] gate '${gateId}' missing; running: npm run ${generator}`,
      );
      const ok = runScript(generator);
      if (ok) {
        gate = getGate(gateId);
        refreshed = true;
      }
    }
  }

  if (!gate.missing) {
    const freshness = analyzeFreshness(gate, commitHash);
    if (freshness.stale && autoRefresh && generator && !refreshed) {
      console.log(
        `[p0-gates] gate '${gateId}' stale (${freshness.reasons.join(", ")}); running: npm run ${generator}`,
      );
      const ok = runScript(generator);
      if (ok) {
        gate = getGate(gateId);
        refreshed = true;
      }
    }
  }

  const finalFreshness = gate.missing
    ? { stale: false, reasons: [] }
    : analyzeFreshness(gate, commitHash);

  if (refreshed) regenerated.push(gateId);
  return {
    gate,
    generator,
    freshness: finalFreshness,
  };
}

function main() {
  const failures = [];
  const checks = [];
  const regenerated = [];
  const commitHash = currentCommitHash();

  const wrongDocState = ensureGate("wrong-doc", commitHash, regenerated);
  const wrongDoc = wrongDocState.gate;
  if (wrongDoc.missing) {
    failures.push("P0-4_GATE_MISSING_WRONG_DOC");
  } else {
    if (wrongDocState.freshness.stale) {
      failures.push(
        `P0-4_GATE_STALE_WRONG_DOC:${wrongDocState.freshness.reasons.join("|")}`,
      );
    }
    const totalCases = Number(wrongDoc?.metrics?.totalCases ?? 0);
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
        totalCases,
        wrongDocRate,
        emptyEvidenceRate,
        multiDocsetCases,
        multiDocsetWrongDocRate,
      },
      freshness: wrongDocState.freshness,
    });
    if (strict && totalCases < 100)
      failures.push("P0-6_WRONG_DOC_CERT_DEPTH_TOO_LOW");
    if (wrongDocRate !== 0) failures.push("P0-4_WRONG_DOC_RATE_NON_ZERO");
    if (emptyEvidenceRate !== 0)
      failures.push("P0-4_EMPTY_EVIDENCE_RATE_NON_ZERO");
    if (strict && multiDocsetCases < 30)
      failures.push("P0-6_MULTI_DOCSET_NOT_TESTED");
    if (strict && multiDocsetWrongDocRate !== 0) {
      failures.push("P0-6_MULTI_DOCSET_WRONG_DOC_RATE_NON_ZERO");
    }
  }

  const enforcerState = ensureGate(
    "enforcer-failclosed",
    commitHash,
    regenerated,
  );
  const enforcerFailClosed = enforcerState.gate;
  if (enforcerFailClosed.missing) {
    failures.push("P0-7_GATE_MISSING_ENFORCER_FAIL_CLOSED");
  } else {
    if (enforcerState.freshness.stale) {
      failures.push(
        `P0-7_GATE_STALE_ENFORCER_FAIL_CLOSED:${enforcerState.freshness.reasons.join("|")}`,
      );
    }
    const outputChanged = Boolean(enforcerFailClosed?.metrics?.outputChanged);
    const hasWarning = Boolean(enforcerFailClosed?.metrics?.hasWarning);
    const failureCode = String(enforcerFailClosed?.metrics?.failureCode || "");
    checks.push({
      gateId: "enforcer-failclosed",
      passed: enforcerFailClosed?.passed === true,
      metrics: { outputChanged, hasWarning, failureCode },
      freshness: enforcerState.freshness,
    });
    if (!outputChanged) failures.push("P0-7_OUTPUT_NOT_REPLACED");
    if (!hasWarning) failures.push("P0-7_FAIL_CLOSED_WARNING_MISSING");
    if (strict && failureCode !== "enforcer_runtime_error") {
      failures.push("P0-7_FAILURE_CODE_INVALID");
    }
  }

  const evidenceState = ensureGate("evidence-fidelity", commitHash, regenerated);
  const evidenceFidelity = evidenceState.gate;
  if (evidenceFidelity.missing) {
    failures.push("P0-5_GATE_MISSING_EVIDENCE_FIDELITY");
  } else {
    if (evidenceState.freshness.stale) {
      failures.push(
        `P0-5_GATE_STALE_EVIDENCE_FIDELITY:${evidenceState.freshness.reasons.join("|")}`,
      );
    }
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
      freshness: evidenceState.freshness,
    });
    if (!missingMapBlocked) failures.push("P0-5_MISSING_MAP_NOT_BLOCKED");
    if (!validMapPasses) failures.push("P0-5_VALID_MAP_REJECTED");
  }

  const securityState = ensureGate("security-auth", commitHash, regenerated);
  const securityAuth = securityState.gate;
  if (securityAuth.missing) {
    failures.push("P0-1_GATE_MISSING_SECURITY_AUTH");
  } else {
    if (securityState.freshness.stale) {
      failures.push(
        `P0-1_GATE_STALE_SECURITY_AUTH:${securityState.freshness.reasons.join("|")}`,
      );
    }
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
      freshness: securityState.freshness,
    });
    if (headerTrustPathPresent) failures.push("P0-1_HEADER_TRUST_PATH_PRESENT");
    if (!missingTokenRejected) failures.push("P0-1_MISSING_TOKEN_NOT_REJECTED");
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    strict,
    autoRefresh,
    commitHash,
    maxAgeHours,
    regenerated,
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
  if (regenerated.length > 0) {
    console.log(`[p0-gates] regenerated: ${regenerated.join(", ")}`);
  }
  if (!summary.passed) {
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }
}

main();
