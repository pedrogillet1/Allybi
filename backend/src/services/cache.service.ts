/**
 * Cache Service
 * Provides intelligent caching for embeddings, search results, and frequent queries.
 * Uses node-cache for fast in-memory caching without Redis dependency.
 */

import NodeCache from "node-cache";

import {
  buildCacheKey,
  buildDocumentBufferKey,
  buildQueryResponseKey,
} from "./cache/cache.keys";
import type {
  CachedQueryResponse,
  CacheStatsResult,
} from "./cache/cache.types";

export class CacheService {
  private cache: NodeCache;
  private readonly DEFAULT_TTL = 300; // 5 minutes
  private readonly EMBEDDING_TTL = 3600; // 1 hour (reduced from 7 days for memory)
  private readonly SEARCH_TTL = 300; // 5 minutes
  private readonly ANSWER_TTL = 300; // 5 minutes

  constructor() {
    this.cache = new NodeCache({
      stdTTL: this.DEFAULT_TTL,
      checkperiod: 60,
      useClones: false,
      deleteOnExpire: true,
    });

    console.log(
      "✅ [Cache] In-memory cache service initialized with node-cache",
    );
  }

  /**
   * Generate cache key from multiple arguments.
   */
  generateKey(prefix: string, ...args: any[]): string {
    return buildCacheKey(prefix, ...args);
  }

  private preview(value: string): string {
    return String(value || "").substring(0, 50);
  }

  private async safeWrite(op: () => void, errorLabel: string): Promise<void> {
    try {
      op();
    } catch (error) {
      console.error(errorLabel, error);
    }
  }

  private async safeRead<T>(op: () => T | null, errorLabel: string): Promise<T | null> {
    try {
      return op();
    } catch (error) {
      console.error(errorLabel, error);
      return null;
    }
  }

  async cacheEmbedding(text: string, embedding: number[]): Promise<void> {
    await this.safeWrite(() => {
      const key = this.generateKey("embedding", text);
      this.cache.set(key, embedding, this.EMBEDDING_TTL);
      console.log(
        `💾 [Cache] Cached embedding for text (length: ${text.length})`,
      );
    }, "❌ [Cache] Error caching embedding:");
  }

  async getCachedEmbedding(text: string): Promise<number[] | null> {
    return this.safeRead(() => {
      const key = this.generateKey("embedding", text);
      const cached = this.cache.get<number[]>(key);
      if (cached) {
        console.log(`✅ [Cache] HIT for embedding (length: ${text.length})`);
        return cached;
      }
      return null;
    }, "❌ [Cache] Error getting cached embedding:");
  }

  async cacheSearchResults(
    userId: string,
    query: string,
    results: any[],
  ): Promise<void> {
    await this.safeWrite(() => {
      const key = this.generateKey("search", userId, query);
      this.cache.set(key, results, this.SEARCH_TTL);
      console.log(
        `💾 [Cache] Cached search results for query: "${this.preview(query)}..."`,
      );
    }, "❌ [Cache] Error caching search results:");
  }

  async getCachedSearchResults(
    userId: string,
    query: string,
  ): Promise<any[] | null> {
    return this.safeRead(() => {
      const key = this.generateKey("search", userId, query);
      const cached = this.cache.get<any[]>(key);
      if (cached) {
        console.log(`✅ [Cache] HIT for search: "${this.preview(query)}..."`);
        return cached;
      }
      return null;
    }, "❌ [Cache] Error getting cached search results:");
  }

  async cacheAnswer(userId: string, query: string, answer: any): Promise<void> {
    await this.safeWrite(() => {
      const key = this.generateKey("answer", userId, query);
      this.cache.set(key, answer, this.ANSWER_TTL);
      console.log(`💾 [Cache] Cached answer for query: "${this.preview(query)}..."`);
    }, "❌ [Cache] Error caching answer:");
  }

  async getCachedAnswer(userId: string, query: string): Promise<any | null> {
    return this.safeRead(() => {
      const key = this.generateKey("answer", userId, query);
      const cached = this.cache.get<any>(key);
      if (cached) {
        console.log(`✅ [Cache] HIT for answer: "${this.preview(query)}..."`);
        return cached;
      }
      return null;
    }, "❌ [Cache] Error getting cached answer:");
  }

