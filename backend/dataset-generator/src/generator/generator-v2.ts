/**
 * Dataset Generator V2
 * Batch generation by intent for efficient API usage
 */

import { ClaudeClient, GenerationResult } from './claude-client.js';
import {
  LanguageCode,
  SUPPORTED_LANGUAGES,
  IntentName,
  ALL_INTENTS,
  INTENT_HIERARCHY,
  GENERATION_TARGETS,
  Example,
  ExampleDataset,
  Keyword,
  KeywordDataset,
  RegexPattern,
  RegexPatternDataset,
  ValidationRule,
  ValidationRuleDataset
} from '../schemas/index.js';
import {
  buildExamplesPrompt,
  buildBatchExamplesPrompt
} from '../prompts/examples.prompt.js';
import {
  buildKeywordsPrompt,
  buildBatchKeywordsPrompt
} from '../prompts/keywords.prompt.js';
import {
  buildRegexPatternsPrompt,
  buildBatchRegexPatternsPrompt
} from '../prompts/regex-patterns.prompt.js';
import {
  buildValidationRulesPrompt,
  buildBatchValidationRulesPrompt
} from '../prompts/validation-rules.prompt.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// =============================================================================
// TYPES
// =============================================================================

export type GenerationType = 'examples' | 'keywords' | 'patterns' | 'validation_rules';

export interface GeneratorV2Config {
  outputDir: string;
  batchId?: string;
  languages?: LanguageCode[];
  intents?: IntentName[];
  targets?: {
    examples?: number;
    keywords?: number;
    patterns?: number;
    validationRules?: number;
  };
}

export interface GenerationProgress {
  intent: IntentName;
  subIntent: string;
  type: GenerationType;
  language?: LanguageCode;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  count?: number;
  error?: string;
}

export interface BatchGenerationStats {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalEntries: number;
  tokensUsed: { input: number; output: number };
  duration: number;
  entriesByType: Record<GenerationType, number>;
}

// =============================================================================
// GENERATOR V2
// =============================================================================

export class DatasetGeneratorV2 {
  private client: ClaudeClient;
  private config: GeneratorV2Config;
  private batchId: string;

  constructor(client: ClaudeClient, config: GeneratorV2Config) {
    this.client = client;
    this.config = {
      languages: [...SUPPORTED_LANGUAGES],
      intents: [...ALL_INTENTS],
      targets: {
        examples: GENERATION_TARGETS.examples.default,
        keywords: GENERATION_TARGETS.keywords.default,
        patterns: GENERATION_TARGETS.patterns.default,
        validationRules: GENERATION_TARGETS.validationRules.default
      },
      ...config
    };
    this.batchId = config.batchId || `v2_batch_${Date.now()}`;
  }

  // ===========================================================================
  // MAIN GENERATION METHODS
  // ===========================================================================

