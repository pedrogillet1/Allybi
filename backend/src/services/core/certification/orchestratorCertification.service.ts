import * as fs from "fs";
import * as path from "path";

import { RuntimeWiringIntegrityService } from "../banks/runtimeWiringIntegrity.service";
import { loadOrchestratorCertificationPolicy } from "./orchestratorCertificationPolicy";
import type {
  CertificationCoverageSummary,
  CertificationFailureCode,
  CertificationFinding,
  CertificationGateResult,
  CertificationReport,
} from "./orchestratorCertification.types";

type RunOptions = {
  coverageSummary?: CertificationCoverageSummary;
  regressionPassed?: boolean;
};

function makeFinding(input: {
  code: CertificationFailureCode;
  message: string;
  evidence: string[];
}): CertificationFinding {
  return {
    code: input.code,
    message: input.message,
    evidence: input.evidence,
    blocking: true,
  };
}

function scoreGate(maxScore: number, findings: CertificationFinding[]): number {
  return findings.length === 0 ? maxScore : 0;
}

function toAbsolute(pathLike: string): string {
  return path.resolve(process.cwd(), pathLike);
}

function readIfExists(pathLike: string): string | null {
  const abs = toAbsolute(pathLike);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, "utf8");
}

function findCoverageEntry(
  summary: CertificationCoverageSummary,
  suffix: string,
): { linesPct: number; branchesPct: number } | null {
  for (const [key, value] of Object.entries(summary)) {
    const normalized = key.replace(/\\/g, "/");
    if (normalized.endsWith(suffix)) return value;
  }
  return null;
}

function compileRegex(pattern: string, flags?: string): RegExp {
  return new RegExp(pattern, flags || undefined);
}

