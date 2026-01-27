import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import folderIcon from '../assets/folder_icon.svg';
import { ReactComponent as SearchIcon } from '../assets/Search.svg';
import closeButton from '../assets/close-button.svg';
import pdfIcon from '../assets/pdf-icon.png';
import docIcon from '../assets/doc-icon.png';
import txtIcon from '../assets/txt-icon.png';
import xlsIcon from '../assets/xls.png';
import jpgIcon from '../assets/jpg-icon.png';
import pngIcon from '../assets/png-icon.png';
import pptxIcon from '../assets/pptx.png';
import movIcon from '../assets/mov.png';
import mp4Icon from '../assets/mp4.png';
import mp3Icon from '../assets/mp3.svg';

/**
 * Get file type icon based on file extension
 */
const getFileIcon = (filename) => {
  if (!filename) return txtIcon;
  const ext = filename.toLowerCase();
  if (ext.match(/\.(pdf)$/)) return pdfIcon;
  if (ext.match(/\.(jpg|jpeg)$/)) return jpgIcon;
  if (ext.match(/\.(png)$/)) return pngIcon;
  if (ext.match(/\.(doc|docx)$/)) return docIcon;
  if (ext.match(/\.(txt)$/)) return txtIcon;
  if (ext.match(/\.(xls|xlsx|csv)$/)) return xlsIcon;
  if (ext.match(/\.(ppt|pptx)$/)) return pptxIcon;
  if (ext.match(/\.(mov)$/)) return movIcon;
  if (ext.match(/\.(mp4)$/)) return mp4Icon;
  if (ext.match(/\.(mp3|wav|aac|m4a)$/)) return mp3Icon;
  return txtIcon;
};

/**
 * Format file size to human readable format
 */
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

/**
 * Get file type label based on extension
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
  const fileDate = new Date(date);
  const day = String(fileDate.getDate()).padStart(2, '0');
  const month = String(fileDate.getMonth() + 1).padStart(2, '0');
  const year = fileDate.getFullYear();
  return `${day}/${month}/${year}`;
};

/**
 * Build nested folder structure from flat file list
 */
const buildFolderStructure = (files, rootFolderName) => {
  const root = { name: rootFolderName, children: {}, files: [] };

  if (!files || !Array.isArray(files)) return root;

  files.forEach(fileObj => {
    if (!fileObj) return;

    const file = fileObj.file || fileObj;
    const relativePath = file.webkitRelativePath || file.name || '';

    if (!relativePath) return;

    const pathParts = relativePath.split('/');

    let currentLevel = root;

    // Skip the root folder name if it matches the first part
    const startIndex = pathParts[0] === rootFolderName ? 1 : 0;

    // Navigate through folders
    for (let i = startIndex; i < pathParts.length - 1; i++) {
      const folderName = pathParts[i];

      if (!currentLevel.children[folderName]) {
        currentLevel.children[folderName] = {
          name: folderName,
          children: {},
          files: [],
          path: pathParts.slice(startIndex, i + 1).join('/')
        };
      }

      currentLevel = currentLevel.children[folderName];
    }

    // Add file to current folder
    const fileName = pathParts[pathParts.length - 1];
    if (fileName) {
      currentLevel.files.push({
        name: fileName,
        file: file,
        relativePath: relativePath,
        size: file.size || 0,
        type: getFileType(fileName),
        dateAdded: file.lastModified || Date.now()
      });
    }
  });

  return root;
};

/**
 * Count total items in a folder (recursive)
 */
const countItems = (folder) => {
  let count = folder.files.length;
  Object.values(folder.children).forEach(child => {
    count += countItems(child);
  });
  return count;
};

/**
 * Folder Browser Modal Component
 * Mimics the CategoryDetail view for browsing uploaded folder contents
 */
