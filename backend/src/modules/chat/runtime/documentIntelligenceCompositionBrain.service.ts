import { getOptionalBank } from "../../domain/infra";

type BrainLanguage = "en" | "pt" | "es";

type BrainFollowup = { label: string; query: string };

type BrainRecord = Record<string, unknown>;

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeLanguage(language?: string | null): BrainLanguage {
  const raw = String(language || "").trim().toLowerCase();
  if (raw === "pt") return "pt";
  if (raw === "es") return "es";
  return "en";
}

function normalizeIntent(value: unknown): string {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (!raw) return "extract";
  if (raw === "doc_grounded_multi" || raw === "compare") return "compare";
  if (raw === "doc_grounded_table") return "table";
  if (raw === "locate_content") return "locate_content";
  if (raw.startsWith("doc_grounded")) return "extract";
  return raw;
}

function fillSlots(template: string, slots: Record<string, string>): string {
  return String(template || "").replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    const value = String(slots[key] || "").trim();
    return value || "";
  });
}

export class DocumentIntelligenceCompositionBrainService {
  private getBank(bankId: string): BrainRecord | null {
    const bank = getOptionalBank<BrainRecord>(bankId);
    if (bank && asObject(bank.config).enabled !== false) {
      return bank;
    }
    return null;
  }

  private getIdentityDirectives(): {
    assistantName: string;
    stance: string;
    mission: string;
    can: string[];
    cannot: string[];
    behaviorRules: string[];
  } {
    const identityBank = this.getBank("assistant_identity");
    const missionBank = this.getBank("mission_and_non_goals");
    const capabilitiesBank = this.getBank("help_and_capabilities");
    const contractBank = this.getBank("behavioral_contract");

    return {
      assistantName: String(asObject(identityBank?.identity).name || "Allybi").trim() || "Allybi",
      stance:
        String(asObject(identityBank?.identity).stance || "evidence_first").trim() ||
        "evidence_first",
      mission:
        String(asObject(missionBank?.mission).primary || "Answer with document-grounded evidence.")
          .trim() || "Answer with document-grounded evidence.",
      can: asArray<string>(asObject(capabilitiesBank?.capabilities).can).slice(0, 3),
      cannot: asArray<string>(asObject(capabilitiesBank?.capabilities).cannot).slice(0, 3),
      behaviorRules: asArray<string>(contractBank?.rules).slice(0, 4),
    };
  }

  resolveClarificationBypass(input: {
    question: string;
    preferredLanguage?: string | null;
  }): string {
    const lang = normalizeLanguage(input.preferredLanguage);
    const repairBank = this.getBank("clarification_question_bank");
    const promptBank = this.getBank("clarification_prompts");
    const bankPrompt = asArray<BrainRecord>(promptBank?.prompts).find((entry) =>
      String(entry.id || "").trim() === "CLAR_001_scope_ambiguous_doc",
    );
    const repairTemplate = asObject(repairBank?.questionFrames)[lang];
    const openerTemplate =
      typeof repairTemplate === "string"
        ? repairTemplate
        : typeof bankPrompt?.prompt === "object"
          ? String(asObject(bankPrompt.prompt)[lang] || "")
          : "";
    const fallback =
      lang === "pt"
        ? "Preciso de uma clarificacao para responder com precisao: {{question}}"
        : lang === "es"
          ? "Necesito una aclaracion para responder con precision: {{question}}"
          : "I need one clarification to answer precisely: {{question}}";
    const selected = String(openerTemplate || fallback).trim();
    return fillSlots(selected, {
      question: String(input.question || "").trim(),
      options: String(input.question || "").trim(),
    }).trim();
  }

