/// <reference path="../types/express.d.ts" />
import { Request, Response } from 'express';
import prisma from '../config/database';
import redis from '../config/redis';

/**
 * ═══════════════════════════════════════════════════════════════
 * PERFECT DELETE: Helper to get document IDs with active deletion jobs
 * ═══════════════════════════════════════════════════════════════
 * Returns IDs of documents that have queued/running deletion jobs.
 * These documents must be hidden from list endpoints to prevent flicker.
 *
 * IMPORTANT: This also includes documents inside FOLDERS being deleted!
 * When a folder deletion job is active, ALL documents in that folder tree
 * must be excluded to prevent ghost reappear on hard refresh.
 */
const getDocumentIdsBeingDeleted = async (userId: string): Promise<Set<string>> => {
  // 1. Get directly targeted document deletion jobs
  const directDocDeletionJobs = await prisma.deletionJob.findMany({
    where: {
      userId,
      targetType: 'document',
      status: { in: ['queued', 'running'] },
    },
    select: { targetId: true },
  });

  // 2. Get folder deletion jobs with their documentsToDelete arrays
  // This is CRITICAL for preventing ghost reappear of docs in deleted folders
  const folderDeletionJobs = await prisma.deletionJob.findMany({
    where: {
      userId,
      targetType: 'folder',
      status: { in: ['queued', 'running'] },
    },
    select: {
      targetId: true,
      documentsToDelete: true // JSON array of { id, filename, encryptedFilename }
    },
  });

  // Combine all document IDs
  const docIds = new Set<string>();

  // Add directly targeted documents
  directDocDeletionJobs.forEach(job => docIds.add(job.targetId));

  // Add documents from folder deletions
  for (const job of folderDeletionJobs) {
    const docsInFolder = job.documentsToDelete as Array<{ id: string }> | null;
    if (docsInFolder && Array.isArray(docsInFolder)) {
      docsInFolder.forEach(doc => docIds.add(doc.id));
    }
  }

  if (folderDeletionJobs.length > 0) {
    console.log(`🗑️ [PERFECT DELETE] Found ${folderDeletionJobs.length} folder deletion job(s), excluding ${docIds.size} total documents`);
  }

  return docIds;
};

/**
 * ═══════════════════════════════════════════════════════════════
 * PERFECT DELETE: Helper to get folder IDs with active deletion jobs
 * ═══════════════════════════════════════════════════════════════
 * Returns IDs of folders that have queued/running deletion jobs.
 * These folders must be hidden from list endpoints to prevent reappearing after refresh.
 *
 * IMPORTANT: This includes BOTH the target folder AND all subfolders!
 * The deletion job stores foldersToDelete which includes the entire folder tree.
 */
const getFolderIdsBeingDeleted = async (userId: string): Promise<Set<string>> => {
  const activeDeletionJobs = await prisma.deletionJob.findMany({
    where: {
      userId,
      targetType: 'folder',
      status: { in: ['queued', 'running'] },
    },
    select: {
      targetId: true,
      foldersToDelete: true // String array of all folder IDs in the tree
    },
  });

  const folderIds = new Set<string>();

  for (const job of activeDeletionJobs) {
    // Add the target folder
    folderIds.add(job.targetId);

    // Add all subfolders from the foldersToDelete array
    const subfolders = job.foldersToDelete as string[] | null;
    if (subfolders && Array.isArray(subfolders)) {
      subfolders.forEach(id => folderIds.add(id));
    }
  }

  return folderIds;
};

/**
 * Helper: Get all folder IDs in a folder tree (including nested subfolders)
 */
const getAllFolderIdsInTree = async (rootFolderId: string): Promise<string[]> => {
  const folderIds = [rootFolderId];
  let currentBatch = [rootFolderId];

  while (currentBatch.length > 0) {
    const subfolders = await prisma.folder.findMany({
      where: { parentFolderId: { in: currentBatch } },
      select: { id: true },
    });

    const subfolderIds = subfolders.map(f => f.id);
    if (subfolderIds.length === 0) break;

    folderIds.push(...subfolderIds);
    currentBatch = subfolderIds;
  }

  return folderIds;
};

