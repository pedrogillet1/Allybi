import { getOptionalBank } from "../banks/bankLoader.service";

export type ComposeLanguage = "en" | "pt" | "es";

type BankItem = Record<string, unknown>;

type OpenersBank = {
  config?: { enabled?: boolean };
  openers?: BankItem[];
};

type FollowupSuggestionsBank = {
  config?: { enabled?: boolean };
  suggestions?: BankItem[];
};

type FallbackMessagesBank = {
  config?: { enabled?: boolean };
  messages?: Record<string, Record<string, string>>;
};

type CitationPolicyBank = {
  config?: {
    enabled?: boolean;
    maxCitationsPerClaim?: number;
  };
};

type HelpMicrocopyBank = {
  config?: { enabled?: boolean };
  messages?: Record<string, Record<string, string>>;
};

type ClosersBank = {
  config?: { enabled?: boolean };
  closers?: BankItem[];
};

type FormatGuardrailsBank = {
  config?: {
    enabled?: boolean;
    maxRowsPerTableChunk?: number;
  };
};

type ToneProfilesBank = {
  config?: {
    enabled?: boolean;
    defaultTone?: string;
  };
};

type VerbosityLadderBank = {
  config?: { enabled?: boolean };
  levels?: {
    short?: { maxWords?: number };
    balanced?: { maxWords?: number };
    detailed?: { maxWords?: number };
  };
};

type VoiceProfilesBank = {
  config?: {
    enabled?: boolean;
    defaultProfile?: string;
  };
};

type ResponseTemplatesBank = {
  config?: { enabled?: boolean };
  templates?: BankItem[];
};

type AntiRoboticRulesBank = {
  config?: { enabled?: boolean };
  rules?: BankItem[];
};

type TableRenderPolicyBank = {
  config?: {
    enabled?: boolean;
    allowTruncation?: boolean;
    maxRowsPerChunk?: number;
  };
};

export const COMPOSE_REQUIRED_BANK_IDS = [
  "anti_robotic_style_rules",
  "citation_policy",
  "closers",
  "format_guardrails",
  "help_microcopy",
  "openers",
  "response_templates",
  "table_render_policy",
  "tone_profiles",
  "verbosity_ladder",
  "voice_personality_profiles",
  "followup_suggestions_v1c6269cc",
  "fallback_messages",
] as const;

export const COMPOSE_BANK_USAGE_POLICY: Readonly<
  Record<
    (typeof COMPOSE_REQUIRED_BANK_IDS)[number],
    "behavioral_primary" | "behavioral_fallback" | "governance_guard"
  >
> = {
  anti_robotic_style_rules: "governance_guard",
  citation_policy: "behavioral_primary",
  closers: "behavioral_fallback",
  format_guardrails: "governance_guard",
  help_microcopy: "behavioral_fallback",
  openers: "behavioral_primary",
  response_templates: "governance_guard",
  table_render_policy: "governance_guard",
  tone_profiles: "governance_guard",
  verbosity_ladder: "governance_guard",
  voice_personality_profiles: "governance_guard",
  followup_suggestions_v1c6269cc: "behavioral_primary",
  fallback_messages: "behavioral_primary",
};

export type AnalyticalCopy = {
  openerLine: string | null;
  familyHeadingLine: string | null;
  directAnswerLabel: string;
  keyEvidenceLabel: string;
  sourcesUsedLabel: string;
  insufficientEvidenceLine: string;
  synthesisLine: string;
  followupLine: string;
  evidenceLinePrefix: string;
  evidenceFallbackLine: string;
  sourceFallbackLine: string;
  maxSourceLines: number;
};

function normalizeString(input: unknown): string {
  return String(input || "").trim();
}

function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function toBankList(value: unknown): BankItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is BankItem =>
      !!entry && typeof entry === "object" && !Array.isArray(entry),
  );
}

function localizeNotFound(lang: ComposeLanguage): string {
  if (lang === "pt") return "Nao encontrei esse arquivo.";
  if (lang === "es") return "No encontre ese archivo.";
  return "I couldn't find that file.";
}

function defaultSynthesisLine(lang: ComposeLanguage): string {
  if (lang === "pt") {
    return "Em resumo, esta resposta esta limitada as evidencias citadas nos documentos.";
  }
  if (lang === "es") {
    return "En resumen, esta respuesta esta limitada a la evidencia citada en los documentos.";
  }
  return "In summary, this answer is constrained to the cited document evidence.";
}

function defaultFollowupLine(lang: ComposeLanguage): string {
  if (lang === "pt") {
    return "Se quiser, tambem posso detalhar isso por secao do documento.";
  }
  if (lang === "es") {
    return "Si quieres, tambien puedo desglosarlo por seccion del documento.";
  }
  return "If you'd like, I can also break this down by document section.";
}

