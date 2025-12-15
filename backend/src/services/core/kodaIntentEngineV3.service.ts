/**
 * KODA V3 Intent Engine Service
 *
 * Uses ONLY JSON patterns for intent classification (NO hardcoded keywords/regexes)
 * Implements regex + keyword scoring with confidence thresholds
 *
 * Based on: pasted_content_21.txt Layer 4 specifications
 */

import { IntentConfigService } from './intentConfig.service';
import { ILanguageDetector, DefaultLanguageDetector } from './languageDetector.service';
import {
  IntentName,
  LanguageCode,
  PredictedIntent,
  IntentClassificationRequest,
  INTENT_CONFIDENCE_THRESHOLD,
  SECONDARY_INTENT_THRESHOLD,
} from '../../types/intentV3.types';

interface IntentScore {
  intent: IntentName;
  regexScore: number;
  keywordScore: number;
  finalScore: number;
  matchedPattern?: string;
  matchedKeywords?: string[];
}

export class KodaIntentEngineV3 {
  private readonly intentConfig: IntentConfigService;
  private readonly languageDetector: ILanguageDetector;
  private readonly logger: any;

  constructor(
    intentConfig: IntentConfigService,
    languageDetector?: ILanguageDetector,
    logger?: any
  ) {
    // FAIL-FAST: IntentConfigService is REQUIRED (no default singleton)
    if (!intentConfig) {
      throw new Error('[IntentEngine] intentConfig is REQUIRED - must be injected from container');
    }
    this.intentConfig = intentConfig;
    this.languageDetector = languageDetector || new DefaultLanguageDetector();
    this.logger = logger || console;
  }

  /**
   * Predict intent from user text
   * Main entry point for intent classification
   */
  async predict(request: IntentClassificationRequest): Promise<PredictedIntent> {
    const startTime = Date.now();

    // Normalize text
    const normalizedText = this.normalizeText(request.text);

    // Detect or use provided language
    const language = request.language || await this.detectLanguage(request.text);

    // Score all intents
    const scores = this.scoreAllIntents(normalizedText, language);

    // Sort by final score (descending)
    scores.sort((a, b) => b.finalScore - a.finalScore);

    // Get primary intent
    const primary = scores[0];

    // Check if primary intent meets confidence threshold
    if (primary.finalScore < INTENT_CONFIDENCE_THRESHOLD) {
      // No intent has sufficient confidence → AMBIGUOUS
      return this.buildAmbiguousResult(language, scores);
    }

    // Get secondary intents (above secondary threshold)
    const secondaryIntents = scores
      .slice(1)
      .filter(s => s.finalScore >= SECONDARY_INTENT_THRESHOLD)
      .map(s => ({
        name: s.intent,
        confidence: s.finalScore,
      }));

    // Check for multi-intent scenario
    if (secondaryIntents.length > 0 && secondaryIntents[0].confidence > 0.6) {
      // Multiple high-confidence intents detected
      this.logger.debug(
        `[IntentEngine] Multi-intent detected: ${primary.intent} (${primary.finalScore.toFixed(2)}) + ${secondaryIntents[0].name} (${secondaryIntents[0].confidence.toFixed(2)})`
      );
    }

    const processingTime = Date.now() - startTime;

    // Log classification result
    this.logger.info(
      `[IntentEngine] text="${request.text.substring(0, 50)}..." lang=${language} → ` +
      `primary=${primary.intent} (${primary.finalScore.toFixed(2)}${primary.matchedPattern ? ', regex="' + primary.matchedPattern + '"' : ''})` +
      (secondaryIntents.length > 0 ? `, secondary=${secondaryIntents[0].name}(${secondaryIntents[0].confidence.toFixed(2)})` : '') +
      ` [${processingTime}ms]`
    );

    return {
      primaryIntent: primary.intent,
      confidence: primary.finalScore,
      secondaryIntents: secondaryIntents.length > 0 ? secondaryIntents : undefined,
      language,
      matchedPattern: primary.matchedPattern,
      matchedKeywords: primary.matchedKeywords,
      metadata: {
        processingTime,
        totalIntentsScored: scores.length,
      },
    };
  }

  /**
   * Score all intents against the normalized text
   */
  private scoreAllIntents(normalizedText: string, language: LanguageCode): IntentScore[] {
    const scores: IntentScore[] = [];
    const allPatterns = this.intentConfig.getAllPatterns();

    for (const [intentName, pattern] of Object.entries(allPatterns)) {
      const score = this.scoreIntent(
        intentName as IntentName,
        normalizedText,
        language,
        pattern
      );
      scores.push(score);
    }

    return scores;
  }

