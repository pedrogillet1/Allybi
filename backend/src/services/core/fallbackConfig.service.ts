/**
 * KODA V3 Fallback Configuration Service
 *
 * Loads and manages fallback messages from fallbacks.json
 * Provides structured fallback responses for various scenarios
 *
 * Based on: pasted_content_21.txt Layer 6 specifications
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  FallbackScenarioKey,
  FallbackStyleId,
  LanguageCode,
} from '../../types/intentV3.types';

/**
 * Fallback style definition
 */
export interface FallbackStyle {
  id: FallbackStyleId;
  maxLength?: number;
  structure?: string[];
  tone?: string;
  renderHint?: {
    layout?: string;
    showIcon?: boolean;
    icon?: string;
  };
  languages: Record<LanguageCode, {
    template: string;
    placeholders?: string[];
  }>;
}

/**
 * Fallback scenario definition
 */
export interface FallbackScenario {
  key: FallbackScenarioKey;
  category: string;
  description?: string;
  styles: FallbackStyle[];
}

/**
 * Fallback configuration root
 */
interface FallbackConfig {
  scenarios: FallbackScenario[];
}

/**
 * Fallback response
 */
export interface FallbackResponse {
  text: string;
  renderHint?: {
    layout?: string;
    showIcon?: boolean;
    icon?: string;
  };
  metadata?: {
    scenario: FallbackScenarioKey;
    style: FallbackStyleId;
    language: LanguageCode;
  };
}

export class FallbackConfigService {
  private scenarios: Map<FallbackScenarioKey, FallbackScenario> = new Map();
  private isLoaded = false;
  private readonly configPath: string;
  private readonly logger: any;

  constructor(
    configPath: string = path.join(__dirname, '../../data/fallbacks.json'),
    logger?: any
  ) {
    this.configPath = configPath;
    this.logger = logger || console;
  }

  /**
   * Load fallback configurations from JSON
   * Call this once on application startup
   */
  async loadFallbacks(): Promise<void> {
    if (this.isLoaded) {
      this.logger.warn('[FallbackConfig] Fallbacks already loaded, skipping');
      return;
    }

    try {
      this.logger.info('[FallbackConfig] Loading fallbacks from:', this.configPath);

      // Read JSON file
      const rawData = fs.readFileSync(this.configPath, 'utf-8');
      const config: FallbackConfig = JSON.parse(rawData);

      // Index scenarios by key
      let loadedCount = 0;
      for (const scenario of config.scenarios) {
        this.scenarios.set(scenario.key, scenario);
        loadedCount++;
      }

      this.isLoaded = true;
      this.logger.info(`[FallbackConfig] Loaded ${loadedCount} fallback scenarios`);

      // Validate critical scenarios exist
      this.validateCoverage();

    } catch (error) {
      this.logger.error('[FallbackConfig] Failed to load fallbacks:', error);
      throw new Error('Failed to initialize fallback configuration');
    }
  }

  /**
   * Validate that critical fallback scenarios are present
   */
  private validateCoverage(): void {
    const criticalScenarios: FallbackScenarioKey[] = [
      'NO_DOCUMENTS',
      'OUT_OF_SCOPE',
      'AMBIGUOUS_QUESTION',
    ];

    const missing: string[] = [];
    for (const scenario of criticalScenarios) {
      if (!this.scenarios.has(scenario)) {
        missing.push(scenario);
      }
    }

    if (missing.length > 0) {
      this.logger.warn(
        `[FallbackConfig] Missing critical fallback scenarios: ${missing.join(', ')}`
      );
    }
  }

