import { loadAllybiBanks } from "./loadBanks";
import { resolveFontIntent } from "./fontIntentResolver";
import { analyzeMessageToPlan } from "../intentRuntime";

export interface ClassifiedIntent {
  intentId: string;
  confidence: number;
  operatorCandidates: string[];
  language: "en" | "pt";
  reason: string;
  fontFamily?: string;
  fontCandidates?: string[];
  clarificationRequired?: boolean;
  isFormattingIntent?: boolean;
}

function mapRuntimeOpsToLegacyIntent(
  ops: string[],
  filetype: "docx" | "xlsx",
): { intentId: string; isFormattingIntent?: boolean } {
  const upperOps = ops.map((op) => String(op || "").toUpperCase());

  if (filetype === "docx") {
    if (upperOps.some((op) => op.startsWith("DOCX_LIST_"))) {
      return { intentId: "DOCX_LIST_CONVERT" };
    }
    if (upperOps.some((op) => op === "DOCX_FIND_REPLACE")) {
      return { intentId: "DOCX_FIND_REPLACE" };
    }
    if (upperOps.some((op) => op === "DOCX_TRANSLATE_SCOPE")) {
      return { intentId: "DOCX_TRANSLATE" };
    }
    if (upperOps.some((op) => op === "DOCX_SET_TEXT_CASE"))
      return { intentId: "DOCX_TEXT_CASE", isFormattingIntent: true };
    if (upperOps.some((op) => op === "DOCX_SET_RUN_STYLE" || op === "DOCX_CLEAR_RUN_STYLE" || op === "DOCX_SET_PARAGRAPH_STYLE" || op === "DOCX_SET_HEADING_LEVEL" || op === "DOCX_SET_ALIGNMENT")) {
      return { intentId: "DOCX_FORMAT_INLINE", isFormattingIntent: true };
    }
    if (upperOps.some((op) => op === "DOCX_REPLACE_SPAN" || op === "DOCX_REWRITE_PARAGRAPH" || op === "DOCX_REWRITE_SECTION")) {
      return { intentId: "DOCX_REWRITE" };
    }
    if (upperOps.some((op) => op === "DOCX_INSERT_AFTER" || op === "DOCX_INSERT_BEFORE")) {
      return { intentId: "DOCX_INSERT_PARAGRAPH" };
    }
    return { intentId: "DOCX_REWRITE" };
  }

  if (upperOps.some((op) => op === "XLSX_SET_NUMBER_FORMAT" || op === "XLSX_FORMAT_RANGE" || op.includes("COND_FORMAT"))) {
    return { intentId: "XLSX_FORMAT_RANGE", isFormattingIntent: true };
  }
  if (upperOps.some((op) => op === "XLSX_SET_CELL_FORMULA" || op === "XLSX_SET_RANGE_FORMULAS" || op === "XLSX_FILL_DOWN" || op === "XLSX_FILL_RIGHT")) {
    return { intentId: "XLSX_FORMULA" };
  }
  if (upperOps.some((op) => op.startsWith("XLSX_CHART_"))) {
    return { intentId: "XLSX_CHART" };
  }
  if (upperOps.some((op) => op === "XLSX_SORT_RANGE")) {
    return { intentId: "XLSX_SORT" };
  }
  if (upperOps.some((op) => op === "XLSX_FILTER_APPLY" || op === "XLSX_FILTER_CLEAR")) {
    return { intentId: "XLSX_FILTER" };
  }
  if (upperOps.some((op) => op === "XLSX_SET_RANGE_VALUES" || op === "XLSX_SET_CELL_VALUE")) {
    return { intentId: "XLSX_SET_VALUE" };
  }
  return { intentId: "XLSX_SET_VALUE" };
}

function detectLanguage(message: string): "en" | "pt" {
  const low = String(message || "").toLowerCase();
  if (/\b(portugu[eê]s|pt-br|pt)\b/.test(low)) return "pt";
  if (/[ãõçáâêôàéíóú]/.test(low)) return "pt";
  return "en";
}

function normalizedText(value: string): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return normalizedText(value).split(/[^a-z0-9]+/).filter(Boolean);
}

function phraseTokenCoverage(textTokens: string[], phraseTokens: string[]): number {
  if (!textTokens.length || !phraseTokens.length) return 0;
  let hit = 0;
  for (const t of phraseTokens) {
    if (textTokens.includes(t)) hit += 1;
  }
  return hit / phraseTokens.length;
}

