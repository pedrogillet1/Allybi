// languageDetector.service.ts

/**
 * Koda Language Detector (ChatGPT-parity, deterministic)
 * ----------------------------------------------------
 * Purpose:
 *  - Determine a best-effort language selection for the *current user input*:
 *      "en" | "pt" | "es" | "any"
 *  - Prefer explicit directives (language_triggers) over implicit cues (language_indicators)
 *  - Never force a language when ambiguous (low top score or small gap)
 *  - Detect mixed-language inputs and return "any" unless explicit directive exists
 *  - Emit stable signals that other services can use (normalizers, routing, microcopy selection)
 *
 * This service does NOT translate and does NOT generate user-facing copy.
 * It only emits:
 *  - selectedLanguage, confidence, score breakdown
 *  - signals: languageRequested, mixedLanguageDetected
 *
 * Data banks used:
 *  - triggers/language_triggers.any.json   (explicit directives + mixed-language behavior)
 *  - normalizers/language_indicators.any.json (strong/weak marker scoring and ambiguity guard)
 *  - normalizers/whitespace_rules.any.json (light normalization)
 *  - normalizers/casing_rules.any.json (casefold for matching, preserve literals)
 *
 * Notes:
 *  - If your pipeline already runs normalizers upstream, you can pass normalized text in.
 */

import crypto from "crypto";

type EnvName = "production" | "staging" | "dev" | "local";
export type LangCode = "any" | "en" | "pt" | "es";

export interface BankLoader {
  getBank<T = unknown>(bankId: string): T;
}

export interface LanguageDetectionInput {
  env: EnvName;
  text: string;

  // Optional: if upstream already inferred a language or user preference is set
  hint?: {
    preferredLanguage?: LangCode | null; // from user prefs
    priorTurnLanguage?: LangCode | null;
  };

  // Optional signals already computed upstream
  signals?: {
    languageRequested?: boolean;
    languageSelected?: LangCode | null;
  };
}

export interface LanguageDetectionResult {
  selectedLanguage: LangCode;
  confidence: number; // 0..1
  isAmbiguous: boolean;
  mixedLanguageDetected: boolean;

  // if explicit directive triggered
  languageRequested: boolean;
  directiveLanguage?: LangCode | null;

  // breakdown
  scores: Record<Exclude<LangCode, "any">, number>;
  gap: number;

  // engine-side diagnostics only (never show to user)
  debug?: {
    usedDirective: boolean;
    matchedDirectiveRuleIds: string[];
    matchedIndicatorRuleIds: string[];
    normalizedTextSample: string;
  };
}

