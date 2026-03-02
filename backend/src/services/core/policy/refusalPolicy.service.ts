/* eslint-disable @typescript-eslint/no-explicit-any */

import { getOptionalBank } from "../banks/bankLoader.service";
import { PolicyRuntimeEngine, type PolicyRule } from "./policyRuntimeEngine.service";

type RefusalPolicyBank = {
  config?: {
    enabled?: boolean;
    strict?: boolean;
    failClosedInProd?: boolean;
    maxRefusalSentences?: number;
  };
  rules?: PolicyRule[];
};

export type RefusalPolicyDecision = {
  blocked: boolean;
  category?: string;
  responseType?: string;
  action?: string;
  reasonCode?: string;
  ruleId?: string;
  safeAlternatives?: string[];
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function normalizeLanguage(language?: string): "en" | "pt" | "es" {
  const raw = String(language || "").trim().toLowerCase();
  if (raw === "pt") return "pt";
  if (raw === "es") return "es";
  return "en";
}

function extractPolicySignals(input: Record<string, unknown>): Record<string, unknown> {
  const meta = asObject(input.meta);
  const context = asObject(input.context);
  const contextSignals = asObject(context.signals);
  const policySignals = asObject(meta.policy);

  return {
    selfHarm: asBoolean(policySignals.selfHarm) || asBoolean((contextSignals as any).selfHarm),
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
    if (!bank?.config?.enabled) return { blocked: false };

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
    if (!match) return { blocked: false };

    return {
      blocked: true,
      category: String(match.then.category || "other"),
      responseType: String(match.then.responseType || "generic_refusal"),
      action: String(match.then.action || "refuse"),
      reasonCode: match.reasonCode || "policy_refusal_required",
      ruleId: match.ruleId,
      safeAlternatives: Array.isArray(match.then.safeAlternatives)
        ? match.then.safeAlternatives
            .map((item) => String(item || "").trim())
            .filter(Boolean)
        : [],
    };
  }

  buildUserFacingText(input: {
    decision: RefusalPolicyDecision;
    preferredLanguage?: string;
  }): string {
    const lang = normalizeLanguage(input.preferredLanguage);
    const category = String(input.decision.category || "other").trim();
    const hasAlternative =
      Array.isArray(input.decision.safeAlternatives) &&
      input.decision.safeAlternatives.length > 0;

    if (lang === "pt") {
      const base =
        category === "self_harm"
          ? "Nao posso ajudar com isso."
          : "Nao posso ajudar com esse pedido.";
      if (!hasAlternative) return base;
      return `${base} Posso ajudar com uma alternativa segura se quiser.`;
    }

    if (lang === "es") {
      const base =
        category === "self_harm"
          ? "No puedo ayudar con eso."
          : "No puedo ayudar con esa solicitud.";
      if (!hasAlternative) return base;
      return `${base} Si quieres, te ayudo con una alternativa segura.`;
    }

    const base =
      category === "self_harm"
        ? "I can’t help with that."
        : "I can’t help with that request.";
    if (!hasAlternative) return base;
    return `${base} I can help with a safer alternative.`;
  }
}
