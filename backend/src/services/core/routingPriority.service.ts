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
 * Keywords that anchor a query to file_actions intent.
 * These indicate the user wants to navigate/find/open a file, not query its contents.
 */
const FILE_ACTION_ANCHOR_KEYWORDS = [
  'where is', 'find file', 'find document', 'open file', 'open document',
  'show me file', 'show me the file', 'locate', 'where can i find',
  'which folder', 'what folder', 'search files', 'search for file',
  'preview file', 'open it', 'show it', 'find it', 'where is it',
  'where did i save', 'where did i put', 'where is my',
  // Listing patterns - route to file_actions
  'list all', 'list the files', 'list the documents', 'list files',
  'only show spreadsheets', 'only show pdfs', 'just list',
  'list what is there', 'go back to', 'go back to koda',
  // FOLDER CONTENTS patterns - critical for Q53-Q56, Q60
  'list the contents', 'list contents', 'folder contents', 'list only test',
  'confirm all original files', 'files are still present', 'still present',
  // Folder navigation
  'navigate to folder', 'open folder', 'go to folder',
  // File type queries - CRITICAL for Q9, Q10, Q17, Q19
  'find all spreadsheets', 'find spreadsheets', 'show spreadsheets',
  'find excel', 'show excel', 'find xlsx', 'show xlsx files',
  'open the', 'where would i find',
  'what other files', 'other files in', 'same folder',
  // SEMANTIC FILE QUERIES - "open the fund doc", "show me the budget spreadsheet"
  'open the fund', 'open the budget', 'the marketing doc', 'the scrum',
];

/**
 * Patterns that strongly indicate file_actions intent.
 * When matched, file_actions should win over documents/extraction/help.
 */
const FILE_ACTION_PATTERNS: RegExp[] = [
  /\bwhere\s+(is|are)\s+(my\s+)?(the\s+)?(file|document|pdf|contract|report|spreadsheet|budget)\b/i,
  /\bwhere\s+is\s+(my\s+)?(the\s+)?[\w\s]+\.(pdf|docx?|xlsx?|pptx?|txt|csv)\b/i,
  /\bwhere\s+is\s+(my\s+)?(the\s+)?[\w\s]+(spreadsheet|budget|file|document)\b/i,
  /\b(find|locate|search\s+for)\s+(the\s+)?(file|document)\s+\w+/i,
  /\b(open|show|preview)\s+(me\s+)?(the\s+)?(file|document)\s+\w+/i,
  /\b(open|show|preview|find)\s+it\b/i,
  /\bwhere\s+(is|are)\s+(it|that|this)\b/i,
  /\bwhich\s+folder\s+(is|has|contains)\b/i,
  /\bwhere\s+did\s+(i|we)\s+(save|put|upload)\b/i,
  /\bshow\s+me\s+[\w\s]+\.(pdf|docx?|xlsx?|pptx?)\b/i,
  /\bopen\s+[\w\s]+\.(pdf|docx?|xlsx?|pptx?)\b/i,
  // CRITICAL: Catch "Open X.pdf" and "Open X.xlsx" with underscores/dashes in filename
  /\bopen\s+[\w_-]+\.(pdf|docx?|xlsx?|xls|pptx?|csv|txt)\b/i,
  // ULTRA-PERMISSIVE: "Open filename.ext" where filename can contain ANY characters
  // Use non-greedy .+? to avoid consuming the extension, and (?:\b|\.?$) to allow trailing punctuation
  /\bopen\s+.+?\.(pdf|docx?|xlsx?|xls|pptx?|csv|txt|png|jpe?g)(?:\b|\.?$)/i,
  // "Open X.pdf again" - handle "again" at the end
  /\bopen\s+.+?\.(pdf|docx?|xlsx?|xls|pptx?)\s+again\b/i,
  // "Again" patterns - re-show last referenced file
  /\bagain\.?$/i,
  /\b(show|open)\s+(me\s+)?.*\s+again\b/i,
  /\bthe\s+(older|newer|other|previous)\s+(one|file)\b/i,
  // FILE LISTING PATTERNS - critical for Q16, Q17, Q23, Q25
  /\blist\s+(all\s+)?(the\s+)?(files?|documents?)\s+in\s+/i,          // "List all documents in X folder"
  /\blist\s+(all\s+)?(the\s+)?(files?|documents?)\.?$/i,              // "List the files."
  /\blist\s+what\s+is\s+(there|in\s+there)/i,                         // "List what is there"
  /\b(only\s+)?(show|list)\s+(only\s+)?(spreadsheets?|pdfs?|images?|documents?)/i, // "Only show spreadsheets"
  /\bgo\s+back\s+to\s+.+\s+(and\s+)?list/i,                           // "Go back to X and list"
  /\bjust\s+list\s+(the\s+)?files?/i,                                 // "Just list the files"
  // FOLDER CONTENTS PATTERNS - critical for Q53-Q56, Q60
  /\blist\s+(the\s+)?contents\s+(of|in)\s+/i,                         // "List the contents of X folder"
  /\blist\s+only\s+.+\s+(folder\s+)?contents/i,                       // "List only test 1 folder contents"
  /\blist\s+.+\s+folder\s+contents/i,                                 // "List test 1 folder contents"
  /\bconfirm\s+(all\s+)?(original\s+)?files?\s+(are\s+)?/i,           // "Confirm all original files are still present"
  /\bfiles?\s+(are\s+)?(still\s+)?present\b/i,                        // "...files are still present"
  // CRITICAL FIX: Spreadsheet/Excel file discovery - Q9, Q10, Q17, Q19
  /\bfind\s+(all\s+)?(the\s+)?(spreadsheets?|excel\s+files?|xlsx\s+files?)\b/i, // "Find all spreadsheets"
  /\bopen\s+the\s+[\w\s]+\s+(file|ranch|budget|fund)\b/i,             // "Open the Lone Mountain Ranch file"
  /\bwhere\s+would\s+i\s+find\b/i,                                     // "Where would I find..."
  /\bwhat\s+other\s+files?\s+(are\s+)?(in|on)\s+(the\s+)?same\s+folder\b/i, // "What other files are in same folder"
  /\bother\s+files?\s+(in|on)\s+(the\s+)?same\b/i,                    // "Other files in the same..."
  // SEMANTIC FILE QUERIES - "open the fund doc", "show me the budget spreadsheet"
  /\bopen\s+the\s+\w+\s+(doc|document|file|spreadsheet|pdf)\b/i,      // "open the fund doc"
  /\bshow\s+(me\s+)?the\s+\w+\s+(doc|document|file|spreadsheet)\b/i,  // "show me the budget spreadsheet"
];

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
 * Patterns that indicate DOCUMENT RECOMMENDATION queries.
 * "Which file should I read to understand X" must route to documents, NOT doc_management.
 */
