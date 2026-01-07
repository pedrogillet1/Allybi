/**
 * Location-Aware Retrieval Service
 *
 * Provides page-directed and section-filtered retrieval modes:
 * - PAGE_LOOKUP: Direct page number queries ("page 150", "página 150")
 * - SECTION_FILTER: Section-specific queries (future enhancement)
 * - SEMANTIC (default): Standard embedding-based retrieval
 *
 * Features:
 * - Multi-language page pattern detection (EN/PT/ES)
 * - Neighbor chunk expansion for better context
 * - Page range filtering via Pinecone metadata
 */

import { Pinecone } from '@pinecone-database/pinecone';
import defaultLogger from '../../utils/logger';

const logger = {
  info: (msg: string, ...args: any[]) => defaultLogger.info(`[LocationRetrieval] ${msg}`, ...args),
  warn: (msg: string, ...args: any[]) => defaultLogger.warn(`[LocationRetrieval] ${msg}`, ...args),
  debug: (msg: string, ...args: any[]) => defaultLogger.debug(`[LocationRetrieval] ${msg}`, ...args),
};

// ============================================================================
// Types
// ============================================================================

export type RetrievalMode = 'SEMANTIC' | 'PAGE_LOOKUP' | 'SECTION_FILTER';

export interface PageQueryResult {
  detected: boolean;
  pageNumber: number | null;
  documentName: string | null;  // If user mentioned a specific doc
  mode: RetrievalMode;
}

export interface LocationChunk {
  id: string;
  documentId: string;
  filename: string;
  content: string;
  score: number;
  chunkOrder: number;
  pageStart: number | null;
  pageEnd: number | null;
  headingPath: string[];
  metadata: Record<string, any>;
}

export interface PageLookupResult {
  chunks: LocationChunk[];
  pageNumber: number;
  documentId: string | null;
  neighborCount: number;
}

// ============================================================================
// Page Pattern Detection (EN/PT/ES)
// ============================================================================

// Patterns for page number detection in multiple languages
const PAGE_PATTERNS = [
  // English
  /\bpage\s+(\d+)\b/i,
  /\bp\.\s*(\d+)\b/i,
  /\bpg\.\s*(\d+)\b/i,
  /\bpg\s+(\d+)\b/i,
  // Portuguese
  /\bpágina\s+(\d+)\b/i,
  /\bpagina\s+(\d+)\b/i,
  /\bpág\.?\s*(\d+)\b/i,
  /\bpag\.?\s*(\d+)\b/i,
  // Spanish
  /\bpágina\s+(\d+)\b/i,
  /\bpag\.?\s*(\d+)\b/i,
];

// Document name patterns to extract mentioned filenames
const DOC_NAME_PATTERNS = [
  /(?:in|from|of|no|do|del)\s+["']?([^"'\n]+\.(?:pdf|docx?|xlsx?|pptx?))["']?/i,
  /["']([^"'\n]+\.(?:pdf|docx?|xlsx?|pptx?))["']/i,
  /\b(\S+\.(?:pdf|docx?|xlsx?|pptx?))\b/i,
];

/**
 * Detect if a query is asking for a specific page
 */
export function detectPageQuery(query: string): PageQueryResult {
  const normalizedQuery = query.toLowerCase().trim();

  // Check each page pattern
  for (const pattern of PAGE_PATTERNS) {
    const match = normalizedQuery.match(pattern);
    if (match) {
      const pageNumber = parseInt(match[1], 10);
      if (!isNaN(pageNumber) && pageNumber > 0) {
        // Try to extract document name if mentioned
        let documentName: string | null = null;
        for (const docPattern of DOC_NAME_PATTERNS) {
          const docMatch = query.match(docPattern);
          if (docMatch) {
            documentName = docMatch[1].trim();
            break;
          }
        }

        logger.info(`Detected page query: page ${pageNumber}${documentName ? ` in ${documentName}` : ''}`);

        return {
          detected: true,
          pageNumber,
          documentName,
          mode: 'PAGE_LOOKUP',
        };
      }
    }
  }

  return {
    detected: false,
    pageNumber: null,
    documentName: null,
    mode: 'SEMANTIC',
  };
}

