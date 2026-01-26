/**
 * Brain Data Loader Service
 *
 * Central service for loading and managing all brain data (intent patterns,
 * fallbacks, validation rules, answer styles, domain vocabulary, examples).
 *
 * This service:
 * - Loads all JSON data files at startup
 * - Validates schemas and data integrity
 * - Provides read-only access to all brain datasets
 * - Is used by IntentEngine, FallbackEngine, ValidationService, etc.
 */

import * as fs from 'fs';
import * as path from 'path';
import { resolveDataDir } from '../../utils/resolveDataDir';
import { LanguageCode, IntentName } from '../../types/intentV3.types';
import {
  BrainData,
  BrainDataStats,
  BrainDataQuery,
  BrainKeyword,
  BrainPattern,
  BrainSynonym,
  BrainFallback,
  BrainValidationRule,
  BrainAnswerStyle,
  BrainDomainVocab,
  BrainExample,
  BrainEdgeCase,
  IntentFamily,
} from '../../types/brainData.types';

// =============================================================================
// CONSTANTS
// =============================================================================

const SUPPORTED_LANGUAGES: LanguageCode[] = ['en', 'pt', 'es'];

const INTENT_FAMILY_MAP: Record<string, IntentFamily> = {
  'DOC_QA': 'documents',
  'DOC_SEARCH': 'documents',
  'DOC_SUMMARIZE': 'documents',
  'DOC_ANALYTICS': 'documents',
  'DOC_MANAGEMENT': 'documents',
  'PRODUCT_HELP': 'help',
  'ONBOARDING_HELP': 'help',
  'FEATURE_REQUEST': 'help',
  'CHITCHAT': 'conversation',
  'FEEDBACK_POSITIVE': 'conversation',
  'FEEDBACK_NEGATIVE': 'conversation',
  'META_AI': 'conversation',
  'ANSWER_REWRITE': 'edit',
  'ANSWER_EXPAND': 'edit',
  'ANSWER_SIMPLIFY': 'edit',
  'TEXT_TRANSFORM': 'edit',
  'GENERIC_KNOWLEDGE': 'reasoning',
  'REASONING_TASK': 'reasoning',
  'MEMORY_STORE': 'memory',
  'MEMORY_RECALL': 'memory',
  'OUT_OF_SCOPE': 'error',
  'AMBIGUOUS': 'error',
  'SAFETY_CONCERN': 'error',
  'UNKNOWN': 'error',
  'PREFERENCE_UPDATE': 'preferences',
  // New V4 intents
  'documents': 'documents',
  'help': 'help',
  'conversation': 'conversation',
  'edit': 'edit',
  'reasoning': 'reasoning',
  'memory': 'memory',
  'error': 'error',
  'preferences': 'preferences',
  'extraction': 'extraction',
  // Domain-specific
  'excel': 'domain_specialized',
  'accounting': 'domain_specialized',
  'engineering': 'domain_specialized',
  'finance': 'domain_specialized',
  'legal': 'domain_specialized',
  'medical': 'domain_specialized',
};

// =============================================================================
// SERVICE CLASS
// =============================================================================

export class BrainDataLoaderService {
  private data: BrainData = {
    keywords: [],
    patterns: [],
    synonyms: [],
    fallbacks: [],
    validationRules: [],
    answerStyles: [],
    domainVocab: [],
    examples: [],
    edgeCases: [],
  };

  private isLoaded = false;
  private loadedAt: string = '';
  private version: string = '1.0.0';
  private readonly dataDir: string;
  private readonly logger: any;

  // Indexes for fast lookup
  private keywordsByIntent: Map<string, BrainKeyword[]> = new Map();
  private keywordsByLanguage: Map<LanguageCode, BrainKeyword[]> = new Map();
  private patternsByIntent: Map<string, BrainPattern[]> = new Map();
  private patternsByLanguage: Map<LanguageCode, BrainPattern[]> = new Map();
  private fallbacksByScenario: Map<string, BrainFallback> = new Map();
  private rulesByIntent: Map<string, BrainValidationRule[]> = new Map();
  private stylesByIntent: Map<string, BrainAnswerStyle[]> = new Map();
  private vocabByDomain: Map<string, BrainDomainVocab[]> = new Map();

  constructor(dataDir?: string, logger?: any) {
    this.dataDir = dataDir || resolveDataDir();
    this.logger = logger || console;
  }

