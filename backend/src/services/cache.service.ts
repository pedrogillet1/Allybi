/**
 * Cache Service
 * Provides intelligent caching for embeddings, search results, and frequent queries
 * Uses node-cache for fast in-memory caching without Redis dependency
 */

import NodeCache from 'node-cache';
import crypto from 'crypto';

export class CacheService {
  private cache: NodeCache;
  private readonly DEFAULT_TTL = 300; // 5 minutes
  private readonly EMBEDDING_TTL = 3600; // 1 hour (reduced from 7 days for memory)
  private readonly SEARCH_TTL = 300; // 5 minutes
  private readonly ANSWER_TTL = 300; // 5 minutes
  private readonly DOCUMENT_LIST_TTL = 60; // 1 minute
  private readonly CONVERSATION_TTL = 120; // 2 minutes

  constructor() {
    this.cache = new NodeCache({
      stdTTL: this.DEFAULT_TTL,
      checkperiod: 60,
      useClones: false, // Better performance
      deleteOnExpire: true,
    });

    console.log('✅ [Cache] In-memory cache service initialized with node-cache');
  }

  /**
   * Generate cache key from multiple arguments
   */
  generateKey(prefix: string, ...args: any[]): string {
    const dataString = args.map(arg =>
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join('|');

    const hash = crypto
      .createHash('md5')
      .update(dataString)
      .digest('hex');

    return `${prefix}:${hash}`;
  }

  /**
   * Cache an embedding
   */
  async cacheEmbedding(text: string, embedding: number[]): Promise<void> {
    try {
      const key = this.generateKey('embedding', text);
      this.cache.set(key, embedding, this.EMBEDDING_TTL);
      console.log(`💾 [Cache] Cached embedding for text (length: ${text.length})`);
    } catch (error) {
      console.error('❌ [Cache] Error caching embedding:', error);
    }
  }

  /**
   * Get cached embedding
   */
  async getCachedEmbedding(text: string): Promise<number[] | null> {
    try {
      const key = this.generateKey('embedding', text);
      const cached = this.cache.get<number[]>(key);

      if (cached) {
        console.log(`✅ [Cache] HIT for embedding (length: ${text.length})`);
        return cached;
      }

      return null;
    } catch (error) {
      console.error('❌ [Cache] Error getting cached embedding:', error);
      return null;
    }
  }

  /**
   * Cache search results
   */
  async cacheSearchResults(
    userId: string,
    query: string,
    results: any[]
  ): Promise<void> {
    try {
      const key = this.generateKey('search', userId, query);
      this.cache.set(key, results, this.SEARCH_TTL);
      console.log(`💾 [Cache] Cached search results for query: "${query.substring(0, 50)}..."`);
    } catch (error) {
      console.error('❌ [Cache] Error caching search results:', error);
    }
  }

  /**
   * Get cached search results
   */
  async getCachedSearchResults(
    userId: string,
    query: string
  ): Promise<any[] | null> {
    try {
      const key = this.generateKey('search', userId, query);
      const cached = this.cache.get<any[]>(key);

      if (cached) {
        console.log(`✅ [Cache] HIT for search: "${query.substring(0, 50)}..."`);
        return cached;
      }

      return null;
    } catch (error) {
      console.error('❌ [Cache] Error getting cached search results:', error);
      return null;
    }
  }

  /**
   * Cache RAG answer
   */
  async cacheAnswer(
    userId: string,
    query: string,
    answer: any
  ): Promise<void> {
    try {
      const key = this.generateKey('answer', userId, query);
      this.cache.set(key, answer, this.ANSWER_TTL);
      console.log(`💾 [Cache] Cached answer for query: "${query.substring(0, 50)}..."`);
    } catch (error) {
      console.error('❌ [Cache] Error caching answer:', error);
    }
  }

  /**
   * Get cached answer
   */
  async getCachedAnswer(
    userId: string,
    query: string
  ): Promise<any | null> {
    try {
      const key = this.generateKey('answer', userId, query);
      const cached = this.cache.get<any>(key);

      if (cached) {
        console.log(`✅ [Cache] HIT for answer: "${query.substring(0, 50)}..."`);
        return cached;
      }

      return null;
    } catch (error) {
      console.error('❌ [Cache] Error getting cached answer:', error);
      return null;
    }
  }

  /**
   * Cache query expansion results
   */
  async cacheQueryExpansion(
    query: string,
    expandedQueries: string[]
  ): Promise<void> {
    try {
      const key = this.generateKey('query_expansion', query);
      this.cache.set(key, expandedQueries, this.SEARCH_TTL);
      console.log(`💾 [Cache] Cached query expansion for: "${query.substring(0, 50)}..."`);
    } catch (error) {
      console.error('❌ [Cache] Error caching query expansion:', error);
    }
  }

  /**
   * Get cached query expansion
   */
  async getCachedQueryExpansion(query: string): Promise<string[] | null> {
    try {
      const key = this.generateKey('query_expansion', query);
      const cached = this.cache.get<string[]>(key);

      if (cached) {
        console.log(`✅ [Cache] HIT for query expansion: "${query.substring(0, 50)}..."`);
        return cached;
      }

      return null;
    } catch (error) {
      console.error('❌ [Cache] Error getting cached query expansion:', error);
      return null;
    }
  }

  /**
   * Invalidate cache for a user (when they upload/delete documents)
   */
  async invalidateUserCache(userId: string): Promise<void> {
    try {
      // Invalidate ALL cache entries that could be affected by document changes
      const allKeys = this.cache.keys();
      const keysToDelete = allKeys.filter(key =>
        key.includes(userId) ||
        key.startsWith('documents_list:') ||
        key.startsWith('folder_tree:') ||
        key.startsWith('search:') ||
        key.startsWith('answer:')
      );

      if (keysToDelete.length > 0) {
        this.cache.del(keysToDelete);
        console.log(`🗑️  [Cache] Invalidated ${keysToDelete.length} cache entries for user ${userId}`);
      }
    } catch (error) {
      console.error('❌ [Cache] Error invalidating user cache:', error);
    }
  }

  /**
   * ⚡ OPTIMIZED: Invalidate cache for SPECIFIC conversation only (not all conversations)
   */
  async invalidateConversationCache(userId: string, conversationId: string): Promise<void> {
    try {
      // Only invalidate THIS conversation's cache
      const conversationKey = this.generateKey('conversation', conversationId, userId);
      this.cache.del(conversationKey);

      // Also invalidate conversation list cache (it shows message counts)
      const listKey = this.generateKey('conversations_list', userId);
      this.cache.del(listKey);

      console.log(`🗑️  [Cache] Invalidated cache for conversation ${conversationId.substring(0, 8)}... (user: ${userId.substring(0, 8)}...)`);
    } catch (error) {
      console.error('❌ [Cache] Error invalidating conversation cache:', error);
    }
  }

  /**
   * Invalidate document list cache for a user
   */
  async invalidateDocumentListCache(userId: string): Promise<void> {
    try {
      const keys = this.cache.keys().filter(key => key.startsWith('documents_list:') && key.includes(userId));

      if (keys.length > 0) {
        this.cache.del(keys);
        console.log(`🗑️  [Cache] Invalidated ${keys.length} document list cache entries for user ${userId}`);
      }
    } catch (error) {
      console.error('❌ [Cache] Error invalidating document list cache:', error);
    }
  }

  /**
   * Invalidate folder tree cache for a user
   */
  async invalidateFolderTreeCache(userId: string): Promise<void> {
    try {
      const keys = this.cache.keys().filter(key => key.startsWith('folder_tree:') && key.includes(userId));

      if (keys.length > 0) {
        this.cache.del(keys);
        console.log(`🗑️  [Cache] Invalidated ${keys.length} folder tree cache entries for user ${userId}`);
      }
    } catch (error) {
      console.error('❌ [Cache] Error invalidating folder tree cache:', error);
    }
  }

  /**
   * Invalidate specific document cache
   */
  async invalidateDocumentCache(documentId: string): Promise<void> {
    try {
      const keys = this.cache.keys().filter(key => key.includes(documentId));

      if (keys.length > 0) {
        this.cache.del(keys);
        console.log(`🗑️  [Cache] Invalidated ${keys.length} cache entries for document ${documentId}`);
      }
    } catch (error) {
      console.error('❌ [Cache] Error invalidating document cache:', error);
    }
  }

  /**
   * Cache document buffer for fast preview loading
   * TTL: 30 minutes (frequent access documents stay cached)
   */
  async cacheDocumentBuffer(documentId: string, buffer: Buffer): Promise<void> {
    try {
      const key = `document_buffer:${documentId}`;
      this.cache.set(key, buffer, 1800); // 30 minutes
      console.log(`💾 [Cache] Cached document buffer for ${documentId} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
    } catch (error) {
      console.error('❌ [Cache] Error caching document buffer:', error);
    }
  }

  /**
   * Get cached document buffer
   */
  async getCachedDocumentBuffer(documentId: string): Promise<Buffer | null> {
    try {
      const key = `document_buffer:${documentId}`;
      const cached = this.cache.get<Buffer>(key);

      if (cached) {
        console.log(`✅ [Cache] HIT for document buffer ${documentId} (${(cached.length / 1024 / 1024).toFixed(2)} MB)`);
        return cached;
      }

      return null;
    } catch (error) {
      console.error('❌ [Cache] Error getting cached document buffer:', error);
      return null;
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    keys: number;
    user_preferences_memory: string;
    hitRate: number;
  }> {
    try {
      const stats = this.cache.getStats();
      const keys = this.cache.keys().length;

      return {
        keys,
        user_preferences_memory: `${stats.ksize} keys`,
        hitRate: stats.hits / (stats.hits + stats.misses) * 100 || 0
      };
    } catch (error) {
      console.error('❌ [Cache] Error getting cache stats:', error);
      return {
        keys: 0,
        user_preferences_memory: 'Unknown',
        hitRate: 0
      };
    }
  }

  /**
   * Generic get method for any cache key
   */
  async get<T>(key: string, options?: { ttl?: number }): Promise<T | null> {
    try {
      const cached = this.cache.get<T>(key);
      if (cached) {
        console.log(`✅ [Cache] HIT for key: ${key.substring(0, 50)}...`);
        return cached;
      }
      return null;
    } catch (error) {
      console.error('❌ [Cache] Error getting cached value:', error);
      return null;
    }
  }

  /**
   * Generic set method for any cache key
   */
  async set<T>(key: string, value: T, options?: { ttl?: number }): Promise<void> {
    try {
      const ttl = options?.ttl || this.DEFAULT_TTL;
      this.cache.set(key, value, ttl);
      console.log(`💾 [Cache] SET: ${key.substring(0, 50)}... (TTL: ${ttl}s)`);
    } catch (error) {
      console.error('❌ [Cache] Error caching value:', error);
    }
  }

  /**
   * Clear all cache (use with caution!)
   */
  /**
   * Delete a specific cache key
   */
  async del(key: string): Promise<void> {
    try {
      this.cache.del(key);
      console.log(`🗑️  [Cache] Deleted key: ${key.substring(0, 50)}...`);
    } catch (error) {
      console.error('❌ [Cache] Error deleting key:', error);
    }
  }

  async clearAll(): Promise<void> {
    try {
      this.cache.flushAll();
      console.log('🗑️  [Cache] Cleared all cache');
    } catch (error) {
      console.error('❌ [Cache] Error clearing cache:', error);
    }
  }

  /**
   * Close cache service (for graceful shutdown)
   */
  async close(): Promise<void> {
    this.cache.close();
    console.log('✅ [Cache] Cache service closed');
  }

  // ============================================================================
  // MODE-BASED QUERY RESPONSE CACHING
  // ============================================================================

  /**
   * Cache query response with mode-specific TTL
   */
  async cacheQueryResponse(
    userId: string,
    query: string,
    mode: string,
    response: { answer: string; sources: any[] },
    ttl: number
  ): Promise<void> {
    try {
      const normalizedQuery = query.toLowerCase().trim();
      const key = `query_response:${userId}:${mode}:${this.generateKey('qr', normalizedQuery)}`;

      const cachedData = {
        ...response,
        mode,
        timestamp: Date.now()
      };

      this.cache.set(key, cachedData, ttl);

      console.log(`✅ [Cache] Cached query response (mode: ${mode}, TTL: ${ttl}s)`);
    } catch (error) {
      console.error('❌ [Cache] Error caching query response:', error);
    }
  }

  /**
   * Get cached query response
   */
  async getCachedQueryResponse(
    userId: string,
    query: string,
    mode: string
  ): Promise<{ answer: string; sources: any[]; mode: string; timestamp: number } | null> {
    try {
      const normalizedQuery = query.toLowerCase().trim();
      const key = `query_response:${userId}:${mode}:${this.generateKey('qr', normalizedQuery)}`;

      const cached = this.cache.get<{ answer: string; sources: any[]; mode: string; timestamp: number }>(key);

      if (cached) {
        const age = (Date.now() - cached.timestamp) / 1000;
        console.log(`✅ [Cache HIT] Query response (mode: ${mode}, age: ${age.toFixed(1)}s)`);
        return cached;
      }

      console.log(`❌ [Cache MISS] Query response (mode: ${mode})`);
      return null;
    } catch (error) {
      console.error('❌ [Cache] Error getting cached query response:', error);
      return null;
    }
  }

  /**
   * Invalidate all cached query responses for a user
   */
  async invalidateUserQueryCache(userId: string): Promise<void> {
    try {
      const keys = this.cache.keys();
      let invalidated = 0;

      for (const key of keys) {
        if (key.startsWith(`query_response:${userId}:`)) {
          this.cache.del(key);
          invalidated++;
        }
      }

      console.log(`🗑️  [Cache] Invalidated ${invalidated} cached query responses for user ${userId}`);
    } catch (error) {
      console.error('❌ [Cache] Error invalidating user query cache:', error);
    }
  }

  /**
   * Get cache statistics with hit rate
   */
  getCacheStatsSync() {
    const stats = this.cache.getStats();
    return {
      keys: this.cache.keys().length,
      hits: stats.hits,
      misses: stats.misses,
      hitRate: stats.hits / (stats.hits + stats.misses) || 0,
    };
  }
}

// Infrastructure singleton - kept for backward compatibility
// Can also be accessed via container.getCache()
export default new CacheService();