/**
 * Helper: Count all documents in a folder tree recursively
 * ✅ FIX: Include all document statuses (completed, processing, uploading) for accurate counts
 */
const countDocumentsRecursively = async (folderId: string): Promise<number> => {
  const allFolderIds = await getAllFolderIdsInTree(folderId);
  const totalDocuments = await prisma.document.count({
    where: {
      folderId: { in: allFolderIds },
      status: { in: ['completed', 'processing', 'uploading', 'available', 'ready', 'enriching', 'failed'] } // ✅ FIX: Count ALL document statuses (including failed for Google Drive style)
    },
  });
  return totalDocuments;
};

/**
 * Batch Controller
 * Combines multiple API calls into single requests to reduce network round trips
 */

/**
 * Invalidate cache for a user's initial data
 * Call this when documents/folders are created/updated/deleted
 */
export const invalidateUserCache = async (userId: string) => {
  if (!redis) return;

  try {
    // Delete all cache keys for this user (handles different limit/recentLimit params)
    const pattern = `initial-data:${userId}:*`;
    const keys = await redis.keys(pattern);

    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`🗑️  [CACHE] Invalidated ${keys.length} cache keys for user ${userId.substring(0, 8)}`);
    }
  } catch (error: any) {
    console.warn('⚠️  Failed to invalidate cache:', error.message);
  }
};

/**
 * Get all initial data in a single request
 * Combines: documents, folders, recent documents
 *
 * Before: 3 sequential requests (600-900ms total)
 * After: 1 batched request (200-300ms total)
 */
