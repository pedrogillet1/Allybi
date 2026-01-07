/**
 * Semantic Search Service
 * Performs cosine similarity search over document chunks with embeddings.
 */
import defaultLogger from '../../utils/logger';
import { getEmbedding, getEmbeddings } from './embeddings.service';

const logger = {
  info: (msg: string, ...args: any[]) => defaultLogger.info(`[SemanticSearch] ${msg}`, ...args),
  warn: (msg: string, ...args: any[]) => defaultLogger.warn(`[SemanticSearch] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) => defaultLogger.error(`[SemanticSearch] ${msg}`, ...args),
  debug: (msg: string, ...args: any[]) => defaultLogger.debug(`[SemanticSearch] ${msg}`, ...args),
};

// ============================================================================
// Types
// ============================================================================

export interface IndexedChunk {
  chunkId: string;
  documentId: string;
  documentName: string;
  text: string;
  embedding: number[];
  metadata: {
    page?: number;
    headings?: string[];
    charCount?: number;
    [key: string]: any;
  };
}

export interface SemanticSearchResult {
  chunkId: string;
  documentId: string;
  documentName: string;
  text: string;
  score: number;
  metadata: {
    page?: number;
    headings?: string[];
    [key: string]: any;
  };
}

export interface SemanticSearchOptions {
  topK?: number;           // Number of results to return (default: 10)
  minScore?: number;       // Minimum similarity score (default: 0.5)
  maxCharsPerChunk?: number;  // Truncate chunk text (default: 2000)
  documentIds?: string[];  // Filter to specific documents
}

// ============================================================================
// Math Utilities
// ============================================================================

/**
 * Compute cosine similarity between two vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Normalize a vector to unit length.
 */
function normalizeVector(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
  if (norm === 0) return v;
  return v.map((x) => x / norm);
}

// ============================================================================
// In-Memory Index (for development/testing)
// ============================================================================

class InMemoryChunkIndex {
  private chunks: Map<string, IndexedChunk> = new Map();
  private byDocument: Map<string, Set<string>> = new Map();

  add(chunk: IndexedChunk): void {
    this.chunks.set(chunk.chunkId, chunk);

    if (!this.byDocument.has(chunk.documentId)) {
      this.byDocument.set(chunk.documentId, new Set());
    }
    this.byDocument.get(chunk.documentId)!.add(chunk.chunkId);
  }

  addBatch(chunks: IndexedChunk[]): void {
    for (const chunk of chunks) {
      this.add(chunk);
    }
  }

  get(chunkId: string): IndexedChunk | undefined {
    return this.chunks.get(chunkId);
  }

  getByDocument(documentId: string): IndexedChunk[] {
    const chunkIds = this.byDocument.get(documentId);
    if (!chunkIds) return [];
    return Array.from(chunkIds).map((id) => this.chunks.get(id)!).filter(Boolean);
  }

  getAll(): IndexedChunk[] {
    return Array.from(this.chunks.values());
  }

  removeDocument(documentId: string): void {
    const chunkIds = this.byDocument.get(documentId);
    if (chunkIds) {
      for (const chunkId of chunkIds) {
        this.chunks.delete(chunkId);
      }
      this.byDocument.delete(documentId);
    }
  }

  clear(): void {
    this.chunks.clear();
    this.byDocument.clear();
  }

  size(): number {
    return this.chunks.size;
  }
}

// Global index instance (in production, this would be persisted)
const globalIndex = new InMemoryChunkIndex();

// ============================================================================
// Main Search Functions
// ============================================================================

/**
 * Search for chunks similar to the query.
 */
export async function searchChunks(
  query: string,
  options: SemanticSearchOptions = {}
): Promise<SemanticSearchResult[]> {
  const {
    topK = 10,
    minScore = 0.5,
    maxCharsPerChunk = 2000,
    documentIds,
  } = options;

  const startTime = Date.now();

  // Get query embedding
  const queryResult = await getEmbedding(query);
  const queryEmbedding = normalizeVector(queryResult.embedding);

  // Get chunks to search
  let chunks = globalIndex.getAll();

  // Filter by document IDs if specified
  if (documentIds && documentIds.length > 0) {
    const docIdSet = new Set(documentIds);
    chunks = chunks.filter((c) => docIdSet.has(c.documentId));
  }

  if (chunks.length === 0) {
    logger.debug('[SemanticSearch] No chunks in index');
    return [];
  }

  // Score all chunks
  const scored: Array<{ chunk: IndexedChunk; score: number }> = [];

  for (const chunk of chunks) {
    if (!chunk.embedding || chunk.embedding.length === 0) {
      continue;
    }

    const chunkEmbedding = normalizeVector(chunk.embedding);
    const score = cosineSimilarity(queryEmbedding, chunkEmbedding);

    if (score >= minScore) {
      scored.push({ chunk, score });
    }
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Take top K
  const topResults = scored.slice(0, topK);

  // Format results
  const results: SemanticSearchResult[] = topResults.map(({ chunk, score }) => ({
    chunkId: chunk.chunkId,
    documentId: chunk.documentId,
    documentName: chunk.documentName,
    text: chunk.text.substring(0, maxCharsPerChunk),
    score,
    metadata: chunk.metadata,
  }));

  const elapsed = Date.now() - startTime;
  logger.info(`[SemanticSearch] Found ${results.length} results in ${elapsed}ms (searched ${chunks.length} chunks)`);

  return results;
}

/**
 * Search with hybrid scoring (semantic + keyword boost).
 */
export async function hybridSearch(
  query: string,
  options: SemanticSearchOptions & { keywordBoost?: number } = {}
): Promise<SemanticSearchResult[]> {
  const { keywordBoost = 0.1, ...searchOptions } = options;

  // Get semantic results
  const results = await searchChunks(query, searchOptions);

  // Boost scores for keyword matches
  const queryTerms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);

  for (const result of results) {
    const textLower = result.text.toLowerCase();
    let keywordScore = 0;

    for (const term of queryTerms) {
      if (textLower.includes(term)) {
        keywordScore += keywordBoost;
      }
    }

    result.score = Math.min(1, result.score + keywordScore);
  }

  // Re-sort after boosting
  results.sort((a, b) => b.score - a.score);

  return results;
}

// ============================================================================
// Index Management
// ============================================================================

/**
 * Index a document's chunks.
 */
export async function indexDocumentChunks(
  documentId: string,
  documentName: string,
  chunks: Array<{
    chunkId: string;
    text: string;
    meta?: any;
  }>
): Promise<number> {
  const startTime = Date.now();

  // Get embeddings for all chunks
  const texts = chunks.map((c) => c.text);
  const embeddingResult = await getEmbeddings(texts);

  // Build indexed chunks
  const indexedChunks: IndexedChunk[] = chunks.map((chunk, i) => ({
    chunkId: chunk.chunkId,
    documentId,
    documentName,
    text: chunk.text,
    embedding: embeddingResult.embeddings[i],
    metadata: chunk.meta || {},
  }));

  // Add to index
  globalIndex.addBatch(indexedChunks);

  const elapsed = Date.now() - startTime;
  logger.info(`[SemanticSearch] Indexed ${chunks.length} chunks for ${documentName} in ${elapsed}ms`);

  return chunks.length;
}

/**
 * Remove a document from the index.
 */
export function removeDocumentFromIndex(documentId: string): void {
  globalIndex.removeDocument(documentId);
  logger.info(`[SemanticSearch] Removed document ${documentId} from index`);
}

/**
 * Clear the entire index.
 */
export function clearIndex(): void {
  globalIndex.clear();
  logger.info('[SemanticSearch] Cleared index');
}

/**
 * Get index statistics.
 */
export function getIndexStats(): { totalChunks: number } {
  return {
    totalChunks: globalIndex.size(),
  };
}

// ============================================================================
// Exports
// ============================================================================

export const SemanticSearchService = {
  search: searchChunks,
  hybridSearch,
  indexDocument: indexDocumentChunks,
  removeDocument: removeDocumentFromIndex,
  clearIndex,
  getStats: getIndexStats,
};

export default SemanticSearchService;
