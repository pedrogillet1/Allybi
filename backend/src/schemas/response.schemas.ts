/**
 * Response Schemas
 * Type definitions for API responses
 */

export interface ChatResponse {
  id: string;
  conversationId: string;
  content: string;
  sources?: SourceReference[];
  metadata?: ResponseMetadata;
}

export interface SourceReference {
  documentId: string;
  documentName: string;
  pageNumber?: number;
  excerpt?: string;
}

export interface ResponseMetadata {
  processingTime: number;
  tokensUsed: number;
  model: string;
}

export interface DocumentResponse {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  folderId?: string;
  tags?: string[];
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SearchResult {
  documentId: string;
  documentName: string;
  score: number;
  excerpt: string;
  highlights: string[];
}
