import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDocuments } from '../context/DocumentsContext';
import { useDocumentSelection } from '../hooks/useDocumentSelection';
import { useIsMobile } from '../hooks/useIsMobile';
import { useToast } from '../context/ToastContext';
import LeftNav from './LeftNav';
import DeleteConfirmationModal from './DeleteConfirmationModal';
import MoveToCategoryModal from './MoveToCategoryModal';
import CreateCategoryModal from './CreateCategoryModal';

import pdfIcon from '../assets/pdf-icon.png';
import docIcon from '../assets/doc-icon.png';
import xlsIcon from '../assets/xls.png';
import jpgIcon from '../assets/jpg-icon.png';
import pngIcon from '../assets/png-icon.png';
import pptxIcon from '../assets/pptx.png';
import movIcon from '../assets/mov.png';
import mp4Icon from '../assets/mp4.png';
import txtIcon from '../assets/txt-icon.png';
import mp3Icon from '../assets/mp3.svg';

import { ReactComponent as SearchIcon } from '../assets/Search.svg';
import { ReactComponent as DotsIcon } from '../assets/dots.svg';
import { ReactComponent as TrashCanIcon } from '../assets/Trash can-red.svg';
import { ReactComponent as DownloadIcon } from '../assets/Download 3- black.svg';
import { ReactComponent as EditIcon } from '../assets/Edit 5.svg';
import { ReactComponent as AddIcon } from '../assets/add.svg';