  // =============================================================================
  // PUBLIC: INITIALIZATION
  // =============================================================================

  /**
   * Load all brain data from JSON files.
   * Call this once at application startup.
   */
  async load(): Promise<void> {
    if (this.isLoaded) {
      this.logger.warn('[BrainData] Already loaded, skipping');
      return;
    }

    this.logger.info('[BrainData] Loading brain data from:', this.dataDir);

    try {
      // Load all data types in parallel
      await Promise.all([
        this.loadIntentPatterns(),
        this.loadFallbacks(),
        this.loadValidationPolicies(),
        this.loadAnswerStyles(),
        this.loadDomainVocabulary(),
      ]);

      // Build indexes for fast lookup
      this.buildIndexes();

      // Validate data integrity
      this.validateData();

      this.isLoaded = true;
      this.loadedAt = new Date().toISOString();

      const stats = this.getStatistics();
      this.logger.info('[BrainData] Load complete:', {
        keywords: stats.keywords.total,
        patterns: stats.patterns.total,
        fallbacks: stats.fallbacks.total,
        validationRules: stats.validationRules.total,
        answerStyles: stats.answerStyles.total,
        domainVocab: stats.domainVocab.total,
      });

    } catch (error) {
      this.logger.error('[BrainData] Failed to load:', error);
      throw new Error(`BrainDataLoaderService initialization failed: ${error}`);
    }
  }

  // =============================================================================
  // PRIVATE: DATA LOADERS
  // =============================================================================

  /**
   * Load intent patterns from intent_patterns.json
   *
   * CHATGPT PARITY: This method is now a NO-OP.
   * Intent patterns are loaded from intent_patterns.runtime.json by RuntimePatternsService.
   * The 95MB intent_patterns.json was loading data that was NEVER USED.
   *
   * Keeping this method stub for backward compatibility - will be removed in future cleanup.
   */
  private async loadIntentPatterns(): Promise<void> {
    // CHATGPT PARITY: Skip loading the 95MB intent_patterns.json
    // All routing uses RuntimePatternsService with intent_patterns.runtime.json (20KB)
    // getKeywords() and getPatterns() were never called anywhere in the codebase
    this.logger.info('[BrainData] Skipping intent_patterns.json (CHATGPT PARITY: use RuntimePatterns instead)');
    return;

    // DEAD CODE BELOW - kept for reference, will be removed
    /* eslint-disable */
    const filePath = path.join(this.dataDir, 'intent_patterns.json');

    if (!fs.existsSync(filePath)) {
      this.logger.warn('[BrainData] intent_patterns.json not found, skipping');
      return;
    }

    const rawData = fs.readFileSync(filePath, 'utf-8');
    const patternsJson = JSON.parse(rawData);
    /* eslint-enable */

    // Skip metadata fields
    const metaFields = ['version', 'lastUpdated', 'description'];

    for (const [intentName, intentData] of Object.entries(patternsJson)) {
      if (metaFields.includes(intentName)) continue;

      const rawPattern = intentData as any;
      const intentFamily = this.getIntentFamily(intentName);
      const priority = rawPattern.priority || 50;

      // Extract keywords
      if (rawPattern.keywords) {
        for (const [lang, keywords] of Object.entries(rawPattern.keywords)) {
          if (!this.isValidLanguage(lang)) continue;

          for (const keyword of (keywords as string[])) {
            this.data.keywords.push({
              text: keyword.trim(),
              intentFamily,
              intent: intentName as IntentName,
              subIntent: 'default',
              language: lang as LanguageCode,
              priority,
              tags: [],
              variation: 'core',
              weight: 1.0,
            });
          }
        }
      }

      // Extract patterns
      if (rawPattern.patterns) {
        for (const [lang, patterns] of Object.entries(rawPattern.patterns)) {
          if (!this.isValidLanguage(lang)) continue;

          for (const pattern of (patterns as string[])) {
            try {
              const cleanedPattern = this.cleanPatternString(pattern);
              if (!cleanedPattern) continue;

              this.data.patterns.push({
                pattern: cleanedPattern,
                compiledPattern: new RegExp(cleanedPattern, 'i'),
                intentFamily,
                intent: intentName as IntentName,
                subIntent: 'default',
                language: lang as LanguageCode,
                priority,
                tags: [],
                variation: 'question_forms',
                description: rawPattern.description,
              });
            } catch (err) {
              this.logger.warn(`[BrainData] Invalid regex for ${intentName}/${lang}: ${pattern}`);
            }
          }
        }
      }
    }

    // Also load doc_query_synonyms.json if exists
    await this.loadSynonyms();
  }

