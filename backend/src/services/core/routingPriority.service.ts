/**
 * KODA V3 Routing Priority Service
 *
 * Applies deterministic routing adjustments BEFORE final intent selection.
 * This handles:
 * 1. Document context boosting (when docs exist, documents intent wins)
 * 2. Intent-specific confidence floors (softer thresholds for meta intents)
 * 3. Domain dampening (legal/finance only win with strong explicit signals)
 *
 * Flow: predict scores → routingPriority.adjust() → tiebreakers → decision tree
 *
 * @version 1.0.0
 */

import { IntentName, PredictedIntent } from '../../types/intentV3.types';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Intent-specific minimum confidence thresholds.
 * Meta intents (memory, preferences) are naturally softer.
 * Domain intents (legal, finance) must be stricter.
 */
export const INTENT_CONFIDENCE_FLOORS: Record<IntentName, number> = {
  // Meta intents - lower threshold (softer)
  memory: 0.50,
  preferences: 0.50,
  conversation: 0.45,
  help: 0.50,
  edit: 0.55,

  // Document intents - medium threshold
  documents: 0.55,
  extraction: 0.60,
  file_actions: 0.55,
  reasoning: 0.60,

  // Domain intents - higher threshold (stricter)
  legal: 0.75,
  medical: 0.75,
  finance: 0.70,
  accounting: 0.70,
  engineering: 0.65,
  excel: 0.60,

  // Error - always accept
  error: 0.30,
};

/**
 * Keywords that anchor a query to the documents intent.
 * When present AND documents exist, boost documents intent.
 */
const DOCUMENT_ANCHOR_KEYWORDS = [
  // Explicit document references
  'document', 'documents', 'doc', 'docs',
  'file', 'files', 'pdf', 'report', 'reports',
  'contract', 'contracts', 'agreement',
  // Context anchors
  'this', 'the', 'that', 'those', 'these',
  'uploaded', 'my', 'our', 'in the', 'from the',
  'according to', 'based on', 'says', 'mentions',
  'in my', 'in the document', 'in this document',
  'in this', 'in that', 'from this', 'from that',
  // Action + context
  'extract from', 'list from', 'find in',
  'table', 'spreadsheet', 'annex', 'section', 'clause',
];

/**
 * Keywords that indicate EXPLICIT domain advice requests.
 * Only when these are present should domain intents win over documents.
 */
const EXPLICIT_ADVICE_PATTERNS: Record<string, RegExp[]> = {
  legal: [
    /\b(legal\s+advice|lawyer|attorney|sue|lawsuit|litigation)\b/i,
    /\b(is\s+this\s+legal|legally\s+binding)\b/i,
    /\b(my\s+rights|legal\s+options|legal\s+implications)\b/i,
  ],
  finance: [
    /\b(investment\s+advice|financial\s+advice|should\s+i\s+(buy|sell|invest))\b/i,
    /\b(stock\s+pick|portfolio|returns?|valuation)\b/i,
    /\b(is\s+this\s+a\s+good\s+investment)\b/i,
  ],
  medical: [
    /\b(medical\s+advice|diagnosis|should\s+i\s+take|treatment\s+for)\b/i,
    /\b(am\s+i\s+sick|do\s+i\s+have|symptoms\s+of)\b/i,
  ],
};

/**
 * Intents that are "domain" intents (specialized document handling).
 * These should only win over documents with strong explicit signals.
 */
const DOMAIN_INTENTS: IntentName[] = ['legal', 'medical', 'finance', 'accounting', 'engineering'];

/**
 * Meta intents that should NOT be overridden by document boosting.
 * These are explicit user actions, not document queries.
 */
const META_INTENTS: IntentName[] = ['memory', 'preferences', 'help', 'conversation', 'edit'];

/**
 * Keywords that indicate memory intent (should protect from document boost).
 * EDGE CASE C5: "told you about" must trigger memory, not legal
 * NOTE: Be specific - "that I told you" = memory recall, "what you said" = document context (not memory)
 */
