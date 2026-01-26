/**
 * KODA V3 Intent Type Definitions
 *
 * Single source of truth for all intent names across the system.
 * These MUST match exactly with:
 * - JSON keys in intent_patterns.json
 * - Orchestrator switch cases
 * - Handler function names
 *
 * Based on: pasted_content_21.txt and pasted_content_22.txt specifications
 */

/**
 * All 15 supported intent types (simplified V4 schema)
 *
 * Core intents + domain-specific intents for specialized handling
 */
export type IntentName =
  // Core functional intents
  | 'documents'                 // All document queries (QA, search, summarize, analytics, management)
  | 'help'                      // Product help, onboarding, feature requests
  | 'conversation'              // Chitchat, feedback, greetings
  | 'edit'                      // Answer rewrite/expand/simplify, text transforms
  | 'reasoning'                 // Math, logic, calculations, general knowledge
  | 'memory'                    // Store and recall user information
  | 'error'                     // Out of scope, ambiguous, safety, unknown
  | 'preferences'               // User settings, language, tone, role
  | 'extraction'                // Data extraction, meta-AI queries
  | 'file_actions'              // File metadata queries, list files, file management
  | 'doc_stats'                 // Document statistics (page count, slide count, sheet count)

  // Domain-specific document intents
  | 'excel'                     // Excel/spreadsheet specific queries
  | 'accounting'                // Accounting-specific document queries
  | 'engineering'               // Engineering-specific document queries
  | 'finance'                   // Finance-specific document queries
  | 'legal'                     // Legal-specific document queries
  | 'medical';                  // Medical-specific document queries

/**
 * Mapping from old intent names to new (for migration/compatibility)
 */
export const INTENT_MIGRATION_MAP: Record<string, IntentName> = {
  // Document intents → documents
  'DOC_QA': 'documents',
  'DOC_ANALYTICS': 'documents',
  'DOC_MANAGEMENT': 'documents',
  'DOC_SEARCH': 'documents',
  'DOC_SUMMARIZE': 'documents',
  // Preferences
  'PREFERENCE_UPDATE': 'preferences',
  // Memory
  'MEMORY_STORE': 'memory',
  'MEMORY_RECALL': 'memory',
  // Edit/transform
  'ANSWER_REWRITE': 'edit',
  'ANSWER_EXPAND': 'edit',
  'ANSWER_SIMPLIFY': 'edit',
  'TEXT_TRANSFORM': 'edit',
  // Conversation
  'FEEDBACK_POSITIVE': 'conversation',
  'FEEDBACK_NEGATIVE': 'conversation',
  'CHITCHAT': 'conversation',
  // Help
  'PRODUCT_HELP': 'help',
  'ONBOARDING_HELP': 'help',
  'FEATURE_REQUEST': 'help',
  // Reasoning
  'GENERIC_KNOWLEDGE': 'reasoning',
  'REASONING_TASK': 'reasoning',
  // Extraction
  'META_AI': 'extraction',
  // Error cases
  'OUT_OF_SCOPE': 'error',
  'AMBIGUOUS': 'error',
  'SAFETY_CONCERN': 'error',
  'MULTI_INTENT': 'error',
  'UNKNOWN': 'error',
};

/**
 * Language codes supported by the system
 * MUST match JSON language keys exactly
 */
export type LanguageCode = 'en' | 'pt' | 'es';

/**
 * Confidence threshold for intent classification
 */
export const INTENT_CONFIDENCE_THRESHOLD = 0.5;
export const SECONDARY_INTENT_THRESHOLD = 0.4;

/**
 * Intent classification result
 */
export interface PredictedIntent {
  primaryIntent: IntentName;
  confidence: number;
  secondaryIntents?: Array<{
    name: IntentName;
    confidence: number;
  }>;
  language: LanguageCode;
  matchedPattern?: string;      // Which regex pattern matched (for debugging)
  matchedKeywords?: string[];   // Which keywords matched (for debugging)
  metadata?: Record<string, any>;
}

/**
 * Compiled intent pattern structure
 */
export interface CompiledIntentPattern {
  name: IntentName;
  keywordsByLang: Record<LanguageCode, string[]>;
  patternsByLang: Record<LanguageCode, RegExp[]>;
  priority: number;             // Higher priority wins in tie-breaking
  description?: string;         // Human-readable description
}

/**
 * Raw intent pattern from JSON (before compilation)
 */
export interface RawIntentPattern {
  keywords: Record<string, string[]>;
  patterns: Record<string, string[]>;
  priority?: number;
  description?: string;
}

/**
 * Intent definitions indexed by name
 */
export type IntentDefinitions = Record<IntentName, CompiledIntentPattern>;

/**
 * Intent classification request
 */
export interface IntentClassificationRequest {
  text: string;
  language?: LanguageCode;      // Auto-detected if not provided
  context?: {
    previousIntents?: IntentName[];
    conversationId?: string;
    userId?: string;
  };
}

/**
 * Citation reference for response (from formatting pipeline)
 */
export interface CitationReference {
  docId: string;
  docName: string;
  pageNumber?: number;
  chunkId?: string;
  relevanceScore?: number;
}

