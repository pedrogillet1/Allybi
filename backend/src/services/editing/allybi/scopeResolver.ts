import { loadAllybiBanks } from "./loadBanks";
import type { ClassifiedIntent } from "./intentClassifier";

export interface AllybiScopeInput {
  domain: "docx" | "xlsx";
  frozenSelection?: unknown;
  liveSelection?: unknown;
  explicitTarget?: string | null;
  message?: string;
  classifiedIntent?: ClassifiedIntent | null;
}

export interface AllybiScopeResolution {
  source:
    | "frozen_selection"
    | "live_selection"
    | "explicit_anchor"
    | "structural_resolver"
    | "ask_disambiguation";
  confidence: number;
  targetHint?: string;
  targetHints?: string[];
  scopeKind:
    | "selection"
    | "word"
    | "sentence"
    | "paragraph"
    | "section"
    | "document"
    | "cell"
    | "range"
    | "sheet"
    | "workbook"
    | "unknown";
  requiresDisambiguation: boolean;
  explicitlyLimitedToFirst: boolean;
  multiRangeFanout: boolean;
}

function normalized(value: string): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getIntentEntry(
  intentBank: any,
  intentId: string | null | undefined,
): any | null {
  if (!intentId) return null;
  const intents = Array.isArray(intentBank?.intents) ? intentBank.intents : [];
  return (
    intents.find((x: any) => String(x?.intent_id || "") === String(intentId)) ||
    null
  );
}

function includesPhrase(message: string, phrase: string): boolean {
  const msg = normalized(message);
  const p = normalized(phrase);
  return Boolean(p) && msg.includes(p);
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function collapseSelectionHints(
  hints: string[],
  explicitlyLimitedToFirst: boolean,
  fallbackHint: string,
): string[] {
  const cleaned = uniq(hints);
  if (cleaned.length === 0) return [fallbackHint];
  return explicitlyLimitedToFirst ? cleaned.slice(0, 1) : cleaned;
}

function parseHintItem(item: any): string | null {
  if (typeof item === "string" && item.trim()) return item.trim();
  if (!item || typeof item !== "object") return null;
  const raw =
    item.rangeA1 ||
    item.a1 ||
    item.range ||
    item.targetId ||
    item.paragraphId ||
    item.id;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function extractSelectionHints(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;
  const single = [
    obj.rangeA1,
    obj.a1,
    obj.range,
    obj.targetId,
    obj.paragraphId,
    obj.id,
  ]
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean);

  const fromArrays: string[] = [];
  for (const key of [
    "ranges",
    "selectedRanges",
    "targets",
    "targetIds",
    "paragraphIds",
    "ids",
  ]) {
    const arr = obj[key];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      const parsed = parseHintItem(item);
      if (parsed) fromArrays.push(parsed);
    }
  }

  return uniq([...single, ...fromArrays]);
}

function detectDocxGranularity(
  message: string,
): AllybiScopeResolution["scopeKind"] | null {
  const msg = normalized(message);
  if (/\b(word|single word|palavra|uma palavra)\b/.test(msg)) return "word";
  if (/\b(sentence|frase|sentenca)\b/.test(msg)) return "sentence";
  if (/\b(paragraph|paragrafo)\b/.test(msg)) return "paragraph";
  if (/\b(section|secao)\b/.test(msg)) return "section";
  if (
    /\b(entire document|whole document|documento inteiro|todo o documento)\b/.test(
      msg,
    )
  )
    return "document";
  return null;
}

function detectXlsxGranularity(
  message: string,
): AllybiScopeResolution["scopeKind"] | null {
  const msg = normalized(message);
  if (/\b(workbook|arquivo inteiro)\b/.test(msg)) return "workbook";
  if (/\b(sheet|planilha|aba)\b/.test(msg)) return "sheet";
  if (/\b(cell|celula)\b/.test(msg)) return "cell";
  if (/\b(range|intervalo|faixa|[a-z]+[0-9]+:[a-z]+[0-9]+)\b/.test(msg))
    return "range";
  return null;
}

function limitedToFirstSelection(message: string): boolean {
  const msg = normalized(message);
  return /\b(only the first|just the first|somente a primeira|apenas a primeira)\b/.test(
    msg,
  );
}

