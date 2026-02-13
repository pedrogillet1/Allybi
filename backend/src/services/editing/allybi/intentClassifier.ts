import { loadAllybiBanks } from "./loadBanks";
import { resolveFontIntent } from "./fontIntentResolver";

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
    if (!text.includes(phrase)) continue;

    const intentId = String(trig?.intent_id || "").trim();
    if (!intentId) continue;

    const intentEntry = (intentBank.intents as any[]).find((x) => String(x?.intent_id || "") === intentId);
    if (!intentEntry) continue;

    const scope = Array.isArray(intentEntry.filetype_scope) ? intentEntry.filetype_scope.map((x: any) => String(x)) : [];
    const filetypeMatch = scope.includes("global") || scope.includes(filetype);
    if (!filetypeMatch) continue;

    const confidence = Math.min(0.99, 0.62 + phrase.length / 150);
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
