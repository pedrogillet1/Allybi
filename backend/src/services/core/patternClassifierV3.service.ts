/**
 * KODA V3 Pattern Classifier Service
 *
 * Thin wrapper around KodaIntentEngineV3
 * Uses ONLY JSON patterns (NO hardcoded regex/keywords)
 *
 * Based on: pasted_content_22.txt Section C specifications
 */

import KodaIntentEngineV3 from './kodaIntentEngineV3.service';
import {
  IntentName,
  LanguageCode,
  PredictedIntent,
  IntentClassificationRequest,
} from '../../types/intentV3.types';

export class PatternClassifierServiceV3 {
  private readonly intentEngine: KodaIntentEngineV3;
  private readonly logger: any;

  constructor(
    intentEngine: KodaIntentEngineV3,
    logger?: any
  ) {
    if (!intentEngine) {
      throw new Error('[PatternClassifier] intentEngine is required - must be injected');
    }
    this.intentEngine = intentEngine;
    this.logger = logger || console;
  }

  /**
   * Classify user text into intent
   * Main entry point - delegates to IntentEngine
   */
  async classify(
    text: string,
    language?: LanguageCode,
    context?: any
  ): Promise<PredictedIntent> {
    const request: IntentClassificationRequest = {
      text,
      language,
      context,
    };

    return this.intentEngine.predict(request);
  }

  /**
   * Classify with explicit language
   */
  async classifyWithLanguage(
    text: string,
    language: LanguageCode
  ): Promise<PredictedIntent> {
    return this.classify(text, language);
  }

  /**
   * Quick check if text matches a specific intent
   * Useful for validation or pre-filtering
   */
  async matchesIntent(
    text: string,
    targetIntent: IntentName,
    minConfidence: number = 0.7
  ): Promise<boolean> {
    const result = await this.classify(text);
    return result.primaryIntent === targetIntent && result.confidence >= minConfidence;
  }

  /**
   * Get all possible intents for a text (sorted by confidence)
   */
  async getAllPossibleIntents(
    text: string,
    language?: LanguageCode
  ): Promise<Array<{ name: IntentName; confidence: number }>> {
    const result = await this.classify(text, language);

    const allIntents: Array<{ name: IntentName; confidence: number }> = [
      { name: result.primaryIntent, confidence: result.confidence },
    ];

    if (result.secondaryIntents) {
      allIntents.push(...result.secondaryIntents);
    }

    return allIntents;
  }

  /**
   * Batch classification
   */
  async classifyBatch(
    texts: string[],
    language?: LanguageCode
  ): Promise<PredictedIntent[]> {
    const requests: IntentClassificationRequest[] = texts.map(text => ({
      text,
      language,
    }));

    return this.intentEngine.predictBatch(requests);
  }

  /**
   * Get classifier statistics
   */
  getStatistics() {
    return this.intentEngine.getStatistics();
  }
}

// Export class for DI registration (instantiate in container.ts with intentEngine)
export default PatternClassifierServiceV3;
