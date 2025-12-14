/**
 * Dataset Validator
 * Validates generated datasets against schemas and quality rules
 */

import AjvModule, { ValidateFunction } from 'ajv';
import addFormatsModule from 'ajv-formats';

// Handle ESM default exports
const Ajv = AjvModule.default || AjvModule;
const addFormats = addFormatsModule.default || addFormatsModule;
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
  SUPPORTED_LANGUAGES,
  // V2 schemas
  exampleJsonSchema,
  keywordJsonSchema,
  regexPatternJsonSchema,
  validationRuleJsonSchema,
  Example,
  Keyword,
  RegexPattern,
  ValidationRule,
  ExampleDataset,
  KeywordDataset,
  RegexPatternDataset,
  ValidationRuleDataset,
  INTENT_HIERARCHY,
  IntentName
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private ajv: any;
  private schemaValidators: Map<DatasetType, ValidateFunction>;

  constructor() {
    this.ajv = new Ajv({ allErrors: true, verbose: true });
    addFormats(this.ajv);

    this.schemaValidators = new Map();
    // Legacy validators
    this.schemaValidators.set('patterns', this.ajv.compile(patternJsonSchema));
    this.schemaValidators.set('tests', this.ajv.compile(testJsonSchema));
    this.schemaValidators.set('fallbacks', this.ajv.compile(fallbackJsonSchema));
    // V2 validators
    this.schemaValidators.set('examples', this.ajv.compile(exampleJsonSchema));
    this.schemaValidators.set('keywords', this.ajv.compile(keywordJsonSchema));
    this.schemaValidators.set('regex_patterns', this.ajv.compile(regexPatternJsonSchema));
    this.schemaValidators.set('validation_rules', this.ajv.compile(validationRuleJsonSchema));
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
      // V2 dataset types
      case 'examples': {
        const exampleData = data as ExampleDataset;
        const { cleaned, stats } = this.validateExamples(exampleData.examples || []);
        cleanedData = { ...exampleData, examples: cleaned };
        totalEntries = exampleData.examples?.length || 0;
        validEntries = cleaned.length;
        duplicatesRemoved = stats.duplicates;
        rejectedEntries = stats.rejected;
        warnings.push(...stats.warnings);
        break;
      }
      case 'keywords': {
        const keywordData = data as KeywordDataset;
        const { cleaned, stats } = this.validateKeywords(keywordData.keywords || []);
        cleanedData = { ...keywordData, keywords: cleaned };
        totalEntries = keywordData.keywords?.length || 0;
        validEntries = cleaned.length;
        duplicatesRemoved = stats.duplicates;
        rejectedEntries = stats.rejected;
        warnings.push(...stats.warnings);
        break;
      }
      case 'regex_patterns': {
        const regexData = data as RegexPatternDataset;
        const { cleaned, stats } = this.validateRegexPatterns(regexData.patterns || []);
        cleanedData = { ...regexData, patterns: cleaned };
        totalEntries = regexData.patterns?.length || 0;
        validEntries = cleaned.length;
        duplicatesRemoved = stats.duplicates;
        rejectedEntries = stats.rejected;
        warnings.push(...stats.warnings);
        break;
      }
      case 'validation_rules': {
        const rulesData = data as ValidationRuleDataset;
        const { cleaned, stats } = this.validateValidationRules(rulesData.rules || []);
        cleanedData = { ...rulesData, rules: cleaned };
        totalEntries = rulesData.rules?.length || 0;
        validEntries = cleaned.length;
        duplicatesRemoved = stats.duplicates;
        rejectedEntries = stats.rejected;
        warnings.push(...stats.warnings);
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
   * Validate and clean examples (V2)
   */
  private validateExamples(examples: Example[]): {
    cleaned: Example[];
    stats: { duplicates: number; rejected: number; warnings: ValidationWarning[] };
  } {
    const seen = new Set<string>();
    const cleaned: Example[] = [];
    const warnings: ValidationWarning[] = [];
    let duplicates = 0;
    let rejected = 0;

    const validIntents = Object.keys(INTENT_HIERARCHY);

    for (const example of examples) {
      const key = `${example.language}:${example.intent}:${example.subIntent}:${example.text.toLowerCase()}`;

      // Check for duplicates
      if (seen.has(key)) {
        duplicates++;
        continue;
      }
      seen.add(key);

      // Check minimum length
      if (example.text.length < 3) {
        rejected++;
        warnings.push({
          path: `examples[${examples.indexOf(example)}]`,
          message: `Example too short: "${example.text}"`,
          suggestion: 'Examples should be at least 3 characters'
        });
        continue;
      }

      // Validate intent exists
      if (!validIntents.includes(example.intent)) {
        rejected++;
        warnings.push({
          path: `examples[${examples.indexOf(example)}]`,
          message: `Invalid intent: "${example.intent}"`,
          suggestion: `Valid intents: ${validIntents.join(', ')}`
        });
        continue;
      }

      // Validate sub-intent exists for this intent
      const intentConfig = INTENT_HIERARCHY[example.intent as IntentName];
      if (!(intentConfig.subIntents as readonly string[]).includes(example.subIntent)) {
        rejected++;
        warnings.push({
          path: `examples[${examples.indexOf(example)}]`,
          message: `Invalid sub-intent "${example.subIntent}" for intent "${example.intent}"`,
          suggestion: `Valid sub-intents: ${intentConfig.subIntents.join(', ')}`
        });
        continue;
      }

      cleaned.push(example);
    }

    return { cleaned, stats: { duplicates, rejected, warnings } };
  }

  /**
   * Validate and clean keywords (V2)
   */
  private validateKeywords(keywords: Keyword[]): {
    cleaned: Keyword[];
    stats: { duplicates: number; rejected: number; warnings: ValidationWarning[] };
  } {
    const seen = new Set<string>();
    const cleaned: Keyword[] = [];
    const warnings: ValidationWarning[] = [];
    let duplicates = 0;
    let rejected = 0;

    const validIntents = Object.keys(INTENT_HIERARCHY);

    for (const keyword of keywords) {
      const key = `${keyword.language}:${keyword.intent}:${keyword.subIntent}:${keyword.text.toLowerCase()}`;

      // Check for duplicates
      if (seen.has(key)) {
        duplicates++;
        continue;
      }
      seen.add(key);

      // Check minimum length (keywords can be short)
      if (keyword.text.length < 1) {
        rejected++;
        warnings.push({
          path: `keywords[${keywords.indexOf(keyword)}]`,
          message: `Keyword empty`,
          suggestion: 'Keywords must have at least 1 character'
        });
        continue;
      }

      // Validate intent exists
      if (!validIntents.includes(keyword.intent)) {
        rejected++;
        warnings.push({
          path: `keywords[${keywords.indexOf(keyword)}]`,
          message: `Invalid intent: "${keyword.intent}"`,
          suggestion: `Valid intents: ${validIntents.join(', ')}`
        });
        continue;
      }

      // Validate sub-intent exists for this intent
      const intentConfig = INTENT_HIERARCHY[keyword.intent as IntentName];
      if (!(intentConfig.subIntents as readonly string[]).includes(keyword.subIntent)) {
        rejected++;
        warnings.push({
          path: `keywords[${keywords.indexOf(keyword)}]`,
          message: `Invalid sub-intent "${keyword.subIntent}" for intent "${keyword.intent}"`,
          suggestion: `Valid sub-intents: ${intentConfig.subIntents.join(', ')}`
        });
        continue;
      }

      cleaned.push(keyword);
    }

    return { cleaned, stats: { duplicates, rejected, warnings } };
  }

  /**
   * Validate and clean regex patterns (V2)
   */
  private validateRegexPatterns(patterns: RegexPattern[]): {
    cleaned: RegexPattern[];
    stats: { duplicates: number; rejected: number; warnings: ValidationWarning[] };
  } {
    const seen = new Set<string>();
    const cleaned: RegexPattern[] = [];
    const warnings: ValidationWarning[] = [];
    let duplicates = 0;
    let rejected = 0;

    const validIntents = Object.keys(INTENT_HIERARCHY);

    for (const pattern of patterns) {
      const key = `${pattern.language}:${pattern.intent}:${pattern.subIntent}:${pattern.pattern.toLowerCase()}`;

      // Check for duplicates
      if (seen.has(key)) {
        duplicates++;
        continue;
      }
      seen.add(key);

      // Check minimum length
      if (pattern.pattern.length < 3) {
        rejected++;
        warnings.push({
          path: `patterns[${patterns.indexOf(pattern)}]`,
          message: `Pattern too short: "${pattern.pattern}"`,
          suggestion: 'Patterns should be at least 3 characters'
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

      // Validate intent exists
      if (!validIntents.includes(pattern.intent)) {
        rejected++;
        warnings.push({
          path: `patterns[${patterns.indexOf(pattern)}]`,
          message: `Invalid intent: "${pattern.intent}"`,
          suggestion: `Valid intents: ${validIntents.join(', ')}`
        });
        continue;
      }

      // Validate sub-intent exists for this intent
      const intentConfig = INTENT_HIERARCHY[pattern.intent as IntentName];
      if (!(intentConfig.subIntents as readonly string[]).includes(pattern.subIntent)) {
        rejected++;
        warnings.push({
          path: `patterns[${patterns.indexOf(pattern)}]`,
          message: `Invalid sub-intent "${pattern.subIntent}" for intent "${pattern.intent}"`,
          suggestion: `Valid sub-intents: ${intentConfig.subIntents.join(', ')}`
        });
        continue;
      }

      cleaned.push(pattern);
    }

    return { cleaned, stats: { duplicates, rejected, warnings } };
  }

  /**
   * Validate and clean validation rules (V2)
   */
  private validateValidationRules(rules: ValidationRule[]): {
    cleaned: ValidationRule[];
    stats: { duplicates: number; rejected: number; warnings: ValidationWarning[] };
  } {
    const seen = new Set<string>();
    const cleaned: ValidationRule[] = [];
    const warnings: ValidationWarning[] = [];
    let duplicates = 0;
    let rejected = 0;

    const validIntents = Object.keys(INTENT_HIERARCHY);
    const validRuleTypes = ['requires', 'excludes', 'boost', 'penalize'];

    for (const rule of rules) {
      // Check for duplicate IDs
      if (seen.has(rule.id)) {
        duplicates++;
        warnings.push({
          path: `rules[${rules.indexOf(rule)}]`,
          message: `Duplicate rule ID: "${rule.id}"`,
          suggestion: 'Each rule must have a unique ID'
        });
        continue;
      }
      seen.add(rule.id);

      // Validate rule type
      if (!validRuleTypes.includes(rule.rule.type)) {
        rejected++;
        warnings.push({
          path: `rules[${rules.indexOf(rule)}]`,
          message: `Invalid rule type: "${rule.rule.type}"`,
          suggestion: `Valid types: ${validRuleTypes.join(', ')}`
        });
        continue;
      }

      // Validate modifier for boost/penalize rules
      if (['boost', 'penalize'].includes(rule.rule.type)) {
        if (rule.rule.modifier === undefined) {
          warnings.push({
            path: `rules[${rules.indexOf(rule)}]`,
            message: `Missing modifier for ${rule.rule.type} rule`,
            suggestion: 'boost/penalize rules should have a modifier between -1 and 1'
          });
        } else if (rule.rule.modifier < -1 || rule.rule.modifier > 1) {
          rejected++;
          warnings.push({
            path: `rules[${rules.indexOf(rule)}]`,
            message: `Modifier out of range: ${rule.rule.modifier}`,
            suggestion: 'Modifier must be between -1 and 1'
          });
          continue;
        }
      }

      // Validate intent exists
      if (!validIntents.includes(rule.intent)) {
        rejected++;
        warnings.push({
          path: `rules[${rules.indexOf(rule)}]`,
          message: `Invalid intent: "${rule.intent}"`,
          suggestion: `Valid intents: ${validIntents.join(', ')}`
        });
        continue;
      }

      // Validate sub-intent exists for this intent
      const intentConfig = INTENT_HIERARCHY[rule.intent as IntentName];
      if (!(intentConfig.subIntents as readonly string[]).includes(rule.subIntent)) {
        rejected++;
        warnings.push({
          path: `rules[${rules.indexOf(rule)}]`,
          message: `Invalid sub-intent "${rule.subIntent}" for intent "${rule.intent}"`,
          suggestion: `Valid sub-intents: ${intentConfig.subIntents.join(', ')}`
        });
        continue;
      }

      cleaned.push(rule);
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
