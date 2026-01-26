/**
 * KODA V3 Fallback Engine Service
 *
 * Generates 1-2 part fallback answers (NOT 2-3 parts)
 * Uses fallbacks.json for all scenarios (NO hardcoded messages)
 *
 * Based on previous specifications + pasted_content_21.txt Layer 6
 */

import FallbackConfigService, { fallbackConfigService, FallbackResponse } from './fallbackConfig.service';
import {
  FallbackScenarioKey,
  FallbackStyleId,
  LanguageCode,
} from '../../types/intentV3.types';

export interface FallbackRequest {
  scenario: FallbackScenarioKey;
  language: LanguageCode;
  style?: FallbackStyleId;
  context?: {
    query?: string;
    documentsCount?: number;
    errorMessage?: string;
    [key: string]: any;
  };
}

export interface FallbackResult {
  text: string;
  formatted: string;
  parts: string[];        // 1-2 parts only
  metadata: {
    scenario: FallbackScenarioKey;
    style: FallbackStyleId;
    language: LanguageCode;
    partsCount: number;
  };
}

export class KodaFallbackEngineV3 {
  private readonly fallbackConfig: FallbackConfigService;
  private readonly logger: any;

  constructor(
    fallbackConfig: FallbackConfigService = fallbackConfigService,
    logger?: any
  ) {
    this.fallbackConfig = fallbackConfig;
    this.logger = logger || console;
  }

  /**
   * Generate fallback response
   * Returns 1-2 parts (NOT 2-3)
   */
  async generate(request: FallbackRequest): Promise<FallbackResult> {
    this.logger.info(
      `[FallbackEngine] Generating fallback: scenario=${request.scenario} lang=${request.language}`
    );

    // Get fallback from config
    const fallback = this.fallbackConfig.getFallback(
      request.scenario,
      request.style || 'short_guidance',
      request.language,
      this.buildPlaceholders(request)
    );

    // Split into 1-2 parts
    const parts = this.splitIntoParts(fallback.text, request.scenario);

    // Format with proper structure
    const formatted = this.formatParts(parts, request.language);

    return {
      text: fallback.text,
      formatted,
      parts,
      metadata: {
        scenario: request.scenario,
        style: fallback.metadata?.style || 'short_guidance',
        language: request.language,
        partsCount: parts.length,
      },
    };
  }

  /**
   * Split fallback text into 1-2 parts
   * CRITICAL: Never return 2-3 parts, only 1-2
   */
  private splitIntoParts(text: string, scenario: FallbackScenarioKey): string[] {
    // For simple scenarios, return 1 part
    const simpleScenarios: FallbackScenarioKey[] = [
      'OUT_OF_SCOPE',
      'RATE_LIMIT',
      'LLM_ERROR',
    ];

    if (simpleScenarios.includes(scenario)) {
      return [text];
    }

    // For complex scenarios, split into 2 parts
    // Part 1: Main message
    // Part 2: Suggestion/action

    const lines = text.split('\n').filter(line => line.trim().length > 0);

    if (lines.length <= 2) {
      return [text]; // Keep as 1 part if short
    }

    // Find natural split point (e.g., before "Try:", "You can:", etc.)
    const splitKeywords = ['Try:', 'You can:', 'Here\'s how:', 'To get started:', 'Para começar:', 'Você pode:', 'Experimente:', 'Para empezar:', 'Puedes:', 'Intenta:'];

    let splitIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (splitKeywords.some(keyword => lines[i].includes(keyword))) {
        splitIndex = i;
        break;
      }
    }

    if (splitIndex > 0) {
      // Split into 2 parts
      const part1 = lines.slice(0, splitIndex).join('\n');
      const part2 = lines.slice(splitIndex).join('\n');
      return [part1, part2];
    }

    // Default: return as 1 part
    return [text];
  }

  /**
   * Format parts into final text
   */
  private formatParts(parts: string[], language: LanguageCode): string {
    if (parts.length === 1) {
      return parts[0];
    }

    // 2 parts: join with double newline
    return parts.join('\n\n');
  }

  /**
   * Build placeholders for template substitution
   */
  private buildPlaceholders(request: FallbackRequest): Record<string, string> {
    const placeholders: Record<string, string> = {};

    if (request.context) {
      if (request.context.query) {
        placeholders.query = request.context.query;
      }
      if (request.context.documentsCount !== undefined) {
        placeholders.documentsCount = request.context.documentsCount.toString();
      }
      if (request.context.errorMessage) {
        placeholders.errorMessage = request.context.errorMessage;
      }
    }

    return placeholders;
  }

  /**
   * Get fallback for NO_DOCUMENTS scenario
   */
  async getNoDocumentsFallback(language: LanguageCode): Promise<FallbackResult> {
    return this.generate({
      scenario: 'NO_DOCUMENTS',
      language,
      style: 'short_guidance',
    });
  }

  /**
   * Get fallback for OUT_OF_SCOPE scenario
   */
  async getOutOfScopeFallback(language: LanguageCode): Promise<FallbackResult> {
    return this.generate({
      scenario: 'OUT_OF_SCOPE',
      language,
      style: 'friendly_redirect',
    });
  }

  /**
   * Get fallback for AMBIGUOUS_QUESTION scenario
   */
  async getAmbiguousFallback(language: LanguageCode, query?: string): Promise<FallbackResult> {
    return this.generate({
      scenario: 'AMBIGUOUS_QUESTION',
      language,
      style: 'short_guidance',
      context: { query },
    });
  }

  /**
   * Get fallback for PRODUCT_HELP_ERROR scenario
   */
  async getProductHelpErrorFallback(language: LanguageCode): Promise<FallbackResult> {
    return this.generate({
      scenario: 'PRODUCT_HELP_ERROR',
      language,
      style: 'friendly_redirect',
    });
  }

  /**
   * Get fallback for RETRIEVAL_ERROR scenario
   */
  async getRetrievalErrorFallback(language: LanguageCode, errorMessage?: string): Promise<FallbackResult> {
    return this.generate({
      scenario: 'RETRIEVAL_ERROR',
      language,
      style: 'technical_error',
      context: { errorMessage },
    });
  }

  /**
   * Get fallback for LLM_ERROR scenario
   */
  async getLLMErrorFallback(language: LanguageCode): Promise<FallbackResult> {
    return this.generate({
      scenario: 'LLM_ERROR',
      language,
      style: 'one_liner',
    });
  }

  /**
   * Get statistics
   */
  getStatistics() {
    return {
      configReady: this.fallbackConfig.isReady(),
      ...this.fallbackConfig.getStatistics(),
    };
  }
}

// Use container.getFallbackEngine() instead of singleton
export default KodaFallbackEngineV3;