  /**
   * Generate all data for a single intent (all sub-intents, all languages, all types)
   */
  async generateForIntent(
    intent: IntentName,
    onProgress?: (progress: GenerationProgress) => void
  ): Promise<{
    examples: Example[];
    keywords: Keyword[];
    patterns: RegexPattern[];
    validationRules: ValidationRule[];
    stats: BatchGenerationStats;
  }> {
    const startTime = Date.now();
    const subIntents = [...INTENT_HIERARCHY[intent].subIntents];
    const { languages, targets } = this.config;

    const allExamples: Example[] = [];
    const allKeywords: Keyword[] = [];
    const allPatterns: RegexPattern[] = [];
    const allValidationRules: ValidationRule[] = [];

    let completedTasks = 0;
    let failedTasks = 0;
    let inputTokens = 0;
    let outputTokens = 0;

    // Calculate total tasks
    const totalTasks = subIntents.length * (
      languages!.length * 3 + // examples, keywords, patterns per language
      1 // validation rules (language-independent)
    );

    // Generate for each sub-intent
    for (const subIntent of subIntents) {
      // Generate examples for each language
      for (const language of languages!) {
        onProgress?.({
          intent, subIntent, type: 'examples', language,
          status: 'in_progress'
        });

        const examplesResult = await this.generateExamples(
          intent, subIntent, language, targets!.examples!
        );

        if (examplesResult.success && examplesResult.examples) {
          allExamples.push(...examplesResult.examples);
          completedTasks++;
          onProgress?.({
            intent, subIntent, type: 'examples', language,
            status: 'completed', count: examplesResult.examples.length
          });
        } else {
          failedTasks++;
          onProgress?.({
            intent, subIntent, type: 'examples', language,
            status: 'failed', error: examplesResult.error
          });
        }

        if (examplesResult.usage) {
          inputTokens += examplesResult.usage.inputTokens;
          outputTokens += examplesResult.usage.outputTokens;
        }

        await this.rateLimitDelay();
      }

      // Generate keywords for each language
      for (const language of languages!) {
        onProgress?.({
          intent, subIntent, type: 'keywords', language,
          status: 'in_progress'
        });

        const keywordsResult = await this.generateKeywords(
          intent, subIntent, language, targets!.keywords!
        );

        if (keywordsResult.success && keywordsResult.keywords) {
          allKeywords.push(...keywordsResult.keywords);
          completedTasks++;
          onProgress?.({
            intent, subIntent, type: 'keywords', language,
            status: 'completed', count: keywordsResult.keywords.length
          });
        } else {
          failedTasks++;
          onProgress?.({
            intent, subIntent, type: 'keywords', language,
            status: 'failed', error: keywordsResult.error
          });
        }

        if (keywordsResult.usage) {
          inputTokens += keywordsResult.usage.inputTokens;
          outputTokens += keywordsResult.usage.outputTokens;
        }

        await this.rateLimitDelay();
      }

      // Generate patterns for each language
      for (const language of languages!) {
        onProgress?.({
          intent, subIntent, type: 'patterns', language,
          status: 'in_progress'
        });

        const patternsResult = await this.generatePatterns(
          intent, subIntent, language, targets!.patterns!
        );

        if (patternsResult.success && patternsResult.patterns) {
          allPatterns.push(...patternsResult.patterns);
          completedTasks++;
          onProgress?.({
            intent, subIntent, type: 'patterns', language,
            status: 'completed', count: patternsResult.patterns.length
          });
        } else {
          failedTasks++;
          onProgress?.({
            intent, subIntent, type: 'patterns', language,
            status: 'failed', error: patternsResult.error
          });
        }

        if (patternsResult.usage) {
          inputTokens += patternsResult.usage.inputTokens;
          outputTokens += patternsResult.usage.outputTokens;
        }

        await this.rateLimitDelay();
      }

      // Generate validation rules (language-independent)
      onProgress?.({
        intent, subIntent, type: 'validation_rules',
        status: 'in_progress'
      });

      const rulesResult = await this.generateValidationRules(
        intent, subIntent, targets!.validationRules!
      );

      if (rulesResult.success && rulesResult.rules) {
        allValidationRules.push(...rulesResult.rules);
        completedTasks++;
        onProgress?.({
          intent, subIntent, type: 'validation_rules',
          status: 'completed', count: rulesResult.rules.length
        });
      } else {
        failedTasks++;
        onProgress?.({
          intent, subIntent, type: 'validation_rules',
          status: 'failed', error: rulesResult.error
        });
      }

      if (rulesResult.usage) {
        inputTokens += rulesResult.usage.inputTokens;
        outputTokens += rulesResult.usage.outputTokens;
      }

      await this.rateLimitDelay();
    }

    return {
      examples: allExamples,
      keywords: allKeywords,
      patterns: allPatterns,
      validationRules: allValidationRules,
      stats: {
        totalTasks,
        completedTasks,
        failedTasks,
        totalEntries: allExamples.length + allKeywords.length + allPatterns.length + allValidationRules.length,
        tokensUsed: { input: inputTokens, output: outputTokens },
        duration: Date.now() - startTime,
        entriesByType: {
          examples: allExamples.length,
          keywords: allKeywords.length,
          patterns: allPatterns.length,
          validation_rules: allValidationRules.length
        }
      }
    };
  }

