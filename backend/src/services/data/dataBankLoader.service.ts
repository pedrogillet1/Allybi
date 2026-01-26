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

export interface StructureIndicatorsBank {
  description: string;
  version: string;
  categories: {
    table?: { description: string; patterns: string[] };
    steps?: { description: string; patterns: string[] };
    bullets?: { description: string; patterns: string[] };
    button_only?: { description: string; patterns: string[] };
    file_list?: { description: string; patterns: string[] };
  };
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
    this.basePath = path.resolve(__dirname, '../../../data_banks');
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

  // ============================================================================
  // STRUCTURE INDICATORS (adaptive formatting based on query patterns)
  // ============================================================================

  private structureIndicatorsCache: StructureIndicatorsBank | null = null;

  /**
   * Load the structure indicators bank for adaptive formatting.
   * Maps query patterns to output shapes (table, steps, bullets, button_only, file_list).
   */
  loadStructureIndicators(): StructureIndicatorsBank | null {
    if (this.structureIndicatorsCache) {
      return this.structureIndicatorsCache;
    }

    const data = this.loadRawBank<StructureIndicatorsBank>('formatting/structure_indicators.any.json');
    if (data) {
      this.structureIndicatorsCache = data;
    }
    return data;
  }

  /**
   * Match a query against structure indicator patterns.
   * Returns the detected shape and matching patterns.
   *
   * @param query - Query text to analyze
   * @returns Detected structure info or null if no match
   */
  matchStructureIndicators(query: string): {
    shape: 'table' | 'steps' | 'bullets' | 'button_only' | 'file_list';
    matchedPatterns: string[];
    confidence: 'high' | 'medium';
  } | null {
    const indicators = this.loadStructureIndicators();
    if (!indicators?.categories) return null;

    const normalizedQuery = query.toLowerCase().trim();

    // Priority order for shape detection
    const shapeOrder: Array<'table' | 'steps' | 'bullets' | 'button_only' | 'file_list'> = [
      'button_only',  // Most specific, check first
      'file_list',    // Specific action
      'table',        // Comparison indicators
      'steps',        // Sequential indicators
      'bullets',      // List indicators
    ];

    for (const shape of shapeOrder) {
      const category = indicators.categories[shape];
      if (!category?.patterns) continue;

      const matchedPatterns: string[] = [];
      for (const pattern of category.patterns) {
        if (normalizedQuery.includes(pattern.toLowerCase())) {
          matchedPatterns.push(pattern);
        }
      }

      if (matchedPatterns.length > 0) {
        return {
          shape,
          matchedPatterns,
          confidence: matchedPatterns.length > 1 ? 'high' : 'medium',
        };
      }
    }

    return null;
  }

  /**
   * Check if query matches table indicators (comparison, side-by-side, etc.)
   */
  matchesTableIndicator(query: string): boolean {
    const result = this.matchStructureIndicators(query);
    return result?.shape === 'table';
  }

  /**
   * Check if query matches steps indicators (how-to, step-by-step, etc.)
   */
  matchesStepsIndicator(query: string): boolean {
    const result = this.matchStructureIndicators(query);
    return result?.shape === 'steps';
  }

  /**
   * Check if query matches bullet indicators (list of, key points, etc.)
   */
  matchesBulletIndicator(query: string): boolean {
    const result = this.matchStructureIndicators(query);
    return result?.shape === 'bullets';
  }

  /**
   * Check if query matches button-only indicators (open file, show document, etc.)
   */
  matchesButtonOnlyIndicator(query: string): boolean {
    const result = this.matchStructureIndicators(query);
    return result?.shape === 'button_only';
  }

  /**
   * Check if query matches file list indicators (list my files, etc.)
   */
  matchesFileListIndicator(query: string): boolean {
    const result = this.matchStructureIndicators(query);
    return result?.shape === 'file_list';
  }
}

// Export singleton
export const dataBankLoader = new DataBankLoaderService();

export default DataBankLoaderService;

// ============================================================================
// MASTER PATTERN BANK (migrated from patternBankLoader.service.ts)
// ============================================================================

