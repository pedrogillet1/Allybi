/**
 * Cache Invalidation Utilities
 *
 * Centralized cache invalidation helpers.
 * Extracted from archived batch.controller.ts for shared use.
 */

import { getContainer } from '../bootstrap/container';

/**
 * Invalidate all cache keys for a specific user.
 * Used after document/folder operations to ensure fresh data.
 */
export const invalidateUserCache = async (userId: string): Promise<void> => {
  try {
    const cache = (getContainer() as any).getCache();

    // Invalidate common user-specific cache patterns
    const keysToInvalidate = [
      cache.generateKey('conversations_list', userId),
      cache.generateKey('documents_list', userId),
      cache.generateKey('folders_list', userId),
      cache.generateKey('storage_usage', userId),
    ];

    for (const key of keysToInvalidate) {
      await cache.set(key, null, { ttl: 0 });
    }

    console.log(`🗑️ [CACHE] Invalidated cache for user ${userId.substring(0, 8)}`);
  } catch (error) {
    // Cache invalidation is best-effort, don't fail the operation
    console.warn('[CACHE] Failed to invalidate cache:', error);
  }
};
