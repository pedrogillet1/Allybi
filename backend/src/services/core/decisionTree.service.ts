/**
 * Decision Tree Service
 *
 * Provides decision-based routing using family (intent) and sub-intent classification.
 * Routes requests through family → sub-intent for granular control.
 *
 * This enables:
 * - More granular control over response handling
 * - Better sub-intent detection within intent families
 * - Cleaner routing logic in orchestrator
 *
 * Used by: kodaOrchestratorV3.service.ts
 */

import { PredictedIntent } from '../../types/intentV3.types';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Family categories for routing (maps to high-level intents)
 */
export type DecisionFamily =
  | 'documents'    // Document Q&A, search, summarize, analytics, management
  | 'help'         // Product help, onboarding, feature requests
  | 'edit'         // Answer rewrite/expand/simplify, text transforms
  | 'conversation' // Chitchat, feedback, greetings
  | 'reasoning'    // Math, logic, calculations, general knowledge
  | 'memory'       // Store and recall user information
  | 'preferences'  // User settings, language, tone, role
  | 'extraction'   // Data extraction, meta-AI queries
  | 'error';       // Out of scope, ambiguous, safety, no documents

/**
 * Sub-intent within a family
 */
export type DecisionSubIntent =
  // Documents sub-intents
  | 'factual'      // Direct Q&A from documents
  | 'summary'      // Summarize document(s)
  | 'compare'      // Compare documents or sections
  | 'analytics'    // Counts, statistics, lists
  | 'extract'      // Extract specific clauses/sections/quotes
  | 'manage'       // List files, show documents, folders
  | 'search'       // Search across documents
  // Edit sub-intents
  | 'rewrite'      // General rewrite
  | 'simplify'     // Make simpler
  | 'expand'       // Add more details
  | 'translate'    // Translate text
  | 'format'       // Format text
  // Help sub-intents
  | 'tutorial'     // Getting started, tutorials
  | 'feature'      // Feature discovery
  | 'product'      // General product help
  // Error sub-intents
  | 'no_document'  // User has no documents
  | 'not_found'    // Document not found
  | 'ambiguous'    // Query too vague
  | 'out_of_scope' // Harmful/illegal requests
  // Generic
  | 'general';     // Default sub-intent

/**
 * Result of the decision tree
 */
export interface DecisionResult {
  family: DecisionFamily;
  subIntent: DecisionSubIntent;
  confidence: number;
  reason: string;
}

/**
 * Signals used for decision making
 */
export interface DecisionSignals {
  predicted: PredictedIntent;
  hasDocs: boolean;
  isRewrite?: boolean;
  isFollowup?: boolean;
}

// ============================================================================
// PATTERN MATCHERS
// ============================================================================

const PATTERNS = {
  // Summary patterns
  summary: /\b(summar|overview|recap|tldr|tl;dr|brief|gist|outline)\w*/i,

  // Compare patterns
  compare: /\b(compar|vs\.?|versus|difference|differ|contrast|between)\w*/i,

  // Analytics patterns
  analytics: /\b(analy[sz]|calc|count|statistic|metric|number|how many|total|average|sum)\w*/i,

  // Extract patterns
  extract: /\b(extract|clause|section|quote|passage|paragraph|table|figure|chart)\w*/i,

  // Document management patterns
  manage: /\b(list\s*(all|my)?\s*(files?|docs?|documents?)|show\s*(all|my)?\s*(files?|docs?)|folders?|rename|delete|tag)\w*/i,

  // Search patterns
  search: /\b(search|find|look\s*for|locate|where\s*is)\w*/i,

  // Rewrite patterns
  rewrite: /\b(rewrite|rephrase|reword|say\s*(it|that)\s*(differently|another\s*way))\w*/i,

  // Simplify patterns
  simplify: /\b(simplif|simpler|easier|explain\s*(like|as\s*if)|eli5|layman)\w*/i,

  // Expand patterns
  expand: /\b(expand|more\s*(detail|info)|elaborate|explain\s*more|tell\s*me\s*more)\w*/i,

  // Translate patterns
  translate: /\b(translat|in\s*(english|portuguese|spanish|french|german))\w*/i,

  // Format patterns
  format: /\b(format|bullet|list\s*form|table\s*form|markdown|json|csv)\w*/i,

  // Help patterns
  tutorial: /\b(tutorial|getting\s*started|how\s*to\s*(use|start|begin)|guide|walkthrough)\w*/i,
  feature: /\b(feature|where\s*is|can\s*(you|koda|it)|how\s*do\s*i|what\s*can)\w*/i,
  upload: /\b(upload|how\s*to\s*upload|add\s*(file|document))\w*/i,

  // Document references
  docReference: /\b(doc|file|pdf|report|document|spreadsheet|excel|word)\w*/i,
};

// ============================================================================
// DECISION FUNCTION
// ============================================================================

/**
 * Main decision function.
 * Routes through family → sub-intent based on signals.
 */
export function decide(signals: DecisionSignals): DecisionResult {
  const { predicted, hasDocs, isRewrite } = signals;

  // Combine keywords and patterns for text analysis
  const keywords = predicted.matchedKeywords || [];
  const text = keywords.join(' ').toLowerCase();
  const rawQuery = predicted.metadata?.rawQuery?.toLowerCase() || text;
  const combinedText = `${text} ${rawQuery}`;

  // Stage 1: Determine family
  const family = determineFamily(predicted, hasDocs, combinedText, isRewrite);

  // Stage 2: Determine sub-intent within family
  const subIntent = determineSubIntent(family, combinedText, predicted);

  // Build reason string for debugging
  const reason = `family=${family};sub=${subIntent};conf=${predicted.confidence.toFixed(2)}`;

  return {
    family,
    subIntent,
    confidence: predicted.confidence,
    reason,
  };
}