const FileTypeDetail = () => {
  const { t } = useTranslation();
  const { fileType } = useParams();
  const navigate = useNavigate();
  const { documents, deleteDocument, folders, moveToFolder, renameDocument, downloadDocument, createFolder } = useDocuments();
  const isMobile = useIsMobile();
  const { showSuccess, showError } = useToast();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('timeAdded');
  const [sortOrder, setSortOrder] = useState('desc');
  const [viewMode, setViewMode] = useState('list');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [openDropdownId, setOpenDropdownId] = useState(null);
  const [dropdownDirection, setDropdownDirection] = useState('down'); // 'up' or 'down'
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [documentToMove, setDocumentToMove] = useState(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [showCreateCategoryModal, setShowCreateCategoryModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [itemToRename, setItemToRename] = useState(null);
  const [newName, setNewName] = useState('');

  const {
    isSelectMode,
    selectedDocuments,
    toggleSelectMode,
    toggleDocument,
    clearSelection,
    isSelected
  } = useDocumentSelection();

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openDropdownId && !event.target.closest('[data-dropdown]')) {
        setOpenDropdownId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openDropdownId]);

  const fileTypeConfig = {
    'png': { label: t('fileTypeLabels.yourPNGs'), icon: pngIcon, extensions: ['png'] },
    'jpg': { label: t('fileTypeLabels.yourJPGs'), icon: jpgIcon, extensions: ['jpg', 'jpeg'] },
    'jpeg': { label: t('fileTypeLabels.yourJPEGs'), icon: jpgIcon, extensions: ['jpg', 'jpeg'] },
    'pdf': { label: t('fileTypeLabels.yourPDFs'), icon: pdfIcon, extensions: ['pdf'] },
    'doc': { label: t('fileTypeLabels.yourDocs'), icon: docIcon, extensions: ['doc', 'docx'] },
    'docx': { label: t('fileTypeLabels.yourDocs'), icon: docIcon, extensions: ['doc', 'docx'] },
    'xls': { label: t('fileTypeLabels.yourSpreadsheets'), icon: xlsIcon, extensions: ['xls', 'xlsx'] },
    'xlsx': { label: t('fileTypeLabels.yourSpreadsheets'), icon: xlsIcon, extensions: ['xls', 'xlsx'] },
    'pptx': { label: t('fileTypeLabels.yourPresentations'), icon: pptxIcon, extensions: ['ppt', 'pptx'] },
    'ppt': { label: t('fileTypeLabels.yourPresentations'), icon: pptxIcon, extensions: ['ppt', 'pptx'] },
    'mp4': { label: t('fileTypeLabels.yourVideos'), icon: mp4Icon, extensions: ['mp4'] },
    'mov': { label: t('fileTypeLabels.yourVideos'), icon: movIcon, extensions: ['mov'] }
  };

  const config = fileTypeConfig[fileType?.toLowerCase()] || {
    label: t('fileTypeLabels.yourFiles', { type: fileType?.toUpperCase() || '' }),
    icon: null,
    extensions: [fileType?.toLowerCase()]
  };

  const filteredDocuments = useMemo(() => {
    return documents.filter(doc => {
      const ext = doc.filename?.split('.').pop()?.toLowerCase();
      return config.extensions.includes(ext);
    });
  }, [documents, config.extensions]);

  const searchedDocuments = useMemo(() => {
    let result = filteredDocuments;
    if (searchQuery) {
      result = result.filter(doc =>
        doc.filename?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    result.sort((a, b) => {
      let aVal, bVal;
      switch (sortBy) {
        case 'name':
          aVal = a.filename?.toLowerCase() || '';
          bVal = b.filename?.toLowerCase() || '';
          break;
        case 'type':
          aVal = a.filename?.split('.').pop()?.toLowerCase() || '';
          bVal = b.filename?.split('.').pop()?.toLowerCase() || '';
          break;
        case 'size':
          aVal = a.fileSize || 0;
          bVal = b.fileSize || 0;
          break;
        case 'timeAdded':
        default:
          aVal = new Date(a.createdAt).getTime();
          bVal = new Date(b.createdAt).getTime();
          break;
      }
      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      }
      return aVal < bVal ? 1 : -1;
    });
    return result;
  }, [filteredDocuments, searchQuery, sortBy, sortOrder]);

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getFileTypeDisplay = (doc) => {
    const filename = doc?.filename || '';
    const ext = filename.match(/\.([^.]+)$/)?.[1]?.toUpperCase() || '';
    return ext || 'File';
  };

  const getFileIcon = (doc) => {
    const mimeType = doc?.mimeType || '';
    const filename = doc?.filename || '';
    if (mimeType === 'video/quicktime') return movIcon;
    if (mimeType === 'video/mp4') return mp4Icon;
    if (mimeType.startsWith('video/')) return mp4Icon;
    if (mimeType.startsWith('audio/')) return mp3Icon;
    if (mimeType === 'application/pdf') return pdfIcon;
    if (mimeType.includes('word')) return docIcon;
    if (mimeType.includes('sheet') || mimeType.includes('excel')) return xlsIcon;
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return pptxIcon;
    if (mimeType === 'text/plain') return txtIcon;
    if (mimeType.startsWith('image/')) {
      if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return jpgIcon;
      if (mimeType.includes('png')) return pngIcon;
      return pngIcon;
    }
    if (filename) {
      const ext = filename.toLowerCase();
      if (ext.match(/\.(pdf)$/)) return pdfIcon;
      if (ext.match(/\.(doc|docx)$/)) return docIcon;
      if (ext.match(/\.(xls|xlsx)$/)) return xlsIcon;
      if (ext.match(/\.(ppt|pptx)$/)) return pptxIcon;
      if (ext.match(/\.(txt)$/)) return txtIcon;
      if (ext.match(/\.(jpg|jpeg)$/)) return jpgIcon;
      if (ext.match(/\.(png)$/)) return pngIcon;
      if (ext.match(/\.(mov)$/)) return movIcon;
      if (ext.match(/\.(mp4)$/)) return mp4Icon;
      if (ext.match(/\.(mp3|wav|aac|m4a)$/)) return mp3Icon;
    }
    return txtIcon;
  };

  const formatTime = (date) => {
    const now = new Date();
    const docDate = new Date(date);
    const diffMs = now - docDate;
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) {
      return t('common.today') + ', ' + docDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
    } else if (diffDays === 1) {
      return t('common.yesterday');
    } else {
      return docDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }
  };

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  const handleDelete = (doc) => {
    setItemToDelete({ type: 'document', id: doc.id, name: doc.filename });
    setShowDeleteModal(true);
    setOpenDropdownId(null);
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    const itemToDeleteCopy = itemToDelete;
    setShowDeleteModal(false);
    setItemToDelete(null);
    if (itemToDeleteCopy.type === 'bulk-documents') {
      clearSelection();
      toggleSelectMode();
      const deletePromises = itemToDeleteCopy.ids.map(docId =>
        deleteDocument(docId).catch(error => ({ success: false, error }))
      );
      const results = await Promise.all(deletePromises);
      const successCount = results.filter(r => r && r.success).length;
      if (successCount > 0) {
        showSuccess(t('toasts.fileDeletedSingular', { count: successCount }));
      }
    } else if (itemToDeleteCopy.type === 'document') {
      const result = await deleteDocument(itemToDeleteCopy.id);
      if (result && result.success) {
        showSuccess(t('toasts.fileDeleted'));
      }
    }
  };

  const handleAddToCategory = (doc) => {
    setDocumentToMove(doc);
    setShowMoveModal(true);
    setOpenDropdownId(null);
  };

  const handleMoveConfirm = async () => {
    if (!selectedCategoryId) return;

    // Capture state before closing modal
    const categoryId = selectedCategoryId;
    const docToMove = documentToMove;
    const docsToMove = isSelectMode ? Array.from(selectedDocuments) : null;
    const docCount = selectedDocuments.size;

    // Close modal IMMEDIATELY for snappy UX
    setShowMoveModal(false);
    setDocumentToMove(null);
    setSelectedCategoryId(null);

    try {
      if (isSelectMode && docsToMove && docsToMove.length > 0) {
        Promise.all(docsToMove.map(docId => moveToFolder(docId, categoryId)));
        clearSelection();
        toggleSelectMode();
        showSuccess(t('toasts.filesMovedSuccessfully', { count: docCount }));
      } else if (docToMove) {
        moveToFolder(docToMove.id, categoryId);
        showSuccess(t('toasts.fileMovedSuccessfully'));
      }
    } catch (error) {
      console.error('Error moving item:', error);
      showError(t('alerts.failedToMoveItem'));
    }
  };

  const handleCreateCategory = async (categoryData) => {
    // Capture state before closing modals
    const docToMove = documentToMove;

    // Close modals IMMEDIATELY for snappy UX
    setShowCreateCategoryModal(false);
    setShowMoveModal(false);
    setDocumentToMove(null);
    setSelectedCategoryId(null);

    try {
      const newFolder = await createFolder(categoryData.name, categoryData.emoji);
      if (newFolder && docToMove) {
        moveToFolder(docToMove.id, newFolder.id);
        showSuccess(t('toasts.fileMovedSuccessfully'));
      }
    } catch (error) {
      console.error('Error creating category:', error);
      showError(t('alerts.failedToCreateCategory'));
    }
  };

  const getRootFolders = () => {
    return folders.filter(f => !f.parentId && f.name?.toLowerCase() !== 'recently added');
  };

  const handleBulkDelete = () => {
    if (selectedDocuments.size === 0) return;
    setItemToDelete({ type: 'bulk-documents', ids: Array.from(selectedDocuments), count: selectedDocuments.size });
    setShowDeleteModal(true);
  };

  const handleBulkMove = () => {
    if (selectedDocuments.size === 0) return;
    setShowMoveModal(true);
  };

  const handleDownload = async (doc) => {
    setOpenDropdownId(null);
    try {
      await downloadDocument(doc.id, doc.filename);
      showSuccess(t('toasts.downloadedFile', { name: doc.filename }));
    } catch (error) {
      console.error('Download error:', error);
      showError(t('alerts.failedToDownloadFile'));
    }
  };

  const handleRename = (doc) => {
    setItemToRename({ type: 'document', id: doc.id, name: doc.filename });
    setNewName(doc.filename);
    setShowRenameModal(true);
    setOpenDropdownId(null);
  };

  const handleConfirmRename = async () => {
    if (!itemToRename || !newName.trim()) return;
    try {
      await renameDocument(itemToRename.id, newName.trim());
      showSuccess(t('success.renamed'));
      setShowRenameModal(false);
      setItemToRename(null);
      setNewName('');
    } catch (error) {
      console.error('Rename error:', error);
      showError(t('toasts.failedToRename', { type: 'document' }));
    }
  };

  return (
    <div data-page="file-type" className="file-type-page" style={{
      width: '100%',
      height: isMobile ? 'auto' : '100vh',
      minHeight: isMobile ? '100vh' : 'auto',
      background: '#F5F5F5',
      overflow: isMobile ? 'visible' : 'hidden',
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row'
    }}>
      <LeftNav />
      <div style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header - Title Row */}
        <div data-file-type-header="true" className="file-type-header mobile-sticky-header" style={{ background: 'white', padding: isMobile && isSelectMode ? 0 : (isMobile ? '16px' : '20px 32px'), paddingTop: isMobile && isSelectMode ? 0 : (isMobile ? 'max(env(safe-area-inset-top), 16px)' : '20px'), borderBottom: isMobile && isSelectMode ? 'none' : '1px solid #E5E7EB', position: isMobile ? 'sticky' : 'relative', top: isMobile ? 0 : 'auto', zIndex: isMobile ? 10 : 'auto', flexShrink: 0 }}>
          {/* Mobile Select Mode: Two-row layout */}
          {isMobile && isSelectMode ? (
            <>
              {/* Row 1: Title with border-bottom (same position as normal mode) */}
              <div style={{
                padding: '16px',
                paddingTop: 'max(env(safe-area-inset-top), 16px)',
                borderBottom: '1px solid #E5E7EB',
                display: 'flex',
                justifyContent: 'flex-start',
                alignItems: 'center',
                gap: 12
              }}>
                {config.icon && <img src={config.icon} alt={fileType} style={{ width: 24, height: 24, objectFit: 'contain' }} />}
                <h1 style={{
                  fontSize: 18,
                  fontWeight: '600',
                  color: '#111827',
                  fontFamily: 'Plus Jakarta Sans',
                  margin: 0
                }}>
                  {config.label}
                </h1>
              </div>
              {/* Row 2: Action buttons */}
              <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid #E5E7EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8
              }}>
                {/* Delete Button */}
                <button
                  onClick={handleBulkDelete}
                  disabled={selectedDocuments.size === 0}
                  style={{
                    height: 38,
                    paddingLeft: 12,
                    paddingRight: 12,
                    background: selectedDocuments.size > 0 ? '#FEE2E2' : '#F5F5F5',
                    borderRadius: 100,
                    border: '1px solid #E6E6EC',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    cursor: selectedDocuments.size > 0 ? 'pointer' : 'not-allowed',
                    opacity: selectedDocuments.size > 0 ? 1 : 0.5,
                    whiteSpace: 'nowrap',
                    flex: 1,
                    minWidth: 0
                  }}
                >
                  <TrashCanIcon style={{ width: 16, height: 16 }} />
                  {selectedDocuments.size > 0 && (
                    <span style={{
                      color: '#D92D20',
                      fontSize: 13,
                      fontFamily: 'Plus Jakarta Sans',
                      fontWeight: '600'
                    }}>
                      ({selectedDocuments.size})
                    </span>
                  )}
                </button>

                {/* Move Button with + icon */}
                <button
                  onClick={handleBulkMove}
                  disabled={selectedDocuments.size === 0}
                  style={{
                    height: 38,
                    paddingLeft: 12,
                    paddingRight: 12,
                    background: 'white',
                    borderRadius: 100,
                    border: '1px solid #E6E6EC',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    cursor: selectedDocuments.size > 0 ? 'pointer' : 'not-allowed',
                    opacity: selectedDocuments.size > 0 ? 1 : 0.5,
                    whiteSpace: 'nowrap',
                    flex: 1,
                    minWidth: 0
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9 3.75V14.25M3.75 9H14.25" stroke="#32302C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span style={{
                    color: '#32302C',
                    fontSize: 13,
                    fontFamily: 'Plus Jakarta Sans',
                    fontWeight: '600'
                  }}>
                    {selectedDocuments.size > 0 ? `(${selectedDocuments.size})` : ''}
                  </span>
                </button>

                {/* Cancel Button */}
                <button
                  onClick={() => { clearSelection(); toggleSelectMode(); }}
                  style={{
                    height: 38,
                    paddingLeft: 12,
                    paddingRight: 12,
                    background: 'white',
                    borderRadius: 100,
                    border: '1px solid #E6E6EC',
                    cursor: 'pointer',
                    fontFamily: 'Plus Jakarta Sans',
                    fontWeight: '600',
                    fontSize: 13,
                    color: '#111827',
                    whiteSpace: 'nowrap',
                    flex: 1,
                    minWidth: 0
                  }}
                >
                  {t('common.cancel')}
                </button>
              </div>
            </>
          ) : (
          /* Normal mode layout */
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'center' : 'flex-start', gap: isMobile ? 12 : 24, flexWrap: isMobile ? 'nowrap' : 'wrap' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Breadcrumb - desktop only */}
              {!isMobile && (
                <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span onClick={() => navigate('/home')} style={{ cursor: 'pointer', transition: 'color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.color = '#111827'} onMouseLeave={(e) => e.currentTarget.style.color = '#6B7280'}>{t('common.home')}</span>
                  <span style={{ color: '#D1D5DB' }}>›</span>
                  <span style={{ fontWeight: '500' }}>{config.label}</span>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {!isMobile && (
                  <button onClick={() => navigate(-1)} style={{ width: 40, height: 40, background: '#F3F4F6', border: '1px solid #E5E7EB', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s', padding: 0 }} onMouseEnter={(e) => e.currentTarget.style.background = '#E5E7EB'} onMouseLeave={(e) => e.currentTarget.style.background = '#F3F4F6'}>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12.5 15L7.5 10L12.5 5" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                )}
                {config.icon && <img src={config.icon} alt={fileType} style={{ width: isMobile ? 24 : 32, height: isMobile ? 24 : 32, objectFit: 'contain' }} />}
                <h1 style={{ fontSize: isMobile ? 18 : 32, fontWeight: '600', color: '#111827', fontFamily: 'Plus Jakarta Sans', margin: 0 }}>{config.label}</h1>
              </div>
            </div>
            {/* Desktop: Search + Select in header */}
            {!isMobile && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {isSelectMode ? (
                  <>
                    <button onClick={handleBulkDelete} disabled={selectedDocuments.size === 0} style={{ height: 42, paddingLeft: 18, paddingRight: 18, background: selectedDocuments.size > 0 ? '#FEE2E2' : '#F5F5F5', borderRadius: 100, border: '1px solid #E6E6EC', display: 'flex', alignItems: 'center', gap: 8, cursor: selectedDocuments.size > 0 ? 'pointer' : 'not-allowed', opacity: selectedDocuments.size > 0 ? 1 : 0.5, whiteSpace: 'nowrap' }}>
                      <TrashCanIcon style={{ width: 18, height: 18 }} />
                      <span style={{ color: '#D92D20', fontSize: 15, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', whiteSpace: 'nowrap' }}>{t('common.delete')}{selectedDocuments.size > 0 ? ' (' + selectedDocuments.size + ')' : ''}</span>
                    </button>
                    <button onClick={handleBulkMove} disabled={selectedDocuments.size === 0} style={{ height: 42, paddingLeft: 18, paddingRight: 18, background: 'white', borderRadius: 100, border: '1px solid #E6E6EC', display: 'flex', alignItems: 'center', gap: 8, cursor: selectedDocuments.size > 0 ? 'pointer' : 'not-allowed', opacity: selectedDocuments.size > 0 ? 1 : 0.5, whiteSpace: 'nowrap' }}>
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M9 3.75V14.25M3.75 9H14.25" stroke="#32302C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span style={{ color: '#32302C', fontSize: 15, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', whiteSpace: 'nowrap' }}>{t('common.move')}{selectedDocuments.size > 0 ? ' (' + selectedDocuments.size + ')' : ''}</span>
                    </button>
                    <button onClick={() => { clearSelection(); toggleSelectMode(); }} style={{ height: 42, paddingLeft: 18, paddingRight: 18, background: 'white', borderRadius: 100, border: '1px solid #E6E6EC', cursor: 'pointer', fontFamily: 'Plus Jakarta Sans', fontWeight: '600', fontSize: 15, color: '#111827', whiteSpace: 'nowrap' }}>{t('common.cancel')}</button>
                  </>
                ) : (
                  <>
                    <div style={{ paddingLeft: 12, paddingRight: 12, paddingTop: 10, paddingBottom: 10, background: 'white', borderRadius: 100, border: '1px #E5E7EB solid', display: 'flex', alignItems: 'center', gap: 8, width: 280 }}>
                      <SearchIcon style={{ width: 20, height: 20, color: '#6B7280' }} />
                      <input type="text" placeholder={t('common.searchFilesPlaceholder')} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ border: 'none', outline: 'none', background: 'transparent', color: '#111827', fontSize: 15, fontFamily: 'Plus Jakarta Sans', fontWeight: '500', flex: 1, width: '100%' }} />
                    </div>
                    <button onClick={toggleSelectMode} style={{ height: 42, paddingLeft: 18, paddingRight: 18, background: 'white', borderRadius: 100, border: '1px solid #E6E6EC', cursor: 'pointer', fontFamily: 'Plus Jakarta Sans', fontWeight: '600', fontSize: 15, color: '#111827', whiteSpace: 'nowrap' }}>{t('common.select')}</button>
                  </>
                )}
              </div>
            )}
          </div>
          )}
        </div>

        {/* Mobile Tab Bar - Search + Select */}
        {isMobile && !isSelectMode && (
          <div className="mobile-tab-bar" style={{
            padding: '12px 16px',
            paddingBottom: '12px',
            background: 'white',
            borderBottom: '1px solid #E5E7EB',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexShrink: 0
          }}>
            {/* Search Bar */}
            <div style={{
              flex: 1,
              paddingLeft: 12,
              paddingRight: 12,
              paddingTop: 10,
              paddingBottom: 10,
              background: 'white',
              borderRadius: 100,
              border: '1px #E5E7EB solid',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <SearchIcon style={{ width: 20, height: 20, color: '#6B7280' }} />
              <input
                type="text"
                placeholder={t('common.searchFilesPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  color: '#111827',
                  fontSize: 15,
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: '500',
                  flex: 1,
                  width: '100%'
                }}
              />
            </div>
            {/* Select Button */}
            <button
              onClick={toggleSelectMode}
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
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}
            >
              {t('common.select')}
            </button>
          </div>
        )}

        {/* Content */}
        <div className="file-type-content scrollable-content" style={{ flex: 1, overflow: 'auto', padding: isMobile ? '12px 16px 100px 16px' : '20px 32px 32px 32px', WebkitOverflowScrolling: 'touch' }}>
          <style>{`
            @keyframes cardFadeIn {
              from { opacity: 0; transform: translateY(10px); }
              to { opacity: 1; transform: translateY(0); }
            }
            .card-section { animation: cardFadeIn 0.3s ease-out; }
          `}</style>
          
          {searchedDocuments.length > 0 ? (
            <div className="card-section" style={{ background: 'white', borderRadius: 20, border: '2px solid #E6E6EC', padding: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: '600', color: '#374151', fontFamily: 'Plus Jakarta Sans', margin: '0 0 16px 0' }}>{t('common.documents')}</h2>
              
              {viewMode === 'list' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0, overflow: 'visible' }}>
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
                        { key: 'timeAdded', label: t('documents.tableHeaders.date') }
                      ].map(col => (
                        <div
                          key={col.key}
                          onClick={() => handleSort(col.key)}
                          style={{
                            color: sortBy === col.key ? '#171717' : '#6C6B6E',
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
                          {sortBy === col.key && (
                            <span style={{ fontSize: 10 }}>
                              {sortOrder === 'asc' ? '▲' : '▼'}
                            </span>
                          )}
                        </div>
                      ))}
                      <div></div>
                    </div>
                  )}
                  {searchedDocuments.map((doc) => (
                    <div
                      key={doc.id}
                      className="document-row"
                      onClick={() => { if (isSelectMode) toggleDocument(doc.id); else navigate('/document/' + doc.id); }}
                      style={isMobile ? {
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: 10,
                        borderRadius: 14,
                        background: isSelected(doc.id) ? '#E8E8EC' : 'white',
                        border: '1px solid #E6E6EC',
                        cursor: 'pointer',
                        marginBottom: 8,
                        position: 'relative',
                        zIndex: openDropdownId === doc.id ? 99999 : 1,
                        minHeight: 72,
                        boxSizing: 'border-box'
                      } : {
                        display: 'grid',
                        gridTemplateColumns: '2fr 1fr 1fr 1fr 50px',
                        gap: 12,
                        alignItems: 'center',
                        padding: '12px 16px',
                        borderRadius: 10,
                        background: isSelected(doc.id) ? '#F3F3F5' : 'white',
                        border: '2px solid #E6E6EC',
                        cursor: 'pointer',
                        marginBottom: 8,
                        position: 'relative',
                        zIndex: openDropdownId === doc.id ? 99999 : 1
                      }}
                    >
                      {/* Name Column */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden' }}>
                        <img src={getFileIcon(doc)} alt={doc.filename} style={{ width: 40, height: 40, objectFit: 'contain', flexShrink: 0 }} />
                        <span style={{ color: '#32302C', fontWeight: '600', fontFamily: 'Plus Jakarta Sans', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.filename}</span>
                      </div>
                      {!isMobile && (
                        <>
                          <div style={{ color: '#6C6B6E', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '500' }}>{getFileTypeDisplay(doc)}</div>
                          <div style={{ color: '#6C6B6E', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '500' }}>{formatFileSize(doc.fileSize)}</div>
                          <div style={{ color: '#6C6B6E', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '500' }}>{formatTime(doc.createdAt)}</div>
                        </>
                      )}
                      <div data-dropdown style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                        <button onClick={(e) => {
                          if (openDropdownId === doc.id) {
                            setOpenDropdownId(null);
                          } else {
                            const buttonRect = e.currentTarget.getBoundingClientRect();
                            const dropdownHeight = 200;
                            const spaceBelow = window.innerHeight - buttonRect.bottom;
                            const spaceAbove = buttonRect.top;
                            setDropdownDirection(spaceBelow < dropdownHeight && spaceAbove > spaceBelow ? 'up' : 'down');
                            setOpenDropdownId(doc.id);
                          }
                        }} style={{ width: 32, height: 32, background: 'transparent', borderRadius: '50%', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'transform 0.2s ease' }} onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}>
                          <DotsIcon style={{ width: 24, height: 24, pointerEvents: 'auto' }} />
                        </button>
                        {openDropdownId === doc.id && (
                          <div style={{ position: 'absolute', right: 0, ...(dropdownDirection === 'up' ? { bottom: '100%', marginBottom: 4 } : { top: '100%', marginTop: 4 }), background: 'white', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', border: '1px solid #E6E6EC', zIndex: 99999, minWidth: 160, overflow: 'hidden' }}>
                            <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 0 }}>
                              <button onClick={() => handleDownload(doc)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '500', color: '#32302C', transition: 'background 0.2s ease', textAlign: 'left', width: '100%' }} onMouseEnter={(e) => e.currentTarget.style.background = '#F5F5F5'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                                <DownloadIcon style={{ width: 20, height: 20 }} />
                                {t('common.download')}
                              </button>
                              <button onClick={() => handleRename(doc)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '500', color: '#32302C', transition: 'background 0.2s ease', textAlign: 'left', width: '100%' }} onMouseEnter={(e) => e.currentTarget.style.background = '#F5F5F5'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                                <EditIcon style={{ width: 20, height: 20 }} />
                                {t('common.rename')}
                              </button>
                              <button onClick={() => handleAddToCategory(doc)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '500', color: '#32302C', transition: 'background 0.2s ease', textAlign: 'left', width: '100%' }} onMouseEnter={(e) => e.currentTarget.style.background = '#F5F5F5'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                                <AddIcon style={{ width: 20, height: 20 }} />
                                {t('common.move')}
                              </button>
                              <button onClick={() => handleDelete(doc)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '500', color: '#D92D20', transition: 'background 0.2s ease', textAlign: 'left', width: '100%' }} onMouseEnter={(e) => e.currentTarget.style.background = '#FEE2E2'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                                <TrashCanIcon style={{ width: 20, height: 20 }} />
                                {t('common.delete')}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
                  {searchedDocuments.map((doc) => (
                    <div key={doc.id} onClick={() => { if (isSelectMode) toggleDocument(doc.id); else navigate('/document/' + doc.id); }} style={{ background: 'white', borderRadius: 16, border: isSelected(doc.id) ? '2px solid #32302C' : '1px solid #E6E6EC', padding: 16, cursor: 'pointer', transition: 'all 0.2s', position: 'relative' }} onMouseEnter={(e) => { if (!isSelected(doc.id)) { e.currentTarget.style.transform = 'translateY(-2px)'; } }} onMouseLeave={(e) => { if (!isSelected(doc.id)) { e.currentTarget.style.transform = 'translateY(0)'; } }}>
                      {isSelectMode && <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 2 }}><input type="checkbox" checked={isSelected(doc.id)} onChange={() => toggleDocument(doc.id)} onClick={(e) => e.stopPropagation()} style={{ width: 20, height: 20, cursor: 'pointer', accentColor: '#111827' }} /></div>}
                      <div data-dropdown style={{ position: 'absolute', top: 12, right: 12, zIndex: 99999 }} onClick={(e) => e.stopPropagation()}>
                        <button onClick={(e) => {
                          if (openDropdownId === doc.id) {
                            setOpenDropdownId(null);
                          } else {
                            const buttonRect = e.currentTarget.getBoundingClientRect();
                            const dropdownHeight = 200;
                            const spaceBelow = window.innerHeight - buttonRect.bottom;
                            const spaceAbove = buttonRect.top;
                            setDropdownDirection(spaceBelow < dropdownHeight && spaceAbove > spaceBelow ? 'up' : 'down');
                            setOpenDropdownId(doc.id);
                          }
                        }} style={{ width: 32, height: 32, background: 'white', border: '1px solid #E5E7EB', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.2s ease' }} onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}>
                          <DotsIcon style={{ width: 20, height: 20, pointerEvents: 'auto' }} />
                        </button>
                        {openDropdownId === doc.id && (
                          <div style={{ position: 'absolute', right: 0, ...(dropdownDirection === 'up' ? { bottom: '100%', marginBottom: 4 } : { top: '100%', marginTop: 4 }), background: 'white', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', border: '1px solid #E6E6EC', zIndex: 99999, minWidth: 160, overflow: 'hidden' }}>
                            <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 0 }}>
                              <button onClick={() => handleDownload(doc)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '500', color: '#32302C', transition: 'background 0.2s ease', textAlign: 'left', width: '100%' }} onMouseEnter={(e) => e.currentTarget.style.background = '#F5F5F5'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                                <DownloadIcon style={{ width: 20, height: 20 }} />
                                {t('common.download')}
                              </button>
                              <button onClick={() => handleRename(doc)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '500', color: '#32302C', transition: 'background 0.2s ease', textAlign: 'left', width: '100%' }} onMouseEnter={(e) => e.currentTarget.style.background = '#F5F5F5'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                                <EditIcon style={{ width: 20, height: 20 }} />
                                {t('common.rename')}
                              </button>
                              <button onClick={() => handleAddToCategory(doc)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '500', color: '#32302C', transition: 'background 0.2s ease', textAlign: 'left', width: '100%' }} onMouseEnter={(e) => e.currentTarget.style.background = '#F5F5F5'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                                <AddIcon style={{ width: 20, height: 20 }} />
                                {t('common.move')}
                              </button>
                              <button onClick={() => handleDelete(doc)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '500', color: '#D92D20', transition: 'background 0.2s ease', textAlign: 'left', width: '100%' }} onMouseEnter={(e) => e.currentTarget.style.background = '#FEE2E2'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                                <TrashCanIcon style={{ width: 20, height: 20 }} />
                                {t('common.delete')}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      <div style={{ width: '100%', height: 136, borderRadius: 10, background: isSelected(doc.id) ? '#F0F0F5' : '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                        <img src={getFileIcon(doc)} alt={doc.filename} style={{ width: 80, height: 80, objectFit: 'contain' }} />
                      </div>
                      <div style={{ fontSize: 14, fontWeight: '600', color: '#111827', fontFamily: 'Plus Jakarta Sans', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.filename}</div>
                      <div style={{ fontSize: 12, color: '#6B7280', fontFamily: 'Plus Jakarta Sans' }}>{formatFileSize(doc.fileSize)} • {formatTime(doc.createdAt)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="card-section" style={{ background: 'white', borderRadius: 20, border: '2px solid #E6E6EC', padding: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: '600', color: '#374151', fontFamily: 'Plus Jakarta Sans', margin: '0 0 16px 0' }}>{t('common.documents')}</h2>
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6B7280' }}>
                {config.icon && <img src={config.icon} alt={fileType} style={{ width: 64, height: 64, objectFit: 'contain', opacity: 0.5, marginBottom: 16 }} />}
                <p style={{ fontSize: 18, fontWeight: '600', fontFamily: 'Plus Jakarta Sans', margin: '0 0 8px 0', color: '#111827' }}>{t('fileTypeLabels.noFilesFound', { type: config.label.replace('Your ', '').replace('Tus ', '').replace('Seus ', '').toLowerCase() })}</p>
                <p style={{ fontSize: 14, fontFamily: 'Plus Jakarta Sans', margin: 0 }}>{searchQuery ? t('common.tryDifferentSearch') : t('common.uploadSomeFiles')}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <DeleteConfirmationModal isOpen={showDeleteModal} onClose={() => { setShowDeleteModal(false); setItemToDelete(null); }} onConfirm={handleConfirmDelete} itemName={itemToDelete?.type === 'bulk-documents' ? itemToDelete?.count : itemToDelete?.name} itemType={itemToDelete?.type === 'bulk-documents' ? 'multiple' : 'document'} />

      <MoveToCategoryModal
        isOpen={showMoveModal}
        onClose={() => { setShowMoveModal(false); setDocumentToMove(null); setSelectedCategoryId(null); }}
        selectedDocument={documentToMove}
        categories={getRootFolders()}
        selectedCategoryId={selectedCategoryId}
        onCategorySelect={setSelectedCategoryId}
        onCreateNew={() => { setShowMoveModal(false); setShowCreateCategoryModal(true); }}
        onConfirm={handleMoveConfirm}
      />

      <CreateCategoryModal
        isOpen={showCreateCategoryModal}
        onClose={() => setShowCreateCategoryModal(false)}
        onSubmit={handleCreateCategory}
      />

      {showRenameModal && (
        <div onClick={() => { setShowRenameModal(false); setItemToRename(null); setNewName(''); }} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16, boxSizing: 'border-box' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'white', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400, boxSizing: 'border-box' }}>
            <h3 style={{ fontSize: 20, fontWeight: '700', color: '#111827', fontFamily: 'Plus Jakarta Sans', marginTop: 0, marginBottom: 16 }}>{t('modals.rename.title', { item: t('common.file') })}</h3>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('modals.rename.placeholder')}
              style={{ width: '100%', padding: '12px 16px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 15, fontFamily: 'Plus Jakarta Sans', marginBottom: 24, boxSizing: 'border-box' }}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmRename(); }}
            />
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowRenameModal(false); setItemToRename(null); setNewName(''); }} style={{ padding: '10px 20px', background: 'white', border: '1px solid #E5E7EB', borderRadius: 8, cursor: 'pointer', fontSize: 15, fontWeight: '600', fontFamily: 'Plus Jakarta Sans', color: '#111827' }}>{t('common.cancel')}</button>
              <button onClick={handleConfirmRename} disabled={!newName.trim()} style={{ padding: '10px 20px', background: newName.trim() ? '#111827' : '#E5E7EB', border: 'none', borderRadius: 8, cursor: newName.trim() ? 'pointer' : 'not-allowed', fontSize: 15, fontWeight: '600', fontFamily: 'Plus Jakarta Sans', color: 'white' }}>{t('modals.rename.confirm')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileTypeDetail;
