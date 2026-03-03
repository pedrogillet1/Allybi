export const POLICY_CRITICALITIES = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
] as const;

export type PolicyCriticality = (typeof POLICY_CRITICALITIES)[number];

export type PolicyMeta = {
  id: string;
  version: string;
  description: string;
  languages?: string[];
  lastUpdated: string;
  owner: string;
  reviewCadenceDays: number;
  criticality: PolicyCriticality;
  changeLog?: string[];
};

export type PolicyConfig = {
  enabled?: boolean;
  strict?: boolean;
  failClosedInProd?: boolean;
  configModeOnly?: boolean;
  defaultAction?: string | Record<string, unknown>;
  integrationHooks?: Record<string, unknown>;
};

export type PolicyTestCase = {
  id: string;
  input?: Record<string, unknown>;
  runtime?: Record<string, unknown>;
  expect?: Record<string, unknown>;
};

export type PolicyBankContract = {
  _meta: PolicyMeta;
  config?: PolicyConfig;
  rules?: unknown[];
  policies?: {
    rules?: unknown[];
  };
  tests?: {
    cases?: PolicyTestCase[];
  };
  cases?: PolicyTestCase[];
  [k: string]: unknown;
};

export type PolicyValidationIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
  filePath: string;
  bankId: string;
};

export type PolicyValidationResult = {
  bankId: string;
  filePath: string;
  ok: boolean;
  criticality: PolicyCriticality | "unknown";
  issues: PolicyValidationIssue[];
  ruleCount: number;
  testCaseCount: number;
};

export type PolicyCertificationReport = {
  ok: boolean;
  checkedAt: string;
  totalBanks: number;
  failedBanks: string[];
  warningBanks: string[];
  issueCounts: {
    errors: number;
    warnings: number;
  };
  results: PolicyValidationResult[];
};
