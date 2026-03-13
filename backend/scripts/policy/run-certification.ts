import { PolicyCertificationRunnerService } from "../../tools/policy/certification/policyCertificationRunner.service";

function main() {
  const strict = process.argv.includes("--strict");
  const runner = new PolicyCertificationRunnerService();
  const report = runner.run({ strict });

  const summary = {
    ok: report.ok,
    totalBanks: report.totalBanks,
    failedBanks: report.failedBanks.length,
    warningBanks: report.warningBanks.length,
    errors: report.issueCounts.errors,
    warnings: report.issueCounts.warnings,
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

  if (strict && !report.ok) {
    process.exitCode = 1;
  }
}

main();
