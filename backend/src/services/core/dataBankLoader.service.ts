/**
 * KODA V3 Data Bank Loader Service
 *
 * Loads and caches JSON pattern banks from the data_banks directory.
 * Provides fast pattern matching for routing decisions.
 *
 * @version 1.0.0
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// TYPES
// ============================================================================

export interface PatternFamily {
  description: string;
  weight?: number;
  patterns: string[];
  dampen_intent?: string;
  dampen_amount?: number;
  boost_intent?: string;
  boost_amount?: number;
  priority?: string;
}

export interface PatternBank {
  _meta: {
    bank: string;
    language: string;
    version: string;
    description: string;
    target_count: number;
    created: string;
    purpose?: string;
  };
  [familyName: string]: PatternFamily | PatternBank['_meta'];
}

export interface LoadedBank {
  bank: PatternBank;
  allPatterns: string[];
  patternCount: number;
  families: string[];
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

class DataBankLoaderService {
  private readonly basePath: string;
  private readonly cache: Map<string, LoadedBank> = new Map();
  private readonly patternMatchCache: Map<string, Map<string, boolean>> = new Map();
  private initialized = false;

  constructor() {
    // Resolve path relative to this file's location
    this.basePath = path.resolve(__dirname, '../../data_banks');
  }

  /**
   * Load a pattern bank from the data_banks directory.
   * Results are cached for fast subsequent access.
   *
   * @param category - Category folder (triggers, negatives, etc.)
   * @param bankName - Bank name without extension (e.g., 'content_location')
   * @param language - Language code (en, pt, es)
   */
  loadBank(category: string, bankName: string, language: string): LoadedBank | null {
    const cacheKey = `${category}/${bankName}.${language}`;

    // Check cache first
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // Build file path
    const filePath = path.join(this.basePath, category, `${bankName}.${language}.json`);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.warn(`[DataBankLoader] Bank not found: ${filePath}`);
      return null;
    }

    try {
      // Read and parse JSON
      const content = fs.readFileSync(filePath, 'utf-8');
      const bank: PatternBank = JSON.parse(content);

      // Extract all patterns from all families
      const allPatterns: string[] = [];
      const families: string[] = [];

      for (const [key, value] of Object.entries(bank)) {
        if (key === '_meta') continue;

        const family = value as PatternFamily;
        if (family.patterns && Array.isArray(family.patterns)) {
          allPatterns.push(...family.patterns);
          families.push(key);
        }
      }

      const loaded: LoadedBank = {
        bank,
        allPatterns,
        patternCount: allPatterns.length,
        families,
      };

      // Cache result
      this.cache.set(cacheKey, loaded);

      console.log(`[DataBankLoader] Loaded ${cacheKey}: ${allPatterns.length} patterns from ${families.length} families`);

      return loaded;
    } catch (err) {
      console.error(`[DataBankLoader] Error loading ${filePath}:`, err);
      return null;
    }
  }

  /**
   * Load content-location trigger banks for all languages.
   * Returns combined pattern set for fast matching.
   */
  loadContentLocationTriggers(): { en: LoadedBank | null; pt: LoadedBank | null; es: LoadedBank | null } {
    return {
      en: this.loadBank('triggers', 'content_location', 'en'),
      pt: this.loadBank('triggers', 'content_location', 'pt'),
      es: this.loadBank('triggers', 'content_location', 'es'),
    };
  }

  /**
   * Load content-location negative banks for all languages.
   * These patterns BLOCK file_actions when content location is detected.
   */
  loadContentLocationNegatives(): { en: LoadedBank | null; pt: LoadedBank | null; es: LoadedBank | null } {
    return {
      en: this.loadBank('negatives', 'not_file_actions_content_location', 'en'),
      pt: this.loadBank('negatives', 'not_file_actions_content_location', 'pt'),
      es: this.loadBank('negatives', 'not_file_actions_content_location', 'es'),
    };
  }

  /**
   * Load file storage positive banks (keep file_actions for true storage queries).
   */
  loadFileStoragePositives(): { en: LoadedBank | null; pt: LoadedBank | null; es: LoadedBank | null } {
    return {
      en: this.loadBank('negatives', 'keep_file_actions_storage', 'en'),
      pt: this.loadBank('negatives', 'keep_file_actions_storage', 'pt'),
      es: this.loadBank('negatives', 'keep_file_actions_storage', 'es'),
    };
  }

  /**
   * Check if query matches any pattern in the given bank.
   * Uses substring matching (case-insensitive).
   *
   * @param query - Query text (will be lowercased)
   * @param bank - Loaded bank to check against
   * @returns true if any pattern matches
   */
  matchesBank(query: string, bank: LoadedBank | null): boolean {
    if (!bank) return false;

    const normalizedQuery = query.toLowerCase().trim();

    // Check pattern cache
    const bankKey = bank.bank._meta.bank + '.' + bank.bank._meta.language;
    if (!this.patternMatchCache.has(bankKey)) {
      this.patternMatchCache.set(bankKey, new Map());
    }
    const queryCache = this.patternMatchCache.get(bankKey)!;

    if (queryCache.has(normalizedQuery)) {
      return queryCache.get(normalizedQuery)!;
    }

    // Check each pattern
    const matched = bank.allPatterns.some(pattern => normalizedQuery.includes(pattern.toLowerCase()));

    // Cache result (limit cache size)
    if (queryCache.size > 10000) {
      queryCache.clear();
    }
    queryCache.set(normalizedQuery, matched);

    return matched;
  }

  /**
   * Check if query matches content-location patterns in any language.
   * This is the main function for routing decisions.
   *
   * @param query - Query text
   * @returns { matches: boolean, language: string | null, matchedPatterns: string[] }
   */
  isContentLocationQuery(query: string): { matches: boolean; language: string | null; matchedPatterns: string[] } {
    const normalizedQuery = query.toLowerCase().trim();
    const triggers = this.loadContentLocationTriggers();

    // Check each language
    for (const [lang, bank] of Object.entries(triggers)) {
      if (!bank) continue;

      const matchedPatterns = bank.allPatterns.filter(p => normalizedQuery.includes(p.toLowerCase()));
      if (matchedPatterns.length > 0) {
        return {
          matches: true,
          language: lang,
          matchedPatterns: matchedPatterns.slice(0, 5), // Limit for logging
        };
      }
    }

    return { matches: false, language: null, matchedPatterns: [] };
  }

  /**
   * Check if query matches file-storage patterns in any language.
   * When these match, query should route to file_actions (true file location, not content location).
   */
  isFileStorageQuery(query: string): { matches: boolean; language: string | null } {
    const normalizedQuery = query.toLowerCase().trim();
    const positives = this.loadFileStoragePositives();

    for (const [lang, bank] of Object.entries(positives)) {
      if (this.matchesBank(normalizedQuery, bank)) {
        return { matches: true, language: lang };
      }
    }

    return { matches: false, language: null };
  }

  /**
   * Get routing adjustment for content-location vs file-storage.
   * Returns boost/dampen amounts for file_actions and documents intents.
   *
   * @param query - Query text
   * @returns Adjustment object or null if no special handling needed
   */
  getContentLocationAdjustment(query: string): {
    isContentLocation: boolean;
    isFileStorage: boolean;
    fileActionsBoost: number;
    documentsBoost: number;
    reason: string;
  } | null {
    const contentResult = this.isContentLocationQuery(query);
    const storageResult = this.isFileStorageQuery(query);

    // File storage takes precedence
    if (storageResult.matches) {
      return {
        isContentLocation: false,
        isFileStorage: true,
        fileActionsBoost: 0.50,
        documentsBoost: -0.30,
        reason: `File storage query detected (${storageResult.language})`,
      };
    }

    // Content location check
    if (contentResult.matches) {
      return {
        isContentLocation: true,
        isFileStorage: false,
        fileActionsBoost: -0.80, // Strong dampening
        documentsBoost: 0.50,
        reason: `Content location query detected (${contentResult.language}): ${contentResult.matchedPatterns.slice(0, 2).join(', ')}`,
      };
    }

    return null;
  }

  /**
   * Pre-load all banks for faster runtime access.
   */
  preloadAll(): void {
    if (this.initialized) return;

    console.log('[DataBankLoader] Pre-loading all banks...');

    this.loadContentLocationTriggers();
    this.loadContentLocationNegatives();
    this.loadFileStoragePositives();

    this.initialized = true;
    console.log(`[DataBankLoader] Pre-load complete. ${this.cache.size} banks loaded.`);
  }

  /**
   * Clear all caches.
   */
  clearCache(): void {
    this.cache.clear();
    this.patternMatchCache.clear();
    this.initialized = false;
  }

  // ============================================================================
  // NEW: POLICY & VALIDATOR LOADERS
  // ============================================================================

  private policyCache: Map<string, any> = new Map();

  /**
   * Load a raw JSON bank file by relative path.
   * Used for policy banks that don't follow the pattern format.
   *
   * @param relativePath - Path relative to data_banks (e.g., 'formatting/policies.any.json')
   */
  loadRawBank<T = any>(relativePath: string): T | null {
    // Check cache
    if (this.policyCache.has(relativePath)) {
      return this.policyCache.get(relativePath) as T;
    }

    const filePath = path.join(this.basePath, relativePath);

    if (!fs.existsSync(filePath)) {
      console.warn(`[DataBankLoader] Raw bank not found: ${filePath}`);
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content) as T;
      this.policyCache.set(relativePath, parsed);
      console.log(`[DataBankLoader] Loaded raw bank: ${relativePath}`);
      return parsed;
    } catch (err) {
      console.error(`[DataBankLoader] Error loading ${filePath}:`, err);
      return null;
    }
  }

  /**
   * Load the policies bank (operator contracts, evidence policy, etc.)
   */
  loadPolicies(): {
    _meta: any;
    global: any;
    disallowedOpeners: string[];
    disallowedPhrases: string[];
    operatorContracts: Record<string, any>;
    evidencePolicy: any;
    languagePolicy: any;
    followupPolicy: any;
    tablePolicy: any;
    bulletPolicy: any;
    completionPolicy: any;
  } | null {
    return this.loadRawBank('formatting/policies.any.json');
  }

  /**
   * Load the validators bank (output validators including contract enforcement)
   */
  loadValidators(): {
    _meta: any;
    categories: Record<string, any>;
    contract_enforcement?: Record<string, any>;
  } | null {
    return this.loadRawBank('formatting/validators.any.json');
  }

  /**
   * Load the routing rules bank (boost/dampen signals)
   */
  loadRoutingRules(): {
    _meta: any;
    rules: Array<{
      id: string;
      name: string;
      description: string;
      when: any;
      then: any[];
    }>;
    repairs?: any;
  } | null {
    return this.loadRawBank('routing/routing_rules.any.json');
  }

  /**
   * Get operator contract for a specific operator
   */
  getOperatorContract(operator: string): {
    outputShape: string;
    requireSourceButtons?: boolean;
    requireFileList?: boolean;
    requireSourceButtonsWhenDocGrounded?: boolean;
    forbidText?: boolean;
    maxFollowups?: number;
  } | null {
    const policies = this.loadPolicies();
    if (!policies?.operatorContracts) return null;
    return policies.operatorContracts[operator] || null;
  }

  /**
   * Get disallowed opener patterns (compiled)
   */
  getDisallowedOpenerPatterns(): RegExp[] {
    const policies = this.loadPolicies();
    if (!policies?.disallowedOpeners) return [];
    return policies.disallowedOpeners.map((p: string) => {
      try {
        return new RegExp(p, 'i');
      } catch {
        return null;
      }
    }).filter((r: RegExp | null): r is RegExp => r !== null);
  }

  /**
   * Check if operator requires button-only output
   */
  isButtonOnlyOperator(operator: string): boolean {
    const contract = this.getOperatorContract(operator);
    return contract?.outputShape === 'button_only' || false;
  }

  /**
   * Check if operator requires file list output
   */
  isFileListOperator(operator: string): boolean {
    const contract = this.getOperatorContract(operator);
    return contract?.outputShape === 'file_list' || false;
  }
}

// Export singleton
export const dataBankLoader = new DataBankLoaderService();

export default DataBankLoaderService;