export class OrchestratorCertificationService {
  run(options: RunOptions = {}): CertificationReport {
    const policy = loadOrchestratorCertificationPolicy();
    const gates: CertificationGateResult[] = [];

    const architectureFindings: CertificationFinding[] = [];
    const wiring = new RuntimeWiringIntegrityService().validate();
    if (wiring.missingBanks.length > 0) {
      architectureFindings.push(
        makeFinding({
          code: "MISSING_REQUIRED_BANKS",
          message: "Runtime wiring is missing required banks.",
          evidence: wiring.missingBanks,
        }),
      );
    }
    if (wiring.legacyChatRuntimeImports.length > 0) {
      architectureFindings.push(
        makeFinding({
          code: "LEGACY_RUNTIME_IMPORT",
          message: "Legacy chat runtime imports are still present.",
          evidence: wiring.legacyChatRuntimeImports,
        }),
      );
    }
    if (wiring.dormantCoreRoutingImports.length > 0) {
      architectureFindings.push(
        makeFinding({
          code: "DORMANT_CORE_ROUTING_IMPORT",
          message: "Dormant core routing imports are still present.",
          evidence: wiring.dormantCoreRoutingImports,
        }),
      );
    }
    if (wiring.turnRoutePolicyDynamicFallback.length > 0) {
      architectureFindings.push(
        makeFinding({
          code: "DYNAMIC_ROUTE_POLICY_FALLBACK",
          message: "Turn route policy still has dynamic fallback load paths.",
          evidence: wiring.turnRoutePolicyDynamicFallback,
        }),
      );
    }
    gates.push({
      id: "architecture",
      status: architectureFindings.length === 0 ? "pass" : "fail",
      score: scoreGate(policy.gateScores.architecture, architectureFindings),
      maxScore: policy.gateScores.architecture,
      findings: architectureFindings,
    });

    const databankFindings: CertificationFinding[] = [];
    const memoryPolicyRaw = readIfExists(
      "src/data_banks/policies/memory_policy.any.json",
    );
    if (!memoryPolicyRaw) {
      databankFindings.push(
        makeFinding({
          code: "MISSING_RUNTIME_TUNING",
          message: "memory_policy.any.json could not be loaded.",
          evidence: ["src/data_banks/policies/memory_policy.any.json"],
        }),
      );
    } else {
      const memoryPolicy = JSON.parse(memoryPolicyRaw);
      const runtimeTuning = memoryPolicy?.config?.runtimeTuning;
      const missing = policy.databank.requiredRuntimeTuningSections.filter(
        (key) => !(key in (runtimeTuning || {})),
      );
      if (missing.length > 0) {
        databankFindings.push(
          makeFinding({
            code: "MISSING_RUNTIME_TUNING",
            message:
              "memory_policy runtime tuning is missing required sections.",
            evidence: missing.map(
              (key) => `memory_policy.config.runtimeTuning.${key}`,
            ),
          }),
        );
      }
    }
    for (const filePath of policy.orchestratorFiles) {
      const src = readIfExists(filePath);
      if (!src) continue;
      for (const candidate of policy.databank.hardcodedHeuristicRules) {
        const re = compileRegex(candidate.pattern, candidate.flags);
        const matched = re.test(src);
        const failed =
          (candidate.mode === "must_not_match" && matched) ||
          (candidate.mode === "must_match" && !matched);
        if (!failed) continue;
        databankFindings.push(
          makeFinding({
            code: candidate.code,
            message: candidate.message,
            evidence: [filePath],
          }),
        );
      }
    }
    gates.push({
      id: "databank",
      status: databankFindings.length === 0 ? "pass" : "fail",
      score: scoreGate(policy.gateScores.databank, databankFindings),
      maxScore: policy.gateScores.databank,
      findings: databankFindings,
    });

    const memoryFindings: CertificationFinding[] = [];
    for (const check of policy.memorySemantics.checks) {
      const src = readIfExists(check.filePath);
      if (!src) {
        memoryFindings.push(
          makeFinding({
            code: check.code,
            message: check.message,
            evidence: [check.filePath],
          }),
        );
        continue;
      }
      const re = compileRegex(check.pattern, check.flags);
      const matched = re.test(src);
      const failed =
        (check.mode === "must_match" && !matched) ||
        (check.mode === "must_not_match" && matched);
      if (!failed) continue;
      memoryFindings.push(
        makeFinding({
          code: check.code,
          message: check.message,
          evidence: [check.filePath],
        }),
      );
    }
    gates.push({
      id: "memory_semantics",
      status: memoryFindings.length === 0 ? "pass" : "fail",
      score: scoreGate(policy.gateScores.memory_semantics, memoryFindings),
      maxScore: policy.gateScores.memory_semantics,
      findings: memoryFindings,
    });

    const reliabilityFindings: CertificationFinding[] = [];
    const rawConsoleRegex = compileRegex(
      policy.reliability.rawConsoleRule.pattern,
      policy.reliability.rawConsoleRule.flags,
    );
    for (const filePath of policy.orchestratorFiles) {
      const src = readIfExists(filePath);
      if (!src) continue;
      if (!rawConsoleRegex.test(src)) continue;
      reliabilityFindings.push(
        makeFinding({
          code: policy.reliability.rawConsoleRule.code,
          message: policy.reliability.rawConsoleRule.message,
          evidence: [filePath],
        }),
      );
    }
    gates.push({
      id: "reliability",
      status: reliabilityFindings.length === 0 ? "pass" : "fail",
      score: scoreGate(policy.gateScores.reliability, reliabilityFindings),
      maxScore: policy.gateScores.reliability,
      findings: reliabilityFindings,
    });

    const coverageFindings: CertificationFinding[] = [];
    const coverageSummary = options.coverageSummary || {};
    for (const threshold of policy.coverage.thresholds) {
      const result = findCoverageEntry(coverageSummary, threshold.suffix);
      if (!result) {
        coverageFindings.push(
          makeFinding({
            code: "COVERAGE_BELOW_THRESHOLD",
            message: `Coverage data missing for ${threshold.suffix}.`,
            evidence: [threshold.suffix],
          }),
        );
        continue;
      }
      if (
        result.linesPct < threshold.linesPct ||
        result.branchesPct < threshold.branchesPct
      ) {
        coverageFindings.push(
          makeFinding({
            code: "COVERAGE_BELOW_THRESHOLD",
            message: `Coverage below threshold for ${threshold.suffix}.`,
            evidence: [
              `lines=${result.linesPct} required=${threshold.linesPct}`,
              `branches=${result.branchesPct} required=${threshold.branchesPct}`,
            ],
          }),
        );
      }
    }
    gates.push({
      id: "coverage",
      status: coverageFindings.length === 0 ? "pass" : "fail",
      score: scoreGate(policy.gateScores.coverage, coverageFindings),
      maxScore: policy.gateScores.coverage,
      findings: coverageFindings,
    });

    const regressionFindings: CertificationFinding[] = [];
    if (!options.regressionPassed) {
      regressionFindings.push(
        makeFinding({
          code: "TEST_FAILURE",
          message: "Regression test suite did not pass.",
          evidence: ["orchestrator regression suite"],
        }),
      );
    }
    gates.push({
      id: "regression",
      status: regressionFindings.length === 0 ? "pass" : "fail",
      score: scoreGate(policy.gateScores.regression, regressionFindings),
      maxScore: policy.gateScores.regression,
      findings: regressionFindings,
    });

    const score = gates.reduce((acc, gate) => acc + gate.score, 0);
    const maxScore = gates.reduce((acc, gate) => acc + gate.maxScore, 0);
    const hardFailCount = gates.reduce(
      (acc, gate) =>
        acc + gate.findings.filter((finding) => finding.blocking).length,
      0,
    );
    const passed =
      hardFailCount === 0 && gates.every((gate) => gate.status === "pass");

    return {
      generatedAt: new Date().toISOString(),
      score,
      maxScore,
      passed,
      hardFailCount,
      gates,
    };
  }
}
