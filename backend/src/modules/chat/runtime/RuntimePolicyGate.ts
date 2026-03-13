import type { ChatRequest } from "../domain/chat.contracts";
import { CompliancePolicyService } from "../../../services/core/policy/compliancePolicy.service";
import { RefusalPolicyService } from "../../../services/core/policy/refusalPolicy.service";

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export type RuntimePolicyGateDecision =
  | { blocked: false }
  | {
      blocked: true;
      code: string;
      status: "blocked" | "clarification_required";
    };

export class RuntimePolicyGate {
  constructor(
    private readonly compliancePolicy = new CompliancePolicyService(),
    private readonly refusalPolicy = new RefusalPolicyService(),
  ) {}

  evaluate(req: ChatRequest): RuntimePolicyGateDecision {
    const compliance = this.compliancePolicy.decide({
      meta: asObject(req.meta),
      context: asObject(req.context),
    });
    if (compliance.blocked) {
      return {
        blocked: true,
        code: String(compliance.reasonCode || "compliance_blocked"),
        status: "blocked",
      };
    }

    const refusal = this.refusalPolicy.decide({
      meta: asObject(req.meta),
      context: asObject(req.context),
    });
    if (refusal.blocked) {
      return {
        blocked: true,
        code: "policy_refusal_required",
        status: "blocked",
      };
    }

    return { blocked: false };
  }
}
