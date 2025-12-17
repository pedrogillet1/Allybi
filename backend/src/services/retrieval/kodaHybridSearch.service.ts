/**
 * Koda Hybrid Search Service
 * Combines vector search (Pinecone) and BM25 (DB full-text) for optimal retrieval
 *
 * FIXED:
 * - Chunk ID mismatch (now uses canonical format: documentId-chunkIndex)
 * - SQL injection risk (parameterized queries)
 * - Uses shared Prisma client from config/database
 * - Uses DI for embedding/pinecone services (no more singleton imports)
 */

import prisma from '../../config/database';  // FIXED: Use shared Prisma client
import { Prisma } from '@prisma/client';  // For parameterized queries
import type { EmbeddingService } from '../embedding.service';
import type { PineconeService } from '../pinecone.service';
import { RetrievedChunk, RetrievalFilters } from '../../types/ragV3.types';

interface HybridSearchParams {
  userId: string;
  query: string;
  filters: RetrievalFilters;
  vectorTopK: number;
  bm25TopK: number;
}

type HybridSearchResult = RetrievedChunk[];

export interface HybridSearchDependencies {
  embedding: EmbeddingService;
  pinecone: PineconeService;
}

/**
 * Service to perform hybrid search combining vector search (Pinecone) and BM25 (DB full-text).
 * Normalizes and merges scores from both sources, deduplicates, and returns unified RetrievedChunk[].
 */
export class KodaHybridSearchService {
  private embeddingService: EmbeddingService;
  private pineconeService: PineconeService;

  constructor(deps: HybridSearchDependencies) {
    this.embeddingService = deps.embedding;
    this.pineconeService = deps.pinecone;
  }

  /**
   * Perform hybrid search combining vector and BM25 retrieval.
   * @param params HybridSearchParams including userId, query, filters, and topK counts.
   * @returns Promise resolving to merged and scored RetrievedChunk[] sorted by descending score.
   */
  public async search(params: HybridSearchParams): Promise<HybridSearchResult> {
    const { userId, query, filters, vectorTopK, bm25TopK } = params;

    // Defensive: if no query or userId, return empty
    if (!userId || !query.trim()) {
      return [];
    }

    // Step 1: Vector search via Pinecone
    const vectorChunks = await this.vectorSearch(userId, query, filters, vectorTopK);

    // Step 2: BM25 search via DB full-text
    const bm25Chunks = await this.bm25Search(userId, query, filters, bm25TopK);

    // Step 3: Normalize scores to [0,1]
    const normalizedVector = this.normalizeScores(vectorChunks, 'vector');
    const normalizedBM25 = this.normalizeScores(bm25Chunks, 'bm25');

    // Step 4: Merge results keyed by chunkId
    const mergedMap = new Map<string, RetrievedChunk>();

    // Insert vector results with 0.6 weight
    for (const chunk of normalizedVector) {
      mergedMap.set(chunk.chunkId, { ...chunk, score: chunk.score * 0.6 });
    }

    // Merge BM25 results with 0.4 weight
    for (const bmChunk of normalizedBM25) {
      const existing = mergedMap.get(bmChunk.chunkId);
      if (existing) {
        // Combine scores
        const combinedScore = existing.score + bmChunk.score * 0.4;
        mergedMap.set(bmChunk.chunkId, { ...existing, score: combinedScore });
      } else {
        mergedMap.set(bmChunk.chunkId, { ...bmChunk, score: bmChunk.score * 0.4 });
      }
    }

    // Step 5: Convert map to array and sort descending by final score
    const mergedChunks = Array.from(mergedMap.values());
    mergedChunks.sort((a, b) => b.score - a.score);

    return mergedChunks;
  }

  /**
   * Perform vector search using embedding + Pinecone.
   */
  private async vectorSearch(
    userId: string,
    query: string,
    filters: RetrievalFilters,
    topK: number
  ): Promise<RetrievedChunk[]> {
    try {
      // Embed query text to vector
      const embeddingResult = await this.embeddingService.generateQueryEmbedding(query);
      const queryEmbedding = embeddingResult.embedding;

      // Query Pinecone using the service's query method
      const documentId = filters.documentIds && filters.documentIds.length === 1
        ? filters.documentIds[0]
        : undefined;

      const pineconeResults = await this.pineconeService.query(queryEmbedding, {
        userId,
        topK,
        documentId,
      });

      // Map Pinecone results to RetrievedChunk[]
      // FIXED: Ensure canonical chunkId format matches BM25 (documentId-chunkIndex)
      const chunks: RetrievedChunk[] = pineconeResults.map((result: any) => ({
        chunkId: `${result.documentId}-${result.chunkIndex}`,  // CANONICAL FORMAT
        documentId: result.documentId || '',
        documentName: result.filename || '',
        content: result.content ?? '',
        pageNumber: result.metadata?.pageNumber,
        score: result.similarity || 0,
        metadata: {
          ...result.metadata,
          chunkIndex: result.chunkIndex,
          source: 'vector',  // Track source for debugging
        },
      }));

      return chunks;
    } catch (error) {
      console.error('[KodaHybridSearch] Error in vectorSearch:', error);
      return [];
    }
  }

