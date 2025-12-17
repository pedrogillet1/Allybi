/**
 * KODA RAG V3 - Consolidated Type System
 * 
 * Single source of truth for all RAG types.
 * Consolidates: ragV2.types, intent.types, orchestrator.types, rag.types
 * 
 * VERSION: 3.0.0
 * DATE: 2025-12-11
 * LOCATION: backend/src/types/ragV3.types.ts
 * 
 * DESIGN RATIONALE:
 * - Single file for all types eliminates import confusion
 * - Enums for strict type safety (vs string literals)
 * - Clear separation of concerns (intent, retrieval, formatting, fallback)
 * - Extensible for future features
 * - Based on pasted_content_6.txt blueprint
 */

// ============================================================================
// PRIMARY INTENT TYPES
// ============================================================================

/**
 * Primary intent - what the user is trying to do
 * 
 * RATIONALE: Using enum instead of string union for:
 * - Better autocomplete
 * - Compile-time safety
 * - Easier refactoring
 */
export enum PrimaryIntent {
  ANALYTICS = 'ANALYTICS',           // "How many docs do I have?"
  SEARCH = 'SEARCH',                 // "Find all contracts"
  DOCUMENT_QNA = 'DOCUMENT_QNA',     // "What does the contract say about X?"
  PRODUCT_HELP = 'PRODUCT_HELP',     // "How do I upload a file?"
  CHITCHAT = 'CHITCHAT',             // "Hello", "Thanks"
  META_AI = 'META_AI',               // "What can you do?"
  OTHER = 'OTHER'                    // Fallback
}

/**
 * Intent domain - where the question lives
 */
export enum IntentDomain {
  DOCUMENTS = 'DOCUMENTS',           // User's documents
  PRODUCT = 'PRODUCT',               // Koda product/UX
  ONBOARDING = 'ONBOARDING',         // First-time user help
  GENERAL = 'GENERAL',               // Open-world chat
  CHITCHAT = 'CHITCHAT'              // Casual conversation
}

/**
 * Question type - for answer formatting
 * 
 * RATIONALE: Drives answer style (conversational vs bullet list vs table)
 */
export enum QuestionType {
  SUMMARY = 'SUMMARY',               // "Summarize this doc"
  EXTRACT = 'EXTRACT',               // "Extract all dates"
  COMPARE = 'COMPARE',               // "Compare doc A vs doc B"
  LIST = 'LIST',                     // "List all documents"
  WHY = 'WHY',                       // "Why did X happen?"
  HOW_TO = 'HOW_TO',                 // "How do I do X?"
  DEFINITION = 'DEFINITION',         // "What is X?"
  YES_NO = 'YES_NO',                 // "Is X true?"
  NUMERIC = 'NUMERIC',               // "How many X?"
  TABLE = 'TABLE',                   // "Show me a table of X"
  META_CAPABILITIES = 'META_CAPABILITIES', // "What can you do?"
  OTHER = 'OTHER'
}

/**
 * Query scope - how many documents
 */
export enum QueryScope {
  SINGLE_DOC = 'SINGLE_DOC',         // "In contract.pdf, what..."
  MULTI_DOC = 'MULTI_DOC',           // "In contracts A and B, what..."
  ALL_DOCS = 'ALL_DOCS',             // "Across all my documents..."
  WORKSPACE = 'WORKSPACE'            // "In my workspace..."
}

// ============================================================================
// DOCUMENT TARGET TYPES
// ============================================================================

/**
 * Document target - how documents are specified
 * 
 * RATIONALE: Supports multiple ways users reference documents:
 * - By name: "no arquivo contrato.pdf"
 * - By ID: From UI selection
 * - By folder: "in my finance folder"
 * - By tag: "all LGPD documents"
 */
export interface DocumentTarget {
  type: 'NONE' | 'BY_NAME' | 'BY_ID' | 'BY_FOLDER' | 'BY_TAG';
  documentIds?: string[];
  folderIds?: string[];
  tagIds?: string[];
  rawNames?: string[];              // Extracted from query text
}