  /**
   * Load synonyms from doc_query_synonyms.json
   */
  private async loadSynonyms(): Promise<void> {
    const filePath = path.join(this.dataDir, 'doc_query_synonyms.json');

    if (!fs.existsSync(filePath)) {
      return;
    }

    const rawData = fs.readFileSync(filePath, 'utf-8');
    const synonymsJson = JSON.parse(rawData);

    for (const [baseTerm, synonymList] of Object.entries(synonymsJson)) {
      if (!Array.isArray(synonymList)) continue;

      for (const synonym of synonymList) {
        this.data.synonyms.push({
          baseTerm,
          synonym,
          intentFamily: 'documents',
          intent: 'documents' as IntentName,
          subIntent: 'default',
          language: 'en',
          priority: 50,
          tags: ['query_synonym'],
          similarity: 0.8,
        });
      }
    }
  }

  /**
   * Load fallbacks from fallbacks.json
   */
  private async loadFallbacks(): Promise<void> {
    const filePath = path.join(this.dataDir, 'fallbacks.json');

    if (!fs.existsSync(filePath)) {
      this.logger.warn('[BrainData] fallbacks.json not found, skipping');
      return;
    }

    const rawData = fs.readFileSync(filePath, 'utf-8');
    const fallbacksJson = JSON.parse(rawData);

    if (!fallbacksJson.scenarios) return;

    for (const scenario of fallbacksJson.scenarios) {
      const styles = (scenario.styles || []).map((style: any) => ({
        id: style.id,
        maxLength: style.maxLength,
        structure: style.structure,
        tone: style.tone,
        renderHint: style.renderHint,
        templates: this.extractStyleTemplates(style),
      }));

      this.data.fallbacks.push({
        scenarioKey: scenario.key,
        category: scenario.category || 'general',
        description: scenario.description,
        styles,
        intentFamily: 'error',
        intent: 'error' as IntentName,
        subIntent: scenario.key.toLowerCase(),
        language: 'en', // Fallbacks are multilingual internally
        priority: 100,
        tags: [scenario.category || 'general'],
      });
    }
  }

  /**
   * Extract style templates from fallback style definition
   */
  private extractStyleTemplates(style: any): Record<LanguageCode, { template: string; placeholders?: string[] }> {
    const templates: Record<LanguageCode, { template: string; placeholders?: string[] }> = {} as any;

    if (style.languages) {
      for (const [lang, langData] of Object.entries(style.languages)) {
        if (this.isValidLanguage(lang)) {
          const data = langData as any;
          templates[lang as LanguageCode] = {
            template: data.template || '',
            placeholders: data.placeholders,
          };
        }
      }
    }

    return templates;
  }

  /**
   * Load validation policies from validation_policies.json
   */
  private async loadValidationPolicies(): Promise<void> {
    const filePath = path.join(this.dataDir, 'validation_policies.json');

    if (!fs.existsSync(filePath)) {
      this.logger.warn('[BrainData] validation_policies.json not found, skipping');
      return;
    }

    const rawData = fs.readFileSync(filePath, 'utf-8');
    const policiesJson = JSON.parse(rawData);

    if (!policiesJson.policies) return;

    for (const policy of policiesJson.policies) {
      for (const rule of (policy.rules || [])) {
        this.data.validationRules.push({
          id: `${policy.category}_${rule.rule}`.toLowerCase(),
          name: rule.rule,
          description: rule.description,
          intentFamily: 'documents',
          intent: 'documents' as IntentName,
          subIntent: 'default',
          language: 'en',
          priority: rule.severity === 'critical' ? 100 : rule.severity === 'high' ? 80 : 50,
          tags: [policy.category, rule.severity || 'medium'],
          variation: 'required_context',
          rule: {
            type: 'requires',
            condition: rule.description,
            values: rule.guidance ? [rule.guidance] : [],
          },
        });
      }
    }
  }

