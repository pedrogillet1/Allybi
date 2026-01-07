/**
 * Docling Semantic Retrieval Service
 * Bridges Docling semantic search with the existing retrieval engine.
 * Can be used as an additional source alongside Pinecone or as a fallback.
 */
import { RetrievedChunk, RetrievalFilters } from '../../types/ragV3.types';
import { searchChunks, hybridSearch, getIndexStats, SemanticSearchResult } from './semanticSearch.service';
import defaultLogger from '../../utils/logger';

const logger = {
  info: (msg: string, ...args: any[]) => defaultLogger.info(`[DoclingRetrieval] ${msg}`, ...args),
  warn: (msg: string, ...args: any[]) => defaultLogger.warn(`[DoclingRetrieval] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) => defaultLogger.error(`[DoclingRetrieval] ${msg}`, ...args),
  debug: (msg: string, ...args: any[]) => defaultLogger.debug(`[DoclingRetrieval] ${msg}`, ...args),
};

// ============================================================================
// Configuration
// ============================================================================

const DOCLING_SEMANTIC_ENABLED = process.env.DOCLING_SEMANTIC_ENABLED !== 'false';
const DOCLING_MIN_SCORE = parseFloat(process.env.DOCLING_MIN_SCORE || '0.5');
const DOCLING_TOP_K = parseInt(process.env.DOCLING_TOP_K || '10', 10);

// ============================================================================
// Types
// ============================================================================

export interface DoclingRetrievalParams {
  userId: string;
  query: string;
  filters?: RetrievalFilters;
  topK?: number;
  minScore?: number;
  useHybrid?: boolean;  // Use hybrid (semantic + keyword) search
}

export interface DoclingRetrievalResult {
  chunks: RetrievedChunk[];
  source: 'docling_semantic' | 'docling_hybrid';
  totalIndexed: number;
  searchTimeMs: number;
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Check if Docling semantic retrieval is available.
 */
export function isDoclingRetrievalAvailable(): boolean {
  if (!DOCLING_SEMANTIC_ENABLED) {
    return false;
  }
  const stats = getIndexStats();
  return stats.totalChunks > 0;
}

/**
 * Perform semantic retrieval using Docling-indexed chunks.
 */
export async function retrieveWithDocling(
  params: DoclingRetrievalParams
): Promise<DoclingRetrievalResult> {
  const {
    query,
    filters,
    topK = DOCLING_TOP_K,
    minScore = DOCLING_MIN_SCORE,
    useHybrid = false,
  } = params;

  const startTime = Date.now();

  if (!isDoclingRetrievalAvailable()) {
    logger.debug('Docling semantic retrieval not available');
    return {
      chunks: [],
      source: 'docling_semantic',
      totalIndexed: 0,
      searchTimeMs: 0,
    };
  }

  try {
    // Get index stats
    const stats = getIndexStats();

    // Perform search
    let results: SemanticSearchResult[];

    if (useHybrid) {
      results = await hybridSearch(query, {
        topK,
        minScore,
        documentIds: filters?.documentIds,
        keywordBoost: 0.15,
      });
    } else {
      results = await searchChunks(query, {
        topK,
        minScore,
        documentIds: filters?.documentIds,
      });
    }

    // Convert to RetrievedChunk format
    const chunks: RetrievedChunk[] = results.map((result, index) => ({
      chunkId: result.chunkId,
      documentId: result.documentId,
      documentName: result.documentName,
      score: result.score,
      pageNumber: result.metadata.page,
      slideNumber: undefined,
      content: result.text,
      metadata: {
        ...result.metadata,
        source: 'docling',
        retrievalRank: index + 1,
      },
    }));

    const searchTimeMs = Date.now() - startTime;

    logger.info(`Retrieved ${chunks.length} chunks in ${searchTimeMs}ms (indexed: ${stats.totalChunks})`);

    return {
      chunks,
      source: useHybrid ? 'docling_hybrid' : 'docling_semantic',
      totalIndexed: stats.totalChunks,
      searchTimeMs,
    };
  } catch (error: any) {
    logger.error(`Retrieval failed: ${error.message}`);
    return {
      chunks: [],
      source: 'docling_semantic',
      totalIndexed: 0,
      searchTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Merge Docling results with existing retrieval results.
 * Uses reciprocal rank fusion for score combination.
 */
export function mergeWithDoclingResults(
  existingChunks: RetrievedChunk[],
  doclingChunks: RetrievedChunk[],
  options: {
    existingWeight?: number;  // Weight for existing results (default: 0.6)
    doclingWeight?: number;   // Weight for Docling results (default: 0.4)
    maxChunks?: number;       // Max chunks to return
  } = {}
): RetrievedChunk[] {
  const {
    existingWeight = 0.6,
    doclingWeight = 0.4,
    maxChunks = 10,
  } = options;

  // Build a map for deduplication and score combination
  const chunkMap = new Map<string, RetrievedChunk & { combinedScore: number }>();

  // Process existing chunks
  for (const chunk of existingChunks) {
    const key = `${chunk.documentId}-${chunk.chunkId}`;
    const existing = chunkMap.get(key);

    if (existing) {
      existing.combinedScore += chunk.score * existingWeight;
    } else {
      chunkMap.set(key, {
        ...chunk,
        combinedScore: chunk.score * existingWeight,
      });
    }
  }

  // Process Docling chunks
  for (const chunk of doclingChunks) {
    const key = `${chunk.documentId}-${chunk.chunkId}`;
    const existing = chunkMap.get(key);

    if (existing) {
      existing.combinedScore += chunk.score * doclingWeight;
      // Merge metadata
      existing.metadata = { ...existing.metadata, ...chunk.metadata };
    } else {
      chunkMap.set(key, {
        ...chunk,
        combinedScore: chunk.score * doclingWeight,
      });
    }
  }

  // Sort by combined score and take top K
  const merged = Array.from(chunkMap.values())
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, maxChunks)
    .map(({ combinedScore, ...chunk }) => ({
      ...chunk,
      score: combinedScore,
    }));

  return merged;
}

// ============================================================================
// Exports
// ============================================================================

export const DoclingSemanticRetrieval = {
  isAvailable: isDoclingRetrievalAvailable,
  retrieve: retrieveWithDocling,
  merge: mergeWithDoclingResults,
  config: {
    enabled: DOCLING_SEMANTIC_ENABLED,
    minScore: DOCLING_MIN_SCORE,
    topK: DOCLING_TOP_K,
  },
};

export default DoclingSemanticRetrieval;
