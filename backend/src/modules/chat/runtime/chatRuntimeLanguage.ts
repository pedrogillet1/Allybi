const EN_LANGUAGE_MARKERS =
  /\b(the|with|this|that|for|from|please|summary|table|evidence|document|documents|according|based|thanks|yes|no)\b/g;
const PT_LANGUAGE_MARKERS =
  /\b(nao|não|voce|você|com|como|onde|porque|obrigado|obrigada|resumo|tabela|evidencia|evidência|documento|documentos|sim)\b/g;
const ES_LANGUAGE_MARKERS =
  /\b(con|donde|cual|cuál|cuales|cuáles|gracias|resumen|tabla|evidencia|documento|documentos|si|sí)\b/g;
const ENGLISH_STRUCTURAL_WORDS = /\b(and|or|to|of|in|on|is|are|was|were)\b/g;
const PORTUGUESE_STRUCTURAL_WORDS =
  /\b(e|ou|para|de|do|da|dos|das|que|em|ao|aos)\b/g;
const SPANISH_STRUCTURAL_WORDS = /\b(y|o|para|de|del|la|las|los|que|en|al)\b/g;
const EN_DISTINCT_LANGUAGE_MARKERS =
  /\b(the|with|this|that|please|summary|according|based|thanks|answer)\b/g;
const PT_DISTINCT_LANGUAGE_MARKERS =
  /\b(nao|não|voce|você|obrigado|obrigada|resumo|portugues|português|resposta|envio)\b/g;
const ES_DISTINCT_LANGUAGE_MARKERS =
  /\b(gracias|resumen|respuesta|envio|envío|espanol|español|segun|según)\b/g;

