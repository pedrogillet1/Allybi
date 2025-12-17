import prisma from '../config/database';
import { invalidateUserCache } from '../controllers/batch.controller';
import { deleteFile } from '../config/storage';
import { onFolderCreated, onFolderRenamed, onFolderMoved } from './folderPath.service';

/**
 * Create a new folder
 */
export const createFolder = async (
  userId: string,
  name: string,
  emoji?: string,
  parentFolderId?: string,
  encryptionMetadata?: {
    nameEncrypted?: string;
    encryptionSalt?: string;
    encryptionIV?: string;
    encryptionAuthTag?: string;
    isEncrypted?: boolean;
  },
  options?: {
    reuseExisting?: boolean;  // ✅ NEW: Option to reuse existing folder
    autoRename?: boolean;     // ✅ NEW: Option to auto-rename (default: false)
  }
) => {
  // ✅ FIX: Check for existing folder
  const existingFolder = await prisma.folder.findFirst({
    where: {
      userId,
      name,
      parentFolderId: parentFolderId || null,
    },
    include: {
      parentFolder: true,
      subfolders: true,
      _count: {
        select: {
          documents: true,
        },
      },
    },
  });

  if (existingFolder) {
    // ✅ FIX: Check options
    if (options?.reuseExisting) {
      console.log(`✅ Reusing existing folder: ${name} (${existingFolder.id})`);
      return existingFolder;  // ✅ Return existing folder
    }

    if (options?.autoRename) {
      // Auto-rename if requested
      let counter = 1;
      let newName = `${name} (${counter})`;
      while (await prisma.folder.findFirst({
        where: { userId, name: newName, parentFolderId: parentFolderId || null }
      })) {
        counter++;
        newName = `${name} (${counter})`;
      }
      console.log(`⚠️ Folder "${name}" exists, creating as "${newName}"`);
      name = newName;
    } else {
      // ✅ DEFAULT: Throw error
      throw new Error(`Folder "${name}" already exists in this location`);
    }
  }

  const folder = await prisma.folder.create({
    data: {
      userId,
      name,
      emoji: emoji || null,
      parentFolderId: parentFolderId || null,
      // ⚡ ZERO-KNOWLEDGE ENCRYPTION: Store encryption metadata
      ...(encryptionMetadata?.isEncrypted && {
        nameEncrypted: encryptionMetadata.nameEncrypted || null,
        encryptionSalt: encryptionMetadata.encryptionSalt || null,
        encryptionIV: encryptionMetadata.encryptionIV || null,
        encryptionAuthTag: encryptionMetadata.encryptionAuthTag || null,
      }),
    },
    include: {
      parentFolder: true,
      subfolders: true,
      _count: {
        select: {
          documents: true,
        },
      },
    },
  });

  // Update folder path after creation
  await onFolderCreated(folder.id);

  return folder;
};

/**
 * Get or create a folder by name (for auto-categorization)
 */
export const getOrCreateFolderByName = async (userId: string, folderName: string) => {
  // First, try to find existing folder
  const existingFolder = await prisma.folder.findFirst({
    where: {
      userId,
      name: folderName,
      parentFolderId: null, // Only check top-level folders
    },
  });

  if (existingFolder) {
    return existingFolder;
  }

  // Create new folder if it doesn't exist
  const newFolder = await prisma.folder.create({
    data: {
      userId,
      name: folderName,
      parentFolderId: null,
    },
  });

  return newFolder;
};

/**
 * ⚡ OPTIMIZED: Get all folder IDs in a folder tree (including nested subfolders)
 * Uses iterative approach instead of recursive to avoid N+1 query problem
 */