const RECOMMENDATION_PATTERNS: RegExp[] = [
  /\bwhich\s+(file|document)\s+should\s+(i|we)\s+read\b/i,
  /\bwhat\s+(file|document)\s+should\s+(i|we)\s+read\b/i,
  /\bwhich\s+(file|document)\s+.*\s+to\s+understand\b/i,
  /\bwhat\s+should\s+(i|we)\s+read\s+to\b/i,
  /\brecommend\s+(a\s+)?(file|document)\b/i,
  /\bsuggest\s+(a\s+)?(file|document)\b/i,
  /\bbest\s+(file|document)\s+(to|for)\b/i,
  /\bmost\s+relevant\s+(file|document)\b/i,
  // Additional patterns for Q11-style queries
  /\b(from\s+all|across\s+all).*\bwhich\s+(file|document)\b/i,
  /\bto\s+understand\b.*\b(file|document|read)\b/i,
  /\bshould\s+(i|we)\s+read\s+to\s+understand\b/i,
];

/**
 * Keywords that indicate memory intent (should protect from document boost).
 * EDGE CASE C5: "told you about" must trigger memory, not legal
 * NOTE: Be specific - "that I told you" = memory recall, "what you said" = document context (not memory)
 */
const MEMORY_ANCHOR_KEYWORDS = [
  'remember', 'recall', 'you remember', 'asked you to remember',
  // NOTE: Removed 'what was the', 'what were the' - too generic, matches document queries
  'what did i tell you', 'what did i ask you',
  'store', 'save this', 'note that', 'keep in mind',
  // C5 fix: Memory recall patterns - USER telling ASSISTANT (not vice versa)
  'i told you', 'that i told you', 'i asked you to',
  'i mentioned', 'i said to you',
  // Explicit recall requests
  'do you remember', 'can you recall', 'you recall',
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
  previousConfidence?: number;
  queryWordCount?: number;  // Pre-computed for performance
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
    fileActionAnchorsFound: string[];
    isFileActionQuery: boolean;
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

    // Step 0.5: Check for file action patterns (highest priority navigation queries)
    const fileActionAnchorsFound = this.findFileActionAnchors(normalizedQuery);
    const hasFileActionAnchor = fileActionAnchorsFound.length > 0;
    const hasFileActionPattern = this.matchesFileActionPattern(normalizedQuery);

    // EXCLUSION: Comparative questions like "Is this better than the other one?" are NOT file actions
    const isComparativeQuestion = /^is\s+(this|it)\s+(better|worse|good|bad|newer|older)(\s+than)?\b/i.test(normalizedQuery) ||
      /\b(better|worse)\s+than\s+(the\s+)?(other|that)\s+(one|file|document)/i.test(normalizedQuery);

    // EXCLUSION: Content-based queries like "find documents with numbers over $1 million" are NOT file actions
    // These need semantic content search (documents intent), not filename search (file_actions)
    const isContentSearchQuery = /\bfind\s+(documents?|files?)\s+(with|containing|that\s+(have|contain|mention|include|show))\b/i.test(normalizedQuery) ||
      /\b(documents?|files?)\s+(with|containing|that\s+have)\s+(numbers?|amounts?|values?|data|mentions?)/i.test(normalizedQuery) ||
      /\b(search|look)\s+(for\s+)?(documents?|files?)\s+(with|containing|where|that)\b/i.test(normalizedQuery);

    const isFileActionQuery = (hasFileActionAnchor || hasFileActionPattern) && !isComparativeQuestion && !isContentSearchQuery;

    // Step 0.6: Check for RECOMMENDATION patterns (must route to documents, NOT doc_management)
    const isRecommendationQuery = RECOMMENDATION_PATTERNS.some(p => p.test(normalizedQuery));

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

    // Step 4.6: Synthesize file_actions score if missing but file action patterns found
    const hasFileActionsIntent = scores.some(s => s.intent === 'file_actions');
    if (isFileActionQuery && !hasFileActionsIntent) {
      // Synthesize a high file_actions score when navigation patterns detected
      const syntheticScore = hasFileActionPattern ? 0.90 : 0.80;
      workingScores.push({
        intent: 'file_actions' as IntentName,
        confidence: syntheticScore,
      });
      this.logger.info('[RoutingPriority] Synthesized file_actions score', {
        confidence: syntheticScore.toFixed(2),
        hasPattern: hasFileActionPattern,
        anchors: fileActionAnchorsFound,
        text: normalizedQuery.substring(0, 50),
      });
    }

    // Step 4.7: Synthesize documents score for recommendation queries
    // "Which file should I read to understand X" → documents, not doc_management
    if (isRecommendationQuery && context.hasDocuments) {
      const hasDocumentsIntentForRec = workingScores.some(s => s.intent === 'documents');
      if (!hasDocumentsIntentForRec) {
        workingScores.push({
          intent: 'documents' as IntentName,
          confidence: 0.85,
        });
      }
      // Also dampen file_actions if present (was doc_management in old schema)
      const fileActionsScore = workingScores.find(s => s.intent === 'file_actions');
      if (fileActionsScore) {
        fileActionsScore.confidence = Math.max(fileActionsScore.confidence - 0.50, 0);
      }
      this.logger.info('[RoutingPriority] Recommendation query detected', {
        synthesizedDocuments: !hasDocumentsIntentForRec,
        text: normalizedQuery.substring(0, 50),
      });
    }

    // =========================================================================
    // FIX B: FOLLOW-UP CONFIDENCE INHERITANCE
    // When user asks a short follow-up question, inherit confidence from previous intent.
    // This prevents "rephrase" responses for queries like "what about the warranty?"
    // =========================================================================
    const FOLLOWUP_BOOST = 0.30;
    const SHORT_QUERY_WORD_LIMIT = 8;
    const SHORT_QUERY_CHAR_LIMIT = 50;

    // Hard-switch keywords that indicate user is changing topic (don't inherit)
    const HARD_SWITCH_KEYWORDS = [
      'help', 'upload', 'account', 'password', 'reset', 'login', 'logout',
      'settings', 'preferences', 'how do i', 'how can i', 'what is koda',
    ];

    const wordCount = context.queryWordCount || normalizedQuery.split(/\s+/).length;
    const isShortQuery = wordCount <= SHORT_QUERY_WORD_LIMIT || normalizedQuery.length <= SHORT_QUERY_CHAR_LIMIT;
    const hasHardSwitch = HARD_SWITCH_KEYWORDS.some(kw => normalizedQuery.includes(kw));

    // Apply follow-up boost if conditions met
    if (context.isFollowup && context.previousIntent && isShortQuery && !hasHardSwitch) {
      const prevIntentScore = workingScores.find(s => s.intent === context.previousIntent);
      if (prevIntentScore) {
        const oldConfidence = prevIntentScore.confidence;
        prevIntentScore.confidence = Math.min(prevIntentScore.confidence + FOLLOWUP_BOOST, 1.0);

        this.logger.info('[RoutingPriority] followup_boost applied', {
          prevIntent: context.previousIntent,
          oldConfidence: oldConfidence.toFixed(2),
          newConfidence: prevIntentScore.confidence.toFixed(2),
          boostApplied: FOLLOWUP_BOOST,
          wordCount,
          text: normalizedQuery.substring(0, 50),
        });
      } else if (context.previousIntent === 'documents' && context.hasDocuments) {
        // Synthesize documents score for follow-up if not present
        workingScores.push({
          intent: 'documents' as IntentName,
          confidence: 0.55 + FOLLOWUP_BOOST, // Base + boost
        });
        this.logger.info('[RoutingPriority] followup_boost synthesized documents', {
          prevIntent: context.previousIntent,
          synthesizedConfidence: (0.55 + FOLLOWUP_BOOST).toFixed(2),
          wordCount,
          text: normalizedQuery.substring(0, 50),
        });
      }
    }

    // Step 5: Apply adjustments to each score
    const adjustedScores = workingScores.map(score => {
      let adjustedConfidence = score.confidence;
      let boost = 0;
      let reason = '';

      // Rule -1: FILE ACTIONS PRIORITY - Highest priority for navigation queries
      // "where is file X", "open file X", "find document Y" → file_actions
      if (isFileActionQuery) {
        if (score.intent === 'file_actions') {
          // Strong boost for file_actions when navigation patterns detected
          boost = hasFileActionPattern ? 0.50 : 0.35;
          reason = hasFileActionPattern ? 'File action pattern matched (strong boost)' : 'File action anchor detected';
          adjustedConfidence = Math.min(adjustedConfidence + boost, 1.0);
        } else if (
          score.intent === 'documents' ||
          score.intent === 'extraction' ||
          score.intent === 'help' ||
          score.intent === 'excel' ||      // Dampen excel too
          score.intent === 'finance' ||    // Dampen finance too
          score.intent === 'reasoning'     // Dampen reasoning too
        ) {
          // Dampen competing intents when file action is clearly intended
          boost = -0.50;
          reason = `${score.intent} dampened (file action query detected)`;
          adjustedConfidence = Math.max(adjustedConfidence + boost, 0);
        }
      }

      // Rule -0.5: RECOMMENDATION QUERIES → documents (NOT doc_management)
      // "Which file should I read to understand X" must route to documents
      if (isRecommendationQuery) {
        if (score.intent === 'documents') {
          boost = 0.45;
          reason = 'Recommendation query → force documents intent';
          adjustedConfidence = Math.min(adjustedConfidence + boost, 0.95);
        } else if (
          score.intent === 'help' ||
          score.intent === 'file_actions'
        ) {
          // Dampen competing intents for recommendation queries
          boost = -0.60;
          reason = `${score.intent} dampened (recommendation query detected)`;
          adjustedConfidence = Math.max(adjustedConfidence + boost, 0);
        }
      }

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

      // Rule 1: Document Context Boosting (ONLY when no meta intent anchor AND no file listing query)
      // CRITICAL: File listing queries ("list all documents in folder X") should NOT boost documents
      if (context.hasDocuments && score.intent === 'documents' && !hasMetaIntentAnchor && !isFileActionQuery) {
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
      // BUT NOT for file listing queries like "list all files in folder X"
      const hasExtractionKeywords = /\b(extract|pull|get)\s+(all\s+)?(the\s+)?\w+/i.test(normalizedQuery);
      // Note: Removed 'list|find|show' from extraction keywords to prevent false matches with file listing
      if (context.hasDocuments && score.intent === 'documents' && hasExtractionKeywords && hasDocumentAnchor && !isFileActionQuery) {
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
        fileActionAnchorsFound,
        isFileActionQuery,
      },
    };
  }

  /**
   * Find file action anchor keywords in query.
   */
  private findFileActionAnchors(query: string): string[] {
    return FILE_ACTION_ANCHOR_KEYWORDS.filter(anchor => query.includes(anchor));
  }

  /**
   * Check if query matches any file action pattern.
   */
  private matchesFileActionPattern(query: string): boolean {
    return FILE_ACTION_PATTERNS.some(pattern => pattern.test(query));
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
