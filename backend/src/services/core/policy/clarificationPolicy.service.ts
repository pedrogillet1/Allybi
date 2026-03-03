import { getOptionalBank } from "../banks/bankLoader.service";
import { PolicyRuntimeEngine } from "./policyRuntimeEngine.service";

type ClarificationPolicyBank = {
  config?: {
    enabled?: boolean;
    actionsContract?: {
      thresholds?: {
        maxQuestions?: number;
        minOptions?: number;
        maxOptions?: number;
      };
    };
  };
  policies?: {
    rules?: Array<Record<string, unknown>>;
  };
};

type ClarificationPhrasesBank = {
  config?: {
    enabled?: boolean;
    maxQuestions?: number;
    noApologyTone?: boolean;
    noPolicyMentions?: boolean;
    promptShapePolicy?: {
      maxSentences?: number;
    };
    actionsContract?: {
      thresholds?: {
        maxClarificationQuestions?: number;
      };
    };
  };
};

type DisambiguationPoliciesBank = {
  config?: {
    enabled?: boolean;
    actionsContract?: {
      thresholds?: {
        minOptions?: number;
        maxOptions?: number;
      };
    };
    optionPolicy?: {
      minOptions?: number;
      maxOptions?: number;
    };
  };
};

export type ClarificationPolicyLimits = {
  enabled: boolean;
  maxQuestions: number;
  minOptions: number;
  maxOptions: number;
};

