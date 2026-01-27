// languageEnforcement.service.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Koda Language Enforcement (ChatGPT-parity, policy-driven)
 * --------------------------------------------------------
 * Purpose:
 *  - Decide the language to *render* the next assistant response in.
 *  - Enforce explicit user directives (language_triggers) as highest priority.
 *  - Use detected language (languageDetector.service.ts) when confident.
 *  - Fall back to user preference in conversation state when ambiguity exists.
 *  - Never force a language when ambiguous unless explicit directive exists.
 *  - Ensure microcopy/fragments use consistent language tokens without hardcoding.
 *
 * This service does NOT translate documents. It only selects:
 *  - outputLanguage: "en" | "pt" | "es"
 *  - or "any" when the system should preserve user's mixed-language style or defer.
 *
 * It also emits:
 *  - signals for microcopy/prompt selection: languageSelected, languageRequested, mixedLanguageDetected
 *
 * Banks used:
 *  - triggers/language_triggers.any.json
 *  - normalizers/language_indicators.any.json
 *  - triggers/language_triggers.any.json thresholds
 *  - (optional) microcopy banks can consume output language selection
 */

import crypto from "crypto";

type EnvName = "production" | "staging" | "dev" | "local";
export type LangCode = "any" | "en" | "pt" | "es";

export interface BankLoader {
  getBank<T = any>(bankId: string): T;
}

export interface ConversationStateLike {
  session: { env: EnvName; userLanguage?: LangCode };
  persistent: {
    preferences?: {
      language?: LangCode; // user preference
    };
  };
  ephemeral?: {
    signals?: {
      languageSelected?: LangCode | null;
      languageRequested?: boolean | null;
      mixedLanguageDetected?: boolean | null;
    };
  };
}

export interface LanguageDetectorResult {
  selectedLanguage: LangCode; // can be "any"
  confidence: number; // 0..1
  isAmbiguous: boolean;
  mixedLanguageDetected: boolean;
  languageRequested: boolean;
  directiveLanguage?: LangCode | null;
  scores: Record<"en" | "pt" | "es", number>;
  gap: number;
}

export interface LanguageEnforcementInput {
  env: EnvName;
  userText: string;

  // Detector output (required)
  detection: LanguageDetectorResult;

  // Current state
  state: ConversationStateLike;

  // Optional upstream overrides (e.g., tool messages)
  overrides?: {
    forceLanguage?: LangCode | null;
    allowAnyOutputLanguage?: boolean; // if true, can return "any" even if detection is confident
  };

  // Optional downstream constraints (e.g., nav_pills tends to be minimal; still language-consistent)
  context?: {
    answerMode?: string | null;
    operatorFamily?: string | null;
  };
}

export interface LanguageEnforcementResult {
  outputLanguage: LangCode; // usually en/pt/es; may be "any" if allowed
  confidence: number; // 0..1
  reason: "explicit_directive" | "detector_confident" | "user_preference" | "prior_language" | "ambiguous_any" | "forced_override";
  signals: {
    languageRequested: boolean;
    mixedLanguageDetected: boolean;
    languageSelected: LangCode;
  };
  debug?: {
    policySteps: string[];
    normalizedUserTextSample: string;
    statePreference: LangCode | null;
    priorLanguage: LangCode | null;
  };
}

