/**
 * ============================================================================
 * KODA ANSWER ORCHESTRATOR - TYPE DEFINITIONS
 * ============================================================================
 * 
 * Complete type system for the centralized answer orchestration pipeline.
 * 
 * @version 2.0.0
 * @date 2024-12-10
 */

// ============================================================================
// QUESTION CLASSIFICATION
// ============================================================================

export type QuestionType =
  | 'simple_factual'           // Single fact from one doc
  | 'multi_point_extraction'   // Multiple facts from one/many docs
  | 'comparison'               // Compare docs/values
  | 'metadata_analytics'       // Count, list, types (DB query)
  | 'followup'                 // Refers to previous answer
  | 'definition'               // What is X?
  | 'calculation'              // Numeric computation
  | 'summary'                  // Summarize doc(s)
  | 'list'                     // List items
  | 'greeting'                 // Hi, hello
  | 'capability'               // What can you do?
  | 'generic';                 // General knowledge

export type Domain =
  | 'doc_content'    // Needs RAG (document content)
  | 'analytics'      // Needs DB query (metadata)
  | 'generic';       // No documents needed

export type Scope =
  | 'specific_docs'  // Named docs or activeDocIds
  | 'by_topic'       // Docs by tag/folder/category
  | 'all_docs'       // All user documents
  | 'none';          // No doc scope

export interface IntentClassification {
  questionType: QuestionType;
  domain: Domain;
  scope: Scope;
  confidence: number;
  
  // Memory patterns detected
  memoryPattern?: {
    type: 'this_document' | 'these_documents' | 'filter_change' | 'preference';
    value?: string | string[];
  };
  
  // Scope details
  scopeDocIds?: string[];
  scopeFilters?: {
    mimeTypes?: string[];
    tags?: string[];
    folders?: string[];
  };
  
  // Language
  language: 'pt' | 'en' | 'es' | 'fr';
}

// ============================================================================
// RAG CONFIGURATION
// ============================================================================

export interface RagConfig {
  userId: string;
  scopeDocs?: string[];
  filters?: {
    mimeTypes?: string[];
    tags?: string[];
    folders?: string[];
    dateRange?: { start: Date; end: Date };
  };
  maxDocs: number;
  maxChunks: number;
  maxChunksPerDoc: number;
  chunkTypes?: string[];
  minScore?: number;
}

export interface RagContext {
  docsUsed: Array<{
    id: string;
    title: string;
    filename: string;
    mimeType: string;
  }>;
  chunks: Array<{
    docId: string;
    text: string;
    score: number;
    chunkType: string;
    location?: {
      page?: number;
      slide?: number;
      sheet?: string;
    };
  }>;
  totalRetrieved: number;
  avgScore: number;
}

export type RagStatus =
  | 'success'
  | 'no_docs'
  | 'no_relevant_chunks'
  | 'doc_not_found'
  | 'low_confidence';

// ============================================================================
// CITATION FORMAT
// ============================================================================

export interface CitationSource {
  id: string;              // docId
  title: string;           // Display title
  filename: string;        // Original filename
  label?: string;          // Short label (optional)
  location?: string;       // "Page 3", "Slide 11", etc.
  mimeType?: string;
}

// ============================================================================
// FORMATTING PIPELINE
// ============================================================================

export interface FormattingConfig {
  questionType: QuestionType;
  language: string;
  citations: CitationSource[];
  ragStatus: RagStatus;
  fallbackType?: FallbackType;
}

export type FallbackType =
  | 'NO_DOCS'
  | 'DOC_NOT_FOUND'
  | 'NO_RELEVANT_CHUNKS'
  | 'LOW_CONFIDENCE'
  | 'INVALID_ANSWER';

// Layer 1: Structure
export interface StructuredText {
  text: string;
  docMarkers: Array<{
    docId: string;
    title: string;
    startIndex: number;
    endIndex: number;
  }>;
  boldSpans: number;
  stats: {
    paragraphs: number;
    sentences: number;
    duplicatesRemoved: number;
  };
}

// Layer 2: Format
export interface FormattedMarkdown {
  markdown: string;
  structure: {
    hasTitle: boolean;
    hasSections: boolean;
    hasBullets: boolean;
    hasTable: boolean;
  };
}

// Layer 3: Validation
export interface ValidationResult {
  isValid: boolean;
  issues: string[];
  severity: 'error' | 'warning' | 'info';
  shouldRetry: boolean;
  shouldFallback: boolean;
}

// Layer 4: Post-processing
export interface FinalAnswer {
  text: string;
  citations: CitationSource[];
  answerType: AnswerType;
  docsUsed: string[];
  metadata: AnswerMetadata;
}

export type AnswerType =
  | 'normal'
  | 'analytics'
  | 'fallback_no_docs'
  | 'fallback_doc_not_found'
  | 'fallback_no_relevant_chunks'
  | 'fallback_invalid';

// ============================================================================
// ORCHESTRATOR REQUEST/RESPONSE
// ============================================================================

export interface OrchestratorRequest {
  userId: string;
  conversationId: string;
  message: string;
  options?: {
    language?: string;
    maxTokens?: number;
    temperature?: number;
  };
}

export interface OrchestratorResponse {
  text: string;
  citations: CitationSource[];
  answerType: AnswerType;
  docsUsed: string[];
  questionType: QuestionType;
  domain: Domain;
  processingTime: number;
  debug?: DebugInfo;
}

export interface AnswerMetadata {
  questionType: QuestionType;
  domain: Domain;
  ragStatus?: RagStatus;
  chunksUsed?: number;
  docsUsed?: number;
  processingTime: number;
  modelUsed: string;
}

export interface DebugInfo {
  classification: IntentClassification;
  ragConfig?: RagConfig;
  ragContext?: RagContext;
  validationResult?: ValidationResult;
  pipelineSteps: Array<{
    step: string;
    duration: number;
    status: 'success' | 'error' | 'skipped';
  }>;
}

// ============================================================================
// CONVERSATION STATE
// ============================================================================

export interface ConversationState {
  conversationId: string;
  userId: string;
  activeDocIds: string[];
  lastCitations: CitationSource[];
  lastAnswerText?: string;
  lastQuestionType?: QuestionType;
  filters?: {
    mimeTypes?: string[];
    tags?: string[];
    folders?: string[];
  };
  preferences?: {
    answerLength?: 'short' | 'medium' | 'long';
    language?: string;
    showSources?: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// ANALYTICS RESPONSE
// ============================================================================

export interface AnalyticsResponse {
  type: 'document_summary' | 'document_count' | 'document_list' | 'document_types';
  data: any;
  formattedText?: string;
}

// ============================================================================
// GEMINI CALL
// ============================================================================

export interface GeminiRequest {
  userQuestion: string;
  questionType: QuestionType;
  language: string;
  chunks?: Array<{
    text: string;
    source: string;
  }>;
  sources?: CitationSource[];
  systemInstructions?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface GeminiResponse {
  text: string;
  tokensUsed: number;
  model: string;
  finishReason: string;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export class OrchestratorError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'OrchestratorError';
  }
}

export class RagError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'RagError';
  }
}

export class FormattingError extends Error {
  constructor(
    message: string,
    public layer: number,
    public details?: any
  ) {
    super(message);
    this.name = 'FormattingError';
  }
}
