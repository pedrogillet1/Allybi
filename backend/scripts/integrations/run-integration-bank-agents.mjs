#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const workerPath = path.join(
  __dirname,
  "integration-bank-agent-worker.mjs",
);

const AGENTS = [
  { id: "routing_agent", weight: 0.24 },
  { id: "intent_family_agent", weight: 0.16 },
  { id: "operator_contract_agent", weight: 0.2 },
  { id: "capabilities_agent", weight: 0.14 },
  { id: "policy_agent", weight: 0.12 },
  { id: "collision_agent", weight: 0.14 },
];

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    strict: args.includes("--strict"),
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

function runWorker(agentId) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [workerPath, "--agent", agentId, "--json"],
      { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk || "");
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `Worker '${agentId}' failed with code ${code}. ${stderr || stdout}`,
          ),
        );
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        resolve(parsed);
      } catch (error) {
        reject(
          new Error(
            `Worker '${agentId}' returned invalid JSON. ${String(error?.message || error)} | output=${stdout}`,
          ),
        );
      }
    });
  });
}

function summarizeFindings(results) {
  const findings = [];
  for (const result of results) {
    for (const check of result.checks || []) {
      if (check.pass) continue;
      findings.push({
        agentId: result.id,
        severity: check.severity || "medium",
        id: check.id,
        detail: check.detail,
        weight: check.weight,
      });
    }
  }
  const order = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => {
    const sa = order[a.severity] ?? 3;
    const sb = order[b.severity] ?? 3;
    if (sa !== sb) return sa - sb;
    return b.weight - a.weight;
  });
  return findings;
}

function renderMarkdown(report) {
  let out = "";
  out += "# Integration Data Banks Parallel Agent Grade\n\n";
  out += `- Generated: ${report.generatedAt}\n`;
  out += `- Final score: **${report.finalScore}**\n`;
  out += `- Final grade: **${report.finalGrade}**\n`;
  out += `- Verdict: **${report.verdict}**\n\n`;

  out += "## Agent Scores\n\n";
  out += "| Agent | Score | Grade | Failed Checks |\n";
  out += "|---|---:|---:|---:|\n";
  for (const row of report.agents) {
    out += `| ${row.id} | ${row.score} | ${row.grade} | ${row.failedChecks} |\n`;
  }
  out += "\n";

  out += "## Top Findings\n\n";
  if (!report.findings.length) {
    out += "- None\n";
  } else {
    for (const finding of report.findings) {
      out += `- [${finding.severity}] ${finding.agentId} :: ${finding.id} (${finding.weight}) - ${finding.detail}\n`;
    }
  }
  out += "\n";
  return out;
}

async function main() {
  const args = parseArgs();
  const startedAt = Date.now();
  const results = await Promise.all(AGENTS.map((agent) => runWorker(agent.id)));
  const byId = new Map(results.map((result) => [result.id, result]));

  let weighted = 0;
  for (const agent of AGENTS) {
    const result = byId.get(agent.id);
    if (!result) continue;
    weighted += result.score * agent.weight;
  }
  const finalScore = Math.round(weighted * 100) / 100;
  const finalGrade = gradeFromScore(finalScore);
  const findings = summarizeFindings(results);
  const failedChecks = findings.length;
  const highSeverityFindings = findings.filter(
    (finding) => finding.severity === "high",
  );
  const hardFail = failedChecks > 0 || highSeverityFindings.length > 0;

  const report = {
    generatedAt: new Date().toISOString(),
    runtimeMs: Date.now() - startedAt,
    finalScore,
    finalGrade,
    verdict: finalScore >= 90 && !hardFail ? "ready" : "needs_work",
    agents: results.map((result) => ({
      id: result.id,
      title: result.title,
      score: result.score,
      grade: result.grade,
      failedChecks: (result.checks || []).filter((item) => !item.pass).length,
      ownedBanks: result.ownedBanks,
    })),
    findings,
    failedChecks,
    highSeverityFindings: highSeverityFindings.length,
    hardFail,
  };

  const outDir = path.join(repoRoot, "reports", "integrations");
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "integration-bank-parallel-grade.json");
  const mdPath = path.join(outDir, "integration-bank-parallel-grade.md");
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(mdPath, renderMarkdown(report));

  console.log(
    `[integration-agents] finalScore=${report.finalScore} grade=${report.finalGrade} verdict=${report.verdict} failedChecks=${failedChecks}`,
  );
  console.log(`[integration-agents] json=${path.relative(repoRoot, jsonPath)}`);
  console.log(`[integration-agents] md=${path.relative(repoRoot, mdPath)}`);

  if (args.strict && (finalScore < 90 || hardFail)) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`[integration-agents] failed: ${String(error?.message || error)}`);
  process.exit(1);
});
