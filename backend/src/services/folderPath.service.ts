/**
 * Folder Path Service
 *
 * Manages folder path computation and caching for O(1) path lookups.
 * When folders are created, renamed, or moved, this service updates
 * the path field for the folder and all its descendants.
 *
 * @version 1.0.0
 */

import prisma from '../config/database';

// ═══════════════════════════════════════════════════════════════════════════
// Path Computation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute the full path for a folder by traversing parent hierarchy
 */
async function computeFolderPath(folderId: string): Promise<string> {
  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    select: {
      id: true,
      name: true,
      parentFolderId: true,
    },
  });

  if (!folder) {
    return '/';
  }

  // Build path by traversing up the hierarchy
  const pathParts: string[] = [folder.name];
  let currentParentId = folder.parentFolderId;

  while (currentParentId) {
    const parent = await prisma.folder.findUnique({
      where: { id: currentParentId },
      select: {
        id: true,
        name: true,
        parentFolderId: true,
      },
    });

    if (!parent) break;

    pathParts.unshift(parent.name);
    currentParentId = parent.parentFolderId;
  }

  return '/' + pathParts.join('/');
}

/**
 * Update the path for a folder and all its descendants
 */
async function updateFolderAndDescendants(folderId: string): Promise<number> {
  let updatedCount = 0;

  // Update this folder's path
  const newPath = await computeFolderPath(folderId);
  await prisma.folder.update({
    where: { id: folderId },
    data: { path: newPath },
  });
  updatedCount++;

  // Find all descendant folders (direct children)
  const children = await prisma.folder.findMany({
    where: { parentFolderId: folderId },
    select: { id: true },
  });

  // Recursively update descendants
  for (const child of children) {
    updatedCount += await updateFolderAndDescendants(child.id);
  }

  return updatedCount;
}

// ═══════════════════════════════════════════════════════════════════════════
// Event Handlers (called from folder.service.ts)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Called when a new folder is created
 * Sets the initial path for the folder
 */
export async function onFolderCreated(folderId: string): Promise<void> {
  try {
    const path = await computeFolderPath(folderId);
    await prisma.folder.update({
      where: { id: folderId },
      data: { path },
    });
    console.log(`[FOLDER-PATH] Set path for new folder: ${path}`);
  } catch (error) {
    console.error(`[FOLDER-PATH] Error setting path for folder ${folderId}:`, error);
  }
}

/**
 * Called when a folder is renamed
 * Updates the path for the folder and all its descendants
 */
export async function onFolderRenamed(folderId: string): Promise<void> {
  try {
    const updatedCount = await updateFolderAndDescendants(folderId);
    console.log(`[FOLDER-PATH] Updated ${updatedCount} folder(s) after rename`);
  } catch (error) {
    console.error(`[FOLDER-PATH] Error updating paths after rename for ${folderId}:`, error);
  }
}

/**
 * Called when a folder is moved to a new parent
 * Updates the path for the folder and all its descendants
 */
export async function onFolderMoved(folderId: string): Promise<void> {
  try {
    const updatedCount = await updateFolderAndDescendants(folderId);
    console.log(`[FOLDER-PATH] Updated ${updatedCount} folder(s) after move`);
  } catch (error) {
    console.error(`[FOLDER-PATH] Error updating paths after move for ${folderId}:`, error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Initialization Functions (for migration scripts)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Initialize paths for all folders in the database
 * Used for one-time migration
 */
export async function initializeAllFolderPaths(): Promise<number> {
  console.log('[FOLDER-PATH] Initializing all folder paths...');

  // Get all root folders (no parent)
  const rootFolders = await prisma.folder.findMany({
    where: { parentFolderId: null },
    select: { id: true },
  });

  let totalUpdated = 0;

  for (const folder of rootFolders) {
    totalUpdated += await updateFolderAndDescendants(folder.id);
  }

  console.log(`[FOLDER-PATH] Initialized ${totalUpdated} folder paths`);
  return totalUpdated;
}

/**
 * Initialize paths for all folders belonging to a specific user
 */
export async function initializeUserFolderPaths(userId: string): Promise<number> {
  console.log(`[FOLDER-PATH] Initializing folder paths for user ${userId}...`);

  // Get user's root folders
  const rootFolders = await prisma.folder.findMany({
    where: {
      userId,
      parentFolderId: null,
    },
    select: { id: true },
  });

  let totalUpdated = 0;

  for (const folder of rootFolders) {
    totalUpdated += await updateFolderAndDescendants(folder.id);
  }

  console.log(`[FOLDER-PATH] Initialized ${totalUpdated} folder paths for user ${userId}`);
  return totalUpdated;
}

// ═══════════════════════════════════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the full path for a folder (uses cached path if available)
 */
export async function getFolderPath(folderId: string): Promise<string> {
  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    select: { path: true },
  });

  if (folder?.path) {
    return folder.path;
  }

  // Fallback: compute path if not cached
  return computeFolderPath(folderId);
}

export default {
  onFolderCreated,
  onFolderRenamed,
  onFolderMoved,
  initializeAllFolderPaths,
  initializeUserFolderPaths,
  getFolderPath,
};
