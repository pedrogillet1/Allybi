/**
 * ROUTING OVERLAYS SERVICE — Bank-driven routing helpers
 *
 * Purpose:
 * - Keep router.service.ts clean (no hardcoded regex)
 * - Centralize "special-case" intent/scope rules as BANK-DRIVEN overlays
 * - Provide small, stable helpers for routing decisions (with confidence)
 *
 * What this file exports (used by Router):
 * - routingOverlays (namespace)
 * - isFileLocationQuery
 * - hasMultiDocSignals
 * - hasDocReference
 * - isFormatOnlyQuery
 * - isAboutQuery
 * - isDocDiscoveryQuery
 * - isContentDiscoveryQuery
 * - classifyAgainIntent
 *
 * Extra helpers:
 * - hasWorkspaceScopeSignals
 * - isFileTypeListingQuery
 * - resolveComputeVsExtract
 * - isHelpOverrideQuery
 * - isConversationOverrideQuery
 *
 * BANK FORMAT (simple + flexible):
 * Each bank JSON can be either:
 *  A) { "patterns": { "en": [...], "pt": [...], "es": [...] }, "negatives": { ... } }
 *  B) { "families": { "<key>": { "patterns": [...], "negatives": [...] } } }
 */

import fs from 'fs';
import path from 'path';

export type Lang = 'en' | 'pt' | 'es';

export interface OverlayMatch {
  matched: boolean;
  confidence: number; // 0..1
  matchedPattern?: string;
  matchedBank?: string;
  ruleId?: string;
  operator?: string;
}

export type AgainIntentType = 'action' | 'content' | 'unknown';

// Bank location
const OVERLAY_DIR = path.join(__dirname, '../../data/routing_overlays');

const BANK_PATHS = {
  fileLocation: path.join(OVERLAY_DIR, 'file_location.json'),
  multiDocSignals: path.join(OVERLAY_DIR, 'multi_doc_signals.json'),
  docReference: path.join(OVERLAY_DIR, 'doc_reference.json'),
  formatOnly: path.join(OVERLAY_DIR, 'format_only.json'),
  aboutQuery: path.join(OVERLAY_DIR, 'about_query.json'),
  docDiscovery: path.join(OVERLAY_DIR, 'doc_discovery.json'),
  contentDiscovery: path.join(OVERLAY_DIR, 'content_discovery.json'),
  againIntent: path.join(OVERLAY_DIR, 'again_intent.json'),
  workspaceScopeSignals: path.join(OVERLAY_DIR, 'workspace_scope_signals.json'),
  fileTypeListing: path.join(OVERLAY_DIR, 'file_type_listing.json'),
  computeSignals: path.join(OVERLAY_DIR, 'compute_signals.json'),
  extractValueSignals: path.join(OVERLAY_DIR, 'extract_value_signals.json'),
  helpOverride: path.join(OVERLAY_DIR, 'help_override.json'),
  conversationOverride: path.join(OVERLAY_DIR, 'conversation_override.json'),
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Internal cache
// ─────────────────────────────────────────────────────────────────────────────

type BankCompiled = {
  id: string;
  patterns: Record<Lang, RegExp[]>;
  negatives: Record<Lang, RegExp[]>;
};

const compiledCache: Record<string, BankCompiled | null> = Object.create(null);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function foldDiacritics(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * If string looks like a regex (has metacharacters), compile as-is.
 * Otherwise compile as a case-insensitive literal substring regex.
 */
function patternToRegex(pattern: string): RegExp {
  const trimmed = String(pattern || '').trim();
  if (!trimmed) return /$a/; // never match

  try {
    // Heuristic: if it contains regex metacharacters, treat as regex
    const looksLikeRegex = /[.*+?^${}()|[\]\\]/.test(trimmed);
    return looksLikeRegex ? new RegExp(trimmed, 'i') : new RegExp(escapeRegex(trimmed), 'i');
  } catch (e) {
    console.warn(`[RoutingOverlays] Invalid pattern: ${trimmed}`, e);
    return /$a/; // never match on error
  }
}

function readJsonIfExists(filePath: string): any | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Bank schema supported:
 * A) { patterns: {en:[], pt:[], es:[]}, negatives: {...} }
 * B) { families: { key: { patterns: [], negatives: [] } } }
 */
