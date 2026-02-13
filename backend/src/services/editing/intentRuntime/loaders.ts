/**
 * Bank loaders for the intentRuntime pipeline.
 *
 * Extends the existing `loadBanks.ts` pattern with additional banks for
 * intent patterns, lexicons, and parser dictionaries.
 */

import * as fs from "fs";
import * as path from "path";
import { getOptionalBank } from "../../core/banks/bankLoader.service";
import { resolveDataDir } from "../../../utils/resolveDataDir";
import type {
  IntentPattern,
  PatternBankFile,
  LexiconBankFile,
  ParserDictionaryFile,
  OperatorCatalog,
} from "./types";

// ---------------------------------------------------------------------------
// Safe bank loader (mirrors allybi/loadBanks.ts safeBank)
// ---------------------------------------------------------------------------

function safeBank<T = any>(id: string): T | null {
  try {
    const loaded = getOptionalBank<T>(id);
    if (loaded) return loaded;
  } catch {
    // fall through to file-based fallback
  }

  try {
    const dataDir = resolveDataDir();
    const categories = [
      "intent_patterns",
      "lexicons",
      "parsers",
      "semantics",
      "routing",
      "operators",
      "triggers",
      "scope",
      "microcopy",
      "overlays",
      "policies",
      "quality",
      "dictionaries",
      "templates",
      "probes",
    ];
    for (const category of categories) {
      const p = path.join(dataDir, category, `${id}.any.json`);
      if (!fs.existsSync(p)) continue;
      return JSON.parse(fs.readFileSync(p, "utf8")) as T;
    }
  } catch {
    return null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Caches
// ---------------------------------------------------------------------------

type CacheKey = `${string}:${string}`; // "domain:lang"

const patternCache = new Map<CacheKey, IntentPattern[]>();
const lexiconCache = new Map<string, LexiconBankFile | null>();
const parserCache = new Map<string, ParserDictionaryFile | null>();
let operatorCatalogCache: OperatorCatalog | null = null;

export function clearCaches(): void {
  patternCache.clear();
  lexiconCache.clear();
  parserCache.clear();
  operatorCatalogCache = null;
}

// ---------------------------------------------------------------------------
// Pattern loaders
// ---------------------------------------------------------------------------

const PATTERN_BANK_IDS: Record<string, string> = {
  "excel:en": "intent_patterns_excel_en",
  "excel:pt": "intent_patterns_excel_pt",
  "docx:en": "intent_patterns_docx_en",
  "docx:pt": "intent_patterns_docx_pt",
};

export function loadPatterns(
  domain: "excel" | "docx",
  lang: "en" | "pt",
): IntentPattern[] {
  const key: CacheKey = `${domain}:${lang}`;
  if (patternCache.has(key)) return patternCache.get(key)!;

  const bankId = PATTERN_BANK_IDS[key];
  if (!bankId) {
    patternCache.set(key, []);
    return [];
  }

  const bank = safeBank<PatternBankFile>(bankId);
  const patterns = bank?.patterns ?? [];
  patternCache.set(key, patterns);
  return patterns;
}

// ---------------------------------------------------------------------------
// Lexicon loaders
// ---------------------------------------------------------------------------

const LEXICON_IDS: Record<string, string> = {
  "common:en": "common_en",
  "common:pt": "common_pt",
  "excel:en": "excel_en",
  "excel:pt": "excel_pt",
  "docx:en": "docx_en",
  "docx:pt": "docx_pt",
};

export function loadLexicon(
  name: string,
  lang: "en" | "pt",
): LexiconBankFile | null {
  const key = `${name}:${lang}`;
  if (lexiconCache.has(key)) return lexiconCache.get(key)!;

  const bankId = LEXICON_IDS[key];
  if (!bankId) {
    lexiconCache.set(key, null);
    return null;
  }

  const bank = safeBank<LexiconBankFile>(bankId);
  lexiconCache.set(key, bank);
  return bank;
}

export function getConnectors(lang: "en" | "pt"): string[] {
  const lex = loadLexicon("common", lang);
  return lex?.entries?.multi_intent_connectors ?? [];
}

// ---------------------------------------------------------------------------
// Parser dictionary loaders
// ---------------------------------------------------------------------------

const PARSER_IDS: Record<string, string> = {
  colors_en: "colors_en",
  colors_pt: "colors_pt",
  fonts: "fonts",
  excel_number_formats: "excel_number_formats",
  excel_chart_types_en: "excel_chart_types_en",
  excel_chart_types_pt: "excel_chart_types_pt",
  excel_functions_pt_to_en: "excel_functions_pt_to_en",
  docx_heading_levels_en: "docx_heading_levels_en",
  docx_heading_levels_pt: "docx_heading_levels_pt",
};

export function loadParser(id: string): ParserDictionaryFile | null {
  if (parserCache.has(id)) return parserCache.get(id)!;

  const bankId = PARSER_IDS[id] ?? id;
  const bank = safeBank<ParserDictionaryFile>(bankId);
  parserCache.set(id, bank);
  return bank;
}

export function lookupParserEntry(
  parserId: string,
  input: string,
): string | null {
  const parser = loadParser(parserId);
  if (!parser?.entries) return null;

  const lower = input.toLowerCase().trim();
  // Exact match first
  if (parser.entries[lower] !== undefined) return parser.entries[lower];
  // Case-insensitive key scan
  for (const [key, value] of Object.entries(parser.entries)) {
    if (key.toLowerCase() === lower) return value;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Operator catalog loader
// ---------------------------------------------------------------------------

export function loadOperatorCatalog(): OperatorCatalog {
  if (operatorCatalogCache) return operatorCatalogCache;

  const bank = safeBank<{ operators: OperatorCatalog }>("operator_catalog");
  operatorCatalogCache = bank?.operators ?? {};
  return operatorCatalogCache;
}