function extractExplicitXlsxTargets(message: string): string[] {
  const text = String(message || "");
  if (!text.trim()) return [];
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string) => {
    let val = String(raw || "").trim();
    if (val.includes("!")) {
      const bang = val.indexOf("!");
      const sheetPart = val.slice(0, bang).trim();
      const rangePart = val.slice(bang + 1).trim();
      const cleanedSheet = sheetPart
        .replace(
          /^(?:set|change|update|edit|fill|format|make|mude|deixe|altere|atualize|defina)\s+/i,
          "",
        )
        .trim();
      val = `${cleanedSheet}!${rangePart}`;
    }
    if (!val) return;
    const key = val.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(val);
  };

  const sheetRangeRegex =
    /(?:^|[\s,(])((?:'[^']+'|[A-Za-z0-9_][A-Za-z0-9_ ]*)![A-Za-z]{1,3}\d{1,7}(?::[A-Za-z]{1,3}\d{1,7})?)/g;
  const bareRangeRegex = /\b[A-Za-z]{1,3}\d{1,7}(?::[A-Za-z]{1,3}\d{1,7})?\b/g;

  for (const m of text.matchAll(sheetRangeRegex)) {
    if (m?.[1]) push(m[1]);
  }
  if (out.length > 0) return out;

  const bareMatches = text.match(bareRangeRegex) || [];
  for (const m of bareMatches) push(m);
  return out;
}

export function resolveAllybiScope(
  input: AllybiScopeInput,
): AllybiScopeResolution {
  const banks = loadAllybiBanks();
  const resolverBank =
    input.domain === "docx" ? banks.docxResolvers : banks.xlsxResolvers;
  const intentBank = banks.intents;
  const message = String(input.message || "");
  const normMessage = normalized(message);
  const intentEntry = getIntentEntry(
    intentBank,
    input.classifiedIntent?.intentId || null,
  );
  const defaultScope = String(intentEntry?.default_scope || "").toLowerCase();
  const requiresSelection = String(
    intentEntry?.requires_selection || "",
  ).toLowerCase();

  const priority = Array.isArray(resolverBank?.priority)
    ? resolverBank.priority.map((x: any) => String(x))
    : [
        "live_selection",
        "frozen_selection",
        "explicit_anchor",
        "structural_resolver",
        "ask_disambiguation",
      ];

  const hasFrozen = Boolean(input.frozenSelection);
  const hasLive = Boolean(input.liveSelection);
  const explicitFromInput = String(input.explicitTarget || "").trim();
  const explicitFromMessage =
    input.domain === "xlsx" ? extractExplicitXlsxTargets(message) : [];
  const explicit = explicitFromInput || explicitFromMessage[0] || "";
  const explicitHints = explicitFromInput
    ? [explicitFromInput]
    : explicitFromMessage;
  const liveHints = extractSelectionHints(input.liveSelection);
  const frozenHints = extractSelectionHints(input.frozenSelection);
  const hasSelection =
    hasLive || hasFrozen || liveHints.length > 0 || frozenHints.length > 0;
  const explicitlyLimitedToFirst = limitedToFirstSelection(message);
  const granularHint =
    input.domain === "docx"
      ? detectDocxGranularity(message)
      : detectXlsxGranularity(message);
  const selectionFallbackHint =
    input.domain === "xlsx" ? "selection_range" : "selection";
  const liveSelectedHints = collapseSelectionHints(
    liveHints,
    explicitlyLimitedToFirst,
    selectionFallbackHint,
  );
  const frozenSelectedHints = collapseSelectionHints(
    frozenHints,
    explicitlyLimitedToFirst,
    selectionFallbackHint,
  );
  const selectedHints =
    liveHints.length > 0
      ? liveSelectedHints
      : frozenHints.length > 0
        ? frozenSelectedHints
        : hasSelection
          ? [selectionFallbackHint]
          : [];
  const mergedSelectionHints = uniq([
    ...liveSelectedHints,
    ...frozenSelectedHints,
  ]);
  const formattingClarifier = Boolean(
    input.classifiedIntent?.clarificationRequired,
  );

  const hintsByScope =
    resolverBank?.scope_hints && typeof resolverBank.scope_hints === "object"
      ? resolverBank.scope_hints
      : {};
  const documentHintPhrases = [
    ...(Array.isArray(hintsByScope?.document?.en)
      ? hintsByScope.document.en
      : []),
    ...(Array.isArray(hintsByScope?.document?.pt)
      ? hintsByScope.document.pt
      : []),
    ...(Array.isArray(hintsByScope?.document) ? hintsByScope.document : []),
  ]
    .map((x: any) => String(x || "").trim())
    .filter(Boolean);
  const hasDocumentHint = documentHintPhrases.some((p) =>
    includesPhrase(normMessage, p),
  );

  // Explicit whole-document requests must override stale selection locks.
  if (hasDocumentHint) {
    return {
      source: "structural_resolver",
      confidence: 0.97,
      targetHint: "document",
      targetHints: ["document"],
      scopeKind: "document",
      requiresDisambiguation: formattingClarifier,
      explicitlyLimitedToFirst,
      multiRangeFanout: false,
    };
  }

  if (!hasSelection && defaultScope === "document") {
    return {
      source: "structural_resolver",
      confidence: 0.88,
      targetHint: "document",
      targetHints: ["document"],
      scopeKind: "document",
      requiresDisambiguation: formattingClarifier,
      explicitlyLimitedToFirst,
      multiRangeFanout: false,
    };
  }

  if (!hasSelection && requiresSelection === "required") {
    return {
      source: "ask_disambiguation",
      confidence: 0.5,
      targetHint: explicit || undefined,
      targetHints: explicit ? [explicit] : [],
      scopeKind: "unknown",
      requiresDisambiguation: true,
      explicitlyLimitedToFirst,
      multiRangeFanout: false,
    };
  }

  // Spreadsheet contract: explicit A1/range in prompt wins over active selection.
  if (input.domain === "xlsx" && explicitHints.length > 0) {
    const picked = explicitlyLimitedToFirst
      ? explicitHints.slice(0, 1)
      : explicitHints;
    return {
      source: "explicit_anchor",
      confidence: 0.94,
      targetHint: picked[0],
      targetHints: picked,
      scopeKind: granularHint || "range",
      requiresDisambiguation: formattingClarifier,
      explicitlyLimitedToFirst,
      multiRangeFanout: picked.length > 1,
    };
  }

  for (const step of priority) {
    if (step === "frozen_selection" && hasFrozen) {
      const hints = frozenSelectedHints;
      return {
        source: "frozen_selection",
        confidence: 1,
        targetHint: hints[0],
        targetHints: hints,
        scopeKind: granularHint || "selection",
        requiresDisambiguation: formattingClarifier,
        explicitlyLimitedToFirst,
        multiRangeFanout: hints.length > 1,
      };
    }
    if (step === "live_selection" && hasLive) {
      const hints = liveSelectedHints;
      return {
        source: "live_selection",
        confidence: 0.98,
        targetHint: hints[0],
        targetHints: hints,
        scopeKind: granularHint || "selection",
        requiresDisambiguation: formattingClarifier,
        explicitlyLimitedToFirst,
        multiRangeFanout: hints.length > 1,
      };
    }
    if (
      (step === "explicit_anchor" || step === "explicit_range_or_anchor") &&
      explicit
    ) {
      const scopeKind =
        granularHint || (input.domain === "xlsx" ? "range" : "paragraph");
      return {
        source: "explicit_anchor",
        confidence: 0.92,
        targetHint: explicitHints[0] || explicit,
        targetHints: explicitHints.length > 0 ? explicitHints : [explicit],
        scopeKind,
        requiresDisambiguation: formattingClarifier,
        explicitlyLimitedToFirst,
        multiRangeFanout: explicitHints.length > 1,
      };
    }
    if (step === "structural_resolver") {
      const scopeKind =
        granularHint ||
        (defaultScope.includes("section")
          ? "section"
          : input.domain === "xlsx"
            ? "range"
            : "paragraph");
      return {
        source: "structural_resolver",
        confidence: 0.76,
        targetHint: explicit || selectedHints[0] || undefined,
        targetHints: explicit ? [explicit] : mergedSelectionHints,
        scopeKind,
        requiresDisambiguation: formattingClarifier,
        explicitlyLimitedToFirst,
        multiRangeFanout: mergedSelectionHints.length > 1 && !explicit,
      };
    }
  }

  return {
    source: "ask_disambiguation",
    confidence: 0.5,
    targetHint: explicit || undefined,
    targetHints: explicit ? [explicit] : mergedSelectionHints,
    scopeKind: "unknown",
    requiresDisambiguation: true,
    explicitlyLimitedToFirst,
    multiRangeFanout: false,
  };
}
