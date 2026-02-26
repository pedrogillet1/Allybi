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
  }

  if (
    typeof language === "string" &&
    SUPPORTED_CHAT_LANGUAGES.has(language as ChatLanguage)
  ) {
    return language as ChatLanguage;
  }
  return "en";
}
