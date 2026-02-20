import * as fs from "fs";
import * as path from "path";

import type {
  CertificationCategoryId,
  CertificationFailureCode,
} from "./orchestratorCertification.types";

type RegexCheckMode = "must_match" | "must_not_match";

type RegexRule = {
  code: CertificationFailureCode;
  message: string;
  pattern: string;
  flags?: string;
  mode: RegexCheckMode;
};

type MemorySemanticsCheck = RegexRule & {
  filePath: string;
};

type CoverageThreshold = {
  suffix: string;
  linesPct: number;
  branchesPct: number;
};

type OrchestratorCertificationPolicyRaw = {
  config?: {
    gateScores?: Partial<Record<CertificationCategoryId, number>>;
    orchestratorFiles?: unknown[];
    databank?: {
      requiredRuntimeTuningSections?: unknown[];
      hardcodedHeuristicRules?: Array<{
        pattern?: unknown;
        flags?: unknown;
        message?: unknown;
        code?: unknown;
        mode?: unknown;
      }>;
    };
    memorySemantics?: {
      checks?: Array<{
        filePath?: unknown;
        pattern?: unknown;
        flags?: unknown;
        message?: unknown;
        code?: unknown;
        mode?: unknown;
      }>;
    };
    reliability?: {
      rawConsolePattern?: unknown;
      rawConsoleFlags?: unknown;
      rawConsoleCode?: unknown;
      rawConsoleMessage?: unknown;
    };
    coverage?: {
      thresholds?: Array<{
        suffix?: unknown;
        linesPct?: unknown;
        branchesPct?: unknown;
      }>;
    };
    regressionSuite?: {
      testPaths?: unknown[];
      collectCoverageFrom?: unknown[];
    };
  };
};

export type OrchestratorCertificationPolicy = {
  gateScores: Record<CertificationCategoryId, number>;
  orchestratorFiles: string[];
  databank: {
    requiredRuntimeTuningSections: string[];
    hardcodedHeuristicRules: RegexRule[];
  };
  memorySemantics: {
    checks: MemorySemanticsCheck[];
  };
  reliability: {
    rawConsoleRule: RegexRule;
  };
  coverage: {
    thresholds: CoverageThreshold[];
  };
  regressionSuite: {
    testPaths: string[];
    collectCoverageFrom: string[];
  };
};

const POLICY_PATH = "src/data_banks/policies/orchestrator_certification.any.json";

function readPolicyRaw(): OrchestratorCertificationPolicyRaw {
  const abs = path.resolve(process.cwd(), POLICY_PATH);
  if (!fs.existsSync(abs)) {
    throw new Error(`Missing certification policy: ${POLICY_PATH}`);
  }
  const raw = fs.readFileSync(abs, "utf8");
  return JSON.parse(raw);
}

function asString(value: unknown): string {
  return String(value || "").trim();
}

function asStringArray(input: unknown): string[] {
  return (Array.isArray(input) ? input : [])
    .map((value) => asString(value))
    .filter(Boolean);
}

function asRegexRule(input: {
  code: unknown;
  message: unknown;
  pattern: unknown;
  flags: unknown;
  mode: unknown;
}): RegexRule {
  const code = asString(input.code) as CertificationFailureCode;
  const message = asString(input.message);
  const pattern = asString(input.pattern);
  const flags = asString(input.flags) || undefined;
  const mode = asString(input.mode) as RegexCheckMode;
  if (!code) throw new Error("Certification policy regex rule is missing code.");
  if (!message) throw new Error("Certification policy regex rule is missing message.");
  if (!pattern) throw new Error("Certification policy regex rule is missing pattern.");
  if (mode !== "must_match" && mode !== "must_not_match") {
    throw new Error(`Certification policy regex rule has invalid mode: ${mode}`);
  }
  try {
    // Validate regex eagerly so failures are deterministic.
    new RegExp(pattern, flags);
  } catch {
    throw new Error(`Invalid certification regex pattern: ${pattern}`);
  }
  return { code, message, pattern, flags, mode };
}