// ============================================================================
// Page Lookup Retrieval
// ============================================================================

/**
 * Retrieve chunks for a specific page using Pinecone metadata filtering
 */
export async function retrieveByPage(params: {
  userId: string;
  pageNumber: number;
  documentId?: string;   // Optional: filter to specific document
  maxChunks?: number;    // Max chunks to return (default 10)
  includeNeighbors?: boolean;  // Include neighbor chunks (default true)
}): Promise<PageLookupResult> {
  const {
    userId,
    pageNumber,
    documentId,
    maxChunks = 10,
    includeNeighbors = true,
  } = params;

  logger.info(`Page lookup: page ${pageNumber}${documentId ? ` in doc ${documentId}` : ''}`);

  try {
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!,
    });
    const index = pinecone.Index(process.env.PINECONE_INDEX_NAME || 'koda-openai');

    // Build filter for page range
    const filter: Record<string, any> = {
      userId,
      $or: [
        // Single page match
        { page: pageNumber },
        // Page range match (pageStart <= pageNumber <= pageEnd)
        {
          $and: [
            { pageStart: { $lte: pageNumber } },
            { pageEnd: { $gte: pageNumber } },
          ],
        },
      ],
    };

    // Add document filter if specified
    if (documentId) {
      filter.documentId = documentId;
    }

    // Query Pinecone with filter (no embedding needed for page lookup)
    // Use a dummy vector since we're filtering by metadata only
    const dummyVector = new Array(1536).fill(0);

    const queryResult = await index.query({
      vector: dummyVector,
      topK: maxChunks * 2,  // Get extra for neighbor expansion
      filter,
      includeMetadata: true,
    });

    if (!queryResult.matches || queryResult.matches.length === 0) {
      logger.info(`No chunks found for page ${pageNumber}`);
      return {
        chunks: [],
        pageNumber,
        documentId: documentId || null,
        neighborCount: 0,
      };
    }

    // Convert matches to LocationChunks
    let chunks: LocationChunk[] = queryResult.matches.map(match => ({
      id: match.id,
      documentId: match.metadata?.documentId as string,
      filename: match.metadata?.filename as string,
      content: match.metadata?.content as string,
      score: match.score || 0,
      chunkOrder: (match.metadata?.chunkOrder as number) ?? (match.metadata?.chunkIndex as number) ?? 0,
      pageStart: match.metadata?.pageStart as number | null,
      pageEnd: match.metadata?.pageEnd as number | null,
      headingPath: (match.metadata?.headingPath as string[]) || (match.metadata?.headings as string[]) || [],
      metadata: match.metadata || {},
    }));

    // Sort by chunk order
    chunks.sort((a, b) => a.chunkOrder - b.chunkOrder);

    // Neighbor expansion
    let neighborCount = 0;
    if (includeNeighbors && chunks.length > 0) {
      const expanded = await expandWithNeighbors(index, chunks, userId);
      neighborCount = expanded.length - chunks.length;
      chunks = expanded;
    }

    // Limit to maxChunks
    chunks = chunks.slice(0, maxChunks);

    logger.info(`Found ${chunks.length} chunks for page ${pageNumber} (+${neighborCount} neighbors)`);

    return {
      chunks,
      pageNumber,
      documentId: chunks[0]?.documentId || documentId || null,
      neighborCount,
    };
  } catch (error) {
    logger.warn(`Page lookup failed: ${(error as Error).message}`);
    return {
      chunks: [],
      pageNumber,
      documentId: documentId || null,
      neighborCount: 0,
    };
  }
}

// ============================================================================
// Neighbor Chunk Expansion
// ============================================================================

/**
 * Expand chunk list with neighboring chunks for better context
 * Fetches chunkOrder-1 and chunkOrder+1 for each chunk in the same document/page
 */
