import { PolicyRuntimeEngine, type PolicyRule } from "./policyRuntimeEngine.service";
import { resolvePolicyBank } from "./policyBankResolver.service";

type IncidentResponsePolicyBank = {
  config?: {
    enabled?: boolean;
  };
  rules?: PolicyRule[];
};

export type IncidentResponseDecision = {
  matched: boolean;
  action: string;
  reasonCode: string | null;
  target: string | null;
  slaMinutes: number | null;
};

export class IncidentResponsePolicyService {
  private readonly engine = new PolicyRuntimeEngine();

  decide(input: {
    category?: string;
    severity?: string;
  }): IncidentResponseDecision {
    const bank = resolvePolicyBank<IncidentResponsePolicyBank>(
      "incident_response_policy",
      "incident_response_policy.any.json",
    );
    if (!bank?.config?.enabled) {
      return {
        matched: false,
        action: "monitor",
        reasonCode: null,
        target: null,
        slaMinutes: null,
      };
    }

    const match = this.engine.firstMatch({
      rules: Array.isArray(bank.rules) ? bank.rules : [],
      policyBank: bank,
      runtime: {
        signals: {
          category: String(input.category || "").trim().toLowerCase(),
          severity: String(input.severity || "").trim().toLowerCase(),
        },
      },
    });
    if (!match) {
      return {
        matched: false,
        action: "monitor",
        reasonCode: null,
        target: null,
        slaMinutes: null,
      };
    }

    return {
      matched: true,
      action: String(match.then.action || "monitor"),
      reasonCode: match.reasonCode,
      target: String(match.then.target || "").trim() || null,
      slaMinutes: Number.isFinite(Number(match.then.slaMinutes))
        ? Number(match.then.slaMinutes)
        : null,
    };
  }
}
