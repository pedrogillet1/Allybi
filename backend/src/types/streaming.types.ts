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

export interface StreamingResult {
  fullAnswer: string;
  intent: string;
  confidence: number;
  documentsUsed: number;
  tokensUsed?: number;
  processingTime: number;
  wasTruncated?: boolean;
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
