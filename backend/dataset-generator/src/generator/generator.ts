/**
 * Dataset Generator
 * Orchestrates generation of patterns, tests, and fallbacks
 */

import { ClaudeClient, GenerationResult } from './claude-client.js';
import {
  buildPatternPrompt,
  buildBatchPatternPrompt,
  PatternPromptParams
} from '../prompts/patterns.prompt.js';
import {
  buildTestPrompt,
  buildBatchTestPrompt,
  TestPromptParams
} from '../prompts/tests.prompt.js';
import {
  buildFallbackPrompt,
  buildBatchFallbackPrompt,
  FallbackPromptParams
} from '../prompts/fallbacks.prompt.js';
import {
  LanguageCode,
  IntentType,
  PatternCategory,
  FallbackScenario,
  FallbackStyle,
  IntentPattern,
  ClassificationTest,
  PatternDataset,
  TestDataset,
  SUPPORTED_LANGUAGES,
  SUPPORTED_INTENTS,
  PATTERN_CATEGORIES
} from '../schemas/index.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface GeneratorConfig {
  outputDir: string;
  batchId?: string;
  countPerCategory?: number;
  languages?: LanguageCode[];
  intents?: IntentType[];
  categories?: PatternCategory[];
}

export interface GenerationStats {
  totalGenerated: number;
  successCount: number;
  failureCount: number;
  tokensUsed: {
    input: number;
    output: number;
  };
  duration: number;
}

export class DatasetGenerator {
  private client: ClaudeClient;
  private config: GeneratorConfig;
  private batchId: string;

  constructor(client: ClaudeClient, config: GeneratorConfig) {
    this.client = client;
    this.config = {
      countPerCategory: 10,
      languages: [...SUPPORTED_LANGUAGES],
      intents: [...SUPPORTED_INTENTS],
      categories: [...PATTERN_CATEGORIES],
      ...config
    };
    this.batchId = config.batchId || `batch_${Date.now()}`;
  }

  /**
   * Generate patterns for a specific combination
   */
  async generatePatterns(params: PatternPromptParams): Promise<GenerationResult & { patterns?: IntentPattern[] }> {
    const prompt = buildPatternPrompt(params);
    const result = await this.client.generateWithRetry(prompt);

    if (!result.success || !result.data) {
      return result;
    }

    // Transform raw data to IntentPattern[]
    const rawPatterns = Array.isArray(result.data) ? result.data : [];
    const patterns: IntentPattern[] = rawPatterns.map((p: unknown) => {
      if (typeof p === 'string') {
        return {
          pattern: p,
          language: params.language,
          intent: params.intent,
          category: params.category,
          meta: {
            source: 'generated' as const,
            batchId: this.batchId,
            createdAt: new Date().toISOString()
          }
        };
      }
      // If already an object with pattern property
      const obj = p as Record<string, unknown>;
      return {
        pattern: String(obj.pattern || ''),
        language: params.language,
        intent: params.intent,
        category: params.category,
        meta: {
          source: 'generated' as const,
          batchId: this.batchId,
          createdAt: new Date().toISOString()
        }
      };
    });

    return { ...result, patterns };
  }

  /**
   * Generate test cases for a specific combination
   */
  async generateTests(params: TestPromptParams): Promise<GenerationResult & { tests?: ClassificationTest[] }> {
    const prompt = buildTestPrompt(params);
    const result = await this.client.generateWithRetry(prompt);

    if (!result.success || !result.data) {
      return result;
    }

    // Transform raw data to ClassificationTest[]
    const rawTests = Array.isArray(result.data) ? result.data : [];
    const tests: ClassificationTest[] = rawTests.map((t: unknown) => {
      const obj = t as Record<string, unknown>;
      return {
        query: String(obj.query || ''),
        language: params.language,
        expectedIntent: params.intent,
        category: params.category,
        meta: {
          source: 'generated' as const,
          batchId: this.batchId,
          createdAt: new Date().toISOString()
        }
      };
    });

    return { ...result, tests };
  }