  /**
   * Load answer styles from answer_styles.json
   */
  private async loadAnswerStyles(): Promise<void> {
    const filePath = path.join(this.dataDir, 'answer_styles.json');

    if (!fs.existsSync(filePath)) {
      this.logger.warn('[BrainData] answer_styles.json not found, skipping');
      return;
    }

    const rawData = fs.readFileSync(filePath, 'utf-8');
    const stylesJson = JSON.parse(rawData);

    // Skip comment fields
    for (const [intentType, styleGroup] of Object.entries(stylesJson)) {
      if (intentType.startsWith('_')) continue;

      for (const [styleName, langStyles] of Object.entries(styleGroup as any)) {
        if (styleName.startsWith('_')) continue;

        for (const [lang, styleData] of Object.entries(langStyles as any)) {
          if (!this.isValidLanguage(lang)) continue;

          const data = styleData as any;
          this.data.answerStyles.push({
            name: styleName,
            title: data.title || styleName,
            description: data.description || '',
            format: data.format || 'markdown',
            template: data.template || '',
            hasSources: data.hasSources || false,
            renderHints: data.renderHints,
            intentFamily: this.getIntentFamily(intentType),
            intent: intentType as IntentName,
            subIntent: styleName.toLowerCase(),
            language: lang as LanguageCode,
            priority: 50,
            tags: [intentType, styleName],
          });
        }
      }
    }
  }

  /**
   * Load domain-specific vocabulary
   */
  private async loadDomainVocabulary(): Promise<void> {
    const domains = ['finance', 'legal', 'medical', 'accounting'];

    for (const domain of domains) {
      const filePath = path.join(this.dataDir, `${domain.toUpperCase()}.json`);

      if (!fs.existsSync(filePath)) {
        continue;
      }

      try {
        const rawData = fs.readFileSync(filePath, 'utf-8');
        const domainJson = JSON.parse(rawData);

        // Extract keywords as domain vocabulary
        if (domainJson.keywords) {
          for (const [lang, keywords] of Object.entries(domainJson.keywords)) {
            if (!this.isValidLanguage(lang)) continue;

            for (const term of (keywords as string[])) {
              this.data.domainVocab.push({
                domain,
                term,
                definition: `${domain} term`,
                intentFamily: 'domain_specialized',
                intent: domain as IntentName,
                subIntent: 'vocabulary',
                language: lang as LanguageCode,
                priority: 70,
                tags: [domain, 'vocabulary'],
              });
            }
          }
        }
      } catch (err) {
        this.logger.warn(`[BrainData] Failed to load ${domain} vocabulary:`, err);
      }
    }
  }

  // =============================================================================
  // PRIVATE: INDEXING & VALIDATION
  // =============================================================================

  /**
   * Build indexes for fast lookup
   */
  private buildIndexes(): void {
    // Index keywords by intent
    for (const kw of this.data.keywords) {
      const key = kw.intent;
      if (!this.keywordsByIntent.has(key)) {
        this.keywordsByIntent.set(key, []);
      }
      this.keywordsByIntent.get(key)!.push(kw);
    }

    // Index keywords by language
    for (const kw of this.data.keywords) {
      if (!this.keywordsByLanguage.has(kw.language)) {
        this.keywordsByLanguage.set(kw.language, []);
      }
      this.keywordsByLanguage.get(kw.language)!.push(kw);
    }

    // Index patterns by intent
    for (const p of this.data.patterns) {
      const key = p.intent;
      if (!this.patternsByIntent.has(key)) {
        this.patternsByIntent.set(key, []);
      }
      this.patternsByIntent.get(key)!.push(p);
    }

    // Index patterns by language
    for (const p of this.data.patterns) {
      if (!this.patternsByLanguage.has(p.language)) {
        this.patternsByLanguage.set(p.language, []);
      }
      this.patternsByLanguage.get(p.language)!.push(p);
    }

    // Index fallbacks by scenario
    for (const fb of this.data.fallbacks) {
      this.fallbacksByScenario.set(fb.scenarioKey, fb);
    }

    // Index rules by intent
    for (const rule of this.data.validationRules) {
      const key = rule.intent;
      if (!this.rulesByIntent.has(key)) {
        this.rulesByIntent.set(key, []);
      }
      this.rulesByIntent.get(key)!.push(rule);
    }

    // Index styles by intent
    for (const style of this.data.answerStyles) {
      const key = style.intent;
      if (!this.stylesByIntent.has(key)) {
        this.stylesByIntent.set(key, []);
      }
      this.stylesByIntent.get(key)!.push(style);
    }

    // Index vocab by domain
    for (const vocab of this.data.domainVocab) {
      if (!this.vocabByDomain.has(vocab.domain)) {
        this.vocabByDomain.set(vocab.domain, []);
      }
      this.vocabByDomain.get(vocab.domain)!.push(vocab);
    }
  }