function countRegexMatches(text: string, pattern: RegExp): number {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

export function normalizeChatLanguage(value: unknown): "en" | "pt" | "es" {
  const lang = String(value || "")
    .trim()
    .toLowerCase();
  if (lang === "pt" || lang === "es") return lang;
  return "en";
}

function languageScoreFor(
  language: "en" | "pt" | "es",
  scores: { en: number; pt: number; es: number },
): number {
  if (language === "pt") return scores.pt;
  if (language === "es") return scores.es;
  return scores.en;
}

function strongestCompetingLanguageScore(
  language: "en" | "pt" | "es",
  scores: { en: number; pt: number; es: number },
): number {
  if (language === "en") return Math.max(scores.pt, scores.es);
  if (language === "pt") return Math.max(scores.en, scores.es);
  return Math.max(scores.en, scores.pt);
}

function languageDistinctSignals(text: string): {
  en: number;
  pt: number;
  es: number;
} {
  const value = ` ${String(text || "").toLowerCase()} `;
  return {
    en: countRegexMatches(value, EN_DISTINCT_LANGUAGE_MARKERS),
    pt: countRegexMatches(value, PT_DISTINCT_LANGUAGE_MARKERS),
    es: countRegexMatches(value, ES_DISTINCT_LANGUAGE_MARKERS),
  };
}

function languageScores(text: string): { en: number; pt: number; es: number } {
  const value = ` ${String(text || "").toLowerCase()} `;
  const enMarkers = countRegexMatches(value, EN_LANGUAGE_MARKERS);
  const ptMarkers = countRegexMatches(value, PT_LANGUAGE_MARKERS);
  const esMarkers = countRegexMatches(value, ES_LANGUAGE_MARKERS);
  const enStructure = countRegexMatches(value, ENGLISH_STRUCTURAL_WORDS) * 0.25;
  const ptStructure =
    countRegexMatches(value, PORTUGUESE_STRUCTURAL_WORDS) * 0.25;
  const esStructure = countRegexMatches(value, SPANISH_STRUCTURAL_WORDS) * 0.25;
  const ptAccents = countRegexMatches(value, /[ãõçâêô]/g) * 0.9;
  const esSignals =
    countRegexMatches(value, /[ñ¿¡]/g) * 1.2 +
    countRegexMatches(value, /(?:\bción\b|\bciones\b)/g) * 0.7;
  const latinAccentSignal = countRegexMatches(value, /[áéíóú]/g) * 0.25;

  return {
    en: enMarkers + enStructure,
    pt: ptMarkers + ptStructure + ptAccents + latinAccentSignal * 0.5,
    es: esMarkers + esStructure + esSignals + latinAccentSignal * 0.5,
  };
}

function isShortNeutralText(text: string): boolean {
  const normalized = String(text || "").trim();
  if (!normalized) return true;
  const words = normalized.split(/\s+/).filter(Boolean);
  const alphaChars = (normalized.match(/[A-Za-zÀ-ÿ]/g) || []).length;
  const hasSentenceEnding = /[.!?]$/.test(normalized);
  return words.length <= 4 && alphaChars <= 24 && hasSentenceEnding;
}

function hasSubstantialAlphabeticContent(text: string): boolean {
  const alphaChars = (String(text || "").match(/[A-Za-zÀ-ÿ]/g) || []).length;
  return alphaChars >= 8;
}

function hasStrongMixedLanguageSignal(params: {
  text: string;
  preferredLanguage: "en" | "pt" | "es";
  scores: { en: number; pt: number; es: number };
}): boolean {
  const normalized = String(params.text || "").trim();
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  const longEnough = wordCount >= 12 || normalized.length >= 72;
  if (!longEnough) return false;

  const primaryScore = languageScoreFor(
    params.preferredLanguage,
    params.scores,
  );
  const competingScore = strongestCompetingLanguageScore(
    params.preferredLanguage,
    params.scores,
  );
  if (competingScore < 1.6) return false;

  const strongCombinedSignal = primaryScore + competingScore >= 3.4;
  const nearParity =
    primaryScore <= 0.1
      ? competingScore >= 1.8
      : competingScore >= primaryScore * 0.82;

  const distinct = languageDistinctSignals(normalized);
  const primaryDistinct = languageScoreFor(params.preferredLanguage, distinct);
  const competingDistinct = strongestCompetingLanguageScore(
    params.preferredLanguage,
    distinct,
  );
  const distinctConflict =
    competingDistinct >= 2 && competingDistinct >= primaryDistinct + 1;

  return strongCombinedSignal && nearParity && distinctConflict;
}

function hasSentenceLanguageSwitch(params: {
  text: string;
  preferredLanguage: "en" | "pt" | "es";
}): boolean {
  const fragments = String(params.text || "")
    .split(/[.!?]+\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => part.split(/\s+/).length >= 4);
  if (fragments.length < 2) return false;

  let hasPreferredSentence = false;
  let hasCompetingSentence = false;
  for (const fragment of fragments) {
    const scores = languageScores(fragment);
    const entries = [
      { language: "en", score: scores.en },
      { language: "pt", score: scores.pt },
      { language: "es", score: scores.es },
    ].sort((a, b) => b.score - a.score);
    if (entries[0].score < 1.2 || entries[0].score < entries[1].score + 0.5) {
      continue;
    }
    if (entries[0].language === params.preferredLanguage) {
      hasPreferredSentence = true;
    } else {
      hasCompetingSentence = true;
    }
  }

  return hasPreferredSentence && hasCompetingSentence;
}

function buildLanguageContractFallback(language: "en" | "pt" | "es"): string {
  if (language === "pt") {
    return "Nao consegui finalizar a resposta no idioma solicitado com seguranca. Reenvie e eu respondo somente em portugues.";
  }
  if (language === "es") {
    return "No pude finalizar la respuesta en el idioma solicitado de forma segura. Reenvia y respondere solo en espanol.";
  }
  return "I could not safely finalize this answer in the requested language. Please retry and I will answer only in English.";
}

function stripRepeatedDocLeadIn(
  text: string,
  language: "en" | "pt" | "es",
): string {
  const raw = String(text || "").trim();
  if (!raw) return raw;
  const patterns =
    language === "pt"
      ? [
          /^com base nos documentos (enviados|fornecidos),?\s*(segue a resposta:)?\s*/i,
          /^aqui est[aá] o que encontrei nos documentos:?\s*/i,
          /^resumo objetivo do que os documentos mostram:?\s*/i,
        ]
      : language === "es"
        ? [
            /^con base en los documentos (enviados|proporcionados),?\s*/i,
            /^aqui est[aá] lo que encontr[eé] en los documentos:?\s*/i,
          ]
        : [
            /^based on the documents (provided|shared),?\s*(here(?:'| i)s (?:the )?answer:)?\s*/i,
            /^here(?:'| i)s what i found in the documents:?\s*/i,
          ];
  let out = raw;
  for (const pattern of patterns) {
    out = out.replace(pattern, "");
  }
  return out.trim() || raw;
}

function softRepairLanguageContract(
  text: string,
  language: "en" | "pt" | "es",
): string {
  let out = stripRepeatedDocLeadIn(text, language);
  if (!out) return String(text || "").trim();

  if (language === "pt") {
    out = out
      .replace(/\bhere(?:'| i)s what i found in the documents:?\s*/gi, "")
      .replace(
        /\bbased on the documents (provided|shared),?\s*(here(?:'| i)s (?:the )?answer:?)?/gi,
        "",
      )
      .replace(/\bsummary of what the documents show:?\s*/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  } else if (language === "es") {
    out = out
      .replace(/\bhere(?:'| i)s what i found in the documents:?\s*/gi, "")
      .replace(/\bbased on the documents (provided|shared),?\s*/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  return out || String(text || "").trim();
}

function hasLanguageMismatch(
  normalized: string,
  language: "en" | "pt" | "es",
): boolean {
  if (isShortNeutralText(normalized)) return false;
  if (!hasSubstantialAlphabeticContent(normalized)) return false;
  const scores = languageScores(normalized);
  const signalStrength = scores.en + scores.pt + scores.es;
  if (signalStrength < 1.1) return false;
  const languageScore = languageScoreFor(language, scores);
  const competing = strongestCompetingLanguageScore(language, scores);
  return (
    competing >= languageScore + 1.2 ||
    hasStrongMixedLanguageSignal({
      text: normalized,
      preferredLanguage: language,
      scores,
    }) ||
    hasSentenceLanguageSwitch({
      text: normalized,
      preferredLanguage: language,
    })
  );
}

export function enforceLanguageContract(params: {
  text: string;
  preferredLanguage?: string | null;
}): { text: string; adjusted: boolean; failClosed: boolean } {
  if (!resolveChatLanguageConfig().languageContractV2) {
    return {
      text: String(params.text || "").trim(),
      adjusted: false,
      failClosed: false,
    };
  }

  const normalized = String(params.text || "").trim();
  if (!normalized) {
    return { text: normalized, adjusted: false, failClosed: false };
  }

  const language = normalizeChatLanguage(params.preferredLanguage);
  if (!hasLanguageMismatch(normalized, language)) {
    return { text: normalized, adjusted: false, failClosed: false };
  }

  const repaired = softRepairLanguageContract(normalized, language);
  if (repaired && !hasLanguageMismatch(repaired, language)) {
    return { text: repaired, adjusted: true, failClosed: false };
  }

  return {
    text: buildLanguageContractFallback(language),
    adjusted: true,
    failClosed: true,
  };
}
import { resolveChatLanguageConfig } from "../config/chatRuntimeConfig";