export interface MasterPatternBank {
  metadata: {
    version: string;
    description: string;
    languages: string[];
  };
  languageIndicators: {
    pt: { strong: string[]; medium: string[]; weak: string[] };
    es: { strong: string[]; medium: string[]; weak: string[] };
    en: { strong: string[]; medium: string[]; weak: string[] };
  };
  fileActionOperators: {
    [operator: string]: {
      en: string[];
      pt: string[];
      es: string[];
    };
  };
  fileTypes: {
    extensionNames: Record<string, string>;
    extensionExpansions: Record<string, string[]>;
    naturalLanguageTypes: Record<string, string[]>;
  };
  inventoryPatterns: {
    most_recent: { keywords: Record<string, string[]> };
    largest: { keywords: Record<string, string[]> };
    smallest: { keywords: Record<string, string[]> };
  };
  contentGuard: {
    contentVerbs: Record<string, string[]>;
    fileActionVerbs: Record<string, string[]>;
    contentNouns: Record<string, string[]>;
    fileOrganizationPhrases: Record<string, string[]>;
  };
  domainKeywords: {
    [domain: string]: Record<string, string[]>;
  };
}

let masterPatternBank: MasterPatternBank | null = null;

/**
 * Load the master pattern bank from data_banks/semantics/pattern_bank_master.any.json
 */
export function loadPatternBank(): MasterPatternBank {
  if (masterPatternBank) return masterPatternBank;

  const bankPath = path.join(__dirname, '../../data_banks/semantics/pattern_bank_master.any.json');
  try {
    const raw = fs.readFileSync(bankPath, 'utf-8');
    masterPatternBank = JSON.parse(raw);
    console.log('[DataBankLoader] Loaded master pattern bank');
    return masterPatternBank!;
  } catch (err) {
    console.error('[DataBankLoader] Failed to load pattern_bank_master.json:', err);
    throw new Error('Pattern bank not found - cannot proceed');
  }
}

/**
 * Check if query contains any keyword from a multilingual keyword list
 */