  /**
   * Generate all data for all intents
   */
  async generateAll(
    onProgress?: (msg: string, progress?: GenerationProgress) => void
  ): Promise<{
    byIntent: Record<IntentName, {
      examples: Example[];
      keywords: Keyword[];
      patterns: RegexPattern[];
      validationRules: ValidationRule[];
    }>;
    stats: BatchGenerationStats;
  }> {
    const startTime = Date.now();
    const byIntent: Record<string, any> = {};

    let totalCompleted = 0;
    let totalFailed = 0;
    let totalEntries = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const entriesByType: Record<GenerationType, number> = {
      examples: 0,
      keywords: 0,
      patterns: 0,
      validation_rules: 0
    };

    for (const intent of this.config.intents!) {
      onProgress?.(`\n=== Generating for intent: ${intent} ===`);

      const result = await this.generateForIntent(intent, (progress) => {
        const statusIcon = progress.status === 'completed' ? '✓' :
                          progress.status === 'failed' ? '✗' : '...';
        const langStr = progress.language ? `[${progress.language}]` : '';
        const countStr = progress.count ? ` (${progress.count})` : '';
        onProgress?.(
          `  ${statusIcon} ${progress.subIntent}:${progress.type}${langStr}${countStr}`,
          progress
        );
      });

      byIntent[intent] = {
        examples: result.examples,
        keywords: result.keywords,
        patterns: result.patterns,
        validationRules: result.validationRules
      };

      totalCompleted += result.stats.completedTasks;
      totalFailed += result.stats.failedTasks;
      totalEntries += result.stats.totalEntries;
      totalInputTokens += result.stats.tokensUsed.input;
      totalOutputTokens += result.stats.tokensUsed.output;
      entriesByType.examples += result.stats.entriesByType.examples;
      entriesByType.keywords += result.stats.entriesByType.keywords;
      entriesByType.patterns += result.stats.entriesByType.patterns;
      entriesByType.validation_rules += result.stats.entriesByType.validation_rules;

      // Save intermediate results
      await this.saveIntentData(intent, result);
    }

    return {
      byIntent: byIntent as Record<IntentName, any>,
      stats: {
        totalTasks: totalCompleted + totalFailed,
        completedTasks: totalCompleted,
        failedTasks: totalFailed,
        totalEntries,
        tokensUsed: { input: totalInputTokens, output: totalOutputTokens },
        duration: Date.now() - startTime,
        entriesByType
      }
    };
  }

  // ===========================================================================
  // INDIVIDUAL GENERATION METHODS
  // ===========================================================================

  private async generateExamples(
    intent: IntentName,
    subIntent: string,
    language: LanguageCode,
    count: number
  ): Promise<GenerationResult & { examples?: Example[] }> {
    const prompt = buildExamplesPrompt({ intent, subIntent, language, count });
    const result = await this.client.generateWithRetry(prompt);

    if (!result.success || !result.data) {
      return result;
    }

    const rawExamples = Array.isArray(result.data) ? result.data : [];
    const examples: Example[] = rawExamples.map((e: any) => ({
      text: String(e.text || ''),
      language,
      intent,
      subIntent,
      variation: e.variation || 'medium',
      meta: {
        source: 'generated' as const,
        batchId: this.batchId,
        createdAt: new Date().toISOString()
      }
    }));

    return { ...result, examples };
  }

  private async generateKeywords(
    intent: IntentName,
    subIntent: string,
    language: LanguageCode,
    count: number
  ): Promise<GenerationResult & { keywords?: Keyword[] }> {
    const prompt = buildKeywordsPrompt({ intent, subIntent, language, count });
    const result = await this.client.generateWithRetry(prompt);

    if (!result.success || !result.data) {
      return result;
    }

    const rawKeywords = Array.isArray(result.data) ? result.data : [];
    const keywords: Keyword[] = rawKeywords.map((k: any) => ({
      text: String(k.text || ''),
      language,
      intent,
      subIntent,
      variation: k.variation || 'core',
      weight: typeof k.weight === 'number' ? k.weight : 0.5,
      meta: {
        source: 'generated' as const,
        batchId: this.batchId,
        createdAt: new Date().toISOString()
      }
    }));

    return { ...result, keywords };
  }

  private async generatePatterns(
    intent: IntentName,
    subIntent: string,
    language: LanguageCode,
    count: number
  ): Promise<GenerationResult & { patterns?: RegexPattern[] }> {
    const prompt = buildRegexPatternsPrompt({ intent, subIntent, language, count });
    const result = await this.client.generateWithRetry(prompt);

    if (!result.success || !result.data) {
      return result;
    }

    const rawPatterns = Array.isArray(result.data) ? result.data : [];
    const patterns: RegexPattern[] = rawPatterns.map((p: any) => ({
      pattern: String(p.pattern || ''),
      language,
      intent,
      subIntent,
      variation: p.variation || 'question_forms',
      priority: typeof p.priority === 'number' ? p.priority : 50,
      description: p.description,
      meta: {
        source: 'generated' as const,
        batchId: this.batchId,
        createdAt: new Date().toISOString()
      }
    }));

    return { ...result, patterns };
  }

