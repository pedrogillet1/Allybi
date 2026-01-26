/**
 * Query Enricher
 * Adds document scope metadata to query for retrieval filtering
 */

import { DocumentMatch } from './document-matcher';

export interface EnrichedQuery {
  originalQuery: string;
  searchQuery: string;
  documentScope: {
    enabled: boolean;
    documentId: string | null;
    filename: string | null;
    confidence: number;
  };
  retrievalFilters: {
    pinecone?: { documentId: { $eq: string } };
    bm25?: { documentId: string };
  };
}

/**
 * Enriches the query with document scoping information and filters.
 * @param originalQuery The user's original query.
 * @param documentMatch The result from the document matcher.
 * @returns An EnrichedQuery object.
 */
export function enrichQuery(
  originalQuery: string,
  documentMatch: DocumentMatch | null
): EnrichedQuery {
  // Check if document scoping should be applied
  const shouldScope = documentMatch?.matched && documentMatch.confidence >= 0.7;

  if (!shouldScope) {
    // No scoping - return original query
    return {
      originalQuery,
      searchQuery: originalQuery,
      documentScope: {
        enabled: false,
        documentId: null,
        filename: null,
        confidence: 0,
      },
      retrievalFilters: {},
    };
  }

  // Clean the document reference from the query to improve search focus
  const searchQuery = removeDocumentReferenceFromQuery(originalQuery, documentMatch!.filename!);

  return {
    originalQuery,
    searchQuery: searchQuery || originalQuery, // Fallback to original if query becomes empty
    documentScope: {
      enabled: true,
      documentId: documentMatch!.documentId,
      filename: documentMatch!.filename,
      confidence: documentMatch!.confidence,
    },
    retrievalFilters: {
      pinecone: { documentId: { $eq: documentMatch!.documentId! } },
      bm25: { documentId: documentMatch!.documentId! },
    },
  };
}

/**
 * Removes document reference patterns from query to focus on content.
 * @param query The original query.
 * @param filename The matched filename.
 * @returns Cleaned query string.
 */
function removeDocumentReferenceFromQuery(query: string, filename: string): string {
  // Create a normalized version of the filename for matching
  const normalizedFilename = filename
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '') // Remove extension
    .replace(/\s*\(\d+\)\s*/g, ' ') // Remove (1), (2)
    .replace(/\s*v\d+(\.\d+)?\s*/gi, ' ') // Remove version numbers
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  let cleanedQuery = query.toLowerCase();

  // Remove the filename reference
  cleanedQuery = cleanedQuery.replace(normalizedFilename, '');

  // Remove common document reference patterns
  const patterns = [
    /\s+(?:in|from|about|of)\s+(?:the\s+)?[a-z0-9\s\-_]+?(?:\s+document|\s+file|$)/i,
    /(?:the\s+)?[a-z0-9\s\-_]+?\s+(?:document|file|pdf|docx)/i,
    /(?:in|from|about|of|regarding)\s+(?:the\s+)?/i,
  ];

  for (const pattern of patterns) {
    cleanedQuery = cleanedQuery.replace(pattern, ' ');
  }

  // Clean up extra whitespace
  cleanedQuery = cleanedQuery.replace(/\s+/g, ' ').trim();

  // If the cleaned query is too short, return the original
  if (cleanedQuery.length < 3) {
    return query;
  }

  return cleanedQuery;
}
