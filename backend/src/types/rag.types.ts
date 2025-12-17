/**
 * ============================================================================
 * CENTRALIZED RAG TYPES
 * ============================================================================
 * 
 * Complete type definitions for the centralized RAG system.
 * Based on requirements from 3 notes (1,715 lines).
 * 
 * @version 2.0.0
 * @date 2024-12-10
 */

// ============================================================================
// ANSWER CONTRACT TYPES
// ============================================================================

/**
 * Main answer contract - what backend returns to frontend
 */
export interface KodaAnswer {
  text: string;                    // Plain answer text with [src:N] markers
  citations: Citation[];           // Structured list of document sources
  analytics?: Analytics;           // Optional analytics data
  metadata: AnswerMetadata;        // Answer metadata
}

/**
 * Citation object - represents a document source
 */
export interface Citation {
  id: string;                      // Document ID
  docId: string;                   // Same as id (for compatibility)
  title: string;                   // Document title or filename
  label: string;                   // Display label (same as title)
  filename: string;                // Original filename
  page?: number;                   // Page number (for PDFs)
  slide?: number;                  // Slide number (for PPTX)
  sheet?: string;                  // Sheet name (for XLSX)
  folderName?: string;             // Folder name
  mimeType?: string;               // MIME type
  score?: number;                  // Relevance score
}

/**
 * Analytics data - for metadata questions
 */
export interface Analytics {
  totalDocuments?: number;
  documentsByType?: Record<string, number>;
  recentDocuments?: DocumentSummary[];
  searchResults?: DocumentSummary[];
}

/**
 * Document summary - lightweight doc info
 */
export interface DocumentSummary {
  id: string;
  title: string;
  filename: string;
  mimeType: string;
  folderName?: string;
  uploadedAt: Date;
  size?: number;
}

/**
 * Answer metadata - tracking info
 */
export interface AnswerMetadata {
  questionType: QuestionType;
  domain: Domain;
  ragMode: RagMode;
  memoryPattern?: MemoryPattern;
  scopeDocIds?: string[];
  processingTimeMs: number;
  tokensUsed?: number;
}

// ============================================================================
// INTENT CLASSIFICATION TYPES
// ============================================================================

/**
 * Question type - what kind of question is this
 */
export type QuestionType =
  | 'meta'                    // "who are you", "what can you do"
  | 'greeting'                // hi/hello/oi/olá, thanks, farewell
  | 'simple_factual'          // short, direct question
  | 'medium'                  // normal question with some detail
  | 'medium_specific'         // references ONE document
  | 'complex_analysis'        // "analyze / explain / detailed"
  | 'complex_multidoc'        // "compare X and Y", "all documents"
  | 'comparison'              // "difference between", "vs"
  | 'list'                    // "list / enumerate / give me X items"
  | 'followup';               // contextual follow-ups

/**
 * Domain - which system should handle this
 */
export type Domain =
  | 'analytics'               // Metadata/DB queries (count, types, recent)
  | 'doc_content'             // RAG with document content
  | 'generic';                // General knowledge (no RAG)

/**
 * RAG mode - how much retrieval to do
 */
export type RagMode =
  | 'no_rag'                  // No retrieval needed
  | 'light_rag'               // 1-3 chunks
  | 'full_rag';               // 10-20 chunks

/**
 * Memory pattern - what kind of memory/context reference
 */
export type MemoryPattern =
  | 'doc_reference'           // "nesse documento"
  | 'previous_answer'         // "explica melhor isso"
  | 'conversation_filter'     // "agora só PDFs"
  | 'user_preference'         // "sempre responda curto"
  | 'temporal_context'        // "antes você disse"
  | 'multi_step_reasoning';   // "usa o custo m² que você falou"

/**
 * Classification result
 */
export interface ClassificationResult {
  questionType: QuestionType;
  domain: Domain;
  ragMode: RagMode;
  memoryPattern?: MemoryPattern;
  scopeDocIds?: string[];
  confidence: number;
  detectionTimeMs: number;
  hasTemporalExpression: boolean;
}

// ============================================================================
// CONVERSATION STATE TYPES
// ============================================================================

/**
 * Conversation state - tracks context across turns
 */