const MEMORY_ANCHOR_KEYWORDS = [
  'remember', 'recall', 'you remember', 'asked you to remember',
  'what did i', 'what was the', 'what were the',
  'store', 'save', 'note that', 'keep in mind',
  // C5 fix: Memory recall patterns - USER telling ASSISTANT (not vice versa)
  'i told you', 'that i told you', 'i asked you to',
  'i mentioned', 'i said to you',
  // Explicit recall requests
  'do you remember', 'can you recall',
];

/**
 * Keywords that indicate preferences intent.
 */
const PREFERENCES_ANCHOR_KEYWORDS = [
  'prefer', 'preference', 'i like', 'i want',
  'always', 'never', 'from now on',
  'format', 'style', 'tone', 'language',
];

/**
 * Keywords that indicate the user is SETTING a preference (not just asking for formatting).
 * EDGE CASE A8: "show it in a table" is NOT preference setting, it's a document formatting request.
 */
const PREFERENCE_SETTING_PATTERNS = [
  /\bfrom now on\b/i,
  /\balways\s+(give|show|format|use)\b/i,
  /\bnever\s+(give|show|format|use)\b/i,
  /\bi prefer\b/i,
  /\bmy preference\b/i,
  /\bchange.*(format|style|tone)\b/i,
];

/**
 * Short/ambiguous query detection.
 * EDGE CASE A10: "What about the warranty?" is too short to be domain-specific.
 */
const SHORT_QUERY_THRESHOLD = 6; // words

// ============================================================================
// TYPES
// ============================================================================

export interface RoutingContext {
  hasDocuments: boolean;
  isFollowup?: boolean;
  previousIntent?: IntentName;
  userPreferences?: {
    preferredDomain?: string;
  };
}

export interface IntentScore {
  intent: IntentName;
  confidence: number;
  matchedKeywords?: string[];
  matchedPattern?: string;
}

export interface RoutingAdjustment {
  intent: IntentName;
  originalConfidence: number;
  adjustedConfidence: number;
  boost: number;
  reason: string;
}