// ============================================================================
// INTENT CLASSIFICATION V3
// ============================================================================

/**
 * Complete intent classification result
 * 
 * RATIONALE: All information needed to route and answer a query
 * - primaryIntent: What to do
 * - domain: Where to look
 * - questionType: How to format answer
 * - scope: How many docs
 * - target: Which docs
 * - language: What language to answer in
 * - requiresRAG: Whether to do retrieval
 * - confidence: How sure we are
 */
export interface IntentClassificationV3 {
  // Core dimensions
  primaryIntent: PrimaryIntent | string;  // Allows string for flexibility
  domain: IntentDomain;
  questionType: QuestionType;
  primaryType?: QuestionType;        // Alias for questionType (backward compat)
  scope: QueryScope;

  // Language & RAG
  language: 'en' | 'pt' | 'es';
  requiresRAG: boolean;              // true = go through retrieval
  requiresProductHelp: boolean;      // true = use product help KB

  // Document targeting (V3 enhanced)
  target: DocumentTarget;
  documentTargets?: string[];        // Resolved document IDs

  // Raw query preservation
  rawQuery?: string;                 // Original user query

  // Confidence & debugging
  confidence: number;                // 0-1
  matchedPatterns?: string[];        // Which patterns matched
  matchedKeywords?: string[];        // Which keywords matched
  matchedPattern?: string;           // Single pattern match (from pattern classifier)

  // Override tracking
  overrideReason?: string;           // Why intent was overridden
  noDocsGuidance?: boolean;          // Flag for no-docs fallback

  // Metadata
  metadata?: {
    queryLength: number;
    hasContext: boolean;
    classificationTimeMs: number;
  };
}

// ============================================================================
// MULTI-INTENT SUPPORT
// ============================================================================

/**
 * Multi-intent result - when query has multiple intents
 * 
 * EXAMPLE: "List my documents and summarize the latest one"
 * - primary: SEARCH (list documents)
 * - secondary: DOCUMENT_QNA (summarize)
 * - strategy: sequential (do search first, then QnA)
 */
export interface MultiIntentResult {
  primary: IntentClassificationV3;
  secondary?: IntentClassificationV3[];
  strategy: 'single' | 'sequential' | 'parallel';
}

// ============================================================================
// DOCUMENT RESOLUTION
// ============================================================================

/**
 * Resolved document - result of doc-name routing
 * 
 * RATIONALE: Fuzzy matching means we need confidence scores
 */
export interface ResolvedDocument {
  id: string;
  title: string;
  confidence: number;                // 0-1
  matchType: 'exact' | 'fuzzy' | 'partial';
}

/**
 * Document resolution result - output from resolution service
 */
export interface DocumentResolutionResult {
  resolvedDocumentIds: string[];
  matches: ResolvedNameMatch[];
  unresolvedNames: string[];
  // Legacy compatibility
  resolvedDocs?: ResolvedDocument[];
  extractedNames?: string[];
  ambiguous?: Array<{
    mention: string;
    candidates: ResolvedDocument[];
  }>;
}

// ============================================================================
// RETRIEVAL TYPES
// ============================================================================

/**
 * Retrieval filters - what to search
 */
export interface RetrievalFilters {
  userId: string;
  documentIds?: string[];
  folderIds?: string[];
  tagIds?: string[];
  namespace?: string;
}

/**
 * Retrieved chunk - single chunk from retrieval
 */
export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  documentName: string;
  score: number;                     // Relevance score (0-1)
  pageNumber?: number;
  slideNumber?: number;
  content: string;
  metadata: Record<string, any>;
}

/**
 * Retrieval result - complete retrieval output
 * 
 * RATIONALE: Includes hybrid search details for debugging/analytics
 */