  resolveInsufficientEvidenceMessage(preferredLanguage?: string | null): string {
    const lang = normalizeLanguage(preferredLanguage);
    const repairBank = this.getBank("not_enough_evidence");
    const fallbackBank = this.getBank("fallback_messages");
    const direct = asObject(repairBank?.messages)[lang];
    if (typeof direct === "string" && direct.trim()) return direct.trim();
    const fallbackMessages = asObject(fallbackBank?.messages);
    const localized = asObject(fallbackMessages[lang]).missingEvidence;
    if (typeof localized === "string" && localized.trim()) return localized.trim();
    return "I could not find enough evidence in your documents to answer safely.";
  }

  resolveOverflowRepairMessage(preferredLanguage?: string | null): string {
    const lang = normalizeLanguage(preferredLanguage);
    const repairBank = this.getBank("partial_answer_recovery");
    const recovery = asObject(repairBank?.overflowRecovery);
    const localized = recovery[lang];
    if (typeof localized === "string" && localized.trim()) return localized.trim();
    return lang === "pt"
      ? "A tabela foi interrompida antes de concluir. Posso reenviar em bullets para evitar corte."
      : lang === "es"
        ? "La tabla se interrumpio antes de terminar. Puedo reenviarla en vietas para evitar cortes."
        : "The table was cut before completion. I can resend it as bullets to avoid truncation.";
  }

  buildFollowups(input: {
    preferredLanguage?: string | null;
    answerMode: string;
    topic: string;
    document: string;
    otherDocument: string;
    hasMultipleDocs: boolean;
    desiredCount: number;
  }): BrainFollowup[] {
    const lang = normalizeLanguage(input.preferredLanguage);
    const intent = normalizeIntent(input.answerMode);
    const bank = this.getBank("followup_suggestions");
    const allowedIntents = new Set<string>([intent, "extract"]);
    if (input.hasMultipleDocs) {
      allowedIntents.add("compare");
    }
    const suggestions = asArray<BrainRecord>(bank?.suggestions).filter((entry) => {
      if (String(entry.language || "en").trim().toLowerCase() !== lang) return false;
      return allowedIntents.has(normalizeIntent(entry.intent));
    });
    const selected: BrainFollowup[] = [];
    for (const entry of suggestions) {
      const label = String(entry.text || "").trim();
      const queryTemplate = String(entry.query || "").trim();
      if (!label || !queryTemplate) continue;
      const query = fillSlots(queryTemplate, {
        document: input.document,
        otherDocument: input.otherDocument,
        topic: input.topic,
      }).replace(/\s+/g, " ").trim();
      selected.push({ label, query });
      if (selected.length >= Math.max(1, Math.min(3, input.desiredCount))) break;
    }
    return selected;
  }

  buildPromptSignals(input: {
    preferredLanguage?: string | null;
    answerMode: string;
    domain?: string | null;
    userRequestedShort: boolean;
  }): Record<string, unknown> {
    const lang = normalizeLanguage(input.preferredLanguage);
    const identity = this.getIdentityDirectives();
    const toneProfiles = this.getBank("tone_profiles");
    const voiceProfiles = this.getBank("voice_personality_profiles");
    const hedging = this.getBank("hedging_and_uncertainty_language");
    const antiRobotic = this.getBank("anti_robotic_style_rules");
    const tablePolicy = this.getBank("table_render_policy");
    const verbosity = this.getBank("verbosity_ladder");
    const transitions = this.getBank("transition_phrases");
    const verbs = this.getBank("verb_phrase_bank");

    const toneProfile = asArray<BrainRecord>(toneProfiles?.profiles).find((entry) => {
      const domain = String(entry.domain || "any").trim().toLowerCase();
      return domain === String(input.domain || "").trim().toLowerCase() || domain === "any";
    });
    const voiceProfile = asArray<BrainRecord>(voiceProfiles?.profiles).find(
      (entry) => String(entry.id || "").trim().toLowerCase() === "balanced",
    );
    const uncertaintyPhrases = asArray<string>(asObject(hedging?.phrases)[lang]).slice(0, 3);
    const transitionPhrases = asArray<string>(asObject(transitions?.phrases)[lang]).slice(0, 4);
    const verbPhrases = asArray<string>(asObject(verbs?.phrases)[lang]).slice(0, 3);

    return {
      assistantName: identity.assistantName,
      assistantStance: identity.stance,
      mission: identity.mission,
      identityCan: identity.can,
      identityCannot: identity.cannot,
      behaviorRules: identity.behaviorRules,
      compositionTone: String(toneProfile?.primaryTone || "balanced"),
      compositionToneRules: asArray<string>(toneProfile?.wordingRules).slice(0, 3),
      voiceProfile: String(voiceProfile?.id || "balanced"),
      voiceTraits: asArray<string>(voiceProfile?.traits).slice(0, 3),
      uncertaintyPhrases,
      antiRoboticRuleCount: asArray(antiRobotic?.rules).length,
      preserveTableHeaders: asObject(tablePolicy?.config).preserveHeaders === true,
      preserveTableUnits: asObject(tablePolicy?.config).preserveUnits === true,
      preferredVerbosity:
        input.userRequestedShort
          ? "short"
          : input.answerMode === "doc_grounded_multi" || input.answerMode === "doc_grounded_table"
            ? "detailed"
            : "balanced",
      verbosityWordBudget:
        asObject(asObject(verbosity?.levels).detailed).maxWords ||
        asObject(asObject(verbosity?.levels).balanced).maxWords ||
        220,
      transitionPhrases,
      verbPhrases,
    };
  }

