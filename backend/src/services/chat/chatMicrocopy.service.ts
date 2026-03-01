import { getOptionalBank } from "../core/banks/bankLoader.service";

export type ChatLanguage = "en" | "pt" | "es";

export type FallbackMessageContext = Record<string, unknown>;

export interface FallbackRouteHints {
  hasIndexedDocs?: boolean;
  hardScopeActive?: boolean;
  explicitDocRef?: boolean;
  needsDocChoice?: boolean;
  disambiguationOptions?: string[];
  topConfidence?: number;
  confidenceGap?: number;
}

type ProcessingMessagesBank = {
  config?: {
    enabled?: boolean;
  };
  messages?: Record<string, Record<string, string[]>>;
};

type FallbackRouterBank = {
  config?: {
    enabled?: boolean;
    defaults?: {
      action?: string;
      telemetryReason?: string;
    };
  };
  rules?: Array<{
    when?: {
      reasonCodeIn?: string[];
    };
    do?: {
      action?: string;
      telemetryReason?: string;
    };
  }>;
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

type MicrocopySanitization = {
  maxReplacementChars?: number;
  truncateEllipsis?: string;
  stripNewlines?: boolean;
  escapeMarkdown?: boolean;
};

type MicrocopyFragment = {
  id?: string;
  lang?: string;
  t?: string;
  useOnlyIfProvided?: boolean;
};

type CombinatorialMicrocopyBank = {
  config?: {
    enabled?: boolean;
    hardConstraints?: {
      maxSentences?: number;
      maxCharsHard?: number;
    };
    placeholders?: {
      sanitization?: MicrocopySanitization;
    };
    assembly?: {
      partsOrder?: string[];
      optionalParts?: string[];
      maxPartsUsed?: number;
      sentenceStrategy?: {
        joiner?: string;
      };
    };
  };
  routing?: {
    byReason?: Record<string, string>;
    byState?: Record<string, string>;
    fallbackScenario?: string;
  };
  scenarios?: Record<
    string,
    {
      parts?: Record<string, MicrocopyFragment[]>;
    }
  >;
};

type DisambiguationMicrocopyBank = {
  config?: {
    enabled?: boolean;
    actionsContract?: {
      thresholds?: {
        maxOptions?: number;
        minOptions?: number;
        maxQuestionSentences?: number;
      };
    };
  };
  rules?: Array<{
    id?: string;
    when?: {
      all?: Array<{
        path?: string;
        op?: string;
        value?: number;
      }>;
    };
  }>;
};

const CHAT_LANGS = new Set<ChatLanguage>(["en", "pt", "es"]);
const DISAMBIGUATION_REASONS = new Set(["doc_ambiguous", "needs_doc_choice"]);
const SCOPED_NOT_FOUND_REASONS = new Set([
  "scope_hard_constraints_empty",
  "no_relevant_chunks_in_scoped_docs",
  "explicit_doc_not_found",
]);
const NO_DOCS_REASONS = new Set([
  "no_docs_indexed",
  "indexing_in_progress",
  "extraction_failed",
]);

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

function normalizeContext(
  context?: FallbackMessageContext,
): Record<string, string> {
  if (!context || typeof context !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(context)) {
    if (!k) continue;
    if (v == null) continue;
    if (Array.isArray(v)) {
      const joined = v.map((item) => String(item || "").trim()).filter(Boolean).join(", ");
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

function interpolateTemplate(
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

function resolveFallbackRouterDecision(reasonCode: string): {
  action: string;
  telemetryReason: string;
} | null {
  const normalized = normalizeFallbackReasonCode(reasonCode);
  if (!normalized) return null;
  const router = getOptionalBank<FallbackRouterBank>("fallback_router");
  if (!router?.config?.enabled) return null;

  const rules = Array.isArray(router.rules) ? router.rules : [];
  for (const rule of rules) {
    const codes = Array.isArray(rule?.when?.reasonCodeIn)
      ? rule.when.reasonCodeIn
          .map((value) => normalizeFallbackReasonCode(String(value || "")))
          .filter((value) => value.length > 0)
      : [];
    if (codes.length > 0 && !codes.includes(normalized)) continue;

    const action = String(rule?.do?.action || "").trim();
    if (!action) continue;
    const telemetryReason = String(rule?.do?.telemetryReason || "").trim();
    return {
      action,
      telemetryReason,
    };
  }

  const fallbackAction = String(router?.config?.defaults?.action || "").trim();
  if (!fallbackAction) return null;
  const fallbackTelemetry = String(
    router?.config?.defaults?.telemetryReason || "",
  ).trim();
  return {
    action: fallbackAction,
    telemetryReason: fallbackTelemetry,
  };
}

function resolveFallbackKindFromRouter(
  reasonCode: string,
): "timeout" | "retry" | "error" {
  const normalized = normalizeFallbackReasonCode(reasonCode);
  if (!normalized) return "error";

  const decision = resolveFallbackRouterDecision(normalized);
  if (decision?.action) {
    const action = decision.action;
    if (action === "retry_same_provider" || action === "switch_provider") {
      return "timeout";
    }
    if (
      action === "regen_with_stricter_model" ||
      action === "route_to_discovery" ||
      action === "ask_one_question"
    ) {
      return "retry";
    }
    if (action === "return_reason_only") {
      return "error";
    }
  }

  const router = getOptionalBank<FallbackRouterBank>("fallback_router");
  const map = router?.maps?.reasonCodeToTelemetryReason || {};
  const mapped = String(decision?.telemetryReason || "")
    .trim()
    .toUpperCase();
  const mappedByLookup = String(
    map[normalized] || map[normalized.toUpperCase()] || normalized || "",
  ).trim();
  const reasonKey = String(mapped || mappedByLookup || normalized).toUpperCase();

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

function normalizeReasonState(reasonCode: string): string {
  const reason = normalizeFallbackReasonCode(reasonCode);
  const map: Record<string, string> = {
    no_docs_indexed: "empty_index",
    indexing_in_progress: "indexing_in_progress",
    extraction_failed: "extraction_failed",
    privacy_block: "permission_denied",
    scope_hard_constraints_empty: "out_of_scope",
    explicit_doc_not_found: "out_of_scope",
    no_relevant_chunks_in_scoped_docs: "out_of_scope",
  };
  return map[reason] || "unknown";
}

function shouldRouteToNoDocs(params: {
  reason: string;
  routeHints?: FallbackRouteHints;
}): boolean {
  if (params.routeHints?.hasIndexedDocs === false) return true;
  if (NO_DOCS_REASONS.has(params.reason)) return true;
  return false;
}

function shouldRouteToScopedNotFound(params: {
  reason: string;
  routeHints?: FallbackRouteHints;
}): boolean {
  if (SCOPED_NOT_FOUND_REASONS.has(params.reason)) return true;
  if (params.routeHints?.hardScopeActive) return true;
  if (params.routeHints?.explicitDocRef) return true;
  return false;
}

function getLocalizedFragments(
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

function choosePartText(params: {
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
      if (placeholders.length > 0) {
        const allPresent = placeholders.every((key) => {
          const val = params.context[key];
          return Boolean(String(val || "").trim());
        });
        if (!allPresent) continue;
      }
    }

    const hydrated = interpolateTemplate(template, params.context, params.sanitization);
    if (!hydrated) continue;
    rendered.push(hydrated);
  }

  if (rendered.length === 0) return null;
  return pickVariant(rendered, params.seed);
}

function composeCombinatorialMicrocopy(params: {
  bank: CombinatorialMicrocopyBank;
  scenarioId: string;
  language: ChatLanguage;
  seed: string;
  context: Record<string, string>;
}): string | null {
  const scenario = params.bank.scenarios?.[params.scenarioId];
  if (!scenario?.parts || typeof scenario.parts !== "object") return null;

  const hard = params.bank.config?.hardConstraints || {};
  const assembly = params.bank.config?.assembly || {};
  const sanitization = params.bank.config?.placeholders?.sanitization;

  const maxPartsUsed = Number(assembly.maxPartsUsed || 3);
  const maxSentences = Number(hard.maxSentences || 3);
  const maxCharsHard = Number(hard.maxCharsHard || 380);
  const optionalParts = new Set(
    Array.isArray(assembly.optionalParts) ? assembly.optionalParts : [],
  );

  const defaultOrder = Object.keys(scenario.parts || {});
  const partsOrder =
    Array.isArray(assembly.partsOrder) && assembly.partsOrder.length > 0
      ? assembly.partsOrder
      : defaultOrder;

  const selectedParts: string[] = [];
  for (const partName of partsOrder) {
    if (selectedParts.length >= maxPartsUsed) break;
    if (selectedParts.length >= maxSentences) break;

    const fragments = Array.isArray(scenario.parts?.[partName])
      ? (scenario.parts?.[partName] as MicrocopyFragment[])
      : [];
    if (fragments.length === 0) continue;

    const partText = choosePartText({
      fragments,
      lang: params.language,
      seed: `${params.seed}:${params.scenarioId}:${partName}`,
      context: params.context,
      sanitization,
    });

    if (!partText) {
      if (optionalParts.has(partName)) continue;
      continue;
    }
    selectedParts.push(partText);
  }

  if (selectedParts.length === 0) return null;
  const joiner = String(assembly.sentenceStrategy?.joiner || " ");
  let out = selectedParts.join(joiner).replace(/\s+/g, " ").trim();

  if (Number.isFinite(maxCharsHard) && maxCharsHard > 0 && out.length > maxCharsHard) {
    out = `${out.slice(0, Math.max(0, maxCharsHard - 3)).trimEnd()}...`;
  }
  return out || null;
}

function resolveNoDocsMessage(params: {
  reasonCode: string;
  language: ChatLanguage;
  seed: string;
  context: Record<string, string>;
}): string | null {
  const bank = getOptionalBank<CombinatorialMicrocopyBank>("no_docs_messages");
  if (!bank?.config?.enabled) return null;

  const state = normalizeReasonState(params.reasonCode);
  const scenarioId =
    String(bank.routing?.byState?.[state] || bank.routing?.fallbackScenario || "").trim() ||
    "generic";

  return composeCombinatorialMicrocopy({
    bank,
    scenarioId,
    language: params.language,
    seed: `${params.seed}:no_docs:${state}`,
    context: params.context,
  });
}

function resolveScopedNotFoundMessage(params: {
  reasonCode: string;
  language: ChatLanguage;
  seed: string;
  context: Record<string, string>;
}): string | null {
  const bank = getOptionalBank<CombinatorialMicrocopyBank>(
    "scoped_not_found_messages",
  );
  if (!bank?.config?.enabled) return null;

  const reason = normalizeFallbackReasonCode(params.reasonCode);
  const scenarioId =
    String(
      bank.routing?.byReason?.[reason] ||
        bank.routing?.byReason?.[reason.toUpperCase()] ||
        bank.routing?.fallbackScenario ||
        "",
    ).trim() || "generic";

  return composeCombinatorialMicrocopy({
    bank,
    scenarioId,
    language: params.language,
    seed: `${params.seed}:scoped:${reason || "unknown"}`,
    context: params.context,
  });
}

function maybeAutopickDisambiguation(params: {
  bank: DisambiguationMicrocopyBank;
  options: string[];
  routeHints?: FallbackRouteHints;
  language: ChatLanguage;
}): string | null {
  if (params.options.length === 0) return null;
  const rule = (Array.isArray(params.bank.rules) ? params.bank.rules : []).find(
    (item) => String(item?.id || "").trim() === "autopick_when_confident",
  );
  if (!rule) return null;

  const criteria = Array.isArray(rule.when?.all) ? rule.when.all : [];
  const minTop = Number(
    criteria.find((entry) => entry.path === "metrics.topConfidence")?.value ?? 0.85,
  );
  const minGap = Number(
    criteria.find((entry) => entry.path === "metrics.confidenceGap")?.value ?? 0.25,
  );

  const topConfidence = Number(params.routeHints?.topConfidence ?? 0);
  const confidenceGap = Number(params.routeHints?.confidenceGap ?? 0);
  if (topConfidence < minTop || confidenceGap < minGap) return null;

  const top = params.options[0];
  if (!top) return null;
  if (params.language === "pt") {
    return `Vou usar ${top}. Se preferir outro documento, me avise.`;
  }
  if (params.language === "es") {
    return `Usare ${top}. Si prefieres otro documento, dimelo.`;
  }
  return `I will use ${top}. Tell me if you meant a different document.`;
}

function resolveDisambiguationMessage(params: {
  reasonCode: string;
  language: ChatLanguage;
  seed: string;
  routeHints?: FallbackRouteHints;
}): string | null {
  const reason = normalizeFallbackReasonCode(params.reasonCode);
  if (!DISAMBIGUATION_REASONS.has(reason)) return null;

  const bank = getOptionalBank<DisambiguationMicrocopyBank>(
    "disambiguation_microcopy",
  );
  if (!bank?.config?.enabled) return null;

  const thresholds = bank.config?.actionsContract?.thresholds || {};
  const maxOptions = Math.max(2, Math.min(6, Number(thresholds.maxOptions || 4)));
  const rawOptions = Array.isArray(params.routeHints?.disambiguationOptions)
    ? params.routeHints?.disambiguationOptions
    : [];
  const options = Array.from(
    new Set(
      rawOptions
        .map((value) => String(value || "").trim())
        .filter((value) => value.length > 0),
    ),
  ).slice(0, maxOptions);

  const autopick = maybeAutopickDisambiguation({
    bank,
    options,
    routeHints: params.routeHints,
    language: params.language,
  });
  if (autopick) return autopick;

  if (options.length >= 2) {
    const list =
      params.language === "pt"
        ? options.join(", ")
        : params.language === "es"
          ? options.join(", ")
          : options.join(", ");
    if (params.language === "pt") {
      return `Qual documento devo usar: ${list}?`;
    }
    if (params.language === "es") {
      return `Que documento debo usar: ${list}?`;
    }
    return `Which document should I use: ${list}?`;
  }

  if (params.language === "pt") {
    return "Preciso de uma confirmacao rapida para escolher o documento certo.";
  }
  if (params.language === "es") {
    return "Necesito una aclaracion rapida para elegir el documento correcto.";
  }
  return "I need one quick clarification to pick the right document.";
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