export interface RetrievalResult {
  chunks: RetrievedChunk[];
  usedHybrid: boolean;
  hybridDetails?: {
    vectorTopK: number;
    bm25TopK: number;
    mergeStrategy: 'weighted' | 'rrf';
  };
  appliedBoosts?: Array<{
    documentId: string;
    boostFactor: number;
    reason: string;
  }>;
}

/**
 * Context budget - token allocation
 * 
 * RATIONALE: Prevents truncation by planning token usage upfront
 */
export interface ContextBudget {
  maxTokens: number;                 // Model limit (e.g. 8192)
  reservedForAnswer: number;         // Expected answer length
  reservedForSystem: number;         // System prompt + query
  availableForContext: number;       // What's left for chunks
}

// ============================================================================
// DOCUMENT RESOLUTION PARAMS (V3 - New)
// ============================================================================

/**
 * Document resolution parameters - input to resolution service
 */
export interface DocumentResolutionParams {
  userId: string;
  rawNames: string[];
  limitPerName?: number;
}

/**
 * Resolved name match - individual match result
 */
export interface ResolvedNameMatch {
  rawName: string;
  documentId: string;
  filename: string;
  score: number;
  matchedAlias?: string;
}

// ============================================================================
// RANKING TYPES (V3 - New)
// ============================================================================

/**
 * Ranking parameters - input to ranking service
 */
export interface RankingParams {
  query: string;
  intent: IntentClassificationV3;
  chunks: RetrievedChunk[];
  boostMap: Record<string, { documentId: string; factor: number; reason: string }>;
}

/**
 * Ranked chunks - output from ranking service
 */
export type RankedChunks = RetrievedChunk[];

// ============================================================================
// DOCUMENT SEARCH TYPES (V3 - New)
// ============================================================================

/**
 * Document search parameters
 */
export interface DocumentSearchParams {
  userId: string;
  limit?: number;    // Default: 20
  offset?: number;   // Default: 0
  filters?: {
    folderId?: string;
    tagId?: string;
    fileType?: string;
    status?: string;
  };
  orderBy?: 'recency' | 'name' | 'size';
  query?: string;
}

/**
 * Document search item
 */
export interface DocumentSearchItem {
  documentId: string;
  filename: string;
  normalizedFilename?: string;
  fileType: string;
  sizeBytes: number;
  pageCount?: number;
  createdAt: Date;
  updatedAt: Date;
  folderId?: string;
  folderPath?: string;
  tags: string[];
  language?: string;
  status: 'processing' | 'completed' | 'failed';
}

/**
 * Document search result
 */
export interface DocumentSearchResult {
  items: DocumentSearchItem[];
  total: number;
  hasMore: boolean;
}

// ============================================================================
// CITATIONS
// ============================================================================

/**
 * Citation - reference to source
 */
export interface Citation {
  documentId: string;
  documentName: string;
  pageNumber?: number;
  slideNumber?: number;
  chunkId?: string;
  snippet?: string;
  confidence?: number;
}

// ============================================================================
// DOCUMENT MARKERS (V3 - New)
// ============================================================================

/**
 * Document marker - embedded in answer text
 * 
 * FORMAT: {{DOC::id=doc_123::name="file.pdf"::type=pdf::size=1048576::...}}
 * 
 * RATIONALE: 
 * - User sees only filename (bold/underlined based on context)
 * - Marker contains full metadata for frontend
 * - Frontend parses marker to render button with preview
 */
export interface DocumentMarker {
  documentId: string;
  filename: string;
  extension?: string;
  mimeType?: string;
  fileSize?: number;
  folderPath?: string;
  language?: string;
  topics?: string[];
  createdAt?: string;
  updatedAt?: string;
  pageCount?: number;
  slideCount?: number;
}

/**
 * Load more marker - for paginated document lists
 * 
 * FORMAT: {{LOAD_MORE::total=50::shown=10::remaining=40}}
 */
export interface LoadMoreMarker {
  totalDocs: number;
  shownDocs: number;
  remainingDocs: number;
  action: 'load_more';
}

// ============================================================================
// FORMATTING RESULT (V3 - New)
// ============================================================================