function resolveFamilyHeadingLine(
  lang: ComposeLanguage,
  intent: string,
  hasTemplate: boolean,
): string | null {
  if (!hasTemplate) return null;
  const normalizedIntent = normalizeString(intent).toLowerCase();
  if (normalizedIntent === "compare") {
    if (lang === "pt") return "Resultado da comparacao:";
    if (lang === "es") return "Resultado de la comparacion:";
    return "Comparison result:";
  }
  if (normalizedIntent === "locate_content") {
    if (lang === "pt") return "Resultado da localizacao:";
    if (lang === "es") return "Resultado de la ubicacion:";
    return "Location result:";
  }
  if (normalizedIntent === "summary") {
    if (lang === "pt") return "Resumo:";
    if (lang === "es") return "Resumen:";
    return "Summary:";
  }
  if (normalizedIntent === "not_found") {
    if (lang === "pt") return "Resultado de escopo:";
    if (lang === "es") return "Resultado de alcance:";
    return "Scope result:";
  }
  if (lang === "pt") return "Resultado da extracao:";
  if (lang === "es") return "Resultado de la extraccion:";
  return "Extraction result:";
}

export class ComposeMicrocopyService {
  private openers?: OpenersBank;
  private followups?: FollowupSuggestionsBank;
  private fallbackMessages?: FallbackMessagesBank;
  private citationPolicy?: CitationPolicyBank;
  private helpMicrocopy?: HelpMicrocopyBank;

  // Compose policy banks. These influence guardrails, fallback behavior, and
  // deterministic copy-shaping decisions even when they are not user-visible.
  private closers?: ClosersBank;
  private formatGuardrails?: FormatGuardrailsBank;
  private toneProfiles?: ToneProfilesBank;
  private verbosityLadder?: VerbosityLadderBank;
  private voiceProfiles?: VoiceProfilesBank;
  private responseTemplates?: ResponseTemplatesBank;
  private antiRoboticRules?: AntiRoboticRulesBank;
  private tableRenderPolicy?: TableRenderPolicyBank;

  constructor() {
    this.reloadBanks();
  }

  reloadBanks(): void {
    this.openers = getOptionalBank<OpenersBank>("openers") || undefined;
    // Canonical follow-up source of truth is the versioned compose bank.
    // Legacy bank IDs are intentionally ignored to avoid drift.
    this.followups =
      getOptionalBank<FollowupSuggestionsBank>("followup_suggestions_v1c6269cc") ||
      undefined;
    this.fallbackMessages =
      getOptionalBank<FallbackMessagesBank>("fallback_messages") || undefined;
    this.citationPolicy =
      getOptionalBank<CitationPolicyBank>("citation_policy") || undefined;
    this.helpMicrocopy =
      getOptionalBank<HelpMicrocopyBank>("help_microcopy") || undefined;

    // Keep compose policy banks centralized here.
    this.closers = getOptionalBank<ClosersBank>("closers") || undefined;
    this.formatGuardrails =
      getOptionalBank<FormatGuardrailsBank>("format_guardrails") || undefined;
    this.toneProfiles =
      getOptionalBank<ToneProfilesBank>("tone_profiles") || undefined;
    this.verbosityLadder =
      getOptionalBank<VerbosityLadderBank>("verbosity_ladder") || undefined;
    this.voiceProfiles =
      getOptionalBank<VoiceProfilesBank>("voice_personality_profiles") || undefined;
    this.responseTemplates =
      getOptionalBank<ResponseTemplatesBank>("response_templates") || undefined;
    this.antiRoboticRules =
      getOptionalBank<AntiRoboticRulesBank>("anti_robotic_style_rules") ||
      undefined;
    this.tableRenderPolicy =
      getOptionalBank<TableRenderPolicyBank>("table_render_policy") || undefined;
  }