/**
 * Stage 1: Determine the family (high-level intent category)
 */
function determineFamily(
  predicted: PredictedIntent,
  hasDocs: boolean,
  text: string,
  isRewrite?: boolean
): DecisionFamily {
  const intent = predicted.primaryIntent;

  // Check for rewrite/edit patterns first
  if (isRewrite || PATTERNS.rewrite.test(text) || PATTERNS.simplify.test(text) ||
      PATTERNS.expand.test(text) || PATTERNS.translate.test(text) || PATTERNS.format.test(text)) {
    return 'edit';
  }

  // Check for help patterns
  if (PATTERNS.upload.test(text) || PATTERNS.tutorial.test(text) ||
      (PATTERNS.feature.test(text) && !PATTERNS.docReference.test(text))) {
    return 'help';
  }

  // Check for document-related queries without documents
  if (!hasDocs && PATTERNS.docReference.test(text)) {
    return 'error';
  }

  // Check for summary patterns (documents family)
  if (PATTERNS.summary.test(text)) {
    return hasDocs ? 'documents' : 'error';
  }

  // Map intent to family
  switch (intent) {
    case 'documents':
    case 'excel':
    case 'accounting':
    case 'engineering':
    case 'finance':
    case 'legal':
    case 'medical':
      return hasDocs ? 'documents' : 'error';

    case 'help':
      return 'help';

    case 'edit':
      return 'edit';

    case 'conversation':
      return 'conversation';

    case 'reasoning':
      return 'reasoning';

    case 'memory':
      return 'memory';

    case 'preferences':
      return 'preferences';

    case 'extraction':
      return 'extraction';

    case 'error':
      return 'error';

    default:
      // Fallback: if query mentions documents but user has none
      if (!hasDocs && PATTERNS.docReference.test(text)) {
        return 'error';
      }
      return hasDocs ? 'documents' : 'conversation';
  }
}

/**
 * Stage 2: Determine the sub-intent within the family
 */
function determineSubIntent(
  family: DecisionFamily,
  text: string,
  predicted: PredictedIntent
): DecisionSubIntent {

  switch (family) {
    case 'documents':
      return determineDocumentSubIntent(text);

    case 'edit':
      return determineEditSubIntent(text);

    case 'help':
      return determineHelpSubIntent(text);

    case 'error':
      return determineErrorSubIntent(text, predicted);

    case 'conversation':
    case 'reasoning':
    case 'memory':
    case 'preferences':
    case 'extraction':
    default:
      return 'general';
  }
}

/**
 * Determine sub-intent for documents family
 */
function determineDocumentSubIntent(text: string): DecisionSubIntent {
  if (PATTERNS.summary.test(text)) return 'summary';
  if (PATTERNS.compare.test(text)) return 'compare';
  if (PATTERNS.analytics.test(text)) return 'analytics';
  if (PATTERNS.extract.test(text)) return 'extract';
  if (PATTERNS.manage.test(text)) return 'manage';
  if (PATTERNS.search.test(text)) return 'search';
  return 'factual';
}

/**
 * Determine sub-intent for edit family
 */
function determineEditSubIntent(text: string): DecisionSubIntent {
  if (PATTERNS.simplify.test(text)) return 'simplify';
  if (PATTERNS.expand.test(text)) return 'expand';
  if (PATTERNS.translate.test(text)) return 'translate';
  if (PATTERNS.format.test(text)) return 'format';
  return 'rewrite';
}

/**
 * Determine sub-intent for help family
 */
function determineHelpSubIntent(text: string): DecisionSubIntent {
  if (PATTERNS.tutorial.test(text)) return 'tutorial';
  if (PATTERNS.feature.test(text)) return 'feature';
  return 'product';
}

/**
 * Determine sub-intent for error family
 */
function determineErrorSubIntent(text: string, predicted: PredictedIntent): DecisionSubIntent {
  // Check if it's a safety concern
  if (predicted.primaryIntent === 'error' && predicted.metadata?.safetyFlag) {
    return 'out_of_scope';
  }

  // Check if document reference without docs
  if (PATTERNS.docReference.test(text)) {
    return 'no_document';
  }

  return 'ambiguous';
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if decision requires RAG retrieval
 */
export function requiresRetrieval(decision: DecisionResult): boolean {
  const retrievalFamilies: DecisionFamily[] = ['documents'];
  const retrievalSubIntents: DecisionSubIntent[] = [
    'factual', 'summary', 'compare', 'analytics', 'extract', 'search'
  ];

  return retrievalFamilies.includes(decision.family) &&
         retrievalSubIntents.includes(decision.subIntent);
}

/**
 * Check if decision is an error state
 */
export function isErrorDecision(decision: DecisionResult): boolean {
  return decision.family === 'error';
}

/**
 * Get fallback scenario key from decision
 */
export function getFallbackScenario(decision: DecisionResult): string | undefined {
  if (decision.family !== 'error') return undefined;

  switch (decision.subIntent) {
    case 'no_document':
      return 'NO_DOCUMENTS';
    case 'not_found':
      return 'RETRIEVAL_ERROR';
    case 'ambiguous':
      return 'AMBIGUOUS_QUESTION';
    case 'out_of_scope':
      return 'OUT_OF_SCOPE';
    default:
      return 'AMBIGUOUS_QUESTION';
  }
}

export default { decide, requiresRetrieval, isErrorDecision, getFallbackScenario };