/**
 * Formatting result - output of formatting pipeline
 * 
 * RATIONALE: Separates formatting concerns from answer generation
 */
export interface FormattingResult {
  text: string;                      // Formatted markdown with markers
  citations: Citation[];
  documentMarkers: DocumentMarker[];
  loadMoreMarker?: LoadMoreMarker;
  truncationDetected: boolean;
  metadata: {
    originalLength: number;
    formattedLength: number;
    markersInjected: number;
    citationsAdded: number;
  };
}

// ============================================================================
// FALLBACK TYPES (V3 - Enhanced)
// ============================================================================

/**
 * Fallback scenario - why we're showing a fallback
 */
export type FallbackScenario =
  | 'NO_DOCUMENTS'                   // Workspace empty
  | 'DOC_NOT_FOUND'                  // Document name not found
  | 'DOC_NOT_PROCESSED_YET'          // Still processing
  | 'NO_RELEVANT_CONTENT'            // No matching content
  | 'AMBIGUOUS_QUERY'                // Query too vague
  | 'MULTIPLE_DOCS_MATCH'            // Ambiguous doc name
  | 'ERROR_RETRIEVAL'                // Retrieval failed
  | 'ERROR_GENERATION';              // LLM failed

/**
 * Fallback style - how to present fallback
 * 
 * RATIONALE: Different contexts need different verbosity
 * - one_liner: Quick, inline (e.g., "No documents found.")
 * - short_guidance: Brief with next steps (1-2 parts)
 */
export interface FallbackStyle {
  id: string;                        // 'one_liner' | 'short_guidance'
  maxLength: number;
  structure: string[];               // ['statement', 'actions_list']
  tone: string;
  renderHint: {
    layout: string;
    showIcon: boolean;
    icon: string;
    emphasisLevel: string;
  };
  languages: {
    en: { template: string; placeholders: string[] };
    pt: { template: string; placeholders: string[] };
    es: { template: string; placeholders: string[] };
  };
}

/**
 * Fallback definition - complete fallback spec
 */
export interface FallbackDefinition {
  key: FallbackScenario;
  category: string;
  description: string;
  defaultStyleId: string;
  severity: 'info' | 'warning' | 'error';
  tags: string[];
  version: number;
  lastUpdated: string;
  experiment: string | null;
  styles: FallbackStyle[];
}

/**
 * Fallback response - rendered fallback
 */
export interface FallbackResponse {
  scenario: FallbackScenario;
  message: string;                   // Rendered message in user's language
  language: 'en' | 'pt' | 'es';
  style: string;
  renderHint: any;
  suggestedAction?: string;
  placeholders?: Record<string, string>;
}

// ============================================================================
// ANSWER TYPES
// ============================================================================

/**
 * Answer type - what kind of answer
 */
export type AnswerType =
  | 'analytics'
  | 'doc_factual_single'
  | 'doc_multi_extract'
  | 'doc_comparison'
  | 'doc_search_results'
  | 'doc_listing'                    // New in V3
  | 'follow_up'
  | 'chitchat'
  | 'meta_ai'
  | 'product_help'                   // New in V3
  | 'fallback_no_docs'
  | 'fallback_no_match'
  | 'fallback_doc_not_found'
  | 'fallback_processing'
  | 'fallback_error'
  | 'generic_chat';

// ============================================================================
// CONVERSATION CONTEXT
// ============================================================================

/**
 * Conversation turn - single Q&A pair
 */
export interface ConversationTurn {
  query: string;
  answer: string;
  timestamp: Date;
  documentsUsed: string[];
  intent?: IntentClassificationV3;
}

/**
 * Conversation context - full conversation state
 */
export interface ConversationContext {
  userId: string;
  sessionId?: string;
  conversationId?: string;
  turns: ConversationTurn[];
  lastIntent?: IntentClassificationV3;
  activeDocuments?: string[];        // Docs mentioned recently
  preferences?: Record<string, any>;
}

