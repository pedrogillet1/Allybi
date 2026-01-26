/**
 * Streaming Types for TRUE End-to-End Streaming
 *
 * These types support real-time token streaming from LLM to browser.
 * TTFT (Time To First Token) should be <300-800ms with true streaming.
 */

import { LanguageCode } from './intentV3.types';
import { SourceButtonsAttachment, FileListAttachment } from '../services/core/sourceButtons.service';

// ============================================================================
// STREAM EVENT TYPES
// ============================================================================

export type StreamEventType =
  | 'thinking'     // Initial processing indicator
  | 'intent'       // Intent classification result
  | 'retrieving'   // Document retrieval in progress
  | 'generating'   // Starting answer generation
  | 'content'      // Actual content chunk (token)
  | 'citation'     // Citation/source information
  | 'metadata'     // Response metadata
  | 'done'         // Stream complete
  | 'error';       // Error occurred

// ============================================================================
// STREAM EVENTS
// ============================================================================

export interface StreamEventBase {
  type: StreamEventType;
  timestamp?: number;
  requestId?: string;  // S1.1: Every SSE event includes requestId for stream correlation
}

export interface ThinkingEvent extends StreamEventBase {
  type: 'thinking';
  message: string;
}

export interface IntentEvent extends StreamEventBase {
  type: 'intent';
  intent: string;
  confidence: number;
  // Debug fields for frontend verification
  domain?: string;
  depth?: string;           // D1-D5 depth level
  blockedByNegatives?: boolean;
  family?: string;          // Intent family (documents, help, etc.)
  subIntent?: string;       // Sub-intent if applicable
}

export interface RetrievingEvent extends StreamEventBase {
  type: 'retrieving';
  message: string;
  documentCount?: number;
}

export interface GeneratingEvent extends StreamEventBase {
  type: 'generating';
  message: string;
}

export interface ContentEvent extends StreamEventBase {
  type: 'content';
  content: string;  // The actual token/chunk text
  // Multi-intent segment info (optional)
  segment?: number;  // Segment number (1-indexed) for multi-intent
  intent?: string;   // Intent of this segment
}

export interface CitationEvent extends StreamEventBase {
  type: 'citation';
  citations: Array<{
    documentId: string;
    documentName: string;
    pageNumber?: number;
    chunkId?: string;     // Chunk ID for precise citation source
    snippet?: string;
  }>;
}

export interface MetadataEvent extends StreamEventBase {
  type: 'metadata';
  processingTime?: number;
  tokensUsed?: number;
  documentsUsed?: number;
  // Multi-intent metadata (optional)
  multiIntent?: boolean;
  segmentCount?: number;
  segments?: Array<{
    intent: string;
    confidence: number;
    documentsUsed: number;
  }>;
}

export interface DoneEvent extends StreamEventBase {
  type: 'done';
  messageId?: string;
  assistantMessageId?: string;
  conversationId?: string;
  fullAnswer?: string;  // Complete answer for saving
  /** Formatted answer with {{DOC::...}} markers for frontend rendering */
  formatted?: string;
  /** Formatting constraints for frontend rendering */
  constraints?: ResponseConstraints;
  // Citations for save path (store in message metadata)
  citations?: Array<{
    documentId: string;
    documentName: string;
    pageNumber?: number;
    chunkId?: string;     // Chunk ID for precise citation source
    snippet?: string;
  }>;
  // Source document IDs for metadata persistence
  sourceDocumentIds?: string[];
  // Processing metadata
  intent?: string;
  confidence?: number;
  documentsUsed?: number;
  tokensUsed?: number;
  processingTime?: number;
  /** TRUST_HARDENING: Number of chunks actually retrieved for grounding */
  chunksReturned?: number;
  /** TRUST_HARDENING: Whether retrieval met minimum adequacy threshold */
  retrievalAdequate?: boolean;
  /** TRUST_HARDENING: Flag if sources array is empty despite having retrieved chunks */
  sourcesMissing?: boolean;
  /** Whether the answer was truncated due to token limits */
  wasTruncated?: boolean;
  /** Whether stream was aborted by client disconnect */
  wasAborted?: boolean;
  // File action response fields (for structured rendering without markers)
  /** File attachments for deterministic button rendering */
  attachments?: Array<{
    id: string;
    name: string;
    mimeType: string;
    size?: number;
    folderPath?: string | null;
    purpose?: 'open' | 'preview' | 'compare';
  }>;
  /** Structured actions for file operations */
  actions?: Array<{
    type: 'file_action';
    action: 'OPEN' | 'MOVE' | 'RENAME' | 'DELETE' | 'CREATE_FOLDER';
    payload?: Record<string, any>;
  }>;
  /** IDs of files referenced in this response for context tracking */
  referencedFileIds?: string[];
  /**
   * CHATGPT-LIKE SOURCE BUTTONS
   * Structured source/citation pills - replaces inline filenames and numbered lists.
   * Frontend renders these as clickable pills below the answer.
   */
  sourceButtons?: SourceButtonsAttachment;
  /**
   * FILE LIST ATTACHMENT
   * For "list files" queries - rendered as file cards, not text.
   */
  fileList?: FileListAttachment;
  /**
   * FULL SOURCES ARRAY (for backward compatibility)
   * Contains all source document details for frontend DocumentSources component.
   * FIXED: Frontend expects 'sources' array with documentId, filename, location, etc.
   */
  sources?: Array<{
    documentId: string;
    documentName?: string;
    filename?: string;
    location?: string;
    mimeType?: string;
    relevanceScore?: number;
    folderPath?: string;
    pageNumber?: number;
    snippet?: string;
    viewUrl?: string;
    downloadUrl?: string;
  }>;
  /**
   * PREFLIGHT GATE 1: Composer stamp to verify all responses went through AnswerComposer.
   * Every response MUST have this stamp. If missing, that route bypassed the composer.
   */
  composedBy?: string;
  /**
   * CHATGPT-QUALITY FOLLOW-UP SUGGESTIONS
   * Context-aware next actions based on conversation state and latest result.
   * Frontend renders these as clickable chips/buttons below the answer.
   */
  followUpSuggestions?: Array<{
    id: string;
    action: string;
    label: string;
    priority: number;
    prompt?: string;
    payload?: Record<string, any>;
  }>;
  /**
   * TRUNCATION-G: Evidence strength for thin-evidence hedging
   * Frontend can show "Based on limited information" badge when weak/moderate
   */
  evidenceStrength?: 'strong' | 'moderate' | 'weak' | 'none';
  /**
   * TRUNCATION-G: Suggested action from evidence gate
   * 'hedge' = show hedge prefix, 'clarify' = show clarification, 'apologize' = no evidence
   */
  evidenceAction?: 'answer' | 'hedge' | 'clarify' | 'apologize';

