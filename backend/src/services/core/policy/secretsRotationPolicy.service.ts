import { PolicyRuntimeEngine, type PolicyRule } from "./policyRuntimeEngine.service";
import { resolvePolicyBank } from "./policyBankResolver.service";

type SecretsRotationPolicyBank = {
  config?: {
    enabled?: boolean;
  };
  rules?: PolicyRule[];
};

export type SecretsRotationDecision = {
  matched: boolean;
  action: string;
  reasonCode: string | null;
  blockSensitiveOperations: boolean;
};

export class SecretsRotationPolicyService {
  private readonly engine = new PolicyRuntimeEngine();

  decide(input: {
    keyTier?: string;
    keyAgeDays?: number;
  }): SecretsRotationDecision {
    const bank = resolvePolicyBank<SecretsRotationPolicyBank>(
      "secrets_rotation_policy",
      "secrets_rotation_policy.any.json",
    );

    const match = this.engine.firstMatch({
      rules: Array.isArray(bank?.rules) ? bank?.rules : [],
      policyBank: bank || undefined,
      runtime: {
        signals: {
          keyTier: String(input.keyTier || "").trim().toLowerCase(),
        },
        metrics: {
          keyAgeDays: Number(input.keyAgeDays || 0),
        },
      },
      defaultAction: "ok",
    });

    return {
      matched: Boolean(match),
      action: String(match?.then.action || "ok"),
      reasonCode: match?.reasonCode || null,
      blockSensitiveOperations: match?.then.blockSensitiveOperations === true,
    };
  }
}
