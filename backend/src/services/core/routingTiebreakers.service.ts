/**
 * KODA V3 Routing Tiebreakers Service
 *
 * Applies explicit tie-breaker rules for cross-intent keyword conflicts.
 * Loaded from: src/data/routing_tiebreakers.json
 *
 * Flow: predict intent → apply tiebreakers → apply override service → decision tree
 */

import * as fs from 'fs';
import * as path from 'path';
import { IntentName, LanguageCode, PredictedIntent } from '../../types/intentV3.types';

// Tiebreaker rule structure
interface ExplicitTiebreakerRule {
  id: string;
  if_contains: string[];
  route_to: string;
  sub_intent?: string;
  rationale: string;
}

// Context tiebreaker patterns
interface ContextTiebreaker {
  context_signals: string[];
  description: string;
}

interface ContextTiebreakerPair {
  [routeKey: string]: ContextTiebreaker;
}

// Full config structure
interface TiebreakersConfig {
  _meta: {
    type: string;
    description: string;
    version: string;
    do_not_prune: boolean;
  };
  precedence_order: string[];
  context_tiebreakers: {
    description: string;
    [pairKey: string]: ContextTiebreakerPair | string;
  };
  explicit_tiebreakers: {
    description: string;
    rules: ExplicitTiebreakerRule[];
  };
  fallback_rules: {
    description: string;
    same_tier_conflict: { rule: string; example: string };
    different_tier_conflict: { rule: string; example: string };
    no_strong_match: { rule: string; fallback: string };
    ambiguous_after_tiebreakers: { rule: string; log_path: string };
  };
  validation: {
    all_intents_covered: boolean;
    multilingual_support: string[];
    total_explicit_rules: number;
    last_updated: string;
  };
}

// Input for tiebreaker application
export interface TiebreakerInput {
  text: string;
  predictedIntent: IntentName;
  predictedConfidence: number;
  predictedDomain?: string;
  language: LanguageCode;
  context?: {
    hasDocuments?: boolean;
    isFollowup?: boolean;
    secondaryIntents?: Array<{ name: IntentName; confidence: number }>;
  };
}

// Output from tiebreaker application
export interface TiebreakerResult {
  intent: IntentName;
  domain?: string;
  subIntent?: string;
  confidence: number;
  wasModified: boolean;
  reason?: string;
  matchedRule?: string;
}

export class RoutingTiebreakersService {
  private config: TiebreakersConfig | null = null;
  private isLoaded = false;
  private readonly configPath: string;
  private readonly logger: Console;

  // Intent name mapping (uppercase to lowercase)
  private readonly intentMap: Record<string, IntentName> = {
    'ERROR': 'error',
    'FILE_ACTIONS': 'file_actions',
    'MEMORY': 'memory',
    'PREFERENCES': 'preferences',
    'EXTRACTION': 'extraction',
    'DOCUMENTS': 'documents',
    'REASONING': 'reasoning',
    'EDIT': 'edit',
    'HELP': 'help',
    'CONVERSATION': 'conversation',
  };

  constructor(configPath?: string, logger?: Console) {
    this.configPath = configPath || path.join(__dirname, '../../data/routing_tiebreakers.json');
    this.logger = logger || console;
  }

  /**
   * Load tiebreaker rules from JSON file.
   * Call once on application startup.
   */
  async load(): Promise<void> {
    if (this.isLoaded) {
      this.logger.warn('[RoutingTiebreakers] Rules already loaded, skipping');
      return;
    }

    try {
      this.logger.info('[RoutingTiebreakers] Loading rules from:', this.configPath);

      if (!fs.existsSync(this.configPath)) {
        this.logger.warn('[RoutingTiebreakers] Config file not found, using empty config');
        this.config = null;
        this.isLoaded = true;
        return;
      }

      const rawData = fs.readFileSync(this.configPath, 'utf-8');
      this.config = JSON.parse(rawData) as TiebreakersConfig;

      const ruleCount = this.config.explicit_tiebreakers?.rules?.length || 0;
      this.logger.info(`[RoutingTiebreakers] Loaded ${ruleCount} explicit rules`);

      this.isLoaded = true;
    } catch (error) {
      this.logger.error('[RoutingTiebreakers] Failed to load config:', error);
      this.config = null;
      this.isLoaded = true; // Mark as loaded to prevent retries
    }
  }

