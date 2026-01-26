/**
 * Data Bank Loader - Centralized loader for all JSON data banks
 *
 * This loader:
 * 1. Reads banks through the registry (not ad-hoc paths)
 * 2. Validates structure on load
 * 3. Caches in memory (singleton pattern)
 * 4. Supports language dimension
 * 5. Provides type-safe access
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  DATA_BANK_REGISTRY,
  DataBankEntry,
  getBankEntry,
  getRequiredBanks,
  BankLanguage,
  DEPRECATED_FILES,
} from './dataBankRegistry';

// ========== TYPES ==========

export interface LoadOptions {
  lang?: 'en' | 'pt';           // Language filter for lang-specific data
  forceReload?: boolean;        // Bypass cache
  validateSchema?: boolean;     // Run schema validation
}

export interface LoadedBank<T = any> {
  id: string;
  filename: string;
  data: T;
  language?: 'en' | 'pt' | 'both';
  loadedAt: Date;
  version?: string;
}

export interface DataBankLoaderStats {
  totalRegistered: number;
  totalLoaded: number;
  loadedBanks: string[];
  failedBanks: string[];
  deprecatedFilesFound: string[];
}

// ========== SINGLETON CACHE ==========

const bankCache = new Map<string, LoadedBank>();
let dataDir: string | null = null;

// ========== INITIALIZATION ==========

/**
 * Initialize the data bank loader
 *
 * @param dataDirPath - Path to data directory
 */
export function initDataBankLoader(dataDirPath: string): void {
  dataDir = dataDirPath;
  console.log(`[DataBankLoader] Initialized with dataDir: ${dataDir}`);
}

/**
 * Get resolved data directory
 */
function getDataDir(): string {
  if (!dataDir) {
    // Auto-resolve if not initialized
    const possiblePaths = [
      path.resolve(__dirname, '../../data'),
      path.resolve(__dirname, '../../../src/data'),
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        dataDir = p;
        break;
      }
    }
    if (!dataDir) {
      throw new Error('[DataBankLoader] Data directory not found. Call initDataBankLoader() first.');
    }
  }
  return dataDir;
}

// ========== CORE LOADING FUNCTIONS ==========

/**
 * Load a data bank by ID
 *
 * @param bankId - Bank ID from registry
 * @param options - Load options
 * @returns Loaded bank data
 */
export function getBank<T = any>(bankId: string, options: LoadOptions = {}): T | null {
  const entry = getBankEntry(bankId);
  if (!entry) {
    console.warn(`[DataBankLoader] Bank "${bankId}" not found in registry`);
    return null;
  }

  // Check cache
  const cacheKey = options.lang ? `${bankId}:${options.lang}` : bankId;
  if (!options.forceReload && bankCache.has(cacheKey)) {
    return bankCache.get(cacheKey)!.data as T;
  }

  // Load from file
  const filePath = path.join(getDataDir(), entry.filename);
  if (!fs.existsSync(filePath)) {
    if (entry.required) {
      throw new Error(`[DataBankLoader] Required bank "${bankId}" not found at ${filePath}`);
    }
    console.warn(`[DataBankLoader] Optional bank "${bankId}" not found at ${filePath}`);
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    let data = JSON.parse(content) as T;

    // Handle language extraction if bank has lang-specific structure
    if (options.lang && entry.language === 'both') {
      data = extractLanguageData(data, options.lang, bankId);
    }

    // Cache
    const loaded: LoadedBank<T> = {
      id: bankId,
      filename: entry.filename,
      data,
      language: options.lang || (entry.language === 'any' ? undefined : entry.language as any),
      loadedAt: new Date(),
      version: entry.version,
    };
    bankCache.set(cacheKey, loaded);

    return data;
  } catch (err: any) {
    console.error(`[DataBankLoader] Failed to load bank "${bankId}": ${err.message}`);
    if (entry.required) {
      throw err;
    }
    return null;
  }
}

/**
 * Load a bank and return full metadata
 */
export function getBankWithMeta<T = any>(bankId: string, options: LoadOptions = {}): LoadedBank<T> | null {
  const data = getBank<T>(bankId, options);
  if (!data) return null;

  const cacheKey = options.lang ? `${bankId}:${options.lang}` : bankId;
  return bankCache.get(cacheKey) as LoadedBank<T>;
}

/**
 * Load multiple banks at once
 */
export function getBanks<T = any>(bankIds: string[], options: LoadOptions = {}): Map<string, T> {
  const result = new Map<string, T>();
  for (const id of bankIds) {
    const data = getBank<T>(id, options);
    if (data) {
      result.set(id, data);
    }
  }
  return result;
}

/**
 * Load all required banks (for boot validation)
 */
