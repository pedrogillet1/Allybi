import { getOptionalBank } from "../../../services/core/banks/bankLoader.service";
import type {
  ChatLanguage,
  FallbackRouterBank,
  FallbackMessageContext,
  MicrocopyFragment,
  MicrocopySanitization,
  ProcessingMessagesBank,
} from "./chatMicrocopy.types";

const CHAT_LANGS = new Set<ChatLanguage>(["en", "pt", "es"]);

export function normalizeLanguage(lang: unknown): ChatLanguage {
  const code = String(lang || "").trim().toLowerCase();
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

export function pickVariant(values: string[], seed: string): string | null {
  const variants = values
    .map((value) => String(value || "").trim())
    .filter((value) => value.length > 0);
  if (variants.length === 0) return null;
  if (variants.length === 1) return variants[0];
  return variants[hashSeed(seed) % variants.length] || variants[0];
}

export function normalizeContext(
  context?: FallbackMessageContext,
): Record<string, string> {
  if (!context || typeof context !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(context)) {
    if (!k || v == null) continue;
    if (Array.isArray(v)) {
      const joined = v
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .join(", ");
      if (joined) out[k] = joined;
      continue;
    }
    const text = String(v).trim();
    if (text) out[k] = text;
  }
  return out;
}

function escapeMarkdown(input: string): string {
  return input.replace(/[\\`*_{}[\]()#+\-.!|>]/g, "\\$&");
}

function sanitizeReplacement(
  value: string,
  sanitization?: MicrocopySanitization,
): string {
  let out = String(value || "");
  if (sanitization?.stripNewlines !== false) {
    out = out.replace(/[\r\n]+/g, " ");
  }
  out = out.replace(/\s+/g, " ").trim();

  const maxChars = Number(sanitization?.maxReplacementChars || 120);
  if (Number.isFinite(maxChars) && maxChars > 0 && out.length > maxChars) {
    const ellipsis = String(sanitization?.truncateEllipsis || "...");
    out = `${out.slice(0, Math.max(0, maxChars - ellipsis.length)).trimEnd()}${ellipsis}`;
  }

  if (sanitization?.escapeMarkdown) {
    out = escapeMarkdown(out);
  }
  return out;
}

function stripUnresolvedPlaceholders(input: string): string {
  return String(input || "")
    .replace(/\{\{\s*[^}]+\s*\}\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function interpolateTemplate(
  template: string,
  params: Record<string, string>,
  sanitization?: MicrocopySanitization,
): string {
  const hydrated = String(template || "").replace(
    /\{\{\s*([^}]+)\s*\}\}/g,
    (_match, key) => {
      const cleanKey = String(key || "").trim();
      const rawValue = params[cleanKey];
      if (rawValue == null) return "";
      return sanitizeReplacement(rawValue, sanitization);
    },
  );
  return stripUnresolvedPlaceholders(hydrated);
}

function getPlaceholders(input: string): string[] {
  const out = new Set<string>();
  const pattern = /\{\{\s*([^}]+)\s*\}\}/g;
  let match: RegExpExecArray | null = null;
  while (true) {
    match = pattern.exec(String(input || ""));
    if (!match) break;
    const key = String(match[1] || "").trim();
    if (key) out.add(key);
  }
  return [...out];
}

export function getProcessingVariants(
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

export function normalizeFallbackReasonCode(reasonCode: string): string {
  const reason = String(reasonCode || "").trim().toLowerCase();
  if (!reason) return "";
  const aliases: Record<string, string> = {
    no_evidence: "no_relevant_chunks_in_scoped_docs",
    weak_evidence: "low_confidence",
    scope_lock: "scope_hard_constraints_empty",
    wrong_doc: "explicit_doc_not_found",
  };
  return aliases[reason] || reason;
}

function resolveFallbackRouterDecision(reasonCode: string): {
  action: string;
  telemetryReason: string;
} | null {
  const normalized = normalizeFallbackReasonCode(reasonCode);
  if (!normalized) return null;
  const router = getOptionalBank<FallbackRouterBank>("fallback_router");
  if (!router?.config?.enabled) return null;
  for (const rule of Array.isArray(router.rules) ? router.rules : []) {
    const codes = Array.isArray(rule?.when?.reasonCodeIn)
      ? rule.when.reasonCodeIn
          .map((value) => normalizeFallbackReasonCode(String(value || "")))
          .filter((value) => value.length > 0)
      : [];
    if (codes.length > 0 && !codes.includes(normalized)) continue;
    const action = String(rule?.do?.action || "").trim();
    if (!action) continue;
    const telemetryReason = String(rule?.do?.telemetryReason || "").trim();
    return { action, telemetryReason };
  }

  const fallbackAction = String(router?.config?.defaults?.action || "").trim();
  if (!fallbackAction) return null;
  return {
    action: fallbackAction,
    telemetryReason: String(
      router?.config?.defaults?.telemetryReason || "",
    ).trim(),
  };
}

export function resolveFallbackKindFromRouter(
  reasonCode: string,
): "timeout" | "retry" | "error" {
  const normalized = normalizeFallbackReasonCode(reasonCode);
  if (!normalized) return "error";

  const router = getOptionalBank<FallbackRouterBank>("fallback_router");
  const canonicalReasonCodes = new Set(
    Array.isArray(router?.config?.canonicalReasonCodes)
      ? router.config.canonicalReasonCodes
          .map((value) => normalizeFallbackReasonCode(String(value || "")))
          .filter((value) => value.length > 0)
      : [],
  );
  if (canonicalReasonCodes.size > 0 && !canonicalReasonCodes.has(normalized)) {
    return "error";
  }

  const decision = resolveFallbackRouterDecision(normalized);
  if (decision?.action) {
    if (
      decision.action === "retry_same_provider" ||
      decision.action === "switch_provider"
    ) {
      return "timeout";
    }
    if (
      decision.action === "regen_with_stricter_model" ||
      decision.action === "route_to_discovery" ||
      decision.action === "ask_one_question"
    ) {
      return "retry";
    }
    if (decision.action === "return_reason_only") {
      return "error";
    }
  }

  const map = router?.maps?.reasonCodeToTelemetryReason || {};
  const mapped = String(decision?.telemetryReason || "").trim().toUpperCase();
  const mappedByLookup = String(
    map[normalized] || map[normalized.toUpperCase()] || normalized || "",
  ).trim();
  const reasonKey = String(mapped || mappedByLookup || normalized).toUpperCase();
  if (
    new Set(["TIMEOUT", "NETWORK", "PROVIDER_DOWN"]).has(reasonKey) ||
    normalized === "indexing_in_progress"
  ) {
    return "timeout";
  }
  if (
    new Set([
      "NO_EVIDENCE",
      "WEAK_EVIDENCE",
      "WRONG_DOC_LOCK",
      "WRONG_DOC",
      "SCOPE_LOCK",
      "EXTRACTION_FAILED",
    ]).has(reasonKey)
  ) {
    return "retry";
  }
  return "error";
}

export function getLocalizedFragments(
  fragments: MicrocopyFragment[],
  lang: ChatLanguage,
): MicrocopyFragment[] {
  const localized = fragments.filter(
    (fragment) => String(fragment?.lang || "").trim().toLowerCase() === lang,
  );
  if (localized.length > 0) return localized;
  const english = fragments.filter(
    (fragment) => String(fragment?.lang || "").trim().toLowerCase() === "en",
  );
  return english.length > 0 ? english : fragments;
}

export function choosePartText(params: {
  fragments: MicrocopyFragment[];
  lang: ChatLanguage;
  seed: string;
  context: Record<string, string>;
  sanitization?: MicrocopySanitization;
}): string | null {
  const localized = getLocalizedFragments(params.fragments, params.lang);
  const rendered: string[] = [];
  for (const fragment of localized) {
    const template = String(fragment?.t || "").trim();
    if (!template) continue;
    if (fragment?.useOnlyIfProvided) {
      const placeholders = getPlaceholders(template);
      if (
        placeholders.length > 0 &&
        !placeholders.every((key) => Boolean(String(params.context[key] || "").trim()))
      ) {
        continue;
      }
    }
    const hydrated = interpolateTemplate(
      template,
      params.context,
      params.sanitization,
    );
    if (hydrated) rendered.push(hydrated);
  }
  if (rendered.length === 0) return null;
  return pickVariant(rendered, params.seed);
}