// --------------------
// Helpers
// --------------------

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function stripBom(s: string): string {
  return s && s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function normalizeWhitespace(s: string): string {
  return stripBom(s)
    .replace(/\r\n|\r/g, "\n")
    .replace(/\t/g, "  ")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

function normalizeForDetection(s: string): string {
  // Keep it conservative:
  // - collapse spaces
  // - lower
  // - preserve punctuation for Spanish markers (¿¡)
  return normalizeWhitespace(s).replace(/\s+/g, " ").toLowerCase();
}

function safeRegExpList(patterns: unknown): RegExp[] {
  if (!Array.isArray(patterns)) return [];
  const out: RegExp[] = [];
  for (const p of patterns) {
    if (typeof p !== "string" || !p.trim()) continue;
    try {
      out.push(new RegExp(p, "i"));
    } catch {
      // ignore invalid regex strings
    }
  }
  return out;
}

function countMatches(res: RegExp[], text: string, maxPerRule = 5): number {
  let count = 0;
  for (const r of res) {
    if (count >= maxPerRule) break;
    if (r.test(text)) count++;
  }
  return count;
}

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

function isLang(x: unknown): x is LangCode {
  return x === "any" || x === "en" || x === "pt" || x === "es";
}

function topTwo(scores: Record<"en" | "pt" | "es", number>) {
  const entries = Object.entries(scores) as Array<["en" | "pt" | "es", number]>;
  entries.sort((a, b) => b[1] - a[1]);
  const top = entries[0];
  const second = entries[1];
  return {
    topLang: top[0],
    topScore: top[1],
    secondLang: second[0],
    secondScore: second[1],
    gap: top[1] - second[1],
  };
}

// --------------------
// Service
// --------------------

export class LanguageDetectorService {
  constructor(private readonly bankLoader: BankLoader) {}

  detect(input: LanguageDetectionInput): LanguageDetectionResult {
    const env = input.env;
    const raw = input.text ?? "";
    const normalized = normalizeForDetection(raw);

    // Load banks (soft if missing)
    const triggers = this.safeGetBank<Record<string, unknown>>("language_triggers");
    const indicators = this.safeGetBank<Record<string, unknown>>("language_indicators");

    // Defaults (from banks when present)
    const envCfg = (triggers?.config as Record<string, unknown>) ?? {};
    const defaultLanguage: LangCode =
      envCfg.defaultLanguage && isLang(envCfg.defaultLanguage)
        ? envCfg.defaultLanguage
        : "any";

    const actionsContract = envCfg.actionsContract as Record<string, unknown> | undefined;
    const trigThresholds = (actionsContract?.thresholds as Record<string, unknown>) ?? {};
    const explicitDirectiveConfidence = clamp01(
      Number(trigThresholds.explicitDirectiveConfidence ?? 0.95),
    );
    const minGapToForce = clamp01(
      Number(trigThresholds.minConfidenceGapToForce ?? 0.15),
    );
    const implicitCueConfidence = clamp01(
      Number(trigThresholds.implicitCueConfidence ?? 0.75),
    );

    const indCfg = (indicators?.config as Record<string, unknown>) ?? {};
    const supported: Array<"en" | "pt" | "es"> = Array.isArray(indCfg.supported)
      ? (indCfg.supported as unknown[]).filter(
          (x: unknown) => x === "en" || x === "pt" || x === "es",
        ) as Array<"en" | "pt" | "es">
      : ["en", "pt", "es"];
    const minConfidenceToSelect = clamp01(
      Number(indCfg.minConfidenceToSelect ?? 0.75),
    );
    const indActionsContract = indCfg.actionsContract as Record<string, unknown> | undefined;
    const indThresholds = (indActionsContract?.thresholds as Record<string, unknown>) ?? {};
    const minConfidenceGap = clamp01(
      Number(indThresholds?.minConfidenceGap ?? 0.15),
    );

    const debug = {
      usedDirective: false,
      matchedDirectiveRuleIds: [] as string[],
      matchedIndicatorRuleIds: [] as string[],
      normalizedTextSample: normalized.slice(0, 160),
    };

    // 1) Explicit language directives (language_triggers)
    const directive = this.applyLanguageTriggers(triggers, normalized, debug);
    if (
      directive.languageRequested &&
      directive.languageSelected &&
      directive.languageSelected !== "any"
    ) {
      // Directive wins over everything
      return {
        selectedLanguage: directive.languageSelected,
        confidence: explicitDirectiveConfidence,
        isAmbiguous: false,
        mixedLanguageDetected: directive.mixedLanguageDetected,
        languageRequested: true,
        directiveLanguage: directive.languageSelected,
        scores: {
          en: directive.languageSelected === "en" ? 1 : 0,
          pt: directive.languageSelected === "pt" ? 1 : 0,
          es: directive.languageSelected === "es" ? 1 : 0,
        },
        gap: 1,
        debug:
          env === "production" ? undefined : { ...debug, usedDirective: true },
      };
    }

    // 2) If directive says "any" due to mixed-language detection, keep going with indicators
    const directiveForcedAny =
      directive.languageRequested && directive.languageSelected === "any";

    // 3) Score language indicators (language_indicators)
    const scored = this.applyLanguageIndicators(
      indicators,
      normalized,
      supported,
      debug,
    );

    // Apply implicit language bias from language_triggers without marking
    // the turn as an explicit language request.
    for (const lang of ["en", "pt", "es"] as const) {
      const bias = clamp01(Number(directive.biasScores?.[lang] ?? 0));
      if (bias <= 0) continue;
      scored.scores[lang] = clamp01(
        Math.max(scored.scores[lang], bias, implicitCueConfidence * bias),
      );
    }

    // 4) Mixed-language detection heuristic:
    // If we detect strong evidence for 2+ languages, treat as mixed and return any unless directive forces a language.
    const detectedLangCount = (["en", "pt", "es"] as const).filter(
      (l) => scored.scores[l] >= 0.6,
    ).length;
    const mixedLanguageDetected = detectedLangCount >= 2;

    if (mixedLanguageDetected && !directive.languageRequested) {
      return {
        selectedLanguage: "any",
        confidence: 0.7,
        isAmbiguous: true,
        mixedLanguageDetected: true,
        languageRequested: false,
        directiveLanguage: null,
        scores: scored.scores,
        gap: scored.gap,
        debug:
          env === "production" ? undefined : { ...debug, usedDirective: false },
      };
    }

    // 5) Decide language using indicators + ambiguity rules
    const { topLang, topScore, gap } = scored;
    const ambiguous =
      topScore < minConfidenceToSelect || gap < minConfidenceGap;

    // If ambiguous, return any (ChatGPT-like: don't force wrong language)
    if (ambiguous) {
      // If user has a preference hint, you can bias output language here,
      // but we keep selection "any" and let renderer pick language via other policies.
      return {
        selectedLanguage: "any",
        confidence: clamp01(Math.max(0.4, topScore)),
        isAmbiguous: true,
        mixedLanguageDetected:
          directive.mixedLanguageDetected || mixedLanguageDetected,
        languageRequested: Boolean(directive.languageRequested),
        directiveLanguage: directive.languageSelected ?? null,
        scores: scored.scores,
        gap,
        debug:
          env === "production" ? undefined : { ...debug, usedDirective: false },
      };
    }

    // If strong enough, select top language
    // If directive forcedAny due to mixed-language, honor that (do not override)
    if (directiveForcedAny) {
      return {
        selectedLanguage: "any",
        confidence: clamp01(topScore),
        isAmbiguous: true,
        mixedLanguageDetected: true,
        languageRequested: true,
        directiveLanguage: "any",
        scores: scored.scores,
        gap,
        debug:
          env === "production" ? undefined : { ...debug, usedDirective: true },
      };
    }

    return {
      selectedLanguage: topLang,
      confidence: clamp01(topScore),
      isAmbiguous: false,
      mixedLanguageDetected:
        directive.mixedLanguageDetected || mixedLanguageDetected,
      languageRequested: Boolean(directive.languageRequested),
      directiveLanguage: directive.languageSelected ?? null,
      scores: scored.scores,
      gap,
      debug:
        env === "production" ? undefined : { ...debug, usedDirective: false },
    };
  }

  // -------------------------
  // Triggers (explicit directives)
  // -------------------------

  private applyLanguageTriggers(
    triggersBank: Record<string, unknown> | null,
    normalized: string,
    debug: {
      matchedDirectiveRuleIds: string[];
      matchedIndicatorRuleIds: string[];
      usedDirective: boolean;
      normalizedTextSample: string;
    },
  ): {
    languageRequested: boolean;
    languageSelected: LangCode | null;
    mixedLanguageDetected: boolean;
    biasScores: Record<"en" | "pt" | "es", number>;
  } {
    const biasScores: Record<"en" | "pt" | "es", number> = {
      en: 0,
      pt: 0,
      es: 0,
    };
    const triggerConfig = triggersBank?.config as Record<string, unknown> | undefined;
    if (!triggerConfig?.enabled) {
      return {
        languageRequested: false,
        languageSelected: null,
        mixedLanguageDetected: false,
        biasScores,
      };
    }

    const rules = Array.isArray(triggersBank.rules) ? (triggersBank.rules as Array<Record<string, unknown>>) : [];
    let bestExplicit: { lang: Exclude<LangCode, "any">; conf: number } | null =
      null;
    let mixedLanguageHint = false;

    // We treat these banks as "pattern + action"; we evaluate triggerPatterns across en/pt/es keys.
    for (const r of rules) {
      const rid = r.id ?? r.ruleId ?? null;
      const pats = r.triggerPatterns as Record<string, unknown> | null ?? null;
      if (!rid || !pats) continue;

      const en = safeRegExpList(pats.en);
      const pt = safeRegExpList(pats.pt);
      const es = safeRegExpList(pats.es);

      const hit =
        en.some((re) => re.test(normalized)) ||
        pt.some((re) => re.test(normalized)) ||
        es.some((re) => re.test(normalized));
      if (!hit) continue;

      debug.matchedDirectiveRuleIds.push(String(rid));

      const action = (r.action as Record<string, unknown>) ?? {};
      const type = action.type ?? "";
      if (type === "set_language") {
        const lang = action.language as LangCode;
        if (lang === "any") {
          mixedLanguageHint = true;
        } else if (lang === "en" || lang === "pt" || lang === "es") {
          const conf = clamp01(Number(action.confidence ?? 0.95));
          if (!bestExplicit || conf > bestExplicit.conf) {
            bestExplicit = { lang, conf };
          }
        }
      } else if (type === "bias_language") {
        const lang = action.language as LangCode;
        if (lang === "en" || lang === "pt" || lang === "es") {
          const conf = clamp01(Number(action.confidence ?? 0.75));
          biasScores[lang] = Math.max(biasScores[lang], conf);
        }
      }
    }

    // Mixed-language detection rule might set language any
    const mixed =
      debug.matchedDirectiveRuleIds.includes("mixed_language_detection") ||
      /mixed/i.test(debug.matchedDirectiveRuleIds.join("|"));

    if (!bestExplicit)
      return {
        languageRequested: false,
        languageSelected: null,
        mixedLanguageDetected: mixed || mixedLanguageHint,
        biasScores,
      };

    return {
      languageRequested: true,
      languageSelected: bestExplicit.lang,
      mixedLanguageDetected: mixed || mixedLanguageHint,
      biasScores,
    };
  }

  // -------------------------
  // Indicators (implicit scoring)
  // -------------------------

  private applyLanguageIndicators(
    indicatorsBank: Record<string, unknown> | null,
    normalized: string,
    supported: Array<"en" | "pt" | "es">,
    debug: {
      matchedDirectiveRuleIds: string[];
      matchedIndicatorRuleIds: string[];
      usedDirective: boolean;
      normalizedTextSample: string;
    },
  ): {
    scores: Record<"en" | "pt" | "es", number>;
    topLang: "en" | "pt" | "es";
    topScore: number;
    gap: number;
  } {
    // Default: neutral scores
    const scores: Record<"en" | "pt" | "es", number> = { en: 0, pt: 0, es: 0 };

    const indBankConfig = indicatorsBank?.config as Record<string, unknown> | undefined;
    if (!indBankConfig?.enabled) {
      // fallback heuristic: basic cues
      scores.en = /\b(the|and|please|summary)\b/.test(normalized) ? 0.7 : 0.4;
      scores.pt = /\b(você|não|relatório|página)\b/.test(normalized)
        ? 0.7
        : 0.4;
      scores.es = /\b(¿|dónde|qué|ingresos|gastos)\b/.test(normalized)
        ? 0.7
        : 0.4;
      const t = topTwo(scores);
      return {
        scores,
        topLang: t.topLang,
        topScore: t.topScore,
        gap: clamp01(t.gap),
      };
    }

    const rules = Array.isArray(indicatorsBank.rules)
      ? (indicatorsBank.rules as Array<Record<string, unknown>>)
      : [];

    // Evaluate rule patterns. We interpret actions.score_language with weight.
    for (const r of rules) {
      const rid = r.id ?? r.ruleId ?? null;
      const pats = r.triggerPatterns as Record<string, unknown> | null ?? null;
      if (!rid || !pats) continue;

      const en = safeRegExpList(pats.en);
      const pt = safeRegExpList(pats.pt);
      const es = safeRegExpList(pats.es);

      const hit =
        en.some((re) => re.test(normalized)) ||
        pt.some((re) => re.test(normalized)) ||
        es.some((re) => re.test(normalized));

      // Only apply scoring rules if they hit
      if (!hit) continue;

      debug.matchedIndicatorRuleIds.push(String(rid));

      const action = (r.action as Record<string, unknown>) ?? {};
      const type = action.type ?? "";
      if (type === "score_language") {
        const lang = action.language as string;
        const w = clamp01(Number(action.weight ?? 0.4));
        if (lang === "en" || lang === "pt" || lang === "es") {
          scores[lang as keyof typeof scores] = clamp01(
            scores[lang as keyof typeof scores] + w,
          );
        }
      } else if (type === "set_language") {
        // Ambiguous guard may force "any" in indicators bank, but we treat that in decision phase.
        // We still keep scores as-is.
      }
    }

    // Normalize to [0..1] by clamping and light rescale
    for (const l of ["en", "pt", "es"] as const) {
      scores[l] = clamp01(scores[l]);
    }

    // If all are 0 (no hits), use neutral
    if (scores.en === 0 && scores.pt === 0 && scores.es === 0) {
      scores.en = 0.5;
      scores.pt = 0.5;
      scores.es = 0.5;
    }

    const t = topTwo(scores);
    return {
      scores,
      topLang: t.topLang,
      topScore: clamp01(t.topScore),
      gap: clamp01(t.gap),
    };
  }

  // -------------------------
  // Bank loader
  // -------------------------

  private safeGetBank<T = unknown>(bankId: string): T | null {
    try {
      return this.bankLoader.getBank<T>(bankId);
    } catch {
      return null;
    }
  }
}
