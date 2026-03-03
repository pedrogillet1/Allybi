import { PolicyRuntimeEngine, type PolicyRule } from "./policyRuntimeEngine.service";
import { resolvePolicyBank } from "./policyBankResolver.service";

type PolicyExceptionsPolicyBank = {
  config?: {
    enabled?: boolean;
  };
  rules?: PolicyRule[];
};

export type PolicyExceptionDecision = {
  action: string;
  reasonCode: string | null;
};

export class PolicyExceptionsPolicyService {
  private readonly engine = new PolicyRuntimeEngine();

  decide(input: {
    approved?: boolean;
    exceptionExpired?: boolean;
  }): PolicyExceptionDecision {
    const bank = resolvePolicyBank<PolicyExceptionsPolicyBank>(
      "policy_exceptions_policy",
      "policy_exceptions_policy.any.json",
    );

    const match = this.engine.firstMatch({
      rules: Array.isArray(bank?.rules) ? bank?.rules : [],
      policyBank: bank || undefined,
      runtime: {
        signals: {
          approved: input.approved === true,
          exceptionExpired: input.exceptionExpired === true,
        },
      },
      defaultAction: "deny_exception",
    });

    return {
      action: String(match?.then.action || "deny_exception"),
      reasonCode: match?.reasonCode || null,
    };
  }
}
