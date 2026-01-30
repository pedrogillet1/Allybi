import React, { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Document, Page, pdfjs } from 'react-pdf';
import api from '../../services/api';
import LeftNav from '../app-shell/LeftNav';
import NotificationPanel from '../notifications/NotificationPanel';
import SearchInDocumentModal from './SearchInDocumentModal';
import DeleteConfirmationModal from '../library/DeleteConfirmationModal';
import MoveToCategoryModal from '../library/MoveToCategoryModal';
import CreateCategoryModal from '../library/CreateCategoryModal';
import { ReactComponent as ArrowLeftIcon } from '../../assets/arrow-narrow-left.svg';
import { ReactComponent as LogoutWhiteIcon } from '../../assets/Logout-white.svg';
import { ReactComponent as DownloadWhiteIcon } from '../../assets/Download 3 white.svg';
import logoSvg from '../../assets/logo.svg';
import cleanDocumentName from '../../utils/cleanDocumentName';
import sphereIcon from '../../assets/sphere.svg';
import kodaLogoWhite from '../../assets/koda-knot-white.svg';
import { ReactComponent as TrashCanIcon } from '../../assets/Trash can.svg';
import { ReactComponent as PrinterIcon } from '../../assets/printer.svg';
import { ReactComponent as DownloadIcon } from '../../assets/Download 3- black.svg';
import { ReactComponent as PlusIcon } from '../../assets/Plus.svg';
import { ReactComponent as MinusIcon } from '../../assets/Minus.svg';
import { ReactComponent as StarIcon } from '../../assets/Star.svg';
import { ReactComponent as XCloseIcon } from '../../assets/x-close.svg';
import { ReactComponent as CloseIcon } from '../../assets/x-close.svg';
import { ReactComponent as AddIcon } from '../../assets/add.svg';
import folderIcon from '../../assets/folder_icon.svg';
import pdfIcon from '../../assets/pdf-icon.png';
import docIcon from '../../assets/doc-icon.png';
import xlsIcon from '../../assets/xls.png';
import jpgIcon from '../../assets/jpg-icon.png';
import pngIcon from '../../assets/png-icon.png';
import txtIcon from '../../assets/txt-icon.png';
import pptxIcon from '../../assets/pptx.png';
import movIcon from '../../assets/mov.png';
import mp4Icon from '../../assets/mp4.png';
import mp3Icon from '../../assets/mp3.svg';
import CategoryIcon from '../library/CategoryIcon';
import { ROUTES } from '../../constants/routes';
import { useDocuments } from '../../context/DocumentsContext';
import { useNotifications } from '../../context/NotificationsStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import {
  isSafari,
  isMacOS,
  isIOS,
  downloadFile as safariDownloadFile,
  getImageRenderingCSS,
  logBrowserInfo
} from '../../utils/browser/browserUtils';
import {
  getOptimalPDFWidth
} from '../../utils/rendering/pdfRenderingUtils';
import { getSupportedExports, hasExportOptions } from '../../utils/files/exportUtils';
import { getPreviewCountForFile, getFileExtension } from '../../utils/files/previewCount';

// ⚡ PERFORMANCE: Code-split MarkdownEditor to reduce initial bundle size
// react-markdown, remark-gfm, and rehype-raw add ~200KB to the bundle
const MarkdownEditor = lazy(() => import('./previews/MarkdownEditor'));

// ⚡ PERFORMANCE: Code-split ExcelPreview for Excel HTML table rendering
const ExcelPreview = lazy(() => import('./previews/ExcelPreview'));

// ⚡ PERFORMANCE: Code-split PPTXPreview to reduce initial bundle size
const PPTXPreview = lazy(() => import('./previews/PPTXPreview'));

// Set up the worker for pdf.js - react-pdf comes with its own pdfjs version
// Use jsdelivr CDN as fallback with the bundled version
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// Log browser information for debugging (only in development)
if (process.env.NODE_ENV === 'development') {
  logBrowserInfo();
}

// Text/Code Preview Component
const TextCodePreview = ({ url, document, zoom, t }) => {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(url)
      .then(res => res.text())
      .then(text => {
        setContent(text);
        setLoading(false);
      })
      .catch(err => {
        setLoading(false);
      });
  }, [url]);

  if (loading) {
    return <div style={{ color: '#6C6B6E', fontFamily: 'Plus Jakarta Sans' }}>{t ? t('documentViewer.loadingContent') : 'Loading content...'}</div>;
  }

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
        {cleanDocumentName(document.filename)}
      </div>
      <pre style={{
        padding: 20,
        margin: 0,
        overflow: 'auto',
        maxHeight: '70vh',
        fontSize: `${zoom / 10}px`,
        fontFamily: 'monospace',
        lineHeight: 1.6,
        color: '#32302C',
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word',
        transition: 'font-size 0.2s ease'
      }}>
        {content}
      </pre>
    </div>
  );
};

