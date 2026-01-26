/**
 * KODA V3 Intent Configuration Service
 *
 * Single source of truth for loading and compiling intent patterns from JSON.
 * Loads patterns ONCE on startup, not per request.
 *
 * IMPORTANT: Uses RUNTIME patterns by default (small, fast).
 * Training patterns are for ML training only, NOT runtime.
 *
 * Config: INTENT_PATTERNS_MODE=runtime|training (default: runtime)
 *
 * Based on: pasted_content_21.txt Layer 3 specifications
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  IntentName,
  LanguageCode,
  CompiledIntentPattern,
  RawIntentPattern,
  IntentDefinitions,
} from '../../types/intentV3.types';

// Runtime limits to prevent memory issues
const MAX_PATTERNS_PER_INTENT_PER_LANG = 10000;  // Increased for generated data
const MAX_KEYWORDS_PER_INTENT_PER_LANG = 20000; // Increased for generated data

export class IntentConfigService {
  private intentDefinitions: IntentDefinitions = {} as IntentDefinitions;
  private isLoaded = false;
  private readonly configPath: string;
  private readonly logger: any;
  private readonly mode: 'runtime' | 'training';

  constructor(
    configPath?: string,
    logger?: any
  ) {
    // Determine mode from environment
    this.mode = (process.env.INTENT_PATTERNS_MODE as 'runtime' | 'training') || 'runtime';

    // BANK-DRIVEN: Config files have moved to data_banks/routing/
    // Select config file based on mode
    if (configPath) {
      this.configPath = configPath;
    } else if (this.mode === 'training') {
      this.configPath = path.join(__dirname, '../../data_banks/routing/intent_patterns.training.backup.any.json');
    } else {
      // Default: use main intent_patterns.any.json which has the intents section
      this.configPath = path.join(__dirname, '../../data_banks/routing/intent_patterns.any.json');
    }

    this.logger = logger || console;
  }

  /**
   * Load and compile all intent patterns from JSON
   * Call this once on application startup
   */
  async loadPatterns(): Promise<void> {
    if (this.isLoaded) {
      this.logger.warn('[IntentConfig] Patterns already loaded, skipping');
      return;
    }

    try {
      this.logger.info(`[IntentConfig] Mode: ${this.mode.toUpperCase()}`);
      this.logger.info('[IntentConfig] Loading intent patterns from:', this.configPath);

      // Read JSON file
      const rawData = fs.readFileSync(this.configPath, 'utf-8');
      const parsedJson = JSON.parse(rawData);

      // Support both flat structure and nested { intents: { ... } } structure
      const intentsData = parsedJson.intents || parsedJson;

      // Transform from new format (objects with keyword/tier/layer) to old format (string arrays)
      const patternsJson: Record<string, RawIntentPattern> = {};
      for (const [intentName, intentData] of Object.entries(intentsData)) {
        const data = intentData as any;
        const transformed: RawIntentPattern = {
          keywords: {},
          patterns: {},
          priority: data.priority || 50,
          description: data.description,
        };

        // Extract keyword strings from keyword objects
        if (data.keywords) {
          for (const [lang, keywordList] of Object.entries(data.keywords)) {
            const list = keywordList as any[];
            if (Array.isArray(list)) {
              transformed.keywords[lang] = list.map((k: any) =>
                typeof k === 'string' ? k : (k.keyword || k.k || '')
              ).filter(Boolean);
            }
          }
        }

        // Extract patterns if they exist
        if (data.patterns) {
          for (const [lang, patternList] of Object.entries(data.patterns)) {
            const list = patternList as any[];
            if (Array.isArray(list)) {
              transformed.patterns[lang] = list.map((p: any) =>
                typeof p === 'string' ? p : (p.pattern || p.p || '')
              ).filter(Boolean);
            }
          }
        }

        // Extract NEGATIVE patterns (patterns that EXCLUDE this intent)
        if (data.negatives) {
          transformed.negatives = {};
          for (const [lang, negList] of Object.entries(data.negatives)) {
            const list = negList as any[];
            if (Array.isArray(list)) {
              transformed.negatives[lang] = list.map((n: any) =>
                typeof n === 'string' ? n : (n.pattern || n.p || '')
              ).filter(Boolean);
            }
          }
        }

        patternsJson[intentName] = transformed;
      }

      // Validate and compile each intent
      let successCount = 0;
      let failCount = 0;

      for (const [intentNameRaw, rawPattern] of Object.entries(patternsJson)) {
        try {
          // Normalize intent name to lowercase (JSON may have UPPERCASE)
          const intentName = intentNameRaw.toLowerCase();

          // Validate intent name
          if (!this.isValidIntentName(intentName)) {
            this.logger.warn(`[IntentConfig] Unknown intent name: ${intentName}, skipping`);
            failCount++;
            continue;
          }

          // Compile pattern
          const compiled = this.compilePattern(intentName as IntentName, rawPattern);
          this.intentDefinitions[intentName as IntentName] = compiled;
          successCount++;

        } catch (error) {
          this.logger.error(`[IntentConfig] Failed to compile pattern for ${intentNameRaw}:`, error);
          failCount++;
        }
      }

      this.isLoaded = true;
      this.logger.info(`[IntentConfig] Loaded ${successCount} intent patterns (${failCount} failed)`);

      // Validate all expected intents are present
      this.validateCoverage();

    } catch (error) {
      this.logger.error('[IntentConfig] Failed to load intent patterns:', error);
      throw new Error('Failed to initialize intent configuration');
    }
  }

  /**
   * Compile a single intent pattern from raw JSON to internal structure.
   * ENFORCES RUNTIME LIMITS to prevent memory issues.
   */
  private compilePattern(
    intentName: IntentName,
    rawPattern: RawIntentPattern
  ): CompiledIntentPattern {
    const compiled: CompiledIntentPattern = {
      name: intentName,
      keywordsByLang: {} as Record<LanguageCode, string[]>,
      patternsByLang: {} as Record<LanguageCode, RegExp[]>,
      negativesByLang: {} as Record<LanguageCode, RegExp[]>,
      priority: rawPattern.priority || 50,
      description: rawPattern.description,
    };

    // Process keywords for each language WITH LIMITS
    for (const [lang, keywords] of Object.entries(rawPattern.keywords || {})) {
      if (this.isValidLanguageCode(lang)) {
        // Clean keywords: trim, remove empty strings, deduplicate
        let cleanedKeywords = Array.from(
          new Set(
            keywords
              .map(k => k.trim())
              .filter(k => k.length > 0)
          )
        );

        // ENFORCE LIMIT: Max keywords per intent per language
        if (cleanedKeywords.length > MAX_KEYWORDS_PER_INTENT_PER_LANG) {
          if (this.mode === 'runtime') {
            throw new Error(
              `[IntentConfig] RUNTIME LIMIT EXCEEDED: Intent "${intentName}" has ${cleanedKeywords.length} keywords for ${lang}. ` +
              `Max allowed: ${MAX_KEYWORDS_PER_INTENT_PER_LANG}. Use training file for ML training.`
            );
          }
          // In training mode, just truncate with warning
          this.logger.warn(
            `[IntentConfig] Truncating keywords for ${intentName}/${lang}: ${cleanedKeywords.length} → ${MAX_KEYWORDS_PER_INTENT_PER_LANG}`
          );
          cleanedKeywords = cleanedKeywords.slice(0, MAX_KEYWORDS_PER_INTENT_PER_LANG);
        }

        compiled.keywordsByLang[lang as LanguageCode] = cleanedKeywords;
      }
    }

    // Process regex patterns for each language WITH LIMITS
    for (const [lang, patterns] of Object.entries(rawPattern.patterns || {})) {
      if (this.isValidLanguageCode(lang)) {
        // ENFORCE LIMIT: Check pattern count BEFORE compilation
        if (patterns.length > MAX_PATTERNS_PER_INTENT_PER_LANG && this.mode === 'runtime') {
          throw new Error(
            `[IntentConfig] RUNTIME LIMIT EXCEEDED: Intent "${intentName}" has ${patterns.length} patterns for ${lang}. ` +
            `Max allowed: ${MAX_PATTERNS_PER_INTENT_PER_LANG}. Use training file for ML training.`
          );
        }

        const compiledPatterns: RegExp[] = [];
        const patternsToCompile = this.mode === 'runtime'
          ? patterns.slice(0, MAX_PATTERNS_PER_INTENT_PER_LANG)
          : patterns;

        for (let patternStr of patternsToCompile) {
          try {
            // Clean pattern string
            patternStr = this.cleanPatternString(patternStr);

            if (patternStr.length === 0) {
              continue;
            }

            // Compile with case-insensitive flag
            const regex = new RegExp(patternStr, 'i');
            compiledPatterns.push(regex);

          } catch (error) {
            this.logger.warn(
              `[IntentConfig] Failed to compile regex for ${intentName}/${lang}: "${patternStr}"`,
              error
            );
            // Skip this pattern but continue with others
          }
        }

        compiled.patternsByLang[lang as LanguageCode] = compiledPatterns;
      }
    }

    // Process NEGATIVE patterns for each language (patterns that EXCLUDE this intent)
    for (const [lang, negativePatterns] of Object.entries(rawPattern.negatives || {})) {
      if (this.isValidLanguageCode(lang)) {
        const compiledNegatives: RegExp[] = [];

        for (let patternStr of negativePatterns) {
          try {
            patternStr = this.cleanPatternString(patternStr);
            if (patternStr.length === 0) continue;

            const regex = new RegExp(patternStr, 'i');
            compiledNegatives.push(regex);
          } catch (error) {
            this.logger.warn(
              `[IntentConfig] Failed to compile negative regex for ${intentName}/${lang}: "${patternStr}"`,
              error
            );
          }
        }

        compiled.negativesByLang[lang as LanguageCode] = compiledNegatives;
      }
    }

    return compiled;
  }

  /**
   * Clean pattern string by removing markdown fences and extra whitespace
   * Handles cases like: ```regex\n^pattern\n```
   */
  private cleanPatternString(pattern: string): string {
    // Remove markdown code fences
    pattern = pattern.replace(/```regex\s*/g, '');
    pattern = pattern.replace(/```\s*/g, '');

    // Trim whitespace
    pattern = pattern.trim();

    // Remove trailing spaces inside pattern (but preserve intentional spaces in regex)
    // Only trim start/end, not internal spaces which might be part of the pattern

    return pattern;
  }

  /**
   * Validate that we have patterns for critical intents
   */
  private validateCoverage(): void {
    const criticalIntents: IntentName[] = [
      'documents',
      'help',
      'conversation',
      'error',
    ];

    const missing: string[] = [];
    for (const intent of criticalIntents) {
      if (!this.intentDefinitions[intent]) {
        missing.push(intent);
      }
    }

    if (missing.length > 0) {
      this.logger.warn(
        `[IntentConfig] Missing patterns for critical intents: ${missing.join(', ')}`
      );
    }
  }

  /**
   * Get compiled pattern for a specific intent
   */
  getPattern(intentName: IntentName): CompiledIntentPattern | undefined {
    return this.intentDefinitions[intentName];
  }

  /**
   * Get all compiled patterns
   */
  getAllPatterns(): IntentDefinitions {
    return this.intentDefinitions;
  }

  /**
   * Get keywords for a specific intent and language
   */
  getKeywords(intentName: IntentName, language: LanguageCode): string[] {
    const pattern = this.intentDefinitions[intentName];
    if (!pattern) return [];

    // Try requested language first, fallback to English
    return pattern.keywordsByLang[language] || pattern.keywordsByLang['en'] || [];
  }

  /**
   * Get regex patterns for a specific intent and language
   */
  getRegexPatterns(intentName: IntentName, language: LanguageCode): RegExp[] {
    const pattern = this.intentDefinitions[intentName];
    if (!pattern) return [];

    // Try requested language first, fallback to English
    return pattern.patternsByLang[language] || pattern.patternsByLang['en'] || [];
  }

  /**
   * Get NEGATIVE patterns for a specific intent and language
   * These patterns EXCLUDE the intent if they match
   */
  getNegativePatterns(intentName: IntentName, language: LanguageCode): RegExp[] {
    const pattern = this.intentDefinitions[intentName];
    if (!pattern) return [];

    // Try requested language first, fallback to English
    return pattern.negativesByLang?.[language] || pattern.negativesByLang?.['en'] || [];
  }

  /**
   * Check if a string is a valid IntentName
   */
  private isValidIntentName(name: string): boolean {
    const validIntents: IntentName[] = [
      // Core intents
      'documents',
      'help',
      'conversation',
      'edit',
      'reasoning',
      'memory',
      'error',
      'preferences',
      'extraction',
      'file_actions',
      'doc_stats',       // Document statistics (page count, slide count, sheet count)
      // Domain-specific intents
      'excel',
      'accounting',
      'engineering',
      'finance',
      'legal',
      'medical',
    ];

    return validIntents.includes(name as IntentName);
  }

  /**
   * Check if a string is a valid LanguageCode
   */
  private isValidLanguageCode(code: string): boolean {
    return ['en', 'pt', 'es'].includes(code);
  }

  /**
   * Normalize language code (e.g., pt-BR → pt)
   */
  static normalizeLanguageCode(code: string): LanguageCode {
    const normalized = code.toLowerCase().split('-')[0];

    if (normalized === 'pt' || normalized === 'es' || normalized === 'en') {
      return normalized as LanguageCode;
    }

    // Default to English for unknown languages
    return 'en';
  }

  /**
   * Get statistics about loaded patterns
   */
  getStatistics(): {
    totalIntents: number;
    totalKeywords: number;
    totalPatterns: number;
    byLanguage: Record<LanguageCode, { keywords: number; patterns: number }>;
  } {
    const stats = {
      totalIntents: Object.keys(this.intentDefinitions).length,
      totalKeywords: 0,
      totalPatterns: 0,
      byLanguage: {
        en: { keywords: 0, patterns: 0 },
        pt: { keywords: 0, patterns: 0 },
        es: { keywords: 0, patterns: 0 },
      } as Record<LanguageCode, { keywords: number; patterns: number }>,
    };

    for (const pattern of Object.values(this.intentDefinitions)) {
      for (const [lang, keywords] of Object.entries(pattern.keywordsByLang)) {
        const langCode = lang as LanguageCode;
        stats.byLanguage[langCode].keywords += keywords.length;
        stats.totalKeywords += keywords.length;
      }

      for (const [lang, patterns] of Object.entries(pattern.patternsByLang)) {
        const langCode = lang as LanguageCode;
        stats.byLanguage[langCode].patterns += patterns.length;
        stats.totalPatterns += patterns.length;
      }
    }

    return stats;
  }

  /**
   * Check if patterns are loaded
   */
  isReady(): boolean {
    return this.isLoaded;
  }
}

// Singleton instance for direct import (loaded in server.ts before container init)
export const intentConfigService = new IntentConfigService();

// Export class for DI registration
export default IntentConfigService;