/**
 * Source reference for response (frontend-facing)
 */
export interface SourceReference {
  documentId: string;
  documentName: string;
  pageNumber?: number;
  snippet?: string;
}

/**
 * Intent handler response
 */
export interface IntentHandlerResponse {
  answer: string;
  formatted?: string;           // Formatted with markers (contains {{DOC::...}} markers)
  citations?: CitationReference[];  // Citations from formatting pipeline
  sources?: SourceReference[];      // Sources for frontend display
  // File action response for file discovery mode
  fileAction?: {
    type: 'file_action';
    action: 'SHOW_FILE' | 'OPEN_FILE' | 'SELECT_FILE' | 'LIST_FOLDER' | 'NOT_FOUND';
    message?: string;
    files: Array<{
      id: string;
      filename: string;
      mimeType: string;
      fileSize?: number;
      folderPath?: string | null;
    }>;
  };
  metadata?: {
    intent?: IntentName;
    confidence?: number;
    documentsUsed?: number;
    tokensUsed?: number;
    processingTime?: number;
    // Multi-intent and override metadata
    overrideApplied?: boolean;
    multiIntent?: boolean;
    segmentCount?: number;
    buttonOnly?: boolean;  // True when response is only file buttons (no prose)
    notFound?: boolean;    // True when file/document search returned no results
    segments?: Array<{
      intent: string;
      confidence: number;
      documentsUsed: number;
    }>;
    // Source tracking for persistence
    sourceDocumentIds?: string[];
    // Workspace catalog metadata
    scope?: 'workspace' | 'folder' | 'document';
    answerStyle?: string;
    // Folder navigation metadata
    folderAction?: {
      action: string;
      folder?: { id: string; name: string; path?: string };
      files?: Array<{ id: string; filename: string; mimeType: string }>;
    };
    // File list for inventory queries
    files?: Array<{
      id: string;
      filename: string;
      mimeType: string;
      folderPath?: string | null;
    }>;
    // File action structured attachments
    attachments?: Array<{
      id: string;
      name?: string;
      filename?: string;
      mimeType: string;
      folderPath?: string | null;
    }>;
    // File action structured actions
    actions?: Array<{
      type: 'file_action';
      action: string;
      payload?: Record<string, any>;
    }>;
    // Retrieval metrics
    chunksReturned?: number;
    retrievalAdequate?: boolean;
    // Fallback tracking
    fallbackTriggered?: boolean;
  };
  requiresFollowup?: boolean;
  suggestedActions?: string[];
  /**
   * CHATGPT-LIKE SOURCE BUTTONS
   * Structured source pills as attachment - replaces inline filenames.
   * For doc-grounded: content + sourceButtons
   * For file actions: NO content, ONLY sourceButtons
   */
  sourceButtons?: {
    type: 'source_buttons';
    buttons: Array<{
      documentId: string;
      title: string;
      mimeType?: string;
      location?: {
        type: 'page' | 'slide' | 'sheet' | 'cell' | 'section';
        value: string | number;
        label?: string;
      };
    }>;
    seeAll?: {
      label: string;
      totalCount: number;
      remainingCount: number;
    };
  } | null;
  /**
   * PREFLIGHT GATE 1: Composer stamp
   * Every response going through AnswerComposer will have this set.
   * Used to verify all response paths go through the centralized composer.
   */
  composedBy?: string;
}

/**
 * Fallback scenario keys
 * MUST match keys in fallbacks.json
 */
export type FallbackScenarioKey =
  | 'NO_DOCUMENTS'
  | 'NO_RELEVANT_DOCS'
  | 'DOC_NOT_FOUND'
  | 'SYSTEM_ERROR'
  | 'OUT_OF_SCOPE'
  | 'AMBIGUOUS_QUESTION'
  | 'PRODUCT_HELP_ERROR'
  | 'RETRIEVAL_ERROR'
  | 'LLM_ERROR'
  | 'RATE_LIMIT'
  | 'UNSUPPORTED_INTENT';

/**
 * Fallback style IDs
 * MUST match style.id in fallbacks.json
 */
export type FallbackStyleId =
  | 'short_guidance'
  | 'one_liner'
  | 'detailed_explainer'
  | 'friendly_redirect'
  | 'technical_error';

/**
 * Answer style configuration
 */
export interface AnswerStyle {
  maxLength?: number;
  structure?: string[];         // e.g., ["statement", "actions_list", "example"]
  tone?: string;                // e.g., "friendly_concise", "professional", "casual"
  formatting?: {
    useTitles?: boolean;
    useSections?: boolean;
    useMarkers?: boolean;
  };
}

/**
 * System prompt configuration
 */
export interface SystemPromptConfig {
  base: string;
  persona?: string;
  constraints?: string[];
  examples?: Array<{
    user: string;
    assistant: string;
  }>;
}

/**
 * Intent routing configuration
 */
export interface IntentRoutingConfig {
  intent: IntentName;
  handler: string;              // Handler function name
  requiresDocuments?: boolean;
  requiresLLM?: boolean;
  requiresMemory?: boolean;
  fallbackScenario?: FallbackScenarioKey;
}