  /**
   * Score a single intent using regex + keyword matching
   */
  private scoreIntent(
    intentName: IntentName,
    normalizedText: string,
    language: LanguageCode,
    pattern: any
  ): IntentScore {
    let regexScore = 0;
    let matchedPattern: string | undefined;

    // 1. Test regex patterns
    const regexPatterns = this.intentConfig.getRegexPatterns(intentName, language);
    for (const regex of regexPatterns) {
      if (regex.test(normalizedText)) {
        regexScore = 1.0;
        matchedPattern = regex.source;
        break; // First match wins
      }
    }

    // 2. Score keywords
    const keywords = this.intentConfig.getKeywords(intentName, language);
    const { score: keywordScore, matched: matchedKeywords } = this.scoreKeywords(
      normalizedText,
      keywords
    );

    // 3. Combine scores with deterministic clamping
    // Use max of regex and keyword scores, then apply priority multiplier
    const baseScore = Math.max(regexScore, keywordScore);

    // Clamp priority to [0, 100] for deterministic scoring
    const rawPriority = pattern.priority ?? 50;
    const clampedPriority = Math.min(100, Math.max(0, rawPriority));
    const priorityMultiplier = clampedPriority / 100;

    // Apply multiplier and clamp final score to [0, 1]
    const rawScore = baseScore * priorityMultiplier;
    const finalScore = Math.min(1, Math.max(0, rawScore));

    return {
      intent: intentName,
      regexScore,
      keywordScore,
      finalScore,
      matchedPattern,
      matchedKeywords: matchedKeywords.length > 0 ? matchedKeywords : undefined,
    };
  }

  /**
   * Score keywords against text
   * Returns score (0-1) and list of matched keywords
   *
   * SCORING FIX: Use logarithmic scaling instead of ratio
   * - Old formula: matched/total → penalizes intents with many keywords
   * - New formula: 0.5 + 0.5 * log2(matched+1)/log2(10) → rewards any match, diminishing returns
   * - 1 match → 0.65, 2 matches → 0.74, 3 matches → 0.79, 5+ matches → 0.85+
   */
  private scoreKeywords(
    normalizedText: string,
    keywords: string[]
  ): { score: number; matched: string[] } {
    if (keywords.length === 0) {
      return { score: 0, matched: [] };
    }

    const matched: string[] = [];

    for (const keyword of keywords) {
      const normalizedKeyword = keyword.toLowerCase().trim();

      // Check for word boundary match (more precise than simple includes)
      const wordBoundaryRegex = new RegExp(`\\b${this.escapeRegex(normalizedKeyword)}\\b`, 'i');

      if (wordBoundaryRegex.test(normalizedText)) {
        matched.push(keyword);
      }
    }

    // FIXED SCORING: Logarithmic scaling that rewards any match
    // - 0 matches → 0
    // - 1 match → 0.65 (enough to pass threshold with priority >= 77)
    // - 2 matches → 0.74
    // - 3 matches → 0.79
    // - 5+ matches → 0.85+
    let score = 0;
    if (matched.length > 0) {
      // Base score of 0.5 for any match, plus log bonus for additional matches
      score = 0.5 + 0.5 * Math.log2(matched.length + 1) / Math.log2(10);
      score = Math.min(1, score); // Cap at 1.0
    }

    return { score, matched };
  }

  /**
   * Normalize text for matching
   */
  private normalizeText(text: string): string {
    let normalized = text.toLowerCase().trim();

    // Normalize whitespace
    normalized = normalized.replace(/\s+/g, ' ');

    // Optional: Strip accents for better matching in PT/ES
    // Uncomment if you want accent-insensitive matching
    // normalized = this.stripAccents(normalized);

    return normalized;
  }

  /**
   * Strip accents from text (optional, for PT/ES matching)
   */
  private stripAccents(text: string): string {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /**
   * Escape special regex characters in a string
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Detect language from text
   * Delegates to injected ILanguageDetector
   */
  private async detectLanguage(text: string): Promise<LanguageCode> {
    return this.languageDetector.detect(text);
  }

  /**
   * Build result for ambiguous queries
   */
  private buildAmbiguousResult(
    language: LanguageCode,
    scores: IntentScore[]
  ): PredictedIntent {
    this.logger.info(
      `[IntentEngine] AMBIGUOUS query detected (highest score: ${scores[0].finalScore.toFixed(2)})`
    );

    return {
      primaryIntent: 'error', // V4: AMBIGUOUS maps to 'error' intent
      confidence: 0.3, // Low confidence for ambiguous
      language,
      metadata: {
        reason: 'No intent exceeded confidence threshold',
        isAmbiguous: true,
        topScores: scores.slice(0, 3).map(s => ({
          intent: s.intent,
          score: s.finalScore,
        })),
      },
    };
  }

  /**
   * Classify multiple texts in batch
   */
  async predictBatch(
    requests: IntentClassificationRequest[]
  ): Promise<PredictedIntent[]> {
    return Promise.all(requests.map(req => this.predict(req)));
  }

  /**
   * Get intent engine statistics
   */
  getStatistics() {
    return {
      configReady: this.intentConfig.isReady(),
      ...this.intentConfig.getStatistics(),
    };
  }
}

// Export class for DI registration (instantiate in container.ts)
export default KodaIntentEngineV3;