function orderedTokenCoverage(textTokens: string[], phraseTokens: string[]): number {
  if (!textTokens.length || !phraseTokens.length) return 0;
  let cursor = 0;
  let hit = 0;
  for (const token of phraseTokens) {
    let found = false;
    for (let i = cursor; i < textTokens.length; i += 1) {
      if (textTokens[i] === token) {
        hit += 1;
        cursor = i + 1;
        found = true;
        break;
      }
    }
    if (!found) continue;
  }
  return hit / phraseTokens.length;
}

function wholeWordContains(text: string, token: string): boolean {
  if (!text || !token) return false;
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(text);
}

function triggerMatchScore(text: string, phrase: string): number {
  const normText = normalizedText(text);
  const normPhrase = normalizedText(phrase);
  if (!normText || !normPhrase) return 0;

  if (normText.includes(normPhrase)) return 1;

  const textTokens = tokenize(normText);
  const phraseTokens = tokenize(normPhrase);
  if (!textTokens.length || !phraseTokens.length) return 0;

  // Single-token triggers need whole-word containment to avoid noisy matches.
  if (phraseTokens.length === 1) {
    return wholeWordContains(normText, phraseTokens[0]) ? 0.92 : 0;
  }

  const tokenCoverage = phraseTokenCoverage(textTokens, phraseTokens);
  const orderedCoverage = orderedTokenCoverage(textTokens, phraseTokens);
  const overlap = overlapScore(normText, normPhrase);
  const score = Math.max(overlap, tokenCoverage * 0.9, orderedCoverage * 0.95);

  // Require strong evidence for multi-token phrase triggers.
  if (orderedCoverage >= 0.75 && tokenCoverage >= 0.75) return score;
  if (overlap >= 0.72 && tokenCoverage >= 0.7) return score;
  return 0;
}

function overlapScore(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  const union = ta.size + tb.size - inter;
  return union > 0 ? inter / union : 0;
}

