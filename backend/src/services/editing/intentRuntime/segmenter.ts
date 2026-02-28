/**
 * Multi-intent segmenter.
 *
 * Splits a single user message into multiple directive segments,
 * respecting quoted strings and recognizing language-specific connectors.
 */

import type { Segment } from "./types";
import { getConnectors } from "./loaders";

// ---------------------------------------------------------------------------
// Default connector patterns (used when lexicon bank is unavailable)
// ---------------------------------------------------------------------------

const DEFAULT_CONNECTORS_EN = [
  "and then",
  "and also",
  "after that",
  "then",
  "also",
  "plus",
  "as well",
  "additionally",
  "furthermore",
  "next",
];

const DEFAULT_CONNECTORS_PT = [
  "em seguida",
  "além disso",
  "e também",
  "e depois",
  "depois",
  "também",
  "a seguir",
  "adicionalmente",
  "então",
];

const WEAK_CONNECTOR_BY_LANG: Record<"en" | "pt", string> = {
  en: "and",
  pt: "e",
};

const ACTION_START_RE: Record<"en" | "pt", RegExp> = {
  en: /^(?:set|change|replace|update|fill|apply|insert|delete|remove|sort|filter|merge|split|convert|rewrite|translate|summarize|add|create|rename|move|open|navigate|compare|calculate|extract|validate|monitor|advise|locate|evaluate|highlight|freeze|wrap|autofit|chart|plot|table)\b/i,
  pt: /^(?:defina|altere|substitua|atualize|preencha|aplique|insira|exclua|remova|ordene|filtre|mescle|divida|converta|reescreva|traduza|resuma|adicione|crie|renomeie|mova|abra|navegue|compare|calcule|extraia|valide|monitore|oriente|localize|avalie|destaque|congele|quebre|ajuste|configure)\b/i,
};

const ACTION_ANY_RE: Record<"en" | "pt", RegExp> = {
  en: /\b(?:set|change|replace|update|fill|apply|insert|delete|remove|sort|filter|merge|split|convert|rewrite|translate|summarize|add|create|rename|move|open|navigate|compare|calculate|extract|validate|monitor|advise|locate|evaluate|highlight|freeze|wrap|autofit|chart|plot|table)\b/i,
  pt: /\b(?:defina|altere|substitua|atualize|preencha|aplique|insira|exclua|remova|ordene|filtre|mescle|divida|converta|reescreva|traduza|resuma|adicione|crie|renomeie|mova|abra|navegue|compare|calcule|extraia|valide|monitore|oriente|localize|avalie|destaque|congele|quebre|ajuste|configure)\b/i,
};

const STYLE_WORDS_BY_LANG: Record<"en" | "pt", Set<string>> = {
  en: new Set(["bold", "italic", "underline", "red", "blue", "green"]),
  pt: new Set([
    "negrito",
    "italico",
    "itálico",
    "sublinhado",
    "vermelho",
    "azul",
  ]),
};

function normalizeConnector(value: string): string {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function isWordChar(ch: string): boolean {
  return /[A-Za-z0-9À-ÖØ-öø-ÿ_]/.test(ch);
}

function startsWithActionVerb(text: string, language: "en" | "pt"): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;

  const firstWord = normalized.split(/\s+/)[0];
  if (STYLE_WORDS_BY_LANG[language].has(firstWord)) return false;
  if (!ACTION_START_RE[language].test(normalized)) return false;
  return normalized.split(/\s+/).length >= 2;
}

function hasActionVerb(text: string, language: "en" | "pt"): boolean {
  return ACTION_ANY_RE[language].test(text.toLowerCase());
}

function shouldSplitOnWeakConnector(
  left: string,
  right: string,
  language: "en" | "pt",
): boolean {
  const leftTrim = left.trim();
  const rightTrim = right.trim();
  if (!leftTrim || !rightTrim) return false;
  if (!hasActionVerb(leftTrim, language)) return false;
  if (!startsWithActionVerb(rightTrim, language)) return false;
  return true;
}