  /**
   * Apply tiebreaker rules to a predicted intent.
   * Returns corrected intent/domain if a rule matches.
   *
   * @param input - The prediction and context
   * @returns Corrected or original intent with modification flag
   */
  applyTiebreakers(input: TiebreakerInput): TiebreakerResult {
    // If not loaded or no config, return original
    if (!this.config) {
      return {
        intent: input.predictedIntent,
        confidence: input.predictedConfidence,
        wasModified: false,
      };
    }

    const normalizedText = input.text.toLowerCase().trim();

    // 1. Check explicit tiebreaker rules first (highest priority)
    const explicitResult = this.checkExplicitRules(normalizedText, input);
    if (explicitResult.wasModified) {
      return explicitResult;
    }

    // 2. Check context tiebreakers (for collision pairs)
    const contextResult = this.checkContextTiebreakers(normalizedText, input);
    if (contextResult.wasModified) {
      return contextResult;
    }

    // 3. Check secondary intent collision with precedence
    const precedenceResult = this.checkSecondaryIntentPrecedence(input);
    if (precedenceResult.wasModified) {
      return precedenceResult;
    }

    // No tiebreaker applied
    return {
      intent: input.predictedIntent,
      confidence: input.predictedConfidence,
      wasModified: false,
    };
  }

  /**
   * Check explicit tiebreaker rules.
   * Rules like: if_contains: ["extract", "table", "spreadsheet"] → FILE_ACTIONS
   */
  private checkExplicitRules(normalizedText: string, input: TiebreakerInput): TiebreakerResult {
    if (!this.config?.explicit_tiebreakers?.rules) {
      return { intent: input.predictedIntent, confidence: input.predictedConfidence, wasModified: false };
    }

    for (const rule of this.config.explicit_tiebreakers.rules) {
      // Check if ALL keywords in if_contains are present
      const allMatch = rule.if_contains.every(keyword =>
        normalizedText.includes(keyword.toLowerCase())
      );

      if (allMatch) {
        const mappedIntent = this.mapIntent(rule.route_to);

        // Only apply if different from predicted
        if (mappedIntent !== input.predictedIntent) {
          this.logger.info(
            `[RoutingTiebreakers] Explicit rule ${rule.id} matched: ${input.predictedIntent} → ${mappedIntent} (${rule.rationale})`
          );

          return {
            intent: mappedIntent,
            subIntent: rule.sub_intent,
            confidence: Math.min(input.predictedConfidence + 0.1, 1.0), // Boost confidence
            wasModified: true,
            reason: rule.rationale,
            matchedRule: rule.id,
          };
        }
      }
    }

    return { intent: input.predictedIntent, confidence: input.predictedConfidence, wasModified: false };
  }

  /**
   * Check context tiebreakers for collision pairs.
   * E.g., extraction_vs_documents, help_vs_reasoning
   */
  private checkContextTiebreakers(normalizedText: string, input: TiebreakerInput): TiebreakerResult {
    if (!this.config?.context_tiebreakers) {
      return { intent: input.predictedIntent, confidence: input.predictedConfidence, wasModified: false };
    }

    // Get secondary intents if available
    const secondaryIntents = input.context?.secondaryIntents || [];
    if (secondaryIntents.length === 0) {
      return { intent: input.predictedIntent, confidence: input.predictedConfidence, wasModified: false };
    }

    // Check if there's a collision pair for primary vs secondary
    const primaryKey = input.predictedIntent.toUpperCase();
    const secondaryKey = secondaryIntents[0].name.toUpperCase();

    // Try both orderings of the pair
    const pairKey1 = `${primaryKey.toLowerCase()}_vs_${secondaryKey.toLowerCase()}`;
    const pairKey2 = `${secondaryKey.toLowerCase()}_vs_${primaryKey.toLowerCase()}`;

    const pairConfig = this.config.context_tiebreakers[pairKey1] as ContextTiebreakerPair ||
                       this.config.context_tiebreakers[pairKey2] as ContextTiebreakerPair;

    if (!pairConfig || typeof pairConfig === 'string') {
      return { intent: input.predictedIntent, confidence: input.predictedConfidence, wasModified: false };
    }

    // Check each route option in the pair
    for (const [routeKey, routeConfig] of Object.entries(pairConfig)) {
      if (!routeConfig.context_signals) continue;

      // Check if any context signal matches
      const matchedSignal = routeConfig.context_signals.find(signal =>
        normalizedText.includes(signal.toLowerCase())
      );

      if (matchedSignal) {
        // Extract intent from route key (e.g., "route_to_extraction" → "EXTRACTION")
        const match = routeKey.match(/route_to_(\w+)/);
        if (match) {
          const targetIntent = this.mapIntent(match[1].toUpperCase());

          if (targetIntent !== input.predictedIntent) {
            this.logger.info(
              `[RoutingTiebreakers] Context tiebreaker matched: ${input.predictedIntent} → ${targetIntent} (signal: "${matchedSignal}")`
            );

            return {
              intent: targetIntent,
              confidence: input.predictedConfidence,
              wasModified: true,
              reason: routeConfig.description,
              matchedRule: `context:${pairKey1 || pairKey2}`,
            };
          }
        }
      }
    }

    return { intent: input.predictedIntent, confidence: input.predictedConfidence, wasModified: false };
  }