  /**
   * Perform BM25 full-text search on document_chunks table using Postgres full-text search.
   *
   * FIXES:
   * - Uses chunkIndex to compute canonical chunkId (documentId-chunkIndex)
   * - SECURITY: Uses Prisma.sql tagged template for parameterized queries (no SQL injection)
   * - Uses shared Prisma client
   */
  private async bm25Search(
    userId: string,
    query: string,
    filters: RetrievalFilters,
    topK: number
  ): Promise<RetrievedChunk[]> {
    try {
      // SECURITY: Query text is properly parameterized via Prisma.sql - no manual escaping needed
      const queryText = query.trim();

      // Get document filter
      const documentIds = filters.documentIds || [];
      const hasDocFilter = documentIds.length > 0;

      // FIXED: Use Prisma.sql tagged template for type-safe parameterized queries
      // This prevents SQL injection by properly escaping all parameters
      let results: any[];

      if (hasDocFilter) {
        // With document filter - use parameterized query with Prisma.sql
        results = await prisma.$queryRaw<any[]>`
          SELECT
            dc."documentId",
            dc."chunkIndex",
            dc.text as content,
            dc.page as "pageNumber",
            d.filename as "documentName",
            ts_rank_cd(to_tsvector('simple', dc.text), plainto_tsquery('simple', ${queryText})) AS bm25_score
          FROM document_chunks dc
          INNER JOIN documents d ON dc."documentId" = d.id
          WHERE d."userId" = ${userId}
            AND dc."documentId" = ANY(${documentIds}::text[])
            AND to_tsvector('simple', dc.text) @@ plainto_tsquery('simple', ${queryText})
          ORDER BY bm25_score DESC
          LIMIT ${topK}
        `;
      } else {
        // Without document filter - use parameterized query with Prisma.sql
        results = await prisma.$queryRaw<any[]>`
          SELECT
            dc."documentId",
            dc."chunkIndex",
            dc.text as content,
            dc.page as "pageNumber",
            d.filename as "documentName",
            ts_rank_cd(to_tsvector('simple', dc.text), plainto_tsquery('simple', ${queryText})) AS bm25_score
          FROM document_chunks dc
          INNER JOIN documents d ON dc."documentId" = d.id
          WHERE d."userId" = ${userId}
            AND to_tsvector('simple', dc.text) @@ plainto_tsquery('simple', ${queryText})
          ORDER BY bm25_score DESC
          LIMIT ${topK}
        `;
      }

      // FIXED: Compute canonical chunkId using documentId-chunkIndex
      // This matches the vector search chunkId format for proper deduplication
      const chunks: RetrievedChunk[] = results.map((row) => ({
        chunkId: `${row.documentId}-${row.chunkIndex}`,  // CANONICAL FORMAT
        documentId: row.documentId,
        documentName: row.documentName || '',
        content: row.content,
        pageNumber: row.pageNumber ?? undefined,
        score: parseFloat(row.bm25_score) || 0,
        metadata: {
          chunkIndex: row.chunkIndex,
          source: 'bm25',
        },
      }));

      return chunks;
    } catch (error) {
      console.error('[KodaHybridSearch] Error in bm25Search:', error);
      return [];
    }
  }

  /**
   * Normalize scores of chunks to [0,1] range using min-max normalization.
   */
  private normalizeScores(chunks: RetrievedChunk[], _source: 'vector' | 'bm25'): RetrievedChunk[] {
    if (chunks.length === 0) return [];

    const scores = chunks.map((c) => c.score);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);

    // If all scores equal, normalize all to 1
    if (maxScore === minScore) {
      return chunks.map((chunk) => ({ ...chunk, score: 1 }));
    }

    // Min-max normalization
    return chunks.map((chunk) => ({
      ...chunk,
      score: (chunk.score - minScore) / (maxScore - minScore),
    }));
  }
}

// Export class for DI - instantiate via container.getHybridSearch()
export default KodaHybridSearchService;
