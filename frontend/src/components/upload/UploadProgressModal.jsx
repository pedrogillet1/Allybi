import React from 'react';
import { useTranslation } from 'react-i18next';
import { ReactComponent as CheckIcon } from '../assets/check.svg';

/**
 * Unified Upload Progress Modal Component
 * Used for all uploads: single files, multiple files, folders
 * Matches the exact styling from Upload.jsx modal
 *
 * Props:
 * - isOpen: boolean - Whether modal is open
 * - files: Array - Files being uploaded with { file, status, progress, error, isFolder, folderName }
 * - onClose: function - Called when user closes modal
 * - onRetry: function(file, index) - Called when user clicks retry on failed upload
 * - title: string - Modal title (default: "Upload Documents")
 * - showLibrary: boolean - Show left sidebar library (default: false)
 * - libraryDocuments: Array - Documents to show in library
 * - removeFile: function(fileName) - Called when user removes file from list
 */
export default function UploadProgressModal({
  isOpen,
  files = [],
  onClose,
  onRetry,
  title,
  showLibrary = false,
  libraryDocuments = [],
  removeFile,
  showNotification = false,
  notificationType = 'success',
  notificationMessage = '',
  onNotificationClose
}) {
  const { t } = useTranslation();

  // Use translated default if no title provided
  const modalTitle = title || t('upload.uploadDocuments');

  if (!isOpen || files.length === 0) {
    return null;
  }

  // Get file icon gradient based on mime type
  const getFileIcon = (mimeType) => {
    const gradients = {
      'application/pdf': 'linear-gradient(180deg, #F14B54 0%, #88252B 100%)',
      'application/msword': 'linear-gradient(180deg, #835AB5 0%, #5C299A 100%)',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'linear-gradient(180deg, #835AB5 0%, #5C299A 100%)',
      'application/vnd.ms-excel': 'linear-gradient(180deg, #00C23E 0%, #007B27 100%)',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'linear-gradient(180deg, #00C23E 0%, #007B27 100%)',
      'application/vnd.ms-powerpoint': 'linear-gradient(180deg, #F59E0B 0%, #D97706 100%)',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'linear-gradient(180deg, #F59E0B 0%, #D97706 100%)',
      'image/jpeg': 'linear-gradient(180deg, #65A531 0%, #3A6E10 100%)',
      'image/png': 'linear-gradient(180deg, #65A531 0%, #3A6E10 100%)',
      'image/gif': 'linear-gradient(180deg, #65A531 0%, #3A6E10 100%)',
      'image/webp': 'linear-gradient(180deg, #65A531 0%, #3A6E10 100%)',
      'text/plain': 'linear-gradient(180deg, #9BAFB1 0%, #5B6869 100%)',
      'audio/mpeg': 'linear-gradient(180deg, #835AB5 0%, #5C299A 100%)',
      'video/quicktime': 'linear-gradient(180deg, #F59E0B 0%, #D97706 100%)',
      'video/mp4': 'linear-gradient(180deg, #8B5CF6 0%, #6D28D9 100%)',
      'folder': 'linear-gradient(180deg, #6B7280 0%, #4B5563 100%)',
    };
    return gradients[mimeType] || 'linear-gradient(180deg, #9BAFB1 0%, #5B6869 100%)';
  };

  // Get file extension from filename
  const getFileExtension = (fileName) => {
    if (!fileName) return 'FILE';
    const parts = fileName.split('.');
    if (parts.length > 1) {
      return parts[parts.length - 1].toUpperCase().substring(0, 4);
    }
    return 'FILE';
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const handleCloseModal = () => {
    const uploadingCount = files.filter(f => f.status === 'uploading').length;
    if (uploadingCount > 0) {
      if (window.confirm(t('upload.filesStillUploading'))) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  const uploadingCount = files.filter(f => f.status === 'uploading').length;
  const completedCount = files.filter(f => f.status === 'completed').length;
  const failedCount = files.filter(f => f.status === 'failed').length;

  return (
    <>
      {/* Modal Overlay */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(4px)',
        animation: 'fadeIn 0.2s ease-out'
      }}>
        {/* Modal Container */}
        <div style={{
          background: 'white',
          width: '90%',
          maxWidth: 1200,
          height: '85vh',
          borderRadius: 12,
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          display: 'flex',
          overflow: 'hidden',
          animation: 'slideUp 0.3s ease-out'
        }}>
          {/* Left Sidebar - Optional Library */}
          {showLibrary && (
            <div style={{
              width: 280,
              background: '#F9FAFB',
              borderRight: '1px solid #E5E7EB',
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto'
            }}>
              <div style={{ padding: 20, borderBottom: '1px solid #E5E7EB' }}>
                <h3 style={{
                  fontSize: 18,
                  fontWeight: '600',
                  color: '#111827',
                  margin: 0,
                  fontFamily: 'Plus Jakarta Sans'
                }}>
                  {t('upload.library')}
                </h3>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
                {libraryDocuments.map((doc, idx) => (
                  <div key={idx} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: 12,
                    borderRadius: 8,
                    marginBottom: 4,
                    cursor: 'pointer',
                    transition: 'background 0.15s'
                  }}>
                    <div style={{
                      width: 40,
                      height: 40,
                      borderRadius: 8,
                      background: getFileIcon(doc.type),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <span style={{
                        fontSize: 10,
                        fontWeight: '700',
                        color: 'white',
                        textTransform: 'uppercase',
                        fontFamily: 'Plus Jakarta Sans'
                      }}>
                        {getFileExtension(doc.name)}
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        fontSize: 14,
                        fontWeight: '500',
                        color: '#111827',
                        margin: '0 0 4px 0',
                        fontFamily: 'Plus Jakarta Sans',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {doc.name}
                      </p>
                      <p style={{
                        fontSize: 12,
                        color: '#6B7280',
                        margin: 0,
                        fontFamily: 'Plus Jakarta Sans'
                      }}>
                        {doc.size}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Main Upload Area */}
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            background: 'white'
          }}>
            {/* Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '20px 24px',
              borderBottom: '1px solid #E5E7EB'
            }}>
              <h2 style={{
                fontSize: 20,
                fontWeight: '600',
                color: '#111827',
                margin: 0,
                fontFamily: 'Plus Jakarta Sans'
              }}>
                {modalTitle}
                {uploadingCount > 0 && ` (${uploadingCount} ${t('uploadProgressModal.uploading')})`}
                {uploadingCount === 0 && completedCount > 0 && ` (${completedCount} ${t('uploadProgressModal.complete')})`}
              </h2>
              <button
                onClick={handleCloseModal}
                style={{
                  width: 32,
                  height: 32,
                  border: 'none',
                  background: 'transparent',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 20,
                  color: '#6B7280',
                  transition: 'background 0.15s',
                  fontFamily: 'Plus Jakarta Sans'
                }}
              >
                ✕
              </button>
            </div>

            {/* Content - File List */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: 24
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {files.map((f, index) => {
                  const isError = f.status === 'failed';
                  const isCompleted = f.status === 'completed';
                  const isUploading = f.status === 'uploading';
                  const progressWidth = isCompleted ? 100 : (f.progress || 0);
                  const fileName = f.isFolder ? f.folderName : (f.file?.name || 'Unknown');
                  const fileType = f.isFolder ? 'folder' : (f.file?.type || 'application/octet-stream');
                  const fileSize = f.file?.size || 0;

                  return (
                    <div key={index} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 16,
                      padding: 16,
                      background: 'white',
                      border: `1px solid ${isError ? '#EF4444' : '#E5E7EB'}`,
                      borderRadius: 8,
                      transition: 'box-shadow 0.15s',
                      position: 'relative'
                    }}>
                      {/* File Icon Badge */}
                      <div style={{
                        width: 48,
                        height: 48,
                        borderRadius: 8,
                        background: getFileIcon(fileType),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12,
                        fontWeight: '700',
                        color: 'white',
                        textTransform: 'uppercase',
                        flexShrink: 0,
                        fontFamily: 'Plus Jakarta Sans'
                      }}>
                        {isUploading ? (
                          <div style={{
                            width: 24,
                            height: 24,
                            border: '3px solid rgba(255, 255, 255, 0.3)',
                            borderTop: '3px solid white',
                            borderRadius: '50%',
                            animation: 'spin 0.8s linear infinite'
                          }} />
                        ) : isCompleted ? (
                          <CheckIcon style={{ width: 20, height: 20, color: 'white' }} />
                        ) : f.isFolder ? (
                          '📁'
                        ) : (
                          getFileExtension(fileName)
                        )}
                      </div>

                      {/* File Details */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 4
                        }}>
                          <p style={{
                            fontSize: 14,
                            fontWeight: '500',
                            color: '#111827',
                            margin: 0,
                            fontFamily: 'Plus Jakarta Sans',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            flex: 1
                          }}>
                            {fileName}
                          </p>
                          {!isUploading && removeFile && (
                            <button
                              onClick={() => removeFile(fileName)}
                              style={{
                                width: 24,
                                height: 24,
                                border: 'none',
                                background: 'transparent',
                                borderRadius: 4,
                                cursor: 'pointer',
                                fontSize: 16,
                                color: '#9CA3AF',
                                flexShrink: 0,
                                transition: 'all 0.15s',
                                fontFamily: 'Plus Jakarta Sans',
                                marginLeft: 8
                              }}
                            >
                              ✕
                            </button>
                          )}
                        </div>

                        {/* Status text */}
                        {!isError && (
                          <p style={{
                            fontSize: 13,
                            color: '#6B7280',
                            margin: '0 0 8px 0',
                            fontFamily: 'Plus Jakarta Sans'
                          }}>
                            {f.isFolder ? (
                              f.stage || (isCompleted ? t('uploadProgressModal.complete') : t('upload.percentUploaded', { percent: progressWidth }))
                            ) : (
                              `${formatFileSize(fileSize)} - ${isCompleted ? t('uploadProgressModal.complete') : t('upload.percentUploaded', { percent: progressWidth })}`
                            )}
                          </p>
                        )}

                        {/* Progress Bar - Only show if NOT error */}
                        {!isError && (
                          <div style={{
                            width: '100%',
                            height: 6,
                            background: '#E5E7EB',
                            borderRadius: 3,
                            overflow: 'hidden'
                          }}>
                            <div style={{
                              height: '100%',
                              width: `${progressWidth}%`,
                              background: isCompleted ? '#10B981' : 'linear-gradient(90deg, #3B82F6 0%, #2563EB 100%)',
                              borderRadius: 3,
                              transition: 'width 0.3s ease-out'
                            }} />
                          </div>
                        )}

                        {/* Error State - Show retry button */}
                        {isError && (
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12
                          }}>
                            <p style={{
                              fontSize: 13,
                              color: '#EF4444',
                              margin: 0,
                              fontFamily: 'Plus Jakarta Sans',
                              flex: 1
                            }}>
                              {f.error || t('upload.failedToUpload')}
                              {f.errorDetails && (
                                <span style={{ display: 'block', fontSize: 12, marginTop: 4, opacity: 0.9 }}>
                                  {f.errorDetails}
                                </span>
                              )}
                            </p>
                            {onRetry && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRetry(f, index);
                                }}
                                style={{
                                  padding: '6px 16px',
                                  background: 'transparent',
                                  border: '1px solid #EF4444',
                                  borderRadius: 6,
                                  color: '#EF4444',
                                  fontSize: 13,
                                  fontWeight: '500',
                                  fontFamily: 'Plus Jakarta Sans',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = '#FEE2E2';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'transparent';
                                }}
                              >
                                {t('common.retry')}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid #E5E7EB',
              background: 'white'
            }}>
              <button
                onClick={onClose}
                disabled={uploadingCount > 0}
                style={{
                  width: '100%',
                  padding: '14px 24px',
                  background: uploadingCount > 0 ? '#D1D5DB' : '#111827',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 16,
                  fontWeight: '600',
                  cursor: uploadingCount > 0 ? 'not-allowed' : 'pointer',
                  transition: 'background 0.15s',
                  fontFamily: 'Plus Jakarta Sans'
                }}
              >
                {uploadingCount > 0 ? t('upload.uploadingFiles', { count: uploadingCount }) + '...' : t('common.done')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Success/Error Notification - Bottom Center */}
      {showNotification && (
        <div style={{
          position: 'fixed',
          bottom: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10000,
          animation: 'slideUpNotification 0.3s ease-out'
        }}>
          <div style={{
            padding: '12px 16px',
            background: 'rgba(24, 24, 24, 0.90)',
            borderRadius: 14,
            justifyContent: 'center',
            alignItems: 'center',
            gap: 12,
            display: 'flex',
            minWidth: 400,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
          }}>
            {notificationType === 'success' ? (
              <>
                <div style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: '#34A853',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <CheckIcon style={{ width: 12, height: 12, color: 'white' }} />
                </div>
                <div style={{
                  flex: '1 1 0',
                  color: 'white',
                  fontSize: 14,
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: '400',
                  lineHeight: '20px'
                }}>
                  {notificationMessage}
                </div>
              </>
            ) : (
              <>
                <div style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: '#D92D20',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <span style={{ color: 'white', fontSize: 14, fontWeight: 'bold' }}>!</span>
                </div>
                <div style={{
                  flex: '1 1 0',
                  color: 'white',
                  fontSize: 14,
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: '400',
                  lineHeight: '20px'
                }}>
                  {notificationMessage}
                </div>
              </>
            )}
            {onNotificationClose && (
              <button
                onClick={onNotificationClose}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: 18,
                  padding: 0,
                  opacity: 0.7
                }}
              >
                ×
              </button>
            )}
          </div>
        </div>
      )}

      {/* Animation Keyframes */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes slideUp {
          from {
            transform: translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        @keyframes slideUpNotification {
          from {
            transform: translateX(-50%) translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
          }
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}} />
    </>
  );
}
