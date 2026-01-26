/**
 * DataRegistry - Unified Bank & Policy Loader
 *
 * Single source of truth for loading all JSON banks and policies.
 * All services should import from here instead of loading files directly.
 *
 * Benefits:
 * - One-time load on server boot (no per-request file reads)
 * - Consistent paths and error handling
 * - Type-safe accessors
 * - Easy to mock for testing
 */

import * as fs from 'fs';
import * as path from 'path';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface IntentPattern {
  patterns: { en: string[]; pt: string[] };
  priority?: number;
  negatives?: { en: string[]; pt: string[] };
}

export interface IntentPatternsRuntime {
  [operator: string]: IntentPattern;
}

export interface PatternBankMaster {
  intentOperatorPriority: Record<string, number>;
  languageIndicators: Record<string, { strong: string[]; medium: string[]; weak: string[] }>;
  contentGuard: {
    contentVerbs: Record<string, string[]>;
    fileActionVerbs: Record<string, string[]>;
    contentNouns: Record<string, string[]>;
    fileOrganizationPhrases: Record<string, string[]>;
  };
  fileActionOperators: Record<string, string[]>;
  inventoryPatterns: Record<string, { keywords: string[] }>;
  domainKeywords: Record<string, Record<string, string[]>>;
}

export interface SynonymBank {
  en: { phrases: Record<string, string>; words: Record<string, string> };
  pt: { phrases: Record<string, string>; words: Record<string, string> };
}

export interface TypoBank {
  en: { words: Record<string, string>; phrases: Record<string, string> };
  pt: { words: Record<string, string>; phrases: Record<string, string> };
}

export interface AnswerStylePolicy {
  version: string;
  defaultStyle: string;
  operatorStyleMap: Record<string, string>;
  styleDefinitions: Record<string, {
    structure: string;
    maxLength: number;
    minLength: number;
    useHeadings: boolean;
    citationsRequired: boolean;
  }>;
}

