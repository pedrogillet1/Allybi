/* eslint-disable no-console */
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

import {
  OrchestratorCertificationService,
} from "../../src/services/core/certification/orchestratorCertification.service";
import type { CertificationCoverageSummary } from "../../src/services/core/certification/orchestratorCertification.types";
import {
  loadOrchestratorCertificationPolicy,
} from "../../src/services/core/certification/orchestratorCertificationPolicy";
import { initializeBanks } from "../../src/services/core/banks/bankLoader.service";

function toCoverageSummary(
  raw: Record<string, any>,
): CertificationCoverageSummary {
  const out: CertificationCoverageSummary = {};
  for (const [key, value] of Object.entries(raw || {})) {
    if (key === "total") continue;
    const linesPct = Number(value?.lines?.pct);
    const branchesPct = Number(value?.branches?.pct);
    if (!Number.isFinite(linesPct) || !Number.isFinite(branchesPct)) continue;
    out[key] = { linesPct, branchesPct };
  }
  return out;
}

function toMarkdown(report: ReturnType<OrchestratorCertificationService["run"]>): string {
  const lines: string[] = [];
  lines.push("# Orchestrator Certification Report");
  lines.push("");
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Score: ${report.score}/${report.maxScore}`);
  lines.push(`- Passed: ${report.passed ? "yes" : "no"}`);
  lines.push(`- Hard fails: ${report.hardFailCount}`);
  lines.push("");
  for (const gate of report.gates) {
    lines.push(`## ${gate.id}`);
    lines.push(`- Status: ${gate.status}`);
    lines.push(`- Score: ${gate.score}/${gate.maxScore}`);
    if (gate.findings.length === 0) {
      lines.push("- Findings: none");
      lines.push("");
      continue;
    }
    lines.push("- Findings:");
    for (const finding of gate.findings) {
      lines.push(`  - [${finding.code}] ${finding.message}`);
      for (const evidence of finding.evidence) {
        lines.push(`    - ${evidence}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function run(): Promise<number> {
  const repoRoot = path.resolve(process.cwd());
  const coverageDir = path.join(repoRoot, "coverage");
  const summaryPath = path.join(coverageDir, "coverage-summary.json");
  const resultsDir = path.resolve(repoRoot, "..", "test-results");
  const jsonOutPath = path.join(resultsDir, "orchestrator-certification-report.json");
  const mdOutPath = path.join(resultsDir, "orchestrator-certification-report.md");
  const policy = loadOrchestratorCertificationPolicy();
  const existingRegressionTestPaths = policy.regressionSuite.testPaths.filter((entry) =>
    fs.existsSync(path.join(repoRoot, entry)),
  );
  const existingCoverageTargets = policy.regressionSuite.collectCoverageFrom.filter(
    (entry) => fs.existsSync(path.join(repoRoot, entry)),
  );

  const coverageCmd = [
    "npx jest --config jest.config.cjs --runInBand --coverage --coverageReporters=json-summary --coverageReporters=text",
    "--runTestsByPath",
    ...existingRegressionTestPaths,
    ...existingCoverageTargets.map(
      (entry) => `--collectCoverageFrom='${entry}'`,
    ),
  ].join(" ");

  let regressionPassed = existingRegressionTestPaths.length > 0;
  if (existingRegressionTestPaths.length > 0) {
    try {
      execSync(coverageCmd, { stdio: "inherit" });
    } catch {
      regressionPassed = false;
    }
  } else {
    regressionPassed = false;
  }

  let coverageSummary: CertificationCoverageSummary = {};
  if (fs.existsSync(summaryPath)) {
    const raw = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
    coverageSummary = toCoverageSummary(raw);
  }

  await initializeBanks({
    rootDir: path.join(repoRoot, "src/data_banks"),
    strict: false,
    validateSchemas: false,
    enableHotReload: false,
    allowEmptyChecksumsInNonProd: true,
  });

  const report = new OrchestratorCertificationService().run({
    coverageSummary,
    regressionPassed,
  });

  fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(jsonOutPath, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(mdOutPath, toMarkdown(report), "utf8");

  console.log(`Certification score: ${report.score}/${report.maxScore}`);
  console.log(`Certification passed: ${report.passed ? "yes" : "no"}`);
  console.log(`Report JSON: ${jsonOutPath}`);
  console.log(`Report MD: ${mdOutPath}`);

  return report.passed ? 0 : 1;
}

run()
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((error) => {
    console.error("Failed to run orchestrator certification", error);
    process.exit(1);
  });