  /**
   * Get a fallback response for a specific scenario
   *
   * @param scenarioKey - The scenario key (e.g., NO_DOCUMENTS)
   * @param styleId - The style ID (e.g., short_guidance), optional
   * @param language - The language code (en, pt, es)
   * @param placeholders - Optional placeholders for template substitution
   */
  getFallback(
    scenarioKey: FallbackScenarioKey,
    styleId?: FallbackStyleId,
    language: LanguageCode = 'en',
    placeholders?: Record<string, string>
  ): FallbackResponse {
    const scenario = this.scenarios.get(scenarioKey);

    if (!scenario) {
      this.logger.warn(`[FallbackConfig] Unknown scenario: ${scenarioKey}`);
      return this.getDefaultFallback(language);
    }

    // Find the requested style, or use the first one
    let style: FallbackStyle | undefined;
    if (styleId) {
      style = scenario.styles.find(s => s.id === styleId);
    }
    if (!style) {
      style = scenario.styles[0];
    }

    if (!style) {
      this.logger.warn(`[FallbackConfig] No styles found for scenario: ${scenarioKey}`);
      return this.getDefaultFallback(language);
    }

    // Get template for the requested language, fallback to English
    const langTemplate = style.languages[language] || style.languages['en'];

    if (!langTemplate) {
      this.logger.warn(
        `[FallbackConfig] No template found for ${scenarioKey}/${language}, using default`
      );
      return this.getDefaultFallback(language);
    }

    // Fill template with placeholders
    const text = this.fillTemplate(langTemplate.template, placeholders || {});

    return {
      text,
      renderHint: style.renderHint,
      metadata: {
        scenario: scenarioKey,
        style: style.id,
        language,
      },
    };
  }

  /**
   * Fill template with placeholder values
   * Replaces {{placeholder}} with actual values
   */
  private fillTemplate(template: string, placeholders: Record<string, string>): string {
    let filled = template;

    for (const [key, value] of Object.entries(placeholders)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      filled = filled.replace(regex, value);
    }

    // Remove any remaining unfilled placeholders
    filled = filled.replace(/\{\{[^}]+\}\}/g, '');

    return filled;
  }

  /**
   * Get a default fallback when the requested one is not found
   */
  private getDefaultFallback(language: LanguageCode): FallbackResponse {
    const defaultMessages: Record<LanguageCode, string> = {
      en: "I'm having trouble processing your request. Please try again in a moment.",
      pt: "Estou tendo dificuldades para processar sua solicitação. Tente novamente em um momento.",
      es: "Tengo problemas para procesar su solicitud. Por favor intente de nuevo en un momento.",
    };

    return {
      text: defaultMessages[language] || defaultMessages['en'],
      renderHint: {
        layout: 'simple',
        showIcon: true,
        icon: 'warning',
      },
      metadata: {
        scenario: 'UNSUPPORTED_INTENT',
        style: 'one_liner',
        language,
      },
    };
  }

  /**
   * Get a specific scenario definition
   */
  getScenario(scenarioKey: FallbackScenarioKey): FallbackScenario | undefined {
    return this.scenarios.get(scenarioKey);
  }

  /**
   * Get all available scenarios
   */
  getAllScenarios(): FallbackScenario[] {
    return Array.from(this.scenarios.values());
  }

  /**
   * Check if a scenario exists
   */
  hasScenario(scenarioKey: FallbackScenarioKey): boolean {
    return this.scenarios.has(scenarioKey);
  }

  /**
   * Get statistics about loaded fallbacks
   */
  getStatistics(): {
    totalScenarios: number;
    totalStyles: number;
    byLanguage: Record<LanguageCode, number>;
  } {
    const stats = {
      totalScenarios: this.scenarios.size,
      totalStyles: 0,
      byLanguage: {
        en: 0,
        pt: 0,
        es: 0,
      } as Record<LanguageCode, number>,
    };

    for (const scenario of this.scenarios.values()) {
      stats.totalStyles += scenario.styles.length;

      for (const style of scenario.styles) {
        for (const lang of Object.keys(style.languages)) {
          if (lang === 'en' || lang === 'pt' || lang === 'es') {
            stats.byLanguage[lang as LanguageCode]++;
          }
        }
      }
    }

    return stats;
  }

  /**
   * Check if fallbacks are loaded
   */
  isReady(): boolean {
    return this.isLoaded;
  }
}

// Singleton instance for direct import (loaded in server.ts before container init)
export const fallbackConfigService = new FallbackConfigService();

// Export class for DI registration
export default FallbackConfigService;
