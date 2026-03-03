import { PolicyRuntimeEngine, type PolicyRule } from "./policyRuntimeEngine.service";
import { resolvePolicyBank } from "./policyBankResolver.service";

type DataRetentionPolicyBank = {
  config?: {
    enabled?: boolean;
  };
  retentionClasses?: Record<string, unknown>;
  rules?: PolicyRule[];
};

export type RetentionDecision = {
  matched: boolean;
  action: string;
  reasonCode: string | null;
};

export class DataRetentionDeletionPolicyService {
  private readonly engine = new PolicyRuntimeEngine();

  decide(input: {
    legalHold?: boolean;
    userErasureRequested?: boolean;
  }): RetentionDecision {
    const bank = resolvePolicyBank<DataRetentionPolicyBank>(
      "data_retention_deletion_policy",
      "data_retention_deletion_policy.any.json",
    );

    const match = this.engine.firstMatch({
      rules: Array.isArray(bank?.rules) ? bank?.rules : [],
      policyBank: bank || undefined,
      runtime: {
        signals: {
          legalHold: input.legalHold === true,
          userErasureRequested: input.userErasureRequested === true,
        },
      },
      defaultAction: "retain_by_class",
    });

    return {
      matched: Boolean(match),
      action: String(match?.then.action || "retain_by_class"),
      reasonCode: match?.reasonCode || null,
    };
  }
}
