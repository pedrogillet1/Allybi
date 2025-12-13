/**
 * Dataset Validator
 * Validates generated datasets against schemas and quality rules
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import {
  patternJsonSchema,
  testJsonSchema,
  fallbackJsonSchema,
  IntentPattern,
  ClassificationTest,
  PatternDataset,
  TestDataset,
  FallbackDataset,
  DatasetType,
  SUPPORTED_INTENTS,
  PATTERN_CATEGORIES,
  SUPPORTED_LANGUAGES
} from '../schemas/index.js';

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  stats: {
    totalEntries: number;
    validEntries: number;
    duplicatesRemoved: number;
    rejectedEntries: number;
  };
  cleanedData?: unknown;
}

export interface ValidationError {
  path: string;
  message: string;
  value?: unknown;
}

export interface ValidationWarning {
  path: string;
  message: string;
  suggestion?: string;
}

// Patterns that indicate PRODUCT_HELP (should be rejected for doc intents)
const PRODUCT_HELP_INDICATORS = [
  /how (do i|can i|to) (upload|use|start|begin|sign|log)/i,
  /what (is|does) koda/i,
  /(help|guide|tutorial|instructions)/i,
  /how (does|do) (this|it|the app) work/i,
  /getting started/i,
  /create (an |)account/i,
  /subscription|pricing|plan/i,
  /(feature|setting|preference)s? (of|in) (koda|the app)/i
];

// Patterns that indicate AMBIGUOUS (too vague)
const AMBIGUOUS_INDICATORS = [
  /^(hi|hello|hey|oi|hola|olá)$/i,
  /^(help|ajuda|ayuda)$/i,
  /^(yes|no|ok|sim|não|sí|no|vale)$/i,
  /^(what|o que|qué)\??$/i,
  /^(thanks|thank you|obrigado|gracias)$/i
];

// Minimum pattern/query length
const MIN_PATTERN_LENGTH = 5;
const MIN_QUERY_LENGTH = 8;

export class DatasetValidator {
  private ajv: Ajv;
  private schemaValidators: Map<DatasetType, Ajv['compile']>;

  constructor() {
    this.ajv = new Ajv({ allErrors: true, verbose: true });
    addFormats(this.ajv);

    this.schemaValidators = new Map();
    this.schemaValidators.set('patterns', this.ajv.compile(patternJsonSchema));
    this.schemaValidators.set('tests', this.ajv.compile(testJsonSchema));
    this.schemaValidators.set('fallbacks', this.ajv.compile(fallbackJsonSchema));
  }

  /**
   * Validate a dataset against its schema and quality rules
   */
  validate(data: unknown, type: DatasetType): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let duplicatesRemoved = 0;
    let rejectedEntries = 0;

    // Schema validation
    const schemaValidator = this.schemaValidators.get(type);
    if (!schemaValidator) {
      return {
        valid: false,
        errors: [{ path: '', message: `Unknown dataset type: ${type}` }],
        warnings: [],
        stats: { totalEntries: 0, validEntries: 0, duplicatesRemoved: 0, rejectedEntries: 0 }
      };
    }

    const isSchemaValid = schemaValidator(data);
    if (!isSchemaValid && schemaValidator.errors) {
      for (const err of schemaValidator.errors) {
        errors.push({
          path: err.instancePath || '/',
          message: err.message || 'Schema validation failed',
          value: err.data
        });
      }
    }

    // Type-specific validation
    let cleanedData: unknown;
    let totalEntries = 0;
    let validEntries = 0;

    switch (type) {
      case 'patterns': {
        const patternData = data as PatternDataset;
        const { cleaned, stats } = this.validatePatterns(patternData.patterns || []);
        cleanedData = { ...patternData, patterns: cleaned };
        totalEntries = patternData.patterns?.length || 0;
        validEntries = cleaned.length;
        duplicatesRemoved = stats.duplicates;
        rejectedEntries = stats.rejected;
        warnings.push(...stats.warnings);
        break;
      }
      case 'tests': {
        const testData = data as TestDataset;
        const { cleaned, stats } = this.validateTests(testData.tests || []);
        cleanedData = { ...testData, tests: cleaned };
        totalEntries = testData.tests?.length || 0;
        validEntries = cleaned.length;
        duplicatesRemoved = stats.duplicates;
        rejectedEntries = stats.rejected;
        warnings.push(...stats.warnings);
        break;
      }
      case 'fallbacks': {
        const fallbackData = data as FallbackDataset;
        cleanedData = fallbackData;
        totalEntries = fallbackData.fallbacks?.length || 0;
        validEntries = totalEntries;
        break;
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      stats: {
        totalEntries,
        validEntries,
        duplicatesRemoved,
        rejectedEntries
      },
      cleanedData
    };
  }

  /**
   * Validate and clean patterns
   */
  private validatePatterns(patterns: IntentPattern[]): {
    cleaned: IntentPattern[];
    stats: { duplicates: number; rejected: number; warnings: ValidationWarning[] };
  } {
    const seen = new Set<string>();
    const cleaned: IntentPattern[] = [];
    const warnings: ValidationWarning[] = [];
    let duplicates = 0;
    let rejected = 0;

    for (const pattern of patterns) {
      const key = `${pattern.language}:${pattern.intent}:${pattern.pattern.toLowerCase()}`;

      // Check for duplicates
      if (seen.has(key)) {
        duplicates++;
        continue;
      }
      seen.add(key);

      // Check minimum length
      if (pattern.pattern.length < MIN_PATTERN_LENGTH) {
        rejected++;
        warnings.push({
          path: `patterns[${patterns.indexOf(pattern)}]`,
          message: `Pattern too short: "${pattern.pattern}"`,
          suggestion: 'Patterns should be at least 5 characters'
        });
        continue;
      }

      // Check for PRODUCT_HELP indicators (reject for doc intents)
      if (this.isProductHelpPattern(pattern.pattern)) {
        rejected++;
        warnings.push({
          path: `patterns[${patterns.indexOf(pattern)}]`,
          message: `Pattern looks like PRODUCT_HELP: "${pattern.pattern}"`,
          suggestion: 'Patterns should be document-related, not app usage'
        });
        continue;
      }

      // Check for AMBIGUOUS indicators
      if (this.isAmbiguousPattern(pattern.pattern)) {
        rejected++;
        warnings.push({
          path: `patterns[${patterns.indexOf(pattern)}]`,
          message: `Pattern too ambiguous: "${pattern.pattern}"`,
          suggestion: 'Patterns should be specific and document-related'
        });
        continue;
      }

      // Validate regex syntax
      try {
        new RegExp(pattern.pattern, 'i');
      } catch {
        rejected++;
        warnings.push({
          path: `patterns[${patterns.indexOf(pattern)}]`,
          message: `Invalid regex: "${pattern.pattern}"`,
          suggestion: 'Ensure pattern is valid regex syntax'
        });
        continue;
      }

      cleaned.push(pattern);
    }

    return { cleaned, stats: { duplicates, rejected, warnings } };
  }

  /**
   * Validate and clean test cases
   */
  private validateTests(tests: ClassificationTest[]): {
    cleaned: ClassificationTest[];
    stats: { duplicates: number; rejected: number; warnings: ValidationWarning[] };
  } {
    const seen = new Set<string>();
    const cleaned: ClassificationTest[] = [];
    const warnings: ValidationWarning[] = [];
    let duplicates = 0;
    let rejected = 0;

    for (const test of tests) {
      const key = `${test.language}:${test.query.toLowerCase()}`;

      // Check for duplicates
      if (seen.has(key)) {
        duplicates++;
        continue;
      }
      seen.add(key);

      // Check minimum length
      if (test.query.length < MIN_QUERY_LENGTH) {
        rejected++;
        warnings.push({
          path: `tests[${tests.indexOf(test)}]`,
          message: `Query too short: "${test.query}"`,
          suggestion: 'Test queries should be at least 8 characters'
        });
        continue;
      }

      // Check for PRODUCT_HELP queries
      if (this.isProductHelpPattern(test.query)) {
        rejected++;
        warnings.push({
          path: `tests[${tests.indexOf(test)}]`,
          message: `Query looks like PRODUCT_HELP: "${test.query}"`,
          suggestion: 'Test queries should be document-related'
        });
        continue;
      }

      // Check for AMBIGUOUS queries
      if (this.isAmbiguousPattern(test.query)) {
        rejected++;
        warnings.push({
          path: `tests[${tests.indexOf(test)}]`,
          message: `Query too ambiguous: "${test.query}"`,
          suggestion: 'Test queries should be specific and realistic'
        });
        continue;
      }

      cleaned.push(test);
    }

    return { cleaned, stats: { duplicates, rejected, warnings } };
  }

  /**
   * Check if pattern/query indicates PRODUCT_HELP
   */
  private isProductHelpPattern(text: string): boolean {
    return PRODUCT_HELP_INDICATORS.some(regex => regex.test(text));
  }

  /**
   * Check if pattern/query is too ambiguous
   */
  private isAmbiguousPattern(text: string): boolean {
    return AMBIGUOUS_INDICATORS.some(regex => regex.test(text.trim()));
  }

  /**
   * Calculate diversity score for a dataset
   */
  calculateDiversityScore(patterns: IntentPattern[]): {
    score: number;
    breakdown: {
      languageDistribution: Record<string, number>;
      intentDistribution: Record<string, number>;
      categoryDistribution: Record<string, number>;
    };
  } {
    const languageCounts: Record<string, number> = {};
    const intentCounts: Record<string, number> = {};
    const categoryCounts: Record<string, number> = {};

    for (const pattern of patterns) {
      languageCounts[pattern.language] = (languageCounts[pattern.language] || 0) + 1;
      intentCounts[pattern.intent] = (intentCounts[pattern.intent] || 0) + 1;
      categoryCounts[pattern.category] = (categoryCounts[pattern.category] || 0) + 1;
    }

    // Calculate entropy-based diversity score
    const total = patterns.length;
    const langEntropy = this.calculateEntropy(Object.values(languageCounts), total);
    const intentEntropy = this.calculateEntropy(Object.values(intentCounts), total);
    const catEntropy = this.calculateEntropy(Object.values(categoryCounts), total);

    // Normalize by max possible entropy
    const maxLangEntropy = Math.log2(SUPPORTED_LANGUAGES.length);
    const maxIntentEntropy = Math.log2(SUPPORTED_INTENTS.length);
    const maxCatEntropy = Math.log2(PATTERN_CATEGORIES.length);

    const score = (
      (langEntropy / maxLangEntropy) +
      (intentEntropy / maxIntentEntropy) +
      (catEntropy / maxCatEntropy)
    ) / 3;

    return {
      score,
      breakdown: {
        languageDistribution: languageCounts,
        intentDistribution: intentCounts,
        categoryDistribution: categoryCounts
      }
    };
  }

  private calculateEntropy(counts: number[], total: number): number {
    if (total === 0) return 0;
    return counts.reduce((entropy, count) => {
      if (count === 0) return entropy;
      const p = count / total;
      return entropy - p * Math.log2(p);
    }, 0);
  }
}
