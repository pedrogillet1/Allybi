import { useCallback } from 'react';
import { useDocuments } from '../context/DocumentsContext';
import { useNotifications } from '../context/NotificationsStore';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

/**
 * UNIVERSAL Category Move Hook
 *
 * This is the SINGLE source of truth for all move operations across the app.
 * Provides consistent move logic for documents and folders.
 *
 * Standard behaviors:
 * - Uses optimistic updates via DocumentsContext
 * - Handles bulk document moves with Promise.all
 * - Shows appropriate toast messages
 * - Handles errors with rollback
 * - Returns success/failure status
 *
 * @returns {object} Hook functions and utilities
 */
export function useCategoryMove() {
  const { moveToFolder, createFolder, getRootFolders } = useDocuments();
  const { showSuccess, showError } = useNotifications();
  const { t } = useTranslation();

  /**
   * Move multiple documents to a category
   * @param {string[]} documentIds - Array of document IDs to move
   * @param {string} categoryId - Target category ID
   * @returns {Promise<void>}
   */
  const moveDocumentsToCategory = useCallback(async (documentIds, categoryId) => {
    if (!documentIds || documentIds.length === 0 || !categoryId) {
      throw new Error('Invalid arguments: documentIds and categoryId are required');
    }

    try {
      // Use Promise.all for concurrent moves (optimistic updates handle instant UI)
      await Promise.all(
        documentIds.map(docId => moveToFolder(docId, categoryId))
      );

      // Show success toast
      if (documentIds.length === 1) {
        showSuccess(t('toasts.fileMovedSuccessfully'));
      } else {
        showSuccess(t('toasts.filesMovedSuccessfully', { count: documentIds.length }));
      }

      return { success: true };
    } catch (error) {
      console.error('Error moving documents to category:', error);
      showError(t('toasts.failedToAddDocumentsToCategory'));
      throw error;
    }
  }, [moveToFolder, showSuccess, showError, t]);

  /**
   * Move a single document to a category
   * @param {string} documentId - Document ID to move
   * @param {string} categoryId - Target category ID
   * @returns {Promise<void>}
   */
  const moveDocumentToCategory = useCallback(async (documentId, categoryId) => {
    return moveDocumentsToCategory([documentId], categoryId);
  }, [moveDocumentsToCategory]);

  /**
   * Move a folder to another category (change parent folder)
   * @param {string} folderId - Folder ID to move
   * @param {string} newParentId - New parent folder ID
   * @returns {Promise<void>}
   */
  const moveFolderToCategory = useCallback(async (folderId, newParentId) => {
    if (!folderId || !newParentId) {
      throw new Error('Invalid arguments: folderId and newParentId are required');
    }

    try {
      // PATCH the folder's parentFolderId
      await api.patch(`/api/folders/${folderId}`, {
        parentId: newParentId
      });

      showSuccess(t('toasts.folderMovedSuccessfully'));
      return { success: true };
    } catch (error) {
      console.error('Error moving folder to category:', error);
      showError(t('toasts.failedToMoveFolder'));
      throw error;
    }
  }, [showSuccess, showError, t]);

  /**
   * Create a new category and optionally move documents to it
   * @param {string} name - Category name
   * @param {string} emoji - Category emoji
   * @param {string[]} documentIds - Optional array of document IDs to move
   * @returns {Promise<object>} Created folder object
   */
  const createCategoryAndMove = useCallback(async (name, emoji, documentIds = []) => {
    if (!name || !emoji) {
      throw new Error('Invalid arguments: name and emoji are required');
    }

    try {
      // Create folder (parentFolderId = null for root categories)
      const newFolder = await createFolder(name, emoji, null);

      // Move documents if provided
      if (documentIds.length > 0) {
        await Promise.all(
          documentIds.map(docId => moveToFolder(docId, newFolder.id))
        );

        if (documentIds.length === 1) {
          showSuccess(t('toasts.categoryCreatedAndFileAdded'));
        } else {
          showSuccess(t('toasts.categoryCreatedAndFilesAdded', { count: documentIds.length }));
        }
      } else {
        showSuccess(t('toasts.categoryCreatedSuccessfully'));
      }

      return newFolder;
    } catch (error) {
      console.error('Error creating category:', error);
      showError(t('toasts.failedToCreateCategory'));
      throw error;
    }
  }, [createFolder, moveToFolder, showSuccess, showError, t]);

  /**
   * Get available categories for selection
   * Excludes system folders like "recently added"
   * @returns {Array} Filtered root categories
   */
  const getAvailableCategories = useCallback(() => {
    const rootFolders = getRootFolders();

    // Filter out system folders (case-insensitive)
    return rootFolders.filter(folder => {
      const name = folder.name.toLowerCase();
      return name !== 'recently added' &&
             name !== 'recent' &&
             name !== 'recents';
    });
  }, [getRootFolders]);

  /**
   * Check if a folder is a system folder
   * @param {object} folder - Folder object
   * @returns {boolean}
   */
  const isSystemFolder = useCallback((folder) => {
    if (!folder) return false;
    const name = folder.name.toLowerCase();
    return name === 'recently added' ||
           name === 'recent' ||
           name === 'recents';
  }, []);

  return {
    // Move operations
    moveDocumentsToCategory,
    moveDocumentToCategory,
    moveFolderToCategory,
    createCategoryAndMove,

    // Utility functions
    getAvailableCategories,
    isSystemFolder
  };
}
