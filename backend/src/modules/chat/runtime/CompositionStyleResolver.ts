import { getOptionalBank } from "../../domain/infra";
import { asObject } from "./chatComposeShared";
import type { AnswerMode, ChatRequest } from "../domain/chat.contracts";
import type { EvidencePack } from "../../../services/core/retrieval/retrieval.types";

type StyleDecision = {
  voiceProfile: string;
  domainVoiceModifier: string;
  interactionModifier: string;
  answerStrategy: string;
  templateFamily: string;
  uncertaintyBand: string;
  openerFamily: string;
  rhythmProfile: string;
  claimStrengthProfile: string;
  clarificationPolicy: string;
  fallbackPosture: string;
  paragraphPlan: string;
  empathyBudget: number;
  turnStyleStateKey: string;
  repetitionGuard: string[];
  antiRoboticFocus: string[];
  empathyMode: string | null;
};

type MaybeBank = Record<string, unknown> | null;

function getBank(bankId: string): MaybeBank {
  return getOptionalBank<Record<string, unknown>>(bankId);
}

function listIds(value: unknown, key = "id"): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(asObject(entry)[key] || "").trim())
    .filter(Boolean);
}

function hasId(value: unknown, id: string): boolean {
  return listIds(value).includes(id);
}

export class CompositionStyleResolver {
  resolve(params: {
    req: ChatRequest;
    retrievalPack: EvidencePack | null;
    answerMode?: AnswerMode | string | null;
    evidenceStrength?: string | null;
    history?: Array<{ role: string; content: string }> | null;
  }): StyleDecision {
    const { req, retrievalPack } = params;
    const answerMode = String(params.answerMode || "").trim().toLowerCase();
    const evidenceStrength = String(params.evidenceStrength || "")
      .trim()
      .toLowerCase();
    const meta = asObject(req.meta);
    const baseContext = asObject(req.context);
    const signals = asObject(baseContext.signals);
    const domain = String(
      meta.domain || meta.domainId || signals.domain || signals.domainId || "",
    )
      .trim()
      .toLowerCase();
    const audience = String(signals.audience || meta.audience || "")
      .trim()
      .toLowerCase();
    const userRequestedShort =
      req.truncationRetry === true ||
      signals.userRequestedShort === true ||
      signals.shortAnswer === true;
    const hasTables = Boolean(
      retrievalPack?.evidence?.some((item) => item.evidenceType === "table"),
    );
    const isSensitive =
      signals.safetyGate === true ||
      domain === "medical" ||
      domain === "identity" ||
      domain === "legal";

    const voiceBank = getBank("voice_personality_profiles");
    const strategyBank = getBank("answer_strategies");
    const templateBank = getBank("response_templates");
    const empathyBank = getBank("empathy_and_support_language");
    const uncertaintyBank = getBank("uncertainty_calibration");
    const openerBank = getBank("openers_and_framing");
    const rhythmBank = getBank("sentence_rhythm_and_variety");
    const repetitionBank = getBank("anti_repetition_patterns");
    const claimStrengthBank = getBank("claim_strength_language");

    const voiceProfile = this.resolveVoiceProfile({
      audience,
      domain,
      isSensitive,
      userRequestedShort,
      voiceBank,
    });
    const domainVoiceModifier = this.resolveDomainVoiceModifier(domain, isSensitive);
    const interactionModifier = this.resolveInteractionModifier({
      answerMode,
      evidenceStrength,
      isSensitive,
      userRequestedShort,
    });
    const answerStrategy = this.resolveAnswerStrategy({
      answerMode,
      hasTables,
      evidenceStrength,
      strategyBank,
    });
    const templateFamily = this.resolveTemplateFamily({
      answerMode,
      hasTables,
      templateBank,
    });
    const uncertaintyBand = this.resolveUncertaintyBand(
      evidenceStrength,
      uncertaintyBank,
    );
    const openerFamily = this.resolveOpenerFamily({
      answerMode,
      domain,
      voiceProfile,
      openerBank,
      voiceBank,
    });
    const rhythmProfile = this.resolveRhythmProfile({
      answerMode,
      audience,
      isSensitive,
      rhythmBank,
    });
    const claimStrengthProfile = this.resolveClaimStrengthProfile(
      evidenceStrength,
      claimStrengthBank,
    );
    const clarificationPolicy = this.resolveClarificationPolicy({
      answerMode,
      evidenceStrength,
      hasTables,
    });
    const fallbackPosture = this.resolveFallbackPosture({
      evidenceStrength,
      isSensitive,
      answerMode,
    });
    const paragraphPlan = this.resolveParagraphPlan({
      answerMode,
      audience,
      hasTables,
      isSensitive,
      userRequestedShort,
    });
    const repetitionGuard = this.resolveRepetitionGuard(repetitionBank);
    const empathyMode = this.resolveEmpathyMode({
      domain,
      containsSensitivePersonalData:
        signals.containsSensitivePersonalData === true ||
        meta.containsSensitivePersonalData === true,
      empathyBank,
    });
    const empathyBudget = empathyMode === "identity_or_privacy" ? 1 : empathyMode ? 2 : 0;

    const antiRoboticFocus = this.resolveAntiRoboticFocus({
      answerMode,
      userRequestedShort,
      evidenceStrength,
      hasTables,
    });

    return {
      voiceProfile,
      domainVoiceModifier,
      interactionModifier,
      answerStrategy,
      templateFamily,
      uncertaintyBand,
      openerFamily,
      rhythmProfile,
      claimStrengthProfile,
      clarificationPolicy,
      fallbackPosture,
      paragraphPlan,
      empathyBudget,
      turnStyleStateKey: [
        voiceProfile,
        domainVoiceModifier,
        openerFamily,
        rhythmProfile,
        paragraphPlan,
      ]
        .filter(Boolean)
        .join(":"),
      repetitionGuard,
      antiRoboticFocus,
      empathyMode,
    };
  }

