import { RuntimeWiringIntegrityService } from "../../src/services/core/banks/runtimeWiringIntegrity.service";
import * as path from "path";
import { PolicyCertificationRunnerService } from "../../src/services/core/policy/policyCertificationRunner.service";
import { initializeBanks } from "../../src/services/core/banks/bankLoader.service";

async function main() {
  await initializeBanks({
    env: "local",
    rootDir: path.join(process.cwd(), "src/data_banks"),
    strict: false,
    validateSchemas: false,
    allowEmptyChecksumsInNonProd: true,
    enableHotReload: false,
  });

  const policyRunner = new PolicyCertificationRunnerService();
  const policyReport = policyRunner.run({ strict: true });

  const wiring = new RuntimeWiringIntegrityService().validate();

  const failures: string[] = [];
  if (!policyReport.ok) {
    failures.push("policy_certification_strict_failed");
  }
  if (!wiring.ok) {
    failures.push("runtime_wiring_integrity_failed");
  }

  const summary = {
    ok: failures.length === 0,
    failures,
    policyCertification: {
      ok: policyReport.ok,
      totalBanks: policyReport.totalBanks,
      failedBanks: policyReport.failedBanks.length,
      warningBanks: policyReport.warningBanks.length,
      errors: policyReport.issueCounts.errors,
      warnings: policyReport.issueCounts.warnings,
    },
    runtimeWiring: {
      ok: wiring.ok,
      missingBanks: wiring.missingBanks.length,
      missingRuntimePolicyConsumers: wiring.missingRuntimePolicyConsumers.length,
      runtimePolicyEnvGaps: wiring.runtimePolicyEnvGaps.length,
      missingOperatorContracts: wiring.missingOperatorContracts.length,
      missingOperatorOutputShapes: wiring.missingOperatorOutputShapes.length,
      missingEditingCatalogOperators: wiring.missingEditingCatalogOperators.length,
      missingEditingCapabilities: wiring.missingEditingCapabilities.length,
      invalidPromptLayers: wiring.invalidPromptLayers.length,
      invalidPromptTemplateOutputModes: wiring.invalidPromptTemplateOutputModes.length,
      missingBuilderPolicyBank: wiring.missingBuilderPolicyBank.length,
      invalidBuilderPolicy: wiring.invalidBuilderPolicy.length,
      legacyChatRuntimeImports: wiring.legacyChatRuntimeImports.length,
      dormantCoreRoutingImports: wiring.dormantCoreRoutingImports.length,
      turnRoutePolicyDynamicFallback: wiring.turnRoutePolicyDynamicFallback.length,
      hardcodedRuntimeHeuristics: wiring.hardcodedRuntimeHeuristics.length,
      rawConsoleRuntimeUsage: wiring.rawConsoleRuntimeUsage.length,
      memoryDelegateDirectInstantiation:
        wiring.memoryDelegateDirectInstantiation.length,
      memoryRawPersistencePatterns: wiring.memoryRawPersistencePatterns.length,
      memoryPolicyHookEngineMissing: wiring.memoryPolicyHookEngineMissing.length,
      dormantIntentConfigUsage: wiring.dormantIntentConfigUsage.length,
      composeAnswerModeTemplateGaps: wiring.composeAnswerModeTemplateGaps.length,
      answerModeContractDrift: wiring.answerModeContractDrift.length,
      productHelpRuntimeUsageMissing: wiring.productHelpRuntimeUsageMissing.length,
    },
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (!summary.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error("policy:a-grade:assert failed", error);
  process.exitCode = 1;
});