  async cacheQueryExpansion(
    query: string,
    expandedQueries: string[],
  ): Promise<void> {
    await this.safeWrite(() => {
      const key = this.generateKey("query_expansion", query);
      this.cache.set(key, expandedQueries, this.SEARCH_TTL);
      console.log(
        `💾 [Cache] Cached query expansion for: "${this.preview(query)}..."`,
      );
    }, "❌ [Cache] Error caching query expansion:");
  }

  async getCachedQueryExpansion(query: string): Promise<string[] | null> {
    return this.safeRead(() => {
      const key = this.generateKey("query_expansion", query);
      const cached = this.cache.get<string[]>(key);
      if (cached) {
        console.log(
          `✅ [Cache] HIT for query expansion: "${this.preview(query)}..."`,
        );
        return cached;
      }
      return null;
    }, "❌ [Cache] Error getting cached query expansion:");
  }

  async invalidateUserCache(userId: string): Promise<void> {
    await this.safeWrite(() => {
      const allKeys = this.cache.keys();
      const keysToDelete = allKeys.filter(
        (key) =>
          key.includes(userId) ||
          key.startsWith("documents_list:") ||
          key.startsWith("folder_tree:") ||
          key.startsWith("search:") ||
          key.startsWith("answer:"),
      );

      if (keysToDelete.length > 0) {
        this.cache.del(keysToDelete);
        console.log(
          `🗑️  [Cache] Invalidated ${keysToDelete.length} cache entries for user ${userId}`,
        );
      }
    }, "❌ [Cache] Error invalidating user cache:");
  }

  async invalidateConversationCache(
    userId: string,
    conversationId: string,
  ): Promise<void> {
    await this.safeWrite(() => {
      const conversationKey = this.generateKey("conversation", conversationId, userId);
      const listKey = this.generateKey("conversations_list", userId);
      this.cache.del([conversationKey, listKey]);
      console.log(
        `🗑️  [Cache] Invalidated cache for conversation ${conversationId.substring(0, 8)}... (user: ${userId.substring(0, 8)}...)`,
      );
    }, "❌ [Cache] Error invalidating conversation cache:");
  }

  async invalidateDocumentListCache(userId: string): Promise<void> {
    await this.safeWrite(() => {
      const keys = this.cache
        .keys()
        .filter((key) => key.startsWith("documents_list:") && key.includes(userId));
      if (keys.length > 0) {
        this.cache.del(keys);
        console.log(
          `🗑️  [Cache] Invalidated ${keys.length} document list cache entries for user ${userId}`,
        );
      }
    }, "❌ [Cache] Error invalidating document list cache:");
  }

  async invalidateFolderTreeCache(userId: string): Promise<void> {
    await this.safeWrite(() => {
      const keys = this.cache
        .keys()
        .filter((key) => key.startsWith("folder_tree:") && key.includes(userId));
      if (keys.length > 0) {
        this.cache.del(keys);
        console.log(
          `🗑️  [Cache] Invalidated ${keys.length} folder tree cache entries for user ${userId}`,
        );
      }
    }, "❌ [Cache] Error invalidating folder tree cache:");
  }

  async invalidateDocumentCache(documentId: string): Promise<void> {
    await this.safeWrite(() => {
      const keys = this.cache.keys().filter((key) => key.includes(documentId));
      if (keys.length > 0) {
        this.cache.del(keys);
        console.log(
          `🗑️  [Cache] Invalidated ${keys.length} cache entries for document ${documentId}`,
        );
      }
    }, "❌ [Cache] Error invalidating document cache:");
  }

  async cacheDocumentBuffer(documentId: string, buffer: Buffer): Promise<void> {
    await this.safeWrite(() => {
      const key = buildDocumentBufferKey(documentId);
      this.cache.set(key, buffer, 1800);
      console.log(
        `💾 [Cache] Cached document buffer for ${documentId} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`,
      );
    }, "❌ [Cache] Error caching document buffer:");
  }