  private resolveVoiceProfile(params: {
    audience: string;
    domain: string;
    isSensitive: boolean;
    userRequestedShort: boolean;
    voiceBank: MaybeBank;
  }): string {
    const candidates = listIds(asObject(params.voiceBank).profiles);
    const fallback = candidates.includes("balanced_operator")
      ? "balanced_operator"
      : candidates[0] || "balanced_operator";
    if (params.isSensitive) {
      return candidates.includes("supportive_sensitive")
        ? "supportive_sensitive"
        : fallback;
    }
    if (params.audience === "executive" || params.userRequestedShort) {
      return candidates.includes("executive_brief")
        ? "executive_brief"
        : fallback;
    }
    if (params.audience === "analyst") {
      return candidates.includes("analyst_precise")
        ? "analyst_precise"
        : fallback;
    }
    if (params.domain === "legal") {
      return candidates.includes("legal_cautious")
        ? "legal_cautious"
        : fallback;
    }
    if (params.domain === "finance" || params.domain === "accounting") {
      return candidates.includes("finance_sharp")
        ? "finance_sharp"
        : fallback;
    }
    if (params.domain === "ops") {
      return candidates.includes("ops_clear") ? "ops_clear" : fallback;
    }
    if (params.audience === "general_user") {
      return candidates.includes("general_user_explainer")
        ? "general_user_explainer"
        : fallback;
    }
    return fallback;
  }

  private resolveAnswerStrategy(params: {
    answerMode: string;
    hasTables: boolean;
    evidenceStrength: string;
    strategyBank: MaybeBank;
  }): string {
    const strategyIds = listIds(asObject(params.strategyBank).strategies);
    const fallback = strategyIds.includes("direct_answer_then_support")
      ? "direct_answer_then_support"
      : strategyIds[0] || "direct_answer_then_support";
    if (params.answerMode === "doc_grounded_quote") {
      return strategyIds.includes("quote_then_explain")
        ? "quote_then_explain"
        : fallback;
    }
    if (params.answerMode === "doc_grounded_table" || params.hasTables) {
      return strategyIds.includes("table_then_takeaway")
        ? "table_then_takeaway"
        : fallback;
    }
    if (params.answerMode === "help_steps") {
      return strategyIds.includes("status_then_action")
        ? "status_then_action"
        : fallback;
    }
    if (params.answerMode.includes("compare")) {
      return strategyIds.includes("compare_then_why_it_matters")
        ? "compare_then_why_it_matters"
        : fallback;
    }
    if (params.evidenceStrength === "low" || params.evidenceStrength === "missing") {
      return strategyIds.includes("scope_limit_then_safe_answer")
        ? "scope_limit_then_safe_answer"
        : fallback;
    }
    return fallback;
  }

  private resolveDomainVoiceModifier(domain: string, isSensitive: boolean): string {
    if (isSensitive) return "sensitive_grounded";
    if (domain === "legal") return "legal_exact";
    if (domain === "finance" || domain === "accounting") return "finance_analytic";
    if (domain === "medical") return "medical_bounded";
    if (domain === "ops") return "operator_directional";
    return "general_plain";
  }

