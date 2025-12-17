/**
 * Koda Retrieval Engine V3 - Production Ready
 *
 * Responsible for retrieving relevant document chunks using hybrid search
 * (vector embeddings + BM25 keyword search).
 *
 * Features:
 * - Hybrid retrieval (vector + keyword)
 * - Intent-aware filtering
 * - Document boosting
 * - Context budgeting
 * - Multilingual support
 *
 * Performance: Optimized for low latency with caching
 */

import type {
  IntentClassificationV3,
  RetrievedChunk,
  RetrievalResult,
} from '../../types/ragV3.types';

import type { EmbeddingService } from '../embedding.service';
import type { PineconeService } from '../pinecone.service';
import { KodaHybridSearchService } from '../retrieval/kodaHybridSearch.service';
import { DynamicDocBoostService, DocumentBoostMap } from '../retrieval/dynamicDocBoost.service';
import { KodaRetrievalRankingService } from '../retrieval/kodaRetrievalRanking.service';
import {
  getTokenBudgetEstimator,
  getContextWindowBudgeting,
} from '../utils';

type LanguageCode = 'en' | 'pt' | 'es';

// ============================================================================
// TYPES
// ============================================================================

export interface RetrieveParams {
  userId: string;
  query: string;
  intent: IntentClassificationV3;
  context?: any;
  language: LanguageCode;
  documentIds?: string[];
  folderIds?: string[];
  maxChunks?: number;
}

// ============================================================================
// KODA RETRIEVAL ENGINE V3
// ============================================================================

export interface RetrievalEngineDependencies {
  hybridSearch: KodaHybridSearchService;
  dynamicDocBoost: DynamicDocBoostService;
  retrievalRanking: KodaRetrievalRankingService;
  embedding: EmbeddingService;
  pinecone: PineconeService;
}

export class KodaRetrievalEngineV3 {
  private defaultMaxChunks = 10;
  private hybridSearch: KodaHybridSearchService;
  private dynamicDocBoost: DynamicDocBoostService;
  private retrievalRanking: KodaRetrievalRankingService;
  private embedding: EmbeddingService;
  private pinecone: PineconeService;

  constructor(deps: RetrievalEngineDependencies) {
    this.hybridSearch = deps.hybridSearch;
    this.dynamicDocBoost = deps.dynamicDocBoost;
    this.retrievalRanking = deps.retrievalRanking;
    this.embedding = deps.embedding;
    this.pinecone = deps.pinecone;
  }

  /**
   * Retrieve relevant document chunks for a query.
   * Returns an array of RetrievedChunk objects.
   */
  public async retrieve(params: RetrieveParams): Promise<RetrievedChunk[]> {
    const {
      userId,
      query,
      intent,
      documentIds,
      maxChunks = this.defaultMaxChunks,
    } = params;

    if (!userId || !query) {
      return [];
    }

    // Check if we need RAG based on intent
    if (!intent.requiresRAG) {
      return [];
    }

    try {
      // Perform hybrid retrieval using Pinecone vector search
      // with document boosting and context budgeting
      const chunks = await this.performHybridRetrieval(params);

      // Return all budgeted chunks - NO post-budget truncation
      return chunks;
    } catch (error) {
      console.error('[KodaRetrievalEngineV3] Retrieval failed:', error);
      return [];
    }
  }

  /**
   * Full retrieval result with metadata (for advanced use cases).
   * FIXED: usedHybrid now reflects actual retrieval path (not hardcoded)
   * FIXED: appliedBoosts now comes directly from boost service (not chunk metadata)
   */
  public async retrieveWithMetadata(params: RetrieveParams): Promise<RetrievalResult> {
    const { result, usedHybrid, boostMap } = await this.retrieveWithHybridFlag(params);

    // Convert boost map to appliedBoosts array (only include non-neutral boosts)
    const appliedBoosts = Object.values(boostMap)
      .filter(boost => boost.factor !== 1.0)
      .map(boost => ({
        documentId: boost.documentId,
        boostFactor: boost.factor,
        reason: boost.reason,
      }));

    return {
      chunks: result,
      usedHybrid,  // FIXED: Now reflects actual retrieval path
      hybridDetails: {
        vectorTopK: params.maxChunks ? params.maxChunks * 2 : 20,
        bm25TopK: usedHybrid ? (params.maxChunks ? params.maxChunks * 2 : 20) : 0,
        mergeStrategy: 'weighted',
      },
      appliedBoosts,
    };
  }