  resolveAnalyticalCopy(input: {
    language: ComposeLanguage;
    seed: string;
    intent?: string;
  }): AnalyticalCopy {
    const language = input.language;
    const seed = normalizeString(input.seed) || "seed";
    const intent = normalizeString(input.intent).toLowerCase() || "extract";

    const synthesisLine = this.resolveSynthesisLine(language);
    const hasTemplate = this.hasTemplateForIntent(language, intent);

    return {
      openerLine: this.pickOpener({ language, seed, intent }),
      familyHeadingLine: resolveFamilyHeadingLine(language, intent, hasTemplate),
      directAnswerLabel:
        language === "pt"
          ? "Resposta direta"
          : language === "es"
            ? "Respuesta directa"
            : "Direct answer",
      keyEvidenceLabel:
        language === "pt"
          ? "Evidencia principal"
          : language === "es"
            ? "Evidencia clave"
            : "Key evidence",
      sourcesUsedLabel:
        language === "pt"
          ? "Fontes utilizadas"
          : language === "es"
            ? "Fuentes utilizadas"
            : "Sources used",
      insufficientEvidenceLine: this.resolveNotFoundLine(language),
      synthesisLine,
      followupLine: this.pickFollowup({
        language,
        seed,
        intent,
        hasTemplate,
      }),
      evidenceLinePrefix:
        language === "pt"
          ? "Evidencia referenciada em"
          : language === "es"
            ? "Evidencia referenciada en"
            : "Evidence referenced from",
      evidenceFallbackLine:
        language === "pt"
          ? "As evidencias estavam disponiveis apenas como metadados de fonte."
          : language === "es"
            ? "Las evidencias estaban disponibles solo como metadatos de fuente."
            : "Evidence references were available only as source metadata.",
      sourceFallbackLine:
        language === "pt"
          ? "Nenhum metadado de fonte foi fornecido"
          : language === "es"
            ? "No se proporcionaron metadatos de fuente"
            : "No source metadata provided",
      maxSourceLines: this.resolveMaxSourceLines(),
    };
  }

  resolveNotFoundLine(language: ComposeLanguage): string {
    const bank = this.fallbackMessages;
    const enabled = bank?.config?.enabled !== false;
    if (!enabled) return this.withNotFoundGuidance(language, localizeNotFound(language));
    const localized = normalizeString(
      bank?.messages?.[language]?.missingEvidence ||
        bank?.messages?.en?.missingEvidence,
    );
    if (localized) return this.withNotFoundGuidance(language, localized);
    return this.withNotFoundGuidance(language, localizeNotFound(language));
  }

  private withNotFoundGuidance(language: ComposeLanguage, base: string): string {
    const message = normalizeString(base);
    if (!message) return base;
    const help = normalizeString(
      this.helpMicrocopy?.messages?.[language]?.clarify ||
        this.helpMicrocopy?.messages?.en?.clarify,
    );
    if (!help) return message;
    const normalizedMessage = message.toLowerCase();
    if (normalizedMessage.includes(help.toLowerCase())) return message;
    if (language === "pt") return `${message} Se quiser, ${help}`;
    if (language === "es") return `${message} Si quieres, ${help}`;
    return `${message} If you'd like, ${help}`;
  }

  private pickOpener(input: {
    language: ComposeLanguage;
    seed: string;
    intent: string;
  }): string | null {
    const bank = this.openers;
    if (!bank || bank.config?.enabled === false) return null;
    const all = toBankList(bank.openers).filter((entry) => {
      const lang = normalizeString(entry.language).toLowerCase();
      const entryIntent = normalizeString(entry.intent).toLowerCase();
      if (lang && lang !== "any" && lang !== input.language) return false;
      if (!normalizeString(entry.text)) return false;
      if (entryIntent && entryIntent !== input.intent && entryIntent !== "any")
        return false;
      return true;
    });
    const languageWidePool = toBankList(bank.openers).filter((entry) => {
      const lang = normalizeString(entry.language).toLowerCase();
      if (lang && lang !== "any" && lang !== input.language) return false;
      return normalizeString(entry.text).length > 0;
    });
    const pool = all.length >= 2 ? all : languageWidePool;
    if (!pool.length) return null;
    const antiRoboticEnabled = this.antiRoboticRules?.config?.enabled !== false;
    // If anti-robotic guards are enabled and there is only a single opener,
    // skip forced repetition and let the structured body lead.
    if (antiRoboticEnabled && pool.length === 1) return null;
    const index = hashSeed(`opener:${input.seed}`) % pool.length;
    return normalizeString(pool[index]?.text) || null;
  }