  /**
   * Validate data integrity
   */
  private validateData(): void {
    const errors: string[] = [];

    // Check we have minimum required data
    if (this.data.keywords.length === 0) {
      errors.push('No keywords loaded');
    }
    if (this.data.patterns.length === 0) {
      errors.push('No patterns loaded');
    }
    if (this.data.fallbacks.length === 0) {
      errors.push('No fallbacks loaded');
    }

    // Check all patterns compile
    for (const p of this.data.patterns) {
      if (!p.compiledPattern) {
        errors.push(`Pattern not compiled: ${p.pattern} (${p.intent}/${p.language})`);
      }
    }

    if (errors.length > 0) {
      this.logger.warn('[BrainData] Validation warnings:', errors);
    }
  }

  // =============================================================================
  // PUBLIC: QUERY METHODS (READ-ONLY ACCESS)
  // =============================================================================

  /**
   * Get all keywords, optionally filtered
   */
  getKeywords(query?: BrainDataQuery): BrainKeyword[] {
    this.ensureLoaded();
    return this.filterData(this.data.keywords, query);
  }

  /**
   * Get keywords for a specific intent
   */
  getKeywordsForIntent(intent: IntentName, language?: LanguageCode): BrainKeyword[] {
    this.ensureLoaded();
    let keywords = this.keywordsByIntent.get(intent) || [];
    if (language) {
      keywords = keywords.filter(k => k.language === language);
    }
    return keywords;
  }

  /**
   * Get all patterns, optionally filtered
   */
  getPatterns(query?: BrainDataQuery): BrainPattern[] {
    this.ensureLoaded();
    return this.filterData(this.data.patterns, query);
  }

  /**
   * Get compiled patterns for a specific intent
   */
  getCompiledPatternsForIntent(intent: IntentName, language?: LanguageCode): RegExp[] {
    this.ensureLoaded();
    let patterns = this.patternsByIntent.get(intent) || [];
    if (language) {
      patterns = patterns.filter(p => p.language === language);
    }
    return patterns.map(p => p.compiledPattern).filter((r): r is RegExp => r !== undefined);
  }

  /**
   * Get all synonyms, optionally filtered
   */
  getSynonyms(query?: BrainDataQuery): BrainSynonym[] {
    this.ensureLoaded();
    return this.filterData(this.data.synonyms, query);
  }

  /**
   * Get fallback for a specific scenario
   */
  getFallback(scenarioKey: string): BrainFallback | undefined {
    this.ensureLoaded();
    return this.fallbacksByScenario.get(scenarioKey);
  }

  /**
   * Get all fallbacks
   */
  getAllFallbacks(): BrainFallback[] {
    this.ensureLoaded();
    return [...this.data.fallbacks];
  }

  /**
   * Get validation rules for a specific intent
   */
  getValidationRulesForIntent(intent: IntentName): BrainValidationRule[] {
    this.ensureLoaded();
    return this.rulesByIntent.get(intent) || [];
  }

  /**
   * Get all validation rules
   */
  getAllValidationRules(): BrainValidationRule[] {
    this.ensureLoaded();
    return [...this.data.validationRules];
  }

  /**
   * Get answer styles for a specific intent and language
   */
  getAnswerStyles(intent: IntentName, language?: LanguageCode): BrainAnswerStyle[] {
    this.ensureLoaded();
    let styles = this.stylesByIntent.get(intent) || [];
    if (language) {
      styles = styles.filter(s => s.language === language);
    }
    return styles;
  }

  /**
   * Get domain vocabulary
   */
  getDomainVocabulary(domain: string): BrainDomainVocab[] {
    this.ensureLoaded();
    return this.vocabByDomain.get(domain) || [];
  }

  /**
   * Get all domain vocabulary
   */
  getAllDomainVocabulary(): BrainDomainVocab[] {
    this.ensureLoaded();
    return [...this.data.domainVocab];
  }

  /**
   * Get examples
   */
  getExamples(query?: BrainDataQuery): BrainExample[] {
    this.ensureLoaded();
    return this.filterData(this.data.examples, query);
  }

  /**
   * Get edge cases
   */
  getEdgeCases(query?: BrainDataQuery): BrainEdgeCase[] {
    this.ensureLoaded();
    return this.filterData(this.data.edgeCases, query);
  }

