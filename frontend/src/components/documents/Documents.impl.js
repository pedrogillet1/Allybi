import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ROUTES, buildRoute } from '../../constants/routes';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import cleanDocumentName from '../../utils/cleanDocumentName';
import { useAuth } from '../../context/AuthContext';
import { useDocuments } from '../../context/DocumentsContext';
import { useDocumentSelection } from '../../hooks/useDocumentSelection';
import { useNotifications } from '../../context/NotificationsStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useSemanticSearch } from '../../hooks/useSemanticSearch';
import LeftNav from '../app-shell/LeftNav';
import NotificationPanel from '../notifications/NotificationPanel';
import CreateCategoryModal from '../library/CreateCategoryModal';
import EditCategoryModal from '../library/EditCategoryModal';
import UploadModal from '../upload/UploadModal';
import UniversalUploadModal from '../upload/UniversalUploadModal';
import DeleteConfirmationModal from '../library/DeleteConfirmationModal';
import RenameModal from '../library/RenameModal';
import MoveToCategoryModal from '../library/MoveToCategoryModal';
import { ReactComponent as SmoothCorner } from '../../assets/smoothinnercorner.svg';
import { ReactComponent as SmoothCorner2 } from '../../assets/smoothinnercorner2.svg';
import { ReactComponent as ArrowIcon } from '../../assets/arrow-narrow-right.svg';
import { ReactComponent as TimeIcon } from '../../assets/Time square.svg';
import { ReactComponent as SearchIcon } from '../../assets/Search.svg';
import { ReactComponent as UploadIcon } from '../../assets/upload.svg';
import { ReactComponent as Document2Icon } from '../../assets/Document 2.svg';
import { ReactComponent as ImageIcon } from '../../assets/Image.svg';
import { ReactComponent as InfoCircleIcon } from '../../assets/Info circle.svg';
import { ReactComponent as SpreadsheetIcon } from '../../assets/spreadsheet.svg';
import { ReactComponent as TrashCanIcon } from '../../assets/Trash can.svg';
import { ReactComponent as TrashCanLightIcon } from '../../assets/Trash can.svg';
import { ReactComponent as EditIcon } from '../../assets/Edit 5.svg';
import { ReactComponent as DownloadIcon } from '../../assets/download.svg';
import { ReactComponent as AddIcon } from '../../assets/add.svg';
import { ReactComponent as CloseIcon } from '../../assets/x-close.svg';
import { ReactComponent as DotsIcon } from '../../assets/dots.svg';
import logoSvg from '../../assets/logo.svg';
import sphereIcon from '../../assets/sphere.svg';
import kodaLogo from '../../assets/koda-logo_1.svg';
import logoCopyWhite from '../../assets/Logo copy.svg';
import filesIcon from '../../assets/files-icon.svg';
import { getCategoriesWithCounts, createCategory, deleteCategory, addDocumentToCategory } from '../../utils/files/categoryManager';
import api from '../../services/api';
import chatService from '../../services/chatService';
import CategoryIcon from '../library/CategoryIcon';
import FileBreakdownDonut from '../shared/FileBreakdownDonut';
import SmartCategoriesCard from '../home/SmartCategoriesCard';
import IntegrationsCard from '../home/IntegrationsCard';
import FileInsightsCard from '../home/FileInsightsCard';
import RecentlyAddedCard from '../home/RecentlyAddedCard';
import ContinueCard from '../home/ContinueCard';
import HomeTour from '../onboarding/HomeTour';
import pdfIcon from '../../assets/pdf-icon.png';
import docIcon from '../../assets/doc-icon.png';
import txtIcon from '../../assets/txt-icon.png';
import xlsIcon from '../../assets/xls.png';
import jpgIcon from '../../assets/jpg-icon.png';
import pngIcon from '../../assets/png-icon.png';
import pptxIcon from '../../assets/pptx.png';
import folderIcon from '../../assets/folder_icon.svg';
import movIcon from '../../assets/mov.png';
import mp4Icon from '../../assets/mp4.png';
import mp3Icon from '../../assets/mp3.svg';