  /**
   * Generate fallback variations
   */
  async generateFallbacks(params: FallbackPromptParams): Promise<GenerationResult> {
    const prompt = buildFallbackPrompt(params);
    return await this.client.generateWithRetry(prompt);
  }

  /**
   * Generate full pattern dataset for all combinations
   */
  async generateFullPatternDataset(
    onProgress?: (msg: string) => void
  ): Promise<{ dataset: PatternDataset; stats: GenerationStats }> {
    const startTime = Date.now();
    const allPatterns: IntentPattern[] = [];
    let successCount = 0;
    let failureCount = 0;
    let inputTokens = 0;
    let outputTokens = 0;

    const { languages, intents, categories, countPerCategory } = this.config;

    for (const language of languages!) {
      for (const intent of intents!) {
        for (const category of categories!) {
          onProgress?.(`Generating patterns: ${language}/${intent}/${category}`);

          const result = await this.generatePatterns({
            language,
            intent,
            category,
            count: countPerCategory!
          });

          if (result.success && result.patterns) {
            allPatterns.push(...result.patterns);
            successCount++;
          } else {
            failureCount++;
            onProgress?.(`  Failed: ${result.error}`);
          }

          if (result.usage) {
            inputTokens += result.usage.inputTokens;
            outputTokens += result.usage.outputTokens;
          }

          // Rate limiting delay
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }

    const dataset: PatternDataset = {
      schemaVersion: '1.0',
      type: 'patterns',
      generatedAt: new Date().toISOString(),
      params: {
        targetCount: countPerCategory!,
        languages: languages!,
        categories: categories!,
        intents: intents!
      },
      patterns: allPatterns
    };

    return {
      dataset,
      stats: {
        totalGenerated: allPatterns.length,
        successCount,
        failureCount,
        tokensUsed: { input: inputTokens, output: outputTokens },
        duration: Date.now() - startTime
      }
    };
  }

  /**
   * Generate full test dataset for all combinations
   */
  async generateFullTestDataset(
    onProgress?: (msg: string) => void
  ): Promise<{ dataset: TestDataset; stats: GenerationStats }> {
    const startTime = Date.now();
    const allTests: ClassificationTest[] = [];
    let successCount = 0;
    let failureCount = 0;
    let inputTokens = 0;
    let outputTokens = 0;

    const { languages, intents, categories, countPerCategory } = this.config;

    for (const language of languages!) {
      for (const intent of intents!) {
        for (const category of categories!) {
          onProgress?.(`Generating tests: ${language}/${intent}/${category}`);

          const result = await this.generateTests({
            language,
            intent,
            category,
            count: countPerCategory!
          });

          if (result.success && result.tests) {
            allTests.push(...result.tests);
            successCount++;
          } else {
            failureCount++;
            onProgress?.(`  Failed: ${result.error}`);
          }

          if (result.usage) {
            inputTokens += result.usage.inputTokens;
            outputTokens += result.usage.outputTokens;
          }

          // Rate limiting delay
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }

    const dataset: TestDataset = {
      schemaVersion: '1.0',
      type: 'tests',
      generatedAt: new Date().toISOString(),
      params: {
        targetCount: countPerCategory!,
        languages: languages!,
        categories: categories!,
        intents: intents!
      },
      tests: allTests
    };

    return {
      dataset,
      stats: {
        totalGenerated: allTests.length,
        successCount,
        failureCount,
        tokensUsed: { input: inputTokens, output: outputTokens },
        duration: Date.now() - startTime
      }
    };
  }

  /**
   * Save dataset to staging directory
   */
  async saveToStaging(filename: string, data: unknown): Promise<string> {
    const outputPath = path.join(this.config.outputDir, 'staging', filename);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(data, null, 2), 'utf-8');
    return outputPath;
  }

  getBatchId(): string {
    return this.batchId;
  }
}