// ============================================================================
// REQUEST/RESPONSE (V3)
// ============================================================================

/**
 * Answer request - input to RAG system
 */
export interface AnswerRequest {
  query: string;
  userId: string;
  sessionId?: string;
  conversationContext?: ConversationContext;
  intent?: IntentClassificationV3;   // Optional pre-classified intent
  attachedDocumentIds?: string[];    // From UI
  answerLength?: 'short' | 'medium' | 'long' | 'summary';
  workspaceId?: string;
}

/**
 * Answer metadata - metadata about the answer
 */
export interface AnswerMetadata {
  citations: Citation[];
  usedDocuments: string[];
  intent: IntentClassificationV3;
  retrievalStats?: {
    totalChunks: number;
    usedChunks: number;
    avgScore: number;
  };
  validation?: {
    passed: boolean;
    reasons?: string[];
  };
  ragStatus: RagStatus;
  retrievalTimeMs?: number;
  generationTimeMs?: number;
  formattingTimeMs?: number;
  totalTimeMs: number;
  fallbackScenario?: FallbackScenario;
}

/**
 * Answer response - output from RAG system
 */
export interface AnswerResponse {
  text: string;                      // Formatted markdown with markers
  markdown: string;                  // Same as text (for compatibility)
  answerType: AnswerType;
  citations: Citation[];
  docsUsed: string[];
  conversationContext: ConversationContext;
  renderHints?: {
    answerMode: 'plain' | 'list' | 'table' | 'document_list' | 'fallback';
    severity?: 'info' | 'warning' | 'error';
    components?: Array<{
      type: 'sources' | 'doc-list' | 'error-banner' | 'load-more';
      data?: any;
    }>;
  };
  metadata: AnswerMetadata;
}

// ============================================================================
// RAG STATUS
// ============================================================================

/**
 * RAG status - outcome of RAG pipeline
 */
export type RagStatus =
  | 'SUCCESS'
  | 'NO_DOCUMENTS'
  | 'NO_MATCH'
  | 'NO_MATCH_SINGLE_DOC'
  | 'DOC_NOT_FOUND_BY_NAME'
  | 'PROCESSING'
  | 'ERROR';

// ============================================================================
// ============================================================================
// ANSWER CONFIG KEYS (V3 - New)
// ============================================================================

/**
 * Answer config keys - keys to look up JSON configurations
 *
 * RATIONALE: Forces all services to use JSON configs by passing keys
 * - styleKey: from answer_styles.json
 * - systemPromptKey: from system_prompts.json
 * - examplesKey: from answer_examples.json
 * - validationPolicyKey: from validation_policies.json
 */
export interface AnswerConfigKeys {
  styleKey: string;
  systemPromptKey: string;
  examplesKey: string;
  validationPolicyKey: string;
}

// ORCHESTRATION CONTEXT (V3 - New)
// ============================================================================

/**
 * Orchestration context - state passed through orchestrator
 * 
 * RATIONALE: Centralizes all context needed for routing and execution
 */
export interface OrchestrationContext {
  request: AnswerRequest;
  intent: IntentClassificationV3;
  multiIntent?: MultiIntentResult;
  documentResolution?: DocumentResolutionResult;
  workspaceStats?: WorkspaceStats;
  configKeys?: AnswerConfigKeys;
  startTime: number;
}

// ============================================================================
// WORKSPACE STATS (V3 - New)
// ============================================================================

/**
 * Workspace stats - user's workspace state
 * 
 * RATIONALE: Used for intent overrides (e.g., no docs → force PRODUCT_HELP)
 */
export interface WorkspaceStats {
  documentCount: number;
  processingCount: number;
  completedCount: number;
  totalSize: number;
  byType: Record<string, number>;
  byFolder: Record<string, number>;
  recentUploads: number;
}

// ============================================================================
// PROMPT CONFIG TYPES (V3 - New)
// ============================================================================

/**
 * Language code - supported languages
 */
export type LanguageCode = 'en' | 'pt' | 'es';

