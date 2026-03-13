import { getOptionalBank } from "../banks/bankLoader.service";
import { ClarificationPolicyService } from "./clarificationPolicy.service";

type ClarificationPhrasesBank = {
  config?: {
    enabled?: boolean;
    noApologyTone?: boolean;
    noPolicyMentions?: boolean;
    promptShapePolicy?: {
      maxSentences?: number;
    };
  };
};

type ClarificationPhrasesBankProvider = {
  getBank(): ClarificationPhrasesBank | null;
};

function clamp(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(num)));
}

function normalizeLanguage(language?: string): "en" | "pt" | "es" {
  const raw = String(language || "").trim().toLowerCase();
  if (raw === "pt") return "pt";
  if (raw === "es") return "es";
  return "en";
}

export class ClarificationPhraseResolverService {
  constructor(
    private readonly clarificationPolicy = new ClarificationPolicyService(),
    private readonly phraseBankProvider: ClarificationPhrasesBankProvider = {
      getBank: () =>
        getOptionalBank<ClarificationPhrasesBank>("clarification_phrases"),
    },
  ) {}

  renderQuestion(input: {
    question: string;
    preferredLanguage?: string;
    hasConcreteOptions?: boolean;
    options?: string[];
  }): string {
    const phraseBank = this.phraseBankProvider.getBank();
    const options = this.filterOptions({ options: input.options || [] });
    const limits = this.clarificationPolicy.resolveLimits({
      runtime: {
        signals: {
          hasConcreteOptions: input.hasConcreteOptions === true,
        },
        metrics: {
          clarificationQuestionCount: 1,
          candidateCount: options.length,
        },
      },
    });
    const normalized = String(input.question || "").trim();
    if (!limits.enabled) return normalized;

    if (!normalized || limits.maxQuestions <= 0) {
      return this.defaultQuestion(
        input.preferredLanguage,
        input.hasConcreteOptions === true && options.length > 0,
      );
    }

    let sanitized = normalized;
    if (phraseBank?.config?.noApologyTone !== false) {
      sanitized = this.stripApologyTone(sanitized, input.preferredLanguage);
    }
    if (phraseBank?.config?.noPolicyMentions !== false) {
      sanitized = this.stripPolicyMentions(sanitized, input.preferredLanguage);
    }
    sanitized = sanitized.replace(/\s+/g, " ").trim();

    const maxSentences = clamp(
      phraseBank?.config?.promptShapePolicy?.maxSentences,
      1,
      2,
      1,
    );
    if (maxSentences <= 1) {
      const sentenceMatch = sanitized.match(/^[^?!.]*[?!.]?/);
      sanitized = String(sentenceMatch?.[0] || sanitized).trim();
    }

    const base = sanitized.replace(/[.?!]+$/g, "").trim();
    if (!base) {
      return this.defaultQuestion(
        input.preferredLanguage,
        input.hasConcreteOptions === true && options.length > 0,
      );
    }

    if (input.hasConcreteOptions === true && options.length > 0) {
      return this.defaultQuestion(input.preferredLanguage, true);
    }
    return `${base}?`;
  }

  filterOptions(input: { options: string[] }): string[] {
    const deduped = Array.from(
      new Set(
        (input.options || [])
          .map((value) => String(value || "").trim().replace(/\s+/g, " "))
          .filter((value) => value.length > 0),
      ),
    );
    const limits = this.clarificationPolicy.resolveLimits({
      runtime: {
        signals: {
          hasConcreteOptions: deduped.length > 0,
        },
        metrics: {
          candidateCount: deduped.length,
          clarificationQuestionCount: 0,
        },
      },
    });
    const capped = deduped.slice(0, limits.maxOptions);
    if (capped.length < limits.minOptions) return [];
    return capped;
  }

  private defaultQuestion(language?: string, optionPrompt = false): string {
    const lang = normalizeLanguage(language);
    if (optionPrompt) {
      if (lang === "pt") return "Qual destas opcoes devo usar?";
      if (lang === "es") return "Cual de estas opciones debo usar?";
      return "Which of these options should I use?";
    }
    if (lang === "pt") return "Qual parte exata devo validar?";
    if (lang === "es") return "Que parte exacta debo validar?";
    return "Which exact part should I validate?";
  }

  private stripApologyTone(text: string, language?: string): string {
    const lang = normalizeLanguage(language);
    if (lang === "pt") {
      return text.replace(/\b(desculpa|desculpe|sinto muito)\b[:,]?\s*/gi, "");
    }
    if (lang === "es") {
      return text.replace(/\b(perd[oó]n|lo siento|disculpa)\b[:,]?\s*/gi, "");
    }
    return text.replace(/\b(sorry|apologies)\b[:,]?\s*/gi, "");
  }

  private stripPolicyMentions(text: string, language?: string): string {
    const lang = normalizeLanguage(language);
    if (lang === "pt") {
      return text.replace(/\b(pol[ií]tica|regras?)\b/gi, "");
    }
    if (lang === "es") {
      return text.replace(/\b(pol[ií]tica|reglas?)\b/gi, "");
    }
    return text.replace(/\b(policy|rules?)\b/gi, "");
  }
}
