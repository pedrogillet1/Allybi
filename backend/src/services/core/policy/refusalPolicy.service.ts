import { getOptionalBank } from "../banks/bankLoader.service";
import { PolicyRuntimeEngine, type PolicyRule } from "./policyRuntimeEngine.service";
import {
  allowPolicyDecision,
  blockedFromAction,
  type PolicyDecision,
} from "./policyDecision";

type RefusalPolicyBank = {
  config?: {
    enabled?: boolean;
    strict?: boolean;
    failClosedInProd?: boolean;
    maxRefusalSentences?: number;
  };
  rules?: PolicyRule[];
};

export type RefusalPolicyDecision = PolicyDecision & {
  blocked: boolean;
  responseType?: string | null;
  safeAlternatives?: string[];
  copyBankId?: string | null;
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function extractPolicySignals(input: Record<string, unknown>): Record<string, unknown> {
  const meta = asObject(input.meta);
  const context = asObject(input.context);
  const contextSignals = asObject(context.signals);
  const policySignals = asObject(meta.policy);

  return {
    selfHarm: asBoolean(policySignals.selfHarm) || asBoolean(contextSignals.selfHarm),
    suicide: asBoolean(policySignals.suicide),
    sexualMinors: asBoolean(policySignals.sexualMinors),
    malware: asBoolean(policySignals.malware),
    exploitation: asBoolean(policySignals.exploitation),
    credentialTheft: asBoolean(policySignals.credentialTheft),
    bypass: asBoolean(policySignals.bypass),
    weapons: asBoolean(policySignals.weapons),
    illicitInstructions:
      asBoolean(policySignals.illicitInstructions) ||
      asBoolean(policySignals.illegalActivity),
    illegalActivity: asBoolean(policySignals.illegalActivity),
    sensitivePersonalDataExtraction: asBoolean(
      policySignals.sensitivePersonalDataExtraction,
    ),
    doxxing: asBoolean(policySignals.doxxing),
    copyright: asBoolean(policySignals.copyright),
    highStakesMedicalInstruction: asBoolean(
      policySignals.highStakesMedicalInstruction,
    ),
    highStakesLegalInstruction: asBoolean(policySignals.highStakesLegalInstruction),
    policyRefusalRequired: asBoolean(policySignals.policyRefusalRequired),
  };
}

export class RefusalPolicyService {
  private readonly engine = new PolicyRuntimeEngine();

  decide(input: {
    meta?: Record<string, unknown> | null;
    context?: Record<string, unknown> | null;
  }): RefusalPolicyDecision {
    const bank = getOptionalBank<RefusalPolicyBank>("refusal_policy");
    if (!bank?.config?.enabled) {
      return { ...allowPolicyDecision(), blocked: false };
    }

    const signals = extractPolicySignals({
      meta: input.meta || {},
      context: input.context || {},
    });

    const runtime = {
      signals: {
        policy: signals,
        policyRefusalRequired: Boolean(signals.policyRefusalRequired),
      },
    } as Record<string, unknown>;

    const match = this.engine.firstMatch({
      rules: Array.isArray(bank.rules) ? bank.rules : [],
      runtime,
    });
    if (!match) return { ...allowPolicyDecision(), blocked: false };

    const action = String(match.then.action || "refuse").trim() || "refuse";
    const constraints =
      match.then.constraints && typeof match.then.constraints === "object"
        ? (match.then.constraints as Record<string, unknown>)
        : null;

    return {
      blocked: blockedFromAction(action),
      category: String(match.then.category || "other"),
      responseType: String(match.then.responseType || "generic_refusal"),
      action,
      terminal: match.terminal === true,
      reasonCode: match.reasonCode || "policy_refusal_required",
      ruleId: match.ruleId || null,
      routeTo: null,
      constraints,
      safeAlternatives: Array.isArray(match.then.safeAlternatives)
        ? match.then.safeAlternatives
            .map((item) => String(item || "").trim())
            .filter(Boolean)
        : [],
      copyBankId: String(match.then.responseBank || "refusal_phrases").trim() || null,
    };
  }
}
