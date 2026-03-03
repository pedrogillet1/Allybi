import { PolicyRuntimeEngine, type PolicyRule } from "./policyRuntimeEngine.service";
import { resolvePolicyBank } from "./policyBankResolver.service";

type ModelReleasePolicyBank = {
  config?: {
    enabled?: boolean;
  };
  rules?: PolicyRule[];
};

export type ModelReleaseDecision = {
  approved: boolean;
  action: string;
  reasonCode: string | null;
};

export class ModelReleasePolicyService {
  private readonly engine = new PolicyRuntimeEngine();

  decide(input: {
    severity1Failures?: number;
    regressionPassRate?: number;
  }): ModelReleaseDecision {
    const bank = resolvePolicyBank<ModelReleasePolicyBank>(
      "model_release_policy",
      "model_release_policy.any.json",
    );

    const match = this.engine.firstMatch({
      rules: Array.isArray(bank?.rules) ? bank?.rules : [],
      policyBank: bank || undefined,
      runtime: {
        metrics: {
          severity1Failures: Number(input.severity1Failures || 0),
          regressionPassRate: Number(input.regressionPassRate || 0),
        },
      },
      defaultAction: "approve_release",
    });

    const action = String(match?.then.action || "approve_release").trim();
    return {
      approved: action === "approve_release",
      action,
      reasonCode: match?.reasonCode || null,
    };
  }
}
