import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { useAuth } from '../context/AuthContext';
import { useDocuments } from '../context/DocumentsContext';
import { useDocumentSelection } from '../hooks/useDocumentSelection';
import { useToast } from '../context/ToastContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { useSemanticSearch } from '../hooks/useSemanticSearch';
import LeftNav from './LeftNav';
import NotificationPanel from './NotificationPanel';
import CreateCategoryModal from './CreateCategoryModal';
import EditCategoryModal from './EditCategoryModal';
import UploadModal from './UploadModal';
import UniversalUploadModal from './UniversalUploadModal';
import DeleteConfirmationModal from './DeleteConfirmationModal';
import RenameModal from './RenameModal';
import MoveToCategoryModal from './MoveToCategoryModal';
import { ReactComponent as SmoothCorner } from '../assets/smoothinnercorner.svg';
import { ReactComponent as SmoothCorner2 } from '../assets/smoothinnercorner2.svg';
import { ReactComponent as ArrowIcon } from '../assets/arrow-narrow-right.svg';
import { ReactComponent as TimeIcon } from '../assets/Time square.svg';
import { ReactComponent as SearchIcon } from '../assets/Search.svg';
import { ReactComponent as LogoutBlackIcon } from '../assets/Logout-black.svg';
import { ReactComponent as Document2Icon } from '../assets/Document 2.svg';
import { ReactComponent as ImageIcon } from '../assets/Image.svg';
import { ReactComponent as InfoCircleIcon } from '../assets/Info circle.svg';
import { ReactComponent as SpreadsheetIcon } from '../assets/spreadsheet.svg';
import { ReactComponent as TrashCanIcon } from '../assets/Trash can-red.svg';
import { ReactComponent as TrashCanLightIcon } from '../assets/Trash can-light.svg';
import { ReactComponent as EditIcon } from '../assets/Edit 5.svg';
import { ReactComponent as DownloadIcon } from '../assets/Download 3- black.svg';
import { ReactComponent as AddIcon } from '../assets/add.svg';
import { ReactComponent as CloseIcon } from '../assets/x-close.svg';
import { ReactComponent as DotsIcon } from '../assets/dots.svg';
import { ReactComponent as XCloseIcon } from '../assets/x-close.svg';
import logoSvg from '../assets/logo.svg';
import sphereIcon from '../assets/sphere.svg';
import kodaLogoWhite from '../assets/logo-white.svg';
import kodaLogo from '../assets/koda-logo_1.svg';
import logoCopyWhite from '../assets/Logo copy.svg';
import filesIcon from '../assets/files-icon.svg';
import { getCategoriesWithCounts, createCategory, deleteCategory, addDocumentToCategory } from '../utils/categoryManager';
import api from '../services/api';
import chatService from '../services/chatService';
import CategoryIcon from './CategoryIcon';
import FileBreakdownDonut from './FileBreakdownDonut';
import pdfIcon from '../assets/pdf-icon.png';
import docIcon from '../assets/doc-icon.png';
import txtIcon from '../assets/txt-icon.png';
import xlsIcon from '../assets/xls.png';
import jpgIcon from '../assets/jpg-icon.png';
import pngIcon from '../assets/png-icon.png';
import pptxIcon from '../assets/pptx.png';
import folderIcon from '../assets/folder_icon.svg';
import movIcon from '../assets/mov.png';
import mp4Icon from '../assets/mp4.png';
import mp3Icon from '../assets/mp3.svg';

