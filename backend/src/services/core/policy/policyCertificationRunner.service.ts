import {
  type PolicyCertificationReport,
  type PolicyValidationResult,
} from "./policyContracts";
import { PolicyValidatorService } from "./policyValidator.service";

export class PolicyCertificationRunnerService {
  private readonly validator: PolicyValidatorService;

  constructor(validator?: PolicyValidatorService) {
    this.validator = validator || new PolicyValidatorService();
  }

  run(opts?: { strict?: boolean }): PolicyCertificationReport {
    const report = this.validator.validateAll();
    if (!opts?.strict) return report;

    const strictWarningViolations = report.results
      .filter((result) =>
        result.criticality === "critical" || result.criticality === "high",
      )
      .flatMap((result) =>
        result.issues.filter((issue) => issue.severity === "warning"),
      );

    if (strictWarningViolations.length > 0) {
      const strictWarnBankSet = new Set(
        strictWarningViolations.map((issue) => issue.bankId),
      );
      return {
        ...report,
        ok: false,
        failedBanks: Array.from(
          new Set([
            ...report.failedBanks,
            ...strictWarnBankSet,
          ]),
        ).sort((a, b) => a.localeCompare(b)),
        results: report.results.map((result) =>
          strictWarnBankSet.has(result.bankId) ? { ...result, ok: false } : result,
        ),
      };
    }
    return report;
  }

  assertHealthy(opts?: { strict?: boolean }): PolicyCertificationReport {
    const report = this.run(opts);
    if (report.ok) return report;

    const lines = report.results
      .filter((result) => !result.ok)
      .map((result: PolicyValidationResult) => {
        const issues = result.issues
          .filter((issue) =>
            opts?.strict &&
            (result.criticality === "critical" || result.criticality === "high")
              ? issue.severity === "error" || issue.severity === "warning"
              : issue.severity === "error",
          )
          .map((issue) => `${issue.code}: ${issue.message}`)
          .join("; ");
        return `${result.bankId}: ${issues}`;
      });
    throw new Error(`Policy certification failed (${lines.length} bank(s)): ${lines.join(" | ")}`);
  }
}
