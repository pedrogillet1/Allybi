import { getOptionalBank } from "../../../services/core/banks/bankLoader.service";
import {
  choosePartText,
  normalizeFallbackReasonCode,
} from "./chatMicrocopy.shared";
import type {
  ChatLanguage,
  CombinatorialMicrocopyBank,
  DisambiguationMicrocopyBank,
  FallbackRouteHints,
} from "./chatMicrocopy.types";

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

export function shouldRouteToNoDocs(params: {
  reason: string;
  routeHints?: FallbackRouteHints;
}): boolean {
  return params.routeHints?.hasIndexedDocs === false || NO_DOCS_REASONS.has(params.reason);
}

export function shouldRouteToScopedNotFound(params: {
  reason: string;
  routeHints?: FallbackRouteHints;
}): boolean {
  return (
    SCOPED_NOT_FOUND_REASONS.has(params.reason) ||
    params.routeHints?.hardScopeActive === true ||
    params.routeHints?.explicitDocRef === true
  );
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
    if (selectedParts.length >= maxPartsUsed || selectedParts.length >= maxSentences) {
      break;
    }
    const fragments = Array.isArray(scenario.parts?.[partName])
      ? scenario.parts[partName]
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

export function resolveNoDocsMessage(params: {
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

export function resolveScopedNotFoundMessage(params: {
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

export function resolveDisambiguationMessage(params: {
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
    ? params.routeHints.disambiguationOptions
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
    const list = options.join(", ");
    if (params.language === "pt") return `Qual documento devo usar: ${list}?`;
    if (params.language === "es") return `Que documento debo usar: ${list}?`;
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
