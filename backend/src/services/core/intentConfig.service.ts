/**
 * KODA V3 Intent Configuration Service
 *
 * Single source of truth for loading and compiling intent patterns from JSON.
 * Loads patterns ONCE on startup, not per request.
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

export class IntentConfigService {
  private intentDefinitions: IntentDefinitions = {} as IntentDefinitions;
  private isLoaded = false;
  private readonly configPath: string;
  private readonly logger: any;

  constructor(
    configPath: string = path.join(__dirname, '../../data/intent_patterns.json'),
    logger?: any
  ) {
    this.configPath = configPath;
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
      this.logger.info('[IntentConfig] Loading intent patterns from:', this.configPath);

      // Read JSON file
      const rawData = fs.readFileSync(this.configPath, 'utf-8');
      const patternsJson: Record<string, RawIntentPattern> = JSON.parse(rawData);

      // Validate and compile each intent
      let successCount = 0;
      let failCount = 0;

      for (const [intentName, rawPattern] of Object.entries(patternsJson)) {
        try {
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
          this.logger.error(`[IntentConfig] Failed to compile pattern for ${intentName}:`, error);
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
   * Compile a single intent pattern from raw JSON to internal structure
   */
  private compilePattern(
    intentName: IntentName,
    rawPattern: RawIntentPattern
  ): CompiledIntentPattern {
    const compiled: CompiledIntentPattern = {
      name: intentName,
      keywordsByLang: {} as Record<LanguageCode, string[]>,
      patternsByLang: {} as Record<LanguageCode, RegExp[]>,
      priority: rawPattern.priority || 50,
      description: rawPattern.description,
    };

    // Process keywords for each language
    for (const [lang, keywords] of Object.entries(rawPattern.keywords || {})) {
      if (this.isValidLanguageCode(lang)) {
        // Clean keywords: trim, remove empty strings, deduplicate
        const cleanedKeywords = Array.from(
          new Set(
            keywords
              .map(k => k.trim())
              .filter(k => k.length > 0)
          )
        );
        compiled.keywordsByLang[lang as LanguageCode] = cleanedKeywords;
      }
    }

    // Process regex patterns for each language
    for (const [lang, patterns] of Object.entries(rawPattern.patterns || {})) {
      if (this.isValidLanguageCode(lang)) {
        const compiledPatterns: RegExp[] = [];

        for (let patternStr of patterns) {
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