export function loadRequiredBanks(): void {
  const required = getRequiredBanks();
  const failures: string[] = [];

  for (const entry of required) {
    try {
      const data = getBank(entry.id);
      if (!data) {
        failures.push(entry.filename);
      }
    } catch (err: any) {
      failures.push(`${entry.filename}: ${err.message}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `[DataBankLoader] Failed to load required banks:\n` +
      failures.map(f => `  - ${f}`).join('\n')
    );
  }

  console.log(`[DataBankLoader] Loaded ${required.length} required banks successfully`);
}

// ========== LANGUAGE EXTRACTION ==========

/**
 * Extract language-specific data from a bank
 *
 * Handles common structures:
 * - { en: {...}, pt: {...} }
 * - { entries: { en: [...], pt: [...] } }
 * - { phrases: { en: {...}, pt: {...} } }
 */
function extractLanguageData<T>(data: any, lang: 'en' | 'pt', bankId: string): T {
  // Pattern 1: Top-level lang keys
  if (data[lang] !== undefined) {
    return data[lang];
  }

  // Pattern 2: entries.lang
  if (data.entries?.[lang] !== undefined) {
    return { ...data, entries: data.entries[lang] };
  }

  // Pattern 3: phrases.lang
  if (data.phrases?.[lang] !== undefined) {
    return { ...data, phrases: data.phrases[lang] };
  }

  // Pattern 4: keywords/patterns per lang (intent patterns style)
  if (data.keywords?.[lang] !== undefined || data.patterns?.[lang] !== undefined) {
    // Keep structure, data consumer should handle lang extraction
    return data;
  }

  // No lang-specific structure, return as-is
  console.debug(`[DataBankLoader] Bank "${bankId}" has no lang-specific structure for "${lang}"`);
  return data;
}

// ========== CACHE MANAGEMENT ==========

/**
 * Clear cache for a specific bank or all banks
 */
export function clearBankCache(bankId?: string): void {
  if (bankId) {
    // Clear specific bank (including lang variants)
    const keysToDelete = Array.from(bankCache.keys()).filter(
      key => key === bankId || key.startsWith(`${bankId}:`)
    );
    for (const key of keysToDelete) {
      bankCache.delete(key);
    }
  } else {
    bankCache.clear();
  }
}

/**
 * Get cache stats
 */
export function getBankCacheStats(): DataBankLoaderStats {
  const loadedBanks = Array.from(bankCache.keys());
  const failedBanks: string[] = [];

  // Check for deprecated files in data dir
  const deprecatedFilesFound: string[] = [];
  try {
    const files = fs.readdirSync(getDataDir());
    for (const file of files) {
      if (DEPRECATED_FILES.includes(file)) {
        deprecatedFilesFound.push(file);
      }
    }
  } catch {}

  return {
    totalRegistered: DATA_BANK_REGISTRY.length,
    totalLoaded: bankCache.size,
    loadedBanks,
    failedBanks,
    deprecatedFilesFound,
  };
}

// ========== VALIDATION ==========

/**
 * Validate all registered banks can be loaded
 */
export function validateAllBanks(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const entry of DATA_BANK_REGISTRY) {
    const filePath = path.join(getDataDir(), entry.filename);

    if (!fs.existsSync(filePath)) {
      if (entry.required) {
        errors.push(`MISSING REQUIRED: ${entry.filename}`);
      }
      continue;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      JSON.parse(content);
    } catch (err: any) {
      errors.push(`INVALID JSON: ${entry.filename} - ${err.message}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Find files in data dir NOT in registry (potential dead files)
 */
export function findUnregisteredFiles(): string[] {
  const registeredFilenames = new Set(
    DATA_BANK_REGISTRY.flatMap(e => [e.filename, ...(e.deprecatedAliases || [])])
  );

  const unregistered: string[] = [];
  try {
    const files = fs.readdirSync(getDataDir()).filter(f => f.endsWith('.json'));
    for (const file of files) {
      if (!registeredFilenames.has(file)) {
        unregistered.push(file);
      }
    }
  } catch {}

  return unregistered;
}

// ========== CONVENIENCE ACCESSORS ==========

// Pre-typed accessors for common banks

export function getIntentPatterns(options: LoadOptions = {}) {
  return getBank('intent_patterns_runtime', options);
}

export function getAnswerStyles(options: LoadOptions = {}) {
  return getBank('answer_styles', options);
}

export function getFallbacks(options: LoadOptions = {}) {
  return getBank('fallbacks', options);
}

export function getSystemPrompts(options: LoadOptions = {}) {
  return getBank('system_prompts', options);
}

// ========== EXPORTS ==========

export {
  DATA_BANK_REGISTRY,
  DataBankEntry,
  getBankEntry,
  getRequiredBanks,
  BankLanguage,
} from './dataBankRegistry';