const FolderBrowserModal = ({
  isOpen,
  onClose,
  folderName,
  files,
  onRemoveFile
}) => {
  const { t } = useTranslation();
  const [currentPath, setCurrentPath] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('dateAdded');
  const [sortOrder, setSortOrder] = useState('desc');

  // Build folder structure
  const folderStructure = useMemo(() => buildFolderStructure(files, folderName), [files, folderName]);

  // Get current folder based on path
  const currentFolder = useMemo(() => {
    let folder = folderStructure;
    for (const pathPart of currentPath) {
      if (folder.children[pathPart]) {
        folder = folder.children[pathPart];
      } else {
        return folderStructure;
      }
    }
    return folder;
  }, [folderStructure, currentPath]);

  // Get subfolders in current folder
  const subFolders = useMemo(() => {
    return Object.values(currentFolder.children).map(folder => ({
      name: folder.name,
      path: folder.path,
      fileCount: countItems(folder)
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [currentFolder]);

  // Get files in current folder
  const currentFiles = useMemo(() => {
    return currentFolder.files || [];
  }, [currentFolder]);

  // Filter files based on search query
  const filteredFiles = useMemo(() => {
    if (!searchQuery) return currentFiles;
    return currentFiles.filter(file =>
      file.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [currentFiles, searchQuery]);

  // Sort files
  const sortedFiles = useMemo(() => {
    const sorted = [...filteredFiles];
    sorted.sort((a, b) => {
      if (sortBy === 'name') {
        return sortOrder === 'asc'
          ? a.name.localeCompare(b.name)
          : b.name.localeCompare(a.name);
      } else if (sortBy === 'type') {
        return sortOrder === 'asc'
          ? a.type.localeCompare(b.type)
          : b.type.localeCompare(a.type);
      } else if (sortBy === 'size') {
        return sortOrder === 'asc'
          ? a.size - b.size
          : b.size - a.size;
      } else { // dateAdded
        return sortOrder === 'asc'
          ? a.dateAdded - b.dateAdded
          : b.dateAdded - a.dateAdded;
      }
    });
    return sorted;
  }, [filteredFiles, sortBy, sortOrder]);

  // Navigate into folder
  const handleFolderClick = (folderNameToNavigate) => {
    setCurrentPath([...currentPath, folderNameToNavigate]);
    setSearchQuery('');
  };

  // Navigate to breadcrumb item
  const handleBreadcrumbClick = (index) => {
    if (index === -1) {
      setCurrentPath([]);
    } else {
      setCurrentPath(currentPath.slice(0, index + 1));
    }
    setSearchQuery('');
  };

  // Go back one level
  const handleGoBack = () => {
    if (currentPath.length > 0) {
      setCurrentPath(currentPath.slice(0, -1));
    }
    setSearchQuery('');
  };

  // Handle sort
  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  // Reset state when modal closes
  const handleClose = () => {
    setCurrentPath([]);
    setSearchQuery('');
    onClose();
  };

  if (!isOpen) return null;

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
              onClick={currentPath.length > 0 ? handleGoBack : handleClose}
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
                onClick={() => handleBreadcrumbClick(-1)}
                style={{
                  color: currentPath.length === 0 ? '#111827' : '#6B7280',
                  fontSize: 16,
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: currentPath.length === 0 ? '600' : '400',
                  cursor: 'pointer',
                  transition: 'color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#111827'}
                onMouseLeave={(e) => e.currentTarget.style.color = currentPath.length === 0 ? '#111827' : '#6B7280'}
              >
                {folderName}
              </span>

              {currentPath.map((pathItem, index) => (
                <React.Fragment key={index}>
                  <svg width="6" height="10" viewBox="0 0 6 10" fill="none">
                    <path d="M1 1L5 5L1 9" stroke="#6C6B6E" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span
                    onClick={() => handleBreadcrumbClick(index)}
                    style={{
                      color: index === currentPath.length - 1 ? '#111827' : '#6B7280',
                      fontSize: 16,
                      fontFamily: 'Plus Jakarta Sans',
                      fontWeight: index === currentPath.length - 1 ? '600' : '400',
                      cursor: 'pointer',
                      transition: 'color 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = '#111827'}
                    onMouseLeave={(e) => e.currentTarget.style.color = index === currentPath.length - 1 ? '#111827' : '#6B7280'}
                  >
                    {pathItem}
                  </span>
                </React.Fragment>
              ))}
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
          {/* Folders Section */}
          {subFolders.length > 0 && (
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
                {subFolders.map((folder, index) => (
                  <div
                    key={index}
                    onClick={() => handleFolderClick(folder.name)}
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
                      {folder.name}
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
                      {folder.fileCount} {folder.fileCount === 1 ? t('common.item') : t('common.items')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Your Files Section */}
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
                {searchQuery ? t('common.noMatchingSearch') : t('common.noDocumentsInFolder')}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {/* Table Header */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 100px 100px 110px 50px',
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
                  <div></div>
                </div>

                {/* File Rows - Each in separate card */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {sortedFiles.map((file, index) => (
                    <div
                      key={index}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 100px 100px 110px 50px',
                        padding: '14px 20px',
                        alignItems: 'center',
                        background: 'white',
                        border: '1px solid #E5E7EB',
                        borderRadius: 12,
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
                          src={getFileIcon(file.name)}
                          alt={file.type}
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
                          {file.name}
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
                        {file.type}
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
                        {formatFileSize(file.size)}
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
                        {formatDate(file.dateAdded)}
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        {onRemoveFile && (
                          <img
                            src={closeButton}
                            alt="Remove"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveFile(file.relativePath);
                            }}
                            style={{
                              width: 28,
                              height: 28,
                              cursor: 'pointer',
                              transition: 'opacity 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.7'}
                            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                          />
                        )}
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
};

export default FolderBrowserModal;
