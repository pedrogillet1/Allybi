/**
 * @deprecated LEGACY COMPONENT - Prefer UniversalUploadModal instead.
 *
 * This modal is kept for backwards compatibility but should not be used for new features.
 * UniversalUploadModal has the same functionality with better refresh guarantees.
 *
 * Migration: Replace <UploadModal> with <UniversalUploadModal> in your component.
 */
import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ReactComponent as CloseIcon } from '../assets/x-close.svg';
import { useDocuments } from '../context/DocumentsContext';
import { useToast } from '../context/ToastContext';
import UniversalAddToCategoryModal from './UniversalAddToCategoryModal';
import CreateCategoryModal from './CreateCategoryModal';
// ✅ FIX BREACH #1: Use unifiedUploadService for consistent upload handling
import unifiedUploadService from '../services/unifiedUploadService';
import { UPLOAD_CONFIG } from '../config/upload.config';
import pdfIcon from '../assets/pdf-icon.png';
import docIcon from '../assets/doc-icon.png';
import txtIcon from '../assets/txt-icon.png';
import xlsIcon from '../assets/xls.png';
import pptxIcon from '../assets/pptx.png';
import jpgIcon from '../assets/jpg-icon.png';
import pngIcon from '../assets/png-icon.png';
import movIcon from '../assets/mov.png';
import mp4Icon from '../assets/mp4.png';
import mp3Icon from '../assets/mp3.svg';
import folderIcon from '../assets/folder_icon.svg';

