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

// FAST AVAILABILITY: Document statuses that are usable for rawText search
const USABLE_STATUSES = ['available', 'enriching', 'ready', 'completed'];

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
   *
   * PERF: Vector and BM25 searches run in PARALLEL for lower latency
   */
  public async search(params: HybridSearchParams): Promise<HybridSearchResult> {
    const { userId, query, filters, vectorTopK, bm25TopK } = params;
    const perfStart = performance.now();

    // Defensive: if no query or userId, return empty
    if (!userId || !query.trim()) {
      return [];
    }

    // PERF: Run vector and BM25 searches IN PARALLEL
    const t0 = performance.now();
    const [vectorChunks, bm25Chunks] = await Promise.all([
      this.vectorSearch(userId, query, filters, vectorTopK),
      this.bm25Search(userId, query, filters, bm25TopK),
    ]);
    const parallelSearchMs = performance.now() - t0;
    console.log(`[PERF] parallel_search_ms: ${parallelSearchMs.toFixed(0)}ms (vector: ${vectorChunks.length}, bm25: ${bm25Chunks.length})`);

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

    // ═══════════════════════════════════════════════════════════════════════════════
    // FAST AVAILABILITY FALLBACK: If no chunks from vector/BM25, search rawText
    // This enables chat immediately after upload, before embeddings are generated
    // ═══════════════════════════════════════════════════════════════════════════════
    if (mergedChunks.length === 0) {
      console.log(`[HybridSearch] No chunks from vector/BM25, falling back to rawText search`);
      const rawTextChunks = await this.rawTextSearch(userId, query, filters, vectorTopK);
      if (rawTextChunks.length > 0) {
        console.log(`[HybridSearch] rawText fallback found ${rawTextChunks.length} results`);
        return rawTextChunks;
      }
    }

    const totalMs = performance.now() - perfStart;
    console.log(`[PERF] hybrid_merge_total_ms: ${totalMs.toFixed(0)}ms (${mergedChunks.length} merged chunks)`);

    // ═══════════════════════════════════════════════════════════════════════════
    // VERIFICATION CHECKLIST D: RAG retrieval evidence logging
    // Log: topK chunk IDs, file IDs, similarity scores
    // ═══════════════════════════════════════════════════════════════════════════
    if (mergedChunks.length > 0) {
      const topChunksLog = mergedChunks.slice(0, 5).map((c, i) =>
        `  [${i+1}] docId=${c.documentId?.substring(0, 8)}... chunkId=${c.chunkId?.substring(0, 12)}... score=${c.score.toFixed(3)} file="${c.metadata?.filename || 'N/A'}"`
      );
      console.log(`[RAG-EVIDENCE] ═══════════════════════════════════════════════════════════`);
      console.log(`[RAG-EVIDENCE] query="${query.substring(0, 50)}..."`);
      console.log(`[RAG-EVIDENCE] topK=${mergedChunks.length} chunks retrieved`);
      console.log(`[RAG-EVIDENCE] Top 5 chunks:`);
      topChunksLog.forEach(log => console.log(log));
      // Unique document IDs used
      const uniqueDocIds = [...new Set(mergedChunks.map(c => c.documentId))];
      console.log(`[RAG-EVIDENCE] uniqueDocIds=${uniqueDocIds.length}: ${uniqueDocIds.map(id => id?.substring(0, 8) + '...').join(', ')}`);
      console.log(`[RAG-EVIDENCE] ═══════════════════════════════════════════════════════════`);
    }

    return mergedChunks;
  }

  /**
   * Perform vector search using embedding + Pinecone.
   * PERF: Timers added for embedding and pinecone query separately
   */
  private async vectorSearch(
    userId: string,
    query: string,
    filters: RetrievalFilters,
    topK: number
  ): Promise<RetrievedChunk[]> {
    try {
      // Embed query text to vector
      const tEmbed = performance.now();
      const embeddingResult = await this.embeddingService.generateQueryEmbedding(query);
      const queryEmbedding = embeddingResult.embedding;
      console.log(`[PERF] embedding_ms: ${(performance.now() - tEmbed).toFixed(0)}ms`);

      // Query Pinecone using the service's query method
      const documentId = filters.documentIds && filters.documentIds.length === 1
        ? filters.documentIds[0]
        : undefined;

      const tPinecone = performance.now();
      const pineconeResults = await this.pineconeService.query(queryEmbedding, {
        userId,
        topK,
        documentId,
      });
      console.log(`[PERF] pinecone_query_ms: ${(performance.now() - tPinecone).toFixed(0)}ms (${pineconeResults.length} results)`);

      // Map Pinecone results to RetrievedChunk[]
      const chunks: RetrievedChunk[] = pineconeResults.map((result: any) => ({
        chunkId: `${result.documentId}-${result.chunkIndex}`,
        documentId: result.documentId || '',
        documentName: result.filename || '',
        content: result.content ?? '',
        pageNumber: result.metadata?.pageNumber,
        score: result.similarity || 0,
        metadata: {
          ...result.metadata,
          chunkIndex: result.chunkIndex,
          source: 'vector',
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
   * PERF: Timer added for DB query
   */
  private async bm25Search(
    userId: string,
    query: string,
    filters: RetrievalFilters,
    topK: number
  ): Promise<RetrievedChunk[]> {
    const tBm25 = performance.now();
    try {
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

      // Compute canonical chunkId using documentId-chunkIndex
      const chunks: RetrievedChunk[] = results.map((row) => ({
        chunkId: `${row.documentId}-${row.chunkIndex}`,
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

      console.log(`[PERF] bm25_query_ms: ${(performance.now() - tBm25).toFixed(0)}ms (${chunks.length} results)`);
      return chunks;
    } catch (error) {
      console.error('[KodaHybridSearch] Error in bm25Search:', error);
      return [];
    }
  }

  /**
   * FAST AVAILABILITY: Search rawText field when no embeddings exist
   * This enables immediate chat after upload, before background processing completes
   */
  private async rawTextSearch(
    userId: string,
    query: string,
    filters: RetrievalFilters,
    topK: number
  ): Promise<RetrievedChunk[]> {
    const tRaw = performance.now();
    try {
      const queryLower = query.toLowerCase().trim();
      const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);

      if (queryWords.length === 0) {
        return [];
      }

      // Build document filter
      const documentIds = filters.documentIds || [];
      const hasDocFilter = documentIds.length > 0;

      // Find documents with rawText that contain query words
      const documents = await prisma.document.findMany({
        where: {
          userId,
          status: { in: USABLE_STATUSES },
          rawText: { not: null },
          ...(hasDocFilter && { id: { in: documentIds } }),
        },
        select: {
          id: true,
          filename: true,
          rawText: true,
          previewText: true,
          mimeType: true,
        },
        take: 20, // Limit to 20 documents for performance
      });

      const chunks: RetrievedChunk[] = [];

      for (const doc of documents) {
        if (!doc.rawText) continue;

        const rawTextLower = doc.rawText.toLowerCase();

        // Score based on how many query words match
        let matchCount = 0;
        for (const word of queryWords) {
          if (rawTextLower.includes(word)) {
            matchCount++;
          }
        }

        if (matchCount === 0) continue;

        // Calculate relevance score (0-1)
        const score = matchCount / queryWords.length;

        // Extract relevant snippet around first match
        let snippet = '';
        const firstMatchIndex = rawTextLower.indexOf(queryWords[0]);
        if (firstMatchIndex >= 0) {
          const start = Math.max(0, firstMatchIndex - 200);
          const end = Math.min(doc.rawText.length, firstMatchIndex + 500);
          snippet = doc.rawText.substring(start, end);
          if (start > 0) snippet = '...' + snippet;
          if (end < doc.rawText.length) snippet = snippet + '...';
        } else {
          // Use preview text if no match found
          snippet = doc.previewText || doc.rawText.substring(0, 500);
        }

        chunks.push({
          chunkId: `${doc.id}-rawtext-0`,
          documentId: doc.id,
          documentName: doc.filename,
          content: snippet,
          score,
          metadata: {
            source: 'rawtext',
            mimeType: doc.mimeType,
            matchCount,
            queryWords: queryWords.length,
          },
        });
      }

      // Sort by score descending and limit
      chunks.sort((a, b) => b.score - a.score);
      const topChunks = chunks.slice(0, topK);

      console.log(`[PERF] rawtext_search_ms: ${(performance.now() - tRaw).toFixed(0)}ms (${topChunks.length} results from ${documents.length} docs)`);
      return topChunks;
    } catch (error) {
      console.error('[KodaHybridSearch] Error in rawTextSearch:', error);
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