function clamp(value: unknown, min: number, max: number, fallback: number): number {
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

export class ClarificationPolicyService {
  private readonly engine = new PolicyRuntimeEngine();

  resolveLimits(input?: {
    runtime?: Record<string, unknown>;
  }): ClarificationPolicyLimits {
    const bank = getOptionalBank<ClarificationPolicyBank>("clarification_policy");
    const phraseBank =
      getOptionalBank<ClarificationPhrasesBank>("clarification_phrases");
    const disambiguationBank =
      getOptionalBank<DisambiguationPoliciesBank>("disambiguation_policies");
    const thresholds = bank?.config?.actionsContract?.thresholds || {};
    const phraseThresholds =
      phraseBank?.config?.actionsContract?.thresholds || {};
    const disambiguationThresholds =
      disambiguationBank?.config?.actionsContract?.thresholds || {};
    const optionPolicy = disambiguationBank?.config?.optionPolicy || {};

    const maxQuestions = Math.min(
      clamp(thresholds.maxQuestions, 0, 3, 1),
      clamp(phraseBank?.config?.maxQuestions, 0, 3, 1),
      clamp(phraseThresholds.maxClarificationQuestions, 0, 3, 1),
    );
    const minOptions = Math.max(
      clamp(thresholds.minOptions, 1, 8, 2),
      clamp(disambiguationThresholds.minOptions, 1, 8, 2),
      clamp(optionPolicy.minOptions, 1, 8, 2),
    );
    const maxOptions = Math.min(
      clamp(thresholds.maxOptions, 1, 12, 4),
      clamp(disambiguationThresholds.maxOptions, 1, 12, 4),
      clamp(optionPolicy.maxOptions, 1, 12, 4),
    );
    const overrides = this.resolveLimitOverridesFromPolicyRules({
      bank,
      runtime:
        (input?.runtime as Record<string, unknown>) || {
          signals: {},
          metrics: {},
        },
    });
    const safeMinOptions = Math.min(minOptions, maxOptions);
    const maxQuestionsWithOverride =
      overrides.maxQuestions != null
        ? clamp(overrides.maxQuestions, 0, 3, maxQuestions)
        : maxQuestions;
    const minOptionsWithOverride =
      overrides.minOptions != null
        ? Math.max(
            safeMinOptions,
            clamp(overrides.minOptions, 1, 8, safeMinOptions),
          )
        : safeMinOptions;
    const maxOptionsWithOverride =
      overrides.maxOptions != null
        ? Math.min(maxOptions, clamp(overrides.maxOptions, 1, 12, maxOptions))
        : maxOptions;

    return {
      enabled: bank?.config?.enabled !== false,
      maxQuestions: maxQuestionsWithOverride,
      minOptions: Math.min(minOptionsWithOverride, maxOptionsWithOverride),
      maxOptions: maxOptionsWithOverride,
    };
  }

  enforceClarificationQuestion(input: {
    question: string;
    preferredLanguage?: string;
    hasConcreteOptions?: boolean;
    options?: string[];
  }): string {
    const limits = this.resolveLimits({
      runtime: {
        signals: {
          hasConcreteOptions: input.hasConcreteOptions === true,
        },
        metrics: {
          clarificationQuestionCount: 1,
          candidateCount: Array.isArray(input.options) ? input.options.length : 0,
        },
      },
    });
    const phraseBank =
      getOptionalBank<ClarificationPhrasesBank>("clarification_phrases");
    const normalized = String(input.question || "").trim();
    if (!limits.enabled) return normalized;
    const options = this.enforceClarificationOptions({
      options: input.options || [],
    });
    if (!normalized) {
      return this.defaultQuestion(
        input.preferredLanguage,
        input.hasConcreteOptions && options.length > 0,
      );
    }
    if (limits.maxQuestions <= 0) {
      return this.defaultQuestion(
        input.preferredLanguage,
        input.hasConcreteOptions && options.length > 0,
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

    const sentence = String(sanitized || "").trim();
    if (!sentence) return this.defaultQuestion(input.preferredLanguage);
    const base = sentence.replace(/[.?!]+$/g, "").trim();
    if (!base) {
      return this.defaultQuestion(
        input.preferredLanguage,
        input.hasConcreteOptions && options.length > 0,
      );
    }

    if (input.hasConcreteOptions && options.length > 0) {
      return this.defaultQuestion(input.preferredLanguage, true);
    }
    return `${base}?`;
  }

  enforceClarificationOptions(input: { options: string[] }): string[] {
    const deduped = Array.from(
      new Set(
        (input.options || [])
          .map((value) => String(value || "").trim().replace(/\s+/g, " "))
          .filter((value) => value.length > 0),
      ),
    );
    const limits = this.resolveLimits({
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

  private resolveLimitOverridesFromPolicyRules(input: {
    bank: ClarificationPolicyBank | null;
    runtime: Record<string, unknown>;
  }): {
    maxQuestions?: number;
    minOptions?: number;
    maxOptions?: number;
  } {
    const match = this.engine.firstMatch({
      policyBank: input.bank as Record<string, unknown>,
      runtime: input.runtime,
    });
    if (!match || match.ruleId === "__default__") return {};

    const then = (match.then || {}) as Record<string, unknown>;
    const constraints =
      then.constraints && typeof then.constraints === "object"
        ? (then.constraints as Record<string, unknown>)
        : {};
    const transforms = Array.isArray(then.transform)
      ? (then.transform as Array<Record<string, unknown>>)
      : [];

    let maxQuestions = Number(constraints.maxQuestions);
    let minOptions = Number(constraints.minOptions);
    let maxOptions = Number(constraints.maxOptions);

    for (const transform of transforms) {
      const type = String(transform?.type || "").trim();
      if (type === "limit_questions") {
        const max = Number(transform?.max);
        if (Number.isFinite(max)) maxQuestions = max;
      }
      if (type === "limit_options") {
        const min = Number(transform?.min);
        const max = Number(transform?.max);
        if (Number.isFinite(min)) minOptions = min;
        if (Number.isFinite(max)) maxOptions = max;
      }
    }

    return {
      ...(Number.isFinite(maxQuestions) ? { maxQuestions } : {}),
      ...(Number.isFinite(minOptions) ? { minOptions } : {}),
      ...(Number.isFinite(maxOptions) ? { maxOptions } : {}),
    };
  }

  private defaultQuestion(language?: string, optionPrompt = false): string {
    const lang = normalizeLanguage(language);
    if (optionPrompt) {
      if (lang === "pt") return "Qual destas opções devo usar?";
      if (lang === "es") return "¿Cuál de estas opciones debo usar?";
      return "Which of these options should I use?";
    }
    if (lang === "pt") return "Qual parte exata devo validar?";
    if (lang === "es") return "¿Qué parte exacta debo validar?";
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