  private resolveInteractionModifier(params: {
    answerMode: string;
    evidenceStrength: string;
    isSensitive: boolean;
    userRequestedShort: boolean;
  }): string {
    if (params.userRequestedShort) return "compressed";
    if (params.isSensitive) return "steady";
    if (params.evidenceStrength === "low" || params.evidenceStrength === "missing") {
      return "guarded";
    }
    if (params.answerMode.includes("compare")) return "comparative";
    if (params.answerMode === "help_steps") return "operational";
    return "standard";
  }

  private resolveTemplateFamily(params: {
    answerMode: string;
    hasTables: boolean;
    templateBank: MaybeBank;
  }): string {
    const templateIds = listIds(asObject(params.templateBank).templates);
    if (params.answerMode === "doc_grounded_quote") {
      return templateIds.some((id) => id.startsWith("TML_QUOTE_EXPLANATION"))
        ? "quote_explanation"
        : "direct_answer";
    }
    if (params.answerMode === "doc_grounded_table" || params.hasTables) {
      return templateIds.some((id) => id.startsWith("TML_TABLE_READOUT"))
        ? "table_readout"
        : "direct_answer";
    }
    if (params.answerMode.includes("compare")) {
      return templateIds.some((id) => id.startsWith("TML_COMPARE_DELTA"))
        ? "compare_delta"
        : "direct_answer";
    }
    if (params.answerMode === "help_steps") return "direct_answer";
    return "direct_answer";
  }

  private resolveUncertaintyBand(
    evidenceStrength: string,
    uncertaintyBank: MaybeBank,
  ): string {
    const bands = listIds(asObject(uncertaintyBank).bands);
    if (evidenceStrength === "high" && bands.includes("high_confidence")) {
      return "high_confidence";
    }
    if (
      (evidenceStrength === "low" || evidenceStrength === "missing") &&
      bands.includes("low_confidence")
    ) {
      return "low_confidence";
    }
    if (bands.includes("medium_confidence")) return "medium_confidence";
    return bands[0] || "medium_confidence";
  }

  private resolveOpenerFamily(params: {
    answerMode: string;
    domain: string;
    voiceProfile: string;
    openerBank: MaybeBank;
    voiceBank: MaybeBank;
  }): string {
    const familiesObject = asObject(params.openerBank).families;
    const families = Object.keys(
      familiesObject && typeof familiesObject === "object" ? familiesObject : {},
    );
    const voiceProfiles = Array.isArray(asObject(params.voiceBank).profiles)
      ? (asObject(params.voiceBank).profiles as Array<Record<string, unknown>>)
      : [];
    const profile =
      voiceProfiles.find(
        (entry) => String(asObject(entry).id || "").trim() === params.voiceProfile,
      ) || null;
    const sentenceBehavior = asObject(asObject(profile).sentenceBehavior);
    const preferredOpeners = Array.isArray(sentenceBehavior.preferredOpeners)
      ? sentenceBehavior.preferredOpeners
          .map((entry) => String(entry || "").trim())
          .filter(Boolean)
      : [];

    if (params.answerMode.includes("compare") && families.includes("delta_first")) {
      return "delta_first";
    }
    if (
      params.answerMode === "doc_grounded_quote" &&
      families.includes("evidence_anchor")
    ) {
      return "evidence_anchor";
    }
    if (
      (params.domain === "legal" || params.domain === "medical") &&
      families.includes("stabilize_then_answer")
    ) {
      return "stabilize_then_answer";
    }
    const preferred = preferredOpeners.find((entry) => families.includes(entry));
    if (preferred) return preferred;
    if (families.includes("direct_answer")) return "direct_answer";
    return families[0] || "direct_answer";
  }

  private resolveRhythmProfile(params: {
    answerMode: string;
    audience: string;
    isSensitive: boolean;
    rhythmBank: MaybeBank;
  }): string {
    const patternIds = listIds(asObject(params.rhythmBank).patterns);
    if (params.answerMode.includes("compare") && patternIds.includes("compare_pulse")) {
      return "compare_pulse";
    }
    if (params.answerMode === "help_steps" && patternIds.includes("action_runway")) {
      return "action_runway";
    }
    if (params.isSensitive && patternIds.includes("careful_two_step")) {
      return "careful_two_step";
    }
    if (params.audience === "executive" && patternIds.includes("short_then_supported")) {
      return "short_then_supported";
    }
    if (params.audience === "analyst" && patternIds.includes("dense_then_release")) {
      return "dense_then_release";
    }
    if (patternIds.includes("medium_then_short_takeaway")) {
      return "medium_then_short_takeaway";
    }
    return patternIds[0] || "short_then_supported";
  }

