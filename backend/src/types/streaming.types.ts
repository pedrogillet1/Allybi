/**
 * Streaming Types for TRUE End-to-End Streaming
 *
 * These types support real-time token streaming from LLM to browser.
 * TTFT (Time To First Token) should be <300-800ms with true streaming.
 */

import { LanguageCode } from './intentV3.types';

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
