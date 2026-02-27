import { getBankLoaderInstance } from "../core/banks/bankLoader.service";
import { LanguageDetectorService } from "../core/inputs/languageDetector.service";

export type ChatLanguage = "en" | "pt" | "es";

const SUPPORTED_CHAT_LANGUAGES = new Set<ChatLanguage>(["en", "pt", "es"]);
let detector: LanguageDetectorService | null = null;

function currentEnv(): "production" | "staging" | "dev" | "local" {
  const raw = String(process.env.NODE_ENV || "local")
    .trim()
    .toLowerCase();
  if (raw === "production" || raw === "staging" || raw === "dev") return raw;
  if (raw === "development") return "dev";
  return "local";
}

function getDetector(): LanguageDetectorService {
  if (!detector) {
    detector = new LanguageDetectorService(getBankLoaderInstance());
  }
  return detector;
}

export function resolveChatPreferredLanguage(
  language: unknown,
  message: string,
): ChatLanguage {
  if (String(message || "").trim()) {
    const detection = getDetector().detect({
      env: currentEnv(),
      text: message,
      hint: {
        preferredLanguage:
          typeof language === "string" &&
          SUPPORTED_CHAT_LANGUAGES.has(language as ChatLanguage)
            ? (language as ChatLanguage)
            : null,
      },
    });
    const selected = String(detection.selectedLanguage || "").toLowerCase();
    if (SUPPORTED_CHAT_LANGUAGES.has(selected as ChatLanguage)) {
      return selected as ChatLanguage;
    }

    // When detector returns "any" (ambiguous), pick highest-scoring supported
    // language if it has a meaningful lead over the runner-up.
    if (selected === "any" && detection.scores) {
      const scores = detection.scores as Record<string, number>;
      let bestLang: ChatLanguage | null = null;
      let bestScore = 0;
      let secondScore = 0;
      for (const lang of ["en", "pt", "es"] as ChatLanguage[]) {
        const s = Number(scores[lang] || 0);
        if (s > bestScore) {
          secondScore = bestScore;
          bestScore = s;
          bestLang = lang;
        } else if (s > secondScore) {
          secondScore = s;
        }
      }
      if (bestLang && bestScore >= 0.25 && bestScore - secondScore >= 0.03) {
        return bestLang;
      }
      // When no hint was provided ("match" mode), pick the best score even
      // without a clear lead — avoids defaulting to "en" for PT/ES queries.
      if (
        bestLang &&
        bestScore > 0 &&
        !SUPPORTED_CHAT_LANGUAGES.has(language as ChatLanguage)
      ) {
        return bestLang;
      }
    }
  }

  if (
    typeof language === "string" &&
    SUPPORTED_CHAT_LANGUAGES.has(language as ChatLanguage)
  ) {
    return language as ChatLanguage;
  }
  return "en";
}
