export type CertificationGateStatus = "pass" | "fail";

export type CertificationCategoryId =
  | "architecture"
  | "databank"
  | "memory_semantics"
  | "reliability"
  | "coverage"
  | "regression";

export type CertificationFailureCode =
  | "MISSING_REQUIRED_BANKS"
  | "LEGACY_RUNTIME_IMPORT"
  | "DORMANT_CORE_ROUTING_IMPORT"
  | "DYNAMIC_ROUTE_POLICY_FALLBACK"
  | "HARDCODED_RUNTIME_HEURISTIC"
  | "RAW_CONSOLE_USAGE"
  | "MISSING_RUNTIME_TUNING"
  | "COVERAGE_BELOW_THRESHOLD"
  | "TEST_FAILURE";

export interface CertificationFinding {
  code: CertificationFailureCode;
  message: string;
  evidence: string[];
  blocking: boolean;
}

export interface CertificationGateResult {
  id: CertificationCategoryId;
  status: CertificationGateStatus;
  score: number;
  maxScore: number;
  findings: CertificationFinding[];
}

export interface CertificationCoverageSummary {
  [filePath: string]: {
    linesPct: number;
    branchesPct: number;
  };
}

export interface CertificationReport {
  generatedAt: string;
  score: number;
  maxScore: number;
  passed: boolean;
  hardFailCount: number;
  gates: CertificationGateResult[];
}