  async getCachedDocumentBuffer(documentId: string): Promise<Buffer | null> {
    return this.safeRead(() => {
      const key = buildDocumentBufferKey(documentId);
      const cached = this.cache.get<Buffer>(key);
      if (cached) {
        console.log(
          `✅ [Cache] HIT for document buffer ${documentId} (${(cached.length / 1024 / 1024).toFixed(2)} MB)`,
        );
        return cached;
      }
      return null;
    }, "❌ [Cache] Error getting cached document buffer:");
  }

  async getCacheStats(): Promise<CacheStatsResult> {
    return (
      (await this.safeRead(() => {
        const stats = this.cache.getStats();
        const keys = this.cache.keys().length;
        return {
          keys,
          user_preferences_memory: `${stats.ksize} keys`,
          hitRate: (stats.hits / (stats.hits + stats.misses)) * 100 || 0,
        };
      }, "❌ [Cache] Error getting cache stats:")) || {
        keys: 0,
        user_preferences_memory: "Unknown",
        hitRate: 0,
      }
    );
  }

  async get<T>(key: string, _options?: { ttl?: number }): Promise<T | null> {
    return this.safeRead(() => {
      const cached = this.cache.get<T>(key);
      if (cached) {
        console.log(`✅ [Cache] HIT for key: ${this.preview(key)}...`);
        return cached;
      }
      return null;
    }, "❌ [Cache] Error getting cached value:");
  }

  async set<T>(key: string, value: T, options?: { ttl?: number }): Promise<void> {
    await this.safeWrite(() => {
      const ttl = options?.ttl || this.DEFAULT_TTL;
      this.cache.set(key, value, ttl);
      console.log(`💾 [Cache] SET: ${this.preview(key)}... (TTL: ${ttl}s)`);
    }, "❌ [Cache] Error caching value:");
  }

  async del(key: string): Promise<void> {
    await this.safeWrite(() => {
      this.cache.del(key);
      console.log(`🗑️  [Cache] Deleted key: ${this.preview(key)}...`);
    }, "❌ [Cache] Error deleting key:");
  }

  async clearAll(): Promise<void> {
    await this.safeWrite(() => {
      this.cache.flushAll();
      console.log("🗑️  [Cache] Cleared all cache");
    }, "❌ [Cache] Error clearing cache:");
  }

  async close(): Promise<void> {
    this.cache.close();
    console.log("✅ [Cache] Cache service closed");
  }

  async cacheQueryResponse(
    userId: string,
    query: string,
    mode: string,
    response: { answer: string; sources: any[] },
    ttl: number,
  ): Promise<void> {
    await this.safeWrite(() => {
      const key = buildQueryResponseKey(userId, mode, query);
      const cachedData: CachedQueryResponse = {
        ...response,
        mode,
        timestamp: Date.now(),
      };
      this.cache.set(key, cachedData, ttl);
      console.log(
        `✅ [Cache] Cached query response (mode: ${mode}, TTL: ${ttl}s)`,
      );
    }, "❌ [Cache] Error caching query response:");
  }

  async getCachedQueryResponse(
    userId: string,
    query: string,
    mode: string,
  ): Promise<CachedQueryResponse | null> {
    return this.safeRead(() => {
      const key = buildQueryResponseKey(userId, mode, query);
      const cached = this.cache.get<CachedQueryResponse>(key);
      if (cached) {
        const age = (Date.now() - cached.timestamp) / 1000;
        console.log(
          `✅ [Cache HIT] Query response (mode: ${mode}, age: ${age.toFixed(1)}s)`,
        );
        return cached;
      }
      console.log(`❌ [Cache MISS] Query response (mode: ${mode})`);
      return null;
    }, "❌ [Cache] Error getting cached query response:");
  }

  async invalidateUserQueryCache(userId: string): Promise<void> {
    await this.safeWrite(() => {
      const keys = this.cache.keys();
      let invalidated = 0;
      for (const key of keys) {
        if (key.startsWith(`query_response:${userId}:`)) {
          this.cache.del(key);
          invalidated++;
        }
      }
      console.log(
        `🗑️  [Cache] Invalidated ${invalidated} cached query responses for user ${userId}`,
      );
    }, "❌ [Cache] Error invalidating user query cache:");
  }

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

// Infrastructure singleton - kept for backward compatibility.
export default new CacheService();
