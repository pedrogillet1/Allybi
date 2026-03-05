#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const strict = process.argv.includes("--strict");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT_DIR = path.join(ROOT, "reports", "operators");
const OUT_JSON = path.join(OUT_DIR, "operator-systems-grade.json");
const OUT_MD = path.join(OUT_DIR, "operator-systems-grade.md");
const freshnessMaxHours = Number(process.env.OPERATOR_GRADE_MAX_AGE_HOURS || 24);
const freshnessMaxMs = Number.isFinite(freshnessMaxHours) && freshnessMaxHours > 0
  ? freshnessMaxHours * 60 * 60 * 1000
  : 24 * 60 * 60 * 1000;

function readJson(relPath) {
  const fullPath = path.join(ROOT, relPath);
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function readText(relPath) {
  const fullPath = path.join(ROOT, relPath);
  return fs.readFileSync(fullPath, "utf8");
}

function safeReadJson(relPath) {
  try {
    return readJson(relPath);
  } catch {
    return null;
  }
}

function exists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
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

function analyzeArtifactFreshness(artifact, commitHash) {
  const reasons = [];
  const generatedAt = String(artifact?.generatedAt || "").trim();
  if (!generatedAt) {
    reasons.push("missing_generatedAt");
  } else {
    const ts = Date.parse(generatedAt);
    if (!Number.isFinite(ts)) {
      reasons.push("invalid_generatedAt");
    } else if (Date.now() - ts > freshnessMaxMs) {
      reasons.push(`stale_age_gt_${freshnessMaxHours}h`);
    }
  }
  const artifactCommitHash = String(
    artifact?.commitHash || artifact?.meta?.commitHash || "",
  ).trim();
  if (commitHash && artifactCommitHash && artifactCommitHash !== commitHash) {
    reasons.push("commit_hash_mismatch");
  }
  return {
    stale: reasons.length > 0,
    reasons,
  };
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

function runRoutingJson() {
  const result = spawnSync(
    "npx",
    [
      "ts-node",
      "--transpile-only",
      "scripts/audit-routing-alignment.ts",
      "--json",
    ],
    { cwd: ROOT, encoding: "utf8" },
  );
  if (result.status !== 0) {
    return { ok: false, error: String(result.stderr || result.stdout || "routing command failed") };
  }
  try {
    return JSON.parse(String(result.stdout || "{}").trim());
  } catch {
    return { ok: false, error: "invalid routing json output" };
  }
}

function extractRuntimeOperators(typesSource) {
  const match = typesSource.match(/export type EditOperator =([\s\S]*?);/);
  if (!match) return [];
  return Array.from(match[1].matchAll(/"([A-Z_]+)"/g)).map((m) => m[1]);
}

function extractContractOperators(contractSource) {
  return Array.from(
    contractSource.matchAll(/operator:\s*"([A-Z_]+)"/g),
  ).map((m) => m[1]);
}

function extractRuntimeBranches(revisionStoreSource) {
  return Array.from(
    revisionStoreSource.matchAll(/op === "([A-Z_]+)"/g),
  ).map((m) => m[1]);
}

function unique(values) {
  return Array.from(new Set(values));
}

function analyzeCompleteness() {
  const typesSource = readText("src/services/editing/editing.types.ts");
  const contractSource = readText("src/services/editing/contracts/operatorContracts.ts");
  const revisionStoreSource = readText(
    "src/services/editing/documentRevisionStore.service.ts",
  );

  const runtimeOps = unique(extractRuntimeOperators(typesSource));
  const contractOps = unique(extractContractOperators(contractSource));
  const branchOps = unique(extractRuntimeBranches(revisionStoreSource));

  const missingContract = runtimeOps.filter((op) => !contractOps.includes(op));
  const missingBranch = runtimeOps.filter((op) => !branchOps.includes(op));

  return {
    runtimeOps: runtimeOps.length,
    contractOps: contractOps.length,
    branchOps: branchOps.length,
    missingContract,
    missingBranch,
    ok: missingContract.length === 0 && missingBranch.length === 0,
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Operator Systems Grade");
  lines.push("");
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Final score: **${report.score}**`);
  lines.push(`- Final grade: **${report.grade}**`);
  lines.push(`- Verdict: **${report.verdict}**`);
  lines.push("");
  lines.push("## Subscores");
  lines.push("");
  lines.push(`- Integration agents: ${report.subscores.integration}`);
  lines.push(`- P0 certification: ${report.subscores.p0}`);
  lines.push(`- Routing alignment: ${report.subscores.routing}`);
  lines.push(`- Runtime completeness: ${report.subscores.completeness}`);
  lines.push(`- Python first-classness: ${report.subscores.python}`);
  lines.push(`- Governance freshness: ${report.subscores.governance}`);
  lines.push("");
  lines.push("## Findings");
  lines.push("");
  if (report.findings.length === 0) {
    lines.push("- None");
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

function main() {
  const findings = [];
  let score = 100;
  const commitHash = currentCommitHash();

  function addFinding(severity, id, detail, deduction) {
    findings.push({ severity, id, detail, deduction });
    score -= deduction;
  }

  const integration = safeReadJson("reports/integrations/integration-bank-parallel-grade.json");
  if (!integration) {
    addFinding("high", "integration_missing", "Missing integration agent grade artifact.", 25);
  } else {
    const integrationFreshness = analyzeArtifactFreshness(integration, commitHash);
    if (integrationFreshness.stale) {
      addFinding(
        "high",
        "integration_artifact_stale",
        `Integration artifact is stale: ${integrationFreshness.reasons.join("|")}`,
        20,
      );
    }
    const integrationScore = Number(integration.finalScore || 0);
    if (integrationScore < 90) {
      addFinding(
        "high",
        "integration_score_low",
        `Integration grade score ${integrationScore} below 90.`,
        25,
      );
    } else if (integrationScore < 97) {
      addFinding(
        "medium",
        "integration_not_a_plus",
        `Integration grade score ${integrationScore} below A+ threshold.`,
        6,
      );
    }
  }

  const p0 = safeReadJson("reports/cert/p0-gates-summary.json");
  if (!p0) {
    addFinding("high", "p0_summary_missing", "Missing p0 gates summary artifact.", 30);
  } else {
    const p0Freshness = analyzeArtifactFreshness(p0, commitHash);
    if (p0Freshness.stale) {
      addFinding(
        "high",
        "p0_artifact_stale",
        `P0 summary is stale: ${p0Freshness.reasons.join("|")}`,
        30,
      );
    }
    if (p0.passed !== true) {
      addFinding(
        "high",
        "p0_failed",
        `P0 strict gates failed: ${(p0.failures || []).join(", ") || "unknown"}`,
        35,
      );
    }
  }

  const routing = runRoutingJson();
  if (!routing || routing.ok !== true) {
    addFinding(
      "high",
      "routing_alignment_failed",
      routing?.error || "Routing alignment reported problems.",
      20,
    );
  }

  const completeness = analyzeCompleteness();
  if (!completeness.ok) {
    addFinding(
      "high",
      "runtime_completeness_failed",
      `Missing contract=${completeness.missingContract.join("|")}; missing branch=${completeness.missingBranch.join("|")}`,
      20,
    );
  }

  const matrixSource = readText("src/services/editing/capabilities/capabilityMatrix.service.ts");
  if (!matrixSource.includes('"python"')) {
    addFinding(
      "medium",
      "python_domain_missing_in_matrix",
      "Capability matrix source does not expose python domain rows.",
      10,
    );
  }

  const editingEval = readText("src/tests/certification/editing-eval-suite.cert.test.ts");
  if (!editingEval.includes("pyTotal") || !editingEval.includes("pyPassRate")) {
    addFinding(
      "medium",
      "python_metrics_missing_in_cert",
      "Editing eval certification does not enforce PY-specific metrics.",
      10,
    );
  }

  const staleDocPath = "notes/BANK_WIRING_PROOF.md";
  if (exists(staleDocPath)) {
    const staleDoc = readText(staleDocPath);
    if (staleDoc.includes("### Dead Operators (4 banks)")) {
      addFinding(
        "medium",
        "governance_doc_stale",
        "BANK_WIRING_PROOF still advertises removed dead-operator banks.",
        8,
      );
    }
  }

  const playbookDir = path.join(ROOT, "src/data_banks/operators/playbooks");
  let playbookCount = 0;
  if (fs.existsSync(playbookDir)) {
    const stack = [playbookDir];
    while (stack.length) {
      const dir = stack.pop();
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) stack.push(full);
        if (entry.isFile() && entry.name.endsWith(".any.json")) playbookCount += 1;
      }
    }
  }
  if (playbookCount < 40) {
    addFinding(
      "medium",
      "playbook_coverage_thin",
      `Operator playbook file count ${playbookCount} below expected floor 40.`,
      8,
    );
  }

  score = Math.max(0, Number(score.toFixed(2)));
  const grade = gradeFromScore(score);
  const hasHighFindings = findings.some((f) => f.severity === "high");
  const verdict = !hasHighFindings && grade === "A+" ? "ready" : "needs_work";

  const subscores = {
    integration: integration ? Number(integration.finalScore || 0) : 0,
    p0: p0?.passed === true ? 100 : 0,
    routing: routing?.ok === true ? 100 : 0,
    completeness: completeness.ok ? 100 : 0,
    python:
      matrixSource.includes('"python"') &&
      editingEval.includes("pyTotal") &&
      editingEval.includes("pyPassRate")
        ? 100
        : 0,
    governance: exists(staleDocPath) && readText(staleDocPath).includes("### Dead Operators (4 banks)") ? 0 : 100,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    commitHash,
    score,
    grade,
    verdict,
    strict,
    findings,
    subscores,
    details: {
      integration,
      p0,
      routing,
      completeness,
      playbookCount,
    },
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(OUT_MD, renderMarkdown(report), "utf8");

  console.log(
    `[operator-grade] score=${score} grade=${grade} verdict=${verdict} findings=${findings.length}`,
  );
  console.log(`[operator-grade] json=${path.relative(ROOT, OUT_JSON)}`);
  console.log(`[operator-grade] md=${path.relative(ROOT, OUT_MD)}`);

  if (strict && (grade !== "A+" || hasHighFindings)) {
    process.exit(1);
  }
}

main();