  /**
   * Check secondary intent precedence for collision resolution.
   * If primary and secondary have very close confidence, use precedence order.
   */
  private checkSecondaryIntentPrecedence(input: TiebreakerInput): TiebreakerResult {
    if (!this.config?.precedence_order || !input.context?.secondaryIntents?.length) {
      return { intent: input.predictedIntent, confidence: input.predictedConfidence, wasModified: false };
    }

    const topSecondary = input.context.secondaryIntents[0];
    const confidenceDiff = input.predictedConfidence - topSecondary.confidence;

    // Only apply precedence if confidence is very close (within 0.1)
    if (confidenceDiff > 0.1) {
      return { intent: input.predictedIntent, confidence: input.predictedConfidence, wasModified: false };
    }

    // Get precedence indices
    const primaryPrecedence = this.getPrecedenceIndex(input.predictedIntent);
    const secondaryPrecedence = this.getPrecedenceIndex(topSecondary.name);

    // Lower index = higher precedence
    if (secondaryPrecedence < primaryPrecedence && secondaryPrecedence >= 0) {
      this.logger.info(
        `[RoutingTiebreakers] Precedence override: ${input.predictedIntent} → ${topSecondary.name} (precedence ${primaryPrecedence} < ${secondaryPrecedence})`
      );

      return {
        intent: topSecondary.name,
        confidence: topSecondary.confidence,
        wasModified: true,
        reason: `Precedence order override (${topSecondary.name} has higher precedence)`,
        matchedRule: 'precedence_order',
      };
    }

    return { intent: input.predictedIntent, confidence: input.predictedConfidence, wasModified: false };
  }

  /**
   * Get precedence index for an intent (lower = higher priority).
   */
  private getPrecedenceIndex(intent: IntentName): number {
    if (!this.config?.precedence_order) return 999;

    const upperIntent = intent.toUpperCase();
    const index = this.config.precedence_order.indexOf(upperIntent);
    return index >= 0 ? index : 999;
  }

  /**
   * Map uppercase intent name to lowercase IntentName type.
   */
  private mapIntent(upperIntent: string): IntentName {
    const normalized = upperIntent.toUpperCase();
    return this.intentMap[normalized] || (upperIntent.toLowerCase() as IntentName);
  }

  /**
   * Check if service is ready.
   */
  isReady(): boolean {
    return this.isLoaded;
  }

  /**
   * Get statistics about loaded rules.
   */
  getStatistics(): {
    isLoaded: boolean;
    explicitRules: number;
    contextPairs: number;
    precedenceOrder: string[];
  } {
    return {
      isLoaded: this.isLoaded,
      explicitRules: this.config?.explicit_tiebreakers?.rules?.length || 0,
      contextPairs: Object.keys(this.config?.context_tiebreakers || {}).filter(k => k !== 'description').length,
      precedenceOrder: this.config?.precedence_order || [],
    };
  }
}

// Export singleton for direct import
export const routingTiebreakersService = new RoutingTiebreakersService();

export default RoutingTiebreakersService;
