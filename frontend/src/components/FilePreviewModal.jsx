import React, { useState, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import ReactMarkdown from 'react-markdown';
import { Document, Page, pdfjs } from 'react-pdf';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '../hooks/useIsMobile';
import { getFileIcon } from '../utils/iconMapper';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import '../styles/PreviewModalBase.css';

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/**
 * File Preview Modal
 * Displays created files with preview and download/save options
 * Unified design matching DocumentPreviewModal
 */
const FilePreviewModal = ({ file, isOpen, onClose, onSave, onDownload }) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(100);

  // Reset state when file changes
  useEffect(() => {
    if (file) {
      setCurrentPage(1);
      setNumPages(null);
    }
  }, [file]);

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

  // PDF options
  const pdfOptions = useMemo(() => ({
    cMapUrl: 'https://unpkg.com/pdfjs-dist@' + pdfjs.version + '/cmaps/',
    cMapPacked: true,
    withCredentials: false,
    isEvalSupported: false,
  }), []);

  if (!isOpen || !file) return null;

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
  };

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 25, 200));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 25, 50));

  const getDocumentType = () => {
    const fileType = file.type?.toLowerCase();
    if (['md', 'markdown'].includes(fileType)) return 'markdown';
    if (fileType === 'pdf') return 'pdf';
    if (['docx', 'pptx', 'xlsx'].includes(fileType)) return 'office';
    return 'other';
  };

  const renderPreview = () => {
    const docType = getDocumentType();

    switch (docType) {
      case 'markdown':
        return (
          <div style={{
            width: `${zoom}%`,
            maxWidth: '900px',
            background: 'white',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            overflow: 'hidden',
            transition: 'width 0.2s ease'
          }}>
            <div style={{
              padding: 16,
              background: '#F5F5F5',
              borderBottom: '1px solid #E6E6EC',
              fontSize: 14,
              fontWeight: '600',
              color: '#32302C',
              fontFamily: 'Plus Jakarta Sans'
            }}>
              {file.name}
            </div>
            <div style={{
              padding: '24px 32px',
              overflow: 'auto',
              maxHeight: '60vh',
              fontSize: `${zoom / 10}px`,
              fontFamily: 'Plus Jakarta Sans',
              lineHeight: 1.6,
              color: '#32302C'
            }}>
              <ReactMarkdown>{file.content || t('common.loading')}</ReactMarkdown>
            </div>
          </div>
        );

      case 'pdf':
        return (
          <Document
            file={file.previewUrl || file.url}
            onLoadSuccess={onDocumentLoadSuccess}
            options={pdfOptions}
            loading={
              <div className="preview-modal-loading">
                <div className="preview-modal-loading-spinner" />
                <div>{t('filePreview.loadingPdf')}</div>
              </div>
            }
            error={
              <div className="preview-modal-error">
                <div className="preview-modal-error-icon">📄</div>
                <div className="preview-modal-error-title">{t('documentPreview.failedToLoadPreview')}</div>
                <div className="preview-modal-error-filename">{file.name}</div>
              </div>
            }
          >
            {Array.from(new Array(numPages || 0), (el, index) => (
              <div key={`page_${index + 1}`} style={{ marginBottom: index < (numPages || 1) - 1 ? '20px' : '0' }}>
                <Page
                  pageNumber={index + 1}
                  width={isMobile ? window.innerWidth - 24 : 700 * (zoom / 100)}
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                  loading={
                    <div style={{
                      width: isMobile ? window.innerWidth - 24 : 700 * (zoom / 100),
                      height: isMobile ? (window.innerWidth - 24) * 1.3 : 900 * (zoom / 100),
                      background: 'white',
                      borderRadius: 8,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#6C6C6C',
                      fontFamily: 'Plus Jakarta Sans'
                    }}>
                      {t('documentPreview.loadingPage', { page: index + 1 })}
                    </div>
                  }
                />
              </div>
            ))}
          </Document>
        );

      case 'office':
        return (
          <div className="preview-modal-error">
            <div className="preview-modal-error-icon">
              {file.type === 'docx' && '📄'}
              {file.type === 'pptx' && '📊'}
              {file.type === 'xlsx' && '📈'}
            </div>
            <div className="preview-modal-error-title">{file.name}</div>
            <div className="preview-modal-error-filename">
              {file.type === 'docx' && t('filePreview.microsoftWord')}
              {file.type === 'pptx' && t('filePreview.microsoftPowerPoint')}
              {file.type === 'xlsx' && t('filePreview.microsoftExcel')}
            </div>
            <div className="preview-modal-error-hint">
              {t('filePreview.previewNotAvailable')}<br />
              {t('filePreview.downloadToView')}
            </div>
            <button
              onClick={onDownload}
              className="preview-modal-btn-primary"
              style={{ marginTop: 20 }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M14 10V12.6667C14 13.0203 13.8595 13.3594 13.6095 13.6095C13.3594 13.8595 13.0203 14 12.6667 14H3.33333C2.97971 14 2.64057 13.8595 2.39052 13.6095C2.14048 13.3594 2 13.0203 2 12.6667V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M4.66602 6.66667L7.99935 10L11.3327 6.66667" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M8 10V2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {t('filePreview.downloadToViewBtn')}
            </button>
          </div>
        );

      default:
        return (
          <div className="preview-modal-error">
            <div className="preview-modal-error-icon">📁</div>
            <div className="preview-modal-error-title">{t('filePreview.previewNotAvailable')}</div>
          </div>
        );
    }
  };

  const getFileTypeIcon = () => {
    // Use iconMapper if available, fallback to emoji
    try {
      return getFileIcon(file.name, file.type);
    } catch {
      const icons = { md: '📝', markdown: '📝', docx: '📄', pdf: '📕', pptx: '📊', xlsx: '📈' };
      return icons[file.type?.toLowerCase()] || '📁';
    }
  };

  const fileIcon = getFileTypeIcon();
  const isImageIcon = typeof fileIcon === 'string' && (fileIcon.startsWith('/') || fileIcon.startsWith('data:') || fileIcon.includes('.'));

  return (
    <>
      {/* Overlay */}
      <div className="preview-modal-overlay" onClick={onClose} />

      {/* Close button - outside modal on desktop */}
      {!isMobile && (
        <button className="preview-modal-close-btn" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 4L4 12M4 4L12 12" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}

      {/* Modal */}
      <div
        className={`preview-modal-container ${isMobile ? 'mobile' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`preview-modal-header ${isMobile ? 'mobile' : ''}`}>
          {/* Left Section - File Info */}
          <div className={`preview-modal-header-left ${isMobile ? 'mobile' : ''}`}>
            {isImageIcon ? (
              <img
                src={fileIcon}
                alt="File"
                className={`preview-modal-header-icon ${isMobile ? 'mobile' : ''}`}
              />
            ) : (
              <span style={{ fontSize: isMobile ? 28 : 32 }}>{fileIcon}</span>
            )}
            <span className={`preview-modal-header-title ${isMobile ? 'mobile' : ''}`}>
              {file.name}
            </span>
          </div>

          {/* Center Section - Page Indicator */}
          {!isMobile && getDocumentType() === 'pdf' && numPages && (
            <div className="preview-modal-header-center">
              {t('documentViewer.pageOfPages', { current: currentPage, total: numPages })}
            </div>
          )}

          {/* Right Section - Controls */}
          <div className={`preview-modal-header-right ${isMobile ? 'mobile' : ''}`}>
            {/* Zoom Controls - desktop only */}
            {!isMobile && (
              <div className="preview-modal-zoom-controls">
                <button
                  className="preview-modal-btn"
                  onClick={handleZoomOut}
                  disabled={zoom <= 50}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M4 8H12" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <div className="preview-modal-zoom-display">{zoom}%</div>
                <button
                  className="preview-modal-btn"
                  onClick={handleZoomIn}
                  disabled={zoom >= 200}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 4V12M4 8H12" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            )}

            {/* Download button - desktop only */}
            {!isMobile && (
              <button className="preview-modal-btn" onClick={onDownload}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M14 10V12.6667C14 13.0203 13.8595 13.3594 13.6095 13.6095C13.3594 13.8595 13.0203 14 12.6667 14H3.33333C2.97971 14 2.64057 13.8595 2.39052 13.6095C2.14048 13.3594 2 13.0203 2 12.6667V10" stroke="#1A1A1A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M4.66602 6.66667L7.99935 10L11.3327 6.66667" stroke="#1A1A1A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M8 10V2" stroke="#1A1A1A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}

            {/* Close button - mobile only */}
            {isMobile && (
              <button className="preview-modal-btn header-close" onClick={onClose}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M12 4L4 12M4 4L12 12" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className={`preview-modal-content ${isMobile ? 'mobile' : ''}`}>
          {renderPreview()}
        </div>

        {/* Footer */}
        {isMobile ? (
          <>
            {/* Mobile Page Indicator */}
            {getDocumentType() === 'pdf' && numPages && (
              <div className="preview-modal-page-indicator">
                <button
                  className="preview-modal-page-btn"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage <= 1}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M10 12L6 8L10 4" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <div className="preview-modal-page-text">
                  {currentPage} / {numPages}
                </div>
                <button
                  className="preview-modal-page-btn"
                  onClick={() => setCurrentPage(prev => Math.min(numPages, prev + 1))}
                  disabled={currentPage >= numPages}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M6 4L10 8L6 12" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            )}

            {/* Mobile Action Toolbar */}
            <div className="preview-modal-mobile-toolbar">
              <button className="preview-modal-mobile-btn secondary" onClick={onDownload}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M14 10V12.6667C14 13.0203 13.8595 13.3594 13.6095 13.6095C13.3594 13.8595 13.0203 14 12.6667 14H3.33333C2.97971 14 2.64057 13.8595 2.39052 13.6095C2.14048 13.3594 2 13.0203 2 12.6667V10" stroke="#1A1A1A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M4.66602 6.66667L7.99935 10L11.3327 6.66667" stroke="#1A1A1A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M8 10V2" stroke="#1A1A1A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {t('common.download')}
              </button>
              <button className="preview-modal-mobile-btn primary" onClick={onSave}>
                {t('filePreview.saveToFiles')}
              </button>
            </div>
          </>
        ) : (
          /* Desktop Footer */
          <div className="preview-modal-footer space-between">
            <button className="preview-modal-btn-secondary" onClick={onDownload}>
              ⬇️ {t('common.download')}
            </button>
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="preview-modal-btn-secondary" onClick={onClose}>
                {t('common.close')}
              </button>
              <button className="preview-modal-btn-primary" onClick={onSave}>
                💾 {t('filePreview.saveToFiles')}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

FilePreviewModal.propTypes = {
  file: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string.isRequired,
    type: PropTypes.string.isRequired,
    url: PropTypes.string,
    previewUrl: PropTypes.string,
    content: PropTypes.string,
    size: PropTypes.number
  }),
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  onDownload: PropTypes.func.isRequired
};

export default FilePreviewModal;
