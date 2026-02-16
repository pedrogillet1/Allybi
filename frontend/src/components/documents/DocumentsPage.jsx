import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ROUTES, buildRoute } from '../../constants/routes';
import { useAuth } from '../../context/AuthContext';
import { useDocuments } from '../../context/DocumentsContext';
import cleanDocumentName from '../../utils/cleanDocumentName';
import { useDocumentSelection } from '../../hooks/useDocumentSelection.js';
import { useNotifications } from '../../context/NotificationsStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { colors, spacing, radius, typography } from '../../constants/designTokens';
import LeftNav from '../app-shell/LeftNav';
import NotificationPanel from '../notifications/NotificationPanel';
import CreateCategoryModal from '../library/CreateCategoryModal';
import EditCategoryModal from '../library/EditCategoryModal';
import MoveToCategoryModal from '../library/MoveToCategoryModal';
import UploadModal from '../upload/UploadModal';
import UniversalUploadModal from '../upload/UniversalUploadModal';
import DeleteConfirmationModal from '../library/DeleteConfirmationModal';
import RenameModal from '../library/RenameModal';
import { ReactComponent as ArrowLeftIcon } from '../../assets/arrow-narrow-left.svg';
import { ReactComponent as SearchIcon } from '../../assets/Search.svg';
import { ReactComponent as UploadIcon } from '../../assets/upload.svg';
import { ReactComponent as TrashCanIcon } from '../../assets/Trash can-red.svg';
import { ReactComponent as TrashCanLightIcon } from '../../assets/Trash can-light.svg';
import { ReactComponent as EditIcon } from '../../assets/Edit 5.svg';
import { ReactComponent as DownloadIcon } from '../../assets/download.svg';
import { ReactComponent as CloseIcon } from '../../assets/x-close.svg';
import { ReactComponent as DotsIcon } from '../../assets/dots.svg';
import { ReactComponent as XCloseIcon } from '../../assets/x-close.svg';
import { ReactComponent as AddIcon } from '../../assets/add.svg';
import logoSvg from '../../assets/logo.svg';
import api from '../../services/api';
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
import CategoryIcon from '../library/CategoryIcon';
import DocumentsLoadingSkeleton from './DocumentsLoadingSkeleton';
import filesIcon from '../../assets/files-icon.svg';

const EXTENSION_LABELS = {
  xlsx: 'Excel', xls: 'Excel', csv: 'Excel',
  pdf: 'PDF',
  doc: 'Word', docx: 'Word',
  ppt: 'PowerPoint', pptx: 'PowerPoint',
  txt: 'Text',
  png: 'Image', jpg: 'Image', jpeg: 'Image',
};

function getFilterLabel(filterExtensions) {
  if (!filterExtensions || filterExtensions.length === 0) return null;
  const first = EXTENSION_LABELS[filterExtensions[0]?.toLowerCase()];
  return first ? `${first} files` : 'Filtered files';
}

const DocumentsPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  // "See all" from chat — back button + extension filter
  const fromChat = location.state?.from === 'chat';
  const chatFilterExtensions = location.state?.filterExtensions || null;
  const chatFilterLabel = getFilterLabel(chatFilterExtensions);
  const { showSuccess, showDeleteSuccess, showError } = useNotifications();
  const isMobile = useIsMobile();

  // Get global state from context
  const {
    documents: contextDocuments,
    folders: contextFolders,
    loading,
    deleteDocument,
    renameDocument,
    moveToFolder,
    createFolder,
    deleteFolder,
    getRootFolders,
    getDocumentCountByFolder,
    refreshAll
  } = useDocuments();

  // Selection hook for Recently Added section
  const {
    selectedDocuments,
    selectedFolders,
    isSelectMode,
    toggleSelectMode,
    toggleDocument,
    toggleFolder,
    clearSelection,
    isSelected,
    isFolderSelected,
    totalSelected
  } = useDocumentSelection();

  // Only UI state remains local
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNotificationsPopup, setShowNotificationsPopup] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState(null);
  const [dropdownDirection, setDropdownDirection] = useState('down'); // 'up' or 'down'
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [selectedDocumentForCategory, setSelectedDocumentForCategory] = useState(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(null);
  const [categoryMenuPosition, setCategoryMenuPosition] = useState({ top: 0, left: 0 });
  const [editingCategory, setEditingCategory] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadCategoryId, setUploadCategoryId] = useState(null);
  const [showAskKoda, setShowAskKoda] = useState(true);
  const [showUniversalUploadModal, setShowUniversalUploadModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [itemToRename, setItemToRename] = useState(null);
  const [droppedFiles, setDroppedFiles] = useState(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Sorting state for Your Files table
  const [sortColumn, setSortColumn] = useState('date'); // 'name', 'type', 'size', 'date'
  const [sortDirection, setSortDirection] = useState('desc'); // 'asc' or 'desc'

  // Refs to track current state for event listener (avoids stale closures)
  const openDropdownIdRef = useRef(openDropdownId);
  const categoryMenuOpenRef = useRef(categoryMenuOpen);

  // Keep refs in sync with state
  useEffect(() => {
    openDropdownIdRef.current = openDropdownId;
  }, [openDropdownId]);

  useEffect(() => {
    categoryMenuOpenRef.current = categoryMenuOpen;
  }, [categoryMenuOpen]);

  // Close dropdown when clicking outside - attached ONCE on mount
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Use refs to get current state values (avoids stale closures)
      if (openDropdownIdRef.current && !event.target.closest('[data-dropdown]')) {
        setOpenDropdownId(null);
      }
      if (categoryMenuOpenRef.current && !event.target.closest('[data-category-menu]')) {
        setCategoryMenuOpen(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []); // Empty array - listener attached ONCE, uses refs for current state

  // Refresh data when component mounts or becomes visible
  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Computed categories (auto-updates when folders or documents change!)
  const categories = useMemo(() => {
    const result = getRootFolders()
      .filter(folder => folder.name.toLowerCase() !== 'recently added')
      .map(folder => {
        // ⚡ OPTIMIZED: Use backend-provided counts directly from folder object
        const fileCount = folder._count?.totalDocuments ?? folder._count?.documents ?? 0;
        return {
          id: folder.id,
          name: folder.name,
          emoji: folder.emoji || '__FOLDER_SVG__',
          fileCount,
          folderCount: folder._count?.subfolders || 0,
          count: fileCount
        };
      });
    return result;
  }, [contextFolders, contextDocuments, getRootFolders]); // Removed getDocumentCountByFolder dependency

  // Computed available categories for modal
  const availableCategories = useMemo(() => {
    return getRootFolders();
  }, [contextFolders, getRootFolders]);

  const handleCreateCategory = async (category) => {
    try {
      // Use context to create folder (instant UI update!)
      const newFolder = await createFolder(category.name, category.emoji);
      // If documents were selected, move them to the folder (instant UI updates!)
      if (category.selectedDocuments && category.selectedDocuments.length > 0) {
        await Promise.all(
          category.selectedDocuments.map(docId =>
            moveToFolder(docId, newFolder.id)
          )
        );
      }

      // No manual refresh needed - context auto-updates!
    } catch (error) {
      showError(t('alerts.failedToCreateCategory', { error: error.message || t('common.unknownError') }));
    }
  };

  const handleDeleteCategory = async (categoryId) => {
    try {
      // Use context to delete folder (instant UI update!)
      await deleteFolder(categoryId);
      showDeleteSuccess('folder');
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message || t('common.unknownError');
      showError(t('alerts.failedToDeleteFolder', { error: errorMessage }));
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
      showError(t('alerts.failedToDownload'));
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
        // Use context to rename (instant UI update!)
        await renameDocument(itemToRename.id, newName);
      }

      setShowRenameModal(false);
      setItemToRename(null);
    } catch (error) {
      showError(t('alerts.failedToRenameItem', { type: itemToRename.type === 'folder' ? t('common.folder') : t('common.file') }));
    }
  };

  // Handle document delete with proper error handling
  const handleDelete = async (docId) => {
    try {
      // Use context to delete (instant UI update with optimistic update!)
      const result = await deleteDocument(docId);

      // Show success message only after successful delete
      if (result && result.success) {
        showDeleteSuccess('file');
      }

      setOpenDropdownId(null);
    } catch (error) {
      // Show user-friendly error message
      showError(t('alerts.failedToDeleteDocument', { error: error.message || t('common.unknownError') }));
    }
  };

  // Handle add to category
  const handleAddToCategory = async (doc) => {
    setSelectedDocumentForCategory(doc);
    setShowCategoryModal(true);
    setOpenDropdownId(null);
  };

  const handleCategorySelection = async () => {
    if (!selectedCategoryId) return;

    // Capture state before closing modal
    const categoryId = selectedCategoryId;
    const docForCategory = selectedDocumentForCategory;
    const docsToMove = isSelectMode ? Array.from(selectedDocuments) : null;
    const foldersToMove = isSelectMode ? Array.from(selectedFolders) : [];
    const moveCount = totalSelected;

    // Close modal IMMEDIATELY for snappy UX
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
        // Use context to move single document (instant UI update!)
        moveToFolder(docForCategory.id, categoryId);
        showSuccess(t('toasts.fileMovedSuccessfully'));
      }
    } catch (error) {
      showError(t('alerts.failedToAddDocsToCategory'));
    }
  };

  // Filter documents based on search query + optional extension filter from chat (auto-updates!)
  const filteredDocuments = useMemo(() => {
    let docs = contextDocuments;

    // Apply extension filter when navigated from chat "See all"
    if (chatFilterExtensions && chatFilterExtensions.length > 0) {
      const exts = new Set(chatFilterExtensions.map(e => e.toLowerCase()));
      docs = docs.filter(doc => {
        const filename = (doc.filename || doc.name || '').toLowerCase();
        const ext = filename.match(/\.([^.]+)$/)?.[1];
        return ext && exts.has(ext);
      });
    }

    // Apply search filter
    if (searchQuery) {
      docs = docs.filter(doc =>
        (doc.filename || doc.name || '').toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return docs;
  }, [contextDocuments, searchQuery, chatFilterExtensions]);

  // Get file icon based on document type
  const getFileIcon = (doc) => {
    // Prioritize MIME type over file extension (more reliable for encrypted filenames)
    const mimeType = doc?.mimeType || '';
    const filename = doc?.filename || '';

    // ========== VIDEO FILES ==========
    // QuickTime videos (.mov) - MUST check before generic video check
    if (mimeType === 'video/quicktime') {
      return movIcon; // Blue MOV icon
    }

    // MP4 videos - specific check only
    if (mimeType === 'video/mp4') {
      return mp4Icon; // Pink MP4 icon
    }

    // Other video types - use generic video icon (mp4)
    if (mimeType.startsWith('video/')) {
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

  // Handle page-level file drop
  const handlePageDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      // Set both states together using functional updates to ensure they batch correctly
      setDroppedFiles(files);
      // Use setTimeout to ensure the files state is set before opening modal
      setTimeout(() => {
        setShowUniversalUploadModal(true);
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

  // ✅ Show loading skeleton on first load (when loading and no data)
  if (loading && contextDocuments.length === 0 && contextFolders.length === 0) {
    return (
      <div style={{
        width: '100%',
        height: isMobile ? 'auto' : '100vh',
        minHeight: isMobile ? '100vh' : 'auto',
        background: '#F4F4F6',
        overflow: isMobile ? 'visible' : 'hidden',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row'
      }}>
        <LeftNav onNotificationClick={() => setShowNotificationsPopup(true)} />
        <div style={{flex: 1, overflow: 'hidden'}}>
          <DocumentsLoadingSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div data-page="documents" className="documents-page" style={{
      width: '100%',
      height: isMobile ? 'auto' : '100vh',
      minHeight: isMobile ? '100vh' : 'auto',
      background: '#F4F4F6',
      overflow: isMobile ? 'visible' : 'hidden',
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row'
    }}>
      <LeftNav onNotificationClick={() => setShowNotificationsPopup(true)} />

      {/* Main Content */}
      <div
        style={{
          flex: 1,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          width: isMobile ? '100%' : 'auto'
        }}
        onDrop={handlePageDrop}
        onDragOver={handlePageDragOver}
        onDragLeave={handlePageDragLeave}
      >
        {/* Header */}
        <div data-documents-header="true" className="mobile-sticky-header" style={{
          minHeight: isMobile ? 56 : 72,
          paddingLeft: isMobile ? 16 : 48,
          paddingRight: isMobile ? 16 : 48,
          background: colors.white,
          borderBottom: `1px solid ${colors.gray[300]}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxSizing: 'border-box',
          position: isMobile ? 'sticky' : 'relative',
          top: isMobile ? 0 : 'auto',
          zIndex: isMobile ? 10 : 'auto'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: isMobile ? 1 : 'auto' }}>
            <button
              onClick={() => fromChat ? navigate(-1) : navigate(ROUTES.HOME)}
              style={{
                width: isMobile ? 36 : 40,
                height: isMobile ? 36 : 40,
                background: '#F3F4F6',
                borderRadius: 8,
                border: '1px solid #E5E7EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                flexShrink: 0,
                padding: 0,
                marginLeft: isMobile ? 0 : -28
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#E5E7EB'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#F3F4F6'; }}
            >
              <ArrowLeftIcon style={{ width: 18, height: 18, stroke: '#181818' }} />
            </button>
            <div style={{
              color: colors.gray[900],
              fontSize: isMobile ? 18 : typography.sizes.xl,
              fontFamily: typography.fontFamily,
              fontWeight: typography.weights.semibold,
              textTransform: 'capitalize',
              lineHeight: typography.lineHeights.xl,
              textAlign: 'left',
            }}>
              {chatFilterLabel || t('documents.title')}
            </div>
          </div>
          {/* Hide search and select controls on mobile */}
          {!isMobile && (
          <div style={{display: 'flex', alignItems: 'center', gap: spacing.md}}>
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
                    opacity: totalSelected > 0 ? 1 : 0.5
                  }}
                >
                  <TrashCanLightIcon style={{ width: 18, height: 18 }} />
                  <span style={{ color: '#D92D20', fontSize: 15, fontFamily: 'Plus Jakarta Sans', fontWeight: '600' }}>
                    {t('documents.delete')}{totalSelected > 0 ? ` (${totalSelected})` : ''}
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
                    opacity: totalSelected > 0 ? 1 : 0.5
                  }}
                >
                  <AddIcon style={{ width: 18, height: 18, filter: 'brightness(0) invert(0.2)' }} />
                  <span style={{ color: '#32302C', fontSize: 15, fontFamily: 'Plus Jakarta Sans', fontWeight: '600' }}>
                    {t('documents.move')}{totalSelected > 0 ? ` (${totalSelected})` : ''}
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
                    color: '#111827'
                  }}
                >
                  {t('documents.cancel')}
                </button>
              </>
            ) : (
              <>
                <div
                  style={{
                    position: 'relative',
                    height: 44,
                    display: 'flex',
                    alignItems: 'center',
                    transition: 'transform 0.15s ease',
                    cursor: 'text'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                >
                  <SearchIcon style={{position: 'absolute', left: 16, width: 20, height: 20, zIndex: 1, filter: 'brightness(0) invert(0.2)'}} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('documents.search')}
                    style={{
                      height: '100%',
                      minWidth: 250,
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
                    {filteredDocuments.length > 0 ? (
                      <div style={{padding: 8}}>
                        {filteredDocuments.map((doc) => (
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
                            <img
                              src={getFileIcon(doc)}
                              alt=""
                              style={{
                                width: 40,
                                height: 40,
                                objectFit: 'contain',
                                flexShrink: 0
                              }}
                            />
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
                        ))}
                      </div>
                    ) : (
                      <div style={{
                        padding: 40,
                        textAlign: 'center',
                        color: '#6C6B6E',
                        fontSize: 14,
                        fontFamily: 'Plus Jakarta Sans'
                      }}>
                        No documents found matching "{searchQuery}"
                      </div>
                    )}
                  </div>
                )}
                </div>

                {/* Select Button */}
                <button
                  onClick={toggleSelectMode}
                  style={{
                    height: 44,
                    paddingLeft: 18,
                    paddingRight: 18,
                    background: '#F5F5F5',
                    borderRadius: 100,
                    border: '1px #E6E6EC solid',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: 6,
                    display: 'inline-flex',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{
                    color: '#32302C',
                    fontSize: 14,
                    fontFamily: 'Plus Jakarta Sans',
                    fontWeight: '600',
                    lineHeight: '20px',
                  }}>
                    {t('documents.select')}
                  </div>
                </button>

                <div onClick={() => setShowUniversalUploadModal(true)} style={{height: 44, paddingLeft: 20, paddingRight: 20, background: '#181818', borderRadius: 9999, border: 'none', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flexShrink: 0, transition: 'background 120ms ease, transform 160ms cubic-bezier(0.2,0.8,0.2,1)', color: 'white'}} onMouseEnter={(e) => { e.currentTarget.style.background = '#0F0F0F'; e.currentTarget.style.transform = 'translateY(-1px)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = '#181818'; e.currentTarget.style.transform = 'translateY(0)'; }}>
                  <UploadIcon style={{width: 18, height: 18, filter: 'brightness(0) invert(1)'}} />
                  <span style={{fontSize: 14, fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 600, lineHeight: '20px'}}>Upload</span>
                </div>
              </>
            )}
          </div>
          )}
        </div>

        {/* Scrollable Content */}
        <div className="documents-content scrollable-content" style={{flex: 1, padding: isMobile ? spacing.xl : 48, paddingBottom: isMobile ? 'calc(var(--tabbar-h, 70px) + env(safe-area-inset-bottom) + 24px)' : 48, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: spacing.xl, WebkitOverflowScrolling: 'touch'}}>
          {/* Smart Categories */}
          <div style={{display: 'flex', flexDirection: 'column', gap: spacing.md}}>
            <div style={{display: isMobile ? 'flex' : 'grid', flexDirection: isMobile ? 'column' : undefined, gridTemplateColumns: isMobile ? undefined : 'repeat(4, 1fr)', gap: spacing.md}}>
              <div onClick={() => setIsModalOpen(true)} style={{
                padding: isMobile ? '10px' : `${spacing.lg}px`,
                background: colors.white,
                borderRadius: isMobile ? 14 : radius.xl,
                border: isMobile ? '1px solid #E6E6EC' : `2px solid ${colors.gray[300]}`,
                boxShadow: isMobile ? 'none' : '0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06)',
                display: 'flex',
                alignItems: 'center',
                gap: spacing.sm,
                cursor: 'pointer',
                minHeight: 72,
                height: isMobile ? 'auto' : 72,
                boxSizing: 'border-box',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease'
              }} onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
                <div style={{width: 40, height: 40, background: colors.gray[100], borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0}}>
                  <AddIcon style={{ width: 20, height: 20, filter: 'brightness(0) invert(0.2)' }} />
                </div>
                <span style={{color: colors.gray[900], fontSize: typography.sizes.sm, fontFamily: typography.fontFamily, fontWeight: typography.weights.semibold, lineHeight: '19.60px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0}}>{t('documents.newFolder')}</span>
              </div>
              {categories.map((category, index) => {
                const folderSelected = isSelectMode && isFolderSelected(category.id);
                return (
                <div
                  key={index}
                  onDragOver={(e) => {
                    if (isSelectMode) return;
                    e.preventDefault();
                    e.currentTarget.style.background = colors.primary[50];
                    e.currentTarget.style.border = `2px dashed ${colors.primary[800]}`;
                  }}
                  onDragLeave={(e) => {
                    if (isSelectMode) return;
                    e.currentTarget.style.background = colors.white;
                    e.currentTarget.style.border = `1px solid ${colors.gray[300]}`;
                  }}
                  onDrop={async (e) => {
                    if (isSelectMode) return;
                    e.preventDefault();
                    e.currentTarget.style.background = colors.white;
                    e.currentTarget.style.border = `1px solid ${colors.gray[300]}`;

                    try {
                      const data = JSON.parse(e.dataTransfer.getData('application/json'));

                      if (data.type === 'document') {
                        // Move single document
                        await moveToFolder(data.id, category.id);
                      } else if (data.type === 'documents') {
                        // Move multiple documents
                        await Promise.all(
                          data.documentIds.map(docId => moveToFolder(docId, category.id))
                        );
                        // Clear selection and exit select mode
                        if (isSelectMode) {
                          clearSelection();
                          toggleSelectMode();
                        }
                      }

                      // ⚡ REMOVED: No need to refreshAll() - moveToFolder already updates state optimistically with instant folder count updates
                    } catch (error) {
                      // On error, the moveToFolder function will rollback automatically
                    }
                  }}
                  onClick={() => {
                    if (isSelectMode) {
                      toggleFolder(category.id);
                    }
                  }}
                  style={{
                    padding: isMobile ? '10px' : '14px 16px',
                    background: folderSelected ? '#F0F0F0' : 'white',
                    borderRadius: isMobile ? 14 : radius.xl,
                    border: folderSelected
                      ? '2px solid #32302C'
                      : isMobile ? '1px solid #E6E6EC' : `2px solid ${colors.gray[300]}`,
                    boxShadow: isMobile ? 'none' : '0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: isMobile ? 12 : 12,
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease, background 160ms ease, border 160ms ease',
                    position: 'relative',
                    minHeight: 72,
                    height: isMobile ? 'auto' : 72,
                    boxSizing: 'border-box',
                    zIndex: categoryMenuOpen === category.id ? 99999 : 1,
                    cursor: isSelectMode ? 'pointer' : 'default'
                  }}
                >
                  {/* Selection checkmark */}
                  {isSelectMode && (
                    <div style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      border: folderSelected ? 'none' : '2px solid #D0D0D0',
                      background: folderSelected ? '#181818' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      transition: 'all 160ms ease',
                    }}>
                      {folderSelected && (
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M3 7L6 10L11 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                  )}

                  <div onClick={(e) => {
                    if (isSelectMode) {
                      e.stopPropagation();
                      toggleFolder(category.id);
                    } else {
                      navigate(buildRoute.folder(category.id));
                    }
                  }} style={{display: 'flex', alignItems: 'center', gap: 12, flex: 1, cursor: 'pointer', minWidth: 0}} onMouseEnter={(e) => { if (!isSelectMode) e.currentTarget.parentElement.style.transform = 'translateY(-2px)'; }} onMouseLeave={(e) => { if (!isSelectMode) e.currentTarget.parentElement.style.transform = 'translateY(0)'; }}>
                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0}}>
                      <CategoryIcon emoji={category.emoji} size={isMobile ? 40 : 42} />
                    </div>
                    <div style={{display: 'flex', flexDirection: 'column', gap: spacing.xs, flex: 1, minWidth: 0}}>
                      <div style={{color: colors.gray[900], fontSize: typography.sizes.sm, fontFamily: typography.fontFamily, fontWeight: typography.weights.semibold, lineHeight: '19.60px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{category.name}</div>
                      <div style={{color: colors.gray[500], fontSize: typography.sizes.sm, fontFamily: typography.fontFamily, fontWeight: typography.weights.medium, lineHeight: '15.40px'}}>
                        {t('documents.filesCount', { count: category.fileCount || 0 })}
                      </div>
                    </div>
                  </div>
                  {/* Kebab menu - hidden in select mode */}
                  {!isSelectMode && (
                  <div style={{position: 'relative'}} data-category-menu>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (categoryMenuOpen === category.id) {
                          setCategoryMenuOpen(null);
                        } else {
                          const buttonRect = e.currentTarget.getBoundingClientRect();
                          const dropdownHeight = 160;
                          const dropdownWidth = 160;
                          const spaceBelow = window.innerHeight - buttonRect.bottom;
                          const openUpward = spaceBelow < dropdownHeight && buttonRect.top > dropdownHeight;
                          // Calculate left position with bounds checking
                          let leftPos = buttonRect.right - dropdownWidth;
                          leftPos = Math.max(8, Math.min(leftPos, window.innerWidth - dropdownWidth - 8));
                          setCategoryMenuPosition({
                            top: openUpward ? buttonRect.top - dropdownHeight - 4 : buttonRect.bottom + 4,
                            left: leftPos
                          });
                          setCategoryMenuOpen(category.id);
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
                      onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                      onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                    >
                      <DotsIcon style={{width: 24, height: 24, pointerEvents: 'auto', filter: 'brightness(0) invert(0.2)'}} />
                    </button>
                    {categoryMenuOpen === category.id && (
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
                        }}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingCategory(category);
                            setShowEditModal(true);
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
                            transition: 'background 0.2s ease'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#F9FAFB'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          <EditIcon style={{width: 16, height: 16, filter: 'brightness(0) invert(0.2)'}} />
                          {t('common.edit')}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // Show upload modal for this category
                            setUploadCategoryId(category.id);
                            setShowUniversalUploadModal(true);
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
                            transition: 'background 0.2s ease'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#F9FAFB'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          <UploadIcon style={{width: 16, height: 16, filter: 'brightness(0) invert(0.2)'}} />
                          {t('nav.upload')}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setItemToDelete({ type: 'category', id: category.id, name: category.name });
                            setShowDeleteModal(true);
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
                            transition: 'background 0.2s ease'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#FEF3F2'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          <TrashCanIcon style={{width: 16, height: 16, filter: 'brightness(0) saturate(100%) invert(19%) sepia(93%) saturate(3000%) hue-rotate(352deg) brightness(93%) contrast(90%)'}} />
                          {t('documents.delete')}
                        </button>
                      </div>
                    )}
                  </div>
                  )}
                </div>
                );
              })}
            </div>
          </div>

          {/* Recently Added - Full Width */}
          <div style={{
            padding: spacing.xxl,
            background: colors.white,
            borderRadius: 20,
            border: `2px solid ${colors.gray[300]}`,
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xxl}}>
              <div style={{color: colors.gray[900], fontSize: typography.sizes.lg, fontFamily: typography.fontFamily, fontWeight: typography.weights.bold}}>{t('documents.allDocuments')}</div>
              <div
                onClick={() => navigate(buildRoute.category('recently-added'))}
                style={{color: colors.gray[900], fontSize: typography.sizes.md, fontFamily: typography.fontFamily, fontWeight: typography.weights.bold, lineHeight: '22.40px', cursor: 'pointer'}}
              >
                {t('documents.seeAll')}
              </div>
            </div>

            {(() => {
              // Show ALL documents (regardless of folder) in the All Documents section
              const rootDocuments = contextDocuments;
              const combinedItems = [
                ...rootDocuments.map(d => ({ ...d, isDocument: true }))
              ];

              // Helper function to get file type for sorting
              const getFileTypeForSort = (doc) => {
                if (doc.isFolder) return 'Folder';
                const filename = doc?.filename || '';
                const ext = filename.match(/\.([^.]+)$/)?.[1]?.toUpperCase() || '';
                return ext || 'File';
              };

              // Sort based on current sort column and direction
              const recentItems = combinedItems
                .slice()
                .sort((a, b) => {
                  let comparison = 0;

                  switch (sortColumn) {
                    case 'name':
                      const nameA = a.isFolder ? (a.name || '') : (a.filename || '');
                      const nameB = b.isFolder ? (b.name || '') : (b.filename || '');
                      comparison = nameA.localeCompare(nameB);
                      break;
                    case 'type':
                      comparison = getFileTypeForSort(a).localeCompare(getFileTypeForSort(b));
                      break;
                    case 'size':
                      const sizeA = a.isFolder ? (a.fileCount || 0) : (a.fileSize || 0);
                      const sizeB = b.isFolder ? (b.fileCount || 0) : (b.fileSize || 0);
                      comparison = sizeA - sizeB;
                      break;
                    case 'date':
                    default:
                      comparison = new Date(a.createdAt) - new Date(b.createdAt);
                      break;
                  }

                  return sortDirection === 'asc' ? comparison : -comparison;
                })
                .slice(0, 10);

              return recentItems.length > 0 ? (
              <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
                {/* Table Header - Hidden on mobile */}
                {!isMobile && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr 1fr 50px',
                  gap: 16,
                  padding: '12px 16px',
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
                        fontSize: 12,
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
                {recentItems.map((item) => {
                  // If it's a folder, render folder
                  if (item.isFolder) {
                    return (
                      <div
                        key={item.id}
                        onClick={() => navigate(buildRoute.folder(item.id))}
                        style={isMobile ? {
                          display: 'flex',
                          alignItems: 'center',
                          gap: 14,
                          padding: 14,
                          borderRadius: 14,
                          background: '#F5F5F5',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          marginBottom: 8
                        } : {
                          display: 'grid',
                          gridTemplateColumns: '2fr 1fr 1fr 1fr 50px',
                          gap: 16,
                          alignItems: 'center',
                          padding: '12px 16px',
                          borderRadius: 10,
                          background: 'white',
                          border: '2px solid #E6E6EC',
                          cursor: 'pointer',
                          transition: 'background 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#F9F9F9';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'white';
                        }}
                      >
                        {isMobile ? (
                          <>
                            <img src={folderIcon} alt="Folder" style={{width: 48, height: 48, flexShrink: 0, filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))'}} />
                            <div style={{flex: 1, overflow: 'hidden'}}>
                              <div style={{color: '#32302C', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                                {cleanDocumentName(item.name)}
                              </div>
                              <div style={{color: '#6C6B6E', fontSize: 12, fontFamily: 'Plus Jakarta Sans', fontWeight: '500', marginTop: 5}}>
                                {item.fileCount || 0} items
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <div style={{display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden'}}>
                              <img src={folderIcon} alt="Folder" style={{width: 40, height: 40, flexShrink: 0, filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))'}} />
                              <div style={{color: '#32302C', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                                {cleanDocumentName(item.name)}
                              </div>
                            </div>
                            <div style={{color: '#6C6B6E', fontSize: 13, fontFamily: 'Plus Jakarta Sans'}}>{t('documents.folder')}</div>
                            <div style={{color: '#6C6B6E', fontSize: 13, fontFamily: 'Plus Jakarta Sans'}}>{item.fileCount || 0} items</div>
                            <div style={{color: '#6C6B6E', fontSize: 13, fontFamily: 'Plus Jakarta Sans'}}>{new Date(item.createdAt).toLocaleDateString()}</div>
                            <div></div>
                          </>
                        )}
                      </div>
                    );
                  }

                  // Otherwise render document
                  const doc = item;
                  const getFileIcon = (doc) => {
                    // Prioritize MIME type over file extension (more reliable for encrypted filenames)
                    const mimeType = doc?.mimeType || '';
                    const filename = doc?.filename || '';

                    // ========== VIDEO FILES ==========
                    // QuickTime videos (.mov) - MUST check before generic video check
                    if (mimeType === 'video/quicktime') {
                      return movIcon; // Blue MOV icon
                    }

                    // MP4 videos - specific check only
                    if (mimeType === 'video/mp4') {
                      return mp4Icon; // Pink MP4 icon
                    }

                    // Other video types - use generic video icon (mp4)
                    if (mimeType.startsWith('video/')) {
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
                      draggable={!isMobile}
                      onDragStart={(e) => {
                        // If in select mode and this doc is selected, drag all selected docs
                        if (isSelectMode && isSelected(doc.id)) {
                          e.dataTransfer.setData('application/json', JSON.stringify({
                            type: 'documents',
                            documentIds: Array.from(selectedDocuments)
                          }));
                        } else {
                          // Otherwise just drag this one document
                          e.dataTransfer.setData('application/json', JSON.stringify({
                            type: 'document',
                            id: doc.id
                          }));
                        }
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragEnd={(e) => {
                        e.currentTarget.style.opacity = '1';
                      }}
                      onClick={() => {
                        if (isSelectMode) {
                          toggleDocument(doc.id);
                        } else {
                          navigate(buildRoute.document(doc.id));
                        }
                      }}
                      style={isMobile ? {
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: 10,
                        borderRadius: 14,
                        background: isSelectMode && isSelected(doc.id) ? '#E8E8EC' : 'white',
                        border: '1px solid #E6E6EC',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        marginBottom: 8,
                        minHeight: 72,
                        boxSizing: 'border-box',
                        position: 'relative',
                        zIndex: openDropdownId === doc.id ? 99999 : 1
                      } : {
                        display: 'grid',
                        gridTemplateColumns: '2fr 1fr 1fr 1fr 50px',
                        gap: 16,
                        alignItems: 'center',
                        padding: '12px 16px',
                        borderRadius: 10,
                        background: isSelectMode && isSelected(doc.id) ? '#F3F3F5' : 'white',
                        border: '2px solid #E6E6EC',
                        cursor: isSelectMode ? 'pointer' : 'pointer',
                        transition: 'background 0.2s ease',
                        position: 'relative',
                        zIndex: openDropdownId === doc.id ? 99999 : 1
                      }}
                      onMouseEnter={(e) => {
                        if (isMobile) return;
                        if (isSelectMode && isSelected(doc.id)) {
                          e.currentTarget.style.background = '#E8E8EC';
                        } else {
                          e.currentTarget.style.background = '#F7F7F9';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (isMobile) return;
                        e.currentTarget.style.background = isSelectMode && isSelected(doc.id) ? '#F3F3F5' : 'white';
                      }}
                    >
                      {isMobile ? (
                        <>
                          <img
                            src={getFileIcon(doc)}
                            alt="File icon"
                            style={{
                              width: 40,
                              height: 40,
                              flexShrink: 0,
                              imageRendering: 'auto',
                              objectFit: 'contain'
                            }}
                          />
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
                              fontWeight: '500',
                              marginTop: 5
                            }}>
                              {formatBytes(doc.fileSize)} • {new Date(doc.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          {/* Name Column */}
                          <div style={{display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden'}}>
                            <img
                              src={getFileIcon(doc)}
                              alt="File icon"
                              style={{
                                width: 40,
                                height: 40,
                                flexShrink: 0,
                                imageRendering: 'auto',
                                objectFit: 'contain',
                                filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))'
                              }}
                            />
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
                          </div>
                          {/* Type Column */}
                          <div style={{
                            color: '#6C6B6E',
                            fontSize: 13,
                            fontFamily: 'Plus Jakarta Sans'
                          }}>
                            {getFileType(doc)}
                          </div>
                          {/* Size Column */}
                          <div style={{
                            color: '#6C6B6E',
                            fontSize: 13,
                            fontFamily: 'Plus Jakarta Sans'
                          }}>
                            {formatBytes(doc.fileSize)}
                          </div>
                          {/* Date Column */}
                          <div style={{
                            color: '#6C6B6E',
                            fontSize: 13,
                            fontFamily: 'Plus Jakarta Sans'
                          }}>
                            {new Date(doc.createdAt).toLocaleDateString()}
                          </div>
                        </>
                      )}
                      {/* Actions Column */}
                      {!isSelectMode && <div style={{position: 'relative', flexShrink: 0}} data-dropdown>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (openDropdownId === doc.id) {
                              setOpenDropdownId(null);
                            } else {
                              // Calculate space above/below to determine dropdown direction
                              const buttonRect = e.currentTarget.getBoundingClientRect();
                              const dropdownHeight = 200;
                              const spaceBelow = window.innerHeight - buttonRect.bottom;
                              const spaceAbove = buttonRect.top;
                              setDropdownDirection(spaceBelow < dropdownHeight && spaceAbove > spaceBelow ? 'up' : 'down');
                              setOpenDropdownId(doc.id);
                            }
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
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
                          <DotsIcon style={{width: 24, height: 24, pointerEvents: 'auto', filter: 'brightness(0) invert(0.2)'}} />
                        </button>

                        {openDropdownId === doc.id && (
                          <div
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
                              zIndex: 100,
                              minWidth: 160
                            }}
                          >
                            <div style={{padding: 4, display: 'flex', flexDirection: 'column', gap: 1}}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownload(doc);
                                }}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  padding: '8px 14px',
                                  background: 'transparent',
                                  border: 'none',
                                  borderRadius: 6,
                                  cursor: 'pointer',
                                  fontSize: 14,
                                  fontFamily: 'Plus Jakarta Sans',
                                  fontWeight: '500',
                                  color: '#32302C',
                                  transition: 'background 0.2s ease'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = '#F5F5F5'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                              >
                                <DownloadIcon style={{width: 16, height: 16, filter: 'brightness(0) invert(0.2)'}} />
                                {t('documents.download')}
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
                                  padding: '8px 14px',
                                  background: 'transparent',
                                  border: 'none',
                                  borderRadius: 6,
                                  cursor: 'pointer',
                                  fontSize: 14,
                                  fontFamily: 'Plus Jakarta Sans',
                                  fontWeight: '500',
                                  color: '#32302C',
                                  transition: 'background 0.2s ease'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = '#F5F5F5'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                              >
                                <EditIcon style={{width: 16, height: 16, filter: 'brightness(0) invert(0.2)'}} />
                                {t('documents.rename')}
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
                                  padding: '8px 14px',
                                  background: 'transparent',
                                  border: 'none',
                                  borderRadius: 6,
                                  cursor: 'pointer',
                                  fontSize: 14,
                                  fontFamily: 'Plus Jakarta Sans',
                                  fontWeight: '500',
                                  color: '#32302C',
                                  transition: 'background 0.2s ease'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = '#F5F5F5'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                              >
                                <AddIcon style={{ width: 16, height: 16, filter: 'brightness(0) invert(0.2)' }} />
                                {t('common.move')}
                              </button>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setItemToDelete({ type: 'document', id: doc.id, name: doc.filename });
                                  setShowDeleteModal(true);
                                }}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  padding: '8px 14px',
                                  background: 'transparent',
                                  border: 'none',
                                  borderRadius: 6,
                                  cursor: 'pointer',
                                  fontSize: 14,
                                  fontFamily: 'Plus Jakarta Sans',
                                  fontWeight: '500',
                                  color: '#D92D20',
                                  transition: 'background 0.2s ease'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = '#FEF3F2'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                              >
                                <TrashCanIcon style={{width: 16, height: 16, filter: 'brightness(0) saturate(100%) invert(19%) sepia(93%) saturate(3000%) hue-rotate(352deg) brightness(93%) contrast(90%)'}} />
                                {t('documents.delete')}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>}
                      {isSelectMode && <div></div>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 200}}>
                <div style={{color: '#6C6B6E', fontSize: 16, fontFamily: 'Plus Jakarta Sans', fontWeight: '500'}}>{t('documents.noDocuments')}</div>
              </div>
            );
            })()}
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
                textAlign: 'center'
              }}
            >
              {t('upload.dropFiles')}
            </div>
            <div
              style={{
                color: '#6C6B6E',
                fontSize: 18,
                fontFamily: 'Plus Jakarta Sans',
                fontWeight: '500',
                textAlign: 'center'
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
        onClose={() => {
          setIsModalOpen(false);
          setSelectedDocumentForCategory(null);
        }}
        onCreateCategory={handleCreateCategory}
        preSelectedDocumentId={selectedDocumentForCategory?.id}
        allDocuments={contextDocuments}
        uploadedDocuments={
          isSelectMode && selectedDocuments.size > 0
            ? contextDocuments.filter(doc => selectedDocuments.has(doc.id))
            : (selectedDocumentForCategory ? [selectedDocumentForCategory] : [])
        }
      />

      {/* Notification Panel */}
      <NotificationPanel
        showNotificationsPopup={showNotificationsPopup}
        setShowNotificationsPopup={setShowNotificationsPopup}
      />

      {/* Category Selection Modal */}
      <MoveToCategoryModal
        isOpen={showCategoryModal}
        onClose={() => {
          setShowCategoryModal(false);
          setSelectedDocumentForCategory(null);
          setSelectedCategoryId(null);
        }}
        uploadedDocuments={
          isSelectMode && selectedDocuments.size > 0
            ? contextDocuments.filter(doc => selectedDocuments.has(doc.id))
            : (selectedDocumentForCategory ? [selectedDocumentForCategory] : [])
        }
        showFilesSection={!!selectedDocumentForCategory || (isSelectMode && totalSelected > 0)}
        categories={availableCategories.filter(f => !selectedFolders.has(f.id))}
        selectedCategoryId={selectedCategoryId}
        onCategorySelect={setSelectedCategoryId}
        onCreateNew={() => {
          setShowCategoryModal(false);
          setIsModalOpen(true);
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
        onUpdate={async () => {
          // Refresh to show updated emoji immediately
          await refreshAll();
        }}
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
          refreshAll();
        }}
        categoryId={null}
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

          // Close modal IMMEDIATELY for instant feedback
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
                  showDeleteSuccess('file');
                } else if (succeeded === 0) {
                  showError(t('alerts.failedToDeleteFiles', { count: failed }));
                } else {
                  showDeleteSuccess('file');
                  showError(t('alerts.failedToDeleteFiles', { count: failed }));
                }
              } else if (itemToDeleteCopy.type === 'category') {
                await handleDeleteCategory(itemToDeleteCopy.id);
              } else if (itemToDeleteCopy.type === 'document') {
                await handleDelete(itemToDeleteCopy.id);
              }
            } catch (error) {
              showError(t('alerts.failedToDelete', { error: error.message || t('common.unknownError') }));
            }
          })();
        }}
        itemName={itemToDelete?.type === 'bulk-documents' || itemToDelete?.type === 'bulk' ? `${itemToDelete?.count}` : (itemToDelete?.name || 'this item')}
        itemType={itemToDelete?.type === 'bulk-documents' || itemToDelete?.type === 'bulk' ? 'multiple' : (itemToDelete?.type || 'item')}
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

    </div>
  );
};

export default DocumentsPage;