const Documents = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { showSuccess, showError } = useNotifications();
  const isMobile = useIsMobile();

  // Use DocumentsContext for instant updates
  const {
    documents: contextDocuments,
    folders: contextFolders,
    recentDocuments,
    loading,
    deleteDocument,
    renameDocument,
    moveToFolder,
    createFolder,
    deleteFolder,
    getRootFolders,
    getDocumentCountByFolder,
    getFileBreakdown,
    refreshAll
  } = useDocuments();

  // Local UI state only
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Semantic search hook
  const {
    query: semanticQuery,
    setQuery: setSemanticQuery,
    results: semanticResults,
    isSearching,
    error: searchError
  } = useSemanticSearch(300);

  const [showNotificationsPopup, setShowNotificationsPopup] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState(null);
  const [dropdownDirection, setDropdownDirection] = useState('down'); // 'up' or 'down'
  const dropdownRefs = useRef({});
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [selectedDocumentForCategory, setSelectedDocumentForCategory] = useState(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  // Combined state for category menu - stores both ID and position together
  const [categoryMenu, setCategoryMenu] = useState({ id: null, top: 0, left: 0 });
  // Legacy aliases for compatibility
  const categoryMenuOpen = categoryMenu.id;
  const categoryMenuPosition = { top: categoryMenu.top, left: categoryMenu.left };
  const setCategoryMenuOpen = (id) => setCategoryMenu(prev => id === null ? { id: null, top: 0, left: 0 } : { ...prev, id });
  const setCategoryMenuPosition = (pos) => setCategoryMenu(prev => ({ ...prev, ...pos }));
  const [editingCategory, setEditingCategory] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadCategoryId, setUploadCategoryId] = useState(null);
  const [showUniversalUploadModal, setShowUniversalUploadModal] = useState(false);
  const [showCreateFromMoveModal, setShowCreateFromMoveModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [itemToRename, setItemToRename] = useState(null);
  const [droppedFiles, setDroppedFiles] = useState(null);
  const [movingFromCategoryId, setMovingFromCategoryId] = useState(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [categoriesRefreshKey, setCategoriesRefreshKey] = useState(0);
  const [dragOverCategoryId, setDragOverCategoryId] = useState(null);

  // Sorting state for Your Files table
  const [sortColumn, setSortColumn] = useState('date'); // 'name', 'type', 'size', 'date'
  const [sortDirection, setSortDirection] = useState('desc'); // 'asc' or 'desc'

  // Multi-select functionality
  const {
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
  } = useDocumentSelection();

  // Force re-render when contextFolders changes
  useEffect(() => {
    setCategoriesRefreshKey(prev => prev + 1);
  }, [contextFolders]);

  // Compute categories from context folders (auto-updates!)
  const categories = (getRootFolders() || [])
    .filter(folder => folder.name.toLowerCase() !== 'recently added')
    .map(folder => {
      return {
        id: folder.id,
        name: folder.name,
        emoji: folder.emoji || '__FOLDER_SVG__',
        fileCount: getDocumentCountByFolder(folder.id),
        folderCount: folder._count?.subfolders || 0,
        count: getDocumentCountByFolder(folder.id)
      };
    });

  // All folders for search (auto-updates!)
  const allFolders = useMemo(() => {
    return (contextFolders || [])
      .filter(folder => folder.name.toLowerCase() !== 'recently added')
      .map(folder => ({
        id: folder.id,
        name: folder.name,
        emoji: folder.emoji || null,
        parentFolderId: folder.parentFolderId
      }));
  }, [contextFolders]);

  // File breakdown data (auto-updates!)
  const { fileData, totalFiles } = useMemo(() => {
    const formatBytes = (bytes) => {
      if (bytes === 0) return '0 B';
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(1024));
      return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    };

    // Calculate breakdown by type with sizes
    const breakdown = {
      spreadsheet: { count: 0, size: 0 },
      document: { count: 0, size: 0 },
      image: { count: 0, size: 0 },
      other: { count: 0, size: 0 }
    };

    contextDocuments.forEach(doc => {
      // Safely get filename
      const filename = (doc.filename || doc.name || '').toLowerCase();
      const mimeType = doc.mimeType || '';
      const size = doc.fileSize || 0;

      if (!filename) {
        breakdown.other.count++;
        breakdown.other.size += size;
        return;
      }

      // Check for Excel/Spreadsheet files (by MIME type or extension)
      if (mimeType.includes('sheet') || mimeType.includes('excel') || filename.match(/\.(xls|xlsx|csv)$/)) {
        breakdown.spreadsheet.count++;
        breakdown.spreadsheet.size += size;
      } else if (filename.match(/\.(pdf|doc|docx|rtf|odt)$/)) {
        breakdown.document.count++;
        breakdown.document.size += size;
      } else if (filename.match(/\.(jpg|jpeg|png|gif|bmp|svg|webp)$/)) {
        breakdown.image.count++;
        breakdown.image.size += size;
      } else {
        breakdown.other.count++;
        breakdown.other.size += size;
      }
    });

    return {
      fileData: [
        { name: 'Spreadsheet', value: breakdown.spreadsheet.count, color: '#181818', size: formatBytes(breakdown.spreadsheet.size) },
        { name: 'Document', value: breakdown.document.count, color: '#000000', size: formatBytes(breakdown.document.size) },
        { name: 'Image', value: breakdown.image.count, color: '#A8A8A8', size: formatBytes(breakdown.image.size) },
        { name: 'Other', value: breakdown.other.count, color: '#D9D9D9', size: formatBytes(breakdown.other.size) }
      ],
      totalFiles: contextDocuments.length
    };
  }, [contextDocuments]);

  // Refs to track current state for event listener (avoids stale closures)
  const openDropdownIdRef = useRef(openDropdownId);
  const categoryMenuRef = useRef(categoryMenu);

  // Keep refs in sync with state
  useEffect(() => {
    openDropdownIdRef.current = openDropdownId;
  }, [openDropdownId]);

  useEffect(() => {
    categoryMenuRef.current = categoryMenu;
  }, [categoryMenu]);

  // Close dropdown when clicking outside - attached ONCE on mount
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Use refs to get current state values (avoids stale closures)
      if (openDropdownIdRef.current && !event.target.closest('[data-dropdown]')) {
        setOpenDropdownId(null);
      }
      if (categoryMenuRef.current.id && !event.target.closest('[data-category-menu]')) {
        setCategoryMenu({ id: null, top: 0, left: 0 });
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []); // Empty array - listener attached ONCE, uses refs for current state

  // ⌘K keyboard shortcut to focus search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.querySelector('[data-page="documents"] input[type="text"]');
        if (searchInput) searchInput.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Refresh data when component mounts or becomes visible
  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // INSTANT UPDATE: Create category
  const handleCreateCategory = async (category) => {
    try {
      console.log('Creating category with:', category);

      // Create folder (UI updates INSTANTLY via context!)
      const newFolder = await createFolder(category.name, category.emoji);
      console.log('New folder created:', newFolder);

      // If documents were selected, move them to the folder (INSTANT updates!)
      if (category.selectedDocuments && category.selectedDocuments.length > 0) {
        console.log('Moving documents to folder:', category.selectedDocuments);
        await Promise.all(
          category.selectedDocuments.map(docId =>
            moveToFolder(docId, newFolder.id)
          )
        );
        console.log('Documents moved successfully');
      }
      // No manual refresh needed - context auto-updates everywhere!
    } catch (error) {
      console.error('Error creating folder:', error);
      showError(t('toasts.failedToCreateCategory'));
    }
  };

  // INSTANT UPDATE: Delete category
  const handleDeleteCategory = async (categoryId) => {
    try {
      // Delete folder (UI updates INSTANTLY via context!)
      await deleteFolder(categoryId);
      // No manual state update needed!
      showSuccess(t('toasts.folderDeleted'));
    } catch (error) {
      console.error('Error deleting folder:', error);
      const errorMessage = error.response?.data?.error || error.message || t('toasts.failedToDeleteFolder');
      showError(errorMessage);
    }
  };

  // Handle document download
  const handleDownload = async (doc) => {
    try {
      const response = await api.get(`/api/documents/${doc.id}/stream?download=true`, {
        responseType: 'blob'
      });

      // Use the blob directly from response (already has correct mime type)
      const url = window.URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setOpenDropdownId(null);
    } catch (error) {
      console.error('Error downloading document:', error);
      showError(t('toasts.failedToDownloadDocument'));
    }
  };

  // Handle document rename
  const handleRename = (doc) => {
    setItemToRename({ type: 'document', id: doc.id, name: doc.filename });
    setShowRenameModal(true);
    setOpenDropdownId(null);
  };

  // Handle rename confirmation from modal
  const handleRenameConfirm = async (newName) => {
    if (!itemToRename) return;

    try {
      if (itemToRename.type === 'document') {
        // Rename document (UI updates INSTANTLY via context!)
        await renameDocument(itemToRename.id, newName);
      }

      setShowRenameModal(false);
      setItemToRename(null);
    } catch (error) {
      console.error('Error renaming:', error);
      showError(t('alerts.failedToRenameItem', { type: itemToRename.type }));
    }
  };

  // INSTANT UPDATE: Delete document with proper error handling
  const handleDelete = async (docId) => {
    try {
      // Delete document (UI updates INSTANTLY via context with optimistic update!)
      const result = await deleteDocument(docId);

      // Show success message only after successful delete
      if (result && result.success) {
        showSuccess(t('toasts.fileDeleted'));
      }

      setOpenDropdownId(null);
    } catch (error) {
      console.error('❌ Error deleting document:', error);

      // Show user-friendly error message
      const errorMessage = error.filename
        ? t('toasts.failedToDeleteFile', { name: error.filename, error: error.message })
        : t('toasts.failedToDeleteDocument', { error: error.message });

      showError(errorMessage);
    }
  };

  // Handle add to category
  const handleAddToCategory = async (doc) => {
    console.log('handleAddToCategory called for doc:', doc);
    setSelectedDocumentForCategory(doc);
    // Use context folders instead of fetching
    const rootFolders = getRootFolders().filter(f => f.name.toLowerCase() !== 'recently added');
    console.log('Root folders loaded from context:', rootFolders);
    setShowCategoryModal(true);
    console.log('Modal should be showing now');
    setOpenDropdownId(null);
  };

  // INSTANT UPDATE: Move document to category
  const handleCategorySelection = async () => {
    if (!selectedCategoryId) return;

    // Close modal IMMEDIATELY for snappy UX (optimistic update handles the rest)
    const categoryId = selectedCategoryId;
    const docForCategory = selectedDocumentForCategory;
    const docsToMove = isSelectMode ? Array.from(selectedDocuments) : null;
    const foldersToMove = isSelectMode ? Array.from(selectedFolders) : [];
    const moveCount = totalSelected;

    setShowCategoryModal(false);
    setSelectedDocumentForCategory(null);
    setSelectedCategoryId(null);

    try {
      // Handle bulk move when in select mode
      if (isSelectMode && (docsToMove?.length > 0 || foldersToMove.length > 0)) {
        await Promise.all([
          ...(docsToMove || []).map(docId => moveToFolder(docId, categoryId)),
          ...foldersToMove.map(folderId => api.patch(`/api/folders/${folderId}`, { parentId: categoryId })),
        ]);
        showSuccess(t('toasts.filesMovedSuccessfully', { count: moveCount }));
        clearSelection();
        toggleSelectMode();
        refreshAll();
      } else if (docForCategory) {
        // Move single document to folder (UI updates INSTANTLY via context!)
        moveToFolder(docForCategory.id, categoryId);
        showSuccess(t('toasts.fileMovedSuccessfully'));
      }
    } catch (error) {
      console.error('Error adding document to category:', error);
      showError(t('toasts.failedToAddDocumentsToCategory'));
    }
  };

  // Handle create category from move modal
  const handleCreateCategoryFromMove = async (category) => {
    // Capture state before closing modals
    const docsToMove = isSelectMode ? Array.from(selectedDocuments) : null;
    const foldersToMove = isSelectMode ? Array.from(selectedFolders) : [];
    const moveCount = totalSelected;
    const docForCategory = selectedDocumentForCategory;

    // Close both modals IMMEDIATELY for snappy UX
    setShowCreateFromMoveModal(false);
    setShowCategoryModal(false);
    setSelectedDocumentForCategory(null);
    setSelectedCategoryId(null);

    try {
      // Create folder
      const newFolder = await createFolder(category.name, category.emoji);

      // Handle bulk move when in select mode
      if (isSelectMode && (docsToMove?.length > 0 || foldersToMove.length > 0)) {
        await Promise.all([
          ...(docsToMove || []).map(docId => moveToFolder(docId, newFolder.id)),
          ...foldersToMove.map(folderId => api.patch(`/api/folders/${folderId}`, { parentId: newFolder.id })),
        ]);
        showSuccess(t('toasts.filesMovedSuccessfully', { count: moveCount }));
        clearSelection();
        toggleSelectMode();
        refreshAll();
      } else if (docForCategory) {
        // Move single document to the new folder
        moveToFolder(docForCategory.id, newFolder.id);
        showSuccess(t('toasts.fileMovedSuccessfully'));
      }
    } catch (error) {
      console.error('Error creating category from move:', error);
      showError(t('toasts.failedToCreateCategory'));
    }
  };

  // Sync search query with semantic search
  useEffect(() => {
    setSemanticQuery(searchQuery);
  }, [searchQuery, setSemanticQuery]);

  // Filter documents and folders based on search query (auto-updates!)
  // Hybrid approach: Combine semantic search results with filename matching
  const filteredDocuments = useMemo(() => {
    if (!searchQuery) {
      return contextDocuments || [];
    }

    // Filename-based filtering
    const filenameMatches = (contextDocuments || []).filter(doc =>
      doc.filename?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // If we have semantic search results, merge them
    if (semanticResults && semanticResults.length > 0) {
      // Create a map of semantic results by ID for quick lookup
      const semanticMap = new Map(semanticResults.map(result => [result.id, result]));

      // Combine both result sets, preferring semantic search order for matches
      const combinedIds = new Set();
      const combined = [];

      // First, add semantic search results (ordered by relevance)
      semanticResults.forEach(result => {
        const doc = contextDocuments.find(d => d.id === result.id);
        if (doc && !combinedIds.has(doc.id)) {
          combined.push({ ...doc, searchScore: result.score, matchedContent: result.matchedContent });
          combinedIds.add(doc.id);
        }
      });

      // Then add filename matches that weren't in semantic results
      filenameMatches.forEach(doc => {
        if (!combinedIds.has(doc.id)) {
          combined.push(doc);
          combinedIds.add(doc.id);
        }
      });

      return combined;
    }

    // Fallback to filename matching only
    return filenameMatches;
  }, [contextDocuments, searchQuery, semanticResults]);

  const filteredFolders = useMemo(() => {
    return allFolders.filter(folder =>
      folder.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [allFolders, searchQuery]);

  // Handle page-level file drop
  const handlePageDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    const files = Array.from(e.dataTransfer.files);
    console.log('📁 Documents (Home) - Files dropped:', files);
    console.log('📁 File count:', files.length);
    if (files.length > 0) {
      // Set both states together using functional updates to ensure they batch correctly
      setDroppedFiles(files);
      // Use setTimeout to ensure the files state is set before opening modal
      setTimeout(() => {
        setShowUniversalUploadModal(true);
        console.log('📁 Modal opened with files');
      }, 0);
    }
  }, []);

  const handlePageDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Only show upload overlay for external file drags, not internal document drags
    const hasFiles = e.dataTransfer.types.includes('Files');
    setIsDraggingOver(hasFiles);
  };

  const handlePageDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  // ✅ Show loading skeleton during initial data fetch
  if (loading && contextDocuments.length === 0 && contextFolders.length === 0) {
    return <DocumentsSkeleton />;
  }

  return (
    <div data-page="documents" className="documents-page" style={{
      width: '100%',
      height: isMobile ? 'auto' : '100%',
      minHeight: '100vh',
      background: '#F1F0EF',
      overflow: isMobile ? 'visible' : 'hidden',
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row'
    }}>
      <LeftNav onNotificationClick={() => setShowNotificationsPopup(true)} />

      {/* Main Content */}
      <div
        style={{flex: 1, height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative', overflowX: 'hidden', maxWidth: '100%'}}
        onDrop={handlePageDrop}
        onDragOver={handlePageDragOver}
        onDragLeave={handlePageDragLeave}
      >
        {/* Header - Title Row */}
        <div style={{minHeight: isMobile ? 56 : 72, paddingLeft: isMobile ? 16 : 48, paddingRight: isMobile ? 16 : 48, paddingTop: isMobile ? 'max(env(safe-area-inset-top), 0px)' : 0, paddingBottom: 0, background: 'white', borderBottom: '1px #E6E6EC solid', display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexShrink: 0}}>
          {isSelectMode ? (
            <>
              {/* Left: Back arrow + Documents title */}
              <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
                <button
                  onClick={() => navigate(-1)}
                  style={{
                    width: 40,
                    height: 40,
                    background: '#F3F4F6',
                    border: '1px solid #E5E7EB',
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    padding: 0
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#E5E7EB';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#F3F4F6';
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12.5 15L7.5 10L12.5 5" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <h1 style={{
                  fontSize: 32,
                  fontWeight: '600',
                  color: '#111827',
                  fontFamily: 'Plus Jakarta Sans',
                  margin: 0,
                  textShadow: '0 4px 8px rgba(0, 0, 0, 0.12), 0 2px 4px rgba(0, 0, 0, 0.08)'
                }}>
                  Documents
                </h1>
              </div>
            </>
          ) : (
            <h1 style={{color: '#32302C', fontSize: isMobile ? 18 : 20, fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 600, lineHeight: isMobile ? '24px' : '30px', margin: 0, flex: 1, letterSpacing: '-0.01em'}}>
              {t('documents.welcomeBack', { name: user && (user.firstName || user.lastName) ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : user?.email?.split('@')[0] || t('common.user') })}
            </h1>
          )}
          <div style={{display: isMobile && !isSelectMode ? 'none' : 'flex', alignItems: 'center', gap: 12}}>
            {isSelectMode ? (
              <>
                {/* Delete Button - Red style matching FileTypeDetail */}
                <button
                  onClick={() => {
                    if (totalSelected === 0) return;
                    setItemToDelete({
                      type: 'bulk',
                      documentIds: Array.from(selectedDocuments),
                      folderIds: Array.from(selectedFolders),
                      count: totalSelected,
                      name: `${totalSelected} item${totalSelected > 1 ? 's' : ''}`
                    });
                    setShowDeleteModal(true);
                  }}
                  disabled={totalSelected === 0}
                  style={{
                    height: 42,
                    paddingLeft: 18,
                    paddingRight: 18,
                    background: totalSelected > 0 ? '#FEE2E2' : '#F5F5F5',
                    borderRadius: 100,
                    border: '1px solid #E6E6EC',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: totalSelected > 0 ? 'pointer' : 'not-allowed',
                    opacity: totalSelected > 0 ? 1 : 0.5,
                    whiteSpace: 'nowrap'
                  }}
                >
                  <TrashCanLightIcon style={{ width: 18, height: 18 }} />
                  <span style={{ color: '#D92D20', fontSize: 15, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', whiteSpace: 'nowrap' }}>
                    {t('common.delete')}{totalSelected > 0 ? ` (${totalSelected})` : ''}
                  </span>
                </button>

                {/* Move Button - White style matching FileTypeDetail */}
                <button
                  onClick={() => {
                    if (totalSelected === 0) return;
                    setShowCategoryModal(true);
                  }}
                  disabled={totalSelected === 0}
                  style={{
                    height: 42,
                    paddingLeft: 18,
                    paddingRight: 18,
                    background: 'white',
                    borderRadius: 100,
                    border: '1px solid #E6E6EC',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: totalSelected > 0 ? 'pointer' : 'not-allowed',
                    opacity: totalSelected > 0 ? 1 : 0.5,
                    whiteSpace: 'nowrap'
                  }}
                >
                  <AddIcon style={{ width: 18, height: 18, filter: 'brightness(0) invert(0.2)' }} />
                  <span style={{ color: '#32302C', fontSize: 15, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', whiteSpace: 'nowrap' }}>
                    {t('common.move')}{totalSelected > 0 ? ` (${totalSelected})` : ''}
                  </span>
                </button>

                {/* Cancel Button - Text style matching FileTypeDetail */}
                <button
                  onClick={() => {
                    clearSelection();
                    toggleSelectMode();
                  }}
                  style={{
                    height: 42,
                    paddingLeft: 18,
                    paddingRight: 18,
                    background: 'white',
                    borderRadius: 100,
                    border: '1px solid #E6E6EC',
                    cursor: 'pointer',
                    fontFamily: 'Plus Jakarta Sans',
                    fontWeight: '600',
                    fontSize: 15,
                    color: '#111827',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {t('common.cancel')}
                </button>
              </>
            ) : (
              <>
                <div
                  data-tour="search"
                  style={{
                    position: 'relative',
                    height: 44,
                    display: 'flex',
                    alignItems: 'center',
                    flex: isMobile ? 1 : 'none',
                    marginLeft: 0,
                    transition: 'transform 0.15s ease',
                    cursor: 'text',
                    zIndex: searchQuery ? 9999 : 'auto'
                  }}
                  onMouseEnter={(e) => { if (!isMobile) e.currentTarget.style.transform = 'scale(1.02)'; }}
                  onMouseLeave={(e) => { if (!isMobile) e.currentTarget.style.transform = 'scale(1)'; }}
                >
                  <SearchIcon style={{position: 'absolute', left: 16, width: 20, height: 20, zIndex: 1, filter: 'brightness(0) invert(0.2)'}} aria-hidden="true" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('common.search')}
                    aria-label={t('common.search')}
                    style={{
                      height: '100%',
                      width: isMobile ? '100%' : 'auto',
                      minWidth: isMobile ? 'auto' : 360,
                      paddingLeft: 46,
                      paddingRight: isMobile ? 16 : 56,
                      background: '#F5F5F5',
                      borderRadius: 100,
                      border: '1px #E6E6EC solid',
                      outline: 'none',
                      color: '#32302C',
                      fontSize: 16,
                      fontFamily: 'Plus Jakarta Sans',
                      fontWeight: '500',
                      lineHeight: '24px',
                      transition: 'box-shadow 0.15s ease, border-color 0.15s ease'
                    }}
                    onFocus={(e) => { e.target.style.boxShadow = '0 0 0 2px rgba(50, 48, 44, 0.1)'; e.target.style.borderColor = '#A2A2A7'; }}
                    onBlur={(e) => { e.target.style.boxShadow = 'none'; e.target.style.borderColor = '#E6E6EC'; }}
                  />
                  {/* Keyboard shortcut hint */}
                  {!isMobile && !searchQuery && (
                    <span style={{
                      position: 'absolute',
                      right: 16,
                      fontSize: 12,
                      fontFamily: 'Plus Jakarta Sans',
                      fontWeight: '500',
                      color: '#A2A2A7',
                      background: '#ECECEC',
                      padding: '2px 8px',
                      borderRadius: 6,
                      pointerEvents: 'none',
                      userSelect: 'none',
                      lineHeight: '18px',
                      letterSpacing: '0.5px'
                    }}>
                      ⌘K
                    </span>
                  )}

              {/* Search Results Dropdown */}
              {searchQuery && (
                <div style={{
                  position: 'absolute',
                  top: 60,
                  left: 0,
                  right: 0,
                  minWidth: 400,
                  maxHeight: 400,
                  background: 'white',
                  borderRadius: 14,
                  border: '1px #E6E6EC solid',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
                  overflowY: 'auto',
                  zIndex: 1000
                }}>
                  {/* Loading State */}
                  {isSearching && (
                    <div style={{padding: 24, textAlign: 'center'}}>
                      <div style={{
                        display: 'inline-block',
                        width: 24,
                        height: 24,
                        border: '3px solid #E6E6EC',
                        borderTop: '3px solid #32302C',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                      }} />
                      <div style={{
                        marginTop: 12,
                        color: '#6C6B6E',
                        fontSize: 14,
                        fontFamily: 'Plus Jakarta Sans',
                        fontWeight: '500'
                      }}>
                        {t('common.searching')}
                      </div>
                    </div>
                  )}

                  {/* Error State - only show if no local results available */}
                  {searchError && !isSearching && filteredFolders.length === 0 && filteredDocuments.length === 0 && (
                    <div style={{padding: 24, textAlign: 'center'}}>
                      <div style={{
                        color: '#EF4444',
                        fontSize: 14,
                        fontFamily: 'Plus Jakarta Sans',
                        fontWeight: '500'
                      }}>
                        {searchError}
                      </div>
                    </div>
                  )}

                  {/* Results - show if we have any local results, regardless of semantic search error */}
                  {!isSearching && (filteredFolders.length > 0 || filteredDocuments.length > 0) ? (
                    <div style={{padding: 8}}>
                      {/* Folders Section */}
                      {filteredFolders.length > 0 && (
                        <>
                          <div style={{
                            padding: '8px 12px',
                            color: '#6C6B6E',
                            fontSize: 12,
                            fontFamily: 'Plus Jakarta Sans',
                            fontWeight: '600',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                          }}>
                            Folders
                          </div>
                          {filteredFolders.map((folder) => (
                            <div
                              key={folder.id}
                              onClick={() => {
                                navigate(buildRoute.folder(folder.id));
                                setSearchQuery('');
                              }}
                              style={{
                                padding: 12,
                                borderRadius: 10,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                cursor: 'pointer',
                                transition: 'background 0.2s ease'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = '#F5F5F5'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            >
                              <div style={{
                                width: 40,
                                height: 40,
                                background: '#F5F5F5',
                                borderRadius: 8,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 20
                              }}>
                                <CategoryIcon emoji={folder.emoji || '__FOLDER_SVG__'} size={20} />
                              </div>
                              <div style={{flex: 1, overflow: 'hidden'}}>
                                <div style={{
                                  color: '#32302C',
                                  fontSize: 14,
                                  fontFamily: 'Plus Jakarta Sans',
                                  fontWeight: '600',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}>
                                  {cleanDocumentName(folder.name)}
                                </div>
                                <div style={{
                                  color: '#6C6B6E',
                                  fontSize: 12,
                                  fontFamily: 'Plus Jakarta Sans',
                                  fontWeight: '400'
                                }}>
                                  Folder
                                </div>
                              </div>
                            </div>
                          ))}
                        </>
                      )}

                      {/* Documents Section */}
                      {filteredDocuments.length > 0 && (
                        <>
                          {filteredFolders.length > 0 && (
                            <div style={{
                              height: 1,
                              background: '#E6E6EC',
                              margin: '8px 0'
                            }} />
                          )}
                          <div style={{
                            padding: '8px 12px',
                            color: '#6C6B6E',
                            fontSize: 12,
                            fontFamily: 'Plus Jakarta Sans',
                            fontWeight: '600',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                          }}>
                            Documents
                          </div>
                          {filteredDocuments.map((doc) => {
                            const getFileIcon = (doc) => {
                              // Prioritize MIME type over file extension (more reliable for encrypted filenames)
                              const mimeType = doc?.mimeType || '';
                              const filename = doc?.filename || '';

                              // DEBUG: Log MIME type and filename for video files
                              if (mimeType.startsWith('video/') || filename.match(/\.(mov|mp4)$/i)) {
                                console.log('🎬 Video file detected:', { filename, mimeType });
                              }

                              // ========== VIDEO FILES ==========
                              // QuickTime videos (.mov) - MUST check before generic video check
                              if (mimeType === 'video/quicktime') {
                                console.log('✅ Returning movIcon for:', filename);
                                return movIcon; // Blue MOV icon
                              }

                              // MP4 videos - specific check only
                              if (mimeType === 'video/mp4') {
                                console.log('✅ Returning mp4Icon for:', filename);
                                return mp4Icon; // Pink MP4 icon
                              }

                              // Other video types - use generic video icon (mp4)
                              if (mimeType.startsWith('video/')) {
                                console.log('⚠️  Generic video type, returning mp4Icon for:', filename, mimeType);
                                return mp4Icon;
                              }

                              // ========== AUDIO FILES ==========
                              if (mimeType.startsWith('audio/') || mimeType === 'audio/mpeg' || mimeType === 'audio/mp3') {
                                return mp3Icon;
                              }

                              // ========== DOCUMENT FILES ==========
                              if (mimeType === 'application/pdf') return pdfIcon;
                              if (mimeType.includes('word') || mimeType.includes('msword')) return docIcon;
                              if (mimeType.includes('sheet') || mimeType.includes('excel')) return xlsIcon;
                              if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return pptxIcon;
                              if (mimeType === 'text/plain' || mimeType === 'text/csv') return txtIcon;

                              // ========== IMAGE FILES ==========
                              if (mimeType.startsWith('image/')) {
                                if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return jpgIcon;
                                if (mimeType.includes('png')) return pngIcon;
                                return pngIcon; // Default for other images
                              }

                              // ========== FALLBACK: Extension-based check ==========
                              // (For files where MIME type is not set or is generic)
                              if (filename) {
                                const ext = filename.toLowerCase();
                                // Documents
                                if (ext.match(/\.(pdf)$/)) return pdfIcon;
                                if (ext.match(/\.(doc|docx)$/)) return docIcon;
                                if (ext.match(/\.(xls|xlsx)$/)) return xlsIcon;
                                if (ext.match(/\.(ppt|pptx)$/)) return pptxIcon;
                                if (ext.match(/\.(txt)$/)) return txtIcon;

                                // Images
                                if (ext.match(/\.(jpg|jpeg)$/)) return jpgIcon;
                                if (ext.match(/\.(png)$/)) return pngIcon;

                                // Videos
                                if (ext.match(/\.(mov)$/)) return movIcon;
                                if (ext.match(/\.(mp4)$/)) return mp4Icon;

                                // Audio
                                if (ext.match(/\.(mp3|wav|aac|m4a)$/)) return mp3Icon;

                                // Adobe Premiere Pro / Video editing files use generic file icon
                                // .prproj, .pek, .cfa - let them fall through to default
                              }

                              // Final fallback - for unknown/binary files (including .prproj, .pek, .cfa)
                              return txtIcon;
                            };

                            return (
                              <div
                                key={doc.id}
                                onClick={() => {
                                  navigate(buildRoute.document(doc.id));
                                  setSearchQuery('');
                                }}
                                style={{
                                  padding: 12,
                                  borderRadius: 10,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 12,
                                  cursor: 'pointer',
                                  transition: 'background 0.2s ease'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = '#F5F5F5'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                              >
                                <div style={{ position: 'relative' }}>
                                  <img
                                    src={getFileIcon(doc)}
                                    alt="File icon"
                                    style={{
                                      width: 40,
                                      height: 40,
                                      aspectRatio: '1/1',
                                      imageRendering: 'auto',
                                      objectFit: 'contain',
                                      shapeRendering: 'geometricPrecision'
                                    }}
                                  />
                                  {/* Processing/Failed badges - HIDDEN: Documents should display normally regardless of status */}
                                  {/* Users don't need to see processing/failed status - files work fine regardless */}
                                </div>
                                <div style={{flex: 1, overflow: 'hidden'}}>
                                  <div style={{
                                    color: '#32302C',
                                    fontSize: 14,
                                    fontFamily: 'Plus Jakarta Sans',
                                    fontWeight: '600',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                  }}>
                                    {cleanDocumentName(doc.filename)}
                                  </div>
                                  <div style={{
                                    color: '#6C6B6E',
                                    fontSize: 12,
                                    fontFamily: 'Plus Jakarta Sans',
                                    fontWeight: '400'
                                  }}>
                                    {(doc.fileSize / 1024 / 1024).toFixed(2)} MB
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </>
                      )}
                    </div>
                  ) : (
                    <div style={{
                      padding: 40,
                      textAlign: 'center',
                      color: '#6C6B6E',
                      fontSize: 14,
                      fontFamily: 'Plus Jakarta Sans'
                    }}>
                      {t('documents.noResultsMatching', { query: searchQuery })}
                    </div>
                  )}
                </div>
              )}
            </div>

                <button
                  data-tour="upload"
                  onClick={() => setShowUniversalUploadModal(true)}
                  aria-label={t('documents.uploadDocument')}
                  style={{height: isMobile ? 44 : 44, width: isMobile ? 44 : 'auto', paddingLeft: isMobile ? 0 : 20, paddingRight: isMobile ? 0 : 20, paddingTop: 0, paddingBottom: 0, background: '#181818', borderRadius: 9999, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', flexShrink: 0, transition: 'background 120ms ease, transform 160ms cubic-bezier(0.2,0.8,0.2,1)', color: 'white'}}
                  onMouseEnter={(e) => { if (!isMobile) { e.currentTarget.style.background = '#0F0F0F'; e.currentTarget.style.transform = 'translateY(-1px)'; }}}
                  onMouseLeave={(e) => { if (!isMobile) { e.currentTarget.style.background = '#181818'; e.currentTarget.style.transform = 'translateY(0)'; }}}
                >
                  <UploadIcon style={{width: 18, height: 18, filter: 'brightness(0) invert(1)'}} aria-hidden="true" />
                  {!isMobile && <span style={{fontSize: 14, fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 600, lineHeight: '20px'}}>Upload</span>}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Mobile Tab Bar - Search + Upload */}
        {isMobile && !isSelectMode && (
          <div style={{
            padding: '12px 16px',
            background: 'white',
            borderBottom: '1px #E6E6EC solid',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexShrink: 0
          }}>
            {/* Search Bar */}
            <div style={{
              flex: 1,
              height: 44,
              paddingLeft: 12,
              paddingRight: 12,
              background: '#F5F5F5',
              borderRadius: 100,
              border: '1px #E6E6EC solid',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <SearchIcon style={{ width: 20, height: 20, flexShrink: 0, filter: 'brightness(0) invert(0.2)' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('common.search')}
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  color: '#32302C',
                  fontSize: 16,
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: '500',
                  lineHeight: '24px'
                }}
              />
            </div>
            {/* Upload Button */}
            <div
              onClick={() => setShowUniversalUploadModal(true)}
              style={{
                height: 44,
                width: 44,
                background: '#F5F5F5',
                borderRadius: 100,
                border: '1px #E6E6EC solid',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              <UploadIcon style={{width: 20, height: 20, filter: 'brightness(0) invert(0.2)'}} />
            </div>
          </div>
        )}

        {/* Scrollable Content */}
        <div className="scrollable-content documents-content" style={{flex: 1, minHeight: 0, padding: isMobile ? 12 : 48, paddingBottom: isMobile ? 'calc(var(--tabbar-h, 70px) + env(safe-area-inset-bottom) + 24px)' : 120, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 24, maxWidth: 1440, margin: '0 auto', width: '100%', boxSizing: 'border-box', WebkitOverflowScrolling: 'touch'}}>

          {/* Row 1: Categories (8col) + Integrations (4col) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr',
            gap: 24,
            alignItems: 'stretch',
          }}>
            <div key={categoriesRefreshKey} style={{ minWidth: 0 }}>
              <SmartCategoriesCard
                categories={categories}
                onCreateCategory={() => setIsModalOpen(true)}
                onEditCategory={(cat) => { setEditingCategory(cat); setShowEditModal(true); }}
                onDeleteCategory={(catId) => { setItemToDelete({ type: 'category', id: catId, name: categories.find(c => c.id === catId)?.name }); setShowDeleteModal(true); }}
                onUploadToCategory={(catId) => { setUploadCategoryId(catId); setShowUniversalUploadModal(true); }}
                onMoveCategoryDocuments={(catId) => {
                  setMovingFromCategoryId(catId);
                  setShowCategoryModal(true);
                }}
                onDownloadCategory={async (cat) => {
                  try {
                    const response = await api.get(`/api/folders/${cat.id}/download`, { responseType: 'blob' });
                    const url = window.URL.createObjectURL(response.data);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `${cat.name}.zip`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    window.URL.revokeObjectURL(url);
                    showSuccess(t('alerts.downloadedFile', { name: cat.name }));
                  } catch (error) {
                    showError(t('alerts.failedToDownload'));
                  }
                }}
                categoryMenuOpen={categoryMenuOpen}
                setCategoryMenuOpen={setCategoryMenuOpen}
                categoryMenuPosition={categoryMenuPosition}
                setCategoryMenuPosition={setCategoryMenuPosition}
                onDragOverCategory={(id) => setDragOverCategoryId(id)}
                onDragLeaveCategory={() => setDragOverCategoryId(null)}
                onDropOnCategory={async (e, categoryId) => {
                  setDragOverCategoryId(null);
                  try {
                    const data = JSON.parse(e.dataTransfer.getData('application/json'));
                    if (data.type === 'document') {
                      await moveToFolder(data.id, categoryId);
                    }
                  } catch (error) {
                    console.error('Error handling drop:', error);
                  }
                }}
                dragOverCategoryId={dragOverCategoryId}
                isSelectMode={isSelectMode}
                onToggleFolder={toggleFolder}
                isFolderSelected={isFolderSelected}
              />
            </div>
            {!isMobile && <IntegrationsCard />}
          </div>

          {/* Row 2: Continue (8col) + File Insights (4col) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr',
            gap: 24,
            alignItems: 'stretch',
          }}>
            <div style={{ minWidth: 0 }}>
              <ContinueCard onUpload={() => setShowUniversalUploadModal(true)} />
            </div>
            {!isMobile && <FileInsightsCard />}
          </div>

          {/* Mobile-only: stacked cards */}
          {isMobile && (
            <>
              <IntegrationsCard />
              <FileInsightsCard />
            </>
          )}

          {/* Row 3: Recently Added — full width */}
          <RecentlyAddedCard
            documents={contextDocuments}
            loading={loading}
            onRetry={refreshAll}
            onDownload={handleDownload}
            onRename={handleRename}
            onAddToCategory={handleAddToCategory}
            onDelete={(doc) => {
              setItemToDelete({ type: 'document', id: doc.id, name: doc.filename });
              setShowDeleteModal(true);
            }}
            isSelectMode={isSelectMode}
            onToggleDocument={toggleDocument}
            isDocumentSelected={isSelected}
          />
        </div>

        {/* Drag and Drop Overlay - light background with black text */}
        {isDraggingOver && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(255, 255, 255, 0.95)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 24,
              zIndex: 9999,
              pointerEvents: 'none',
              animation: 'fadeIn 0.2s ease-in'
            }}
          >
            <style>
              {`
                @keyframes fadeIn {
                  from { opacity: 0; }
                  to { opacity: 1; }
                }
              `}
            </style>
            <img
              src={filesIcon}
              alt="Files"
              style={{
                width: 400,
                height: 'auto',
                opacity: 1.0,
                transform: 'scale(1.05)',
                transition: 'opacity 250ms ease-out, transform 250ms ease-out'
              }}
            />
            <div
              style={{
                color: '#32302C',
                fontSize: 32,
                fontFamily: 'Plus Jakarta Sans',
                fontWeight: '700',
                textAlign: 'center',
                opacity: 1.0,
                transition: 'opacity 250ms ease-out'
              }}
            >
              {t('upload.dropFilesHere')}
            </div>
            <div
              style={{
                color: '#6C6B6E',
                fontSize: 18,
                fontFamily: 'Plus Jakarta Sans',
                fontWeight: '500',
                textAlign: 'center',
                opacity: 0.8,
                transition: 'opacity 250ms ease-out'
              }}
            >
              {t('upload.releaseToUpload')}
            </div>
          </div>
        )}
      </div>

      {/* Create Category Modal */}
      <CreateCategoryModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreateCategory={handleCreateCategory}
        allDocuments={contextDocuments}
      />

      {/* Create Category From Move Modal */}
      <CreateCategoryModal
        isOpen={showCreateFromMoveModal}
        onClose={() => setShowCreateFromMoveModal(false)}
        onCreateCategory={handleCreateCategoryFromMove}
        uploadedDocuments={
          isSelectMode && selectedDocuments.size > 0
            ? contextDocuments.filter(doc => selectedDocuments.has(doc.id))
            : (selectedDocumentForCategory ? [selectedDocumentForCategory] : [])
        }
        allDocuments={contextDocuments}
      />

      {/* Notification Panel */}
      <NotificationPanel
        showNotificationsPopup={showNotificationsPopup}
        setShowNotificationsPopup={setShowNotificationsPopup}
      />

      {/* Add to Category Modal */}
      <MoveToCategoryModal
        isOpen={showCategoryModal}
        onClose={() => {
          setShowCategoryModal(false);
          setSelectedDocumentForCategory(null);
          setSelectedCategoryId(null);
          setMovingFromCategoryId(null);
        }}
        uploadedDocuments={
          movingFromCategoryId
            ? []
            : isSelectMode && selectedDocuments.size > 0
              ? contextDocuments.filter(doc => selectedDocuments.has(doc.id))
              : (selectedDocumentForCategory ? [selectedDocumentForCategory] : [])
        }
        showFilesSection={!movingFromCategoryId && (!!selectedDocumentForCategory || (isSelectMode && totalSelected > 0))}
        categories={getRootFolders()
          .filter(f => f.name.toLowerCase() !== 'recently added')
          .filter(f => f.id !== movingFromCategoryId)
          .filter(f => !selectedFolders.has(f.id))
          .map(f => ({
            ...f,
            fileCount: getDocumentCountByFolder(f.id)
          }))}
        selectedCategoryId={selectedCategoryId}
        onCategorySelect={setSelectedCategoryId}
        onCreateNew={() => {
          setShowCategoryModal(false);
          setShowCreateFromMoveModal(true);
        }}
        onConfirm={movingFromCategoryId ? async () => {
          if (!selectedCategoryId) return;
          const destId = selectedCategoryId;
          const srcId = movingFromCategoryId;
          const docsInSrc = contextDocuments.filter(d => d.folderId === srcId);
          setShowCategoryModal(false);
          setSelectedCategoryId(null);
          setMovingFromCategoryId(null);
          try {
            await Promise.all(docsInSrc.map(d => moveToFolder(d.id, destId)));
            showSuccess(t('toasts.filesMovedSuccessfully', { count: docsInSrc.length }));
          } catch (error) {
            showError(t('toasts.failedToAddDocumentsToCategory'));
          }
        } : handleCategorySelection}
      />

      {/* Edit Category Modal */}
      <EditCategoryModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingCategory(null);
        }}
        category={editingCategory}
        onUpdate={refreshAll}
      />

      <UploadModal
        isOpen={showUploadModal}
        onClose={() => {
          setShowUploadModal(false);
          setUploadCategoryId(null);
        }}
        categoryId={uploadCategoryId}
        onUploadComplete={() => {
          refreshAll();
        }}
      />

      {/* Universal Upload Modal */}
      <UniversalUploadModal
        isOpen={showUniversalUploadModal}
        onClose={() => {
          setShowUniversalUploadModal(false);
          setDroppedFiles(null);
          setUploadCategoryId(null);
          refreshAll();
        }}
        categoryId={uploadCategoryId}
        onUploadComplete={() => {
          refreshAll();
        }}
        initialFiles={droppedFiles}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setItemToDelete(null);
        }}
        onConfirm={() => {
          if (!itemToDelete) return;

          // Save reference before clearing state
          const itemToDeleteCopy = itemToDelete;

          // Close modal AND clear state IMMEDIATELY for instant feedback
          setShowDeleteModal(false);
          setItemToDelete(null);

          // For bulk delete, clear selection and exit select mode IMMEDIATELY
          if (itemToDeleteCopy.type === 'bulk-documents' || itemToDeleteCopy.type === 'bulk') {
            clearSelection();
            toggleSelectMode();
          }

          // Delete in background - context will update UI instantly
          (async () => {
            try {
              if (itemToDeleteCopy.type === 'bulk' || itemToDeleteCopy.type === 'bulk-documents') {
                // Handle bulk deletion of selected documents and folders
                const docIds = itemToDeleteCopy.documentIds || itemToDeleteCopy.ids || [];
                const folderIds = itemToDeleteCopy.folderIds || [];
                const deleteCount = itemToDeleteCopy.count;

                // Delete all selected documents and folders with proper error handling
                const results = await Promise.allSettled([
                  ...docIds.map(docId => deleteDocument(docId)),
                  ...folderIds.map(folderId => deleteFolder(folderId)),
                ]);

                // Count successes and failures
                const succeeded = results.filter(r => r.status === 'fulfilled').length;
                const failed = results.filter(r => r.status === 'rejected').length;

                // Show appropriate message
                if (failed === 0) {
                  showSuccess(t('alerts.filesDeleted', { count: deleteCount }));
                } else if (succeeded === 0) {
                  showError(t('alerts.failedToDeleteFiles', { count: failed }));
                } else {
                  showSuccess(t('alerts.filesDeleted', { count: succeeded }));
                  showError(t('alerts.failedToDeleteFiles', { count: failed }));
                }
              } else if (itemToDeleteCopy.type === 'category') {
                await handleDeleteCategory(itemToDeleteCopy.id);
              } else if (itemToDeleteCopy.type === 'document') {
                await handleDelete(itemToDeleteCopy.id);
              }
            } catch (error) {
              console.error('❌ Delete error:', error);
              showError(t('toasts.failedToDelete', { error: error.message || t('common.unknownError') }));
            }
          })();
        }}
        itemName={itemToDelete?.name || ''}
      />

      {/* Rename Modal */}
      <RenameModal
        isOpen={showRenameModal}
        onClose={() => {
          setShowRenameModal(false);
          setItemToRename(null);
        }}
        onConfirm={handleRenameConfirm}
        itemName={itemToRename?.name}
        itemType={itemToRename?.type}
      />


      {/* Home Dashboard Tour — shows once per user on first visit */}
      {!isMobile && (
        <HomeTour
          onOpenUploadModal={() => setShowUniversalUploadModal(true)}
          onCloseUploadModal={() => {
            setShowUniversalUploadModal(false);
            setDroppedFiles(null);
            setUploadCategoryId(null);
          }}
        />
      )}
    </div>
  );
};

// ✅ Loading Skeleton Component
const DocumentsSkeleton = () => {
  return (
    <div style={{
      width: '100%',
      minHeight: '100vh',
      background: '#F1F0EF',
      display: 'flex',
      flexDirection: 'row'
    }}>
      <LeftNav />

      <div style={{flex: 1, height: '100%', display: 'flex', flexDirection: 'column'}}>
        {/* Header Skeleton */}
        <div style={{height: 84, paddingLeft: 32, paddingRight: 32, background: 'white', borderBottom: '1px #E6E6EC solid', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          <div style={{width: 200, height: 36, background: '#E5E7EB', borderRadius: 8, animation: 'pulse 1.5s ease-in-out infinite'}} />
          <div style={{display: 'flex', gap: 12}}>
            <div style={{width: 120, height: 40, background: '#E5E7EB', borderRadius: 8, animation: 'pulse 1.5s ease-in-out infinite'}} />
            <div style={{width: 120, height: 40, background: '#E5E7EB', borderRadius: 8, animation: 'pulse 1.5s ease-in-out infinite'}} />
          </div>
        </div>

        {/* Content Skeleton */}
        <div style={{flex: 1, padding: '32px 20px', overflowY: 'auto'}}>
          {/* Search Bar Skeleton */}
          <div style={{width: '100%', maxWidth: 600, height: 44, background: 'white', border: '1px solid #E5E7EB', borderRadius: 8, marginBottom: 24, animation: 'pulse 1.5s ease-in-out infinite'}} />

          {/* Grid Skeleton */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 16
          }}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
              <div key={i} style={{
                background: 'white',
                border: '1px solid #E5E7EB',
                borderRadius: 12,
                padding: 16,
                height: 100,
                animation: 'pulse 1.5s ease-in-out infinite',
                animationDelay: `${i * 0.1}s`
              }}>
                <div style={{display: 'flex', gap: 12, alignItems: 'center'}}>
                  <div style={{width: 48, height: 48, background: '#E5E7EB', borderRadius: 8}} />
                  <div style={{flex: 1}}>
                    <div style={{width: '80%', height: 16, background: '#E5E7EB', borderRadius: 4, marginBottom: 8}} />
                    <div style={{width: '60%', height: 12, background: '#E5E7EB', borderRadius: 4}} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  );
};

export default Documents;