  buildPromptAddendum(input: {
    preferredLanguage?: string | null;
    answerMode: string;
    domain?: string | null;
    evidenceConfidence?: number | null;
  }): string[] {
    const lang = normalizeLanguage(input.preferredLanguage);
    const identity = this.getIdentityDirectives();
    const signals = this.buildPromptSignals({
      preferredLanguage: lang,
      answerMode: input.answerMode,
      domain: input.domain,
      userRequestedShort: false,
    });
    const openers = this.getBank("openers");
    const closers = this.getBank("closers");
    const selectedOpener = asArray<BrainRecord>(openers?.openers).find(
      (entry) =>
        String(entry.language || "").trim().toLowerCase() === lang &&
        normalizeIntent(entry.intent) === normalizeIntent(input.answerMode),
    );
    const selectedCloser = asArray<BrainRecord>(closers?.closers).find(
      (entry) => String(entry.language || "").trim().toLowerCase() === lang,
    );

    const lines = [
      "### Composition Brain",
      `Identity: ${identity.assistantName} (${identity.stance})`,
      `Mission: ${identity.mission}`,
      `Tone: ${String(signals.compositionTone || "balanced")}`,
      `Voice: ${String(signals.voiceProfile || "balanced")}`,
      "Lead with the answer, then synthesize evidence, then close with a next useful move.",
      "Avoid repetitive sentence starters and avoid extractor-style disclaimers.",
      "Preserve explicit document scope and do not invent unsupported facts.",
      "Use short transitions only when they improve flow.",
    ];
    if (identity.behaviorRules.length > 0) {
      lines.push(`Behavior rules: ${identity.behaviorRules.join("; ")}.`);
    }
    if (identity.cannot.length > 0) {
      lines.push(`Do not: ${identity.cannot.join("; ")}.`);
    }
    if ((input.evidenceConfidence ?? 1) < 0.75) {
      const phrases = asArray<string>(signals.uncertaintyPhrases).join(", ");
      if (phrases) {
        lines.push(`When certainty is limited, use calibrated language such as: ${phrases}.`);
      }
    }
    if (selectedOpener?.text) {
      lines.push(`Preferred opener pattern: ${String(selectedOpener.text).trim()}`);
    }
    if (selectedCloser?.text) {
      lines.push(`Preferred closer pattern: ${String(selectedCloser.text).trim()}`);
    }
    return lines;
  }
}

export function getDocumentIntelligenceCompositionBrain(): DocumentIntelligenceCompositionBrainService {
  return new DocumentIntelligenceCompositionBrainService();
}