function splitOnWeakConnector(text: string, language: "en" | "pt"): string[] {
  const weak = WEAK_CONNECTOR_BY_LANG[language];
  const out: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (ch === '"' || ch === "'") {
      if (!quote) quote = ch as '"' | "'";
      else if (quote === ch) quote = null;
      current += ch;
      continue;
    }

    if (!quote) {
      const next = text.slice(i, i + weak.length).toLowerCase();
      const prevCh = i > 0 ? text[i - 1] : "";
      const nextCh = i + weak.length < text.length ? text[i + weak.length] : "";
      const bounded =
        next === weak &&
        (i === 0 || !isWordChar(prevCh)) &&
        (i + weak.length >= text.length || !isWordChar(nextCh));

      if (bounded) {
        const left = current.trim();
        const right = text.slice(i + weak.length).trim();
        if (shouldSplitOnWeakConnector(left, right, language)) {
          if (left) out.push(left);
          current = "";
          i += weak.length - 1;
          continue;
        }
      }
    }

    current += ch;
  }

  if (current.trim()) out.push(current.trim());
  return out.length > 0 ? out : [text.trim()];
}

function isStrictIntentRuntimeEnv(): boolean {
  const env = String(process.env.NODE_ENV || "").toLowerCase();
  return env === "production" || env === "staging";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function segmentMessage(
  message: string,
  language: "en" | "pt",
): Segment[] {
  const text = String(message || "").trim();
  if (!text) return [];

  // Try loading connectors from lexicon banks, fall back to defaults
  let connectors = getConnectors(language);
  if (!connectors.length) {
    if (isStrictIntentRuntimeEnv()) {
      throw new Error(
        `intentRuntime connectors missing for language '${language}' (multi_intent_connectors)`,
      );
    }
    connectors =
      language === "pt" ? DEFAULT_CONNECTORS_PT : DEFAULT_CONNECTORS_EN;
  }

  const weakConnector = WEAK_CONNECTOR_BY_LANG[language];
  const normalizedConnectors = Array.from(
    new Set(connectors.map((c) => normalizeConnector(c)).filter(Boolean)),
  );
  const strongConnectors = normalizedConnectors.filter(
    (connector) => connector !== weakConnector,
  );

  // Sort connectors by length descending so longer phrases match first
  const sorted = [...strongConnectors].sort((a, b) => b.length - a.length);

  // Build a combined regex from connectors
  const escaped = sorted.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  // Match: comma-space, semicolon-space, or a connector bounded by word boundaries
  const separatorParts = ["[;]\\s*", ",\\s+"];
  if (escaped.length > 0) {
    separatorParts.push(`\\b(?:${escaped.join("|")})\\b`);
  }
  const separatorRegex = new RegExp(`(?:${separatorParts.join("|")})`, "i");

  // Split while respecting quoted strings
  const segments: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    // Track quotes
    if (ch === '"' || ch === "'") {
      if (!quote) {
        quote = ch as '"' | "'";
      } else if (quote === ch) {
        quote = null;
      }
      current += ch;
      continue;
    }

    // Only try separator matching outside quotes
    if (!quote) {
      const rest = text.slice(i);
      const m = rest.match(separatorRegex);
      if (m && m.index === 0) {
        if (current.trim()) segments.push(current.trim());
        current = "";
        i += m[0].length - 1;
        continue;
      }

      // Also split on numbered list items: "1. ... 2. ..."
      const numberedMatch = rest.match(/^(?:\n|\r\n?)\s*\d+[.)]\s+/);
      if (numberedMatch) {
        if (current.trim()) segments.push(current.trim());
        current = "";
        i += numberedMatch[0].length - 1;
        continue;
      }

      // Also split on bullet items
      const bulletMatch = rest.match(/^(?:\n|\r\n?)\s*[-•*]\s+/);
      if (bulletMatch) {
        if (current.trim()) segments.push(current.trim());
        current = "";
        i += bulletMatch[0].length - 1;
        continue;
      }
    }

    current += ch;
  }
  if (current.trim()) segments.push(current.trim());

  // If nothing was split, return original message as single segment
  if (segments.length === 0) segments.push(text);

  const weakSplitSegments = segments.flatMap((segment) =>
    splitOnWeakConnector(segment, language),
  );

  return weakSplitSegments
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s, idx) => ({ text: s, index: idx }));
}