  private pickFollowup(input: {
    language: ComposeLanguage;
    seed: string;
    intent: string;
    hasTemplate: boolean;
  }): string {
    const bank = this.followups;
    const base = defaultFollowupLine(input.language);
    if (!bank || bank.config?.enabled === false) return base;
    const all = toBankList(bank.suggestions).filter((entry) => {
      const lang = normalizeString(entry.language).toLowerCase();
      const entryIntent = normalizeString(entry.intent).toLowerCase();
      if (lang && lang !== "any" && lang !== input.language) return false;
      if (entryIntent && entryIntent !== input.intent && entryIntent !== "any") return false;
      return normalizeString(entry.text).length > 0;
    });
    const languageWidePool = toBankList(bank.suggestions).filter((entry) => {
      const lang = normalizeString(entry.language).toLowerCase();
      if (lang && lang !== "any" && lang !== input.language) return false;
      return normalizeString(entry.text).length > 0;
    });
    const pool = all.length >= 2 ? all : languageWidePool;
    if (!pool.length) {
      const closer = this.pickCloser(input.language, input.seed);
      if (closer) return closer;
      const help = normalizeString(
        this.helpMicrocopy?.messages?.[input.language]?.clarify ||
          this.helpMicrocopy?.messages?.en?.clarify,
      );
      if (!help) return base;
      if (input.language === "pt") return `Se quiser, ${help}`;
      if (input.language === "es") return `Si quieres, ${help}`;
      return `If you'd like, ${help}`;
    }
    const index = hashSeed(`followup:${input.seed}`) % pool.length;
    const selected = normalizeString(pool[index]?.text);
    if (!selected) return base;
    if (!input.hasTemplate) {
      const closer = this.pickCloser(input.language, input.seed);
      if (closer) return closer;
    }
    if (input.language === "pt") return `Se quiser, ${selected}`;
    if (input.language === "es") return `Si quieres, ${selected}`;
    return `If you'd like, ${selected}`;
  }

  private pickCloser(language: ComposeLanguage, seed: string): string | null {
    const bank = this.closers;
    if (!bank || bank.config?.enabled === false) return null;
    const pool = toBankList(bank.closers).filter((entry) => {
      const lang = normalizeString(entry.language).toLowerCase();
      if (lang && lang !== "any" && lang !== language) return false;
      return normalizeString(entry.text).length > 0;
    });
    if (!pool.length) return null;
    const index = hashSeed(`closer:${seed}`) % pool.length;
    return normalizeString(pool[index]?.text) || null;
  }

  private hasTemplateForIntent(language: ComposeLanguage, intent: string): boolean {
    const bank = this.responseTemplates;
    if (!bank || bank.config?.enabled === false) return false;
    const templates = toBankList(bank.templates);
    return templates.some((entry) => {
      const lang = normalizeString(entry.language).toLowerCase();
      const entryIntent = normalizeString(entry.intent).toLowerCase();
      const langMatch = !lang || lang === "any" || lang === language;
      const intentMatch = !entryIntent || entryIntent === "any" || entryIntent === intent;
      return langMatch && intentMatch;
    });
  }

  private resolveSynthesisLine(language: ComposeLanguage): string {
    const base = defaultSynthesisLine(language);
    const toneEnabled = this.toneProfiles?.config?.enabled !== false;
    const voiceEnabled = this.voiceProfiles?.config?.enabled !== false;
    if (!toneEnabled && !voiceEnabled) return base;
    const defaultTone = normalizeString(this.toneProfiles?.config?.defaultTone).toLowerCase();
    const defaultProfile = normalizeString(
      this.voiceProfiles?.config?.defaultProfile,
    ).toLowerCase();
    if (defaultProfile === "supportive" || defaultTone === "helpful") {
      if (language === "pt") {
        return "Em resumo, esta resposta esta limitada as evidencias citadas e posso detalhar o que faltar.";
      }
      if (language === "es") {
        return "En resumen, esta respuesta se limita a la evidencia citada y puedo ampliar lo necesario.";
      }
      return "In summary, this answer is constrained to cited evidence and I can expand any missing detail.";
    }
    return base;
  }

  private resolveMaxSourceLines(): number {
    const citationCap = Number(this.citationPolicy?.config?.maxCitationsPerClaim);
    const verbosityCap = Number(this.verbosityLadder?.levels?.short?.maxWords);
    const guardrailRows = Number(this.formatGuardrails?.config?.maxRowsPerTableChunk);
    const tableRows = Number(this.tableRenderPolicy?.config?.maxRowsPerChunk);
    const truncationAllowed = this.tableRenderPolicy?.config?.allowTruncation !== false;

    let resolved = Number.isFinite(citationCap) && citationCap > 0
      ? Math.floor(citationCap)
      : 2;
    if (Number.isFinite(verbosityCap) && verbosityCap > 0 && verbosityCap <= 120) {
      resolved = Math.min(resolved, 2);
    }
    const rowBudgetCandidates = [guardrailRows, tableRows].filter(
      (value) => Number.isFinite(value) && value > 0,
    );
    if (rowBudgetCandidates.length > 0) {
      const minRows = Math.min(...rowBudgetCandidates);
      if (minRows <= 80) resolved = Math.min(resolved, 2);
      if (minRows <= 40) resolved = 1;
    }
    if (!truncationAllowed) {
      resolved = Math.min(resolved, 3);
    }
    return Math.max(1, Math.min(Math.floor(resolved), 5));
  }
}