  /**
   * TRUST GATE: Anti-hallucination validation results
   * Verifies that claims in the answer are grounded in retrieved evidence.
   * Required for ChatGPT parity certification.
   */
  trustCheck?: {
    trusted: boolean;
    groundedClaims: number;
    ungroundedClaims: number;
    recommendedAction: 'pass' | 'add_citation' | 'hedge' | 'rewrite' | 'reject';
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // CHATGPT-LIKE INSTRUMENTATION (mandatory for certification testing)
  // These fields prove each response followed the correct pipeline and templates
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * OPERATOR: High-level action that was performed
   * Proves routing correctness - must match user intent
   */
  operator?: 'summarize' | 'extract' | 'locate' | 'compare' | 'compute' | 'list' | 'open' | 'where' | 'stats' | 'help' | 'clarify' | 'filter' | 'define' | 'explain' | 'unknown';

  /**
   * TEMPLATE ID: Which answer template was used
   * Proves template adherence - deterministic template selection
   */
  templateId?: string;

  /**
   * LANGUAGE DETECTED: From LanguageDetector on user query
   * Proves language detection is working
   */
  languageDetected?: string;

  /**
   * LANGUAGE LOCKED: Final output language applied
   * Proves language lock is honored
   */
  languageLocked?: string;

  /**
   * TRUNCATION REPAIR APPLIED: True if CompletionGate modified the output
   * Proves truncation repair is active and working
   */
  truncationRepairApplied?: boolean;

  /**
   * DOC SCOPE: single_doc | multi_doc | unknown
   * Proves scope gate is correctly scoping responses
   */
  docScope?: 'single_doc' | 'multi_doc' | 'unknown';

  /**
   * SCOPE DOC IDS: Top 1-3 document IDs used for scoping (dev mode)
   */
  scopeDocIds?: string[];

  /**
   * ANCHOR TYPES: Types of content anchors found in sources
   * Proves we're providing accurate content locations
   */
  anchorTypes?: Array<'pdf_page' | 'ppt_slide' | 'xlsx_cell' | 'xlsx_range' | 'docx_heading' | 'image_ocr_block' | 'none'>;

  /**
   * ATTACHMENTS TYPES: Types of attachments emitted
   * Proves correct UI contract (button-only, file_list, etc.)
   */
  attachmentsTypes?: Array<'source_buttons' | 'file_list' | 'select_file' | 'followup_chips' | 'breadcrumbs'>;
}

export interface ErrorEvent extends StreamEventBase {
  type: 'error';
  error: string;
  code?: string;
}

export type StreamEvent =
  | ThinkingEvent
  | IntentEvent
  | RetrievingEvent
  | GeneratingEvent
  | ContentEvent
  | CitationEvent
  | MetadataEvent
  | DoneEvent
  | ErrorEvent;

// ============================================================================
// STREAMING REQUEST/RESPONSE
// ============================================================================

export interface StreamingRequest {
  userId: string;
  text: string;
  language: LanguageCode;
  conversationId?: string;
  context?: {
    attachedDocumentIds?: string[];
    [key: string]: any;
  };
  /** AbortSignal for cancellation on client disconnect */
  abortSignal?: AbortSignal;
}

/**
 * Formatting constraints for frontend rendering
 * These flags tell the UI how to render the response
 */
export interface ResponseConstraints {
  /** Only render file buttons, no text content */
  buttonsOnly?: boolean;
  /** Render content as JSON code block */
  jsonOnly?: boolean;
  /** Render content as CSV code block */
  csvOnly?: boolean;
  /** Content is a table, preserve table formatting */
  tableOnly?: boolean;
  /** Exact number of bullets required (strict enforcement) */
  exactBullets?: number;
  /** Maximum characters (backend responsibility to enforce) */
  maxChars?: number;
}

export interface StreamingResult {
  fullAnswer: string;
  intent: string;
  confidence: number;
  documentsUsed: number;
  tokensUsed?: number;
  processingTime: number;
  wasTruncated?: boolean;
  /** Formatting constraints for frontend rendering */
  constraints?: ResponseConstraints;
  citations?: Array<{
    documentId: string;
    documentName: string;
    pageNumber?: number;
    chunkId?: string;     // Chunk ID for precise citation source
    snippet?: string;
  }>;
}

// ============================================================================
// ASYNC GENERATOR TYPE
// ============================================================================

export type StreamGenerator = AsyncGenerator<StreamEvent, StreamingResult, unknown>;

// ============================================================================
// CALLBACK TYPES
// ============================================================================

export type OnChunkCallback = (chunk: string) => void;
export type OnEventCallback = (event: StreamEvent) => void;
