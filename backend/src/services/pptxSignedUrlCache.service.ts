/**
 * PPTX Signed URL Cache Service
 *
 * Short-lived in-memory cache for signed URLs to prevent re-sign storms
 * Cache key: docId + storagePath + userId (if permissions differ per user)
 * TTL: 55 minutes (URLs expire in 60 minutes)
 */

interface CachedSignedUrl {
  url: string;
  expiresAt: number; // Unix timestamp in milliseconds
  storagePath: string;
}

interface CacheMap {
  [key: string]: CachedSignedUrl;
}

class PPTXSignedUrlCache {
  private cache: CacheMap = {};
  private readonly TTL_MS = 55 * 60 * 1000; // 55 minutes
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start cleanup interval (every 10 minutes)
    this.startCleanup();
  }

  /**
   * Get cached signed URL if valid
   */
  get(docId: string, storagePath: string, userId?: string): string | null {
    const key = this.buildKey(docId, storagePath, userId);
    const cached = this.cache[key];

    if (!cached) {
      return null;
    }

    // Check if expired
    if (Date.now() >= cached.expiresAt) {
      delete this.cache[key];
      return null;
    }

    return cached.url;
  }

  /**
   * Set cached signed URL
   */
  set(docId: string, storagePath: string, url: string, userId?: string): void {
    const key = this.buildKey(docId, storagePath, userId);
    const expiresAt = Date.now() + this.TTL_MS;

    this.cache[key] = {
      url,
      expiresAt,
      storagePath
    };
  }

  /**
   * Invalidate all entries for a document
   */
  invalidateDocument(docId: string): void {
    const prefix = `${docId}:`;
    for (const key of Object.keys(this.cache)) {
      if (key.startsWith(prefix)) {
        delete this.cache[key];
      }
    }
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache = {};
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; keys: string[] } {
    return {
      size: Object.keys(this.cache).length,
      keys: Object.keys(this.cache)
    };
  }

  /**
   * Build cache key
   */
  private buildKey(docId: string, storagePath: string, userId?: string): string {
    // Include userId if provided (for per-user permissions)
    return userId
      ? `${docId}:${storagePath}:${userId}`
      : `${docId}:${storagePath}`;
  }

  /**
   * Start automatic cleanup of expired entries
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 10 * 60 * 1000); // Every 10 minutes

    // Prevent blocking Node.js exit
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Remove expired entries
   */
  private cleanupExpired(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, cached] of Object.entries(this.cache)) {
      if (now >= cached.expiresAt) {
        delete this.cache[key];
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[CACHE_CLEANUP] Removed ${cleaned} expired signed URL entries`);
    }
  }

  /**
   * Stop cleanup interval (for testing)
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Singleton instance
export const signedUrlCache = new PPTXSignedUrlCache();