  /**
   * Get all brain data
   */
  getAllData(): Readonly<BrainData> {
    this.ensureLoaded();
    return this.data;
  }

  /**
   * Get statistics about loaded data
   */
  getStatistics(): BrainDataStats {
    this.ensureLoaded();

    const countByLanguage = (items: Array<{ language: LanguageCode }>): Record<LanguageCode, number> => {
      const counts: Record<LanguageCode, number> = { en: 0, pt: 0, es: 0 };
      for (const item of items) {
        counts[item.language] = (counts[item.language] || 0) + 1;
      }
      return counts;
    };

    const countByIntent = (items: Array<{ intent: IntentName }>): Record<string, number> => {
      const counts: Record<string, number> = {};
      for (const item of items) {
        counts[item.intent] = (counts[item.intent] || 0) + 1;
      }
      return counts;
    };

    const countByField = <T>(items: T[], field: keyof T): Record<string, number> => {
      const counts: Record<string, number> = {};
      for (const item of items) {
        const key = String(item[field]);
        counts[key] = (counts[key] || 0) + 1;
      }
      return counts;
    };

    return {
      keywords: {
        total: this.data.keywords.length,
        byLanguage: countByLanguage(this.data.keywords),
        byIntent: countByIntent(this.data.keywords),
      },
      patterns: {
        total: this.data.patterns.length,
        byLanguage: countByLanguage(this.data.patterns),
        byIntent: countByIntent(this.data.patterns),
      },
      synonyms: {
        total: this.data.synonyms.length,
        byLanguage: countByLanguage(this.data.synonyms),
      },
      fallbacks: {
        total: this.data.fallbacks.length,
        byCategory: countByField(this.data.fallbacks, 'category'),
      },
      validationRules: {
        total: this.data.validationRules.length,
        byIntent: countByIntent(this.data.validationRules),
      },
      answerStyles: {
        total: this.data.answerStyles.length,
        byIntent: countByIntent(this.data.answerStyles),
      },
      domainVocab: {
        total: this.data.domainVocab.length,
        byDomain: countByField(this.data.domainVocab, 'domain'),
      },
      examples: {
        total: this.data.examples.length,
        byIntent: countByIntent(this.data.examples),
        byVariation: countByField(this.data.examples, 'variation'),
      },
      edgeCases: {
        total: this.data.edgeCases.length,
        byIntent: countByIntent(this.data.edgeCases),
      },
      loadedAt: this.loadedAt,
      version: this.version,
    };
  }

  /**
   * Check if data is loaded
   */
  isReady(): boolean {
    return this.isLoaded;
  }

  // =============================================================================
  // PRIVATE: HELPERS
  // =============================================================================

  /**
   * Ensure data is loaded before access
   */
  private ensureLoaded(): void {
    if (!this.isLoaded) {
      throw new Error('BrainDataLoaderService not initialized. Call load() first.');
    }
  }

  /**
   * Filter data by query
   */
  private filterData<T extends { intentFamily: IntentFamily; intent: IntentName; subIntent: string; language: LanguageCode; tags: string[]; priority: number; confidence?: number }>(
    items: T[],
    query?: BrainDataQuery
  ): T[] {
    if (!query) return [...items];

    return items.filter(item => {
      if (query.intentFamily && item.intentFamily !== query.intentFamily) return false;
      if (query.intent && item.intent !== query.intent) return false;
      if (query.subIntent && item.subIntent !== query.subIntent) return false;
      if (query.language && item.language !== query.language) return false;
      if (query.minPriority && item.priority < query.minPriority) return false;
      if (query.minConfidence && (item.confidence || 0) < query.minConfidence) return false;
      if (query.tags && query.tags.length > 0) {
        if (!query.tags.some(tag => item.tags.includes(tag))) return false;
      }
      return true;
    });
  }

  /**
   * Get intent family from intent name
   */
  private getIntentFamily(intentName: string): IntentFamily {
    return INTENT_FAMILY_MAP[intentName] || 'documents';
  }

  /**
   * Check if language code is valid
   */
  private isValidLanguage(code: string): code is LanguageCode {
    return SUPPORTED_LANGUAGES.includes(code as LanguageCode);
  }

  /**
   * Clean pattern string (remove markdown fences, etc.)
   */
  private cleanPatternString(pattern: string): string {
    return pattern
      .replace(/```regex\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const brainDataLoaderService = new BrainDataLoaderService();

export default BrainDataLoaderService;
