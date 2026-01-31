import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import folderIcon from '../../assets/folder_icon.svg';
import { ReactComponent as SearchIcon } from '../../assets/Search.svg';
import cleanDocumentName from '../../utils/cleanDocumentName';
import { getFileIcon } from '../../utils/files/iconMapper';

/**
 * Format file size to human readable format
 */
const formatFileSize = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

/**
 * Get file type label based on filename extension
 */
const getFileType = (filename) => {
  if (!filename) return 'FILE';
  const ext = filename.split('.').pop().toUpperCase();
  return ext;
};

/**
 * Format date to DD/MM/YYYY
 */
const formatDate = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

/**
 * Folder Preview Modal
 * Displays folder contents from the database using the FolderBrowserModal visual style:
 * - Back button + breadcrumb header + search + close
 * - Subfolder card grid with folder icon images
 * - File table with sortable NAME / TYPE / SIZE / DATE columns
 */
function FolderPreviewModal({
  isOpen,
  onClose,
  folder,
  contents,
  onNavigateToFolder,
  onOpenFile
}) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');

  // Reset search when folder changes
  useEffect(() => {
    setSearchQuery('');
  }, [folder?.id]);

  // Handle Esc key to close
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      window.document.addEventListener('keydown', handleEsc);
      window.document.body.style.overflow = 'hidden';
    }

    return () => {
      window.document.removeEventListener('keydown', handleEsc);
      window.document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  const { files = [], subfolders = [] } = contents || {};

  // Filter files based on search query
  const filteredFiles = useMemo(() => {
    if (!searchQuery) return files;
    return files.filter(file =>
      (file.filename || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [files, searchQuery]);

  // Sort files
  const sortedFiles = useMemo(() => {
    const sorted = [...filteredFiles];
    sorted.sort((a, b) => {
      if (sortBy === 'name') {
        return sortOrder === 'asc'
          ? (a.filename || '').localeCompare(b.filename || '')
          : (b.filename || '').localeCompare(a.filename || '');
      } else if (sortBy === 'type') {
        return sortOrder === 'asc'
          ? getFileType(a.filename).localeCompare(getFileType(b.filename))
          : getFileType(b.filename).localeCompare(getFileType(a.filename));
      } else if (sortBy === 'size') {
        return sortOrder === 'asc'
          ? (a.fileSize || 0) - (b.fileSize || 0)
          : (b.fileSize || 0) - (a.fileSize || 0);
      } else { // dateAdded
        return sortOrder === 'asc'
          ? new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
          : new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      }
    });
    return sorted;
  }, [filteredFiles, sortBy, sortOrder]);

  // Handle sort
  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  const handleClose = () => {
    setSearchQuery('');
    onClose();
  };

  if (!isOpen || !folder) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 20
      }}
      onClick={handleClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 1200,
          maxHeight: '90vh',
          background: 'white',
          borderRadius: 16,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #E5E7EB',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0
          }}
        >
          {/* Back Button + Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
            {/* Back Button */}
            <button
              onClick={handleClose}
              style={{
                width: 36,
                height: 36,
                padding: 0,
                background: '#F9FAFB',
                border: '1px solid #E5E7EB',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'background 0.2s',
                flexShrink: 0
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#F3F4F6'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#F9FAFB'}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 12L6 8L10 4" stroke="#6C6B6E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            {/* Breadcrumb */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  color: '#111827',
                  fontSize: 16,
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: '600',
                  cursor: 'default'
                }}
              >
                {cleanDocumentName(folder.name)}
              </span>
            </div>
          </div>

          {/* Search Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              background: '#F9FAFB',
              borderRadius: 100,
              border: '1px solid #E5E7EB',
              marginLeft: 16,
              marginRight: 16,
              minWidth: 250
            }}
          >
            <SearchIcon style={{ width: 16, height: 16 }} />
            <input
              type="text"
              placeholder={t('common.searchDocumentsPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                border: 'none',
                background: 'transparent',
                outline: 'none',
                fontSize: 14,
                fontFamily: 'Plus Jakarta Sans',
                color: '#111827',
                flex: 1
              }}
            />
          </div>

          {/* Close Button */}
          <button
            onClick={handleClose}
            style={{
              width: 32,
              height: 32,
              padding: 0,
              background: '#F9FAFB',
              border: '1px solid #E5E7EB',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'background 0.2s',
              flexShrink: 0
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#F3F4F6'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#F9FAFB'}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="#6C6B6E" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 24
          }}
        >
          {/* Subfolders Section */}
          {subfolders.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <h2
                style={{
                  fontSize: 18,
                  fontWeight: '600',
                  color: '#374151',
                  fontFamily: 'Plus Jakarta Sans',
                  margin: '0 0 16px 0'
                }}
              >
                {t('common.folders')}
              </h2>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: 16
                }}
              >
                {subfolders.map((subfolder) => (
                  <div
                    key={subfolder.id}
                    onClick={() => onNavigateToFolder(subfolder.id)}
                    style={{
                      background: 'white',
                      border: '1px solid #E5E7EB',
                      borderRadius: 12,
                      padding: 16,
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#D1D5DB';
                      e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#E5E7EB';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    {/* Folder Icon */}
                    <div
                      style={{
                        width: '100%',
                        height: 100,
                        borderRadius: 10,
                        background: 'linear-gradient(180deg, #F3F4F6 0%, #E5E7EB 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: 12
                      }}
                    >
                      <img
                        src={folderIcon}
                        alt="Folder"
                        style={{
                          width: 64,
                          height: 64,
                          filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.15))'
                        }}
                      />
                    </div>

                    {/* Folder Name */}
                    <div
                      style={{
                        color: '#111827',
                        fontSize: 14,
                        fontFamily: 'Plus Jakarta Sans',
                        fontWeight: '600',
                        marginBottom: 4,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {cleanDocumentName(subfolder.name)}
                    </div>

                    {/* File Count */}
                    <div
                      style={{
                        color: '#6B7280',
                        fontSize: 12,
                        fontFamily: 'Plus Jakarta Sans',
                        fontWeight: '400'
                      }}
                    >
                      {subfolder.fileCount} {subfolder.fileCount === 1 ? t('common.item') : t('common.items')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Files Section */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2
                style={{
                  fontSize: 18,
                  fontWeight: '600',
                  color: '#374151',
                  fontFamily: 'Plus Jakarta Sans',
                  margin: 0
                }}
              >
                {t('common.yourFiles')}
              </h2>
            </div>

            {sortedFiles.length === 0 ? (
              <div
                style={{
                  background: 'white',
                  border: '1px solid #E5E7EB',
                  borderRadius: 12,
                  padding: 40,
                  textAlign: 'center',
                  color: '#6B7280',
                  fontSize: 14,
                  fontFamily: 'Plus Jakarta Sans'
                }}
              >
                {searchQuery
                  ? t('common.noMatchingSearch')
                  : (files.length === 0 && subfolders.length === 0)
                    ? t('folderPreview.emptyFolder')
                    : t('common.noDocumentsInFolder')
                }
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {/* Table Header */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 100px 100px 110px',
                    padding: '12px 20px',
                    background: 'transparent'
                  }}
                >
                  <div
                    onClick={() => handleSort('name')}
                    style={{
                      color: '#6B7280',
                      fontSize: 12,
                      fontFamily: 'Plus Jakarta Sans',
                      fontWeight: '500',
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                      userSelect: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    NAME {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </div>
                  <div
                    onClick={() => handleSort('type')}
                    style={{
                      color: '#6B7280',
                      fontSize: 12,
                      fontFamily: 'Plus Jakarta Sans',
                      fontWeight: '500',
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                      userSelect: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    TYPE {sortBy === 'type' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </div>
                  <div
                    onClick={() => handleSort('size')}
                    style={{
                      color: '#6B7280',
                      fontSize: 12,
                      fontFamily: 'Plus Jakarta Sans',
                      fontWeight: '500',
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                      userSelect: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    SIZE {sortBy === 'size' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </div>
                  <div
                    onClick={() => handleSort('dateAdded')}
                    style={{
                      color: '#6B7280',
                      fontSize: 12,
                      fontFamily: 'Plus Jakarta Sans',
                      fontWeight: '500',
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                      userSelect: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    DATE {sortBy === 'dateAdded' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </div>
                </div>

                {/* File Rows */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {sortedFiles.map((file) => (
                    <div
                      key={file.id}
                      onClick={() => onOpenFile(file.id)}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 100px 100px 110px',
                        padding: '14px 20px',
                        alignItems: 'center',
                        background: 'white',
                        border: '1px solid #E5E7EB',
                        borderRadius: 12,
                        cursor: 'pointer',
                        transition: 'border-color 0.2s, box-shadow 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#D1D5DB';
                        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.05)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#E5E7EB';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      {/* File Name with Icon */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                        <img
                          src={getFileIcon(file.filename, file.mimeType)}
                          alt={getFileType(file.filename)}
                          style={{ width: 40, height: 40, objectFit: 'contain', flexShrink: 0, filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))' }}
                        />
                        <span
                          style={{
                            color: '#111827',
                            fontSize: 14,
                            fontFamily: 'Plus Jakarta Sans',
                            fontWeight: '500',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {cleanDocumentName(file.filename)}
                        </span>
                      </div>

                      {/* Type */}
                      <div
                        style={{
                          color: '#6B7280',
                          fontSize: 14,
                          fontFamily: 'Plus Jakarta Sans',
                          fontWeight: '400'
                        }}
                      >
                        {getFileType(file.filename)}
                      </div>

                      {/* Size */}
                      <div
                        style={{
                          color: '#6B7280',
                          fontSize: 14,
                          fontFamily: 'Plus Jakarta Sans',
                          fontWeight: '400'
                        }}
                      >
                        {formatFileSize(file.fileSize)}
                      </div>

                      {/* Date */}
                      <div
                        style={{
                          color: '#6B7280',
                          fontSize: 14,
                          fontFamily: 'Plus Jakarta Sans',
                          fontWeight: '400'
                        }}
                      >
                        {formatDate(file.createdAt)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default FolderPreviewModal;
