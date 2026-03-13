import { describe, expect, jest, test } from "@jest/globals";

import { PolicyCertificationRunnerService } from "./policyCertificationRunner.service";

describe("PolicyCertificationRunnerService", () => {
  test("throws when certification has errors", () => {
    const runner = new PolicyCertificationRunnerService({
      validateAll: () => ({
        ok: false,
        checkedAt: "2026-03-03T00:00:00.000Z",
        totalBanks: 1,
        failedBanks: ["sample_policy"],
        warningBanks: [],
        issueCounts: { errors: 1, warnings: 0 },
        results: [
          {
            bankId: "sample_policy",
            filePath: "/tmp/sample.any.json",
            ok: false,
            criticality: "unknown",
            issues: [
              {
                code: "meta_missing_owner",
                severity: "error",
                message: "_meta.owner is required",
                filePath: "/tmp/sample.any.json",
                bankId: "sample_policy",
              },
            ],
            ruleCount: 0,
            testCaseCount: 0,
            validatedCaseCount: 0,
            skippedCaseCount: 0,
            configModeOnly: false,
            grade: "F",
            score: 0,
          },
        ],
      }),
    } as any);

    expect(() => runner.assertHealthy()).toThrow(/Policy certification failed/);
  });

  test("returns report when certification passes", () => {
    const runner = new PolicyCertificationRunnerService({
      validateAll: jest.fn(() => ({
        ok: true,
        checkedAt: "2026-03-03T00:00:00.000Z",
        totalBanks: 1,
        failedBanks: [],
        warningBanks: [],
        issueCounts: { errors: 0, warnings: 0 },
        results: [],
      })),
    } as any);

    const report = runner.assertHealthy();
    expect(report.ok).toBe(true);
  });

  test("strict mode fails on warnings for high/critical policies", () => {
    const runner = new PolicyCertificationRunnerService({
      validateAll: jest.fn(() => ({
        ok: true,
        checkedAt: "2026-03-03T00:00:00.000Z",
        totalBanks: 1,
        failedBanks: [],
        warningBanks: ["critical_policy"],
        issueCounts: { errors: 0, warnings: 1 },
        results: [
          {
            bankId: "critical_policy",
            filePath: "/tmp/critical_policy.any.json",
            ok: true,
            criticality: "critical",
            issues: [
              {
                code: "rules_without_tests",
                severity: "warning",
                message: "policy has rules but no in-bank test cases",
                filePath: "/tmp/critical_policy.any.json",
                bankId: "critical_policy",
              },
            ],
            ruleCount: 1,
            testCaseCount: 0,
            validatedCaseCount: 0,
            skippedCaseCount: 0,
            configModeOnly: false,
            grade: "C",
            score: 65,
          },
        ],
      })),
    } as any);

    expect(() => runner.assertHealthy({ strict: true })).toThrow(
      /Policy certification failed/,
    );
  });
});