function compileBank(id: string, filePath: string): BankCompiled | null {
  const json = readJsonIfExists(filePath);
  if (!json) return null;

  const patternsByLang: Record<Lang, string[]> = { en: [], pt: [], es: [] };
  const negativesByLang: Record<Lang, string[]> = { en: [], pt: [], es: [] };

  if (json.patterns) {
    // Schema A
    patternsByLang.en = Array.isArray(json.patterns.en) ? json.patterns.en : [];
    patternsByLang.pt = Array.isArray(json.patterns.pt) ? json.patterns.pt : [];
    patternsByLang.es = Array.isArray(json.patterns.es) ? json.patterns.es : [];

    negativesByLang.en = Array.isArray(json.negatives?.en) ? json.negatives.en : [];
    negativesByLang.pt = Array.isArray(json.negatives?.pt) ? json.negatives.pt : [];
    negativesByLang.es = Array.isArray(json.negatives?.es) ? json.negatives.es : [];
  } else if (json.families) {
    // Schema B
    for (const fam of Object.values<any>(json.families)) {
      const pats = Array.isArray(fam?.patterns) ? fam.patterns : [];
      const negs = Array.isArray(fam?.negatives) ? fam.negatives : [];

      // In family schema, we treat them as language-agnostic → apply to all langs
      patternsByLang.en.push(...pats);
      patternsByLang.pt.push(...pats);
      patternsByLang.es.push(...pats);

      negativesByLang.en.push(...negs);
      negativesByLang.pt.push(...negs);
      negativesByLang.es.push(...negs);
    }
  } else {
    return null;
  }

  return {
    id,
    patterns: {
      en: patternsByLang.en.map(patternToRegex).filter(Boolean),
      pt: patternsByLang.pt.map(patternToRegex).filter(Boolean),
      es: patternsByLang.es.map(patternToRegex).filter(Boolean),
    },
    negatives: {
      en: negativesByLang.en.map(patternToRegex).filter(Boolean),
      pt: negativesByLang.pt.map(patternToRegex).filter(Boolean),
      es: negativesByLang.es.map(patternToRegex).filter(Boolean),
    },
  };
}

function getBank(id: keyof typeof BANK_PATHS): BankCompiled {
  const key = String(id);
  if (compiledCache[key]) return compiledCache[key] as BankCompiled;

  const compiled = compileBank(key, BANK_PATHS[id]);
  if (!compiled) {
    // Safe empty fallback
    const empty: BankCompiled = {
      id: key,
      patterns: { en: [], pt: [], es: [] },
      negatives: { en: [], pt: [], es: [] },
    };
    compiledCache[key] = empty;
    return empty;
  }

  compiledCache[key] = compiled;
  return compiled;
}

