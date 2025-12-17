/**
 * =============================================================================
 * GEMINI EMBEDDING SERVICE - Unified Embedding Generation
 * =============================================================================
 *
 * Provides a unified interface for generating embeddings with:
 * - Support for both Gemini and OpenAI backends
 * - Automatic batching
 * - Caching layer
 * - Retry logic
 *
 * NOTE: Currently delegates to the existing embedding.service.ts which uses
 * OpenAI. This service provides a facade that can be extended to support
 * Gemini embeddings when needed.
 *
 * LAYER ARCHITECTURE:
 * 1. GeminiEmbedding (this) - High-level embedding interface
 * 2. EmbeddingService - Actual embedding generation (OpenAI)
 * 3. CacheService - Caching layer
 *
 * =============================================================================
 */

import embeddingService from './embedding.service';

// =============================================================================
// TYPES
// =============================================================================

export type EmbeddingProvider = 'openai' | 'gemini';
export type EmbeddingTaskType = 'query' | 'document' | 'similarity' | 'classification';

export interface EmbeddingRequest {
  text: string;
  taskType?: EmbeddingTaskType;
  provider?: EmbeddingProvider;
  title?: string;
}

export interface BatchEmbeddingRequest {
  texts: string[];
  taskType?: EmbeddingTaskType;
  provider?: EmbeddingProvider;
}

export interface EmbeddingResult {
  text: string;
  embedding: number[];
  dimensions: number;
  model: string;
  provider: EmbeddingProvider;
  cached?: boolean;
}

export interface BatchEmbeddingResult {
  embeddings: EmbeddingResult[];
  totalProcessed: number;
  failedCount: number;
  processingTimeMs: number;
  cacheHits: number;
}

export interface EmbeddingStats {
  totalRequests: number;
  cacheHits: number;
  avgProcessingTimeMs: number;
  openaiCalls: number;
  geminiCalls: number;
}

// =============================================================================
// GEMINI EMBEDDING SERVICE CLASS
// =============================================================================

class GeminiEmbeddingService {
  private static instance: GeminiEmbeddingService;
  private stats: EmbeddingStats = {
    totalRequests: 0,
    cacheHits: 0,
    avgProcessingTimeMs: 0,
    openaiCalls: 0,
    geminiCalls: 0,
  };
  private totalProcessingTime = 0;
  private defaultProvider: EmbeddingProvider = 'openai';

  private constructor() {
    console.log('✅ [GEMINI-EMBEDDING] Service initialized');
  }

  public static getInstance(): GeminiEmbeddingService {
    if (!GeminiEmbeddingService.instance) {
      GeminiEmbeddingService.instance = new GeminiEmbeddingService();
    }
    return GeminiEmbeddingService.instance;
  }

  /**
   * =============================================================================
   * MAIN API: Generate Embedding
   * =============================================================================
   */
  public async generateEmbedding(request: EmbeddingRequest): Promise<EmbeddingResult> {
    const startTime = Date.now();
    const provider = request.provider || this.defaultProvider;

    this.stats.totalRequests++;

    try {
      let result;

      if (provider === 'openai') {
        // Use existing embedding service (OpenAI)
        this.stats.openaiCalls++;

        if (request.taskType === 'query') {
          result = await embeddingService.generateQueryEmbedding(request.text);
        } else if (request.taskType === 'document') {
          result = await embeddingService.generateDocumentEmbedding(request.text, request.title);
        } else {
          result = await embeddingService.generateEmbedding(request.text, {
            taskType: this.mapTaskType(request.taskType),
            title: request.title,
          });
        }
      } else {
        // Gemini embeddings (future implementation)
        this.stats.geminiCalls++;
        result = await this.generateGeminiEmbedding(request.text);
      }

      const processingTimeMs = Date.now() - startTime;
      this.updateStats(processingTimeMs);

      return {
        text: result.text,
        embedding: result.embedding,
        dimensions: result.dimensions,
        model: result.model,
        provider,
      };
    } catch (error: any) {
      console.error(`❌ [GEMINI-EMBEDDING] Error:`, error.message);
      throw error;
    }
  }