// --------------------
// Helpers
// --------------------

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function normalizeForDecision(s: string): string {
  return (s ?? "").replace(/\r\n|\r/g, "\n").replace(/\t/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function isProd(env: EnvName): boolean {
  return env === "production";
}

function isLang(x: any): x is LangCode {
  return x === "any" || x === "en" || x === "pt" || x === "es";
}

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

// --------------------
// Service
// --------------------

export class LanguageEnforcementService {
  constructor(private readonly bankLoader: BankLoader) {}

  enforce(input: LanguageEnforcementInput): LanguageEnforcementResult {
    const env = input.env;
    const text = normalizeForDecision(input.userText);
    const detection = input.detection;

    const triggers = this.safeGetBank<any>("language_triggers");
    const indicators = this.safeGetBank<any>("language_indicators");

    const policySteps: string[] = [];
    const statePref: LangCode | null = (input.state?.persistent?.preferences?.language && isLang(input.state.persistent.preferences.language))
      ? input.state.persistent.preferences.language
      : (input.state?.session?.userLanguage && isLang(input.state.session.userLanguage) ? input.state.session.userLanguage : null);

    const priorLang: LangCode | null = (input.state?.ephemeral?.signals?.languageSelected && isLang(input.state.ephemeral.signals.languageSelected))
      ? input.state.ephemeral.signals.languageSelected
      : null;

    // 0) Forced override (tests/admin/tools)
    if (input.overrides?.forceLanguage && isLang(input.overrides.forceLanguage)) {
      policySteps.push("forced_override");
      return this.finalize(env, {
        outputLanguage: input.overrides.forceLanguage,
        confidence: 1,
        reason: "forced_override",
        signals: {
          languageRequested: Boolean(detection.languageRequested),
          mixedLanguageDetected: Boolean(detection.mixedLanguageDetected),
          languageSelected: input.overrides.forceLanguage
        }
      }, policySteps, text, statePref, priorLang);
    }

    // 1) Explicit directive wins (from detector/triggers)
    if (detection.languageRequested && detection.directiveLanguage && detection.directiveLanguage !== "any") {
      policySteps.push("explicit_directive");
      return this.finalize(env, {
        outputLanguage: detection.directiveLanguage,
        confidence: clamp01(Math.max(0.9, detection.confidence)),
        reason: "explicit_directive",
        signals: {
          languageRequested: true,
          mixedLanguageDetected: Boolean(detection.mixedLanguageDetected),
          languageSelected: detection.directiveLanguage
        }
      }, policySteps, text, statePref, priorLang);
    }

    // 2) Mixed-language without explicit directive: prefer "any" unless you want to force a stable language.
    // ChatGPT-like: if user mixes languages, don't force; match user style.
    if (detection.mixedLanguageDetected && !detection.languageRequested) {
      policySteps.push("mixed_language_detected");
      const allowAny = input.overrides?.allowAnyOutputLanguage ?? true;
      if (allowAny) {
        return this.finalize(env, {
          outputLanguage: "any",
          confidence: 0.7,
          reason: "ambiguous_any",
          signals: {
            languageRequested: false,
            mixedLanguageDetected: true,
            languageSelected: "any"
          }
        }, policySteps, text, statePref, priorLang);
      }
      // If caller disallows "any", fall back to detector top language if it's confident enough.
      // (Rare; usually allowAnyOutputLanguage should be true.)
    }

    // 3) Detector confident: use it
    if (!detection.isAmbiguous && detection.selectedLanguage !== "any") {
      policySteps.push("detector_confident");
      return this.finalize(env, {
        outputLanguage: detection.selectedLanguage,
        confidence: clamp01(detection.confidence),
        reason: "detector_confident",
        signals: {
          languageRequested: Boolean(detection.languageRequested),
          mixedLanguageDetected: Boolean(detection.mixedLanguageDetected),
          languageSelected: detection.selectedLanguage
        }
      }, policySteps, text, statePref, priorLang);
    }

    // 4) If ambiguous and user has a stored preference, use it (ChatGPT-like personalization)
    if (statePref && statePref !== "any") {
      policySteps.push("user_preference");
      return this.finalize(env, {
        outputLanguage: statePref,
        confidence: 0.75,
        reason: "user_preference",
        signals: {
          languageRequested: Boolean(detection.languageRequested),
          mixedLanguageDetected: Boolean(detection.mixedLanguageDetected),
          languageSelected: statePref
        }
      }, policySteps, text, statePref, priorLang);
    }

    // 5) If ambiguous but prior turn language is stable, keep it (continuity)
    if (priorLang && priorLang !== "any") {
      policySteps.push("prior_language");
      return this.finalize(env, {
        outputLanguage: priorLang,
        confidence: 0.7,
        reason: "prior_language",
        signals: {
          languageRequested: Boolean(detection.languageRequested),
          mixedLanguageDetected: Boolean(detection.mixedLanguageDetected),
          languageSelected: priorLang
        }
      }, policySteps, text, statePref, priorLang);
    }

    // 6) Ambiguous: return "any" (default) to let renderer choose minimal mixed-language-safe output.
    policySteps.push("ambiguous_any");
    return this.finalize(env, {
      outputLanguage: "any",
      confidence: clamp01(Math.max(0.4, detection.confidence)),
      reason: "ambiguous_any",
      signals: {
        languageRequested: Boolean(detection.languageRequested),
        mixedLanguageDetected: Boolean(detection.mixedLanguageDetected),
        languageSelected: "any"
      }
    }, policySteps, text, statePref, priorLang);
  }

  private finalize(
    env: EnvName,
    base: Omit<LanguageEnforcementResult, "debug">,
    policySteps: string[],
    normalizedSample: string,
    statePref: LangCode | null,
    priorLang: LangCode | null
  ): LanguageEnforcementResult {
    const res: LanguageEnforcementResult = {
      ...base,
      debug: isProd(env)
        ? undefined
        : {
            policySteps,
            normalizedUserTextSample: normalizedSample.slice(0, 160),
            statePreference: statePref,
            priorLanguage: priorLang
          }
    };

    // Ensure outputLanguage is always valid
    if (!isLang(res.outputLanguage)) res.outputLanguage = "any";
    res.confidence = clamp01(res.confidence);

    return res;
  }

  private safeGetBank<T = any>(bankId: string): T | null {
    try {
      return this.bankLoader.getBank<T>(bankId);
    } catch {
      return null;
    }
  }
}
