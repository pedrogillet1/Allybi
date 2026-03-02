import { describe, expect, test } from "@jest/globals";

import { LanguageDetectorService } from "./languageDetector.service";

function makeService(banks: Record<string, any>): LanguageDetectorService {
  return new LanguageDetectorService({
    getBank<T = any>(bankId: string): T {
      if (!(bankId in banks)) {
        throw new Error(`missing bank: ${bankId}`);
      }
      return banks[bankId] as T;
    },
  });
}

describe("LanguageDetectorService", () => {
  test("explicit directive sets languageRequested and selected language", () => {
    const svc = makeService({
      language_triggers: {
        config: {
          enabled: true,
          actionsContract: {
            thresholds: {
              explicitDirectiveConfidence: 0.95,
            },
          },
        },
        rules: [
          {
            id: "explicit_request_portuguese",
            triggerPatterns: {
              en: ["respond in portuguese"],
              pt: [],
              es: [],
            },
            action: {
              type: "set_language",
              language: "pt",
              confidence: 0.95,
            },
          },
        ],
      },
      language_indicators: {
        config: { enabled: true, supported: ["en", "pt", "es"] },
        rules: [],
      },
    });

    const out = svc.detect({
      env: "local",
      text: "Please respond in Portuguese",
    });
    expect(out.selectedLanguage).toBe("pt");
    expect(out.languageRequested).toBe(true);
    expect(out.directiveLanguage).toBe("pt");
  });

  test("implicit bias does not mark languageRequested", () => {
    const svc = makeService({
      language_triggers: {
        config: {
          enabled: true,
          actionsContract: {
            thresholds: {
              implicitCueConfidence: 0.75,
            },
          },
        },
        rules: [
          {
            id: "implicit_strong_pt_cues",
            triggerPatterns: {
              en: ["você"],
              pt: ["você"],
              es: ["você"],
            },
            action: {
              type: "bias_language",
              language: "pt",
              confidence: 0.75,
            },
          },
        ],
      },
      language_indicators: {
        config: {
          enabled: true,
          supported: ["en", "pt", "es"],
          minConfidenceToSelect: 0.55,
          actionsContract: { thresholds: { minConfidenceGap: 0.15 } },
        },
        rules: [
          {
            id: "pt_score",
            triggerPatterns: {
              en: ["relatório"],
              pt: ["relatório"],
              es: ["relatório"],
            },
            action: {
              type: "score_language",
              language: "pt",
              weight: 0.8,
            },
          },
        ],
      },
    });

    const out = svc.detect({
      env: "local",
      text: "Você pode resumir o relatório?",
    });
    expect(out.selectedLanguage).toBe("pt");
    expect(out.languageRequested).toBe(false);
    expect(out.directiveLanguage).toBeNull();
  });

  test("mixed language returns any without explicit directive", () => {
    const svc = makeService({
      language_triggers: {
        config: { enabled: true },
        rules: [
          {
            id: "mixed_language_detection",
            triggerPatterns: { en: [".+"], pt: [".+"], es: [".+"] },
            action: { type: "set_language", language: "any" },
          },
        ],
      },
      language_indicators: {
        config: {
          enabled: true,
          supported: ["en", "pt", "es"],
          minConfidenceToSelect: 0.55,
          actionsContract: { thresholds: { minConfidenceGap: 0.1 } },
        },
        rules: [
          {
            id: "en_score",
            triggerPatterns: { en: ["please"], pt: ["please"], es: ["please"] },
            action: { type: "score_language", language: "en", weight: 0.8 },
          },
          {
            id: "pt_score",
            triggerPatterns: {
              en: ["relatório"],
              pt: ["relatório"],
              es: ["relatório"],
            },
            action: { type: "score_language", language: "pt", weight: 0.8 },
          },
        ],
      },
    });

    const out = svc.detect({
      env: "local",
      text: "please resumo do relatório",
    });
    expect(out.selectedLanguage).toBe("any");
    expect(out.languageRequested).toBe(false);
    expect(out.mixedLanguageDetected).toBe(true);
  });
});
