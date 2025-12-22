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
 * - Query-level caching (Phase 5)
 *
 * Performance: Optimized for low latency with caching
 */

import NodeCache from 'node-cache';
import crypto from 'crypto';
import prisma from '../../config/database';

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

// ============================================================================
// CACHE CONFIGURATION
// ============================================================================

const CACHE_TTL_SECONDS = 300; // 5 minutes
const CACHE_CHECK_PERIOD = 60; // Check for expired entries every 60s
const CACHE_MAX_KEYS = 500; // Max cached queries

interface CachedRetrievalResult {
  chunks: RetrievedChunk[];
  usedHybrid: boolean;
  boostMap: DocumentBoostMap;
  timestamp: number;
}

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
  private defaultMaxChunks = 6; // PHASE 6: Hard limit reduced from 10 to 6
  private maxContextTokens = 3500; // PHASE 6: Hard token budget
  private hybridSearch: KodaHybridSearchService;
  private dynamicDocBoost: DynamicDocBoostService;
  private retrievalRanking: KodaRetrievalRankingService;
  private embedding: EmbeddingService;
  private pinecone: PineconeService;

  // PHASE 5: Query-level retrieval cache
  private retrievalCache: NodeCache;

  constructor(deps: RetrievalEngineDependencies) {
    this.hybridSearch = deps.hybridSearch;
    this.dynamicDocBoost = deps.dynamicDocBoost;
    this.retrievalRanking = deps.retrievalRanking;
    this.embedding = deps.embedding;
    this.pinecone = deps.pinecone;

    // Initialize cache with TTL and max keys
    this.retrievalCache = new NodeCache({
      stdTTL: CACHE_TTL_SECONDS,
      checkperiod: CACHE_CHECK_PERIOD,
      maxKeys: CACHE_MAX_KEYS,
      useClones: false, // Performance: don't clone cached objects
    });

    console.log(`[RetrievalEngine] Cache initialized: TTL=${CACHE_TTL_SECONDS}s, maxKeys=${CACHE_MAX_KEYS}`);
  }

  /**
   * Build cache key from query parameters
   * Key = hash(normalized_query + userId + intent + domain + maxChunks + docCount)
   *
   * IMPORTANT: docCount is included to auto-invalidate cache when user uploads/deletes docs
   */
  private buildCacheKey(params: RetrieveParams, docCount: number): string {
    const normalized = params.query.toLowerCase().trim();
    const keyData = {
      query: normalized,
      userId: params.userId,
      intent: params.intent.primaryIntent,
      domain: params.intent.domain,
      maxChunks: params.maxChunks || this.defaultMaxChunks,
      documentIds: params.documentIds?.sort().join(',') || '',
      docCount, // Cache invalidates when doc count changes
    };
    const hash = crypto.createHash('md5').update(JSON.stringify(keyData)).digest('hex');
    return `retrieval:${hash}`;
  }

  /**
   * Get user's document count for cache key (fast query)
   */
  private async getUserDocCount(userId: string): Promise<number> {
    try {
      const count = await prisma.document.count({ where: { userId } });
      return count;
    } catch {
      return 0; // On error, return 0 (cache will still work, just less precise)
    }
  }

  /**
   * Invalidate all cache entries for a user (call on document upload/delete)
   */
  public invalidateUserCache(userId: string): void {
    const keys = this.retrievalCache.keys();
    let invalidated = 0;
    for (const key of keys) {
      if (key.includes(userId)) {
        this.retrievalCache.del(key);
        invalidated++;
      }
    }
    if (invalidated > 0) {
      console.log(`[CACHE] Invalidated ${invalidated} entries for user ${userId}`);
    }
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
   * PHASE 5: Implements query-level caching for Pinecone results
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

    // PHASE 5: Check cache first (include docCount for auto-invalidation on upload)
    const docCount = await this.getUserDocCount(userId);
    const cacheKey = this.buildCacheKey(params, docCount);
    const cached = this.retrievalCache.get<CachedRetrievalResult>(cacheKey);

    if (cached) {
      const cacheAge = Date.now() - cached.timestamp;
      console.log(`[CACHE] HIT - key=${cacheKey.slice(-8)} age=${Math.round(cacheAge / 1000)}s chunks=${cached.chunks.length}`);
      return { result: cached.chunks, usedHybrid: cached.usedHybrid, boostMap: cached.boostMap };
    }

    console.log(`[CACHE] MISS - key=${cacheKey.slice(-8)}`);

    try {
      // Try hybrid retrieval first
      const { chunks, usedHybrid, boostMap } = await this.performHybridRetrievalWithFlag(params);

      // PHASE 5: Store in cache
      const cacheValue: CachedRetrievalResult = {
        chunks,
        usedHybrid,
        boostMap,
        timestamp: Date.now(),
      };
      this.retrievalCache.set(cacheKey, cacheValue);
      console.log(`[CACHE] SET - key=${cacheKey.slice(-8)} chunks=${chunks.length}`);

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
    const perfStart = performance.now();

    console.log(`[KodaRetrievalEngineV3] Starting HYBRID retrieval (Vector + BM25) for query: "${query.substring(0, 50)}..."`);

    try {
      // Step 1: Determine document/folder filters from intent
      const targetDocumentIds = documentIds || intent?.target?.documentIds || [];
      const targetFolderIds = folderIds || intent?.target?.folderIds || [];

      // Step 2: Perform hybrid search (Vector 0.6 + BM25 0.4)
      // PERF: Reduced topK from maxChunks*2 to maxChunks for faster retrieval
      const t0 = performance.now();
      const hybridResults = await this.hybridSearch.search({
        userId,
        query,
        filters: {
          userId,
          documentIds: targetDocumentIds,
          folderIds: targetFolderIds,
        },
        vectorTopK: maxChunks,  // PERF: Was maxChunks * 2
        bm25TopK: maxChunks,    // PERF: Was maxChunks * 2
      });
      const hybridSearchMs = performance.now() - t0;
      console.log(`[PERF] hybrid_search_ms: ${hybridSearchMs.toFixed(0)}ms (${hybridResults.length} results)`);

      if (hybridResults.length === 0) {
        console.log('[KodaRetrievalEngineV3] No results from hybrid search');
        return { chunks: [], usedHybrid: true, boostMap: {} };
      }

      // Step 3: Compute dynamic document boosts using dedicated service
      const t1 = performance.now();
      const candidateDocumentIds = [...new Set(hybridResults.map(c => c.documentId))];
      const boostMap = await this.dynamicDocBoost.computeBoosts({
        userId,
        intent,
        candidateDocumentIds,
      });
      const boostComputeMs = performance.now() - t1;
      console.log(`[PERF] boost_compute_ms: ${boostComputeMs.toFixed(0)}ms (${Object.keys(boostMap).length} docs)`);

      // Step 4: Rank chunks using dedicated ranking service
      const t2 = performance.now();
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
      const rankingMs = performance.now() - t2;
      console.log(`[PERF] ranking_ms: ${rankingMs.toFixed(0)}ms (${rankedChunks.length} chunks)`);

      // Step 5: Apply context budget to ranked chunks
      const t3 = performance.now();
      const budgetedChunks = this.applyContextBudget(rankedChunks);
      const budgetMs = performance.now() - t3;
      console.log(`[PERF] budget_ms: ${budgetMs.toFixed(0)}ms (${budgetedChunks.length} chunks kept)`);

      // Total retrieval time
      const totalRetrievalMs = performance.now() - perfStart;
      console.log(`[PERF] TOTAL_RETRIEVAL_MS: ${totalRetrievalMs.toFixed(0)}ms`);

      return { chunks: budgetedChunks, usedHybrid: true, boostMap };
    } catch (error) {
      console.error('[KodaRetrievalEngineV3] Hybrid retrieval failed, falling back to vector-only:', error);
      const vectorChunks = await this.performVectorOnlyRetrieval(params);
      return { chunks: vectorChunks, usedHybrid: false, boostMap: {} };
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
   * PHASE 6: Enforces hard limits for stable TTFC and quality
   *
   * Hard limits:
   * - Max chunks: 6 (this.defaultMaxChunks)
   * - Max tokens: 3500 (this.maxContextTokens)
   *
   * @param chunks - Array of retrieved chunks (already sorted by relevance)
   * @param maxTokens - Maximum tokens allowed for chunks (default: this.maxContextTokens)
   * @param language - Language for token estimation
   * @returns Chunks that fit within the token budget
   */
  private applyContextBudget(
    chunks: RetrievedChunk[],
    maxTokens?: number,
    language?: string
  ): RetrievedChunk[] {
    // PHASE 6: Enforce hard limits
    const hardMaxChunks = this.defaultMaxChunks; // 6
    const hardMaxTokens = maxTokens || this.maxContextTokens; // 3500

    // First, hard limit on chunk count
    const chunkLimited = chunks.slice(0, hardMaxChunks);

    // Extract content strings for budget calculation
    const contentStrings = chunkLimited.map(c => c.content);

    // Use the centralized budget selection service
    const budgetingService = getContextWindowBudgeting();
    const budgetResult = budgetingService.selectChunksWithinBudget(contentStrings, hardMaxTokens, language);

    // Map back to chunks (take the first N that fit within token budget)
    const budgetedChunks = chunkLimited.slice(0, budgetResult.chunksIncluded);

    // PHASE 6: Assert-style budget logging for monitoring
    console.log(
      `[BUDGET] ${budgetedChunks.length} chunks, ${budgetResult.tokensUsed}/${hardMaxTokens} tokens ` +
      `(${((budgetResult.tokensUsed / hardMaxTokens) * 100).toFixed(0)}% of budget)` +
      `${budgetResult.wasTruncated ? ` [TRUNCATED: ${budgetResult.chunksExcluded} excluded]` : ''}`
    );

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