export interface EmphasisPolicy {
  version: string;
  rules: {
    boldLabels: boolean;
    boldDocNames: boolean;
    boldMetrics: boolean;
    boldSectionTitles: boolean;
    neverBold: string[];
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// REGISTRY STATE
// ═══════════════════════════════════════════════════════════════════════════

interface RegistryState {
  loaded: boolean;
  intentPatternsRuntime: IntentPatternsRuntime | null;
  patternBankMaster: PatternBankMaster | null;
  synonymBank: SynonymBank | null;
  typoBank: TypoBank | null;
  answerStylePolicy: AnswerStylePolicy | null;
  emphasisPolicy: EmphasisPolicy | null;
}

const state: RegistryState = {
  loaded: false,
  intentPatternsRuntime: null,
  patternBankMaster: null,
  synonymBank: null,
  typoBank: null,
  answerStylePolicy: null,
  emphasisPolicy: null,
};

// ═══════════════════════════════════════════════════════════════════════════
// PATH CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const DATA_DIR = path.join(__dirname, '../../data');
const DATA_BANKS_DIR = path.join(__dirname, '../../../data_banks');
const POLICIES_DIR = path.join(DATA_DIR, 'policies');
const NORMALIZERS_DIR = path.join(DATA_DIR, 'normalizers');

const PATHS = {
  intentPatternsRuntime: path.join(DATA_DIR, 'intent_patterns.runtime.json'),
  patternBankMaster: path.join(DATA_DIR, 'pattern_bank_master.json'),
  synonymBank: path.join(NORMALIZERS_DIR, 'synonyms.json'),
  typoBank: path.join(NORMALIZERS_DIR, 'typos.json'),
  answerStylePolicy: path.join(POLICIES_DIR, 'answer_style_policy.json'),
  emphasisPolicy: path.join(POLICIES_DIR, 'emphasis_and_highlighting_policy.json'),
};

// ═══════════════════════════════════════════════════════════════════════════
// LOADING UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function loadJsonSafe<T>(filePath: string, defaultValue: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as T;
    }
    console.warn(`[DataRegistry] File not found: ${filePath}`);
    return defaultValue;
  } catch (e) {
    console.warn(`[DataRegistry] Failed to load ${filePath}:`, e);
    return defaultValue;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Load all banks and policies. Call once on server boot.
 */
export function loadRegistry(): void {
  if (state.loaded) {
    console.log('[DataRegistry] Already loaded, skipping');
    return;
  }

  console.log('[DataRegistry] Loading all banks and policies...');

  state.intentPatternsRuntime = loadJsonSafe<IntentPatternsRuntime>(
    PATHS.intentPatternsRuntime,
    {}
  );

  state.patternBankMaster = loadJsonSafe<PatternBankMaster>(
    PATHS.patternBankMaster,
    {
      intentOperatorPriority: {},
      languageIndicators: {},
      contentGuard: {
        contentVerbs: {},
        fileActionVerbs: {},
        contentNouns: {},
        fileOrganizationPhrases: {},
      },
      fileActionOperators: {},
      inventoryPatterns: {},
      domainKeywords: {},
    }
  );

  state.synonymBank = loadJsonSafe<SynonymBank>(
    PATHS.synonymBank,
    { en: { phrases: {}, words: {} }, pt: { phrases: {}, words: {} } }
  );

  state.typoBank = loadJsonSafe<TypoBank>(
    PATHS.typoBank,
    { en: { words: {}, phrases: {} }, pt: { words: {}, phrases: {} } }
  );

  state.answerStylePolicy = loadJsonSafe<AnswerStylePolicy>(
    PATHS.answerStylePolicy,
    {
      version: '1.0.0',
      defaultStyle: 'balanced',
      operatorStyleMap: {},
      styleDefinitions: {},
    }
  );

  state.emphasisPolicy = loadJsonSafe<EmphasisPolicy>(
    PATHS.emphasisPolicy,
    {
      version: '1.0.0',
      rules: {
        boldLabels: true,
        boldDocNames: true,
        boldMetrics: true,
        boldSectionTitles: true,
        neverBold: [],
      },
    }
  );

  state.loaded = true;
  console.log('[DataRegistry] All banks and policies loaded');
}

/**
 * Get intent patterns runtime bank
 */
export function getIntentPatternsRuntime(): IntentPatternsRuntime {
  if (!state.loaded) loadRegistry();
  return state.intentPatternsRuntime!;
}

/**
 * Get pattern bank master
 */
export function getPatternBankMaster(): PatternBankMaster {
  if (!state.loaded) loadRegistry();
  return state.patternBankMaster!;
}

/**
 * Get synonym bank
 */
export function getSynonymBank(): SynonymBank {
  if (!state.loaded) loadRegistry();
  return state.synonymBank!;
}

/**
 * Get typo bank
 */
export function getTypoBank(): TypoBank {
  if (!state.loaded) loadRegistry();
  return state.typoBank!;
}

/**
 * Get answer style policy
 */
export function getAnswerStylePolicy(): AnswerStylePolicy {
  if (!state.loaded) loadRegistry();
  return state.answerStylePolicy!;
}

/**
 * Get emphasis policy
 */
export function getEmphasisPolicy(): EmphasisPolicy {
  if (!state.loaded) loadRegistry();
  return state.emphasisPolicy!;
}

/**
 * Get language indicators from pattern bank
 */
export function getLanguageIndicators(): Record<string, { strong: string[]; medium: string[]; weak: string[] }> {
  const bank = getPatternBankMaster();
  return bank.languageIndicators || {};
}

/**
 * Get content guard config from pattern bank
 */
export function getContentGuardConfig() {
  const bank = getPatternBankMaster();
  return bank.contentGuard || {
    contentVerbs: {},
    fileActionVerbs: {},
    contentNouns: {},
    fileOrganizationPhrases: {},
  };
}

/**
 * Get domain keywords from pattern bank
 */
export function getDomainKeywords(): Record<string, Record<string, string[]>> {
  const bank = getPatternBankMaster();
  return bank.domainKeywords || {};
}

/**
 * Check if registry is loaded
 */
export function isLoaded(): boolean {
  return state.loaded;
}

/**
 * Reset registry (for testing)
 */
export function resetRegistry(): void {
  state.loaded = false;
  state.intentPatternsRuntime = null;
  state.patternBankMaster = null;
  state.synonymBank = null;
  state.typoBank = null;
  state.answerStylePolicy = null;
  state.emphasisPolicy = null;
}

// Auto-load on import (can be disabled for testing)
if (process.env.NODE_ENV !== 'test') {
  loadRegistry();
}