const DocumentViewer = () => {
  const { t } = useTranslation();
  const { showSuccess, showError } = useNotifications();
  const { documentId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { moveToFolder, createFolder, getRootFolders, getDocumentCountByFolder } = useDocuments();

  // Parse ?page=X query param for jump-to-page support
  const searchParams = new URLSearchParams(location.search);
  const initialPageParam = parseInt(searchParams.get('page'), 10) || 1;

  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(100);
  const [documentUrl, setDocumentUrl] = useState(null);
  const [showZoomDropdown, setShowZoomDropdown] = useState(false);
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [showNotificationsPopup, setShowNotificationsPopup] = useState(false);
  const [extractedText, setExtractedText] = useState(null);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [selectedDocumentForCategory, setSelectedDocumentForCategory] = useState(null);
  const [showCreateCategoryModal, setShowCreateCategoryModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(initialPageParam);
  const [pendingInitialPage, setPendingInitialPage] = useState(initialPageParam);
  const [showAskKoda, setShowAskKoda] = useState(() => {
    // Only show if not dismissed in this session
    return sessionStorage.getItem('askKodaDismissed') !== 'true';
  });
  const [showExtractedText, setShowExtractedText] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0); // Used to force re-fetch of preview after regeneration
  const [containerWidth, setContainerWidth] = useState(null); // Track container width for responsive PDF sizing
  const [childPreviewCount, setChildPreviewCount] = useState(null); // Count from child previews (PPTX, Excel)

  const zoomPresets = [50, 75, 100, 125, 150, 175, 200];

  // Refs to track PDF pages for scroll position
  const pageRefs = useRef({});
  const documentContainerRef = useRef(null);

  // Measure container width for responsive PDF/DOCX sizing
  useEffect(() => {
    const measureContainer = () => {
      if (documentContainerRef.current) {
        const padding = isMobile ? 16 : 48; // Account for container padding (8*2 or 24*2)
        const availableWidth = documentContainerRef.current.clientWidth - padding;
        setContainerWidth(availableWidth);
      }
    };

    // Initial measurement
    measureContainer();

    // Re-measure on window resize
    window.addEventListener('resize', measureContainer);

    // Use ResizeObserver for more accurate container size tracking
    const resizeObserver = new ResizeObserver(measureContainer);
    if (documentContainerRef.current) {
      resizeObserver.observe(documentContainerRef.current);
    }

    return () => {
      window.removeEventListener('resize', measureContainer);
      resizeObserver.disconnect();
    };
  }, [isMobile]);

  // Calculate responsive PDF page width - constrained to container
  // Uses cross-platform utility to handle Mac vs Windows scrollbar differences
  const getPdfPageWidth = useCallback(() => {
    if (isMobile) {
      return window.innerWidth - 16;
    }
    // Use cross-platform utility for better Mac/Windows compatibility
    const effectiveContainerWidth = containerWidth || (window.innerWidth - 250); // 250px for sidebar
    return getOptimalPDFWidth(effectiveContainerWidth, zoom, isMobile);
  }, [zoom, isMobile, containerWidth]);

  // Canonical preview count computation for PDF/Word documents
  const previewCount = useMemo(() => {
    if (!document) return null;
    const fileExt = getFileExtension(document.filename || '');

    // For PDF/Word, only show loading if we're actually fetching document info (loading=true)
    // Once document is fetched but PDF hasn't loaded yet, show page count when available
    return getPreviewCountForFile({
      mimeType: document.mimeType,
      fileExt,
      numPages,
      currentPage,
      isLoading: loading || imageLoading,
      previewType: 'pdf' // DocumentViewer primarily handles PDFs and Word docs
    }, t);
  }, [document, numPages, currentPage, loading, imageLoading, t]);

  // Handler for saving markdown edits
  const handleSaveMarkdown = async (docId, newMarkdownContent) => {
    try {
      await api.patch(`/api/documents/${docId}/markdown`, {
        markdownContent: newMarkdownContent
      });

      // Update local document state
      setDocument(prev => ({
        ...prev,
        metadata: {
          ...prev.metadata,
          markdownContent: newMarkdownContent
        }
      }));
    } catch (error) {
      throw error; // Re-throw to let the editor handle the error
    }
  };

  // Handler for exporting document
  const handleExport = async (format) => {
    // Check if export is supported for this file type
    const supportedFormats = getSupportedExports(document?.mimeType, document?.filename);
    const isSupported = supportedFormats.some(s => s.format === format);

    if (!isSupported) {
      showError(t('documentViewer.exportNotSupported', { format: format.toUpperCase() }));
      return;
    }

    try {
      // Call export API endpoint - expects JSON response with download URL
      const response = await api.post(`/api/documents/${documentId}/export`, {
        format: format
      });

      // Backend returns { success, downloadUrl OR url, filename }
      // Note: downloadUrl is used for PDF/Office, url is used for images
      const downloadUrl = response.data.downloadUrl || response.data.url;

      if (response.data.success && downloadUrl) {
        const filename = response.data.filename || `${(document.filename || 'document').split('.').slice(0, -1).join('.')}.${format}`;

        // ALWAYS fetch as blob to ensure proper download behavior
        // This prevents signed URLs from navigating away or showing inline
        let fetchUrl = downloadUrl;
        const fetchOptions = {};

        if (downloadUrl.startsWith('/')) {
          // Relative URL - prepend base and add auth header
          const token = localStorage.getItem('token');
          fetchUrl = `${process.env.REACT_APP_API_BASE_URL || ''}${downloadUrl}`;
          fetchOptions.headers = {
            'Authorization': `Bearer ${token}`
          };
        }
        // For absolute URLs (signed S3 URLs), fetch directly without auth
        // S3 signed URLs already contain authentication in query params

        const pdfResponse = await fetch(fetchUrl, fetchOptions);

        if (!pdfResponse.ok) {
          // Try to parse error response
          const contentType = pdfResponse.headers.get('Content-Type') || '';
          if (contentType.includes('application/json')) {
            const errorData = await pdfResponse.json();
            throw new Error(errorData.error || `Download failed: ${pdfResponse.status}`);
          }
          throw new Error(`Download failed: ${pdfResponse.status}`);
        }

        // Verify content type is PDF
        const contentType = pdfResponse.headers.get('Content-Type') || '';
        if (!contentType.includes('application/pdf')) {
          // If server returned JSON error instead of PDF
          if (contentType.includes('application/json')) {
            const errorData = await pdfResponse.json();
            throw new Error(errorData.error || 'Export failed - PDF not available');
          }
          throw new Error('Export failed - invalid content type received');
        }

        const blob = await pdfResponse.blob();

        // Verify we got valid PDF content (check for %PDF- magic bytes)
        if (blob.size < 5) {
          throw new Error('Export failed - empty or corrupt file received');
        }

        // Read first bytes to verify PDF header
        const headerBytes = await blob.slice(0, 5).text();
        if (!headerBytes.startsWith('%PDF-')) {
          throw new Error('Export failed - invalid PDF file received');
        }

        // Create blob URL and trigger download
        const blobUrl = window.URL.createObjectURL(blob);
        const link = window.document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        link.style.display = 'none';
        window.document.body.appendChild(link);
        link.click();
        window.document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
      } else {
        throw new Error(response.data.error || 'Export failed');
      }
    } catch (error) {
      showError(t('documentViewer.failedToExport', { error: error.response?.data?.error || error.message }));
    }
  };

  // Handler for regenerating preview (markdown/slides)
  const handleRegeneratePreview = async () => {
    if (!document) return;

    try {
      setIsRegenerating(true);
      // Call reprocess endpoint to regenerate markdown/slides
      const response = await api.post(`/api/documents/${documentId}/reprocess`);
      // Reload the document to get fresh metadata
      const updatedDoc = await api.get(`/api/documents/${documentId}/status`);

      // Update document state
      setDocument(updatedDoc.data);

      // Increment preview version to force re-fetch of preview content
      setPreviewVersion(v => v + 1);

      // Clear cached URLs to force reload
      setDocumentUrl(null);
      setActualDocumentUrl(null);

      // Show success message (no reload needed)
      showSuccess(t('documentViewer.previewRegenerated'));
    } catch (error) {
      showError(t('documentViewer.failedToRegeneratePreview'));
    } finally {
      setIsRegenerating(false);
    }
  };

  // Determine breadcrumb start based on location state or default to Documents
  const breadcrumbStart = useMemo(() => {
    const from = location.state?.from;
    if (from === ROUTES.HOME || from === 'home') {
      return { label: t('nav.home'), path: ROUTES.HOME };
    }
    return { label: t('nav.documents'), path: ROUTES.DOCUMENTS };
  }, [location.state, t]);

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
    // Clamp pendingInitialPage to valid range and jump to that page
    const targetPage = Math.max(1, Math.min(pendingInitialPage, numPages));
    setPageNumber(targetPage);
    setCurrentPage(targetPage);
  };

  // Handle URL ?page= param changes (e.g., from citation links)
  useEffect(() => {
    const newPageParam = parseInt(new URLSearchParams(location.search).get('page'), 10) || 1;
    setPendingInitialPage(newPageParam);
    if (numPages && numPages > 0) {
      const targetPage = Math.max(1, Math.min(newPageParam, numPages));
      setCurrentPage(targetPage);
      setPageNumber(targetPage);
    }
  }, [location.search, numPages]);

  // State to hold the actual document URL (with backend URL prepended for API endpoints)
  const [actualDocumentUrl, setActualDocumentUrl] = useState(null);
  const [isFetchingImage, setIsFetchingImage] = useState(false);

  // Process document URL to use correct backend URL for API endpoints
  // For encrypted images, fetch with auth and create blob URL
  useEffect(() => {
    if (!documentUrl) {
      setActualDocumentUrl(null);
      return;
    }

    // Check if it's a relative API path (starts with /api/) or already a full backend URL
    const isRelativeApiPath = documentUrl.startsWith('/api/');
    const isBackendUrl = documentUrl.includes('getkoda.ai') || documentUrl.includes('localhost:5000');
    const isS3Url = documentUrl.includes('s3.amazonaws.com') || documentUrl.includes('.s3.');
    const isStreamEndpoint = documentUrl.includes('/stream');

    // For encrypted images (stream endpoint), fetch with auth and create blob URL
    if (isStreamEndpoint && document?.mimeType?.startsWith('image/')) {
      setIsFetchingImage(true);

      const token = localStorage.getItem('accessToken');
      fetch(documentUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          return response.blob();
        })
        .then(blob => {
          const blobUrl = URL.createObjectURL(blob);
          setActualDocumentUrl(blobUrl);
          setIsFetchingImage(false);
        })
        .catch(error => {
          setIsFetchingImage(false);
          setImageError(true);
        });

      // Cleanup blob URL when component unmounts or URL changes
      return () => {
        if (actualDocumentUrl && actualDocumentUrl.startsWith('blob:')) {
          URL.revokeObjectURL(actualDocumentUrl);
        }
      };
    } else if (isRelativeApiPath) {
      // Relative API path - prepend backend URL
      const API_URL = process.env.REACT_APP_API_URL || 'https://getkoda.ai';
      const fullUrl = `${API_URL}${documentUrl}`;
      setActualDocumentUrl(fullUrl);
    } else if (isBackendUrl || isS3Url) {
      // Already a full URL (backend or S3) - use directly
      setActualDocumentUrl(documentUrl);
    } else {
      // Unknown URL format - use as is
      setActualDocumentUrl(documentUrl);
    }
  }, [documentUrl, document?.mimeType]);

  // Memoize the file config for PDF.js
  const fileConfig = useMemo(() => {
    if (!actualDocumentUrl) return null;

    // For preview-pdf and stream endpoints (encrypted files), fetch with auth headers
    if (actualDocumentUrl.includes('/preview-pdf') || actualDocumentUrl.includes('/stream')) {
      const token = localStorage.getItem('accessToken');
      return {
        url: actualDocumentUrl,
        httpHeaders: {
          'Authorization': `Bearer ${token}`
        }
      };
    }

    return { url: actualDocumentUrl };
  }, [actualDocumentUrl]);

  const pdfOptions = useMemo(() => {
    const isMacOS = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const isSafari = navigator.userAgent.toLowerCase().indexOf('safari') !== -1 &&
                     navigator.userAgent.toLowerCase().indexOf('chrome') === -1;

    const baseOptions = {
      cMapUrl: 'https://unpkg.com/pdfjs-dist@' + pdfjs.version + '/cmaps/',
      cMapPacked: true,
      isEvalSupported: false,
    };

    // Mac Safari: Use additional options for better text rendering
    if (isMacOS && isSafari) {
      return {
        ...baseOptions,
        disableAutoFetch: false,
        disableStream: false,
        rangeChunkSize: 65536,
        useSystemFonts: true,
        standardFontDataUrl: 'https://unpkg.com/pdfjs-dist@' + pdfjs.version + '/standard_fonts/',
      };
    }

    return baseOptions;
  }, []);

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileType = (filename, mimeType) => {
    const extension = (filename || '').split('.').pop()?.toLowerCase() || '';

    // Try extension first
    // Image formats
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'].includes(extension)) {
      return 'image';
    }

    // Video formats
    if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(extension)) {
      return 'video';
    }

    // Audio formats
    if (['mp3', 'wav', 'ogg', 'm4a', 'aac'].includes(extension)) {
      return 'audio';
    }

    // PDF
    if (extension === 'pdf') {
      return 'pdf';
    }

    // Microsoft Office documents
    if (['doc', 'docx'].includes(extension)) {
      return 'word';
    }

    if (['xls', 'xlsx'].includes(extension)) {
      return 'excel';
    }

    if (['ppt', 'pptx'].includes(extension)) {
      return 'powerpoint';
    }

    // Text files
    if (['txt', 'md', 'json', 'xml', 'csv'].includes(extension)) {
      return 'text';
    }

    // Code files
    if (['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'cpp', 'c', 'html', 'css', 'php', 'rb', 'go'].includes(extension)) {
      return 'code';
    }

    // Archives
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) {
      return 'archive';
    }

    // ✅ FALLBACK: If extension detection failed, use mimeType
    if (mimeType) {
      // Image types
      if (mimeType.startsWith('image/')) return 'image';

      // Video types
      if (mimeType.startsWith('video/')) return 'video';

      // Audio types
      if (mimeType.startsWith('audio/')) return 'audio';

      // PDF
      if (mimeType === 'application/pdf') return 'pdf';

      // Microsoft Office documents
      if (mimeType.includes('msword') || mimeType.includes('wordprocessingml')) return 'word';
      if (mimeType.includes('excel') || mimeType.includes('spreadsheetml')) return 'excel';
      if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'powerpoint';

      // Text files
      if (mimeType.startsWith('text/')) return 'text';

      // Archives
      if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('7z') || mimeType.includes('tar') || mimeType.includes('gzip')) {
        return 'archive';
      }
    }

    return 'unknown';
  };

  // Get file icon based on extension
  const getFileIcon = (filename) => {
    if (!filename) return null;
    const extension = filename.split('.').pop().toLowerCase();

    switch (extension) {
      case 'pdf':
        return pdfIcon;
      case 'doc':
      case 'docx':
        return docIcon;
      case 'xls':
      case 'xlsx':
        return xlsIcon;
      case 'ppt':
      case 'pptx':
        return pptxIcon;
      case 'jpg':
      case 'jpeg':
        return jpgIcon;
      case 'png':
        return pngIcon;
      case 'txt':
      case 'md':
        return txtIcon;
      case 'mov':
        return movIcon;
      case 'mp4':
        return mp4Icon;
      case 'mp3':
        return mp3Icon;
      default:
        return txtIcon; // Default to txt icon for unknown types
    }
  };

  // Reset childPreviewCount when document changes
  useEffect(() => {
    setChildPreviewCount(null);
  }, [documentId]);

  useEffect(() => {
    const fetchDocument = async () => {
      try {
        // Fetch only the specific document instead of all documents
        const response = await api.get(`/api/documents/${documentId}/status`);
        const foundDocument = response.data;

        if (foundDocument) {
          setDocument(foundDocument);

          // Store extracted text if available
          if (foundDocument.metadata && foundDocument.metadata.extractedText) {
            setExtractedText(foundDocument.metadata.extractedText);
          }

          // AUTO-REGENERATE: Check if markdown content is missing for Excel (keep for Excel only)
          const isExcel = foundDocument.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          const hasMarkdown = foundDocument.metadata && foundDocument.metadata.markdownContent;

          if (isExcel && !hasMarkdown) {
            // Trigger reprocess in background (don't await, let it run async)
            api.post(`/api/documents/${documentId}/reprocess`)
              .then(response => {
                // Reload document to get updated metadata
                return api.get(`/api/documents/${documentId}/status`);
              })
              .then(response => {
                setDocument(response.data);
              })
              .catch(error => {
              });
          }

          // DOCX FILES: Fetch preview information from backend
          // Backend will return previewType='pdf' with a URL to the converted PDF
          const isDocx = foundDocument.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

          if (isDocx) {
            const previewResponse = await api.get(`/api/documents/${documentId}/preview`);
            const { previewType, previewUrl } = previewResponse.data;
            // For DOCX converted to PDF, set the preview-pdf URL
            if (previewType === 'pdf' && previewUrl) {
              setDocumentUrl(previewUrl);
            }
          } else {
            // For non-DOCX files, use the existing view-url logic
            const viewUrlResponse = await api.get(`/api/documents/${documentId}/view-url`);
            const { url: documentUrl } = viewUrlResponse.data;

            const isStreamEndpoint = documentUrl.includes('/stream');
            if (isStreamEndpoint) {
              setDocumentUrl(documentUrl);
            } else {
              const cacheKey = `document_signed_url_${documentId}`;
              const cachedData = sessionStorage.getItem(cacheKey);
              if (cachedData) {
                try {
                  const { url, timestamp } = JSON.parse(cachedData);
                  const age = Date.now() - timestamp;
                  if (age < 3000000) {
                    setDocumentUrl(url);
                  } else {
                    throw new Error('Cached URL expired');
                  }
                } catch (err) {
                  sessionStorage.removeItem(cacheKey);
                  sessionStorage.setItem(cacheKey, JSON.stringify({ url: documentUrl, timestamp: Date.now() }));
                  setDocumentUrl(documentUrl);
                }
              } else {
                sessionStorage.setItem(cacheKey, JSON.stringify({ url: documentUrl, timestamp: Date.now() }));
                setDocumentUrl(documentUrl);
              }
            }
          }
        }
        setLoading(false);
      } catch (error) {
        console.error('[DocumentViewer] Error fetching document:', {
          documentId,
          errorMessage: error.message,
          errorResponse: error.response?.data,
          errorStatus: error.response?.status,
          errorStatusText: error.response?.statusText,
          fullError: error
        });
        setLoading(false);
      }
    };

    if (documentId) {
      fetchDocument();
    }

    // Cleanup blob URL
    return () => {
      if (documentUrl && documentUrl.startsWith('blob:')) {
        URL.revokeObjectURL(documentUrl);
      }
    };
  }, [documentId]);

  // Add Ctrl+F / Cmd+F keyboard shortcut to open search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearchModal(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Track which page is currently visible using Intersection Observer
  useEffect(() => {
    if (!numPages || numPages === 0) return;

    const observerOptions = {
      root: documentContainerRef.current,
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
  }, [numPages]);

  if (loading) {
    return (
      <div style={{ width: '100%', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#6C6B6E', fontSize: 16, fontFamily: 'Plus Jakarta Sans' }}>{t('documentViewer.loadingDocument')}</div>
      </div>
    );
  }

  if (!document) {
    return (
      <div style={{ width: '100%', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#6C6B6E', fontSize: 16, fontFamily: 'Plus Jakarta Sans' }}>{t('documentViewer.documentNotFound')}</div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100dvh', position: 'relative', background: '#F5F5F5', overflow: 'hidden', justifyContent: 'flex-start', alignItems: 'stretch', display: 'flex' }}>
        {!isMobile && <LeftNav onNotificationClick={() => setShowNotificationsPopup(true)} />}
        <div style={{ flex: '1 1 0', height: '100%', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', display: 'flex', width: '100%', minWidth: 0, minHeight: 0 }}>
          {/* Header */}
          <div style={{
            alignSelf: 'stretch',
            minHeight: isMobile ? 'auto' : 96,
            padding: isMobile ? 12 : 16,
            background: 'white',
            borderBottom: '1px #E6E6EC solid',
            justifyContent: 'flex-start',
            alignItems: 'center',
            gap: isMobile ? 8 : 12,
            display: 'flex',
            flexWrap: isMobile ? 'wrap' : 'nowrap'
          }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              width: isMobile ? 36 : 42,
              height: isMobile ? 36 : 42,
              background: 'white',
              borderRadius: 100,
              outline: '1px #E6E6EC solid',
              outlineOffset: '-1px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              border: 'none',
              transition: 'all 0.2s ease',
              flexShrink: 0
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#F5F5F5';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'white';
            }}
          >
            <ArrowLeftIcon style={{ width: 18, height: 18, stroke: '#181818' }} />
          </button>

          <div style={{ flex: '1 1 0', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', gap: isMobile ? 4 : 8, display: 'inline-flex', minWidth: 0, overflow: 'hidden' }}>
            {/* Breadcrumb - hidden on mobile */}
            {!isMobile && (
              <div style={{ justifyContent: 'flex-start', alignItems: 'center', display: 'inline-flex' }}>
                <div style={{ justifyContent: 'flex-start', alignItems: 'center', gap: 12, display: 'flex' }}>
                  {/* Home or Documents */}
                  <div
                    onClick={() => navigate(breadcrumbStart.path)}
                    style={{ paddingTop: 4, paddingBottom: 4, borderRadius: 6, justifyContent: 'center', alignItems: 'center', display: 'flex', cursor: 'pointer' }}
                  >
                    <div style={{ color: '#6C6B6E', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', lineHeight: '20px', wordWrap: 'break-word' }}>{breadcrumbStart.label}</div>
                  </div>
                  {/* Category (if document has folderId) */}
                  {document.folderId && (() => {
                    const allFolders = getRootFolders();
                    const category = allFolders.find(cat => cat.id === document.folderId);
                    return category ? (
                      <React.Fragment>
                        <div style={{ color: '#D0D5DD', fontSize: 16 }}>›</div>
                        <div style={{ paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4, borderRadius: 6, justifyContent: 'center', alignItems: 'center', display: 'flex' }}>
                          <div style={{ color: '#6C6B6E', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', lineHeight: '20px', wordWrap: 'break-word' }}>{category.name}</div>
                        </div>
                      </React.Fragment>
                    ) : null;
                  })()}
                  {/* Folder path (if exists) */}
                  {document.folderPath && document.folderPath.split('/').filter(Boolean).map((folder, index, arr) => (
                    <React.Fragment key={index}>
                      <div style={{ color: '#D0D5DD', fontSize: 16 }}>›</div>
                      <div style={{ paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4, borderRadius: 6, justifyContent: 'center', alignItems: 'center', display: 'flex' }}>
                        <div style={{ color: '#6C6B6E', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', lineHeight: '20px', wordWrap: 'break-word' }}>{folder}</div>
                      </div>
                    </React.Fragment>
                  ))}
                  {/* File name */}
                  <div style={{ color: '#D0D5DD', fontSize: 16 }}>›</div>
                  <div style={{ paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4, background: '#F9FAFB', borderRadius: 6, justifyContent: 'center', alignItems: 'center', display: 'flex' }}>
                    <div style={{ color: '#323232', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', lineHeight: '20px', wordWrap: 'break-word' }}>{cleanDocumentName(document.filename)}</div>
                  </div>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', overflow: 'hidden' }}>
              <img
                src={getFileIcon(document.filename)}
                alt=""
                style={{
                  width: isMobile ? 32 : 38,
                  height: isMobile ? 32 : 38,
                  objectFit: 'contain',
                  flexShrink: 0
                }}
              />
              <span style={{
                color: '#323232',
                fontSize: isMobile ? 16 : 20,
                fontFamily: 'Plus Jakarta Sans',
                fontWeight: '700',
                lineHeight: isMobile ? '22px' : '30px',
                wordWrap: 'break-word',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>{cleanDocumentName(document.filename)}</span>
            </div>
          </div>

          {/* Action buttons - simplified on mobile */}
          {!isMobile ? (
            <div style={{ borderRadius: 12, justifyContent: 'flex-end', alignItems: 'center', display: 'flex' }}>
              {/* Utility icons group - trash & print */}
              <div style={{ justifyContent: 'flex-start', alignItems: 'center', gap: 8, display: 'flex', marginRight: 20 }}>
                <button
                  onClick={() => setShowDeleteModal(true)}
                  style={{ width: 42, height: 42, background: 'white', overflow: 'hidden', borderRadius: 100, border: '1px solid #E6E6EC', justifyContent: 'center', alignItems: 'center', display: 'flex', cursor: 'pointer', transition: 'all 0.2s ease' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#FEF2F2';
                    e.currentTarget.style.borderColor = '#FECACA';
                    e.currentTarget.querySelector('svg').style.stroke = '#C04040';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'white';
                    e.currentTarget.style.borderColor = '#E6E6EC';
                    e.currentTarget.querySelector('svg').style.stroke = '#181818';
                  }}
                >
                  <TrashCanIcon style={{ width: 20, height: 20, stroke: '#181818', transition: 'stroke 0.2s ease' }} />
                </button>
              <button
                onClick={async () => {
                  if (document) {
                    try {
                      const docType = getFileType(document.filename, document.mimeType);

                      // Helper function to print using hidden iframe (no new tab)
                      const printWithIframe = (htmlContent) => {
                        const iframe = window.document.createElement('iframe');
                        iframe.style.position = 'absolute';
                        iframe.style.width = '0';
                        iframe.style.height = '0';
                        iframe.style.border = 'none';
                        iframe.style.left = '-9999px';
                        window.document.body.appendChild(iframe);

                        const iframeDoc = iframe.contentWindow.document;
                        iframeDoc.open();
                        iframeDoc.write(htmlContent);
                        iframeDoc.close();

                        // Wait for content to load then print
                        iframe.onload = () => {
                          setTimeout(() => {
                            iframe.contentWindow.focus();
                            iframe.contentWindow.print();
                            // Cleanup after print dialog closes
                            setTimeout(() => {
                              if (iframe.parentNode) {
                                window.document.body.removeChild(iframe);
                              }
                            }, 1000);
                          }, 500);
                        };
                      };

                      // For PPTX files - fetch slides and print
                      if (docType === 'powerpoint') {
                        try {
                          const slidesResponse = await api.get(`/api/documents/${documentId}/slides`);
                          if (slidesResponse.data.success && slidesResponse.data.slides?.length > 0) {
                            const slides = slidesResponse.data.slides;

                            // Create printable HTML with only slide content (no headers/names)
                            const htmlContent = `
                              <!DOCTYPE html>
                              <html>
                              <head>
                                <title>Print</title>
                                <style>
                                  @media print {
                                    @page { size: landscape; margin: 0; }
                                    body { margin: 0; }
                                    .slide-container { page-break-after: always; }
                                    .slide-container:last-child { page-break-after: auto; }
                                  }
                                  * { margin: 0; padding: 0; box-sizing: border-box; }
                                  body { margin: 0; padding: 0; }
                                  .slide-container {
                                    width: 100%;
                                    height: 100vh;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    background: white;
                                  }
                                  .slide-image {
                                    max-width: 100%;
                                    max-height: 100vh;
                                    object-fit: contain;
                                  }
                                  .slide-text {
                                    white-space: pre-wrap;
                                    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                                    padding: 40px;
                                    font-size: 14px;
                                  }
                                </style>
                              </head>
                              <body>
                                ${slides.map((slide) => `
                                  <div class="slide-container">
                                    ${slide.imageUrl
                                      ? `<img src="${slide.imageUrl}" class="slide-image" />`
                                      : slide.content
                                        ? `<div class="slide-text">${slide.content}</div>`
                                        : ''
                                    }
                                  </div>
                                `).join('')}
                              </body>
                              </html>
                            `;
                            printWithIframe(htmlContent);
                          } else {
                            showError(t('documentViewer.noSlidesToPrint') || 'No slides available to print');
                          }
                        } catch (error) {
                          showError(t('documentViewer.failedToLoadForPrinting'));
                        }
                        return;
                      }

                      // For PDF - use blob iframe print
                      if (docType === 'pdf') {
                        const response = await api.get(`/api/documents/${documentId}/stream`, {
                          responseType: 'blob'
                        });
                        const blobUrl = window.URL.createObjectURL(response.data);
                        const iframe = window.document.createElement('iframe');
                        iframe.style.position = 'absolute';
                        iframe.style.width = '0';
                        iframe.style.height = '0';
                        iframe.style.border = 'none';
                        iframe.style.left = '-9999px';
                        window.document.body.appendChild(iframe);

                        iframe.onload = () => {
                          setTimeout(() => {
                            try {
                              iframe.contentWindow.focus();
                              iframe.contentWindow.print();
                            } catch (e) {
                              showError(t('documentViewer.unableToPrint'));
                            }
                            setTimeout(() => {
                              if (iframe.parentNode) window.document.body.removeChild(iframe);
                              window.URL.revokeObjectURL(blobUrl);
                            }, 1000);
                          }, 500);
                        };

                        iframe.src = blobUrl;
                        return;
                      }

                      // For images - create HTML with just the image
                      if (docType === 'image') {
                        const response = await api.get(`/api/documents/${documentId}/stream`, {
                          responseType: 'blob'
                        });
                        const blobUrl = window.URL.createObjectURL(response.data);

                        const htmlContent = `
                          <!DOCTYPE html>
                          <html>
                          <head>
                            <title>Print</title>
                            <style>
                              @media print { @page { margin: 0; } }
                              * { margin: 0; padding: 0; }
                              body {
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                min-height: 100vh;
                                background: white;
                              }
                              img { max-width: 100%; max-height: 100vh; object-fit: contain; }
                            </style>
                          </head>
                          <body>
                            <img src="${blobUrl}" onload="setTimeout(function() { window.print(); }, 100);" />
                          </body>
                          </html>
                        `;
                        printWithIframe(htmlContent);
                        return;
                      }

                      // For DOCX - use preview-pdf endpoint
                      if (docType === 'word') {
                        try {
                          const response = await api.get(`/api/documents/${documentId}/preview-pdf`, {
                            responseType: 'blob'
                          });
                          const blobUrl = window.URL.createObjectURL(response.data);
                          const iframe = window.document.createElement('iframe');
                          iframe.style.position = 'absolute';
                          iframe.style.width = '0';
                          iframe.style.height = '0';
                          iframe.style.border = 'none';
                          iframe.style.left = '-9999px';
                          window.document.body.appendChild(iframe);

                          iframe.onload = () => {
                            setTimeout(() => {
                              try {
                                iframe.contentWindow.focus();
                                iframe.contentWindow.print();
                              } catch (e) {
                                showError(t('documentViewer.unableToPrint'));
                              }
                              setTimeout(() => {
                                if (iframe.parentNode) window.document.body.removeChild(iframe);
                                window.URL.revokeObjectURL(blobUrl);
                              }, 1000);
                            }, 500);
                          };

                          iframe.src = blobUrl;
                        } catch (error) {
                          showError(t('documentViewer.failedToLoadForPrinting'));
                        }
                        return;
                      }

                      // For other documents - print extracted text only (no headers)
                      const textContent = document.metadata?.extractedText || '';
                      if (textContent) {
                        const htmlContent = `
                          <!DOCTYPE html>
                          <html>
                          <head>
                            <title>Print</title>
                            <style>
                              @media print { @page { margin: 0.5in; } }
                              * { margin: 0; padding: 0; }
                              body {
                                font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                                font-size: 12px;
                                line-height: 1.6;
                                white-space: pre-wrap;
                                padding: 20px;
                              }
                            </style>
                          </head>
                          <body>${textContent}</body>
                          </html>
                        `;
                        printWithIframe(htmlContent);
                      } else {
                        showError(t('documentViewer.noContentToPrint') || 'No content available to print');
                      }
                    } catch (error) {
                      showError(t('documentViewer.failedToLoadForPrinting'));
                    }
                  }
                }}
                style={{ width: 42, height: 42, background: 'white', overflow: 'hidden', borderRadius: 100, border: '1px solid #E6E6EC', justifyContent: 'center', alignItems: 'center', display: 'flex', cursor: 'pointer', transition: 'all 0.2s ease' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#F5F5F5';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'white';
                }}
              >
                <PrinterIcon style={{ width: 20, height: 20 }} />
              </button>
            </div>
            {/* Ask Koda Button - Opens document in chat */}
            <button
              onClick={() => {
                // Clear current conversation to force a new chat
                sessionStorage.removeItem('currentConversationId');
                navigate(`${ROUTES.CHAT}?documentId=${documentId}`, { state: { newConversation: true } });
              }}
              style={{
                height: 40,
                paddingLeft: 14,
                paddingRight: 16,
                background: 'white',
                borderRadius: 24,
                border: '1px solid #E2E2E6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                marginRight: 12
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#F5F5F5';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'white';
              }}
            >
              <img
                src={sphereIcon}
                alt="Koda"
                style={{
                  width: 22,
                  height: 22,
                  objectFit: 'contain',
                  ...getImageRenderingCSS()
                }}
              />
              <div style={{ color: '#181818', fontSize: 13, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', lineHeight: '18px' }}>{t('documentViewer.askKoda')}</div>
            </button>
            <button
              onClick={() => setShowShareModal(true)}
              style={{ height: 42, paddingLeft: 16, paddingRight: 20, background: '#181818', overflow: 'hidden', borderRadius: 24, justifyContent: 'center', alignItems: 'center', gap: 8, display: 'flex', border: 'none', cursor: 'pointer', transition: 'all 0.2s ease' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#333333';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#181818';
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.background = '#000000';
                e.currentTarget.style.transform = 'scale(0.98)';
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.background = '#333333';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              <DownloadWhiteIcon style={{ width: 18, height: 18 }} />
              <div style={{ color: 'white', fontSize: 15, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', lineHeight: '22px' }}>{t('documentViewer.download')}</div>
            </button>
          </div>
          ) : (
            /* Mobile: Show download button only in header */
            <button
              onClick={() => setShowShareModal(true)}
              style={{
                width: 36,
                height: 36,
                background: 'rgba(24, 24, 24, 0.90)',
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              <DownloadWhiteIcon style={{ width: 18, height: 18 }} />
            </button>
          )}
        </div>

        {/* Toolbar */}
        <div style={{
          alignSelf: 'stretch',
          paddingLeft: isMobile ? 12 : 16,
          paddingRight: isMobile ? 12 : 16,
          paddingTop: isMobile ? 10 : 13,
          paddingBottom: isMobile ? 10 : 13,
          background: 'white',
          borderBottom: '1px #E6E6EC solid',
          justifyContent: 'flex-start',
          alignItems: 'center',
          gap: isMobile ? 8 : 12,
          display: 'flex',
          flexWrap: isMobile ? 'wrap' : 'nowrap'
        }}>
          <div style={{ color: '#323232', fontSize: isMobile ? 12 : 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '500', lineHeight: '20px', wordWrap: 'break-word' }}>
            {(() => {
              const fileType = document ? getFileType(document.filename, document.mimeType) : 'unknown';
              // Use child preview count for PPTX/Excel (slides/sheets)
              if (childPreviewCount) {
                return childPreviewCount.label || t('common.loading');
              }
              // PDF and Word use the local previewCount
              if (fileType === 'pdf' || fileType === 'word') {
                return previewCount?.label || t('common.loading');
              }
              // Images: show nothing or "Image"
              if (fileType === 'image') {
                return t('previewCount.image', { defaultValue: 'Image' });
              }
              // Video/Audio: hide count
              if (fileType === 'video' || fileType === 'audio') {
                return null;
              }
              // Unknown/other: show generic preview label
              return t('previewCount.preview', { defaultValue: 'Preview' });
            })()}
          </div>
          <div style={{ width: 1, height: 19, background: '#D9D9D9' }} />
          <div style={{ flex: '1 1 0', justifyContent: 'flex-start', alignItems: 'center', gap: isMobile ? 8 : 12, display: 'flex' }}>
            <button
              onClick={() => {
                setSelectedDocumentForCategory(document);
                setShowCategoryModal(true);
              }}
              style={{
                paddingLeft: isMobile ? 12 : 16,
                paddingRight: isMobile ? 12 : 16,
                paddingTop: isMobile ? 8 : 10,
                paddingBottom: isMobile ? 8 : 10,
                background: 'white',
                borderRadius: 24,
                border: '1px solid #E2E2E6',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#F5F5F5';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'white';
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#181818" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                <line x1="12" y1="11" x2="12" y2="17"/>
                <line x1="9" y1="14" x2="15" y2="14"/>
              </svg>
              <span style={{
                color: '#181818',
                fontSize: isMobile ? 12 : 14,
                fontFamily: 'Plus Jakarta Sans',
                fontWeight: '600',
                lineHeight: '20px'
              }}>
                {t('modals.moveToCategory.title')}
              </span>
            </button>
          </div>
          {/* Zoom controls - hidden on mobile */}
          {!isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
            <button
              onClick={() => setZoom(prev => Math.max(50, prev - 25))}
              style={{ width: 32, height: 32, background: 'transparent', border: 'none', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background 0.2s ease' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#F0F0F0';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 8H12" stroke="#181818" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
            <div style={{ height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', display: 'flex', position: 'relative' }}>
              <div
                onClick={() => setShowZoomDropdown(!showZoomDropdown)}
                style={{ alignSelf: 'stretch', paddingLeft: 14, paddingRight: 12, paddingTop: 10, paddingBottom: 10, background: 'white', overflow: 'hidden', borderRadius: 20, border: '1px solid #E6E6EC', justifyContent: 'center', alignItems: 'center', gap: 6, display: 'flex', cursor: 'pointer', transition: 'all 0.2s ease' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#F9FAFB';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'white';
                }}
              >
                <div style={{ color: '#181818', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', lineHeight: '19.60px', wordWrap: 'break-word' }}>{zoom}%</div>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  style={{ transition: 'transform 0.2s ease', transform: showZoomDropdown ? 'rotate(180deg)' : 'rotate(0deg)' }}
                >
                  <path d="M3 4.5L6 7.5L9 4.5" stroke="#181818" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>

              {/* Zoom Dropdown */}
              {showZoomDropdown && (
                <div
                  data-dropdown
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    marginTop: 4,
                    background: 'white',
                    borderRadius: 12,
                    border: '1px solid #E6E6EC',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
                    zIndex: 1001,
                    minWidth: 100,
                    overflow: 'hidden',
                    padding: 8
                  }}>
                  {zoomPresets.map((preset) => (
                    <div
                      key={preset}
                      onClick={() => {
                        setZoom(preset);
                        setShowZoomDropdown(false);
                      }}
                      style={{
                        padding: '10px 14px',
                        cursor: 'pointer',
                        background: zoom === preset ? '#F5F5F5' : 'white',
                        color: '#181818',
                        fontSize: 14,
                        fontFamily: 'Plus Jakarta Sans',
                        fontWeight: zoom === preset ? '600' : '500',
                        transition: 'background 0.2s ease',
                        borderRadius: 6
                      }}
                      onMouseEnter={(e) => {
                        if (zoom !== preset) e.currentTarget.style.background = '#F5F5F5';
                      }}
                      onMouseLeave={(e) => {
                        if (zoom !== preset) e.currentTarget.style.background = 'white';
                      }}
                    >
                      {preset}%
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => setZoom(prev => Math.min(200, prev + 25))}
              style={{ width: 32, height: 32, background: 'transparent', border: 'none', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background 0.2s ease' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#F0F0F0';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 4V12M4 8H12" stroke="#181818" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
          )}
        </div>

        {/* Document Preview */}
        <div ref={documentContainerRef} className="document-container" style={{
          width: '100%',
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          padding: isMobile ? 8 : 24,
          overflow: 'auto',
          overflowX: 'auto',
          overflowY: 'auto',
          flexDirection: 'column',
          justifyContent: 'flex-start',
          alignItems: 'center',
          display: 'flex',
          background: '#E8E8EA',
          WebkitOverflowScrolling: 'touch',
          boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.06)',
          borderTop: '1px solid #D8D8DA',
          scrollbarGutter: 'stable'
        }}>
          {document ? (
            (() => {
              const fileType = getFileType(document.filename, document.mimeType);

              // For other file types, keep existing rendering
              if (!documentUrl) {
                return (
                  <div style={{
                    padding: 40,
                    background: 'white',
                    borderRadius: 12,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    color: '#6C6B6E',
                    fontSize: 16,
                    fontFamily: 'Plus Jakarta Sans'
                  }}>
                    Loading document...
                  </div>
                );
              }

              switch (fileType) {
                case 'word': // DOCX - show as PDF (converted during upload)
                  // DOCX files are converted to PDF on the backend and displayed as PDF
                  return (
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
                      <Document
                        file={fileConfig}
                        onLoadSuccess={onDocumentLoadSuccess}
                        onLoadError={(error) => {
                        }}
                        options={pdfOptions}
                        loading={
                          <div style={{
                            padding: 40,
                            background: 'white',
                            borderRadius: 12,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                            color: '#6C6B6E',
                            fontSize: 16,
                            fontFamily: 'Plus Jakarta Sans'
                          }}>
                            Loading PDF...
                          </div>
                        }
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
                              Failed to load PDF
                            </div>
                            <div style={{ fontSize: 14, color: '#6C6B6E', fontFamily: 'Plus Jakarta Sans', marginBottom: 24 }}>
                              {cleanDocumentName(document.filename)}
                            </div>
                            <button
                              onClick={async () => {
                                try {
                                  const response = await api.get(`/api/documents/${document.id}/download`);
                                  const downloadUrl = response.data.url;
                                  safariDownloadFile(downloadUrl, document.filename);
                                } catch (error) {
                                  showError(t('alerts.failedToDownload'));
                                }
                              }}
                              style={{
                                display: 'inline-block',
                                padding: '12px 24px',
                                background: 'rgba(24, 24, 24, 0.90)',
                                color: 'white',
                                borderRadius: 14,
                                textDecoration: 'none',
                                fontSize: 14,
                                fontWeight: '600',
                                fontFamily: 'Plus Jakarta Sans',
                                border: 'none',
                                cursor: 'pointer'
                              }}>
                              {isSafari() || isIOS() ? t('documentViewer.openPdf') : t('documentViewer.downloadPdf')}
                            </button>
                          </div>
                        }
                      >
                        {Array.from(new Array(numPages), (el, index) => (
                          <div
                            key={`page_${index + 1}`}
                            ref={(el) => {
                              if (el) {
                                pageRefs.current[index + 1] = el;
                              }
                            }}
                            data-page-number={index + 1}
                            style={{
                              marginBottom: index < numPages - 1 ? '20px' : '0'
                            }}
                          >
                            <Page
                              pageNumber={index + 1}
                              width={getPdfPageWidth()}
                              renderTextLayer={true}
                              renderAnnotationLayer={true}
                              loading={
                                <div style={{
                                  width: getPdfPageWidth(),
                                  height: getPdfPageWidth() * (1200 / 900),
                                  background: 'white',
                                  borderRadius: 8,
                                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#6C6B6E',
                                  fontFamily: 'Plus Jakarta Sans'
                                }}>
                                  Loading page {index + 1}...
                                </div>
                              }
                            />
                          </div>
                        ))}
                      </Document>
                    </div>
                  );

                case 'excel': // XLSX - show HTML table preview
                  return (
                    <div style={{
                      position: 'relative',
                      width: '100%',
                      height: '100%',
                      flex: 1
                    }}>
                      <Suspense fallback={
                        <div style={{
                          padding: 40,
                          background: 'white',
                          borderRadius: 12,
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                          color: '#6C6B6E',
                          fontSize: 16,
                          fontFamily: 'Plus Jakarta Sans',
                          textAlign: 'center'
                        }}>
                          Loading Excel preview...
                        </div>
                      }>
                        <ExcelPreview document={document} zoom={zoom} onCountUpdate={setChildPreviewCount} />
                      </Suspense>
                    </div>
                  );

                case 'powerpoint': // PPTX - show with PPTXPreview component
                  return (
                    <Suspense fallback={
                      <div style={{
                        padding: 40,
                        background: 'white',
                        borderRadius: 12,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        color: '#6C6B6E',
                        fontSize: 16,
                        fontFamily: 'Plus Jakarta Sans'
                      }}>
                        Loading preview...
                      </div>
                    }>
                      <PPTXPreview document={document} zoom={zoom} version={previewVersion} onCountUpdate={setChildPreviewCount} />
                    </Suspense>
                  );

                case 'pdf':
                  return (
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
                      <Document
                        file={fileConfig}
                        onLoadSuccess={onDocumentLoadSuccess}
                        onLoadError={(error) => {
                        }}
                        options={pdfOptions}
                        loading={
                          <div style={{
                            padding: 40,
                            background: 'white',
                            borderRadius: 12,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                            color: '#6C6B6E',
                            fontSize: 16,
                            fontFamily: 'Plus Jakarta Sans'
                          }}>
                            Loading PDF...
                          </div>
                        }
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
                              Failed to load PDF
                            </div>
                            <div style={{ fontSize: 14, color: '#6C6B6E', fontFamily: 'Plus Jakarta Sans', marginBottom: 24 }}>
                              {cleanDocumentName(document.filename)}
                            </div>
                            <button
                              onClick={async () => {
                                try {
                                  const response = await api.get(`/api/documents/${document.id}/download`);
                                  const downloadUrl = response.data.url;
                                  safariDownloadFile(downloadUrl, document.filename);
                                } catch (error) {
                                  showError(t('alerts.failedToDownload'));
                                }
                              }}
                              style={{
                                display: 'inline-block',
                                padding: '12px 24px',
                                background: 'rgba(24, 24, 24, 0.90)',
                                color: 'white',
                                borderRadius: 14,
                                textDecoration: 'none',
                                fontSize: 14,
                                fontWeight: '600',
                                fontFamily: 'Plus Jakarta Sans',
                                border: 'none',
                                cursor: 'pointer'
                              }}>
                              {isSafari() || isIOS() ? t('documentViewer.openPdf') : t('documentViewer.downloadPdf')}
                            </button>
                          </div>
                        }
                      >
                        {Array.from(new Array(numPages), (el, index) => (
                          <div
                            key={`page_${index + 1}`}
                            ref={(el) => {
                              if (el) {
                                pageRefs.current[index + 1] = el;
                              }
                            }}
                            data-page-number={index + 1}
                            style={{
                              marginBottom: index < numPages - 1 ? '20px' : '0'
                            }}
                          >
                            <Page
                              pageNumber={index + 1}
                              width={getPdfPageWidth()}
                              renderTextLayer={true}
                              renderAnnotationLayer={true}
                              loading={
                                <div style={{
                                  width: getPdfPageWidth(),
                                  height: getPdfPageWidth() * (1200 / 900),
                                  background: 'white',
                                  borderRadius: 8,
                                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#6C6B6E',
                                  fontFamily: 'Plus Jakarta Sans'
                                }}>
                                  Loading page {index + 1}...
                                </div>
                              }
                            />
                          </div>
                        ))}
                      </Document>
                    </div>
                  );

                case 'image':
                  return (
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      {imageLoading && !imageError && (
                        <div style={{
                          padding: 40,
                          background: 'white',
                          borderRadius: 12,
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                          color: '#6C6B6E',
                          fontSize: 16,
                          fontFamily: 'Plus Jakarta Sans'
                        }}>
                          Loading image...
                        </div>
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
                            Failed to load image
                          </div>
                          <div style={{ fontSize: 14, color: '#6C6B6E', fontFamily: 'Plus Jakarta Sans', marginBottom: 24 }}>
                            {cleanDocumentName(document.filename)}
                          </div>
                          <button
                            onClick={async () => {
                              try {
                                const response = await api.get(`/api/documents/${document.id}/download`);
                                const downloadUrl = response.data.url;
                                safariDownloadFile(downloadUrl, document.filename);
                              } catch (error) {
                                showError(t('alerts.failedToDownload'));
                              }
                            }}
                            style={{
                              display: 'inline-block',
                              padding: '12px 24px',
                              background: 'rgba(24, 24, 24, 0.90)',
                              color: 'white',
                              borderRadius: 14,
                              textDecoration: 'none',
                              fontSize: 14,
                              fontWeight: '600',
                              fontFamily: 'Plus Jakarta Sans',
                              border: 'none',
                              cursor: 'pointer'
                            }}>
                            {isSafari() || isIOS() ? t('documentViewer.openImage') : t('documentViewer.downloadImage')}
                          </button>
                        </div>
                      ) : (
                        <img
                          src={actualDocumentUrl}
                          alt={cleanDocumentName(document.filename)}
                          onLoad={(e) => {
                            setImageLoading(false);
                          }}
                          onError={(e) => {
                            setImageLoading(false);
                            setImageError(true);
                          }}
                          style={{
                            width: 'auto',
                            height: 'auto',
                            maxWidth: '100%',
                            maxHeight: '80vh',
                            transform: `scale(${zoom / 100})`,
                            transformOrigin: 'top left',
                            objectFit: 'contain',
                            borderRadius: 8,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                            background: 'white',
                            transition: 'transform 0.2s ease',
                            display: imageLoading ? 'none' : 'block'
                          }}
                        />
                      )}
                    </div>
                  );

                case 'video':
                  return (
                    <div style={{
                      display: 'inline-block',
                      maxWidth: '100%',
                      maxHeight: '80vh'
                    }}>
                      <video
                        src={documentUrl}
                        controls
                        preload="metadata"
                        playsInline
                        onLoadedMetadata={(e) => {
                        }}
                        onError={(e) => {
                        }}
                        style={{
                          width: 'auto',
                          height: 'auto',
                          maxWidth: '100%',
                          maxHeight: '80vh',
                          borderRadius: 8,
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                          background: 'black'
                        }}
                      >
                        <source src={documentUrl} type={document.mimeType || 'video/mp4'} />
                        Your browser does not support video playback.
                      </video>
                    </div>
                  );

                case 'audio':
                  return (
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
                      <audio src={documentUrl} controls style={{ width: '100%' }}>
                        Your browser does not support audio playback.
                      </audio>
                    </div>
                  );

                case 'text':
                case 'code':
                  return <TextCodePreview url={documentUrl} document={document} zoom={zoom} />;

                case 'archive':
                  return (
                    <div style={{
                      background: 'white',
                      padding: 40,
                      borderRadius: 12,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      textAlign: 'center',
                      maxWidth: '500px',
                      width: '100%'
                    }}>
                      <div style={{ fontSize: 64, marginBottom: 20 }}>📦</div>
                      <div style={{ fontSize: 18, fontWeight: '600', color: '#32302C', fontFamily: 'Plus Jakarta Sans', marginBottom: 12 }}>
                        Archive File
                      </div>
                      <div style={{ fontSize: 14, color: '#6C6B6E', fontFamily: 'Plus Jakarta Sans', marginBottom: 24 }}>
                        {cleanDocumentName(document.filename)}
                      </div>
                      <div style={{
                        padding: 12,
                        background: '#F5F5F5',
                        borderRadius: 6,
                        fontSize: 14,
                        color: '#6C6B6E',
                        marginBottom: 20
                      }}>
                        Archive files cannot be previewed. Download to extract contents.
                      </div>
                      <a href={documentUrl} download={cleanDocumentName(document.filename)} style={{
                        display: 'inline-block',
                        padding: '12px 24px',
                        background: 'rgba(24, 24, 24, 0.90)',
                        color: 'white',
                        borderRadius: 8,
                        textDecoration: 'none',
                        fontSize: 14,
                        fontWeight: '600',
                        fontFamily: 'Plus Jakarta Sans'
                      }}>
                        Download File
                      </a>
                    </div>
                  );

                default:
                  return (
                    <div style={{
                      background: 'white',
                      padding: 40,
                      borderRadius: 12,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      textAlign: 'center',
                      maxWidth: '500px',
                      width: '100%'
                    }}>
                      <div style={{ fontSize: 64, marginBottom: 20 }}>📄</div>
                      <div style={{ fontSize: 18, fontWeight: '600', color: '#32302C', fontFamily: 'Plus Jakarta Sans', marginBottom: 12 }}>
                        Preview Not Available
                      </div>
                      <div style={{ fontSize: 14, color: '#6C6B6E', fontFamily: 'Plus Jakarta Sans', marginBottom: 24 }}>
                        {cleanDocumentName(document.filename)}
                      </div>
                      <div style={{
                        padding: 12,
                        background: '#F5F5F5',
                        borderRadius: 6,
                        fontSize: 14,
                        color: '#6C6B6E',
                        marginBottom: 20
                      }}>
                        This file type cannot be previewed in the browser.
                      </div>
                      <a href={documentUrl} download={cleanDocumentName(document.filename)} style={{
                        display: 'inline-block',
                        padding: '12px 24px',
                        background: 'rgba(24, 24, 24, 0.90)',
                        color: 'white',
                        borderRadius: 8,
                        textDecoration: 'none',
                        fontSize: 14,
                        fontWeight: '600',
                        fontFamily: 'Plus Jakarta Sans'
                      }}>
                        Download File
                      </a>
                    </div>
                  );
              }
            })()
          ) : (
            <div style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6C6B6E',
              fontSize: 16,
              fontFamily: 'Plus Jakarta Sans'
            }}>
              Loading document...
            </div>
          )}
        </div>
      </div>

      {/* Ask Koda Floating Button */}
      {showAskKoda && (
        <div style={{ width: 277, height: 82, right: 20, bottom: 20, position: 'absolute' }}>
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
          <div style={{ width: 14, height: 14, right: 44, top: 9, position: 'absolute', background: '#222222', borderRadius: 9999 }} />
          <button
            onClick={() => {
              // Clear current conversation to force a new chat
              sessionStorage.removeItem('currentConversationId');
              navigate(`/chat?documentId=${documentId}`, { state: { newConversation: true } });
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
              background: '#222222',
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
                  width: 36,
                  height: 36,
                  flexShrink: 0,
                  marginLeft: 8,
                  marginRight: -2
                }}
              />
              <div style={{ color: 'white', fontSize: 15, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', lineHeight: '20px', wordWrap: 'break-word' }}>{t('documentViewer.needHelpFindingSomething')}</div>
            </div>
          </button>
          <div style={{ width: 7, height: 7, right: 33, top: 0, position: 'absolute', background: '#222222', borderRadius: 9999 }} />
        </div>
      )}
      <NotificationPanel
        showNotificationsPopup={showNotificationsPopup}
        setShowNotificationsPopup={setShowNotificationsPopup}
      />

      {/* Search Modal */}
      {showSearchModal && (
        <SearchInDocumentModal
          documentId={documentId}
          document={document}
          onClose={() => setShowSearchModal(false)}
        />
      )}

      {/* Share Modal */}
      {showShareModal && (
        <div
          onClick={() => setShowShareModal(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white',
              borderRadius: 16,
              padding: 32,
              width: 500,
              maxWidth: '90%',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
            }}
          >
            <div style={{ fontSize: 20, fontWeight: '700', fontFamily: 'Plus Jakarta Sans', color: '#323232', marginBottom: 8 }}>
              Export Document
            </div>
            <div style={{ fontSize: 14, fontFamily: 'Plus Jakarta Sans', color: '#6C6B6E', marginBottom: 24 }}>
              {cleanDocumentName(document.filename)}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  const currentDoc = document;
                  if (currentDoc) {
                    try {
                      // Get the decrypted file from the stream endpoint
                      const response = await api.get(`/api/documents/${currentDoc.id}/stream`, {
                        responseType: 'blob'
                      });

                      // Create object URL and trigger download
                      const blobUrl = URL.createObjectURL(response.data);
                      const link = window.document.createElement('a');
                      link.href = blobUrl;
                      link.download = currentDoc.filename;
                      link.style.display = 'none';
                      window.document.body.appendChild(link);
                      link.click();

                      // Clean up
                      setTimeout(() => {
                        window.document.body.removeChild(link);
                        URL.revokeObjectURL(blobUrl);
                      }, 100);
                    } catch (error) {
                      showError(t('alerts.failedToDownload'));
                    }
                  }
                }}
                style={{
                  padding: '12px 24px',
                  borderRadius: 14,
                  border: '1px solid #E6E6EC',
                  background: 'white',
                  color: '#323232',
                  fontSize: 14,
                  fontWeight: '600',
                  fontFamily: 'Plus Jakarta Sans',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                <DownloadIcon style={{ width: 20, height: 20, pointerEvents: 'none' }} />
                Download Document
              </button>
            </div>

            <div style={{
              borderTop: '1px solid #E6E6EC',
              marginTop: 20,
              paddingTop: 20
            }}>
              <div style={{
                fontSize: 16,
                fontWeight: '600',
                color: '#32302C',
                marginBottom: 12,
                fontFamily: 'Plus Jakarta Sans'
              }}>
                Export Document
              </div>

              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10
              }}>
                {getSupportedExports(document?.mimeType, document?.filename).length > 0 ? (
                  getSupportedExports(document?.mimeType, document?.filename).map((exportOption) => (
                    <button
                      key={exportOption.format}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExport(exportOption.format);
                      }}
                      style={{
                        width: '100%',
                        padding: 12,
                        background: 'white',
                        border: '1px solid #E6E6EC',
                        borderRadius: 8,
                        fontSize: 14,
                        fontWeight: '500',
                        color: '#32302C',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        fontFamily: 'Plus Jakarta Sans',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#F9FAFB';
                        e.currentTarget.style.borderColor = '#D1D5DB';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'white';
                        e.currentTarget.style.borderColor = '#E6E6EC';
                      }}
                    >
                      <img src={exportOption.icon === 'pdf' ? pdfIcon : docIcon} alt={exportOption.format.toUpperCase()} style={{ width: 30, height: 30, display: 'block', pointerEvents: 'none' }} />
                      {exportOption.label}
                    </button>
                  ))
                ) : (
                  <div style={{
                    padding: 16,
                    textAlign: 'center',
                    color: '#6B7280',
                    fontSize: 14
                  }}>
                    {t('documentViewer.noExportOptions')}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={async () => {
          try {
            await api.delete(`/api/documents/${documentId}`);
            showSuccess(t('documentViewer.documentDeleted'));
            // Go back to the previous screen instead of navigating away
            navigate(-1);
          } catch (error) {
            showError(t('documentViewer.failedToDelete', { error: error.response?.data?.error || error.message }));
          }
        }}
        itemName={document.filename || 'this document'}
        itemType="document"
      />

      {/* STANDARDIZED: Move to Category Modal with FILES section and checkmarks */}
      <MoveToCategoryModal
        isOpen={showCategoryModal}
        onClose={() => {
          setShowCategoryModal(false);
          setSelectedDocumentForCategory(null);
          setSelectedCategoryId(null);
        }}
        uploadedDocuments={selectedDocumentForCategory ? [selectedDocumentForCategory] : []}
        showFilesSection={true}
        categories={getRootFolders().filter(f => f.name.toLowerCase() !== 'recently added').map(f => ({
          ...f,
          fileCount: getDocumentCountByFolder(f.id)
        }))}
        selectedCategoryId={selectedCategoryId}
        onCategorySelect={setSelectedCategoryId}
        onCreateNew={() => {
          setShowCategoryModal(false);
          setShowCreateCategoryModal(true);
        }}
        onConfirm={async () => {
          if (!selectedCategoryId) return;

          // Capture state before closing modal
          const categoryId = selectedCategoryId;
          const docId = documentId;

          // Close modal IMMEDIATELY for snappy UX
          setShowCategoryModal(false);
          setSelectedDocumentForCategory(null);
          setSelectedCategoryId(null);

          try {
            await moveToFolder(docId, categoryId);
            showSuccess(t('documentViewer.documentMoved'));
          } catch (error) {
            showError(t('documentViewer.failedToMoveDocument', { error: error.response?.data?.error || error.message }));
          }
        }}
      />

      {/* STANDARDIZED: Create Category Modal (NO MORE "coming soon" toast!) */}
      <CreateCategoryModal
        isOpen={showCreateCategoryModal}
        onClose={() => setShowCreateCategoryModal(false)}
        onCreateCategory={async (category) => {
          setShowCreateCategoryModal(false);

          try {
            // Create the folder
            const newFolder = await createFolder(category.name, category.emoji);
            showSuccess(t('documentViewer.categoryCreated'));

            // Move the document to the new category
            if (selectedDocumentForCategory) {
              await moveToFolder(selectedDocumentForCategory.id, newFolder.id);
              showSuccess(t('documentViewer.documentMoved'));
            }

            // Clear state
            setSelectedDocumentForCategory(null);
          } catch (error) {
            showError(t('documentViewer.failedToCreateCategory', { error: error.response?.data?.error || error.message }));
          }
        }}
        uploadedDocuments={selectedDocumentForCategory ? [selectedDocumentForCategory] : []}
      />
    </div>
  );
};

export default DocumentViewer;