export interface RoutingPriorityResult {
  adjustedScores: IntentScore[];
  adjustments: RoutingAdjustment[];
  primaryIntent: IntentName;
  primaryConfidence: number;
  documentBoostApplied: boolean;
  domainDampeningApplied: boolean;
  debugInfo: {
    originalPrimary: IntentName;
    documentAnchorsFound: string[];
    explicitAdviceDetected: boolean;
  };
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class RoutingPriorityService {
  private readonly logger: Console;
  private readonly debugMode: boolean;

  constructor(options?: { logger?: Console; debug?: boolean }) {
    this.logger = options?.logger || console;
    this.debugMode = options?.debug || false;
  }

  /**
   * Apply routing priority adjustments to intent scores.
   *
   * This is the main entry point. Call after initial keyword/pattern scoring,
   * before tiebreakers and final selection.
   *
   * @param scores - Array of intent scores from the engine
   * @param query - The original query text
   * @param context - Routing context (has documents, etc.)
   * @returns Adjusted scores with boost/dampening applied
   */
  adjustScores(
    scores: IntentScore[],
    query: string,
    context: RoutingContext
  ): RoutingPriorityResult {
    const adjustments: RoutingAdjustment[] = [];
    const normalizedQuery = query.toLowerCase().trim();

    // Find original primary intent
    const sortedOriginal = [...scores].sort((a, b) => b.confidence - a.confidence);
    const originalPrimary = sortedOriginal[0]?.intent || 'error';

    // Step 1: Find document anchors in query
    const documentAnchorsFound = this.findDocumentAnchors(normalizedQuery);
    const hasDocumentAnchor = documentAnchorsFound.length > 0;

    // Step 2: Check for explicit advice requests
    const explicitAdviceDetected = this.detectExplicitAdviceRequest(normalizedQuery);

    // Step 3: Check for meta intent anchors (memory, preferences)
    const memoryAnchors = this.findMetaIntentAnchors(normalizedQuery, MEMORY_ANCHOR_KEYWORDS);
    const preferencesAnchors = this.findMetaIntentAnchors(normalizedQuery, PREFERENCES_ANCHOR_KEYWORDS);
    const hasMetaIntentAnchor = memoryAnchors.length > 0 || preferencesAnchors.length > 0;

    // Step 4: Synthesize documents score if missing but document context exists
    let workingScores = [...scores];
    const hasDocumentsIntent = scores.some(s => s.intent === 'documents');
    if (context.hasDocuments && hasDocumentAnchor && !hasDocumentsIntent) {
      // Synthesize a documents score based on anchor strength
      const syntheticScore = 0.60 + (documentAnchorsFound.length * 0.05);
      workingScores.push({
        intent: 'documents' as IntentName,
        confidence: Math.min(syntheticScore, 0.85),
      });
      if (this.debugMode) {
        this.logger.info(
          `[RoutingPriority] Synthesized documents score: ${syntheticScore.toFixed(2)} (anchors: ${documentAnchorsFound.join(', ')})`
        );
      }
    }

    // Step 4.5: Synthesize memory score if missing but memory anchors found (EDGE CASE C5)
    const hasMemoryIntent = scores.some(s => s.intent === 'memory');
    if (memoryAnchors.length > 0 && !hasMemoryIntent) {
      // Synthesize a memory score based on anchor strength
      const syntheticMemoryScore = 0.70 + (memoryAnchors.length * 0.05);
      workingScores.push({
        intent: 'memory' as IntentName,
        confidence: Math.min(syntheticMemoryScore, 0.90),
      });
      if (this.debugMode) {
        this.logger.info(
          `[RoutingPriority] Synthesized memory score: ${syntheticMemoryScore.toFixed(2)} (anchors: ${memoryAnchors.join(', ')})`
        );
      }
    }

    // Step 5: Apply adjustments to each score
    const adjustedScores = workingScores.map(score => {
      let adjustedConfidence = score.confidence;
      let boost = 0;
      let reason = '';

      // Rule 0: Protect meta intents when explicitly triggered
      // Memory and preferences should win when their anchors are present
      if (score.intent === 'memory' && memoryAnchors.length > 0) {
        // Strong boost for memory when anchors present (EDGE CASE C5)
        boost = 0.40;
        reason = 'Memory anchor detected (strong boost)';
        adjustedConfidence = Math.min(adjustedConfidence + boost, 1.0);
      }
      if (score.intent === 'preferences' && preferencesAnchors.length > 0) {
        boost = 0.20;
        reason = 'Preferences anchor detected';
        adjustedConfidence = Math.min(adjustedConfidence + boost, 1.0);
      }

      // Rule 1: Document Context Boosting (ONLY when no meta intent anchor)
      if (context.hasDocuments && score.intent === 'documents' && !hasMetaIntentAnchor) {
        if (hasDocumentAnchor) {
          // Strong boost when query explicitly references documents
          boost = 0.25;
          reason = 'Document anchor + context boost';
        } else {
          // Mild boost when documents exist
          boost = 0.10;
          reason = 'Document context boost';
        }
        adjustedConfidence = Math.min(adjustedConfidence + boost, 1.0);
      }

      // Rule 1.5: Extra document boost when extraction keywords present (EDGE CASE A8)
      // "Extract the pricing information" with document context should go to documents
      const hasExtractionKeywords = /\b(extract|pull|get|list|find|show)\s+(all\s+)?(the\s+)?\w+/i.test(normalizedQuery);
      if (context.hasDocuments && score.intent === 'documents' && hasExtractionKeywords && hasDocumentAnchor) {
        const extraBoost = 0.30;
        boost = boost + extraBoost;
        reason = reason ? `${reason} + extraction context boost` : 'Document boost (extraction with context)';
        adjustedConfidence = Math.min(adjustedConfidence + extraBoost, 1.0);
      }

      // Rule 2: Domain Dampening (when documents exist and no explicit advice request)
      if (context.hasDocuments && DOMAIN_INTENTS.includes(score.intent)) {
        if (!explicitAdviceDetected) {
          // Dampen domain intents when we're just reading documents
          boost = -0.15;
          reason = 'Domain dampened (reading, not advice)';
          adjustedConfidence = Math.max(adjustedConfidence + boost, 0);
        }
      }

      // Rule 3: Extraction dampening when documents exist
      // EDGE CASE A8: "Extract the pricing information and show it in a table" should go to documents
      if (context.hasDocuments && score.intent === 'extraction') {
        // Very aggressive dampening for extraction when documents exist
        // "Extract values from table" when docs exist → documents intent
        if (hasDocumentAnchor) {
          // Very strong dampening when document anchor present
          // A8 fix: Increase dampening to ensure documents wins over extraction
          boost = -0.80;
          reason = 'Extraction dampened (document anchor present)';
        } else {
          // Moderate dampening otherwise
          boost = -0.45;
          reason = 'Extraction dampened (document context)';
        }
        adjustedConfidence = Math.max(adjustedConfidence + boost, 0);
      }

      // Rule 3.5: Preferences dampening (EDGE CASE A8)
      // "show it in a table" is document formatting, not preference setting
      if (context.hasDocuments && score.intent === 'preferences') {
        const isActualPreferenceSetting = PREFERENCE_SETTING_PATTERNS.some(p => p.test(normalizedQuery));
        if (!isActualPreferenceSetting && hasDocumentAnchor) {
          // Strong dampening: this is a document formatting request, not preference setting
          boost = -0.50;
          reason = 'Preferences dampened (document formatting, not preference setting)';
          adjustedConfidence = Math.max(adjustedConfidence + boost, 0);
        }
      }

      // Rule 3.6: Stronger domain dampening for short/ambiguous queries (EDGE CASE A10)
      // "What about the warranty?" is too short to be domain-specific advice request
      if (context.hasDocuments && DOMAIN_INTENTS.includes(score.intent)) {
        const wordCount = normalizedQuery.split(/\s+/).length;
        const isShortQuery = wordCount <= SHORT_QUERY_THRESHOLD;
        if (isShortQuery && !explicitAdviceDetected) {
          // Extra dampening for short queries - they're likely document questions
          const extraDampening = -0.20;
          boost = boost + extraDampening; // Stack with existing dampening
          reason = reason ? `${reason} + short query penalty` : 'Domain dampened (short/ambiguous query)';
          adjustedConfidence = Math.max(adjustedConfidence + extraDampening, 0);
        }
      }

      // Rule 3.7: Conversation/Help dampening when document context exists (EDGE CASE A8)
      // Document queries with document anchors should not route to conversation or help
      if (context.hasDocuments && (score.intent === 'conversation' || score.intent === 'help') && hasDocumentAnchor) {
        boost = -0.40;
        reason = `${score.intent} dampened (document context with anchors)`;
        adjustedConfidence = Math.max(adjustedConfidence + boost, 0);
      }

      // Rule 3.8: Domain dampening when memory anchors present (EDGE CASE C5)
      // "that I told you about" means user is recalling stored info, not asking domain advice
      if (memoryAnchors.length > 0 && DOMAIN_INTENTS.includes(score.intent)) {
        const extraDampening = -0.40;
        boost = boost + extraDampening;
        reason = reason ? `${reason} + memory context penalty` : 'Domain dampened (memory recall context)';
        adjustedConfidence = Math.max(adjustedConfidence + extraDampening, 0);
      }

      // Rule 3.9: Documents dampening when memory recall detected (EDGE CASE C5)
      // "When does contract expire that I told you about?" → memory, not documents
      // User is asking about something THEY stored, not something from uploaded docs
      if (memoryAnchors.length > 0 && score.intent === 'documents') {
        const memoryRecallDampening = -0.50;
        boost = boost + memoryRecallDampening;
        reason = reason ? `${reason} + memory recall context penalty` : 'Documents dampened (user is recalling stored info)';
        adjustedConfidence = Math.max(adjustedConfidence + memoryRecallDampening, 0);
      }

      // Rule 4: Apply confidence floors
      const floor = INTENT_CONFIDENCE_FLOORS[score.intent];
      if (adjustedConfidence < floor) {
        // Below floor, but don't zero out - just note it
        if (this.debugMode) {
          this.logger.warn(
            `[RoutingPriority] ${score.intent} below floor: ${adjustedConfidence.toFixed(2)} < ${floor}`
          );
        }
      }

      // Track adjustment if changed
      if (boost !== 0) {
        adjustments.push({
          intent: score.intent,
          originalConfidence: score.confidence,
          adjustedConfidence,
          boost,
          reason,
        });
      }

      return {
        ...score,
        confidence: adjustedConfidence,
      };
    });

    // Sort by adjusted confidence
    adjustedScores.sort((a, b) => b.confidence - a.confidence);

    const primaryIntent = adjustedScores[0]?.intent || 'error';
    const primaryConfidence = adjustedScores[0]?.confidence || 0;

    // Log if primary changed
    if (this.debugMode && primaryIntent !== originalPrimary) {
      this.logger.info(
        `[RoutingPriority] Primary changed: ${originalPrimary} → ${primaryIntent}`
      );
    }

    return {
      adjustedScores,
      adjustments,
      primaryIntent,
      primaryConfidence,
      documentBoostApplied: adjustments.some(a => a.boost > 0 && a.intent === 'documents'),
      domainDampeningApplied: adjustments.some(a => a.boost < 0 && DOMAIN_INTENTS.includes(a.intent)),
      debugInfo: {
        originalPrimary,
        documentAnchorsFound,
        explicitAdviceDetected,
      },
    };
  }

  /**
   * Find document anchor keywords in query.
   */
  private findDocumentAnchors(query: string): string[] {
    return DOCUMENT_ANCHOR_KEYWORDS.filter(anchor => query.includes(anchor));
  }

  /**
   * Find meta intent anchor keywords in query.
   */
  private findMetaIntentAnchors(query: string, anchors: string[]): string[] {
    return anchors.filter(anchor => query.includes(anchor));
  }

  /**
   * Detect if query is an explicit advice request (legal, financial, medical).
   */
  private detectExplicitAdviceRequest(query: string): boolean {
    for (const patterns of Object.values(EXPLICIT_ADVICE_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(query)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Check if intent meets its confidence floor.
   */
  meetsConfidenceFloor(intent: IntentName, confidence: number): boolean {
    const floor = INTENT_CONFIDENCE_FLOORS[intent];
    return confidence >= floor;
  }

  /**
   * Get the confidence floor for an intent.
   */
  getConfidenceFloor(intent: IntentName): number {
    return INTENT_CONFIDENCE_FLOORS[intent];
  }

  /**
   * Quick check: should documents intent win given context?
   * Useful for simple binary decisions.
   */
  shouldDocumentsWin(
    query: string,
    documentsScore: number,
    competingIntent: IntentName,
    competingScore: number,
    hasDocuments: boolean
  ): { shouldWin: boolean; reason: string } {
    if (!hasDocuments) {
      return { shouldWin: false, reason: 'No documents in context' };
    }

    const normalizedQuery = query.toLowerCase();
    const hasAnchor = this.findDocumentAnchors(normalizedQuery).length > 0;
    const isExplicitAdvice = this.detectExplicitAdviceRequest(normalizedQuery);

    // If competing intent is a domain intent
    if (DOMAIN_INTENTS.includes(competingIntent)) {
      if (isExplicitAdvice) {
        return { shouldWin: false, reason: 'Explicit advice request detected' };
      }
      if (hasAnchor) {
        return { shouldWin: true, reason: 'Document anchor present, domain dampened' };
      }
      // Close competition - documents should win by default
      if (documentsScore + 0.15 >= competingScore) {
        return { shouldWin: true, reason: 'Documents wins close domain competition' };
      }
    }

    // If competing intent is extraction
    if (competingIntent === 'extraction' && hasAnchor) {
      return { shouldWin: true, reason: 'Document-anchored extraction → documents' };
    }

    // Default: let confidence decide
    if (documentsScore >= competingScore) {
      return { shouldWin: true, reason: 'Higher confidence' };
    }

    return { shouldWin: false, reason: 'Competing intent has higher confidence' };
  }
}

// Export singleton
export const routingPriorityService = new RoutingPriorityService();

export default RoutingPriorityService;