/**
 * System prompt definition
 */
export interface SystemPromptDefinition {
  key: string;
  description?: string;
  templates: {
    en: string;
    pt: string;
    es: string;
  };
  placeholders?: string[];
  version?: number;
}

/**
 * Answer style - how to format answers
 */
export interface AnswerStyleDefinition {
  id: string;
  description?: string;
  maxLength: number;
  structure: string[];
  tone: string;
  templates: {
    en: string;
    pt: string;
    es: string;
  };
  renderHint?: {
    layout: string;
    showIcon: boolean;
    icon?: string;
    emphasisLevel: string;
  };
}

/**
 * Resolved answer style (with selected language)
 */
export interface AnswerStyleResolved {
  id: string;
  maxLength: number;
  structure: string[];
  tone: string;
  template: string;
  renderHint?: {
    layout: string;
    showIcon: boolean;
    icon?: string;
    emphasisLevel: string;
  };
}

/**
 * Few-shot example
 */
export interface FewShotExample {
  query: string;
  response: string;
  context?: string;
}

/**
 * Few-shot examples definition
 */
export interface FewShotExamplesDefinition {
  key: string;
  description?: string;
  examples: {
    en: FewShotExample[];
    pt: FewShotExample[];
    es: FewShotExample[];
  };
}

/**
 * Resolved few-shot examples (with selected language)
 */
export interface FewShotExamplesResolved {
  key: string;
  examples: FewShotExample[];
}

/**
 * Retrieval policy - controls retrieval behavior
 */
export interface RetrievalPolicy {
  intentKey: string;
  requiresRetrieval: boolean;
  topK: number;
  minScore: number;
  hybridMode: boolean;
  hybridWeights?: {
    vector: number;
    bm25: number;
  };
  boostRecent?: boolean;
  boostFactors?: {
    recency: number;
    title: number;
    exactMatch: number;
  };
}

/**
 * Table preset - for table formatting
 */
export interface TablePreset {
  id: string;
  description?: string;
  columns: string[];
  headerStyle?: string;
  cellStyle?: string;
  maxRows?: number;
}

/**
 * Markdown components - reusable markdown patterns
 */
export interface MarkdownComponents {
  citations: {
    inline: string;
    block: string;
  };
  documentMarker: string;
  loadMoreMarker: string;
  codeBlock: string;
  callout: {
    info: string;
    warning: string;
    error: string;
  };
}

/**
 * Validation rule
 */
export interface ValidationRule {
  id: string;
  description?: string;
  check: string;
  severity: 'error' | 'warning' | 'info';
  message: {
    en: string;
    pt: string;
    es: string;
  };
}

/**
 * Validation policy
 */
export interface ValidationPolicy {
  key: string;
  description?: string;
  rules: ValidationRule[];
  failOnError: boolean;
  maxWarnings?: number;
}

/**
 * Error messages - localized error messages
 */
export interface ErrorMessages {
  [errorCode: string]: {
    en: string;
    pt: string;
    es: string;
  };
}

/**
 * Prompt config bundle - all configs loaded at startup
 */
export interface PromptConfigBundle {
  systemPrompts: Record<string, SystemPromptDefinition>;
  answerStyles: Record<string, AnswerStyleDefinition>;
  answerExamples: Record<string, FewShotExamplesDefinition>;
  markdownComponents: MarkdownComponents;
  tablePresets: Record<string, TablePreset>;
  validationPolicies: Record<string, ValidationPolicy>;
  retrievalPolicies: Record<string, RetrievalPolicy>;
  errorLocalization: ErrorMessages;
}

/**
 * Logger interface for services
 */
export interface LoggerLike {
  debug?: (message: string, meta?: object) => void;
  info?: (message: string, meta?: object) => void;
  warn?: (message: string, meta?: object) => void;
  error?: (message: string, meta?: object) => void;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  PrimaryIntent,
  IntentDomain,
  QuestionType,
  QueryScope,
};
