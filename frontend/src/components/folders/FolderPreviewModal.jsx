import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '../../hooks/useIsMobile';
import cleanDocumentName from '../../utils/cleanDocumentName';
import '../../styles/PreviewModalBase.css';

/**
 * Folder Preview Modal
 * Displays folder contents with navigation options
 * Unified design matching DocumentPreviewModal
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
  const isMobile = useIsMobile();

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

  if (!isOpen || !folder) return null;

  const { files = [], subfolders = [] } = contents || {};

  // Format file size
  const formatFileSize = (bytes) => {
    if (!bytes) return '0 KB';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  // Get file icon based on MIME type
  const getFileIcon = (mimeType) => {
    if (!mimeType) return '📄';
    if (mimeType.includes('pdf')) return '📕';
    if (mimeType.includes('word')) return '📘';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return '📊';
    if (mimeType.includes('image')) return '🖼️';
    if (mimeType.includes('video')) return '🎥';
    if (mimeType.includes('audio')) return '🎵';
    return '📄';
  };

  return (
    <>
      {/* Overlay */}
      <div className="preview-modal-overlay" onClick={onClose} />

      {/* Close button - outside modal on desktop */}
      {!isMobile && (
        <button
          className="preview-modal-close-btn"
          onClick={onClose}
          style={{
            top: 'calc(50% - 42.5vh - 12px)',
            right: 'calc(50% - 350px - 12px)'
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 4L4 12M4 4L12 12" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}

      {/* Modal */}
      <div
        className={`preview-modal-container compact ${isMobile ? 'mobile' : ''}`}
        onClick={(e) => e.stopPropagation()}
        style={!isMobile ? { height: 'auto', maxHeight: '85vh' } : {}}
      >
        {/* Header */}
        <div className={`preview-modal-header ${isMobile ? 'mobile' : ''}`}>
          {/* Left Section - Folder Info */}
          <div className={`preview-modal-header-left ${isMobile ? 'mobile' : ''}`}>
            <span style={{ fontSize: isMobile ? 28 : 32 }}>{folder.emoji || '📁'}</span>
            <span className={`preview-modal-header-title ${isMobile ? 'mobile' : ''}`}>
              {cleanDocumentName(folder.name)}
            </span>
          </div>

          {/* Right Section - Close button (mobile only) */}
          <div className={`preview-modal-header-right ${isMobile ? 'mobile' : ''}`}>
            {isMobile && (
              <button className="preview-modal-btn header-close" onClick={onClose}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M12 4L4 12M4 4L12 12" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Folder Stats */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 24px',
          background: '#F9FAFB',
          borderBottom: '1px solid #E6E6EC',
          fontSize: 14,
          color: '#6C6C6C',
          fontFamily: 'Plus Jakarta Sans'
        }}>
          <span>{t('folderPreview.filesCount', { count: files.length })}</span>
          <span style={{ color: '#DADADA' }}>•</span>
          <span>{t('folderPreview.subfoldersCount', { count: subfolders.length })}</span>
        </div>

        {/* Contents */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '20px 24px',
          maxHeight: isMobile ? 'calc(100vh - 220px)' : '50vh'
        }}>
          {/* Subfolders */}
          {subfolders.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{
                margin: '0 0 12px',
                fontSize: 12,
                fontWeight: '600',
                color: '#6C6C6C',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                fontFamily: 'Plus Jakarta Sans'
              }}>
                {t('folderPreview.subfolders')}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {subfolders.map(subfolder => (
                  <div
                    key={subfolder.id}
                    onClick={() => onNavigateToFolder(subfolder.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 16px',
                      background: '#F9FAFB',
                      borderRadius: 8,
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#F3F4F6';
                      e.currentTarget.style.transform = 'translateX(4px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#F9FAFB';
                      e.currentTarget.style.transform = 'translateX(0)';
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ color: '#9CA3AF', flexShrink: 0 }}>
                      <path d="M2.5 6.66667C2.5 5.78261 2.85119 4.93477 3.47631 4.30964C4.10143 3.68452 4.94928 3.33333 5.83333 3.33333H7.5L9.16667 5H14.1667C15.0507 5 15.8986 5.35119 16.5237 5.97631C17.1488 6.60143 17.5 7.44928 17.5 8.33333V13.3333C17.5 14.2174 17.1488 15.0652 16.5237 15.6904C15.8986 16.3155 15.0507 16.6667 14.1667 16.6667H5.83333C4.94928 16.6667 4.10143 16.3155 3.47631 15.6904C2.85119 15.0652 2.5 14.2174 2.5 13.3333V6.66667Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>{subfolder.emoji || '📁'}</span>
                    <span style={{
                      flex: 1,
                      fontWeight: '500',
                      color: '#32302C',
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontFamily: 'Plus Jakarta Sans'
                    }}>
                      {cleanDocumentName(subfolder.name)}
                    </span>
                    <span style={{
                      fontSize: 13,
                      color: '#6C6C6C',
                      flexShrink: 0,
                      fontFamily: 'Plus Jakarta Sans'
                    }}>
                      {t('folderPreview.filesCount', { count: subfolder.fileCount })}
                    </span>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: '#9CA3AF', flexShrink: 0 }}>
                      <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Files */}
          {files.length > 0 && (
            <div style={{ marginBottom: subfolders.length > 0 ? 0 : 24 }}>
              <h3 style={{
                margin: '0 0 12px',
                fontSize: 12,
                fontWeight: '600',
                color: '#6C6C6C',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                fontFamily: 'Plus Jakarta Sans'
              }}>
                {t('folderPreview.files')}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {files.map(file => (
                  <div
                    key={file.id}
                    onClick={() => onOpenFile(file.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 16px',
                      background: 'white',
                      border: '1px solid #E6E6EC',
                      borderRadius: 6,
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#DADADA';
                      e.currentTarget.style.background = '#F9FAFB';
                      e.currentTarget.style.transform = 'translateX(2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#E6E6EC';
                      e.currentTarget.style.background = 'white';
                      e.currentTarget.style.transform = 'translateX(0)';
                    }}
                  >
                    <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{getFileIcon(file.mimeType)}</span>
                    <span style={{
                      flex: 1,
                      color: '#32302C',
                      fontWeight: '400',
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontFamily: 'Plus Jakarta Sans'
                    }}>
                      {cleanDocumentName(file.filename)}
                    </span>
                    <span style={{
                      fontSize: 13,
                      color: '#6C6C6C',
                      flexShrink: 0,
                      fontFamily: 'Plus Jakarta Sans'
                    }}>
                      {formatFileSize(file.fileSize)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {files.length === 0 && subfolders.length === 0 && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '60px 20px',
              color: '#9CA3AF',
              textAlign: 'center'
            }}>
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ marginBottom: 16, opacity: 0.5 }}>
                <path d="M6 16C6 13.8783 6.84285 11.8434 8.34315 10.3431C9.84344 8.84286 11.8783 8 14 8H18L22 12H34C36.1217 12 38.1566 12.8429 39.6569 14.3431C41.1571 15.8434 42 17.8783 42 20V32C42 34.1217 41.1571 36.1566 39.6569 37.6569C38.1566 39.1571 36.1217 40 34 40H14C11.8783 40 9.84344 39.1571 8.34315 37.6569C6.84285 36.1566 6 34.1217 6 32V16Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <p style={{
                margin: 0,
                fontSize: 16,
                color: '#6C6C6C',
                fontFamily: 'Plus Jakarta Sans'
              }}>
                {t('folderPreview.emptyFolder')}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {isMobile ? (
          <div className="preview-modal-mobile-toolbar">
            <button
              className="preview-modal-mobile-btn secondary"
              onClick={onClose}
            >
              {t('common.close')}
            </button>
            <button
              className="preview-modal-mobile-btn primary"
              onClick={() => onNavigateToFolder(folder.id)}
            >
              {t('folderPreview.goToFolder')}
            </button>
          </div>
        ) : (
          <div className="preview-modal-footer space-between">
            <button className="preview-modal-btn-secondary" onClick={onClose}>
              {t('common.close')}
            </button>
            <button
              className="preview-modal-btn-primary"
              onClick={() => onNavigateToFolder(folder.id)}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 5.33333C2 4.62609 2.28095 3.94781 2.78105 3.44772C3.28115 2.94762 3.95942 2.66667 4.66667 2.66667H6L7.33333 4H11.3333C12.0406 4 12.7189 4.28095 13.219 4.78105C13.719 5.28115 14 5.95942 14 6.66667V10.6667C14 11.3739 13.719 12.0522 13.219 12.5523C12.7189 13.0524 12.0406 13.3333 11.3333 13.3333H4.66667C3.95942 13.3333 3.28115 13.0524 2.78105 12.5523C2.28095 12.0522 2 11.3739 2 10.6667V5.33333Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {t('folderPreview.goToFolder')}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

export default FolderPreviewModal;
