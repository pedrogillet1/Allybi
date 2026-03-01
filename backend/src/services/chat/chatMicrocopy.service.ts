import { getOptionalBank } from "../core/banks/bankLoader.service";

export type ChatLanguage = "en" | "pt" | "es";

type ProcessingMessagesBank = {
  config?: {
    enabled?: boolean;
  };
  messages?: Record<string, Record<string, string[]>>;
};

type FallbackRouterBank = {
  config?: {
    enabled?: boolean;
  };
  maps?: {
    reasonCodeToTelemetryReason?: Record<string, string>;
  };
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

function normalizeFallbackReasonCode(reasonCode: string): string {
  const reason = String(reasonCode || "")
    .trim()
    .toLowerCase();
  if (!reason) return "";
  const aliases: Record<string, string> = {
    no_evidence: "no_relevant_chunks_in_scoped_docs",
    weak_evidence: "low_confidence",
    scope_lock: "scope_hard_constraints_empty",
    wrong_doc: "explicit_doc_not_found",
  };
  return aliases[reason] || reason;
}

function resolveFallbackKindFromRouter(reasonCode: string): "timeout" | "retry" | "error" {
  const normalized = normalizeFallbackReasonCode(reasonCode);
  if (!normalized) return "error";

  const router = getOptionalBank<FallbackRouterBank>("fallback_router");
  const map = router?.maps?.reasonCodeToTelemetryReason || {};
  const mapped = String(
    map[normalized] || map[normalized.toUpperCase()] || normalized || "",
  ).trim();
  const reasonKey = String(mapped || normalized).toUpperCase();

  const timeoutReasons = new Set(["TIMEOUT", "NETWORK", "PROVIDER_DOWN"]);
  if (timeoutReasons.has(reasonKey) || normalized === "indexing_in_progress") {
    return "timeout";
  }
  const retryReasons = new Set([
    "NO_EVIDENCE",
    "WEAK_EVIDENCE",
    "WRONG_DOC_LOCK",
    "WRONG_DOC",
    "SCOPE_LOCK",
    "EXTRACTION_FAILED",
  ]);
  if (retryReasons.has(reasonKey)) return "retry";
  return "error";
}

export function resolveProcessingMessage(
  key: string,
  lang: unknown,
  seed: string,
): string | null {
  const normalizedKey = String(key || "")
    .trim()
    .toLowerCase();
  if (!normalizedKey) return null;
  const resolvedLang = normalizeLanguage(lang);
  const variants = getProcessingVariants(normalizedKey, resolvedLang);
  if (!variants) return null;
  return pickVariant(variants, `${normalizedKey}:${resolvedLang}:${seed}`);
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
  const normalizedReason = normalizeFallbackReasonCode(
    String(params.reasonCode || ""),
  );
  if (normalizedReason) {
    const byReason = resolveProcessingMessage(
      normalizedReason,
      params.language,
      params.seed,
    );
    if (byReason) return byReason;
  }
  const kind = resolveFallbackKindFromRouter(String(params.reasonCode || ""));
  return (
    resolveProcessingMessage(kind, params.language, params.seed) ||
    resolveGenericChatFailureMessage(params.language, params.seed)
  );
}

export function resolveEditErrorMessage(
  code: string,
  lang: unknown,
): string | null {
  const key = String(code || "")
    .trim()
    .toUpperCase();
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