export const getInitialData = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // ✅ FIX: Remove 50-file limit - load ALL documents by default
    // Previously limited to 50 for performance, but this caused "50 Files" issue
    // Now loads all documents; use pagination endpoint for very large libraries
    const limit = parseInt(req.query.limit as string) || 10000; // Effectively unlimited
    const recentLimit = parseInt(req.query.recentLimit as string) || 5;

    // ⚡ REDIS CACHE: Check cache first (80-95% faster on cache hit)
    const cacheKey = `initial-data:${userId}:${limit}:${recentLimit}`;

    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          const cachedData = JSON.parse(cached as string);
          console.log(`⚡ [CACHE HIT] Loaded initial data from cache in <10ms (${cachedData.meta.counts.documents} docs, ${cachedData.meta.counts.folders} folders)`);
          res.json(cachedData);
          return;
        }
      } catch (cacheError: any) {
        console.warn('⚠️  Redis cache read failed, falling back to database:', cacheError.message);
      }
    }

    console.log(`📦 [BATCH] Loading initial data for user ${userId.substring(0, 8)}...`);
    const startTime = Date.now();

    // ═══════════════════════════════════════════════════════════════
    // PERFECT DELETE: Get document IDs being actively deleted
    // These must be excluded from ALL document lists to prevent flicker
    // ═══════════════════════════════════════════════════════════════
    const deletingDocIds = await getDocumentIdsBeingDeleted(userId);
    const deletingDocIdArray = Array.from(deletingDocIds);
    if (deletingDocIdArray.length > 0) {
      console.log(`🗑️ [PERFECT DELETE] Filtering out ${deletingDocIdArray.length} document(s) with active deletion jobs`);
    }

    // ═══════════════════════════════════════════════════════════════
    // PERFECT DELETE: Get folder IDs being actively deleted
    // These must be excluded from ALL folder lists to prevent reappearing after refresh
    // ═══════════════════════════════════════════════════════════════
    const deletingFolderIds = await getFolderIdsBeingDeleted(userId);
    const deletingFolderIdArray = Array.from(deletingFolderIds);
    if (deletingFolderIdArray.length > 0) {
      console.log(`🗑️ [PERFECT DELETE] Filtering out ${deletingFolderIdArray.length} folder(s) with active deletion jobs`);
    }

    // ✅ OPTIMIZATION: Load all data in PARALLEL with a single Promise.all
    // ✅ RESILIENCE: Use explicit select to avoid breaking on missing columns
    const [documents, folders, recentDocuments] = await Promise.all([
      // Load all documents with joins (no N+1)
      // ✅ FIX: Include 'processing', 'uploading', and 'failed' documents so they appear in UI immediately
      // 🔧 GOOGLE DRIVE STYLE: Failed documents remain visible with error badge
      // 🗑️ PERFECT DELETE: Exclude documents with active deletion jobs
      prisma.document.findMany({
        where: {
          userId,
          status: { in: ['completed', 'processing', 'uploading', 'available', 'ready', 'enriching', 'failed'] },
          // 🗑️ PERFECT DELETE: Exclude documents being deleted
          ...(deletingDocIdArray.length > 0 && { id: { notIn: deletingDocIdArray } }),
        },
        select: {
          // Core fields needed for document list display
          id: true,
          userId: true,
          folderId: true,
          filename: true,
          encryptedFilename: true,
          fileSize: true,
          mimeType: true,
          fileHash: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          language: true,
          chunksCount: true,
          embeddingsGenerated: true,
          error: true,
          displayTitle: true,
          uploadSessionId: true,
          // Optional fields that might be new - included for forward compatibility
          previewText: true,
          // Folder relation for display
          folder: {
            select: {
              id: true,
              name: true,
              emoji: true,
            }
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),

      // Load all folders WITH document counts
      // ✅ FIX: Include _count to show proper file counts in categories
      // 🗑️ PERFECT DELETE: Exclude folders with active deletion jobs
      prisma.folder.findMany({
        where: {
          userId,
          // 🗑️ PERFECT DELETE: Exclude folders being deleted
          ...(deletingFolderIdArray.length > 0 && { id: { notIn: deletingFolderIdArray } }),
        },
        select: {
          id: true,
          name: true,
          emoji: true,
          parentFolderId: true,
          createdAt: true,
          updatedAt: true,
          // ✅ FIX: Include document and subfolder counts
          _count: {
            select: {
              documents: true,
              subfolders: true,
            }
          }
        },
        orderBy: { createdAt: 'desc' },
      }),

      // Load recent documents (top 5)
      // ✅ FIX: Include processing/uploading/failed documents in recent list
      // 🔧 GOOGLE DRIVE STYLE: Failed documents remain visible with error badge
      // ✅ RESILIENCE: Use explicit select to avoid breaking on missing columns
      // 🗑️ PERFECT DELETE: Exclude documents with active deletion jobs
      prisma.document.findMany({
        where: {
          userId,
          status: { in: ['completed', 'processing', 'uploading', 'available', 'ready', 'enriching', 'failed'] },
          // 🗑️ PERFECT DELETE: Exclude documents being deleted
          ...(deletingDocIdArray.length > 0 && { id: { notIn: deletingDocIdArray } }),
        },
        select: {
          id: true,
          userId: true,
          folderId: true,
          filename: true,
          encryptedFilename: true,
          fileSize: true,
          mimeType: true,
          fileHash: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          language: true,
          chunksCount: true,
          embeddingsGenerated: true,
          error: true,
          displayTitle: true,
          uploadSessionId: true,
          previewText: true,
          folder: {
            select: {
              id: true,
              name: true,
              emoji: true,
              parentFolderId: true,
            }
          },
        },
        orderBy: { createdAt: 'desc' },
        take: recentLimit,
      }),
    ]);

    // ✅ OPTIMIZED: Calculate totalDocuments using a SINGLE groupBy query instead of N+1 queries
    // This is orders of magnitude faster than calling countDocumentsRecursively for each folder

    // Step 1: Get all document counts grouped by folderId in ONE query
    // 🔧 GOOGLE DRIVE STYLE: Include 'failed' in counts so numbers stay consistent
    const docCounts = await prisma.document.groupBy({
      by: ['folderId'],
      _count: { id: true },
      where: {
        userId,
        status: { in: ['completed', 'processing', 'uploading', 'available', 'ready', 'enriching', 'failed'] }
      }
    });

    // Step 2: Create a fast lookup map for direct document counts per folder
    const countMap = new Map<string, number>();
    for (const group of docCounts) {
      if (group.folderId) {
        countMap.set(group.folderId, group._count.id);
      }
    }

    // Step 3: Create a folder lookup map and initialize counts
    const folderMap = new Map<string, any>();
    for (const folder of folders) {
      const directDocCount = countMap.get(folder.id) || 0;
      folderMap.set(folder.id, {
        ...folder,
        _count: {
          ...folder._count,
          totalDocuments: directDocCount // Start with direct document count
        }
      });
    }

    // Step 4: Propagate counts up to parent folders (in-memory, very fast)
    // For each folder, add its direct document count to all its ancestors
    for (const folder of folders) {
      const directCount = countMap.get(folder.id) || 0;
      if (directCount > 0) {
        let parentId = folder.parentFolderId;
        while (parentId) {
          const parent = folderMap.get(parentId);
          if (parent) {
            parent._count.totalDocuments += directCount;
            parentId = parent.parentFolderId;
          } else {
            break;
          }
        }
      }
    }

    // Step 5: Convert map back to array
    const foldersWithTotalCount = Array.from(folderMap.values());

    const duration = Date.now() - startTime;
    console.log(`✅ [BATCH] Loaded ${documents.length} docs, ${foldersWithTotalCount.length} folders, ${recentDocuments.length} recent in ${duration}ms`);

    const response = {
      documents,
      folders: foldersWithTotalCount, // ✅ Use folders with totalDocuments count
      recentDocuments,
      meta: {
        loadTime: duration,
        counts: {
          documents: documents.length,
          folders: foldersWithTotalCount.length,
          recent: recentDocuments.length,
        }
      }
    };

    // ⚡ REDIS CACHE: Store in cache for 60 seconds (invalidate on document upload/delete)
    if (redis) {
      try {
        await redis.setex(cacheKey, 60, JSON.stringify(response));
        console.log(`💾 [CACHE] Stored initial data in cache (expires in 60s)`);
      } catch (cacheError: any) {
        console.warn('⚠️  Redis cache write failed:', cacheError.message);
      }
    }

    res.json(response);
    return;
  } catch (error: any) {
    console.error('❌ [BATCH] Error loading initial data:', error);
    res.status(500).json({ error: error.message || 'Failed to load initial data' });
    return;
  }
};

/**
 * Batch update multiple documents
 * Useful for bulk operations (delete, move, tag)
 */
export const batchUpdateDocuments = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { documentIds, operation, data } = req.body;

    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      res.status(400).json({ error: 'documentIds array is required' });
      return;
    }

    if (!operation) {
      res.status(400).json({ error: 'operation is required' });
      return;
    }

    console.log(`📦 [BATCH] ${operation} for ${documentIds.length} documents`);

    let result;

    switch (operation) {
      case 'delete':
        result = await prisma.document.updateMany({
          where: {
            id: { in: documentIds },
            userId, // Security: only update user's own documents
          },
          data: { status: 'deleted' }
        });
        break;

      case 'move':
        if (!data?.folderId) {
          res.status(400).json({ error: 'folderId is required for move operation' });
          return;
        }
        result = await prisma.document.updateMany({
          where: {
            id: { in: documentIds },
            userId,
          },
          data: { folderId: data.folderId }
        });
        break;

      case 'tag':
        if (!data?.tagId) {
          res.status(400).json({ error: 'tagId is required for tag operation' });
          return;
        }
        // Create document-tag relations for all documents
        result = await prisma.documentTag.createMany({
          data: documentIds.map(docId => ({
            documentId: docId,
            tagId: data.tagId,
          })),
          skipDuplicates: true,
        });
        break;

      default:
        res.status(400).json({ error: `Unknown operation: ${operation}` });
        return;
    }

    console.log(`✅ [BATCH] ${operation} completed: ${result.count} documents affected`);

    // ⚡ CACHE: Invalidate user's cache after modifying documents
    await invalidateUserCache(userId);

    res.json({
      success: true,
      operation,
      affected: result.count,
    });
    return;
  } catch (error: any) {
    console.error(`❌ [BATCH] Error in batch update:`, error);
    res.status(500).json({ error: error.message || 'Batch update failed' });
    return;
  }
};