async function expandWithNeighbors(
  index: any,
  chunks: LocationChunk[],
  userId: string
): Promise<LocationChunk[]> {
  const chunkMap = new Map<string, LocationChunk>();

  // Add original chunks
  for (const chunk of chunks) {
    chunkMap.set(chunk.id, chunk);
  }

  // Collect neighbor chunk IDs to fetch
  const neighborIds: string[] = [];
  for (const chunk of chunks) {
    const docId = chunk.documentId;
    const order = chunk.chunkOrder;

    // Previous chunk
    if (order > 0) {
      const prevId = `${docId}-${order - 1}`;
      if (!chunkMap.has(prevId)) {
        neighborIds.push(prevId);
      }
    }

    // Next chunk
    const nextId = `${docId}-${order + 1}`;
    if (!chunkMap.has(nextId)) {
      neighborIds.push(nextId);
    }
  }

  if (neighborIds.length === 0) {
    return chunks;
  }

  // Fetch neighbor chunks by ID
  try {
    const fetchResult = await index.fetch(neighborIds);

    if (fetchResult.records) {
      for (const [id, record] of Object.entries(fetchResult.records)) {
        if (record && (record as any).metadata) {
          const meta = (record as any).metadata;
          // Verify same user
          if (meta.userId === userId) {
            const neighborChunk: LocationChunk = {
              id,
              documentId: meta.documentId,
              filename: meta.filename,
              content: meta.content,
              score: 0.5,  // Lower score for neighbors
              chunkOrder: meta.chunkOrder ?? meta.chunkIndex ?? 0,
              pageStart: meta.pageStart,
              pageEnd: meta.pageEnd,
              headingPath: meta.headingPath || meta.headings || [],
              metadata: meta,
            };
            chunkMap.set(id, neighborChunk);
          }
        }
      }
    }
  } catch (error) {
    logger.warn(`Failed to fetch neighbor chunks: ${(error as Error).message}`);
  }

  // Convert back to sorted array
  const expanded = Array.from(chunkMap.values());
  expanded.sort((a, b) => {
    // Sort by document first, then by chunk order
    if (a.documentId !== b.documentId) {
      return a.documentId.localeCompare(b.documentId);
    }
    return a.chunkOrder - b.chunkOrder;
  });

  return expanded;
}

// ============================================================================
// Document Name Normalization (for Part D)
// ============================================================================

/**
 * Normalize document name for matching
 * - lowercase
 * - strip/normalize accents (NFD remove diacritics)
 * - collapse whitespace and punctuation
 */
export function normalizeDocumentName(name: string): string {
  if (!name) return '';

  return name
    .toLowerCase()
    // Normalize Unicode (NFD = decomposed form)
    .normalize('NFD')
    // Remove diacritical marks (accents)
    .replace(/[\u0300-\u036f]/g, '')
    // Fix common mojibake patterns
    .replace(/ã/g, 'a')
    .replace(/ç/g, 'c')
    .replace(/é/g, 'e')
    .replace(/í/g, 'i')
    .replace(/ó/g, 'o')
    .replace(/ú/g, 'u')
    .replace(/ñ/g, 'n')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    // Remove punctuation except dots (for extensions)
    .replace(/[^\w\s.]/g, '')
    .trim();
}

/**
 * Match document name against a list of documents
 * Returns best matching document or null
 */
export function matchDocumentByName(
  searchName: string,
  documents: Array<{ id: string; filename: string }>
): { id: string; filename: string; score: number } | null {
  if (!searchName || documents.length === 0) return null;

  const normalizedSearch = normalizeDocumentName(searchName);

  let bestMatch: { id: string; filename: string; score: number } | null = null;

  for (const doc of documents) {
    const normalizedDoc = normalizeDocumentName(doc.filename);

    // Exact match
    if (normalizedDoc === normalizedSearch) {
      return { ...doc, score: 1.0 };
    }

    // Contains match
    if (normalizedDoc.includes(normalizedSearch) || normalizedSearch.includes(normalizedDoc)) {
      const score = Math.min(normalizedSearch.length, normalizedDoc.length) /
                    Math.max(normalizedSearch.length, normalizedDoc.length);
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { ...doc, score };
      }
    }
  }

  return bestMatch;
}

// ============================================================================
// Exports
// ============================================================================

export default {
  detectPageQuery,
  retrieveByPage,
  normalizeDocumentName,
  matchDocumentByName,
};