const Documents = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { showSuccess, showError } = useToast();
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
  const [showAskKoda, setShowAskKoda] = useState(() => {
    // Only show if not dismissed in this session
    return sessionStorage.getItem('askKodaDismissed') !== 'true';
  });
  const [showUniversalUploadModal, setShowUniversalUploadModal] = useState(false);
  const [showCreateFromMoveModal, setShowCreateFromMoveModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [itemToRename, setItemToRename] = useState(null);
  const [droppedFiles, setDroppedFiles] = useState(null);
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
    toggleSelectMode,
    toggleDocument,
    selectAll,
    clearSelection,
    isSelected
  } = useDocumentSelection();

  // Force re-render when contextFolders changes
  useEffect(() => {
    setCategoriesRefreshKey(prev => prev + 1);
  }, [contextFolders]);

  // Compute categories from context folders (auto-updates!)
  const categories = getRootFolders()
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
    return contextFolders
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
    const docCount = selectedDocuments.size;

    setShowCategoryModal(false);
    setSelectedDocumentForCategory(null);
    setSelectedCategoryId(null);

    try {
      // Handle bulk move when in select mode
      if (isSelectMode && docsToMove && docsToMove.length > 0) {
        Promise.all(docsToMove.map(docId => moveToFolder(docId, categoryId)));
        showSuccess(t('toasts.filesMovedSuccessfully', { count: docCount }));
        clearSelection();
        toggleSelectMode();
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
    const docCount = selectedDocuments.size;
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
      if (isSelectMode && docsToMove && docsToMove.length > 0) {
        Promise.all(docsToMove.map(docId => moveToFolder(docId, newFolder.id)));
        showSuccess(t('toasts.filesMovedSuccessfully', { count: docCount }));
        clearSelection();
        toggleSelectMode();
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
      return contextDocuments;
    }

    // Filename-based filtering
    const filenameMatches = contextDocuments.filter(doc =>
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
      background: '#F5F5F5',
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
        <div style={{minHeight: isMobile ? 56 : 84, paddingLeft: isMobile ? 16 : 20, paddingRight: isMobile ? 16 : 20, paddingTop: isMobile ? 'max(env(safe-area-inset-top), 0px)' : 0, paddingBottom: 0, background: 'white', borderBottom: '1px #E6E6EC solid', display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexShrink: 0}}>
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
            <div style={{color: '#32302C', fontSize: isMobile ? 18 : 20, fontFamily: 'Plus Jakarta Sans', fontWeight: '700', textTransform: 'capitalize', lineHeight: isMobile ? '24px' : '30px', textAlign: 'left', flex: 1}}>
              {t('documents.welcomeBack', { name: user && (user.firstName || user.lastName) ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : user?.email?.split('@')[0] || t('common.user') })}
            </div>
          )}
          <div style={{display: isMobile && !isSelectMode ? 'none' : 'flex', alignItems: 'center', gap: 12}}>
            {isSelectMode ? (
              <>
                {/* Delete Button - Red style matching FileTypeDetail */}
                <button
                  onClick={() => {
                    if (selectedDocuments.size === 0) return;
                    setItemToDelete({
                      type: 'bulk-documents',
                      ids: Array.from(selectedDocuments),
                      count: selectedDocuments.size,
                      name: `${selectedDocuments.size} document${selectedDocuments.size > 1 ? 's' : ''}`
                    });
                    setShowDeleteModal(true);
                  }}
                  disabled={selectedDocuments.size === 0}
                  style={{
                    height: 42,
                    paddingLeft: 18,
                    paddingRight: 18,
                    background: selectedDocuments.size > 0 ? '#FEE2E2' : '#F5F5F5',
                    borderRadius: 100,
                    border: '1px solid #E6E6EC',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: selectedDocuments.size > 0 ? 'pointer' : 'not-allowed',
                    opacity: selectedDocuments.size > 0 ? 1 : 0.5,
                    whiteSpace: 'nowrap'
                  }}
                >
                  <TrashCanLightIcon style={{ width: 18, height: 18 }} />
                  <span style={{ color: '#D92D20', fontSize: 15, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', whiteSpace: 'nowrap' }}>
                    {t('common.delete')}{selectedDocuments.size > 0 ? ` (${selectedDocuments.size})` : ''}
                  </span>
                </button>

                {/* Move Button - White style matching FileTypeDetail */}
                <button
                  onClick={() => {
                    if (selectedDocuments.size === 0) return;
                    setShowCategoryModal(true);
                  }}
                  disabled={selectedDocuments.size === 0}
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
                    cursor: selectedDocuments.size > 0 ? 'pointer' : 'not-allowed',
                    opacity: selectedDocuments.size > 0 ? 1 : 0.5,
                    whiteSpace: 'nowrap'
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9 3.75V14.25M3.75 9H14.25" stroke="#32302C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span style={{ color: '#32302C', fontSize: 15, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', whiteSpace: 'nowrap' }}>
                    {t('common.move')}{selectedDocuments.size > 0 ? ` (${selectedDocuments.size})` : ''}
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
                  style={{
                    position: 'relative',
                    height: isMobile ? 44 : 52,
                    display: 'flex',
                    alignItems: 'center',
                    flex: isMobile ? 1 : 'none',
                    marginLeft: 0,
                    transition: 'transform 0.15s ease',
                    cursor: 'text'
                  }}
                  onMouseEnter={(e) => { if (!isMobile) e.currentTarget.style.transform = 'scale(1.02)'; }}
                  onMouseLeave={(e) => { if (!isMobile) e.currentTarget.style.transform = 'scale(1)'; }}
                >
                  <SearchIcon style={{position: 'absolute', left: 16, width: 20, height: 20, zIndex: 1}} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('common.search')}
                    style={{
                      height: '100%',
                      width: isMobile ? '100%' : 'auto',
                      minWidth: isMobile ? 'auto' : 250,
                      paddingLeft: 46,
                      paddingRight: 16,
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

                  {/* Error State */}
                  {searchError && !isSearching && (
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

                  {/* Results */}
                  {!isSearching && !searchError && (filteredFolders.length > 0 || filteredDocuments.length > 0) ? (
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
                                navigate(`/folder/${folder.id}`);
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
                                  {folder.name}
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
                                  navigate(`/document/${doc.id}`);
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
                                      imageRendering: '-webkit-optimize-contrast',
                                      objectFit: 'contain',
                                      shapeRendering: 'geometricPrecision',
                                      filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))'
                                    }}
                                  />
                                  {/* Processing badge - HIDDEN: Documents should display normally regardless of status */}
                                  {/* Users don't need to see processing status - it happens silently in the background */}
                                  {/* Failed badge */}
                                  {doc.status === 'failed' && (
                                    <div style={{
                                      position: 'absolute',
                                      bottom: -4,
                                      right: -4,
                                      background: '#EF4444',
                                      color: 'white',
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      fontSize: '9px',
                                      fontWeight: '600',
                                      fontFamily: 'Plus Jakarta Sans',
                                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                                    }}>
                                      ⚠️ Failed
                                    </div>
                                  )}
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
                                    {doc.filename}
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

                <div onClick={() => setShowUniversalUploadModal(true)} style={{height: isMobile ? 44 : 52, width: isMobile ? 44 : 'auto', paddingLeft: isMobile ? 0 : 18, paddingRight: isMobile ? 0 : 18, paddingTop: 10, paddingBottom: 10, background: '#F5F5F5', borderRadius: 100, border: '1px #E6E6EC solid', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', flexShrink: 0, transition: 'transform 0.2s ease, box-shadow 0.2s ease'}} onMouseEnter={(e) => !isMobile && (e.currentTarget.style.transform = 'translateY(-2px)')} onMouseLeave={(e) => !isMobile && (e.currentTarget.style.transform = 'translateY(0)')}>
                  <LogoutBlackIcon style={{width: isMobile ? 20 : 24, height: isMobile ? 20 : 24}} />
                  {!isMobile && <div style={{color: '#32302C', fontSize: 16, fontFamily: 'Plus Jakarta Sans', fontWeight: '500', lineHeight: '24px'}}>{t('documents.uploadDocument')}</div>}
                </div>
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
              <SearchIcon style={{ width: 20, height: 20, color: '#6B7280', flexShrink: 0 }} />
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
              <LogoutBlackIcon style={{width: 20, height: 20}} />
            </div>
          </div>
        )}

        {/* Scrollable Content */}
        <div className="scrollable-content documents-content" style={{flex: 1, minHeight: 0, padding: isMobile ? 12 : 20, paddingBottom: isMobile ? 100 : 20, overflowY: isMobile ? 'hidden' : 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 20, maxWidth: '100%', boxSizing: 'border-box', WebkitOverflowScrolling: 'touch'}}>
          {/* Smart Categories */}
          <div key={categoriesRefreshKey} style={{display: 'flex', flexDirection: 'column', gap: isMobile ? 8 : 12}}>
            {/* Categories - vertical list on mobile, 4-column grid on desktop */}
            <div style={{display: isMobile ? 'flex' : 'grid', flexDirection: isMobile ? 'column' : undefined, gridTemplateColumns: isMobile ? undefined : 'repeat(4, 1fr)', gap: isMobile ? 8 : 12}}>
              <div onClick={() => setIsModalOpen(true)} style={{height: isMobile ? 56 : 72, padding: isMobile ? '12px 16px' : 12, background: 'white', borderRadius: isMobile ? 14 : 20, border: '2px solid #E6E6EC', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06)', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', flexDirection: 'row', gap: isMobile ? 12 : 10, cursor: 'pointer', boxSizing: 'border-box', transition: 'transform 0.2s ease, box-shadow 0.2s ease'}} onMouseEnter={(e) => !isMobile && (e.currentTarget.style.transform = 'translateY(-2px)')} onMouseLeave={(e) => !isMobile && (e.currentTarget.style.transform = 'translateY(0)')}>
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0}}>
                  <AddIcon style={{ width: isMobile ? 24 : 28, height: isMobile ? 24 : 28 }} />
                </div>
                <span style={{color: '#32302C', fontSize: isMobile ? 14 : 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', lineHeight: '1.2', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, whiteSpace: 'nowrap', textAlign: 'left'}}>{t('documents.addNewCategory')}</span>
              </div>
              {categories.slice(0, isMobile ? 4 : 3).map((category, index) => (
                <div
                  key={`${category.id}-${category.emoji}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragOverCategoryId(category.id);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragOverCategoryId(null);
                  }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragOverCategoryId(null);

                    try {
                      const data = JSON.parse(e.dataTransfer.getData('application/json'));
                      if (data.type === 'document') {
                        // Move document to this category
                        await moveToFolder(data.id, category.id);
                      }
                    } catch (error) {
                      console.error('Error handling drop:', error);
                    }
                  }}
                  style={{
                    padding: isMobile ? '12px 16px' : '14px 16px',
                    height: isMobile ? 56 : 72,
                    background: dragOverCategoryId === category.id ? '#F0F0F0' : 'white',
                    borderRadius: isMobile ? 14 : 20,
                    border: dragOverCategoryId === category.id ? '2px dashed #32302C' : '2px solid #E6E6EC',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06)',
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    gap: isMobile ? 12 : 12,
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease, border 0.2s ease',
                    position: 'relative',
                    boxSizing: 'border-box',
                    zIndex: categoryMenuOpen === category.id ? 99999 : 1
                  }}
                >
                  <div onClick={() => navigate(`/category/${category.name.toLowerCase().replace(/\s+/g, '-')}`)} style={{display: 'flex', flexDirection: 'row', alignItems: 'center', gap: isMobile ? 12 : 12, flex: 1, cursor: 'pointer', minWidth: 0, textAlign: 'left'}} onMouseEnter={(e) => !isMobile && (e.currentTarget.parentElement.style.transform = 'translateY(-2px)')} onMouseLeave={(e) => !isMobile && (e.currentTarget.parentElement.style.transform = 'translateY(0)')}>
                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0}}>
                      <CategoryIcon emoji={category.emoji} size={isMobile ? 36 : 42} />
                    </div>
                    <div style={{display: 'flex', flexDirection: 'column', gap: isMobile ? 2 : 4, flex: 1, alignItems: 'flex-start', minWidth: 0}}>
                      <div style={{color: '#32302C', fontSize: isMobile ? 14 : 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', lineHeight: '1.2', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%'}}>{category.name}</div>
                      <div style={{color: '#6C6B6E', fontSize: isMobile ? 13 : 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '500', lineHeight: '1.2'}}>
                        {category.fileCount || 0} {category.fileCount === 1 ? 'File' : 'Files'}
                      </div>
                    </div>
                  </div>
                  <div style={{position: 'relative'}} data-category-menu>
                    <button
                      data-category-id={category.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        const clickedId = e.currentTarget.getAttribute('data-category-id');
                        if (categoryMenuOpen === clickedId) {
                          setCategoryMenu({ id: null, top: 0, left: 0 });
                        } else {
                          const buttonRect = e.currentTarget.getBoundingClientRect();
                          const dropdownHeight = 160;
                          const dropdownWidth = 160;
                          const spaceBelow = window.innerHeight - buttonRect.bottom;
                          const openUpward = spaceBelow < dropdownHeight && buttonRect.top > dropdownHeight;
                          // Calculate left position with bounds checking
                          let leftPos = buttonRect.right - dropdownWidth;
                          leftPos = Math.max(8, Math.min(leftPos, window.innerWidth - dropdownWidth - 8));
                          // Single state update with both position and ID
                          setCategoryMenu({
                            id: clickedId,
                            top: openUpward ? buttonRect.top - dropdownHeight - 4 : buttonRect.bottom + 4,
                            left: leftPos
                          });
                        }
                      }}
                      style={{
                        width: 32,
                        height: 32,
                        background: 'transparent',
                        borderRadius: '50%',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        flexShrink: 0,
                        transition: 'transform 0.2s ease'
                      }}
                      onMouseEnter={(e) => { if (!isMobile) e.currentTarget.style.transform = 'scale(1.1)'; }}
                      onMouseLeave={(e) => { if (!isMobile) e.currentTarget.style.transform = 'scale(1)'; }}
                    >
                      <DotsIcon style={{width: 24, height: 24}} />
                    </button>
                    {(() => {
                      const targetIndex = categories.findIndex(c => c.id === categoryMenuOpen);
                      return targetIndex >= 0 && targetIndex === index && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            position: 'absolute',
                            right: 0,
                            top: '100%',
                            marginTop: 4,
                            background: 'white',
                            borderRadius: 12,
                            border: '1px solid #E6E6EC',
                            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
                            zIndex: 100,
                            minWidth: 160,
                            overflow: 'hidden'
                          }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const cat = categories.find(c => c.id === categoryMenuOpen);
                              if (cat) {
                                setEditingCategory(cat);
                                setShowEditModal(true);
                              }
                              setCategoryMenuOpen(null);
                            }}
                            style={{
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '10px 14px',
                              background: 'transparent',
                              border: 'none',
                              borderBottom: '1px solid #F5F5F5',
                              cursor: 'pointer',
                              fontSize: 14,
                              fontFamily: 'Plus Jakarta Sans',
                              fontWeight: '500',
                              color: '#32302C',
                              transition: 'background 0.2s ease',
                              textAlign: 'left'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#F5F5F5'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <EditIcon style={{width: 16, height: 16}} />
                            {t('common.edit')}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (categoryMenuOpen) {
                                setUploadCategoryId(categoryMenuOpen);
                                setShowUniversalUploadModal(true);
                              }
                              setCategoryMenuOpen(null);
                            }}
                            style={{
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '10px 14px',
                              background: 'transparent',
                              border: 'none',
                              borderBottom: '1px solid #F5F5F5',
                              cursor: 'pointer',
                              fontSize: 14,
                              fontFamily: 'Plus Jakarta Sans',
                              fontWeight: '500',
                              color: '#32302C',
                              transition: 'background 0.2s ease',
                              textAlign: 'left'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#F5F5F5'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <LogoutBlackIcon style={{width: 16, height: 16, color: '#32302C'}} />
                            {t('common.upload')}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const cat = categories.find(c => c.id === categoryMenuOpen);
                              if (cat) {
                                setItemToDelete({ type: 'category', id: cat.id, name: cat.name });
                                setShowDeleteModal(true);
                              }
                              setCategoryMenuOpen(null);
                            }}
                            style={{
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '10px 14px',
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: 14,
                              fontFamily: 'Plus Jakarta Sans',
                              fontWeight: '500',
                              color: '#D92D20',
                              transition: 'background 0.2s ease',
                              textAlign: 'left'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#FEE2E2'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <TrashCanIcon style={{width: 16, height: 16}} />
                            {t('common.delete')}
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>

            {/* See All button for mobile */}
            {isMobile && categories.length > 4 && (
              <div
                onClick={() => navigate('/documents')}
                style={{
                  padding: '12px 16px',
                  textAlign: 'right'
                }}
              >
                <span style={{color: '#171717', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '700', cursor: 'pointer'}}>
                  See All ({categories.length})
                </span>
              </div>
            )}

            {/* Second Row: Next 4 Categories - Hidden on mobile */}
            {!isMobile && categories.length > 3 && (
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12}}>
                {categories.slice(3, categories.length > 6 ? 6 : 7).map((category, index) => (
                  <div
                    key={`${category.id}-${category.emoji}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragOverCategoryId(category.id);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragOverCategoryId(null);
                    }}
                    onDrop={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragOverCategoryId(null);

                      try {
                        const data = JSON.parse(e.dataTransfer.getData('application/json'));
                        if (data.type === 'document') {
                          await moveToFolder(data.id, category.id);
                        }
                      } catch (error) {
                        console.error('Error handling drop:', error);
                      }
                    }}
                    style={{
                      height: 72,
                      padding: '14px 16px',
                      background: dragOverCategoryId === category.id ? '#F0F0F0' : 'white',
                      borderRadius: 20,
                      border: dragOverCategoryId === category.id ? '2px dashed #32302C' : '2px solid #E6E6EC',
                      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      transition: 'transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease, border 0.2s ease',
                      position: 'relative',
                      boxSizing: 'border-box',
                      zIndex: categoryMenuOpen === category.id ? 99999 : 1
                    }}
                  >
                    <div onClick={() => navigate(`/category/${category.name.toLowerCase().replace(/\s+/g, '-')}`)} style={{display: 'flex', alignItems: 'center', gap: 12, flex: 1, cursor: 'pointer', minWidth: 0}} onMouseEnter={(e) => e.currentTarget.parentElement.style.transform = 'translateY(-2px)'} onMouseLeave={(e) => e.currentTarget.parentElement.style.transform = 'translateY(0)'}>
                      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0}}>
                        <CategoryIcon emoji={category.emoji} size={42} />
                      </div>
                      <div style={{display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0}}>
                        <div style={{color: '#32302C', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', lineHeight: '19.6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{category.name}</div>
                        <div style={{color: '#6C6B6E', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '500', lineHeight: '19.6px'}}>
                          {category.fileCount || 0} {category.fileCount === 1 ? 'File' : 'Files'}
                        </div>
                      </div>
                    </div>
                    <div style={{position: 'relative'}} data-category-menu>
                      <button
                        data-category-id={category.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          const clickedId = e.currentTarget.getAttribute('data-category-id');
                          if (categoryMenuOpen === clickedId) {
                            setCategoryMenu({ id: null, top: 0, left: 0 });
                          } else {
                            const buttonRect = e.currentTarget.getBoundingClientRect();
                            const dropdownHeight = 160;
                            const dropdownWidth = 160;
                            const spaceBelow = window.innerHeight - buttonRect.bottom;
                            const openUpward = spaceBelow < dropdownHeight && buttonRect.top > dropdownHeight;
                            // Calculate left position with bounds checking
                            let leftPos = buttonRect.right - dropdownWidth;
                            leftPos = Math.max(8, Math.min(leftPos, window.innerWidth - dropdownWidth - 8));
                            // Single state update with both position and ID
                            setCategoryMenu({
                              id: clickedId,
                              top: openUpward ? buttonRect.top - dropdownHeight - 4 : buttonRect.bottom + 4,
                              left: leftPos
                            });
                          }
                        }}
                        style={{
                          width: 28,
                          height: 28,
                          background: 'transparent',
                          borderRadius: '50%',
                          border: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          flexShrink: 0,
                          transition: 'transform 0.2s ease'
                        }}
                        onMouseEnter={(e) => { if (!isMobile) e.currentTarget.style.transform = 'scale(1.1)'; }}
                        onMouseLeave={(e) => { if (!isMobile) e.currentTarget.style.transform = 'scale(1)'; }}
                      >
                        <DotsIcon style={{width: 24, height: 24}} />
                      </button>
                      {(() => {
                        const targetIndex = categories.findIndex(c => c.id === categoryMenuOpen);
                        return targetIndex >= 0 && targetIndex === (index + 3) && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            position: 'absolute',
                            right: 0,
                            top: '100%',
                            marginTop: 4,
                            background: 'white',
                            borderRadius: 12,
                            border: '1px solid #E6E6EC',
                            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
                            zIndex: 100,
                            minWidth: 160,
                            overflow: 'hidden'
                          }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const cat = categories.find(c => c.id === categoryMenuOpen);
                              if (cat) {
                                setEditingCategory(cat);
                                setShowEditModal(true);
                              }
                              setCategoryMenuOpen(null);
                            }}
                            style={{
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '10px 14px',
                              background: 'transparent',
                              border: 'none',
                              borderBottom: '1px solid #F5F5F5',
                              cursor: 'pointer',
                              fontSize: 14,
                              fontFamily: 'Plus Jakarta Sans',
                              fontWeight: '500',
                              color: '#32302C',
                              transition: 'background 0.2s ease',
                              textAlign: 'left'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#F5F5F5'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <EditIcon style={{width: 16, height: 16}} />
                            {t('common.edit')}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (categoryMenuOpen) {
                                setUploadCategoryId(categoryMenuOpen);
                                setShowUniversalUploadModal(true);
                              }
                              setCategoryMenuOpen(null);
                            }}
                            style={{
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '10px 14px',
                              background: 'transparent',
                              border: 'none',
                              borderBottom: '1px solid #F5F5F5',
                              cursor: 'pointer',
                              fontSize: 14,
                              fontFamily: 'Plus Jakarta Sans',
                              fontWeight: '500',
                              color: '#32302C',
                              transition: 'background 0.2s ease',
                              textAlign: 'left'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#F5F5F5'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <LogoutBlackIcon style={{width: 16, height: 16, color: '#32302C'}} />
                            {t('common.upload')}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const cat = categories.find(c => c.id === categoryMenuOpen);
                              if (cat) {
                                setItemToDelete({ type: 'category', id: cat.id, name: cat.name });
                                setShowDeleteModal(true);
                              }
                              setCategoryMenuOpen(null);
                            }}
                            style={{
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '10px 14px',
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: 14,
                              fontFamily: 'Plus Jakarta Sans',
                              fontWeight: '500',
                              color: '#D92D20',
                              transition: 'background 0.2s ease',
                              textAlign: 'left'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#FEE2E2'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <TrashCanIcon style={{width: 16, height: 16}} />
                            {t('common.delete')}
                          </button>
                        </div>
                      );
                    })()}
                    </div>
                  </div>
                ))}

                {/* "See All" button as last item in row 2 - only show if more than 7 categories exist */}
                {categories.length > 7 && (
                  <div
                    onClick={() => navigate('/documents')}
                    style={{
                      height: 72,
                      padding: 12,
                      background: 'white',
                      borderRadius: 20,
                      border: '2px solid #E6E6EC',
                      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                      boxSizing: 'border-box'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                  >
                    <span style={{color: '#32302C', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
                      See All ({categories.length})
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* File Breakdown - Full width card */}
          <div style={{width: '100%', maxWidth: '100%', boxSizing: 'border-box'}}>
            <FileBreakdownDonut showEncryptionMessage={false} />
          </div>

          {/* Recently Added - Full width card below */}
          <div style={{width: '100%', maxWidth: '100%', boxSizing: 'border-box', padding: isMobile ? 16 : 24, background: 'white', borderRadius: isMobile ? 12 : 20, border: '2px solid #E6E6EC', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06)', display: 'flex', flexDirection: 'column', overflow: 'visible'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isMobile ? 12 : 24}}>
                <div style={{color: '#32302C', fontSize: isMobile ? 16 : 18, fontFamily: 'Plus Jakarta Sans', fontWeight: '700'}}>{t('documents.recentlyAdded')}</div>
                {contextDocuments.length > 8 && (
                  <div
                    onClick={() => navigate('/documents')}
                    style={{color: '#171717', fontSize: 16, fontFamily: 'Plus Jakarta Sans', fontWeight: '700', lineHeight: '22.40px', cursor: 'pointer'}}
                  >
                    {t('common.seeAll')}
                  </div>
                )}
              </div>

              {contextDocuments.length > 0 ? (
                <div style={{display: 'flex', flexDirection: 'column', gap: 0, flex: 1, overflowY: 'auto', overflow: 'visible', minHeight: 0, position: 'relative'}}>
                  {/* Table Header */}
                  {!isMobile && (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 1fr 1fr 1fr 50px',
                      gap: 12,
                      padding: '10px 14px',
                      borderBottom: '1px solid #E6E6EC',
                      marginBottom: 8
                    }}>
                      {[
                        { key: 'name', label: t('documents.tableHeaders.name') },
                        { key: 'type', label: t('documents.tableHeaders.type') },
                        { key: 'size', label: t('documents.tableHeaders.size') },
                        { key: 'date', label: t('documents.tableHeaders.date') }
                      ].map(col => (
                        <div
                          key={col.key}
                          onClick={() => {
                            if (sortColumn === col.key) {
                              setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                            } else {
                              setSortColumn(col.key);
                              setSortDirection('asc');
                            }
                          }}
                          style={{
                            color: sortColumn === col.key ? '#171717' : '#6C6B6E',
                            fontSize: 11,
                            fontFamily: 'Plus Jakarta Sans',
                            fontWeight: '600',
                            textTransform: 'uppercase',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            userSelect: 'none'
                          }}
                        >
                          {col.label}
                          {sortColumn === col.key && (
                            <span style={{ fontSize: 10 }}>
                              {sortDirection === 'asc' ? '▲' : '▼'}
                            </span>
                          )}
                        </div>
                      ))}
                      <div></div>
                    </div>
                  )}
                  {(() => {
                    // Helper function to get file type for sorting
                    const getFileTypeForSort = (doc) => {
                      const filename = doc?.filename || '';
                      const ext = filename.match(/\.([^.]+)$/)?.[1]?.toUpperCase() || '';
                      return ext || 'File';
                    };

                    // Show 8 most recently added documents (sorted by createdAt descending)
                    const allDocsSorted = [...contextDocuments].sort((a, b) =>
                      new Date(b.createdAt) - new Date(a.createdAt)
                    );
                    const docsToShow = allDocsSorted.slice(0, 8);
                    return docsToShow.map((doc, index) => {
                    // ✅ Check document status for visual indicators
                    const isUploading = doc.status === 'uploading';
                    // Processing status hidden - documents should display normally
                    // const isProcessing = doc.status === 'processing';
                    const isCompleted = doc.status === 'completed';
                    const isFailed = doc.status === 'failed';

                    const getFileIcon = (doc) => {
                      // Prioritize MIME type over file extension (more reliable for encrypted filenames)
                      const mimeType = doc?.mimeType || '';
                      const filename = doc?.filename || '';

                      // DEBUG: Log MIME type and filename for video files
                      if (mimeType.startsWith('video/') || filename.match(/\.(mov|mp4)$/i)) {
                        console.log('🎬 Video file detected (Recently Added):', { filename, mimeType });
                      }

                      // ========== VIDEO FILES ==========
                      // QuickTime videos (.mov) - MUST check before generic video check
                      if (mimeType === 'video/quicktime') {
                        console.log('✅ Returning movIcon for (Recently Added):', filename);
                        return movIcon; // Blue MOV icon
                      }

                      // MP4 videos - specific check only
                      if (mimeType === 'video/mp4') {
                        console.log('✅ Returning mp4Icon for (Recently Added):', filename);
                        return mp4Icon; // Pink MP4 icon
                      }

                      // Other video types - use generic video icon (mp4)
                      if (mimeType.startsWith('video/')) {
                        console.log('⚠️  Generic video type, returning mp4Icon for (Recently Added):', filename, mimeType);
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

                    const formatBytes = (bytes) => {
                      if (bytes === 0) return '0 B';
                      const sizes = ['B', 'KB', 'MB', 'GB'];
                      const i = Math.floor(Math.log(bytes) / Math.log(1024));
                      return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
                    };

                    const getFileType = (doc) => {
                      const mimeType = doc?.mimeType || '';
                      const filename = doc?.filename || '';

                      // Get extension from filename
                      const ext = filename.match(/\.([^.]+)$/)?.[1]?.toUpperCase() || '';

                      if (mimeType === 'application/pdf' || ext === 'PDF') return 'PDF';
                      if (ext === 'DOC') return 'DOC';
                      if (ext === 'DOCX') return 'DOCX';
                      if (ext === 'XLS') return 'XLS';
                      if (ext === 'XLSX') return 'XLSX';
                      if (ext === 'PPT') return 'PPT';
                      if (ext === 'PPTX') return 'PPTX';
                      if (ext === 'TXT') return 'TXT';
                      if (ext === 'CSV') return 'CSV';
                      if (ext === 'PNG') return 'PNG';
                      if (ext === 'JPG' || ext === 'JPEG') return 'JPG';
                      if (ext === 'GIF') return 'GIF';
                      if (ext === 'WEBP') return 'WEBP';
                      if (ext === 'MP4') return 'MP4';
                      if (ext === 'MOV') return 'MOV';
                      if (ext === 'AVI') return 'AVI';
                      if (ext === 'MKV') return 'MKV';
                      if (ext === 'MP3') return 'MP3';
                      if (ext === 'WAV') return 'WAV';
                      if (ext === 'AAC') return 'AAC';
                      if (ext === 'M4A') return 'M4A';

                      return ext || 'File';
                    };

                    return (
                      <div
                        key={doc.id}
                        className="document-row"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('application/json', JSON.stringify({
                            type: 'document',
                            id: doc.id
                          }));
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragEnd={(e) => {
                          e.currentTarget.style.opacity = '1';
                        }}
                        onClick={() => navigate(`/document/${doc.id}`)}
                        style={isMobile ? {
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: 10,
                          borderRadius: 14,
                          background: 'white',
                          border: '1px solid #E6E6EC',
                          cursor: 'pointer',
                          marginBottom: 8,
                          position: 'relative',
                          overflow: openDropdownId === doc.id ? 'visible' : 'hidden',
                          zIndex: openDropdownId === doc.id ? 99999 : 1,
                          minHeight: 72,
                          boxSizing: 'border-box'
                        } : {
                          display: 'grid',
                          gridTemplateColumns: '2fr 1fr 1fr 1fr 50px',
                          gap: 12,
                          alignItems: 'center',
                          padding: '10px 14px',
                          borderRadius: 14,
                          background: 'white',
                          border: '1px solid #E6E6EC',
                          cursor: 'pointer',
                          transition: 'background 0.15s ease',
                          marginBottom: 8,
                          position: 'relative',
                          overflow: openDropdownId === doc.id ? 'visible' : 'hidden',
                          zIndex: openDropdownId === doc.id ? 99999 : 1
                        }}
                        onMouseEnter={(e) => {
                          if (!isUploading && !isMobile) {
                            e.currentTarget.style.background = '#F7F7F9';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isUploading && !isMobile) {
                            e.currentTarget.style.background = 'white';
                          }
                        }}
                      >
                        {/* Grey progress fill background */}
                        {isUploading && (
                          <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            height: '100%',
                            width: `${doc.uploadProgress || 0}%`,
                            background: '#E8E8E8',
                            borderRadius: 14,
                            transition: 'width 0.3s ease-out',
                            zIndex: 0
                          }} />
                        )}
                        {isMobile ? (
                          <>
                            <img
                              src={getFileIcon(doc)}
                              alt="File icon"
                              style={{
                                width: 40,
                                height: 40,
                                aspectRatio: '1/1',
                                imageRendering: '-webkit-optimize-contrast',
                                objectFit: 'contain',
                                shapeRendering: 'geometricPrecision',
                                filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))',
                                position: 'relative',
                                zIndex: 1
                              }}
                            />
                            <div style={{flex: 1, overflow: 'hidden', position: 'relative', zIndex: 1}}>
                              <div style={{color: '#32302C', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                                {doc.filename}
                              </div>
                              <div style={{color: '#6C6B6E', fontSize: 12, fontFamily: 'Plus Jakarta Sans', fontWeight: '500', marginTop: 5}}>
                                {isUploading
                                  ? `${formatBytes(doc.fileSize)} – ${Math.round(doc.uploadProgress || 0)}% uploaded`
                                  : `${formatBytes(doc.fileSize)} • ${new Date(doc.createdAt).toLocaleDateString()}`
                                }
                              </div>
                              {isFailed && (
                                <div style={{fontSize: 12, color: '#EF4444', fontFamily: 'Plus Jakarta Sans', fontWeight: '600', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4}}>
                                  <span>❌</span><span>{t('upload.failed')}</span>
                                </div>
                              )}
                            </div>
                          </>
                        ) : (
                          <>
                            {/* Name Column */}
                            <div style={{display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden', position: 'relative', zIndex: 1}}>
                              <img
                                src={getFileIcon(doc)}
                                alt="File icon"
                                style={{width: 40, height: 40, flexShrink: 0, imageRendering: '-webkit-optimize-contrast', objectFit: 'contain', filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))'}}
                              />
                              <div style={{display: 'flex', flexDirection: 'column', overflow: 'hidden'}}>
                                <div style={{color: '#32302C', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                                  {doc.filename}
                                </div>
                                {isUploading && (
                                  <div style={{fontSize: 13, color: '#6C6B6E', fontFamily: 'Plus Jakarta Sans', fontWeight: '500', marginTop: 2}}>
                                    {formatBytes(doc.fileSize)} – {Math.round(doc.uploadProgress || 0)}% uploaded
                                  </div>
                                )}
                              </div>
                            </div>
                            {/* Type Column */}
                            <div style={{color: '#6C6B6E', fontSize: 13, fontFamily: 'Plus Jakarta Sans', position: 'relative', zIndex: 1}}>{isUploading ? '' : getFileType(doc)}</div>
                            {/* Size Column */}
                            <div style={{color: '#6C6B6E', fontSize: 13, fontFamily: 'Plus Jakarta Sans', position: 'relative', zIndex: 1}}>{isUploading ? '' : formatBytes(doc.fileSize)}</div>
                            {/* Date Column */}
                            <div style={{color: '#6C6B6E', fontSize: 13, fontFamily: 'Plus Jakarta Sans', position: 'relative', zIndex: 1}}>{isUploading ? '' : new Date(doc.createdAt).toLocaleDateString()}</div>
                          </>
                        )}
                        <div style={{position: 'relative', flexShrink: 0}} data-dropdown>
                          <button
                            ref={(el) => {
                              if (el) dropdownRefs.current[doc.id] = el;
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (openDropdownId === doc.id) {
                                setOpenDropdownId(null);
                              } else {
                                // Calculate if dropdown should open up or down
                                const buttonRect = e.currentTarget.getBoundingClientRect();
                                const dropdownHeight = 200; // Approximate dropdown height
                                const spaceBelow = window.innerHeight - buttonRect.bottom;
                                const spaceAbove = buttonRect.top;

                                // Open upward if not enough space below and more space above
                                if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
                                  setDropdownDirection('up');
                                } else {
                                  setDropdownDirection('down');
                                }
                                setOpenDropdownId(doc.id);
                              }
                            }}
                            onMouseEnter={(e) => { if (!isMobile) e.currentTarget.style.transform = 'scale(1.1)'; }}
                            onMouseLeave={(e) => { if (!isMobile) e.currentTarget.style.transform = 'scale(1)'; }}
                            style={{
                              width: 32,
                              height: 32,
                              background: 'transparent',
                              borderRadius: '50%',
                              border: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              transition: 'transform 0.2s ease'
                            }}
                          >
                            <DotsIcon style={{width: 24, height: 24, pointerEvents: 'auto'}} />
                          </button>

                          {openDropdownId === doc.id && (
                            <div
                              data-dropdown
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                position: 'absolute',
                                right: 0,
                                ...(dropdownDirection === 'up'
                                  ? { bottom: '100%', marginBottom: 4 }
                                  : { top: '100%', marginTop: 4 }),
                                background: 'white',
                                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
                                borderRadius: 12,
                                border: '1px solid #E6E6EC',
                                zIndex: 99999,
                                minWidth: 160,
                                overflow: 'hidden'
                              }}
                            >
                              <div style={{padding: 8, display: 'flex', flexDirection: 'column', gap: 0}}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownload(doc);
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '10px 14px',
                                    background: 'transparent',
                                    border: 'none',
                                    borderRadius: 6,
                                    cursor: 'pointer',
                                    fontSize: 14,
                                    fontFamily: 'Plus Jakarta Sans',
                                    fontWeight: '500',
                                    color: '#32302C',
                                    transition: 'background 0.2s ease',
                                    textAlign: 'left',
                                    width: '100%'
                                  }}
                                  onMouseEnter={(e) => e.currentTarget.style.background = '#F5F5F5'}
                                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                  <DownloadIcon style={{ width: 20, height: 20 }} />
                                  {t('common.download')}
                                </button>

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRename(doc);
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '10px 14px',
                                    background: 'transparent',
                                    border: 'none',
                                    borderRadius: 6,
                                    cursor: 'pointer',
                                    fontSize: 14,
                                    fontFamily: 'Plus Jakarta Sans',
                                    fontWeight: '500',
                                    color: '#32302C',
                                    transition: 'background 0.2s ease',
                                    textAlign: 'left',
                                    width: '100%'
                                  }}
                                  onMouseEnter={(e) => e.currentTarget.style.background = '#F5F5F5'}
                                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                  <EditIcon style={{ width: 20, height: 20 }} />
                                  {t('common.rename')}
                                </button>

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAddToCategory(doc);
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '10px 14px',
                                    background: 'transparent',
                                    border: 'none',
                                    borderRadius: 6,
                                    cursor: 'pointer',
                                    fontSize: 14,
                                    fontFamily: 'Plus Jakarta Sans',
                                    fontWeight: '500',
                                    color: '#32302C',
                                    transition: 'background 0.2s ease',
                                    textAlign: 'left',
                                    width: '100%'
                                  }}
                                  onMouseEnter={(e) => e.currentTarget.style.background = '#F5F5F5'}
                                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                  <AddIcon style={{ width: 20, height: 20 }} />
                                  {t('common.move')}
                                </button>

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenDropdownId(null); // Close dropdown immediately
                                    setItemToDelete({ type: 'document', id: doc.id, name: doc.filename });
                                    setShowDeleteModal(true);
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '10px 14px',
                                    background: 'transparent',
                                    border: 'none',
                                    borderRadius: 6,
                                    cursor: 'pointer',
                                    fontSize: 14,
                                    fontFamily: 'Plus Jakarta Sans',
                                    fontWeight: '500',
                                    color: '#D92D20',
                                    transition: 'background 0.2s ease',
                                    textAlign: 'left',
                                    width: '100%'
                                  }}
                                  onMouseEnter={(e) => e.currentTarget.style.background = '#FEE2E2'}
                                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                  <TrashCanIcon style={{ width: 20, height: 20 }} />
                                  {t('common.delete')}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  });
                  })()}
                </div>
              ) : (
                <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 200}}>
                  <div style={{color: '#6C6B6E', fontSize: 16, fontFamily: 'Plus Jakarta Sans', fontWeight: '500'}}>{t('documents.noDocuments')}</div>
                </div>
              )}
            </div>
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
      />

      {/* Create Category From Move Modal */}
      <CreateCategoryModal
        isOpen={showCreateFromMoveModal}
        onClose={() => setShowCreateFromMoveModal(false)}
        onCreateCategory={handleCreateCategoryFromMove}
        uploadedDocuments={selectedDocumentForCategory ? [selectedDocumentForCategory] : []}
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
        }}
        selectedDocument={selectedDocumentForCategory}
        categories={getRootFolders().filter(f => f.name.toLowerCase() !== 'recently added').map(f => ({
          ...f,
          fileCount: getDocumentCountByFolder(f.id)
        }))}
        selectedCategoryId={selectedCategoryId}
        onCategorySelect={setSelectedCategoryId}
        onCreateNew={() => {
          setShowCategoryModal(false);
          setShowCreateFromMoveModal(true);
        }}
        onConfirm={handleCategorySelection}
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
          // No manual refresh needed - context auto-updates!
        }}
      />

      {/* Universal Upload Modal */}
      <UniversalUploadModal
        isOpen={showUniversalUploadModal}
        onClose={() => {
          setShowUniversalUploadModal(false);
          setDroppedFiles(null);
        }}
        categoryId={null}
        onUploadComplete={() => {
          // No manual refresh needed - context auto-updates!
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
          if (itemToDeleteCopy.type === 'bulk-documents') {
            clearSelection();
            toggleSelectMode();
          }

          // Delete in background - context will update UI instantly
          (async () => {
            try {
              if (itemToDeleteCopy.type === 'bulk-documents') {
                // Handle bulk deletion of selected documents
                const deleteCount = itemToDeleteCopy.count;

                // Delete all selected documents with proper error handling
                const results = await Promise.allSettled(
                  itemToDeleteCopy.ids.map(docId => deleteDocument(docId))
                );

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

      {/* Ask Koda Floating Button - Thinking Bubble Style */}
      {showAskKoda && (
        <div style={{ width: 277, height: 82, right: 20, bottom: isMobile ? 100 : 20, position: 'absolute', zIndex: 9999 }}>
          {/* Close button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              sessionStorage.setItem('askKodaDismissed', 'true');
              setShowAskKoda(false);
            }}
            style={{
              width: 24,
              height: 24,
              right: 0,
              top: 0,
              position: 'absolute',
              background: 'white',
              borderRadius: 100,
              outline: '1px rgba(55, 53, 47, 0.09) solid',
              outlineOffset: '-1px',
              justifyContent: 'center',
              alignItems: 'center',
              display: 'inline-flex',
              border: 'none',
              cursor: 'pointer',
              zIndex: 10
            }}
          >
            <div style={{ width: 12, height: 12, position: 'relative', overflow: 'hidden' }}>
              <XCloseIcon style={{ width: 12, height: 12, position: 'absolute', left: 0, top: 0 }} />
            </div>
          </button>
          {/* Thinking bubble - Large circle */}
          <div style={{ width: 14, height: 14, right: 44, top: 9, position: 'absolute', background: '#171717', borderRadius: 9999 }} />
          <button
            onClick={async () => {
              try {
                const newConversation = await chatService.createConversation();
                navigate('/chat', { state: { newConversation } });
              } catch (error) {
                console.error('Error creating new chat:', error);
                navigate('/chat');
              }
            }}
            style={{
              height: 60,
              paddingLeft: 4,
              paddingRight: 18,
              paddingTop: 8,
              paddingBottom: 8,
              bottom: 0,
              right: 0,
              position: 'absolute',
              background: '#171717',
              borderRadius: 100,
              justifyContent: 'flex-start',
              alignItems: 'center',
              display: 'inline-flex',
              border: 'none',
              cursor: 'pointer',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div style={{ justifyContent: 'flex-start', alignItems: 'center', gap: 0, display: 'flex' }}>
              <img
                src={kodaLogoWhite}
                alt="Koda"
                style={{
                  width: 50,
                  height: 50,
                  flexShrink: 0
                }}
              />
              <div
                style={{
                  color: 'white',
                  fontSize: 15,
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: '600',
                  lineHeight: '20px',
                  wordWrap: 'break-word'
                }}
              >
                {t('documentViewer.needHelpFindingSomething')}
              </div>
            </div>
          </button>
          {/* Thinking bubble - Small circle */}
          <div style={{ width: 7, height: 7, right: 33, top: 0, position: 'absolute', background: '#171717', borderRadius: 9999 }} />
        </div>
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
      background: '#F5F5F5',
      display: 'flex',
      flexDirection: 'row'
    }}>
      <LeftNav />

      <div style={{flex: 1, height: '100%', display: 'flex', flexDirection: 'column'}}>
        {/* Header Skeleton */}
        <div style={{height: 84, paddingLeft: 20, paddingRight: 20, background: 'white', borderBottom: '1px #E6E6EC solid', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
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