  /**
   * =============================================================================
   * BATCH EMBEDDING
   * =============================================================================
   */
  public async generateBatchEmbeddings(request: BatchEmbeddingRequest): Promise<BatchEmbeddingResult> {
    const startTime = Date.now();
    const provider = request.provider || this.defaultProvider;

    this.stats.totalRequests++;

    try {
      let results;

      if (provider === 'openai') {
        this.stats.openaiCalls++;
        const batchResult = await embeddingService.generateBatchEmbeddings(request.texts, {
          taskType: this.mapTaskType(request.taskType),
        });

        results = batchResult.embeddings.map(e => ({
          text: e.text,
          embedding: e.embedding,
          dimensions: e.dimensions,
          model: e.model,
          provider: 'openai' as EmbeddingProvider,
        }));

        const processingTimeMs = Date.now() - startTime;
        this.updateStats(processingTimeMs);

        return {
          embeddings: results,
          totalProcessed: batchResult.totalProcessed,
          failedCount: batchResult.failedCount,
          processingTimeMs,
          cacheHits: 0, // Could be enhanced to track cache hits
        };
      } else {
        // Gemini batch embeddings (future implementation)
        this.stats.geminiCalls++;
        const embeddings = await Promise.all(
          request.texts.map(text => this.generateGeminiEmbedding(text))
        );

        const processingTimeMs = Date.now() - startTime;
        this.updateStats(processingTimeMs);

        return {
          embeddings: embeddings.map(e => ({
            ...e,
            provider: 'gemini' as EmbeddingProvider,
          })),
          totalProcessed: request.texts.length,
          failedCount: 0,
          processingTimeMs,
          cacheHits: 0,
        };
      }
    } catch (error: any) {
      console.error(`❌ [GEMINI-EMBEDDING] Batch error:`, error.message);
      throw error;
    }
  }

  /**
   * =============================================================================
   * CONVENIENCE METHODS
   * =============================================================================
   */

  /**
   * Generate embedding optimized for queries (search)
   */
  public async generateQueryEmbedding(query: string): Promise<EmbeddingResult> {
    return this.generateEmbedding({
      text: query,
      taskType: 'query',
    });
  }

  /**
   * Generate embedding optimized for document storage
   */
  public async generateDocumentEmbedding(text: string, title?: string): Promise<EmbeddingResult> {
    return this.generateEmbedding({
      text,
      taskType: 'document',
      title,
    });
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  public calculateSimilarity(embedding1: number[], embedding2: number[]): number {
    return embeddingService.calculateSimilarity(embedding1, embedding2);
  }

  /**
   * Find most similar embeddings to a query
   */
  public findTopKSimilar(
    queryEmbedding: number[],
    candidates: Array<{ id: string; embedding: number[]; metadata?: any }>,
    k: number = 10
  ): Array<{ id: string; similarity: number; metadata?: any }> {
    return embeddingService.findTopKSimilar(queryEmbedding, candidates, k);
  }

  /**
   * =============================================================================
   * GEMINI EMBEDDING (Future Implementation)
   * =============================================================================
   */
  private async generateGeminiEmbedding(text: string): Promise<EmbeddingResult> {
    // Placeholder for future Gemini embedding implementation
    // For now, fall back to OpenAI
    console.warn('[GEMINI-EMBEDDING] Gemini embeddings not yet implemented, falling back to OpenAI');

    const result = await embeddingService.generateEmbedding(text);

    return {
      text: result.text,
      embedding: result.embedding,
      dimensions: result.dimensions,
      model: result.model,
      provider: 'openai', // Fallback
    };
  }

  /**
   * =============================================================================
   * UTILITIES
   * =============================================================================
   */

  private mapTaskType(taskType?: EmbeddingTaskType): 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT' | 'SEMANTIC_SIMILARITY' | 'CLASSIFICATION' | undefined {
    if (!taskType) return undefined;

    switch (taskType) {
      case 'query':
        return 'RETRIEVAL_QUERY';
      case 'document':
        return 'RETRIEVAL_DOCUMENT';
      case 'similarity':
        return 'SEMANTIC_SIMILARITY';
      case 'classification':
        return 'CLASSIFICATION';
      default:
        return undefined;
    }
  }

  private updateStats(processingTimeMs: number): void {
    this.totalProcessingTime += processingTimeMs;
    this.stats.avgProcessingTimeMs = this.totalProcessingTime / this.stats.totalRequests;
  }

  /**
   * Set default provider
   */
  public setDefaultProvider(provider: EmbeddingProvider): void {
    this.defaultProvider = provider;
    console.log(`📊 [GEMINI-EMBEDDING] Default provider set to: ${provider}`);
  }

  /**
   * Get embedding dimensions
   */
  public getEmbeddingDimensions(): number {
    return embeddingService.getEmbeddingDimensions();
  }

  /**
   * Get statistics
   */
  public getStats(): EmbeddingStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  public resetStats(): void {
    this.stats = {
      totalRequests: 0,
      cacheHits: 0,
      avgProcessingTimeMs: 0,
      openaiCalls: 0,
      geminiCalls: 0,
    };
    this.totalProcessingTime = 0;
  }

  /**
   * Clear embedding cache
   */
  public async clearCache(): Promise<void> {
    await embeddingService.clearCache();
    console.log('🗑️ [GEMINI-EMBEDDING] Cache cleared');
  }

  /**
   * Get cache stats
   */
  public async getCacheStats() {
    return embeddingService.getCacheStats();
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

const geminiEmbedding = GeminiEmbeddingService.getInstance();

export default geminiEmbedding;
export { GeminiEmbeddingService };
