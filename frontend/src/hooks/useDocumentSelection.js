import { useState, useCallback, useMemo } from 'react';

/**
 * Hook for managing document and folder selection state
 * Used in category and folder views for multi-select functionality
 */
export function useDocumentSelection() {
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedDocuments, setSelectedDocuments] = useState(new Set());
  const [selectedFolders, setSelectedFolders] = useState(new Set());

  const toggleSelectMode = useCallback(() => {
    setIsSelectMode(prev => {
      const newMode = !prev;
      // Clear selection when exiting select mode
      if (!newMode) {
        setSelectedDocuments(new Set());
        setSelectedFolders(new Set());
      }
      return newMode;
    });
  }, []);

  const toggleDocument = useCallback((documentId) => {
    setSelectedDocuments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(documentId)) {
        newSet.delete(documentId);
      } else {
        newSet.add(documentId);
      }
      return newSet;
    });
  }, []);

  const toggleFolder = useCallback((folderId) => {
    setSelectedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(folderId)) {
        newSet.delete(folderId);
      } else {
        newSet.add(folderId);
      }
      return newSet;
    });
  }, []);

  const selectAll = useCallback((documentIds) => {
    setSelectedDocuments(new Set(documentIds));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedDocuments(new Set());
    setSelectedFolders(new Set());
  }, []);

  const isSelected = useCallback((documentId) => {
    return selectedDocuments.has(documentId);
  }, [selectedDocuments]);

  const isFolderSelected = useCallback((folderId) => {
    return selectedFolders.has(folderId);
  }, [selectedFolders]);

  const totalSelected = useMemo(() => {
    return selectedDocuments.size + selectedFolders.size;
  }, [selectedDocuments, selectedFolders]);

  return {
    isSelectMode,
    selectedDocuments,
    selectedFolders,
    toggleSelectMode,
    toggleDocument,
    toggleFolder,
    selectAll,
    clearSelection,
    isSelected,
    isFolderSelected,
    totalSelected
  };
}