export function classifyAllybiIntent(message: string, filetype: "docx" | "xlsx" | "global", languageHint?: "en" | "pt"): ClassifiedIntent | null {
  if (filetype === "docx" || filetype === "xlsx") {
    const runtimeDomain = filetype === "docx" ? "docx" : "excel";
    const runtime = analyzeMessageToPlan({
      message,
      domain: runtimeDomain,
      viewerContext: {},
      ...(languageHint ? { language: languageHint } : {}),
    });

    if (runtime?.kind === "plan" && Array.isArray(runtime.ops) && runtime.ops.length > 0) {
      const operatorCandidates = Array.from(
        new Set(runtime.ops.map((op) => String(op?.op || "").trim()).filter(Boolean)),
      );
      const mapped = mapRuntimeOpsToLegacyIntent(operatorCandidates, filetype);
      return {
        intentId: mapped.intentId,
        confidence: 0.9,
        operatorCandidates,
        language: runtime.language,
        reason: `intent_runtime:${runtime.sourcePatternIds.join(",")}`,
        ...(mapped.isFormattingIntent ? { isFormattingIntent: true } : {}),
      };
    }

    if (runtime?.kind === "clarification") {
      const operatorCandidates = Array.from(
        new Set((runtime.partialOps || []).map((op) => String(op?.op || "").trim()).filter(Boolean)),
      );
      const mapped = mapRuntimeOpsToLegacyIntent(operatorCandidates, filetype);
      return {
        intentId: mapped.intentId,
        confidence: 0.62,
        operatorCandidates,
        language: languageHint || detectLanguage(message),
        reason: `intent_runtime:clarification:${runtime.sourcePatternIds.join(",")}`,
        clarificationRequired: true,
        ...(mapped.isFormattingIntent ? { isFormattingIntent: true } : {}),
      };
    }
  }

  const banks = loadAllybiBanks();
  const intentBank = banks.intents;
  const triggerBank = banks.languageTriggers;
  if (!intentBank || !Array.isArray(intentBank.intents) || !triggerBank || !Array.isArray(triggerBank.triggers)) {
    return null;
  }

  const language = languageHint || detectLanguage(message);
  const text = normalizedText(message);

  if (filetype === "docx" || filetype === "xlsx") {
    const fontIntent = resolveFontIntent(message, language);
    if (fontIntent.matched && fontIntent.canonicalFamily) {
      const operatorCandidates = filetype === "docx"
        ? ["DOCX_SET_RUN_STYLE"]
        : ["XLSX_FORMAT_RANGE", "XLSX_SET_NUMBER_FORMAT"];
      return {
        intentId: filetype === "docx" ? "DOCX_FORMAT_INLINE" : "XLSX_FORMAT_RANGE",
        confidence: Math.min(0.99, Math.max(0.72, fontIntent.confidence)),
        operatorCandidates,
        language,
        reason: `font_entity:${fontIntent.canonicalFamily}`,
        fontFamily: fontIntent.canonicalFamily,
        fontCandidates: fontIntent.supportedFamilies,
        clarificationRequired: false,
        isFormattingIntent: true,
      };
    }
    if (fontIntent.ambiguous) {
      const operatorCandidates = filetype === "docx"
        ? ["DOCX_SET_RUN_STYLE"]
        : ["XLSX_FORMAT_RANGE", "XLSX_SET_NUMBER_FORMAT"];
      return {
        intentId: filetype === "docx" ? "DOCX_FORMAT_INLINE" : "XLSX_FORMAT_RANGE",
        confidence: 0.62,
        operatorCandidates,
        language,
        reason: "font_entity_ambiguous",
        fontCandidates: fontIntent.candidates,
        clarificationRequired: true,
        isFormattingIntent: true,
      };
    }
  }

  let best: ClassifiedIntent | null = null;

  for (const trig of triggerBank.triggers as any[]) {
    const phrase = normalizedText(String(trig?.phrase || ""));
    if (!phrase) continue;
    if (String(trig?.lang || "") !== language) continue;
    const matchScore = triggerMatchScore(text, phrase);
    if (matchScore <= 0) continue;

    const intentId = String(trig?.intent_id || "").trim();
    if (!intentId) continue;

    const intentEntry = (intentBank.intents as any[]).find((x) => String(x?.intent_id || "") === intentId);
    if (!intentEntry) continue;

    const scope = Array.isArray(intentEntry.filetype_scope) ? intentEntry.filetype_scope.map((x: any) => String(x)) : [];
    const filetypeMatch = scope.includes("global") || scope.includes(filetype);
    if (!filetypeMatch) continue;

    const confidence = Math.min(0.99, 0.52 + phrase.length / 220 + matchScore * 0.4);
    const candidate: ClassifiedIntent = {
      intentId,
      confidence,
      operatorCandidates: Array.isArray(trig.operator_candidates)
        ? trig.operator_candidates.map((x: any) => String(x)).filter(Boolean)
        : [],
      language,
      reason: `trigger:${phrase}`,
    };

    if (!best || candidate.confidence > best.confidence) best = candidate;
  }

  if (best) return best;

  const byFiletype = (intentBank.intents as any[]).filter((x: any) => {
    const scope = Array.isArray(x?.filetype_scope) ? x.filetype_scope.map((y: any) => String(y)) : [];
    if (filetype !== "global" && scope.includes("global") && !scope.includes(filetype)) return false;
    return scope.includes(filetype) || scope.includes("global");
  });

  if (!byFiletype.length) return null;

  let bestByExamples: ClassifiedIntent | null = null;
  for (const entry of byFiletype) {
    const examples =
      language === "pt"
        ? Array.isArray(entry?.examples_pt) ? entry.examples_pt : []
        : Array.isArray(entry?.examples_en) ? entry.examples_en : [];
    const negatives = Array.isArray(entry?.negative_examples) ? entry.negative_examples : [];

    let pos = 0;
    for (const ex of examples) {
      const s = overlapScore(text, String(ex || ""));
      if (s > pos) pos = s;
    }

    let neg = 0;
    for (const ex of negatives) {
      const s = overlapScore(text, String(ex || ""));
      if (s > neg) neg = s;
    }

    const score = Math.max(0, pos - neg * 0.65);
    if (score < 0.12) continue;

    const candidate: ClassifiedIntent = {
      intentId: String(entry?.intent_id || "").trim() || "UNKNOWN",
      confidence: Math.min(0.75, 0.4 + score * 0.55),
      operatorCandidates: [],
      language,
      reason: "examples_similarity",
    };
    if (!bestByExamples || candidate.confidence > bestByExamples.confidence) {
      bestByExamples = candidate;
    }
  }

  return bestByExamples;
}
