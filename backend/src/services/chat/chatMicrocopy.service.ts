import { getOptionalBank } from "../core/banks/bankLoader.service";

export type ChatLanguage = "en" | "pt" | "es";

type ProcessingMessagesBank = {
  config?: {
    enabled?: boolean;
  };
  messages?: Record<string, Record<string, string[]>>;
};

type EditErrorCatalogBank = {
  config?: {
    enabled?: boolean;
    fallbackLanguage?: string;
  };
  errors?: Record<string, Record<string, string>>;
};

const CHAT_LANGS = new Set<ChatLanguage>(["en", "pt", "es"]);

function normalizeLanguage(lang: unknown): ChatLanguage {
  const code = String(lang || "")
    .trim()
    .toLowerCase();
  if (CHAT_LANGS.has(code as ChatLanguage)) return code as ChatLanguage;
  return "en";
}

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return h >>> 0;
}

function pickVariant(values: string[], seed: string): string | null {
  const variants = values
    .map((value) => String(value || "").trim())
    .filter((value) => value.length > 0);
  if (variants.length === 0) return null;
  if (variants.length === 1) return variants[0];
  return variants[hashSeed(seed) % variants.length] || variants[0];
}

function getProcessingVariants(
  key: string,
  lang: ChatLanguage,
): string[] | null {
  const bank = getOptionalBank<ProcessingMessagesBank>("processing_messages");
  if (!bank?.config?.enabled) return null;
  const byType = bank.messages?.[key];
  if (!byType || typeof byType !== "object") return null;
  const localized = Array.isArray(byType[lang]) ? byType[lang] : [];
  if (localized.length > 0) return localized;
  const english = Array.isArray(byType.en) ? byType.en : [];
  return english.length > 0 ? english : null;
}

export function resolveProcessingMessage(
  key: "processing" | "retry" | "error" | "timeout",
  lang: unknown,
  seed: string,
): string | null {
  const resolvedLang = normalizeLanguage(lang);
  const variants = getProcessingVariants(key, resolvedLang);
  if (!variants) return null;
  return pickVariant(variants, `${key}:${resolvedLang}:${seed}`);
}

export function resolveGenericChatFailureMessage(
  lang: unknown,
  seed: string,
): string {
  return (
    resolveProcessingMessage("error", lang, seed) ||
    resolveProcessingMessage("retry", lang, seed) ||
    resolveProcessingMessage("processing", lang, seed) ||
    resolveEditErrorMessage("GENERIC_EDIT_ERROR", lang) ||
    ""
  );
}

export function resolveRuntimeFallbackMessage(params: {
  language?: string;
  reasonCode?: string | null;
  seed: string;
}): string {
  const reason = String(params.reasonCode || "")
    .trim()
    .toLowerCase();
  const kind: "timeout" | "retry" | "error" =
    reason === "indexing_in_progress"
      ? "timeout"
      : reason === "extraction_failed"
        ? "retry"
        : "error";
  return (
    resolveProcessingMessage(kind, params.language, params.seed) ||
    resolveGenericChatFailureMessage(params.language, params.seed)
  );
}

export function resolveEditErrorMessage(
  code: string,
  lang: unknown,
): string | null {
  const key = String(code || "").trim().toUpperCase();
  if (!key) return null;

  const bank = getOptionalBank<EditErrorCatalogBank>("edit_error_catalog");
  if (!bank?.config?.enabled) return null;

  const resolvedLang = normalizeLanguage(lang);
  const fallbackLang = String(bank.config?.fallbackLanguage || "en")
    .trim()
    .toLowerCase();

  const localized = String(bank.errors?.[resolvedLang]?.[key] || "").trim();
  if (localized) return localized;

  const fallback = String(bank.errors?.[fallbackLang]?.[key] || "").trim();
  if (fallback) return fallback;

  return null;
}

export function resolveEditorTargetRequiredMessage(lang: unknown): string {
  return (
    resolveEditErrorMessage("TARGET_NOT_RESOLVED", lang) ||
    resolveEditErrorMessage("CLARIFICATION_REQUIRED", lang) ||
    resolveGenericChatFailureMessage(lang, "editor-target-required")
  );
}