  /**
   * Internal method that returns chunks, whether hybrid was used, and the boost map.
   */
  private async retrieveWithHybridFlag(params: RetrieveParams): Promise<{ result: RetrievedChunk[], usedHybrid: boolean, boostMap: DocumentBoostMap }> {
    const {
      userId,
      query,
      intent,
      maxChunks = this.defaultMaxChunks,
    } = params;

    if (!userId || !query) {
      return { result: [], usedHybrid: false, boostMap: {} };
    }

    // Check if we need RAG based on intent
    if (!intent.requiresRAG) {
      return { result: [], usedHybrid: false, boostMap: {} };
    }

    try {
      // Try hybrid retrieval first
      const { chunks, usedHybrid, boostMap } = await this.performHybridRetrievalWithFlag(params);
      // Return all budgeted chunks - NO post-budget truncation (budget applied in performHybridRetrievalWithFlag)
      return { result: chunks, usedHybrid, boostMap };
    } catch (error) {
      console.error('[KodaRetrievalEngineV3] Retrieval failed:', error);
      return { result: [], usedHybrid: false, boostMap: {} };
    }
  }

  /**
   * Perform hybrid retrieval combining vector search (Pinecone) and BM25 (PostgreSQL).
   * Uses kodaHybridSearchService for combined search with 0.6/0.4 weighting.
   */
  private async performHybridRetrieval(params: RetrieveParams): Promise<RetrievedChunk[]> {
    const { chunks } = await this.performHybridRetrievalWithFlag(params);
    return chunks;
  }

  /**
   * Perform hybrid retrieval with usedHybrid flag tracking.
   * Returns chunks, whether hybrid was actually used, and the applied boost map.
   */
  private async performHybridRetrievalWithFlag(params: RetrieveParams): Promise<{ chunks: RetrievedChunk[], usedHybrid: boolean, boostMap: DocumentBoostMap }> {
    const { userId, query, intent, documentIds, folderIds, maxChunks = this.defaultMaxChunks } = params;

    console.log(`[KodaRetrievalEngineV3] Starting HYBRID retrieval (Vector + BM25) for query: "${query.substring(0, 50)}..."`);

    try {
      // Step 1: Determine document/folder filters from intent
      const targetDocumentIds = documentIds || intent?.target?.documentIds || [];
      const targetFolderIds = folderIds || intent?.target?.folderIds || [];

      // Step 2: Perform hybrid search (Vector 0.6 + BM25 0.4)
      console.log('[KodaRetrievalEngineV3] Performing hybrid search (Vector + BM25)...');
      const hybridResults = await this.hybridSearch.search({
        userId,
        query,
        filters: {
          userId,
          documentIds: targetDocumentIds,
          folderIds: targetFolderIds,
        },
        vectorTopK: maxChunks * 2,
        bm25TopK: maxChunks * 2,
      });

      console.log(`[KodaRetrievalEngineV3] Hybrid search returned ${hybridResults.length} results`);

      if (hybridResults.length === 0) {
        console.log('[KodaRetrievalEngineV3] No results from hybrid search');
        return { chunks: [], usedHybrid: true, boostMap: {} };  // Hybrid was attempted
      }

      // Step 3: Compute dynamic document boosts using dedicated service
      const candidateDocumentIds = [...new Set(hybridResults.map(c => c.documentId))];
      const boostMap = await this.dynamicDocBoost.computeBoosts({
        userId,
        intent,
        candidateDocumentIds,
      });

      console.log(`[KodaRetrievalEngineV3] Computed boosts for ${Object.keys(boostMap).length} documents`);

      // Step 4: Rank chunks using dedicated ranking service (applies boosts, position weighting, question-type weighting)
      const rankedChunks = await this.retrievalRanking.rankChunks({
        query,
        intent,
        chunks: hybridResults.map(chunk => ({
          ...chunk,
          metadata: {
            ...chunk.metadata,
            retrievalMethod: 'hybrid',
          },
        })),
        boostMap,
      });

      console.log(`[KodaRetrievalEngineV3] Ranked ${rankedChunks.length} chunks`);

      // Step 5: Apply context budget to ranked chunks
      const budgetedChunks = this.applyContextBudget(rankedChunks);

      console.log(`[KodaRetrievalEngineV3] Returning ${budgetedChunks.length} chunks after budgeting (hybrid)`);

      return { chunks: budgetedChunks, usedHybrid: true, boostMap };
    } catch (error) {
      console.error('[KodaRetrievalEngineV3] Hybrid retrieval failed, falling back to vector-only:', error);
      // Fallback to vector-only search
      const vectorChunks = await this.performVectorOnlyRetrieval(params);
      return { chunks: vectorChunks, usedHybrid: false, boostMap: {} };  // Vector-only fallback (no boosts)
    }
  }