const getAllFolderIdsInTree = async (rootFolderId: string): Promise<string[]> => {
  const folderIds = [rootFolderId];
  let currentBatch = [rootFolderId];

  // Iteratively find all subfolders (breadth-first search)
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
 * ⚡ OPTIMIZED: Count all documents in a folder tree with a SINGLE query
 */
const countDocumentsRecursively = async (folderId: string): Promise<number> => {
  // Get all folder IDs in this tree (including subfolders)
  const allFolderIds = await getAllFolderIdsInTree(folderId);

  // Count documents in ALL folders with a single query
  // ✅ FIX: Include processing and uploading documents in count (not just completed)
  const totalDocuments = await prisma.document.count({
    where: {
      folderId: { in: allFolderIds },
      status: { in: ["completed", "processing", "uploading"] }
    },
  });

  return totalDocuments;
};

/**
 * Get folder tree for a user
 * ✅ OPTIMIZED: Uses single groupBy query instead of N+1 recursive queries
 */
export const getFolderTree = async (userId: string, includeAll: boolean = false) => {
  // --- ⚡ START: PERFORMANCE OPTIMIZATION ⚡ ---

  // 1. Get ALL folders for the user in a flat list (we need all for recursive count calculation)
  const allFolders = await prisma.folder.findMany({
    where: { userId },
    include: {
      _count: {
        select: {
          documents: true,
          subfolders: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // 2. Get all document counts grouped by folderId in a SINGLE query
  const docCounts = await prisma.document.groupBy({
    by: ['folderId'],
    _count: { id: true },
    where: {
      userId,
      status: { in: ['completed', 'processing', 'uploading'] }
    }
  });

  // 3. Create a fast lookup map for direct document counts per folder
  const countMap = new Map<string, number>();
  for (const group of docCounts) {
    if (group.folderId) {
      countMap.set(group.folderId, group._count.id);
    }
  }

  // 4. Create a folder lookup map and initialize counts
  const folderMap = new Map<string, any>();
  for (const folder of allFolders) {
    const directDocCount = countMap.get(folder.id) || 0;
    folderMap.set(folder.id, {
      ...folder,
      subfolders: [], // Will be populated if includeAll is false
      _count: {
        ...folder._count,
        totalDocuments: directDocCount // Start with direct document count
      }
    });
  }

  // 5. Propagate counts up to parent folders (in-memory, very fast)
  for (const folder of allFolders) {
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

  // --- ⚡ END: PERFORMANCE OPTIMIZATION ⚡ ---

  // 6. Build the result based on includeAll flag
  if (includeAll) {
    // Return flat list of ALL folders with correct counts
    return Array.from(folderMap.values());
  }

  // Build nested tree structure for root-level folders only
  for (const folder of folderMap.values()) {
    if (folder.parentFolderId) {
      const parent = folderMap.get(folder.parentFolderId);
      if (parent) {
        parent.subfolders.push(folder);
      }
    }
  }

  // Return only root-level folders (with nested subfolders)
  const rootFolders = Array.from(folderMap.values()).filter(f => !f.parentFolderId);
  return rootFolders;
};

/**
 * Get single folder with contents
 * ✅ FIX: Now includes _count for subfolders and calculates totalDocuments recursively
 */
export const getFolder = async (folderId: string, userId: string) => {
  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    include: {
      // ✅ FIX: Include _count in subfolders query
      subfolders: {
        include: {
          _count: {
            select: {
              documents: true,
              subfolders: true,
            },
          },
        },
      },
      documents: {
        where: {
          status: 'completed', // Only return completed documents
        },
        include: {
          tags: {
            include: {
              tag: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!folder) {
    throw new Error('Folder not found');
  }

  if (folder.userId !== userId) {
    throw new Error('Unauthorized');
  }

  // ✅ FIX: Calculate totalDocuments recursively for each subfolder
  const subfoldersWithTotalCount = await Promise.all(
    folder.subfolders.map(async (subfolder: any) => {
      const totalDocuments = await countDocumentsRecursively(subfolder.id);
      return {
        ...subfolder,
        _count: {
          ...subfolder._count,
          totalDocuments, // Total documents including all nested subfolders
        },
      };
    })
  );

  // Return folder with enhanced subfolders
  return {
    ...folder,
    subfolders: subfoldersWithTotalCount,
  };
};

/**
 * Update folder
 */
export const updateFolder = async (folderId: string, userId: string, name?: string, emoji?: string, parentFolderId?: string | null) => {
  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
  });

  if (!folder) {
    throw new Error('Folder not found');
  }

  if (folder.userId !== userId) {
    throw new Error('Unauthorized');
  }

  // If parentFolderId is provided, validate it's not a circular reference
  if (parentFolderId !== undefined) {
    // Can't set folder as its own parent
    if (parentFolderId === folderId) {
      throw new Error('Cannot set folder as its own parent');
    }

    // Check for circular reference (folder being moved into one of its descendants)
    if (parentFolderId) {
      const isDescendant = await checkIfDescendant(folderId, parentFolderId);
      if (isDescendant) {
        throw new Error('Cannot move folder into its own descendant');
      }
    }
  }

  const updateData: any = {};
  if (name !== undefined) {
    updateData.name = name;
  }
  if (emoji !== undefined) {
    updateData.emoji = emoji;
  }
  if (parentFolderId !== undefined) {
    updateData.parentFolderId = parentFolderId;
  }

  const updated = await prisma.folder.update({
    where: { id: folderId },
    data: updateData,
  });


  // Update folder paths when renamed or moved
  if (name !== undefined) {
    await onFolderRenamed(folderId);
  } else if (parentFolderId !== undefined) {
    await onFolderMoved(folderId);
  }

  return updated;
};

/**
 * Check if targetFolder is a descendant of sourceFolder
 */
const checkIfDescendant = async (sourceFolderId: string, targetFolderId: string): Promise<boolean> => {
  let currentFolder = await prisma.folder.findUnique({
    where: { id: targetFolderId },
  });

  while (currentFolder) {
    if (currentFolder.id === sourceFolderId) {
      return true;
    }
    if (!currentFolder.parentFolderId) {
      return false;
    }
    currentFolder = await prisma.folder.findUnique({
      where: { id: currentFolder.parentFolderId },
    });
  }

  return false;
};

/**
 * Bulk create folders from folder tree structure - REDESIGNED
 * Uses transaction for atomic operation and better performance
 *
 * IMPORTANT: This function creates SUBFOLDERS only, not the root category
 * The root category (parentFolderId) must already exist before calling this
 *
 * @param userId - User ID who owns the folders
 * @param folderTree - Array of folders to create with {name, path, parentPath, depth}
 * @param defaultEmoji - Emoji to use for folders (default: 📁)
 * @param parentFolderId - The category ID under which to create these subfolders
 */
export const bulkCreateFolders = async (
  userId: string,
  folderTree: Array<{ name: string; path: string; parentPath?: string | null; depth?: number }>,
  defaultEmoji: string | null = null, // Change default to null to allow SVG icon
  parentFolderId?: string
) => {
  const startTime = Date.now();
  console.log(`\n📁 ===== BACKEND: BULK CREATE SUBFOLDERS =====`);
  console.log(`User ID: ${userId}`);
  console.log(`Parent Category ID: ${parentFolderId || 'NONE (will create root folders)'}`);
  console.log(`Number of subfolders to create: ${folderTree.length}`);

  if (folderTree.length === 0) {
    console.log(`No subfolders to create, returning empty map`);
    return {};
  }

  const folderMap: { [path: string]: string } = {};

  // Sort by depth to ensure parents are created before children
  const sortedFolders = folderTree.sort((a, b) => {
    const aDepth = a.depth !== undefined ? a.depth : a.path.split('/').length - 1;
    const bDepth = b.depth !== undefined ? b.depth : b.path.split('/').length - 1;
    return aDepth - bDepth;
  });

  console.log(`\nFolders sorted by depth:`);
  sortedFolders.forEach(f => {
    const depth = f.depth !== undefined ? f.depth : f.path.split('/').length - 1;
    console.log(`  - "${f.name}" (path: ${f.path}, parent: ${f.parentPath || 'CATEGORY'}, depth: ${depth})`);
  });

  // Use transaction for atomic operation with increased timeout for large folder uploads
  await prisma.$transaction(async (tx) => {
    for (const folderData of sortedFolders) {
      const { name, path, parentPath } = folderData;

      // Determine parent folder ID
      let resolvedParentFolderId: string | null;

      if (parentPath === null || parentPath === undefined) {
        // Direct child of category (first level subfolder)
        resolvedParentFolderId = parentFolderId || null;
        console.log(`\n  📂 Creating first-level subfolder "${name}"`);
        console.log(`     Path: ${path}`);
        console.log(`     Parent: Category (${resolvedParentFolderId})`);
      } else {
        // Nested subfolder - look up parent from folderMap
        resolvedParentFolderId = folderMap[parentPath];
        console.log(`\n  📂 Creating nested subfolder "${name}"`);
        console.log(`     Path: ${path}`);
        console.log(`     Parent path: ${parentPath}`);
        console.log(`     Parent ID: ${resolvedParentFolderId}`);

        if (!resolvedParentFolderId) {
          throw new Error(`Parent folder not found for path "${parentPath}" when creating "${name}"`);
        }
      }

      // ✅ FIX: Check if folder already exists before creating (prevents duplicates on retry)
      const existingFolder = await tx.folder.findFirst({
        where: {
          userId,
          name,
          parentFolderId: resolvedParentFolderId,
        },
      });

      let folder;
      if (existingFolder) {
        console.log(`     ♻️ Reusing existing folder: ${name} (${existingFolder.id})`);
        folder = existingFolder;
      } else {
        // Create the folder within transaction
        folder = await tx.folder.create({
          data: {
            userId,
            name,
            emoji: defaultEmoji,
            parentFolderId: resolvedParentFolderId,
          },
        });
        console.log(`     ✅ Created with ID: ${folder.id}`);
      }

      // Store the mapping
      folderMap[path] = folder.id;
    }
  }, {
    maxWait: 60000, // Maximum time to wait for transaction to start (60s)
    timeout: 120000, // Maximum time for transaction to complete (2 minutes)
  });

  const duration = Date.now() - startTime;
  console.log(`\n✅ Successfully created ${sortedFolders.length} subfolders in ${duration}ms`);
  console.log(`Folder mapping:`, folderMap);
  console.log(`===== END BULK CREATE =====\n`);

  return folderMap;
};

/**
 * ⚡ OPTIMIZED: Delete folder (cascade delete - deletes all subfolders and documents)
 * ✅ FIXED: Now properly deletes from all storage systems (GCS, PostgreSQL embeddings, Pinecone)
 * Uses bulk delete instead of recursive deletion for instant performance
 */
export const deleteFolder = async (folderId: string, userId: string) => {
  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
  });

  if (!folder) {
    throw new Error('Folder not found');
  }

  if (folder.userId !== userId) {
    throw new Error('Unauthorized');
  }

  // ⚡ OPTIMIZATION: Get all folder IDs in one query instead of recursive deletion
  const allFolderIds = await getAllFolderIdsInTree(folderId);

  console.log(`🗑️ [DeleteFolder] Deleting folder "${folder.name}" and ${allFolderIds.length - 1} subfolders (${allFolderIds.length} total)`);

  // ✅ CRITICAL FIX: Enumerate all documents BEFORE deletion to clean up external storage
  const documentsToDelete = await prisma.document.findMany({
    where: { folderId: { in: allFolderIds } },
    select: {
      id: true,
      encryptedFilename: true,
      filename: true,
    },
  });

  console.log(`📊 [DeleteFolder] Found ${documentsToDelete.length} documents to clean up from external storage`);

  // Track cleanup errors (non-blocking)
  const cleanupErrors: string[] = [];
  let storageDeleted = 0;
  let postgresEmbeddingsDeleted = 0;
  let pineconeEmbeddingsDeleted = 0;

  // ✅ STEP 1: Delete from external storage systems BEFORE database deletion
  for (const doc of documentsToDelete) {
    // 1a. Delete from GCS/S3
    try {
      await deleteFile(doc.encryptedFilename);
      storageDeleted++;
    } catch (error: any) {
      const errorMsg = `[${doc.filename}] GCS delete failed: ${error.message}`;
      console.error(`  ❌ ${errorMsg}`);
      cleanupErrors.push(errorMsg);
    }

    // 1b. Delete from PostgreSQL embeddings
    try {
      const vectorEmbeddingService = await import('./vectorEmbedding.service');
      await vectorEmbeddingService.default.deleteDocumentEmbeddings(doc.id);
      postgresEmbeddingsDeleted++;
    } catch (error: any) {
      const errorMsg = `[${doc.filename}] PostgreSQL embeddings delete failed: ${error.message}`;
      console.error(`  ❌ ${errorMsg}`);
      cleanupErrors.push(errorMsg);
    }

    // 1c. Delete from Pinecone (CRITICAL - prevents orphaned vectors)
    try {
      const pineconeService = await import('./pinecone.service');
      await pineconeService.default.deleteDocumentEmbeddings(doc.id);
      pineconeEmbeddingsDeleted++;
    } catch (error: any) {
      const errorMsg = `[${doc.filename}] Pinecone delete failed: ${error.message}`;
      console.error(`  ❌ ${errorMsg}`);
      cleanupErrors.push(errorMsg);
    }
  }

  console.log(`  ✅ External storage cleanup: ${storageDeleted}/${documentsToDelete.length} files, ${postgresEmbeddingsDeleted}/${documentsToDelete.length} PG embeddings, ${pineconeEmbeddingsDeleted}/${documentsToDelete.length} Pinecone vectors`);

  // ✅ STEP 2: Delete from database atomically
  await prisma.$transaction(async (tx) => {
    // 2a. Delete all documents in all folders (bulk delete)
    const deletedDocs = await tx.document.deleteMany({
      where: { folderId: { in: allFolderIds } },
    });
    console.log(`  ✅ Deleted ${deletedDocs.count} documents from database`);

    // 2b. Delete all folders (bulk delete)
    const deletedFolders = await tx.folder.deleteMany({
      where: { id: { in: allFolderIds } },
    });
    console.log(`  ✅ Deleted ${deletedFolders.count} folders from database`);
  });

  // Log any cleanup errors that occurred
  if (cleanupErrors.length > 0) {
    console.warn(`⚠️ [DeleteFolder] Completed with ${cleanupErrors.length} external storage cleanup errors:`, cleanupErrors);
  }

  console.log(`✅ [DeleteFolder] Folder deletion complete`);

  // ✅ FIX #3: Invalidate the user's cache to prevent stale data from reappearing
  await invalidateUserCache(userId);

  return {
    success: true,
    documentsDeleted: documentsToDelete.length,
    foldersDeleted: allFolderIds.length,
    cleanupErrors: cleanupErrors.length > 0 ? cleanupErrors : undefined
  };
};