function matchBank(query: string, lang: Lang, bank: BankCompiled): OverlayMatch {
  const q = (query || '').trim();
  if (!q) return { matched: false, confidence: 0, matchedBank: bank.id };

  const norm = q.toLowerCase();
  const folded = foldDiacritics(q);

  // Negatives win
  const negs = bank.negatives[lang] || [];
  for (const re of negs) {
    if (re.test(norm) || re.test(folded)) {
      return { matched: false, confidence: 0, matchedPattern: re.source, matchedBank: bank.id };
    }
  }

  // Patterns
  const pats = bank.patterns[lang] || [];
  for (const re of pats) {
    if (re.test(norm) || re.test(folded)) {
      return { matched: true, confidence: 0.85, matchedPattern: re.source, matchedBank: bank.id };
    }
  }

  return { matched: false, confidence: 0, matchedBank: bank.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public overlays used by Router
// ─────────────────────────────────────────────────────────────────────────────

export function isFileLocationQuery(query: string, lang: string = 'en'): OverlayMatch {
  return matchBank(query, lang as Lang, getBank('fileLocation'));
}

export function hasMultiDocSignals(query: string, lang: string = 'en'): OverlayMatch {
  return matchBank(query, lang as Lang, getBank('multiDocSignals'));
}

export function hasDocReference(query: string, lang: string = 'en'): OverlayMatch {
  return matchBank(query, lang as Lang, getBank('docReference'));
}

export function isFormatOnlyQuery(query: string, lang: string = 'en'): OverlayMatch {
  return matchBank(query, lang as Lang, getBank('formatOnly'));
}

export function isAboutQuery(query: string, lang: string = 'en'): OverlayMatch {
  return matchBank(query, lang as Lang, getBank('aboutQuery'));
}

export function isDocDiscoveryQuery(query: string, lang: string = 'en'): OverlayMatch {
  return matchBank(query, lang as Lang, getBank('docDiscovery'));
}

export function isContentDiscoveryQuery(query: string, lang: string = 'en'): OverlayMatch {
  return matchBank(query, lang as Lang, getBank('contentDiscovery'));
}

// ─────────────────────────────────────────────────────────────────────────────
// Again Intent - Compiled Cache (FIX: no disk IO per request)
// ─────────────────────────────────────────────────────────────────────────────

interface CompiledAgainBank {
  detection: RegExp[];
  action: RegExp[];
  content: RegExp[];
}

let compiledAgainBank: CompiledAgainBank | null = null;

function getCompiledAgainBank(): CompiledAgainBank {
  if (compiledAgainBank) return compiledAgainBank;

  // Load once and compile
  const bankJson = readJsonIfExists(BANK_PATHS.againIntent);

  const compilePatterns = (patterns: string[] | undefined): RegExp[] => {
    if (!patterns) return [];
    const result: RegExp[] = [];
    for (const pat of patterns) {
      try {
        result.push(new RegExp(pat, 'i'));
      } catch {}
    }
    return result;
  };

  compiledAgainBank = {
    detection: compilePatterns(bankJson?.families?.detection?.patterns),
    action: compilePatterns(bankJson?.families?.action?.patterns),
    content: compilePatterns(bankJson?.families?.content?.patterns),
  };

  // If bank not loaded, use fallback patterns
  if (compiledAgainBank.detection.length === 0) {
    compiledAgainBank.detection = [
      /\bagain\b/i,
      /\b(de\s+novo|novamente)\b/i,
      /\b(de\s+nuevo|otra\s+vez)\b/i,
    ];
  }

  return compiledAgainBank;
}

/**
 * Distinguish "again" meaning:
 * - action: "open it again", "show that again"
 * - content: "explain again", "what are the rules again"
 *
 * FIX: Uses compiled cache - no disk IO per request
 */
export function classifyAgainIntent(query: string, _lang: string = 'en'): AgainIntentType {
  const q = query.trim().toLowerCase();
  const folded = foldDiacritics(query);
  if (!q) return 'unknown';

  // FIX: Use compiled cache instead of reading JSON every time
  const bank = getCompiledAgainBank();

  // Check if query contains "again" in any language
  let hasAgain = false;
  for (const re of bank.detection) {
    if (re.test(q) || re.test(folded)) {
      hasAgain = true;
      break;
    }
  }

  if (!hasAgain) return 'unknown';

  // Check action patterns
  let actionMatch = false;
  for (const re of bank.action) {
    if (re.test(q) || re.test(folded)) {
      actionMatch = true;
      break;
    }
  }

  // Check content patterns
  let contentMatch = false;
  for (const re of bank.content) {
    if (re.test(q) || re.test(folded)) {
      contentMatch = true;
      break;
    }
  }

  // Decide based on matches
  if (contentMatch && !actionMatch) return 'content';
  if (actionMatch && !contentMatch) return 'action';

  // If both match or neither match, default to content (safer)
  return 'content';
}

// ─────────────────────────────────────────────────────────────────────────────
// Extra overlays (for Router cleanup)
// ─────────────────────────────────────────────────────────────────────────────

export function hasWorkspaceScopeSignals(query: string, lang: string = 'en'): OverlayMatch {
  return matchBank(query, lang as Lang, getBank('workspaceScopeSignals'));
}

export function isFileTypeListingQuery(query: string, lang: string = 'en'): OverlayMatch {
  return matchBank(query, lang as Lang, getBank('fileTypeListing'));
}

/**
 * Resolve compute vs extract without Router hardcoding.
 * - "calculate / average / percent change" => compute
 * - "what is revenue / show EBITDA" => extract
 */
export function resolveComputeVsExtract(query: string, lang: string = 'en'): {
  shouldDowngradeComputeToExtract: boolean;
  reason?: string;
} {
  const compute = matchBank(query, lang as Lang, getBank('computeSignals'));
  const extract = matchBank(query, lang as Lang, getBank('extractValueSignals'));

  // If BOTH match, prefer compute (explicit math) unless extract is much stronger.
  if (compute.matched && extract.matched) {
    return { shouldDowngradeComputeToExtract: false };
  }

  // If compute does NOT match but extract DOES, downgrade.
  if (!compute.matched && extract.matched) {
    return { shouldDowngradeComputeToExtract: true, reason: 'extract_value_signal' };
  }

  // If neither matches, but we're in compute and query is simple, downgrade
  if (!compute.matched && !extract.matched) {
    // Simple heuristic: short queries without explicit math verbs
    const hasExplicitMath = /\b(calculate|compute|sum|average|percent|yoy|qoq|growth\s+rate)\b/i.test(query);
    if (!hasExplicitMath) {
      return { shouldDowngradeComputeToExtract: true, reason: 'no_explicit_math_verbs' };
    }
  }

  return { shouldDowngradeComputeToExtract: false };
}

export function isHelpOverrideQuery(query: string, lang: string = 'en'): OverlayMatch {
  const result = matchBank(query, lang as Lang, getBank('helpOverride'));
  if (result.matched) {
    return {
      ...result,
      ruleId: 'overlay:help_override',
      // FIX: Router expects 'capabilities' not 'help'
      operator: 'capabilities',
    };
  }
  return result;
}

export function isConversationOverrideQuery(query: string, lang: string = 'en'): OverlayMatch {
  const result = matchBank(query, lang as Lang, getBank('conversationOverride'));
  if (result.matched) {
    return {
      ...result,
      ruleId: 'overlay:conversation_override',
      // FIX: Router expects 'unknown' for conversation, not 'converse'
      operator: 'unknown',
    };
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Combined check (for debugging)
// ─────────────────────────────────────────────────────────────────────────────

export interface AllOverlaysResult {
  fileLocation: OverlayMatch;
  multiDocSignals: OverlayMatch;
  docReference: OverlayMatch;
  formatRequest: OverlayMatch;
  aboutQuery: OverlayMatch;
  docDiscovery: OverlayMatch;
  contentDiscovery: OverlayMatch;
  againIntent: AgainIntentType;
  workspaceScopeSignals: OverlayMatch;
  fileTypeListing: OverlayMatch;
  helpOverride: OverlayMatch;
  conversationOverride: OverlayMatch;
}

export function checkAllOverlays(query: string, lang: string = 'en'): AllOverlaysResult {
  return {
    fileLocation: isFileLocationQuery(query, lang),
    multiDocSignals: hasMultiDocSignals(query, lang),
    docReference: hasDocReference(query, lang),
    formatRequest: isFormatOnlyQuery(query, lang),
    aboutQuery: isAboutQuery(query, lang),
    docDiscovery: isDocDiscoveryQuery(query, lang),
    contentDiscovery: isContentDiscoveryQuery(query, lang),
    againIntent: classifyAgainIntent(query, lang),
    workspaceScopeSignals: hasWorkspaceScopeSignals(query, lang),
    fileTypeListing: isFileTypeListingQuery(query, lang),
    helpOverride: isHelpOverrideQuery(query, lang),
    conversationOverride: isConversationOverrideQuery(query, lang),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache reset (for testing)
// ─────────────────────────────────────────────────────────────────────────────

export function resetRoutingOverlayCache() {
  for (const k of Object.keys(compiledCache)) {
    delete compiledCache[k];
  }
  // FIX: Also reset the compiled againBank cache
  compiledAgainBank = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Namespace export
// ─────────────────────────────────────────────────────────────────────────────

export const routingOverlays = {
  isFileLocationQuery,
  hasMultiDocSignals,
  hasDocReference,
  isFormatOnlyQuery,
  isAboutQuery,
  isDocDiscoveryQuery,
  isContentDiscoveryQuery,
  classifyAgainIntent,
  hasWorkspaceScopeSignals,
  isFileTypeListingQuery,
  resolveComputeVsExtract,
  isHelpOverrideQuery,
  isConversationOverrideQuery,
  checkAllOverlays,
  resetRoutingOverlayCache,
};

export default routingOverlays;