  /**
   * Fallback to vector-only retrieval if hybrid fails.
   */
  private async performVectorOnlyRetrieval(params: RetrieveParams): Promise<RetrievedChunk[]> {
    const { userId, query, intent, documentIds, folderIds, maxChunks = this.defaultMaxChunks } = params;

    console.log('[KodaRetrievalEngineV3] Falling back to vector-only retrieval...');

    try {
      const embeddingResult = await this.embedding.generateQueryEmbedding(query);
      const queryEmbedding = embeddingResult.embedding;

      if (!queryEmbedding || queryEmbedding.length === 0) {
        return [];
      }

      const targetDocumentId = documentIds?.[0] || intent?.target?.documentIds?.[0];
      const targetFolderId = folderIds?.[0] || intent?.target?.folderIds?.[0];

      const pineconeResults = await this.pinecone.query(queryEmbedding, {
        userId,
        topK: maxChunks * 2,
        minSimilarity: 0.3,
        documentId: targetDocumentId,
        folderId: targetFolderId,
      });

      const chunks: RetrievedChunk[] = pineconeResults.map(result => ({
        chunkId: `${result.documentId}-${result.chunkIndex}`,
        documentId: result.documentId,
        documentName: result.filename || result.metadata?.filename || 'Unknown',
        score: result.similarity,
        pageNumber: result.metadata?.pageNumber,
        slideNumber: result.metadata?.slide,
        content: result.content,
        metadata: {
          ...result.metadata,
          retrievalMethod: 'vector-only',
        },
      }));

      return this.applyContextBudget(chunks.sort((a, b) => b.score - a.score));
    } catch (error) {
      console.error('[KodaRetrievalEngineV3] Vector-only retrieval also failed:', error);
      return [];
    }
  }

  /**
   * Calculate boosts  /**
   * Calculate boosts for documents based on intent and context.
   */
  private calculateBoosts(
    intent: IntentClassificationV3,
    documentIds?: string[]
  ): Map<string, number> {
    const boosts = new Map<string, number>();

    // Boost explicitly mentioned documents
    if (intent.target.documentIds) {
      for (const docId of intent.target.documentIds) {
        boosts.set(docId, 1.5);
      }
    }

    // Boost documents from UI selection
    if (documentIds) {
      for (const docId of documentIds) {
        const existing = boosts.get(docId) || 1.0;
        boosts.set(docId, existing * 1.3);
      }
    }

    return boosts;
  }

  /**
   * Apply context budgeting to limit total tokens.
   * Uses the ContextWindowBudgetingService for accurate token counting.
   *
   * @param chunks - Array of retrieved chunks (already sorted by relevance)
   * @param maxTokens - Maximum tokens allowed for chunks
   * @param language - Language for token estimation
   * @returns Chunks that fit within the token budget
   */
  private applyContextBudget(
    chunks: RetrievedChunk[],
    maxTokens: number = 4000,
    language?: string
  ): RetrievedChunk[] {
    // Extract content strings for budget calculation
    const contentStrings = chunks.map(c => c.content);

    // Use the centralized budget selection service
    const budgetingService = getContextWindowBudgeting();
    const budgetResult = budgetingService.selectChunksWithinBudget(contentStrings, maxTokens, language);

    // Map back to chunks (take the first N that fit)
    const budgetedChunks = chunks.slice(0, budgetResult.chunksIncluded);

    // Log budget usage for monitoring
    if (budgetResult.wasTruncated) {
      console.log(
        `[KodaRetrievalEngineV3] Budget: ${budgetResult.tokensUsed}/${maxTokens} tokens, ` +
        `included ${budgetResult.chunksIncluded}, excluded ${budgetResult.chunksExcluded}`
      );
    }

    return budgetedChunks;
  }

  /**
   * Get estimated total tokens for a set of chunks.
   * Uses TokenBudgetEstimatorService for pre-flight checks before LLM calls.
   */
  public estimateChunkTokens(chunks: RetrievedChunk[], language?: string): number {
    const tokenEstimator = getTokenBudgetEstimator();
    return chunks.reduce((total, chunk) => {
      return total + tokenEstimator.estimateDetailed(chunk.content, language).tokens;
    }, 0);
  }
}

export default KodaRetrievalEngineV3;