function asCoverageThresholds(input: unknown): CoverageThreshold[] {
  const rows = Array.isArray(input) ? input : [];
  const out: CoverageThreshold[] = [];
  for (const row of rows) {
    const suffix = asString((row as any)?.suffix);
    const linesPct = Number((row as any)?.linesPct);
    const branchesPct = Number((row as any)?.branchesPct);
    if (!suffix) {
      throw new Error("Certification coverage threshold is missing suffix.");
    }
    if (!Number.isFinite(linesPct) || !Number.isFinite(branchesPct)) {
      throw new Error(
        `Certification coverage threshold has invalid numeric values for ${suffix}.`,
      );
    }
    out.push({ suffix, linesPct, branchesPct });
  }
  if (out.length === 0) {
    throw new Error("Certification policy coverage thresholds are required.");
  }
  return out;
}

export function loadOrchestratorCertificationPolicy(): OrchestratorCertificationPolicy {
  const raw = readPolicyRaw();
  const config = raw.config || {};

  const gateScores = {
    architecture: Number(config.gateScores?.architecture),
    databank: Number(config.gateScores?.databank),
    memory_semantics: Number(config.gateScores?.memory_semantics),
    reliability: Number(config.gateScores?.reliability),
    coverage: Number(config.gateScores?.coverage),
    regression: Number(config.gateScores?.regression),
  } as Record<CertificationCategoryId, number>;
  for (const [key, value] of Object.entries(gateScores)) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Certification policy is missing gate score for ${key}.`);
    }
  }

  const orchestratorFiles = asStringArray(config.orchestratorFiles);
  if (orchestratorFiles.length === 0) {
    throw new Error("Certification policy orchestratorFiles is required.");
  }

  const requiredRuntimeTuningSections = asStringArray(
    config.databank?.requiredRuntimeTuningSections,
  );
  if (requiredRuntimeTuningSections.length === 0) {
    throw new Error(
      "Certification policy databank.requiredRuntimeTuningSections is required.",
    );
  }

  const hardcodedHeuristicRules = (
    Array.isArray(config.databank?.hardcodedHeuristicRules)
      ? config.databank?.hardcodedHeuristicRules
      : []
  ).map((rule) =>
    asRegexRule({
      code: rule?.code,
      message: rule?.message,
      pattern: rule?.pattern,
      flags: rule?.flags,
      mode: rule?.mode,
    }),
  );
  if (hardcodedHeuristicRules.length === 0) {
    throw new Error(
      "Certification policy databank.hardcodedHeuristicRules is required.",
    );
  }

  const memorySemanticsChecks = (
    Array.isArray(config.memorySemantics?.checks)
      ? config.memorySemantics?.checks
      : []
  ).map((check) => {
    const filePath = asString(check?.filePath);
    if (!filePath) {
      throw new Error("Certification policy memorySemantics check missing filePath.");
    }
    return {
      ...asRegexRule({
        code: check?.code,
        message: check?.message,
        pattern: check?.pattern,
        flags: check?.flags,
        mode: check?.mode,
      }),
      filePath,
    };
  });
  if (memorySemanticsChecks.length === 0) {
    throw new Error("Certification policy memorySemantics.checks is required.");
  }

  const rawConsoleRule = asRegexRule({
    code: config.reliability?.rawConsoleCode,
    message: config.reliability?.rawConsoleMessage,
    pattern: config.reliability?.rawConsolePattern,
    flags: config.reliability?.rawConsoleFlags,
    mode: "must_not_match",
  });

  const thresholds = asCoverageThresholds(config.coverage?.thresholds);
  const testPaths = asStringArray(config.regressionSuite?.testPaths);
  const collectCoverageFrom = asStringArray(
    config.regressionSuite?.collectCoverageFrom,
  );
  if (testPaths.length === 0) {
    throw new Error("Certification policy regressionSuite.testPaths is required.");
  }
  if (collectCoverageFrom.length === 0) {
    throw new Error(
      "Certification policy regressionSuite.collectCoverageFrom is required.",
    );
  }

  return {
    gateScores,
    orchestratorFiles,
    databank: {
      requiredRuntimeTuningSections,
      hardcodedHeuristicRules,
    },
    memorySemantics: {
      checks: memorySemanticsChecks,
    },
    reliability: {
      rawConsoleRule,
    },
    coverage: {
      thresholds,
    },
    regressionSuite: {
      testPaths,
      collectCoverageFrom,
    },
  };
}