const UploadModal = ({ isOpen, onClose, categoryId, onUploadComplete }) => {
  const { t } = useTranslation();
  const { showError } = useToast();
  // Get context functions for optimistic uploads
  const { addDocument, moveToFolder, createFolder, pauseAutoRefresh, resumeAutoRefresh, invalidateCache, fetchAllData } = useDocuments();

  const [uploadState, setUploadState] = useState('initial'); // 'initial', 'uploading', 'complete'
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState({});
  const [uploadedDocuments, setUploadedDocuments] = useState([]); // Store uploaded document IDs
  const [showAddToCategory, setShowAddToCategory] = useState(false);
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files);

    // ✅ Resume auto-refresh after file picker closes (even if no files selected)
    resumeAutoRefresh();

    if (files.length === 0) return;
    // Extract folder paths for files with webkitRelativePath
    const filesWithPaths = files.map(file => ({
      file,
      relativePath: file.webkitRelativePath || file.name
    }));

    const newFiles = filesWithPaths.filter(item =>
      !selectedFiles.find(f => f.relativePath === item.relativePath)
    );

    setSelectedFiles(prev => [...prev, ...newFiles]);

    // Initialize progress for each file
    setUploadProgress(prev => {
      const newProgress = { ...prev };
      newFiles.forEach(item => {
        newProgress[item.relativePath] = 0;
      });
      return newProgress;
    });

    // Switch to uploading state
    setUploadState('uploading');

    // Reset file input value to allow selecting the same file again
    e.target.value = '';

    // Start uploading the new files immediately
    uploadFiles(newFiles);
  };

  const uploadFiles = async (filesToUpload) => {
    // ✅ FIX BREACH #1: Use unifiedUploadService instead of context's addDocument
    // This provides:
    // - File size validation (500MB limit)
    // - Hidden file filtering (.DS_Store, Thumbs.db)
    // - Promise.allSettled for batch resilience
    // - Resumable uploads for large files (>20MB)
    // - Integrity verification

    // Extract just the files for the unified service
    const files = filesToUpload.map(item => item.file);

    try {
      // Use unified upload service with progress tracking
      const results = await unifiedUploadService.uploadFolder(
        files,
        (progress) => {
          // Update progress for all files based on overall progress
          setUploadProgress(prev => {
            const newProgress = { ...prev };
            filesToUpload.forEach(item => {
              newProgress[item.relativePath] = progress.percentage || 0;
            });
            return newProgress;
          });
        },
        categoryId
      );

      // Process results
      if (results.successCount > 0) {
        // Store uploaded documents for "Add to Category" functionality
        if (results.documents && results.documents.length > 0) {
          setUploadedDocuments(prev => [...prev, ...results.documents]);
        }

        // Mark successful files as complete
        setUploadProgress(prev => {
          const newProgress = { ...prev };
          filesToUpload.forEach(item => {
            newProgress[item.relativePath] = 100;
          });
          return newProgress;
        });
      }

      // Handle failures
      if (results.failureCount > 0 && results.failures) {
        results.failures.forEach(failure => {
          const matchingItem = filesToUpload.find(item => item.file.name === failure.fileName);
          if (matchingItem) {
            setUploadProgress(prev => ({
              ...prev,
              [matchingItem.relativePath]: -1 // -1 indicates error
            }));
          }
          showError(t('alerts.uploadFailed', { filename: failure.fileName, error: failure.error || t('common.unknownError') }));
        });
      }

      // Transition to complete state
      if (results.successCount > 0) {
        setTimeout(() => {
          setUploadState('complete');
        }, 500);
      }

    } catch (error) {
      // Handle complete failure
      showError(t('alerts.uploadFailed', { filename: 'batch', error: error.message || t('common.unknownError') }));
      setUploadProgress(prev => {
        const newProgress = { ...prev };
        filesToUpload.forEach(item => {
          newProgress[item.relativePath] = -1;
        });
        return newProgress;
      });
    }
  };

  const handleUploadAll = async () => {
    // Upload any remaining files that haven't been uploaded
    const remainingFiles = selectedFiles.filter(item =>
      !uploadProgress[item.relativePath] || uploadProgress[item.relativePath] < 100
    );

    if (remainingFiles.length > 0) {
      await uploadFiles(remainingFiles);
    } else {
      setUploadState('complete');
    }
  };

  const handleAcceptAll = async () => {
    // ✅ FIX: Force refresh to ensure documents appear even if WebSocket fails
    // This is the same pattern as UniversalUploadModal for guaranteed visibility
    invalidateCache();
    await fetchAllData(true);

    if (onUploadComplete) {
      onUploadComplete();
    }
    handleClose();
  };

  const handleClose = () => {
    // ✅ Resume auto-refresh when modal closes
    resumeAutoRefresh();
    setUploadState('initial');
    setSelectedFiles([]);
    setUploadProgress({});
    onClose();
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileIcon = (filename) => {
    if (!filename) return txtIcon;
    const ext = filename.toLowerCase();
    if (ext.match(/\.(pdf)$/)) return pdfIcon;
    if (ext.match(/\.(doc|docx)$/)) return docIcon;
    if (ext.match(/\.(txt|csv|svg|html|htm|json|xml|md|rtf)$/)) return txtIcon;
    if (ext.match(/\.(xls|xlsx)$/)) return xlsIcon;
    if (ext.match(/\.(ppt|pptx)$/)) return pptxIcon;
    if (ext.match(/\.(jpg|jpeg)$/)) return jpgIcon;
    if (ext.match(/\.(png|gif|webp|bmp|tiff|tif|ico)$/)) return pngIcon;
    if (ext.match(/\.(mov)$/)) return movIcon;
    if (ext.match(/\.(mp4|avi|mpeg|mpg|webm)$/)) return mp4Icon;
    if (ext.match(/\.(mp3|wav|m4a|oga|weba)$/)) return mp3Icon;
    return txtIcon; // Default fallback icon for unknown files
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        width: '100%',
        maxWidth: 540,
        paddingTop: 18,
        paddingBottom: 18,
        position: 'relative',
        background: 'white',
        borderRadius: 14,
        outline: '1px #E6E6EC solid',
        outlineOffset: '-1px',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 18,
        display: 'flex'
      }}>
        {/* Header */}
        <div style={{
          alignSelf: 'stretch',
          height: 30,
          paddingLeft: 18,
          paddingRight: 18,
          justifyContent: 'space-between',
          alignItems: 'center',
          display: 'flex'
        }}>
          <div style={{
            flexDirection: 'column',
            justifyContent: 'flex-start',
            alignItems: 'center',
            gap: 12,
            display: 'flex'
          }}>
            <div style={{
              width: 304,
              textAlign: 'center',
              color: '#32302C',
              fontSize: uploadState === 'initial' ? 20 : 18,
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: '700',
              textTransform: 'capitalize',
              lineHeight: uploadState === 'initial' ? '30px' : '26px'
            }}>
              {uploadState === 'initial' && t('upload.uploadDocuments')}
              {uploadState === 'uploading' && t('upload.uploadingFiles', { count: selectedFiles.length })}
              {uploadState === 'complete' && t('upload.uploadsComplete', { count: selectedFiles.length })}
            </div>
          </div>
        </div>

        {/* Close button */}
        <button
          onClick={handleClose}
          style={{
            width: 32,
            height: 32,
            right: -16,
            top: -16,
            position: 'absolute',
            background: 'white',
            borderRadius: 100,
            outline: '1px rgba(55, 53, 47, 0.09) solid',
            outlineOffset: '-1px',
            justifyContent: 'center',
            alignItems: 'center',
            display: 'flex',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          <CloseIcon style={{ width: 12, height: 12 }} />
        </button>

        <div style={{ alignSelf: 'stretch', height: 1, background: '#E6E6EC' }} />

        {/* Content Area */}
        <div style={{
          alignSelf: 'stretch',
          paddingLeft: 18,
          paddingRight: 18,
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          display: 'flex'
        }}>
          {/* Initial State - Upload Area */}
          {uploadState === 'initial' && (
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                alignSelf: 'stretch',
                minHeight: 420,
                paddingLeft: 40,
                paddingRight: 40,
                paddingTop: 40,
                paddingBottom: 40,
                background: '#F5F5F5',
                overflow: 'visible',
                borderRadius: 20,
                outline: '1px #E6E6EC solid',
                outlineOffset: '-1px',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 32,
                display: 'flex',
                cursor: 'pointer'
              }}
            >
              {/* Document Icon */}
              <div style={{ width: 85.38, height: 80, position: 'relative' }}>
                <div style={{
                  width: 72.95,
                  height: 61.73,
                  paddingTop: 9.62,
                  paddingBottom: 7.22,
                  paddingLeft: 3.78,
                  paddingRight: 3.78,
                  left: 6.22,
                  top: 8.76,
                  position: 'absolute',
                  background: 'white',
                  boxShadow: '0px 1.6px 1.6px 1.2px rgba(68, 68, 68, 0.16)',
                  overflow: 'hidden',
                  borderRadius: 4.13,
                  outline: '0.34px #EDEDED solid',
                  outlineOffset: '-0.34px',
                  flexDirection: 'column',
                  justifyContent: 'flex-start',
                  alignItems: 'flex-start',
                  gap: 1.60,
                  display: 'flex'
                }}>
                  <div style={{ width: 64.40, height: 2.41, background: '#E2E2E0', borderRadius: 6.41 }} />
                  <div style={{ width: 25.89, height: 2.41, background: '#E2E2E0', borderRadius: 6.41 }} />
                </div>
                <div style={{
                  width: 85.38,
                  height: 51.75,
                  left: 0,
                  top: 28.25,
                  position: 'absolute',
                  background: 'linear-gradient(180deg, rgba(67, 67, 67, 0.60) 0%, rgba(0, 0, 0, 0.60) 66%)',
                  boxShadow: '0px 0.38px 1.5px rgba(255, 255, 255, 0.25) inset',
                  backdropFilter: 'blur(9.38px)',
                  borderRadius: 4
                }} />
              </div>

              {/* Text */}
              <div style={{
                flexDirection: 'column',
                justifyContent: 'flex-start',
                alignItems: 'center',
                gap: 4,
                display: 'flex'
              }}>
                <div style={{
                  alignSelf: 'stretch',
                  justifyContent: 'center',
                  alignItems: 'flex-start',
                  gap: 6,
                  display: 'flex'
                }}>
                  <div style={{
                    color: '#32302C',
                    fontSize: 20,
                    fontFamily: 'Plus Jakarta Sans',
                    fontWeight: '600',
                    textTransform: 'capitalize',
                    lineHeight: '30px'
                  }}>
                    Upload Documents or Drag-n-drop
                  </div>
                </div>
                <div style={{
                  width: 366,
                  textAlign: 'center',
                  color: '#6C6B6E',
                  fontSize: 16,
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: '500',
                  lineHeight: '24px'
                }}>
                  Upload your documents • All file types supported (max 500MB)
                </div>
              </div>

              {/* Select Files/Folder Buttons */}
              <div style={{
                width: 340,
                borderRadius: 12,
                justifyContent: 'center',
                alignItems: 'flex-start',
                gap: 8,
                display: 'flex'
              }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    pauseAutoRefresh(); // ✅ Pause auto-refresh while file picker is open
                    fileInputRef.current?.click();
                  }}
                  style={{
                    flex: 1,
                    height: 52,
                    paddingLeft: 18,
                    paddingRight: 18,
                    paddingTop: 10,
                    paddingBottom: 10,
                    background: 'white',
                    overflow: 'hidden',
                    borderRadius: 100,
                    outline: '1px #E6E6EC solid',
                    outlineOffset: '-1px',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: 8,
                    display: 'flex',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#323232',
                    fontSize: 16,
                    fontFamily: 'Plus Jakarta Sans',
                    fontWeight: '600',
                    textTransform: 'capitalize',
                    lineHeight: '24px'
                  }}>
                  Select Files
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    pauseAutoRefresh(); // ✅ Pause auto-refresh while folder picker is open
                    folderInputRef.current?.click();
                  }}
                  style={{
                    flex: 1,
                    height: 52,
                    paddingLeft: 18,
                    paddingRight: 18,
                    paddingTop: 10,
                    paddingBottom: 10,
                    background: 'white',
                    overflow: 'hidden',
                    borderRadius: 100,
                    outline: '1px #E6E6EC solid',
                    outlineOffset: '-1px',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: 8,
                    display: 'flex',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#323232',
                    fontSize: 16,
                    fontFamily: 'Plus Jakarta Sans',
                    fontWeight: '600',
                    textTransform: 'capitalize',
                    lineHeight: '24px'
                  }}>
                  Select Folder
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              <input
                ref={folderInputRef}
                type="file"
                webkitdirectory=""
                directory=""
                multiple
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
            </div>
          )}

          {/* Uploading State - Upload Area + File List */}
          {uploadState === 'uploading' && (
            <>
              {/* Upload Area */}
              <div
                style={{
                  alignSelf: 'stretch',
                  minHeight: 420,
                  paddingLeft: 40,
                  paddingRight: 40,
                  paddingTop: 40,
                  paddingBottom: 40,
                  background: '#F5F5F5',
                  overflow: 'visible',
                  borderRadius: 20,
                  outline: '1px #E6E6EC solid',
                  outlineOffset: '-1px',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 32,
                  display: 'flex'
                }}
              >
                {/* Document Icon */}
                <div style={{ width: 85.38, height: 80, position: 'relative' }}>
                  <div style={{
                    width: 72.95,
                    height: 61.73,
                    paddingTop: 9.62,
                    paddingBottom: 7.22,
                    paddingLeft: 3.78,
                    paddingRight: 3.78,
                    left: 6.22,
                    top: 8.76,
                    position: 'absolute',
                    background: 'white',
                    boxShadow: '0px 1.6px 1.6px 1.2px rgba(68, 68, 68, 0.16)',
                    overflow: 'hidden',
                    borderRadius: 4.13,
                    outline: '0.34px #EDEDED solid',
                    outlineOffset: '-0.34px',
                    flexDirection: 'column',
                    justifyContent: 'flex-start',
                    alignItems: 'flex-start',
                    gap: 1.60,
                    display: 'flex'
                  }}>
                    <div style={{ width: 64.40, height: 2.41, background: '#E2E2E0', borderRadius: 6.41 }} />
                    <div style={{ width: 25.89, height: 2.41, background: '#E2E2E0', borderRadius: 6.41 }} />
                  </div>
                  <div style={{
                    width: 85.38,
                    height: 51.75,
                    left: 0,
                    top: 28.25,
                    position: 'absolute',
                    background: 'linear-gradient(180deg, rgba(67, 67, 67, 0.60) 0%, rgba(0, 0, 0, 0.60) 66%)',
                    boxShadow: '0px 0.38px 1.5px rgba(255, 255, 255, 0.25) inset',
                    backdropFilter: 'blur(9.38px)',
                    borderRadius: 4
                  }} />
                </div>

                {/* Text */}
                <div style={{
                  flexDirection: 'column',
                  justifyContent: 'flex-start',
                  alignItems: 'center',
                  gap: 4,
                  display: 'flex'
                }}>
                  <div style={{
                    alignSelf: 'stretch',
                    justifyContent: 'center',
                    alignItems: 'flex-start',
                    gap: 6,
                    display: 'flex'
                  }}>
                    <div style={{
                      color: '#32302C',
                      fontSize: 20,
                      fontFamily: 'Plus Jakarta Sans',
                      fontWeight: '600',
                      textTransform: 'capitalize',
                      lineHeight: '30px'
                    }}>
                      Upload Documents or Drag-n-drop
                    </div>
                  </div>
                  <div style={{
                    width: 366,
                    textAlign: 'center',
                    color: '#6C6B6E',
                    fontSize: 16,
                    fontFamily: 'Plus Jakarta Sans',
                    fontWeight: '500',
                    lineHeight: '24px'
                  }}>
                    Upload your documents • All file types supported (max 500MB)
                  </div>
                </div>

                {/* Select Files Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    pauseAutoRefresh(); // ✅ Pause auto-refresh while file picker is open
                    fileInputRef.current?.click();
                  }}
                  style={{
                    width: 166,
                    height: 52,
                    paddingLeft: 18,
                    paddingRight: 18,
                    paddingTop: 10,
                    paddingBottom: 10,
                    background: 'white',
                    overflow: 'hidden',
                    borderRadius: 100,
                    outline: '1px #E6E6EC solid',
                    outlineOffset: '-1px',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: 8,
                    display: 'flex',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#323232',
                    fontSize: 16,
                    fontFamily: 'Plus Jakarta Sans',
                    fontWeight: '600',
                    textTransform: 'capitalize',
                    lineHeight: '24px'
                  }}
                >
                  Select Files
                </button>
              </div>

              {/* File List with Progress */}
              <div style={{
                alignSelf: 'stretch',
                flexDirection: 'column',
                gap: 8,
                display: 'flex'
              }}>
                {selectedFiles.map((item, index) => {
                  const { file, relativePath } = item;
                  const progress = uploadProgress[relativePath] || 0;
                  const icon = getFileIcon(file.name);

                  return (
                    <div
                      key={index}
                      style={{
                        alignSelf: 'stretch',
                        height: 72,
                        padding: 14,
                        position: 'relative',
                        background: 'white',
                        borderRadius: 12,
                        outline: '1px #E6E6EC solid',
                        outlineOffset: '-1px',
                        justifyContent: 'flex-start',
                        alignItems: 'center',
                        gap: 12,
                        display: 'flex',
                        overflow: 'hidden'
                      }}
                    >
                      {/* Grey progress fill background */}
                      {progress < 100 && (
                        <div style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          height: '100%',
                          width: `${progress}%`,
                          background: 'rgba(169, 169, 169, 0.12)',
                          borderRadius: 12,
                          transition: 'width 0.3s ease-out',
                          zIndex: 0
                        }} />
                      )}

                    <div style={{
                      flex: 1,
                      justifyContent: 'flex-start',
                      alignItems: 'center',
                      gap: 12,
                      display: 'flex',
                      position: 'relative',
                      zIndex: 1
                    }}>
                      {/* File Icon */}
                      <div style={{
                        width: 48,
                        height: 48,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <img
                          src={icon}
                          alt={file.name}
                          style={{
                            width: 48,
                            height: 48,
                            objectFit: 'contain'
                          }}
                        />
                      </div>

                      <div style={{
                        flex: '1 1 0',
                        flexDirection: 'column',
                        justifyContent: 'flex-start',
                        alignItems: 'flex-start',
                        gap: 8,
                        display: 'flex'
                      }}>
                        <div style={{
                          alignSelf: 'stretch',
                          flexDirection: 'column',
                          justifyContent: 'flex-start',
                          alignItems: 'flex-start',
                          gap: 6,
                          display: 'flex'
                        }}>
                          <div style={{
                            alignSelf: 'stretch',
                            color: '#32302C',
                            fontSize: 16,
                            fontFamily: 'Plus Jakarta Sans',
                            fontWeight: '500',
                            lineHeight: '22.40px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {relativePath}
                          </div>
                          <div style={{
                            alignSelf: 'stretch',
                            color: '#A0A0A0',
                            fontSize: 13,
                            fontFamily: 'Plus Jakarta Sans',
                            fontWeight: '500',
                            lineHeight: '15.40px'
                          }}>
                            Uploading to cloud...
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Remove button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFiles(prev => prev.filter((_, i) => i !== index));
                      }}
                      style={{
                        width: 24,
                        height: 24,
                        right: -6,
                        top: -6,
                        position: 'absolute',
                        background: 'white',
                        borderRadius: 100,
                        outline: '1px rgba(55, 53, 47, 0.09) solid',
                        outlineOffset: '-1px',
                        justifyContent: 'center',
                        alignItems: 'center',
                        display: 'flex',
                        border: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <CloseIcon style={{ width: 12, height: 12 }} />
                    </button>
                  </div>
                );
              })}
            </div>
            </>
          )}

          {/* Complete State - Uploaded Files */}
          {uploadState === 'complete' && (
            <div style={{
              alignSelf: 'stretch',
              flexDirection: 'column',
              gap: 8,
              display: 'flex',
              maxHeight: 400,
              overflowY: 'auto'
            }}>
              {selectedFiles.map((item, index) => {
                const { file, relativePath } = item;
                const icon = getFileIcon(file.name);

                return (
                  <div
                    key={index}
                    style={{
                      alignSelf: 'stretch',
                      height: 72,
                      padding: 12,
                      position: 'relative',
                      background: 'white',
                      borderRadius: 12,
                      outline: '1px #E6E6EC solid',
                      outlineOffset: '-1px',
                      justifyContent: 'flex-start',
                      alignItems: 'center',
                      gap: 12,
                      display: 'flex'
                    }}
                  >
                    <div style={{
                      flex: 1,
                      justifyContent: 'flex-start',
                      alignItems: 'center',
                      gap: 12,
                      display: 'flex'
                    }}>
                      {/* File Icon */}
                      <div style={{
                        width: 48,
                        height: 48,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <img
                          src={icon}
                          alt={file.name}
                          style={{
                            width: 44,
                            height: 44,
                            objectFit: 'contain'
                          }}
                        />
                      </div>

                      <div style={{
                        flex: '1 1 0',
                        flexDirection: 'column',
                        justifyContent: 'flex-start',
                        alignItems: 'flex-start',
                        gap: 8,
                        display: 'flex'
                      }}>
                        <div style={{
                          alignSelf: 'stretch',
                          flexDirection: 'column',
                          justifyContent: 'flex-start',
                          alignItems: 'flex-start',
                          gap: 6,
                          display: 'flex'
                        }}>
                          <div style={{
                            alignSelf: 'stretch',
                            color: '#32302C',
                            fontSize: 16,
                            fontFamily: 'Plus Jakarta Sans',
                            fontWeight: '500',
                            lineHeight: '22.40px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {relativePath}
                          </div>
                          <div style={{
                            alignSelf: 'stretch',
                            color: '#6C6B6E',
                            fontSize: 14,
                            fontFamily: 'Plus Jakarta Sans',
                            fontWeight: '500',
                            lineHeight: '15.40px'
                          }}>
                            {formatFileSize(file.size)} – 100% uploaded
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Remove button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFiles(prev => prev.filter((_, i) => i !== index));
                      }}
                      style={{
                        width: 24,
                        height: 24,
                        right: -6,
                        top: -6,
                        position: 'absolute',
                        background: 'white',
                        borderRadius: 100,
                        outline: '1px rgba(55, 53, 47, 0.09) solid',
                        outlineOffset: '-1px',
                        justifyContent: 'center',
                        alignItems: 'center',
                        display: 'flex',
                        border: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <CloseIcon style={{ width: 12, height: 12 }} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ alignSelf: 'stretch', height: 1, background: '#E6E6EC' }} />

        {/* Footer Buttons */}
        <div style={{
          alignSelf: 'stretch',
          paddingLeft: 18,
          paddingRight: 18,
          justifyContent: 'flex-start',
          alignItems: 'flex-start',
          gap: 8,
          display: 'flex'
        }}>
          {uploadState === 'initial' && (
            <div style={{
              flex: '1 1 0',
              height: 52,
              borderRadius: 100,
              justifyContent: 'flex-start',
              alignItems: 'flex-start',
              display: 'flex'
            }}>
              <button
                onClick={handleClose}
                style={{
                  flex: '1 1 0',
                  height: 52,
                  background: 'rgba(24, 24, 24, 0.90)',
                  overflow: 'hidden',
                  borderRadius: 100,
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 8,
                  display: 'flex',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                <div style={{
                  color: 'white',
                  fontSize: 16,
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: '600',
                  textTransform: 'capitalize',
                  lineHeight: '24px'
                }}>
                  Cancel
                </div>
              </button>
            </div>
          )}

          {uploadState === 'uploading' && (
            <>
              <div style={{
                flex: '1 1 0',
                height: 52,
                paddingLeft: 18,
                paddingRight: 18,
                paddingTop: 10,
                paddingBottom: 10,
                background: '#F5F5F5',
                borderRadius: 100,
                outline: '1px #E6E6EC solid',
                outlineOffset: '-1px',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 8,
                display: 'flex'
              }}>
                <button
                  onClick={handleClose}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#323232',
                    fontSize: 16,
                    fontFamily: 'Plus Jakarta Sans',
                    fontWeight: '700',
                    textTransform: 'capitalize',
                    lineHeight: '24px'
                  }}
                >
                  Cancel
                </button>
              </div>
              <button
                onClick={handleUploadAll}
                style={{
                  flex: '1 1 0',
                  height: 52,
                  background: 'rgba(24, 24, 24, 0.90)',
                  overflow: 'hidden',
                  borderRadius: 100,
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 8,
                  display: 'flex',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'white',
                  fontSize: 16,
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: '600',
                  textTransform: 'capitalize',
                  lineHeight: '24px'
                }}
              >
                Upload All
              </button>
            </>
          )}

          {uploadState === 'complete' && (
            <>
              <div style={{
                flex: '1 1 0',
                height: 52,
                paddingLeft: 18,
                paddingRight: 18,
                paddingTop: 10,
                paddingBottom: 10,
                background: '#F5F5F5',
                borderRadius: 100,
                outline: '1px #E6E6EC solid',
                outlineOffset: '-1px',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 8,
                display: 'flex'
              }}>
                <button
                  onClick={() => setShowAddToCategory(true)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#323232',
                    fontSize: 16,
                    fontFamily: 'Plus Jakarta Sans',
                    fontWeight: '700',
                    textTransform: 'capitalize',
                    lineHeight: '24px'
                  }}
                >
                  Add to Category
                </button>
              </div>
              <div style={{
                flex: '1 1 0',
                height: 52,
                borderRadius: 100,
                justifyContent: 'flex-start',
                alignItems: 'flex-start',
                display: 'flex'
              }}>
                <button
                  onClick={handleAcceptAll}
                  style={{
                    flex: '1 1 0',
                    height: 52,
                    background: 'rgba(24, 24, 24, 0.90)',
                    overflow: 'hidden',
                    borderRadius: 100,
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: 8,
                    display: 'flex',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{
                    color: 'white',
                    fontSize: 16,
                    fontFamily: 'Plus Jakarta Sans',
                    fontWeight: '600',
                    textTransform: 'capitalize',
                    lineHeight: '24px'
                  }}>
                    Accept All
                  </div>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Add to Category Modal */}
      <UniversalAddToCategoryModal
        isOpen={showAddToCategory}
        onClose={() => setShowAddToCategory(false)}
        uploadedDocuments={uploadedDocuments}
        onCategorySelected={async (categoryId) => {
          // Move all uploaded documents to the selected category using context (instant!)
          try {
            await Promise.all(
              uploadedDocuments.map(doc =>
                moveToFolder(doc.id, categoryId)
              )
            );
            setShowAddToCategory(false);
            if (onUploadComplete) {
              onUploadComplete();
            }
            handleClose();
          } catch (error) {
            showError(t('alerts.failedToAddDocsToCategory'));
          }
        }}
        onCreateNew={() => {
          setShowAddToCategory(false);
          setShowCreateCategory(true);
        }}
      />

      {/* Create Category Modal */}
      <CreateCategoryModal
        isOpen={showCreateCategory}
        onClose={() => setShowCreateCategory(false)}
        uploadedDocuments={uploadedDocuments}
        onCreateCategory={async (categoryData) => {
          try {
            // Create the category using context (instant!)
            const newCategory = await createFolder(categoryData.name, categoryData.emoji);

            // Move selected documents to the new category using context (instant!)
            if (categoryData.selectedDocuments && categoryData.selectedDocuments.length > 0) {
              await Promise.all(
                categoryData.selectedDocuments.map(docId =>
                  moveToFolder(docId, newCategory.id)
                )
              );
            }

            setShowCreateCategory(false);
            if (onUploadComplete) {
              onUploadComplete();
            }
            handleClose();
          } catch (error) {
            showError(t('alerts.failedToCreateCategory', { error: error.message || t('common.unknownError') }));
          }
        }}
      />
    </div>
  );
};

export default UploadModal;
