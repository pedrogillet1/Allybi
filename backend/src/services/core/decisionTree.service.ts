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

import { PredictedIntent, IntentName } from '../../types/intentV3.types';
import { runtimePatterns } from './runtimePatterns.service';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Family categories for routing (maps to high-level intents)
 */
export type DecisionFamily =
  | 'documents'    // Document Q&A, search, summarize, analytics, management
  | 'files'        // File discovery: "where is X", "open file X", navigation
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
  | 'recommend'    // Which file should I read to understand X
  // Edit sub-intents
  | 'rewrite'      // General rewrite
  | 'simplify'     // Make simpler
  | 'expand'       // Add more details
  | 'continue'     // Continue previous answer
  | 'translate'    // Translate text
  | 'format'       // Format text
  // Help sub-intents
  | 'tutorial'     // Getting started, tutorials
  | 'feature'      // Feature discovery
  | 'capability'   // What can you do / how does Koda work
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
  depth?: string;  // Optional depth level (D1, D2, D3, etc.)
}

/**
 * Signals used for decision making
 */
export interface DecisionSignals {
  predicted: PredictedIntent;
  hasDocs: boolean;
  isRewrite?: boolean;
  isFollowup?: boolean;
  /** Previous turn's intent - used to block help when in doc context */
  previousIntent?: IntentName;
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

  // Recommend patterns - "which file should I read to understand X"
  recommend: /\b(which|what)\s+(file|document)\s+should\s+(i|we)\s+read|should\s+read\s+to\s+understand|recommend\s+(a\s+)?(file|document)|best\s+(file|document)\s+(to|for)\b/i,

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

  // Continue patterns (must check before expand since "go on" could be ambiguous)
  continue: /\b(continue|go\s*on|keep\s*going|continue\s*that|prosseguir|continuar|seguir|sigue)\b/i,

  // Help patterns
  tutorial: /\b(tutorial|getting\s*started|how\s*to\s*(use|start|begin)|guide|walkthrough)\w*/i,
  feature: /\b(feature|can\s*(you|koda|it)|how\s*do\s*i|what\s*can)\w*/i,  // Removed where\s*is - now handled by file patterns
  // CHATGPT_PARITY: Strong pattern for capability questions - must route to help, not documents
  capability: /\b(what\s+can\s+(you|i|koda)\s+do|what\s+do\s+you\s+do|how\s+does\s+koda\s+work|what\s+are\s+your\s+capabilit|o\s+que\s+você\s+pode\s+fazer|como\s+funciona|o\s+que\s+o\s+koda\s+faz|qué\s+puedes\s+hacer)\b/i,
  upload: /\b(upload|how\s*to\s*upload|add\s*(file|document))\w*/i,

  // Document references
  docReference: /\b(doc|file|pdf|report|document|spreadsheet|excel|word)\w*/i,

  // File action patterns (file discovery, navigation)
  fileLocation: /\b(where\s*(is|are)|which\s*folder|locate)\w*/i,
  fileFind: /\b(find|search\s*for)\s+(the\s+)?[\w\s]+\s*(file|document|pdf|xlsx?|docx?)\b/i,
  fileWhich: /\bwhich\s+(file|document|pdf)\s+(mentions?|contains?|has|talks?\s*about|says?)\b/i,
  fileOpen: /\b(open|preview)\s+(the\s+)?[\w\s]+\.?(pdf|xlsx?|docx?|pptx?)\b/i,  // Dot optional before extension
  fileOpenGeneric: /\b(open|preview)\s+(the\s+)?(file|document)\s+/i,
  fileFollowup: /\b(open\s*(it|that\s*one|this\s*one|the\s*(second|first|third|last)\s*(file|one)?)|show\s*(it|that|this)|that\s*one|this\s*one)\b/i,
};

// ============================================================================
// DECISION FUNCTION
// ============================================================================

/**
 * Main decision function.
 * Routes through family → sub-intent based on signals.
 */
