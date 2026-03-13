import { getOptionalBank } from "../../../services/core/banks/bankLoader.service";
import {
  getProcessingVariants,
  interpolateTemplate,
  normalizeContext,
  normalizeFallbackReasonCode,
  normalizeLanguage,
  pickVariant,
  resolveFallbackKindFromRouter,
} from "./chatMicrocopy.shared";
import {
  resolveDisambiguationMessage,
  resolveNoDocsMessage,
  resolveScopedNotFoundMessage,
  shouldRouteToNoDocs,
  shouldRouteToScopedNotFound,
} from "./chatMicrocopyFallback";
import type {
  ChatLanguage,
  EditErrorCatalogBank,
  FallbackMessageContext,
  FallbackRouteHints,
} from "./chatMicrocopy.types";

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
  context?: FallbackMessageContext;
  routeHints?: FallbackRouteHints;
}): string {
  const language = normalizeLanguage(params.language);
  const reason = normalizeFallbackReasonCode(String(params.reasonCode || ""));
  const context = normalizeContext(params.context);

  const disambiguation = resolveDisambiguationMessage({
    reasonCode: reason,
    language,
    seed: params.seed,
    routeHints: params.routeHints,
  });
  if (disambiguation) return disambiguation;

  if (shouldRouteToScopedNotFound({ reason, routeHints: params.routeHints })) {
    const scopedMessage = resolveScopedNotFoundMessage({
      reasonCode: reason,
      language,
      seed: params.seed,
      context,
    });
    if (scopedMessage) return scopedMessage;
  }

  if (shouldRouteToNoDocs({ reason, routeHints: params.routeHints })) {
    const noDocsMessage = resolveNoDocsMessage({
      reasonCode: reason,
      language,
      seed: params.seed,
      context,
    });
    if (noDocsMessage) return noDocsMessage;
  }

  if (reason) {
    const byReason = resolveProcessingMessage(reason, language, params.seed);
    if (byReason) return byReason;
  }

  const kind = resolveFallbackKindFromRouter(reason);
  return (
    resolveProcessingMessage(kind, language, params.seed) ||
    resolveGenericChatFailureMessage(language, params.seed)
  );
}

export function resolveEditErrorMessage(
  code: string,
  lang: unknown,
  params?: Record<string, unknown>,
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
  const fallback = String(bank.errors?.[fallbackLang]?.[key] || "").trim();
  const template = localized || fallback;
  if (!template) return null;

  const hydrated = interpolateTemplate(template, normalizeContext(params), {
    maxReplacementChars: 120,
    stripNewlines: true,
  });
  return hydrated || null;
}

export function resolveEditorTargetRequiredMessage(lang: unknown): string {
  return (
    resolveEditErrorMessage("TARGET_NOT_RESOLVED", lang) ||
    resolveEditErrorMessage("CLARIFICATION_REQUIRED", lang) ||
    resolveGenericChatFailureMessage(lang, "editor-target-required")
  );
}

export type {
  ChatLanguage,
  FallbackMessageContext,
  FallbackRouteHints,
} from "./chatMicrocopy.types";
