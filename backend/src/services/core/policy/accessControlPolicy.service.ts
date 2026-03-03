import { PolicyRuntimeEngine, type PolicyRule } from "./policyRuntimeEngine.service";
import { resolvePolicyBank } from "./policyBankResolver.service";

type AccessControlPolicyBank = {
  config?: {
    enabled?: boolean;
  };
  rules?: PolicyRule[];
};

export type AccessControlDecision = {
  allowed: boolean;
  action: string;
  reasonCode: string | null;
  requireMfa: boolean;
  requireApproval: boolean;
};

export class AccessControlPolicyService {
  private readonly engine = new PolicyRuntimeEngine();

  decide(input: {
    role?: string;
    action?: string;
  }): AccessControlDecision {
    const bank = resolvePolicyBank<AccessControlPolicyBank>(
      "access_control_policy",
      "access_control_policy.any.json",
    );

    const match = this.engine.firstMatch({
      rules: Array.isArray(bank?.rules) ? bank?.rules : [],
      policyBank: bank || undefined,
      runtime: {
        signals: {
          role: String(input.role || "").trim().toLowerCase(),
          action: String(input.action || "").trim(),
        },
      },
      defaultAction: "deny",
    });

    const action = String(match?.then.action || "deny").trim().toLowerCase();
    return {
      allowed: action === "allow",
      action,
      reasonCode: match?.reasonCode || null,
      requireMfa: match?.then.requireMfa === true,
      requireApproval: match?.then.requireApproval === true,
    };
  }
}
