import { getOptionalBank } from "../banks/bankLoader.service";
import { PolicyRuntimeEngine, type PolicyRule } from "./policyRuntimeEngine.service";

type CompliancePolicyBank = {
  config?: {
    enabled?: boolean;
  };
  rules?: PolicyRule[];
};

export type ComplianceDecision = {
  blocked: boolean;
  reasonCode?: string;
  message?: string;
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export class CompliancePolicyService {
  private readonly engine = new PolicyRuntimeEngine();

  decide(input: {
    meta?: Record<string, unknown> | null;
    context?: Record<string, unknown> | null;
  }): ComplianceDecision {
    const policy = getOptionalBank<CompliancePolicyBank>("compliance_policy");
    if (!policy?.config?.enabled) return { blocked: false };

    const meta = asObject(input.meta);
    const context = asObject(input.context);
    const contextSignals = asObject(context.signals);

    const runtime = {
      signals: {
        complianceRequired:
          contextSignals.complianceRequired === true ||
          asObject(meta.compliance).required === true,
        userConsent: asObject(meta.compliance).userConsent === true,
        exportRestricted: asObject(meta.compliance).exportRestricted === true,
        legalHoldActive: asObject(meta.compliance).legalHoldActive === true,
      },
    } as Record<string, unknown>;

    const match = this.engine.firstMatch({
      rules: Array.isArray(policy.rules) ? policy.rules : [],
      runtime,
    });

    if (!match) return { blocked: false };

    const message = String(match.then.userMessage || "").trim();
    return {
      blocked: true,
      reasonCode: match.reasonCode || "compliance_blocked",
      message,
    };
  }
}