export function matchesKeywords(query: string, keywords: Record<string, string[]>): boolean {
  const q = query.toLowerCase();
  for (const lang of Object.keys(keywords)) {
    for (const keyword of keywords[lang]) {
      if (q.includes(keyword.toLowerCase())) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Check if query matches any keyword from a single language
 */
export function matchesKeywordsForLang(query: string, keywords: string[]): boolean {
  const q = query.toLowerCase();
  for (const keyword of keywords) {
    if (q.includes(keyword.toLowerCase())) {
      return true;
    }
  }
  return false;
}

/**
 * Get all keywords for a specific operator (all languages combined)
 */
export function getOperatorKeywords(operator: string): string[] {
  const bank = loadPatternBank();
  const opPatterns = bank.fileActionOperators[operator];
  if (!opPatterns) return [];

  return [
    ...(opPatterns.en || []),
    ...(opPatterns.pt || []),
    ...(opPatterns.es || []),
  ];
}

/**
 * Detect which operator best matches a query
 */
export function detectOperatorFromQuery(query: string): string | null {
  const bank = loadPatternBank();
  const q = query.toLowerCase();

  // Priority order for operators
  const operatorPriority = ['filter', 'sort', 'group', 'open', 'locate_file', 'again', 'list'];

  for (const operator of operatorPriority) {
    const patterns = bank.fileActionOperators[operator];
    if (!patterns) continue;

    for (const lang of ['en', 'pt', 'es']) {
      const keywords = patterns[lang as keyof typeof patterns];
      if (!keywords) continue;

      for (const keyword of keywords) {
        if (q.includes(keyword.toLowerCase())) {
          return operator;
        }
      }
    }
  }

  return null;
}

/**
 * Extract file extensions from query using data bank mappings
 */
export function extractExtensions(text: string): string[] {
  const bank = loadPatternBank();
  const found: string[] = [];
  const words = text.toLowerCase().split(/[\s,]+/).filter(w => w.length > 0);

  // Skip words that are not file types
  const skipWords = ['and', 'or', 'the', 'only', 'just', 'all', 'my', 'files', 'file', 'word', 'contains', 'contain', 'name', 'e', 'a', 'o', 'os', 'as', 'de', 'do', 'da', 'dos', 'das', 'meus', 'minha', 'minhas', 'mis', 'mi', 'show', 'list', 'filter', 'sort', 'group'];

  for (const word of words) {
    if (skipWords.includes(word)) continue;

    // First check expansion map (returns multiple extensions)
    if (bank.fileTypes.extensionExpansions[word]) {
      found.push(...bank.fileTypes.extensionExpansions[word]);
    } else if (bank.fileTypes.extensionNames[word]) {
      // Fall back to single extension
      found.push(bank.fileTypes.extensionNames[word]);
    }
  }
  return [...new Set(found)]; // dedupe
}

/**
 * Get all natural language file type words (for matching in queries)
 */
export function getAllFileTypeWords(): string[] {
  const bank = loadPatternBank();
  const words: string[] = [];

  // Add extension names
  words.push(...Object.keys(bank.fileTypes.extensionNames));

  // Add natural language types from all languages
  // naturalLanguageTypes[lang] is an object like { "spreadsheet": ["xlsx"], "document": ["pdf"] }
  // We want the keys (the natural language words)
  for (const lang of Object.keys(bank.fileTypes.naturalLanguageTypes)) {
    const langTypes = bank.fileTypes.naturalLanguageTypes[lang];
    if (typeof langTypes === 'object' && langTypes !== null) {
      words.push(...Object.keys(langTypes));
    }
  }

  return [...new Set(words)];
}

/**
 * Check if query is asking about file organization (not content)
 */
export function isFileOrganizationQuery(query: string): boolean {
  const bank = loadPatternBank();
  const q = query.toLowerCase();

  // PRIORITY 0: Check for content action verbs - these indicate content queries even with filenames
  // "Summarize [filename].pdf" or "Extract data from [filename].xlsx" are CONTENT queries
  const contentActionVerbs = /\b(?:summarize|summarise|summary|extract|analyze|analyse|explain|quote|translate|compare|review|read|tell\s+me\s+about|what\s+(?:is|does|are)|give\s+me\s+(?:the|a)\s+summary|breakdown|break\s*down|describe|outline|interpret|find\s+(?:the|all)\s+(?:mentions?|references?|values?|data|information|numbers?|text|content))\b/i;
  if (contentActionVerbs.test(query)) {
    return false; // This is a content query, NOT a file organization query
  }

  // FIRST: Check if query is asking about content INSIDE a specific document
  // Patterns like "In [filename], where is X" or "From [filename], list X" are CONTENT queries
  const contentInsideDocPattern = /^(?:in|from)\s+[^,]+\.(?:pdf|docx?|xlsx?|pptx?|csv|txt|md)[,\s]+(?:where|what|how|which|list|give|extract|show|find)\b/i;
  if (contentInsideDocPattern.test(query)) {
    return false; // This is a content query, NOT a file organization query
  }

  // SECOND: Check for content-context phrases that contain "my documents/files"
  // These are content queries ABOUT documents, not file management
  const contentContextPatterns = [
    // "Find all mentions of X across my documents" - content extraction
    /\b(?:find|search|look\s+for)\s+(?:all\s+)?(?:mentions?|references?|instances?|occurrences?)\s+(?:of|to)\b.*\b(?:my\s+)?(?:documents?|files?)\b/i,
    // "across my documents/files" - multi-doc content query
    /\bacross\s+(?:all\s+)?(?:my\s+)?(?:documents?|files?)\b/i,
    // "in my documents/files" when asking about content
    /\bwhat\s+(?:information|data|details?)\s+(?:do|does)\s+(?:my\s+)?(?:files?|documents?)\s+(?:contain|have|include)\b/i,
    // "information in my documents/files"
    /\b(?:information|data|details?)\s+(?:in|from|across)\s+(?:my\s+)?(?:documents?|files?)\b/i,
  ];

  for (const pattern of contentContextPatterns) {
    if (pattern.test(query)) {
      return false; // This is a content query, NOT a file organization query
    }
  }

  // THIRD: Check for help-related phrases - these are NOT file organization queries
  // "necesito ayuda con mis documentos" = help request, not file management
  const helpContextPatterns = [
    // Help phrases in English
    /\b(?:help|assist|support)\s+(?:me\s+)?(?:with)?\s+(?:my\s+)?(?:documents?|files?)/i,
    /\b(?:how|what)\s+can\s+you\s+(?:do|help)\b/i,
    /\bi\s+need\s+help\b/i,
    /\bcan\s+you\s+help\b/i,
    // Help phrases in Portuguese
    /\b(?:ajuda|ajude|ajudar)\b.*\b(?:documentos?|arquivos?)\b/i,
    /\b(?:preciso|necessito)\s+(?:de\s+)?ajuda\b/i,
    /\bvocê\s+pode\s+me\s+ajudar\b/i,
    /\bcomo\s+(?:você\s+)?pode\s+me\s+ajudar\b/i,
    // Help phrases in Spanish
    /\b(?:ayuda|ayudar|ayudame)\b.*\b(?:documentos?|archivos?)\b/i,
    /\b(?:necesito|preciso)\s+ayuda\b/i,
    /\bcómo\s+(?:me\s+)?puedes\s+ayudar\b/i,
    /\bme\s+puedes\s+ayudar\b/i,
  ];

  for (const pattern of helpContextPatterns) {
    if (pattern.test(query)) {
      return false; // This is a help query, NOT a file organization query
    }
  }

  // Check for file organization phrases
  for (const lang of ['en', 'pt', 'es']) {
    const phrases = bank.contentGuard.fileOrganizationPhrases[lang];
    if (!phrases) continue;

    for (const phrase of phrases) {
      if (q.includes(phrase.toLowerCase())) {
        return true;
      }
    }
  }

  // Check for file action verbs combined with file type words
  const hasFileActionVerb = matchesKeywords(q, bank.contentGuard.fileActionVerbs);
  const hasFileTypeWord = getAllFileTypeWords().some(word => q.includes(word.toLowerCase()));

  if (hasFileActionVerb && hasFileTypeWord) {
    // Additional check: not asking about content
    const hasContentNoun = matchesKeywords(q, bank.contentGuard.contentNouns);
    if (!hasContentNoun) {
      return true;
    }
  }

  return false;
}

/**
 * Detect inventory query type (most_recent, largest, smallest, filter, group, sort)
 */
export function detectInventoryType(query: string): string | null {
  const bank = loadPatternBank();
  const q = query.toLowerCase();

  // Check most_recent
  if (matchesKeywords(q, bank.inventoryPatterns.most_recent.keywords)) {
    return 'most_recent';
  }

  // Check largest
  if (matchesKeywords(q, bank.inventoryPatterns.largest.keywords)) {
    return 'largest';
  }

  // Check smallest
  if (matchesKeywords(q, bank.inventoryPatterns.smallest.keywords)) {
    return 'smallest';
  }

  // Check for group patterns
  const groupKeywords = bank.fileActionOperators.group;
  if (groupKeywords && matchesKeywords(q, groupKeywords)) {
    return 'group';
  }

  // Check for sort patterns
  const sortKeywords = bank.fileActionOperators.sort;
  if (sortKeywords && matchesKeywords(q, sortKeywords)) {
    return 'sort';
  }

  // Check for filter patterns
  const filterKeywords = bank.fileActionOperators.filter;
  if (filterKeywords && matchesKeywords(q, filterKeywords)) {
    // Make sure there's a file type mentioned
    if (extractExtensions(q).length > 0 || getAllFileTypeWords().some(w => q.includes(w.toLowerCase()))) {
      return 'filter';
    }
  }

  // Check for list patterns
  const listKeywords = bank.fileActionOperators.list;
  if (listKeywords && matchesKeywords(q, listKeywords)) {
    return 'list';
  }

  return null;
}

/**
 * Get language indicators for scoring
 */
export function getLanguageIndicators(lang: 'pt' | 'es' | 'en'): { strong: string[]; medium: string[]; weak: string[] } {
  const bank = loadPatternBank();
  return bank.languageIndicators[lang];
}

/**
 * Get domain keywords for a specific domain
 */
export function getDomainKeywords(domain: string): Record<string, string[]> {
  const bank = loadPatternBank();
  return bank.domainKeywords[domain] || {};
}

// Re-export for backwards compatibility during migration
export { masterPatternBank as patternBank };
