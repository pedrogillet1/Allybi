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

export type AnalyticalCopy = {
  openerLine: string | null;
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

export class ComposeMicrocopyService {
  private openers?: OpenersBank;
  private followups?: FollowupSuggestionsBank;
  private fallbackMessages?: FallbackMessagesBank;
  private citationPolicy?: CitationPolicyBank;
  private helpMicrocopy?: HelpMicrocopyBank;

  // Loaded for runtime wiring and future policy expansion.
  // These are intentionally loaded through the centralized compose service.
  private closers?: unknown;
  private formatGuardrails?: unknown;
  private toneProfiles?: unknown;
  private verbosityLadder?: unknown;
  private voiceProfiles?: unknown;
  private responseTemplates?: unknown;
  private antiRoboticRules?: unknown;
  private tableRenderPolicy?: unknown;

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
    this.closers = getOptionalBank("closers");
    this.formatGuardrails = getOptionalBank("format_guardrails");
    this.toneProfiles = getOptionalBank("tone_profiles");
    this.verbosityLadder = getOptionalBank("verbosity_ladder");
    this.voiceProfiles = getOptionalBank("voice_personality_profiles");
    this.responseTemplates = getOptionalBank("response_templates");
    this.antiRoboticRules = getOptionalBank("anti_robotic_style_rules");
    this.tableRenderPolicy = getOptionalBank("table_render_policy");
  }

  resolveAnalyticalCopy(input: {
    language: ComposeLanguage;
    seed: string;
    intent?: string;
  }): AnalyticalCopy {
    const language = input.language;
    const seed = normalizeString(input.seed) || "seed";
    const intent = normalizeString(input.intent).toLowerCase() || "extract";

    return {
      openerLine: this.pickOpener({ language, seed, intent }),
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
      synthesisLine: defaultSynthesisLine(language),
      followupLine: this.pickFollowup({ language, seed, intent }),
      evidenceLinePrefix: language === "pt" ? "Evidencia referenciada em" : "Evidence referenced from",
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
    if (!enabled) return localizeNotFound(language);
    const localized = normalizeString(
      bank?.messages?.[language]?.missingEvidence ||
        bank?.messages?.en?.missingEvidence,
    );
    if (localized) return localized;
    return localizeNotFound(language);
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
    const index = hashSeed(`opener:${input.seed}`) % pool.length;
    return normalizeString(pool[index]?.text) || null;
  }

  private pickFollowup(input: {
    language: ComposeLanguage;
    seed: string;
    intent: string;
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
    if (input.language === "pt") return `Se quiser, ${selected}`;
    if (input.language === "es") return `Si quieres, ${selected}`;
    return `If you'd like, ${selected}`;
  }

  private resolveMaxSourceLines(): number {
    const raw = Number(this.citationPolicy?.config?.maxCitationsPerClaim);
    if (!Number.isFinite(raw) || raw <= 0) return 2;
    return Math.max(1, Math.min(Math.floor(raw), 5));
  }
}
