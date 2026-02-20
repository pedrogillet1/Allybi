import React, { useState, useEffect, useRef, useMemo, Suspense, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Document, Page, pdfjs } from 'react-pdf';
import api from '../../services/api';
import { previewCache } from '../../services/previewCache';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useNotifications } from '../../context/NotificationsStore';
import { getFileIcon } from '../../utils/files/iconMapper';
import { downloadFile } from '../../utils/browser/browserUtils';
import cleanDocumentName from '../../utils/cleanDocumentName';
import { buildRoute } from '../../constants/routes';
import { getPreviewCountForFile, getFileExtension } from '../../utils/files/previewCount';
import GeneratedDocumentCard from './GeneratedDocumentCard';

// Code-split ExcelPreview and PPTXPreview for performance
const ExcelPreview = lazy(() => import('./previews/ExcelPreview'));
const PPTXPreview = lazy(() => import('./previews/PPTXPreview'));

// Set up the worker for pdf.js
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const DocumentPreviewModal = ({ isOpen, onClose, document, attachOnClose = false, initialPage = 1 }) => {
  const { t } = useTranslation();
  const { showError } = useNotifications();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [zoom, setZoom] = useState(100);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(1);
  const [pendingInitialPage, setPendingInitialPage] = useState(initialPage);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [videoDuration, setVideoDuration] = useState(null);
  const previewContainerRef = useRef(null);
  const pageRefs = useRef({});

  // Helper function to determine document type
  const getDocumentType = () => {
    if (!document) return 'unknown';
    const extension = document.filename?.split('.').pop()?.toLowerCase();
    const mimeType = document.mimeType;

    // Check for images
    if (mimeType?.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(extension)) {
      return 'image';
    }
    // Check for video
    if (mimeType?.startsWith('video/') || ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(extension)) {
      return 'video';
    }
    // Check for audio
    if (mimeType?.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'aac'].includes(extension)) {
      return 'audio';
    }
    // Check for PDF
    if (mimeType === 'application/pdf' || extension === 'pdf') {
      return 'pdf';
    }
    // Check for Excel
    if (mimeType?.includes('spreadsheet') || mimeType?.includes('excel') || ['xls', 'xlsx'].includes(extension)) {
      return 'excel';
    }
    // Check for PowerPoint
    if (mimeType?.includes('presentation') || mimeType?.includes('powerpoint') || ['ppt', 'pptx'].includes(extension)) {
      return 'powerpoint';
    }
    // Check for DOCX
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        ['doc', 'docx'].includes(extension)) {
      return 'docx';
    }
    return 'other';
  };

  // Compute canonical preview count
  const previewCount = useMemo(() => {
    if (!document) return null;

    const docType = getDocumentType();
    const fileExt = getFileExtension(document.filename || '');

    // For page-based types (pdf, docx), only use isLoading (not imageLoading which
    // is image-specific and never resolves for PDF/DOCX). For images, use both.
    const isPaged = docType === 'pdf' || docType === 'docx';
    return getPreviewCountForFile({
      mimeType: document.mimeType,
      fileExt,
      numPages: totalPages,
      currentPage,
      durationSec: videoDuration,
      isLoading: isPaged ? isLoading : (isLoading || imageLoading),
      previewType: docType === 'video' ? 'video' :
                   docType === 'audio' ? 'audio' :
                   docType === 'image' ? 'image' :
                   (docType === 'pdf' || docType === 'docx') ? 'pdf' : undefined
    }, t);
  }, [document, totalPages, currentPage, videoDuration, isLoading, imageLoading, t]);

  // Memoize file config and options for react-pdf
  const fileConfig = useMemo(() => previewUrl ? { url: previewUrl } : null, [previewUrl]);
  const pdfOptions = useMemo(() => ({
    cMapUrl: 'https://unpkg.com/pdfjs-dist@' + pdfjs.version + '/cmaps/',
    cMapPacked: true,
    withCredentials: false,
    isEvalSupported: false,
  }), []);

  // Handle PDF load success - jump to initialPage if specified
  const onDocumentLoadSuccess = ({ numPages }) => {
    setTotalPages(numPages);
    // Clamp pendingInitialPage to valid range (1..numPages)
    const targetPage = Math.max(1, Math.min(pendingInitialPage, numPages));
    setCurrentPage(targetPage);
  };

  // Update pendingInitialPage when initialPage prop changes
  useEffect(() => {
    setPendingInitialPage(initialPage);
    // If we already have totalPages, jump immediately
    if (totalPages > 0) {
      const targetPage = Math.max(1, Math.min(initialPage, totalPages));
      setCurrentPage(targetPage);
    }
  }, [initialPage, totalPages]);

  // Load document preview
  useEffect(() => {
    if (!isOpen || !document) return;

    // Reset ALL states when document changes
    setPreviewUrl(null);
    setIsLoading(true);
    setImageLoading(true);
    setImageError(false);
    setTotalPages(1);
    setCurrentPage(1);
    setPendingInitialPage(initialPage); // Reset to initialPage for new document

    const loadPreview = async () => {
      // Excel/PowerPoint components handle their own data fetching — skip blob loading
      const docType = getDocumentType();
      if (docType === 'excel' || docType === 'powerpoint') {
        setIsLoading(false);
        setImageLoading(false);
        return;
      }

      // ✅ PHASE 1 OPTIMIZATION: Check cache first (instant - <50ms)
      if (previewCache.has(document.id)) {
        setPreviewUrl(previewCache.get(document.id));
        setIsLoading(false);
        return;
      }
      try {
        // Check document type
        const extension = document.filename?.split('.').pop()?.toLowerCase();
        const mimeType = document.mimeType;
        const isDocx = mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                       extension === 'docx' || extension === 'doc';
        const isImage = mimeType?.startsWith('image/') ||
                        ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(extension);
        const isVideo = mimeType?.startsWith('video/') ||
                        ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(extension);
        const isAudio = mimeType?.startsWith('audio/') ||
                        ['mp3', 'wav', 'ogg', 'm4a', 'aac'].includes(extension);
        if (isDocx) {
          try {
            // Get PDF preview for DOCX with timeout
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('DOCX preview timeout')), 60000)
            );

            // First, trigger DOCX to PDF conversion and get the preview-pdf endpoint
            await Promise.race([
              api.get(`/api/documents/${document.id}/preview`),
              timeoutPromise
            ]);

            // Now fetch the actual PDF as a blob (includes auth headers)
            const pdfResponse = await api.get(`/api/documents/${document.id}/preview-pdf`, {
              responseType: 'blob'
            });

            // Create blob URL for PDF.js
            const pdfBlob = pdfResponse.data;
            const url = URL.createObjectURL(pdfBlob);

            // ✅ Cache the blob URL
            previewCache.set(document.id, url);
            setPreviewUrl(url);
          } catch (docxError) {
            // Set previewUrl to null so it shows error state
            setPreviewUrl(null);
            throw docxError; // Re-throw to be caught by outer catch
          }
        } else {
          // For images, PDF, video, audio — try /stream first, fallback to /download signed URL
          let url = null;
          try {
            const response = await api.get(`/api/documents/${document.id}/stream`, {
              responseType: 'blob'
            });
            const blob = response.data;
            if (blob && blob.size > 0) {
              url = URL.createObjectURL(blob);
            }
          } catch (streamErr) {
            // /stream failed — try /download for a signed URL fallback
            console.warn('[Preview] /stream failed, trying /download fallback:', streamErr?.message);
          }

          // Fallback: use download endpoint signed URL
          if (!url) {
            try {
              const dlResponse = await api.get(`/api/documents/${document.id}/download`);
              if (dlResponse.data?.url) {
                url = dlResponse.data.url;
              }
            } catch (dlErr) {
              console.warn('[Preview] /download fallback also failed:', dlErr?.message);
            }
          }

          if (url) {
            previewCache.set(document.id, url);
            setPreviewUrl(url);
          }
        }
      } catch (error) {
        setPreviewUrl(null);
      } finally {
        setIsLoading(false);
        // Reset imageLoading for non-image types (images reset via onLoad/onError)
        const extension = document.filename?.split('.').pop()?.toLowerCase();
        const mimeType = document.mimeType;
        const isImage = mimeType?.startsWith('image/') ||
                        ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(extension);
        if (!isImage) {
          setImageLoading(false);
        }
      }
    };

    loadPreview();

    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [isOpen, document]);

  // Handle close - passes document if attachOnClose is true
  const handleClose = () => {
    if (attachOnClose && document) {
      console.log('📎 [PREVIEW] Closing with attach:', document.filename);
      onClose(document); // Pass document to attach
    } else {
      onClose(null); // Close without attaching
    }
  };

  // On mobile, allow native pinch-zoom while the preview modal is open.
  // The global viewport meta has user-scalable=no which iOS Safari partially
  // ignores (it allows pinch-zoom for accessibility) but then snaps back on
  // long-press for text selection, causing zoom-out, shift, and blur.
  // Temporarily allowing scaling makes Safari treat the zoomed state as valid.
  useEffect(() => {
    if (!isOpen || !isMobile) return;
    const meta = window.document.querySelector('meta[name="viewport"]');
    if (!meta) return;
    const original = meta.getAttribute('content');
    meta.setAttribute('content',
      'width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=yes, maximum-scale=5'
    );
    return () => {
      meta.setAttribute('content', original);
    };
  }, [isOpen, isMobile]);

  // Handle Esc key to close
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };

    if (isOpen) {
      window.document.addEventListener('keydown', handleEsc);
      // Prevent body scroll when modal is open
      window.document.body.style.overflow = 'hidden';
    }

    return () => {
      window.document.removeEventListener('keydown', handleEsc);
      window.document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose, attachOnClose, document]);

  // Track which page is currently visible using Intersection Observer
  useEffect(() => {
    if (!totalPages || totalPages === 0) return;

    const observerOptions = {
      root: previewContainerRef.current,
      rootMargin: '-50% 0px -50% 0px', // Trigger when page crosses the center of viewport
      threshold: 0
    };

    const observerCallback = (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const pageNum = parseInt(entry.target.getAttribute('data-page-number'), 10);
          if (pageNum) {
            setCurrentPage(pageNum);
          }
        }
      });
    };

    const observer = new IntersectionObserver(observerCallback, observerOptions);

    // Observe all page elements
    Object.values(pageRefs.current).forEach((pageElement) => {
      if (pageElement) {
        observer.observe(pageElement);
      }
    });

    return () => {
      observer.disconnect();
    };
  }, [totalPages]);

  // Zoom controls
  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 25, 200));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 25, 50));
  };

  // Download document
  const handleDownload = async () => {
    try {
      // Call the download endpoint to get the original file
      const response = await api.get(`/api/documents/${document.id}/download`);
      const downloadUrl = response.data.url;

      // Use browser-aware download function with the original file URL
      downloadFile(downloadUrl, document.filename);
    } catch (error) {
      showError(t('alerts.failedToDownload'));
    }
  };

  // Navigate to full preview
  const handleOpenFullPreview = () => {
    // Navigate to document page with zoom and scroll state (in-app navigation)
    navigate(`${buildRoute.document(document.id)}?zoom=${zoom}&page=${currentPage}`);
  };

  if (!isOpen || !document) return null;

  return (
    <>
      {/* Overlay */}
      <div
        onClick={handleClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(6px)',
          zIndex: 9998,
          animation: 'fadeIn 250ms ease-out'
        }}
      />

      {/* Close button - positioned outside modal at top-right corner */}
      {!isMobile && (
        <button
          onClick={handleClose}
          style={{
            position: 'fixed',
            top: 'calc(10vh - 12px)',
            right: 'calc(10vw - 12px)',
            width: 32,
            height: 32,
            border: 'none',
            background: '#F5F5F5',
            borderRadius: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'opacity 200ms ease-out',
            padding: 0,
            zIndex: 10000,
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '0.7';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '1';
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 4L4 12M4 4L12 12" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}

      {/* Modal */}
      <div
        style={{
          position: 'fixed',
          top: isMobile ? 0 : '50%',
          left: isMobile ? 0 : '50%',
          transform: isMobile ? 'none' : 'translate(-50%, -50%)',
          width: isMobile ? '100vw' : '80vw',
          height: isMobile ? '100vh' : '80vh',
          background: '#F5F5F5',
          borderRadius: isMobile ? 0 : 16,
          border: isMobile ? 'none' : '1px solid #DADADA',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          zIndex: 9999,
          animation: isMobile ? 'slideUp 250ms ease-out' : 'modalSlideIn 250ms ease-out',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar - matches DocumentViewer design */}
        <div
          style={{
            height: isMobile ? 68 : 72,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingLeft: isMobile ? 16 : 24,
            paddingRight: isMobile ? 12 : 20,
            borderBottom: '1px solid #E6E6EC',
            background: '#FFFFFF',
            position: 'relative'
          }}
        >
          {/* Left Section - Document Info */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            maxWidth: isMobile ? '50%' : '45%',
            overflow: 'hidden'
          }}>
            <img
              src={getFileIcon(document.filename, document.mimeType)}
              alt="File"
              style={{
                width: isMobile ? 32 : 38,
                height: isMobile ? 32 : 38,
                objectFit: 'contain',
                flexShrink: 0
              }}
            />
            <span
              style={{
                fontSize: isMobile ? 16 : 18,
                fontWeight: '700',
                color: '#323232',
                fontFamily: 'Plus Jakarta Sans',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                lineHeight: isMobile ? '22px' : '26px'
              }}
            >
              {cleanDocumentName(document.filename) || 'Document'}
            </span>

            {/* Attach on Close Indicator */}
            {attachOnClose && (
              <span style={{
                padding: '4px 10px',
                backgroundColor: '#EEF2FF',
                color: '#4F46E5',
                fontSize: 11,
                fontWeight: '600',
                borderRadius: 12,
                fontFamily: 'Plus Jakarta Sans',
                whiteSpace: 'nowrap',
                marginLeft: 8
              }}>
                {t('documentPreview.willAttachOnClose')}
              </span>
            )}
          </div>

          {/* Center Section - Page Indicator (hidden on mobile, images/video/audio, and while loading) */}
          {!isMobile && !isLoading && !['image', 'video', 'audio'].includes(getDocumentType()) && previewCount?.label && previewCount.label !== t('common.loading') && (
            <div style={{
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
              fontSize: 13,
              color: '#6C6C6C',
              fontWeight: '500',
              fontFamily: 'Plus Jakarta Sans',
              whiteSpace: 'nowrap',
              letterSpacing: '0.2px'
            }}>
              {previewCount.label}
            </div>
          )}

          {/* Right Section - Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 16, justifyContent: 'flex-end' }}>
            {/* Zoom Control Cluster - hidden on mobile */}
            {!isMobile && <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12
            }}>
              {/* Zoom Out */}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (zoom > 50) handleZoomOut();
                }}
                disabled={zoom <= 50}
                style={{
                  width: 32,
                  height: 32,
                  border: '1px solid #DADADA',
                  background: '#FFFFFF',
                  borderRadius: 50,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: zoom <= 50 ? 'not-allowed' : 'pointer',
                  opacity: zoom <= 50 ? 0.4 : 1,
                  transition: 'all 150ms ease-out',
                  padding: 0
                }}
                onMouseEnter={(e) => {
                  if (zoom > 50) e.currentTarget.style.background = '#F5F5F5';
                }}
                onMouseLeave={(e) => {
                  if (zoom > 50) e.currentTarget.style.background = '#FFFFFF';
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4 8H12" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {/* Zoom Percentage Display - Pill/Cylinder shape */}
              <div style={{
                fontSize: 13,
                fontWeight: '600',
                color: '#1A1A1A',
                fontFamily: 'Plus Jakarta Sans',
                minWidth: 54,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                userSelect: 'none',
                border: '1px solid #DADADA',
                borderRadius: 50,
                background: '#FFFFFF',
                padding: '0 12px'
              }}>
                {zoom}%
              </div>

              {/* Zoom In */}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (zoom < 200) handleZoomIn();
                }}
                disabled={zoom >= 200}
                style={{
                  width: 32,
                  height: 32,
                  border: '1px solid #DADADA',
                  background: '#FFFFFF',
                  borderRadius: 50,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: zoom >= 200 ? 'not-allowed' : 'pointer',
                  opacity: zoom >= 200 ? 0.4 : 1,
                  transition: 'all 150ms ease-out',
                  padding: 0
                }}
                onMouseEnter={(e) => {
                  if (zoom < 200) e.currentTarget.style.background = '#F5F5F5';
                }}
                onMouseLeave={(e) => {
                  if (zoom < 200) e.currentTarget.style.background = '#FFFFFF';
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 4V12M4 8H12" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>}

            {/* Download - hidden on mobile (shown in bottom toolbar) */}
            {!isMobile &&
            <button
              onClick={handleDownload}
              style={{
                width: 32,
                height: 32,
                border: '1px solid #DADADA',
                background: '#FFFFFF',
                borderRadius: 50,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'opacity 200ms ease-out',
                padding: 0
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '0.7';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '1';
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M14 10V12.6667C14 13.0203 13.8595 13.3594 13.6095 13.6095C13.3594 13.8595 13.0203 14 12.6667 14H3.33333C2.97971 14 2.64057 13.8595 2.39052 13.6095C2.14048 13.3594 2 13.0203 2 12.6667V10" stroke="#1A1A1A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M4.66602 6.66667L7.99935 10L11.3327 6.66667" stroke="#1A1A1A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M8 10V2" stroke="#1A1A1A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>}

            {/* Close button - only shown on mobile (desktop has corner button) */}
            {isMobile && (
              <button
                onClick={handleClose}
                style={{
                  width: 36,
                  height: 36,
                  border: 'none',
                  background: '#F5F5F5',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'opacity 200ms ease-out',
                  padding: 0
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.7';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 4L4 12M4 4L12 12" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Document Preview Area */}
        <div
          ref={previewContainerRef}
          style={{
            flex: 1,
            overflow: 'auto',
            padding: isMobile ? 8 : 16,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
            touchAction: isMobile ? 'manipulation' : undefined
          }}
        >
          {isLoading ? (
            <div style={{ minHeight: 400 }} />
          ) : document.chatDocument ? (
            /* Render ChatDocument (generated documents) */
            <div style={{
              width: '100%',
              maxWidth: 900,
              background: 'white',
              borderRadius: 12,
              padding: '32px 40px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
            }}>
              <GeneratedDocumentCard chatDocument={document.chatDocument} />
            </div>
          ) : getDocumentType() === 'excel' ? (
            /* Excel Preview - component fetches its own data */
            <div style={{ position: 'relative', width: '100%', height: '100%', flex: 1 }}>
              <Suspense fallback={null}>
                <ExcelPreview document={document} zoom={zoom} onCountUpdate={setTotalPages} />
              </Suspense>
            </div>
          ) : getDocumentType() === 'powerpoint' ? (
            /* PowerPoint Preview - component fetches its own data */
            <Suspense fallback={null}>
              <PPTXPreview document={document} zoom={zoom} version={0} onCountUpdate={setTotalPages} />
            </Suspense>
          ) : previewUrl ? (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
              {/* Render based on document type */}
              {getDocumentType() === 'image' ? (
                /* Image Preview */
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  {imageLoading && !imageError && (
                    <div style={{ minHeight: 200 }} />
                  )}
                  {imageError ? (
                    <div style={{
                      padding: 40,
                      background: 'white',
                      borderRadius: 12,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: 64, marginBottom: 20 }}>🖼️</div>
                      <div style={{ fontSize: 18, fontWeight: '600', color: '#32302C', fontFamily: 'Plus Jakarta Sans', marginBottom: 12 }}>
                        {t('documentPreview.failedToLoadImage')}
                      </div>
                      <div style={{ fontSize: 14, color: '#6C6B6E', fontFamily: 'Plus Jakarta Sans', marginBottom: 24 }}>
                        {cleanDocumentName(document.filename)}
                      </div>
                    </div>
                  ) : (
                    <img
                      src={previewUrl}
                      alt={cleanDocumentName(document.filename)}
                      onLoad={() => {
                        setImageLoading(false);
                      }}
                      onError={(e) => {
                        setImageLoading(false);
                        setImageError(true);
                      }}
                      style={{
                        maxWidth: `${zoom}%`,
                        maxHeight: '100%',
                        objectFit: 'contain',
                        borderRadius: 8,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        display: imageLoading ? 'none' : 'block',
                        transition: 'max-width 0.2s ease'
                      }}
                    />
                  )}
                </div>
              ) : getDocumentType() === 'video' ? (
                /* Video Preview */
                <div style={{
                  display: 'inline-block',
                  maxWidth: '100%',
                  maxHeight: '70vh'
                }}>
                  <video
                    src={previewUrl}
                    controls
                    preload="metadata"
                    playsInline
                    onLoadedMetadata={(e) => {
                      const video = e.target;
                      if (video.duration && isFinite(video.duration)) {
                        setVideoDuration(video.duration);
                      }
                    }}
                    style={{
                      width: 'auto',
                      height: 'auto',
                      maxWidth: '100%',
                      maxHeight: '70vh',
                      borderRadius: 8,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      background: 'black'
                    }}
                  >
                    <source src={previewUrl} type={document.mimeType || 'video/mp4'} />
                    {t('documentPreview.browserNotSupportVideo')}
                  </video>
                </div>
              ) : getDocumentType() === 'audio' ? (
                /* Audio Preview */
                <div style={{
                  background: 'white',
                  padding: 40,
                  borderRadius: 12,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  textAlign: 'center',
                  maxWidth: '500px',
                  width: '100%'
                }}>
                  <div style={{ fontSize: 48, marginBottom: 20 }}>🎵</div>
                  <div style={{ fontSize: 18, fontWeight: '600', color: '#32302C', fontFamily: 'Plus Jakarta Sans', marginBottom: 20 }}>
                    {cleanDocumentName(document.filename)}
                  </div>
                  <audio
                    src={previewUrl}
                    controls
                    preload="metadata"
                    onLoadedMetadata={(e) => {
                      const audio = e.target;
                      if (audio.duration && isFinite(audio.duration)) {
                        setVideoDuration(audio.duration);
                      }
                    }}
                    style={{ width: '100%' }}
                  >
                    {t('documentPreview.browserNotSupportAudio')}
                  </audio>
                </div>
              ) : (
                /* PDF Preview (for PDF, DOCX, etc.) */
                <Document
                  file={fileConfig}
                  onLoadSuccess={onDocumentLoadSuccess}
                  onLoadError={(error) => {
                  }}
                  options={pdfOptions}
                  loading={null}
                  error={
                    <div style={{
                      padding: 40,
                      background: 'white',
                      borderRadius: 12,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: 64, marginBottom: 20 }}>📄</div>
                      <div style={{ fontSize: 18, fontWeight: '600', color: '#32302C', fontFamily: 'Plus Jakarta Sans', marginBottom: 12 }}>
                        {t('documentPreview.failedToLoadPreview')}
                      </div>
                      <div style={{ fontSize: 14, color: '#6C6B6E', fontFamily: 'Plus Jakarta Sans', marginBottom: 24 }}>
                        {cleanDocumentName(document.filename)}
                      </div>
                      <div style={{ fontSize: 13, color: '#6C6B6E', fontFamily: 'Plus Jakarta Sans' }}>
                        {t('documentPreview.documentMayBeProcessing')}
                      </div>
                    </div>
                  }
                >
                  {Array.from(new Array(totalPages), (el, index) => (
                    <div
                      key={`page_${index + 1}`}
                      ref={(el) => {
                        if (el) {
                          pageRefs.current[index + 1] = el;
                        }
                      }}
                      data-page-number={index + 1}
                      style={{
                        marginBottom: index < totalPages - 1 ? '20px' : '0'
                      }}
                    >
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
                          }} />
                        }
                      />
                    </div>
                  ))}
                </Document>
              )}
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 400,
                color: '#6C6C6C',
                fontSize: 14,
                fontFamily: 'Plus Jakarta Sans'
              }}
            >
              {t('documentPreview.previewNotAvailable')}
            </div>
          )}
        </div>

        {/* Mobile Bottom Toolbar */}
        {isMobile ? (
          <>
            {/* Mobile Page Indicator */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              padding: '8px 16px',
              background: '#FFFFFF',
              borderTop: '1px solid #E6E6E6',
              flexShrink: 0
            }}>
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage <= 1}
                style={{
                  width: 32,
                  height: 32,
                  border: '1px solid #E6E6E6',
                  background: '#F5F5F5',
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
                  opacity: currentPage <= 1 ? 0.4 : 1
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M10 12L6 8L10 4" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              <div style={{
                fontSize: 13,
                fontWeight: '600',
                color: '#1A1A1A',
                fontFamily: 'Plus Jakarta Sans'
              }}>
                {previewCount?.shortLabel || `${currentPage}/${totalPages}`}
              </div>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage >= totalPages}
                style={{
                  width: 32,
                  height: 32,
                  border: '1px solid #E6E6E6',
                  background: '#F5F5F5',
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                  opacity: currentPage >= totalPages ? 0.4 : 1
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M6 4L10 8L6 12" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>

            {/* Mobile Action Toolbar */}
            <div style={{
              display: 'flex',
              minHeight: 60,
              background: '#FFFFFF',
              borderTop: '1px solid #E6E6E6',
              alignItems: 'center',
              justifyContent: 'space-around',
              padding: '8px 16px',
              paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
              gap: 8,
              flexShrink: 0
            }}>
              <button
                onClick={handleDownload}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 10,
                  background: '#F5F5F5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  border: '1px solid #E6E6E6'
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M14 10V12.6667C14 13.0203 13.8595 13.3594 13.6095 13.6095C13.3594 13.8595 13.0203 14 12.6667 14H3.33333C2.97971 14 2.64057 13.8595 2.39052 13.6095C2.14048 13.3594 2 13.0203 2 12.6667V10" stroke="#1A1A1A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M4.66602 6.66667L7.99935 10L11.3327 6.66667" stroke="#1A1A1A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M8 10V2" stroke="#1A1A1A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: '#1A1A1A',
                  fontFamily: 'Plus Jakarta Sans'
                }}>{t('common.download')}</span>
              </button>
              <button
                onClick={handleOpenFullPreview}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 10,
                  background: 'rgba(24, 24, 24, 0.90)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  border: 'none'
                }}
              >
                <span style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: '#FFFFFF',
                  fontFamily: 'Plus Jakarta Sans'
                }}>{t('documentPreview.fullView')}</span>
              </button>
            </div>
          </>
        ) : (
          /* Desktop Footer Bar */
          <div
            style={{
              height: 56,
              display: 'flex',
              alignItems: 'center',
              justifyContent: attachOnClose ? 'space-between' : 'flex-end',
              padding: '0 28px',
              borderTop: '1px solid #E0E0E0',
              background: '#F5F5F5'
            }}
          >
            <button
              onClick={handleOpenFullPreview}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#6C6C6C',
                fontSize: 14,
                fontWeight: '500',
                fontFamily: 'Plus Jakarta Sans',
                cursor: 'pointer',
                padding: '8px 16px',
                borderRadius: 6,
                transition: 'color 200ms ease-out, opacity 200ms ease-out',
                opacity: 1
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#1A1A1A';
                e.currentTarget.style.opacity = '1';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#6C6C6C';
                e.currentTarget.style.opacity = '1';
              }}
            >
              {t('documentPreview.openFullPreview')}
            </button>

            {/* Close & Attach Button - only shown when attachOnClose is true */}
            {attachOnClose && (
              <button
                onClick={handleClose}
                style={{
                  background: '#4F46E5',
                  border: 'none',
                  color: '#FFFFFF',
                  fontSize: 14,
                  fontWeight: '600',
                  fontFamily: 'Plus Jakarta Sans',
                  cursor: 'pointer',
                  padding: '10px 20px',
                  borderRadius: 8,
                  transition: 'background 200ms ease-out',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#4338CA';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#4F46E5';
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M14 10V12.6667C14 13.4 13.4 14 12.6667 14H3.33333C2.6 14 2 13.4 2 12.6667V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M11.3333 5.33333L8 2L4.66667 5.33333" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M8 2V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {t('documentPreview.closeAndAttach')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Animations */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes modalSlideIn {
          from {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
        }

        @keyframes slideUp {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
      `}} />
    </>
  );
};

export default DocumentPreviewModal;