export interface ConversationState {
  conversationId: string;
  userId: string;
  activeDocIds: string[];          // Documents most recently used
  lastCitations: Citation[];       // Citations from last answer
  lastAnswerText?: string;         // Last answer text
  lastQuestionType?: QuestionType;
  filters?: ConversationFilters;   // Active filters
  preferences?: UserPreferences;   // User preferences
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Conversation filters - scope for RAG queries
 */
export interface ConversationFilters {
  mimeTypes?: string[];            // Filter by mime type
  tags?: string[];                 // Filter by tags
  folders?: string[];              // Filter by folders
  dateRange?: {                    // Filter by date range
    start: Date;
    end: Date;
  };
}

/**
 * User preferences - how user likes answers
 */
export interface UserPreferences {
  language?: 'pt' | 'en' | 'es' | 'fr';
  answerLength?: 'short' | 'medium' | 'long';
  includeExamples?: boolean;
  includeCitations?: boolean;
}

// ============================================================================
// RAG RETRIEVAL TYPES
// ============================================================================

/**
 * Retrieval options
 */
export interface RetrievalOptions {
  topK: number;                    // Number of chunks to retrieve
  minScore?: number;               // Minimum similarity score
  scopeDocIds?: string[];          // Limit to specific docs
  filters?: ConversationFilters;   // Apply conversation filters
  rerank?: boolean;                // Whether to rerank results
}

/**
 * Retrieved chunk
 */
export interface RetrievedChunk {
  id: string;
  documentId: string;
  text: string;
  metadata: ChunkMetadata;
  score: number;
}

/**
 * Chunk metadata
 */
export interface ChunkMetadata {
  documentTitle: string;
  filename: string;
  page?: number;
  slide?: number;
  sheet?: string;
  chunkIndex: number;
  totalChunks: number;
}

// ============================================================================
// BOLD ENFORCEMENT TYPES
// ============================================================================

/**
 * Bold candidate - something that should be bolded
 */
export interface BoldCandidate {
  text: string;                    // The text to bold
  type: BoldType;                  // What kind of thing is this
  startIndex: number;              // Start position in answer
  endIndex: number;                // End position in answer
  isBolded: boolean;               // Whether it's already bolded
}

/**
 * Bold type - categories of things to bold
 */
export type BoldType =
  | 'currency'                     // R$ 900.000, $500
  | 'percentage'                   // 20%, 15%
  | 'measurement'                  // 1300 m², 50 kg
  | 'kpi'                          // Lucro Líquido, Custo por m²
  | 'critical_phrase';             // objetivo principal, investimento total

/**
 * Bold enforcement result
 */
export interface BoldEnforcementResult {
  originalText: string;
  boldedText: string;
  candidatesFound: number;
  candidatesBolded: number;
  changes: BoldChange[];
}

/**
 * Bold change - a specific bolding operation
 */
export interface BoldChange {
  text: string;
  type: BoldType;
  action: 'added' | 'already_bolded';
}

// ============================================================================
// CITATION PARSING TYPES
// ============================================================================

/**
 * Citation marker - [src:N] in text
 */
export interface CitationMarker {
  markerText: string;              // "[src:1]"
  citationIndex: number;           // 1
  startIndex: number;              // Position in text
  endIndex: number;
  nearestTitle?: string;           // Nearest document title before marker
  titleStartIndex?: number;
  titleEndIndex?: number;
}

/**
 * Citation parsing result
 */
export interface CitationParsingResult {
  originalText: string;
  parsedText: string;              // Text with markers removed
  markers: CitationMarker[];
  citations: Citation[];
  guaranteedClickable: boolean;    // Whether at least one title is clickable
}

// ============================================================================
// DOCUMENT ANALYTICS TYPES
// ============================================================================

/**
 * Document summary response
 */
export interface DocumentSummaryResponse {
  total: number;
  byType: Record<string, number>;  // { pdf: 10, docx: 30, ... }
  byFolder?: Record<string, number>;
}

/**
 * Recent documents response
 */
export interface RecentDocumentsResponse {
  documents: DocumentSummary[];
  total: number;
  limit: number;
}

/**
 * Search documents response
 */
export interface SearchDocumentsResponse {
  documents: DocumentSummary[];
  total: number;
  query: string;
}

/**
 * Document types response
 */
export interface DocumentTypesResponse {
  types: DocumentTypeInfo[];
}

/**
 * Document type info
 */
export interface DocumentTypeInfo {
  mimeType: string;
  label: string;                   // Human-friendly label
  count: number;
  icon?: string;                   // Icon name
}

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * RAG error
 */
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

/**
 * Error codes
 */
export enum RagErrorCode {
  CLASSIFICATION_FAILED = 'CLASSIFICATION_FAILED',
  RETRIEVAL_FAILED = 'RETRIEVAL_FAILED',
  GENERATION_FAILED = 'GENERATION_FAILED',
  CITATION_PARSING_FAILED = 'CITATION_PARSING_FAILED',
  BOLD_ENFORCEMENT_FAILED = 'BOLD_ENFORCEMENT_FAILED',
  CONVERSATION_STATE_NOT_FOUND = 'CONVERSATION_STATE_NOT_FOUND',
  INVALID_DOCUMENT_REFERENCE = 'INVALID_DOCUMENT_REFERENCE',
  ANALYTICS_QUERY_FAILED = 'ANALYTICS_QUERY_FAILED',
}

// ============================================================================
// LEGACY HANDLER TYPES (for backward compatibility)
// ============================================================================

/**
 * Action type for handlers
 */
export type ActionType =
  | 'answer'           // Standard answer response
  | 'navigate'         // Navigation action
  | 'list_documents'   // List documents
  | 'show_folder'      // Show folder contents
  | 'search'           // Search results
  | 'analytics';       // Analytics response

/**
 * RAG Response type for handlers
 */
export interface RAGResponse {
  success: boolean;
  action?: ActionType;
  answer?: string;
  citations?: Citation[];
  documents?: DocumentSummary[];
  metadata?: Record<string, any>;
  error?: string;
}

/**
 * Enhanced chunk metadata - extended metadata for chunks
 */
export interface EnhancedChunkMetadata extends ChunkMetadata {
  pageNumber?: number;       // PDF page number
  slideNumber?: number;      // PPTX slide number
  cellReference?: string;    // Excel cell reference (e.g., "A1")
  sheetName?: string;        // Excel sheet name
  section?: string;          // Document section
  heading?: string;          // Nearest heading
  documentId?: string;       // Document ID
  chunkType?: 'text' | 'table' | 'code' | 'image';
}

// ============================================================================
// NOTE: All types are exported inline via 'export interface/type' declarations
// Use named imports: import { KodaAnswer, Citation, ... } from './rag.types'
// ============================================================================