export function decide(signals: DecisionSignals): DecisionResult {
  const { predicted, hasDocs, isRewrite, previousIntent } = signals;

  // Combine keywords and patterns for text analysis
  const keywords = predicted.matchedKeywords || [];
  const text = keywords.join(' ').toLowerCase();
  const rawQuery = predicted.metadata?.rawQuery?.toLowerCase() || text;
  const combinedText = `${text} ${rawQuery}`;

  // Stage 1: Determine family
  const family = determineFamily(predicted, hasDocs, combinedText, isRewrite, previousIntent);

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
  isRewrite?: boolean,
  previousIntent?: IntentName
): DecisionFamily {
  const intent = predicted.primaryIntent;

  // Document-related intents for context checking
  const DOC_FAMILY_INTENTS: IntentName[] = ['documents', 'extraction', 'reasoning', 'excel', 'finance', 'legal', 'medical', 'engineering', 'accounting'];
  const wasDocContext = previousIntent && DOC_FAMILY_INTENTS.includes(previousIntent);

  // Check for rewrite/edit patterns first
  // CHATGPT_PARITY Q19 FIX: Don't route to 'edit' for format if there's a document operator
  // "summarize in paragraph format" = documents + format constraint, NOT edit
  const hasDocOperator = PATTERNS.summary.test(text) || PATTERNS.extract.test(text) ||
                         PATTERNS.compare.test(text) || PATTERNS.analytics.test(text) ||
                         /\b(explain|describe|list|show)\s+(what|the|all)\b/i.test(text);
  const formatButWithDocOp = PATTERNS.format.test(text) && hasDocOperator;

  if (isRewrite || PATTERNS.rewrite.test(text) || PATTERNS.simplify.test(text) ||
      PATTERNS.expand.test(text) || PATTERNS.translate.test(text) ||
      (PATTERNS.format.test(text) && !formatButWithDocOp)) {
    return 'edit';
  }

  // *** CHECK FOR FILE ACTIONS BEFORE HELP ***
  // This prevents "where is X" from being routed to help
  // CHATGPT_PARITY Q28 FIX: But NOT for formula/cell/function queries which should go to documents/excel
  const isSpreadsheetContentQuery = /\b(formula|cell|function|vlookup|sumif|pivot|macro)\b/i.test(text);

  if (intent === 'file_actions' && !isSpreadsheetContentQuery) {
    return 'files';
  }

  // Check for file action patterns using runtimePatterns (multi-language support)
  // Detects the query language and checks against compiled bank patterns
  const rawQuery = predicted.metadata?.rawQuery || text;
  const detectedLang = predicted.metadata?.detectedLanguage || 'en';
  const isFileActionPattern =
    runtimePatterns.isFileActionQuery(rawQuery, detectedLang) ||
    runtimePatterns.isLocationQuery(rawQuery, detectedLang) ||
    // Legacy fallback for common patterns
    PATTERNS.fileLocation.test(text) ||
    PATTERNS.fileOpen.test(text) ||
    PATTERNS.fileOpenGeneric.test(text) ||
    PATTERNS.fileFollowup.test(text);

  if (isFileActionPattern && !isSpreadsheetContentQuery) {
    // Only treat as file action if it seems to be asking about a specific file
    // NOT if it's asking about a Koda feature ("where is the upload button")
    const isAboutKodaFeature = /\b(button|feature|option|setting|menu)\w*/i.test(text);
    if (!isAboutKodaFeature) {
      return 'files';
    }
  }

  // Check for help patterns
  // CRITICAL FIX: Block help when previous turn was document-related (HELP MISROUTE FIX)
  const hasExplicitHelpKeyword = /\b(help|ajuda|ayuda)\b/i.test(text) ||
    /\bhow\s+do\s+i\s+use\s+koda\b/i.test(text) ||
    /\bcomo\s+usar\s+koda\b/i.test(text) ||
    /\bcómo\s+usar\s+koda\b/i.test(text) ||
    /\bwhat\s+is\s+koda\b/i.test(text) ||
    /\bo\s+que\s+.{0,3}\s*koda\b/i.test(text) ||
    /\bqué\s+es\s+koda\b/i.test(text) ||
    /\bupload\b/i.test(text);

  if (PATTERNS.upload.test(text) || PATTERNS.tutorial.test(text) ||
      (PATTERNS.feature.test(text) && !PATTERNS.docReference.test(text))) {
    // If previous turn was doc-related and no explicit help keyword, don't return help
    if (wasDocContext && hasDocs && !hasExplicitHelpKeyword) {
      // Fall through to documents routing instead
    } else {
      return 'help';
    }
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
      // CRITICAL FIX: If previous turn was doc-related and user has docs,
      // route to documents instead of help (HELP MISROUTE FIX)
      if (wasDocContext && hasDocs && !hasExplicitHelpKeyword) {
        return 'documents';
      }
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
      // CRITICAL FIX: Block extraction when previous turn was doc-related (q14, q16 fix)
      // If user was just talking about documents and has docs, route to documents not extraction
      if (wasDocContext && hasDocs && !hasExplicitHelpKeyword) {
        return 'documents';
      }
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

    case 'files':
      return determineFileSubIntent(text);

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
  // Check recommend FIRST - "which file should I read to understand X"
  // This must come before manage/search to avoid misrouting
  if (PATTERNS.recommend.test(text)) return 'recommend';
  if (PATTERNS.summary.test(text)) return 'summary';
  if (PATTERNS.compare.test(text)) return 'compare';
  if (PATTERNS.analytics.test(text)) return 'analytics';
  if (PATTERNS.extract.test(text)) return 'extract';
  if (PATTERNS.manage.test(text)) return 'manage';
  if (PATTERNS.search.test(text)) return 'search';
  return 'factual';
}

/**
 * Determine sub-intent for files family (file discovery/navigation)
 */
function determineFileSubIntent(text: string): DecisionSubIntent {
  // Location query: "where is X", "which folder"
  if (PATTERNS.fileLocation.test(text)) return 'search';
  // Find query: "find the X file"
  if (PATTERNS.fileFind.test(text)) return 'search';
  // Open/preview query: "open X.pdf", "open file X"
  if (PATTERNS.fileOpen.test(text) || PATTERNS.fileOpenGeneric.test(text)) return 'manage';
  // Follow-up: "open it", "that one"
  if (PATTERNS.fileFollowup.test(text)) return 'manage';
  return 'search';
}

/**
 * Determine sub-intent for edit family
 */
function determineEditSubIntent(text: string): DecisionSubIntent {
  // Continue must be checked BEFORE expand since "go on" could match expand
  if (PATTERNS.continue.test(text)) return 'continue';
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
  // Capability questions should route to help with 'capability' sub-intent
  if (PATTERNS.capability.test(text)) return 'capability';
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