  private resolveClaimStrengthProfile(
    evidenceStrength: string,
    claimStrengthBank: MaybeBank,
  ): string {
    const levelIds = listIds(asObject(claimStrengthBank).levels);
    if (evidenceStrength === "high" && levelIds.includes("strong")) return "strong";
    if (
      (evidenceStrength === "low" || evidenceStrength === "missing") &&
      levelIds.includes("weak")
    ) {
      return "weak";
    }
    if (levelIds.includes("moderate")) return "moderate";
    return levelIds[0] || "moderate";
  }

  private resolveClarificationPolicy(params: {
    answerMode: string;
    evidenceStrength: string;
    hasTables: boolean;
  }): string {
    if (params.evidenceStrength === "missing") return "single_best_question";
    if (params.evidenceStrength === "low") return "clarify_only_if_blocked";
    if (params.answerMode === "doc_grounded_table" || params.hasTables) {
      return "prefer_answer_then_table_gap";
    }
    return "answer_directly_without_clarifier";
  }

  private resolveFallbackPosture(params: {
    evidenceStrength: string;
    isSensitive: boolean;
    answerMode: string;
  }): string {
    if (params.evidenceStrength === "missing") {
      return "not_enough_evidence_then_best_next_step";
    }
    if (params.evidenceStrength === "low") {
      return "bounded_answer_then_limit";
    }
    if (params.isSensitive) return "steady_answer_then_boundary";
    if (params.answerMode === "help_steps") return "status_then_action";
    return "direct_answer";
  }

  private resolveParagraphPlan(params: {
    answerMode: string;
    audience: string;
    hasTables: boolean;
    isSensitive: boolean;
    userRequestedShort: boolean;
  }): string {
    if (params.userRequestedShort || params.audience === "executive") {
      return "single_paragraph_compressed";
    }
    if (params.answerMode.includes("compare")) return "delta_then_implication_blocks";
    if (params.answerMode === "help_steps") return "status_constraint_action";
    if (params.answerMode === "doc_grounded_table" || params.hasTables) {
      return "table_readout_then_takeaway";
    }
    if (params.isSensitive) return "steady_answer_then_boundary";
    return "answer_support_implication";
  }

  private resolveRepetitionGuard(repetitionBank: MaybeBank): string[] {
    const patterns = asObject(repetitionBank).patterns;
    if (!Array.isArray(patterns)) return ["vary_sentence_entry"];
    const ids = patterns
      .map((entry) => String(asObject(entry).id || "").trim())
      .filter(Boolean);
    return ids.slice(0, 4).length > 0 ? ids.slice(0, 4) : ["vary_sentence_entry"];
  }

  private resolveEmpathyMode(params: {
    domain: string;
    containsSensitivePersonalData: boolean;
    empathyBank: MaybeBank;
  }): string | null {
    const situations = asObject(params.empathyBank).situations;
    if (!Array.isArray(situations)) return null;
    if (params.domain === "medical" && hasId(situations, "medical_results")) {
      return "medical_results";
    }
    if (params.domain === "legal" && hasId(situations, "legal_exposure")) {
      return "legal_exposure";
    }
    if (
      (params.domain === "identity" ||
        params.domain === "insurance" ||
        params.containsSensitivePersonalData) &&
      hasId(situations, "identity_or_privacy")
    ) {
      return "identity_or_privacy";
    }
    return null;
  }

  private resolveAntiRoboticFocus(params: {
    answerMode: string;
    userRequestedShort: boolean;
    evidenceStrength: string;
    hasTables: boolean;
  }): string[] {
    const focus = new Set<string>(["no_generic_leadins", "synthesize_then_support"]);
    if (params.userRequestedShort) focus.add("compression_without_stiffness");
    if (params.answerMode === "doc_grounded_quote") focus.add("plain_quote_explanation");
    if (params.answerMode === "doc_grounded_table" || params.hasTables) {
      focus.add("table_then_takeaway");
    }
    if (params.evidenceStrength === "low" || params.evidenceStrength === "missing") {
      focus.add("bounded_uncertainty");
    }
    if (params.answerMode.includes("compare")) focus.add("delta_first");
    return Array.from(focus);
  }
}

export type { StyleDecision };