  private async generateValidationRules(
    intent: IntentName,
    subIntent: string,
    count: number
  ): Promise<GenerationResult & { rules?: ValidationRule[] }> {
    const prompt = buildValidationRulesPrompt({ intent, subIntent, count });
    const result = await this.client.generateWithRetry(prompt);

    if (!result.success || !result.data) {
      return result;
    }

    const rawRules = Array.isArray(result.data) ? result.data : [];
    const rules: ValidationRule[] = rawRules.map((r: any, idx: number) => ({
      id: r.id || `${intent}_${subIntent}_rule_${idx}`,
      name: String(r.name || ''),
      description: String(r.description || ''),
      intent,
      subIntent,
      variation: r.variation || 'required_context',
      rule: {
        type: r.rule?.type || 'requires',
        condition: String(r.rule?.condition || ''),
        values: r.rule?.values || [],
        modifier: r.rule?.modifier
      },
      languages: r.languages,
      priority: typeof r.priority === 'number' ? r.priority : 50,
      meta: {
        source: 'generated' as const,
        batchId: this.batchId,
        createdAt: new Date().toISOString()
      }
    }));

    return { ...result, rules };
  }

  // ===========================================================================
  // UTILITY METHODS
  // ===========================================================================

  private async rateLimitDelay(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  private async saveIntentData(
    intent: IntentName,
    data: {
      examples: Example[];
      keywords: Keyword[];
      patterns: RegexPattern[];
      validationRules: ValidationRule[];
    }
  ): Promise<void> {
    const stagingDir = path.join(this.config.outputDir, 'staging', this.batchId);
    await fs.mkdir(stagingDir, { recursive: true });

    // Save each type separately
    const timestamp = new Date().toISOString();

    if (data.examples.length > 0) {
      const examplesDataset: ExampleDataset = {
        schemaVersion: '1.0',
        type: 'examples',
        generatedAt: timestamp,
        params: {
          intent,
          subIntent: 'all',
          language: 'all' as any,
          targetCount: data.examples.length,
          variations: ['short', 'medium', 'long', 'messy', 'ambiguous']
        },
        examples: data.examples
      };
      await fs.writeFile(
        path.join(stagingDir, `${intent}_examples.json`),
        JSON.stringify(examplesDataset, null, 2)
      );
    }

    if (data.keywords.length > 0) {
      const keywordsDataset: KeywordDataset = {
        schemaVersion: '1.0',
        type: 'keywords',
        generatedAt: timestamp,
        params: {
          intent,
          subIntent: 'all',
          language: 'all' as any,
          targetCount: data.keywords.length,
          variations: ['core', 'synonyms', 'domain', 'colloquial', 'misspellings']
        },
        keywords: data.keywords
      };
      await fs.writeFile(
        path.join(stagingDir, `${intent}_keywords.json`),
        JSON.stringify(keywordsDataset, null, 2)
      );
    }

    if (data.patterns.length > 0) {
      const patternsDataset: RegexPatternDataset = {
        schemaVersion: '1.0',
        type: 'regex_patterns',
        generatedAt: timestamp,
        params: {
          intent,
          subIntent: 'all',
          language: 'all' as any,
          targetCount: data.patterns.length,
          variations: ['anchored', 'question_forms', 'command_forms']
        },
        patterns: data.patterns
      };
      await fs.writeFile(
        path.join(stagingDir, `${intent}_patterns.json`),
        JSON.stringify(patternsDataset, null, 2)
      );
    }

    if (data.validationRules.length > 0) {
      const rulesDataset: ValidationRuleDataset = {
        schemaVersion: '1.0',
        type: 'validation_rules',
        generatedAt: timestamp,
        params: {
          intent,
          subIntent: 'all',
          targetCount: data.validationRules.length,
          variations: ['required_context', 'exclusions', 'confidence_modifiers']
        },
        rules: data.validationRules
      };
      await fs.writeFile(
        path.join(stagingDir, `${intent}_validation_rules.json`),
        JSON.stringify(rulesDataset, null, 2)
      );
    }
  }

  getBatchId(): string {
    return this.batchId;
  }
}
