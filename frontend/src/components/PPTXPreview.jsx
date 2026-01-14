/**
 * ⚠️ FROZEN SUBSYSTEM ⚠️
 *
 * This module is production-hardened and contract-locked.
 * Do not modify without:
 *   1. Updating golden snapshots (backend/src/tests/__snapshots__/pptx-*.snapshot.json)
 *   2. Running canary checks (npm run canary:pptx)
 *   3. Updating PPTX_PREVIEW_FUTURE_CHANGES.md
 *   4. Verifying safety net still detects all slides with hasImage=false
 *
 * See: PPTX_PREVIEW_FUTURE_CHANGES.md for modification guidelines
 * Contact: Frontend Team (@pptx-preview-owner)
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Document, Page, pdfjs } from 'react-pdf';
import api from '../services/api';
import { ReactComponent as ArrowLeftIcon } from '../assets/arrow-narrow-left.svg';
import { ReactComponent as ArrowRightIcon } from '../assets/arrow-narrow-right.svg';
import { getPreviewCountForFile, getFileExtension } from '../utils/previewCount';
import '../styles/PreviewModalBase.css';

// Set up the worker for pdf.js
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/**
 * PPTX Preview Component
 * Displays PowerPoint presentations with slide navigation
 * Now supports PDF preview when LibreOffice conversion is available
 *
 * Preview Types:
 * - pptx-pdf: PDF conversion ready, use react-pdf viewer
 * - pptx-pending: PDF being generated, show loading + poll
 * - pptx: Fallback to text-only slides (LibreOffice unavailable)
 */
const PPTXPreview = ({ document: pptxDocument, zoom }) => {
  const { t } = useTranslation();
  const [slides, setSlides] = useState([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [metadata, setMetadata] = useState(null);
  // PDF preview state
  const [pdfMode, setPdfMode] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  // Pending state for PDF generation
  const [isPending, setIsPending] = useState(false);
  const [previewPdfStatus, setPreviewPdfStatus] = useState(null);
  const [previewPdfAttempts, setPreviewPdfAttempts] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const pollIntervalRef = useRef(null);

  // ✅ PAGINATION STATE (Production Hardening)
  const [slidesByPage, setSlidesByPage] = useState({}); // Cache: { pageNum: slides[] }
  const [currentPageNum, setCurrentPageNum] = useState(1);
  const [pageSize] = useState(10); // Fixed page size
  const [totalSlides, setTotalSlides] = useState(0);
  const [isFetchingPage, setIsFetchingPage] = useState(false);
  const [retryingSlide, setRetryingSlide] = useState(null);
  const [imageLoadFailed, setImageLoadFailed] = useState(false); // Track which slide is being retried

  // PDF options for react-pdf
  const pdfOptions = useMemo(() => ({
    cMapUrl: 'https://unpkg.com/pdfjs-dist@' + pdfjs.version + '/cmaps/',
    cMapPacked: true,
    withCredentials: false,
    isEvalSupported: false,
  }), []);

  // Canonical preview count computation
  const previewCount = useMemo(() => {
    if (!pptxDocument) return null;
    const fileExt = getFileExtension(pptxDocument.filename || '');

    // PDF-based preview mode
    if (pdfMode && numPages) {
      return getPreviewCountForFile({
        mimeType: pptxDocument.mimeType,
        fileExt,
        totalSlides: numPages,
        currentSlide: currentPage,
        isLoading: false,
        previewType: 'slides'
      }, t);
    }

    // Slides-based preview mode
    if (slides.length > 0 || totalSlides > 0) {
      return getPreviewCountForFile({
        mimeType: pptxDocument.mimeType,
        fileExt,
        totalSlides: totalSlides || slides.length,
        currentSlide: currentSlideIndex + 1,
        isLoading: loading || isFetchingPage,
        previewType: 'slides'
      }, t);
    }

    return null;
  }, [pptxDocument, pdfMode, numPages, currentPage, slides, currentSlideIndex, totalSlides, loading, isFetchingPage, t]);

  // Function to load PDF when ready
  const loadPdf = useCallback(async () => {
    try {
      console.log('📊 [PPTXPreview] Loading PDF...');
      const pdfResponse = await api.get(`/api/documents/${pptxDocument.id}/preview-pdf`, {
        responseType: 'blob'
      });
      const pdfBlob = pdfResponse.data;
      const url = URL.createObjectURL(pdfBlob);
      setPdfUrl(url);
      setPdfMode(true);
      setIsPending(false);
      setLoading(false);
      // Clear polling interval
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    } catch (err) {
      console.error('Error loading PDF:', err);
      setError('Failed to load PDF preview');
      setLoading(false);
    }
  }, [pptxDocument?.id]);

  // Handle manual retry of preview generation
  const handleRetryPreview = useCallback(async () => {
    if (isRetrying) return;
    setIsRetrying(true);
    try {
      console.log("📊 [PPTXPreview] Manual retry triggered...");
      const response = await api.post(`/api/documents/${pptxDocument.id}/retry-preview`);
      console.log("📊 [PPTXPreview] Retry response:", response.data);

      if (response.data.success) {
        // Update attempts from response
        if (response.data.attempts !== undefined) {
          setPreviewPdfAttempts(response.data.attempts);
        }
        setPreviewPdfStatus(response.data.status || "processing");

        // If already ready, load PDF
        if (response.data.status === "ready") {
          await loadPdf();
        }
      }
    } catch (err) {
      console.error("Error retrying preview:", err);
    } finally {
      setIsRetrying(false);
    }
  }, [pptxDocument?.id, isRetrying, loadPdf]);

  // ✅ PAGINATION: Fetch specific page of slides (Production Hardening)
  const fetchSlidesPage = useCallback(async (pageNum) => {
    // Check cache first
    if (slidesByPage[pageNum]) {
      console.log(`📊 [PPTXPreview] Page ${pageNum} already in cache`);
      return slidesByPage[pageNum];
    }

    try {
      setIsFetchingPage(true);
      console.log(`📊 [PPTXPreview] Fetching page ${pageNum} with pageSize ${pageSize}`);

      const response = await api.get(`/api/documents/${pptxDocument.id}/slides?page=${pageNum}&pageSize=${pageSize}`);

      if (response.data.success) {
        const pageSlides = response.data.slides || [];
        setTotalSlides(response.data.totalSlides || 0);
        setMetadata(response.data.metadata || {});

        // Cache this page
        setSlidesByPage(prev => ({
          ...prev,
          [pageNum]: pageSlides
        }));

        console.log(`📊 [PPTXPreview] Loaded page ${pageNum}: ${pageSlides.length} slides (total: ${response.data.totalSlides})`);
        return pageSlides;
      } else {
        throw new Error('Failed to load slides page');
      }
    } catch (err) {
      console.error(`Error fetching slides page ${pageNum}:`, err);
      return [];
    } finally {
      setIsFetchingPage(false);
    }
  }, [pptxDocument?.id, slidesByPage, pageSize]);

  // ✅ RETRY IMAGE: Refetch current page to get fresh signed URL (Production Hardening)
  const retrySlideImage = useCallback(async (slideNumber) => {
    try {
      setRetryingSlide(slideNumber);
      console.log(`📊 [PPTXPreview] Retrying image for slide ${slideNumber}`);

      // Determine which page this slide is on
      const pageNum = Math.ceil(slideNumber / pageSize);

      // Clear cache for this page to force refetch
      setSlidesByPage(prev => {
        const updated = { ...prev };
        delete updated[pageNum];
        return updated;
      });

      // Refetch the page
      await fetchSlidesPage(pageNum);

      console.log(`📊 [PPTXPreview] Successfully retried slide ${slideNumber}`);
    } catch (err) {
      console.error(`Error retrying slide ${slideNumber}:`, err);
    } finally {
      setRetryingSlide(null);
    }
  }, [pageSize, fetchSlidesPage]);

  // Poll for preview status when pending
  const pollPreviewStatus = useCallback(async () => {
    try {
      const response = await api.get(`/api/documents/${pptxDocument.id}/preview`);
      console.log('📊 [PPTXPreview] Poll result:', response.data.previewType, response.data.previewPdfStatus);

      if (response.data.previewType === 'pptx-pdf') {
        // PDF is ready! Load it
        await loadPdf();
      } else if (response.data.previewType === 'pptx') {
        // Conversion failed, show text fallback
        setIsPending(false);
        setPreviewPdfStatus('failed');
        setError(response.data.previewPdfError || 'PDF conversion failed');
        setLoading(false);
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      }
      // If still pending, keep polling
    } catch (err) {
      console.error('Error polling preview status:', err);
    }
  }, [pptxDocument?.id, loadPdf]);

  useEffect(() => {
    const fetchPreview = async () => {
      try {
        setLoading(true);
        setError(null);
        setIsPending(false);

        // First, check the preview endpoint to see if PDF is available
        const previewResponse = await api.get(`/api/documents/${pptxDocument.id}/preview`);
        const { previewType, previewPdfStatus: status } = previewResponse.data;

        console.log('📊 [PPTXPreview] Preview type:', previewType, 'status:', status);

        if (previewType === 'pptx-pdf') {
          // PDF conversion is available - use PDF viewer
          console.log('📊 [PPTXPreview] PDF conversion available, using PDF viewer');
          await loadPdf();
          return;
        }

        if (previewType === 'pptx-pending') {
          // PDF is being generated - show pending state and start polling
          console.log('📊 [PPTXPreview] PDF generation pending, starting poll...');
          setIsPending(true);
          setPreviewPdfStatus(status);
          setLoading(false);

          // Start polling every 3 seconds
          pollIntervalRef.current = setInterval(pollPreviewStatus, 3000);
          return;
        }

        // ✅ Fall back to slides endpoint with PAGINATION (Production Hardening)
        console.log('📊 [PPTXPreview] Using slides mode with pagination');

        // Fetch first page
        const pageSlides = await fetchSlidesPage(1);

        // If no slides but we have metadata with extractedText, try to parse it
        if (pageSlides.length === 0 && pptxDocument.metadata?.extractedText) {
          console.log('No slides found, parsing from extractedText');
          const slideData = parseExtractedText(pptxDocument.metadata.extractedText);
          setSlides(slideData);
        } else {
          setSlides(pageSlides);
        }

        setPreviewPdfStatus(previewResponse.data.previewPdfStatus || null);
        setCurrentPageNum(1);

        if (pageSlides.length === 0 && !pptxDocument.metadata?.extractedText) {
          setError('No slides available');
        }

        setLoading(false);
      } catch (err) {
        console.error('Error fetching slides:', err);
        setError(err.response?.data?.error || 'Failed to load presentation slides');
        setLoading(false);
      }
    };

    if (pptxDocument && pptxDocument.id) {
      fetchPreview();
    }

    // Cleanup blob URL and polling on unmount
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pptxDocument, loadPdf, pollPreviewStatus]);

  // Reset imageLoadFailed when slide changes
  useEffect(() => {
    setImageLoadFailed(false);
  }, [currentSlideIndex]);

  // Note: WebSocket support for real-time updates can be added later
  // Currently using polling for PDF generation status updates

  // PDF load success handler
  const onPdfLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
    setCurrentPage(1);
  };

  // Parse extractedText that contains "=== Slide X ===" markers
  const parseExtractedText = (extractedText) => {
    if (!extractedText) return [];

    // Check if this is corrupted XML data (contains schema URLs)
    if (extractedText.includes('schemas.openxmlformats.org') ||
        extractedText.includes('preencoded.png') ||
        extractedText.includes('rId')) {
      console.log('Detected corrupted XML data, skipping parse');
      return [];
    }

    const slideMarkerRegex = /=== Slide (\d+) ===/g;
    const slides = [];
    let match;
    const matches = [];

    // Find all slide markers
    while ((match = slideMarkerRegex.exec(extractedText)) !== null) {
      matches.push({ slideNumber: parseInt(match[1]), index: match.index });
    }

    // Extract content between markers
    for (let i = 0; i < matches.length; i++) {
      const currentMatch = matches[i];
      const nextMatch = matches[i + 1];

      const startIndex = currentMatch.index + `=== Slide ${currentMatch.slideNumber} ===`.length;
      const endIndex = nextMatch ? nextMatch.index : extractedText.length;

      let content = extractedText.substring(startIndex, endIndex).trim();

      // Clean up any XML artifacts
      content = content
        .replace(/http:\/\/schemas\.[^\s]+/g, '')
        .replace(/preencoded\.\s*png/g, '')
        .replace(/rId\d+/g, '')
        .replace(/rect\s+/g, '')
        .replace(/ctr\s+/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (content.length > 0) {
        slides.push({
          slide_number: currentMatch.slideNumber,
          content: content,
          text_count: content.split('\n').filter(l => l.trim()).length
        });
      }
    }

    return slides;
  };

  // ✅ PAGINATION NAVIGATION: Lazy load pages as user navigates (Production Hardening)
  const goToNextSlide = useCallback(async () => {
    if (!pdfMode) {
      // Check if we're at the end of current page and need to fetch next page
      const currentSlideNum = currentSlideIndex + 1; // 1-indexed
      const nextSlideNum = currentSlideNum + 1;
      const nextPageNum = Math.ceil(nextSlideNum / pageSize);

      if (currentSlideIndex < totalSlides - 1) {
        // Check if we need to fetch the next page
        if (nextPageNum !== currentPageNum && !slidesByPage[nextPageNum]) {
          console.log(`📊 [PPTXPreview] Fetching page ${nextPageNum} for next slide`);
          const nextPageSlides = await fetchSlidesPage(nextPageNum);
          setSlides(nextPageSlides);
          setCurrentPageNum(nextPageNum);
          setCurrentSlideIndex(0); // Reset to first slide of new page
        } else if (nextPageNum !== currentPageNum && slidesByPage[nextPageNum]) {
          // Page is cached, just switch to it
          setSlides(slidesByPage[nextPageNum]);
          setCurrentPageNum(nextPageNum);
          setCurrentSlideIndex(0);
        } else {
          // Stay on same page, just increment index
          setCurrentSlideIndex(currentSlideIndex + 1);
        }
      }
    } else {
      // PDF mode navigation
      if (currentPage < numPages) {
        setCurrentPage(currentPage + 1);
      }
    }
  }, [pdfMode, currentSlideIndex, currentPageNum, totalSlides, pageSize, slidesByPage, fetchSlidesPage, currentPage, numPages]);

  const goToPreviousSlide = useCallback(async () => {
    if (!pdfMode) {
      const currentSlideNum = currentSlideIndex + 1; // 1-indexed
      const prevSlideNum = currentSlideNum - 1;
      const prevPageNum = Math.ceil(prevSlideNum / pageSize);

      if (currentSlideIndex > 0) {
        // Moving within current page
        setCurrentSlideIndex(currentSlideIndex - 1);
      } else if (currentPageNum > 1) {
        // Need to go to previous page
        console.log(`📊 [PPTXPreview] Fetching page ${prevPageNum} for previous slide`);
        if (!slidesByPage[prevPageNum]) {
          const prevPageSlides = await fetchSlidesPage(prevPageNum);
          setSlides(prevPageSlides);
          setCurrentPageNum(prevPageNum);
          setCurrentSlideIndex(prevPageSlides.length - 1); // Go to last slide of previous page
        } else {
          // Page is cached
          setSlides(slidesByPage[prevPageNum]);
          setCurrentPageNum(prevPageNum);
          setCurrentSlideIndex(slidesByPage[prevPageNum].length - 1);
        }
      }
    } else {
      // PDF mode navigation
      if (currentPage > 1) {
        setCurrentPage(currentPage - 1);
      }
    }
  }, [pdfMode, currentSlideIndex, currentPageNum, pageSize, slidesByPage, fetchSlidesPage, currentPage]);

  const goToSlide = (index) => {
    if (index >= 0 && index < slides.length) {
      setCurrentSlideIndex(index);
    }
  };

  if (loading) {
    return (
      <div className="preview-modal-loading">
        <div className="preview-modal-loading-spinner" />
        <div>{t('pptxPreview.loadingPresentation')}</div>
      </div>
    );
  }

  // Pending state - PDF is being generated (Google Drive-like experience)
  if (isPending) {
    return (
      <div style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        padding: 40,
        transform: `scale(${zoom / 100})`,
        transformOrigin: 'top center',
      }}>
        <div style={{
          background: 'white',
          borderRadius: 16,
          boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
          padding: 48,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 24,
          maxWidth: 480,
          textAlign: 'center'
        }}>
          {/* Animated spinner */}
          <div style={{
            width: 64,
            height: 64,
            border: '4px solid #E6E6EC',
            borderTopColor: '#181818',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />

          <div style={{
            fontSize: 18,
            fontWeight: '600',
            color: '#32302C',
            fontFamily: 'Plus Jakarta Sans'
          }}>
            {t('pptxPreview.generatingPreview', 'Generating preview...')}
          </div>

          <div style={{
            fontSize: 14,
            color: '#6C6B6E',
            fontFamily: 'Plus Jakarta Sans',
            lineHeight: 1.6
          }}>
            {t('pptxPreview.convertingToPdf', 'Converting presentation to PDF for high-fidelity preview. This usually takes a few seconds.')}
          </div>

          {/* Progress indicator */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            color: '#A0A0A0',
            fontFamily: 'Plus Jakarta Sans'
          }}>
            <div style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: previewPdfStatus === 'processing' ? '#10B981' : '#FCD34D',
              animation: 'pulse 2s ease-in-out infinite'
            }} />
            {previewPdfAttempts > 1 ? (
              previewPdfStatus === 'processing'
                ? `Retrying (${previewPdfAttempts}/3)...`
                : `Queued (attempt ${previewPdfAttempts}/3)`
            ) : (
              previewPdfStatus === 'processing' ? t('pptxPreview.processing', 'Processing...') : t('pptxPreview.queued', 'Queued')
            )}
          </div>

          {/* Retry button - show when not currently processing or when stuck */}
          <button
            onClick={handleRetryPreview}
            disabled={isRetrying || previewPdfStatus === 'processing'}
            style={{
              marginTop: 8,
              padding: '8px 16px',
              background: isRetrying || previewPdfStatus === 'processing' ? '#E6E6EC' : '#181818',
              color: isRetrying || previewPdfStatus === 'processing' ? '#A0A0A0' : 'white',
              border: 'none',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: '600',
              fontFamily: 'Plus Jakarta Sans',
              cursor: isRetrying || previewPdfStatus === 'processing' ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            {isRetrying ? (
              <>
                <div style={{
                  width: 12,
                  height: 12,
                  border: '2px solid #A0A0A0',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
                {t('pptxPreview.retrying', 'Retrying...')}
              </>
            ) : (
              t('pptxPreview.retryNow', 'Retry now')
            )}
          </button>
        </div>

        {/* CSS for animations */}
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
      </div>
    );
  }

  // PDF Mode - render using react-pdf when LibreOffice conversion is available
  if (pdfMode && pdfUrl) {
    return (
      <div style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 20,
        transform: `scale(${zoom / 100})`,
        transformOrigin: 'top center',
        transition: 'transform 0.2s ease'
      }}>
        {/* PDF Navigation Header */}
        <div style={{
          background: 'white',
          borderRadius: 12,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          padding: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 16
        }}>
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            style={{
              width: 40,
              height: 40,
              background: currentPage <= 1 ? '#E6E6EC' : 'white',
              border: '1px solid #E6E6EC',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: currentPage <= 1 ? 'not-allowed' : 'pointer'
            }}
          >
            <ArrowLeftIcon style={{ width: 20, height: 20, stroke: currentPage <= 1 ? '#A0A0A0' : '#32302C' }} />
          </button>
          <div style={{
            fontSize: 14,
            fontWeight: '600',
            color: '#32302C',
            fontFamily: 'Plus Jakarta Sans'
          }}>
            {previewCount?.label || ''}
          </div>
          <button
            onClick={() => setCurrentPage(p => Math.min(numPages || 1, p + 1))}
            disabled={currentPage >= (numPages || 1)}
            style={{
              width: 40,
              height: 40,
              background: currentPage >= (numPages || 1) ? '#E6E6EC' : 'white',
              border: '1px solid #E6E6EC',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: currentPage >= (numPages || 1) ? 'not-allowed' : 'pointer'
            }}
          >
            <ArrowRightIcon style={{ width: 20, height: 20, stroke: currentPage >= (numPages || 1) ? '#A0A0A0' : '#32302C' }} />
          </button>
        </div>

        {/* PDF Document */}
        <Document
          file={{ url: pdfUrl }}
          onLoadSuccess={onPdfLoadSuccess}
          onLoadError={(error) => {
            console.error('PDF load error:', error);
            setError('Failed to load presentation PDF');
            setPdfMode(false);
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
              {t('pptxPreview.loadingPresentation')}
            </div>
          }
        >
          <Page
            pageNumber={currentPage}
            width={Math.min(900, window.innerWidth - 48)}
            renderTextLayer={true}
            renderAnnotationLayer={true}
          />
        </Document>

        {/* Page Thumbnails */}
        {numPages && numPages > 1 && (
          <div style={{
            background: 'white',
            borderRadius: 12,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            padding: 16,
            display: 'flex',
            gap: 12,
            overflowX: 'auto',
            maxWidth: '100%'
          }}>
            {Array.from({ length: numPages }, (_, i) => (
              <button
                key={i}
                onClick={() => setCurrentPage(i + 1)}
                style={{
                  padding: 8,
                  background: currentPage === i + 1 ? '#F5F5F5' : 'white',
                  border: currentPage === i + 1 ? '2px solid #181818' : '1px solid #E6E6EC',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: '600',
                  fontFamily: 'Plus Jakarta Sans',
                  minWidth: 60
                }}
              >
                {t('pptxPreview.slideNumber', { number: i + 1 })}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if ((error || slides.length === 0) && !pdfMode) {
    return (
      <div className="preview-modal-error">
        <div className="preview-modal-error-icon">📊</div>
        <div className="preview-modal-error-title">{t('pptxPreview.powerpointPreview')}</div>
        {error && (
          <div className="preview-modal-error-message">{error}</div>
        )}
        {!error && (
          <div className="preview-modal-error-hint">{t('pptxPreview.noSlidesAvailable')}</div>
        )}
        {metadata && (
          <div style={{
            padding: 16,
            background: '#F9FAFB',
            borderRadius: 8,
            fontSize: 14,
            color: '#6C6C6C',
            fontFamily: 'Plus Jakarta Sans',
            textAlign: 'left',
            marginTop: 16
          }}>
            <div><strong>{t('pptxPreview.title')}:</strong> {metadata.title || t('common.notAvailable')}</div>
            <div><strong>{t('pptxPreview.author')}:</strong> {metadata.author || t('common.notAvailable')}</div>
            <div><strong>{t('pptxPreview.slideCount')}:</strong> {metadata.slide_count || 0}</div>
          </div>
        )}
      </div>
    );
  }

  const currentSlide = slides[currentSlideIndex];

  // ✅ SAFETY NET: Detect if all slides have no images (last-resort guard)
  const allSlidesNoImages = slides.length > 0 && slides.every(slide => slide.hasImage === false);

  // If all slides have no images, show fallback banner
  if (allSlidesNoImages && !pdfMode) {
    return (
      <div style={{
        width: '100%',
        maxWidth: '800px',
        padding: 32,
        background: 'white',
        borderRadius: 12,
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <div style={{
          fontSize: 18,
          fontWeight: '600',
          color: '#32302C',
          fontFamily: 'Plus Jakarta Sans',
          marginBottom: 12
        }}>
          Preview Unavailable
        </div>
        <div style={{
          fontSize: 14,
          color: '#6C6B6E',
          fontFamily: 'Plus Jakarta Sans',
          marginBottom: 24,
          lineHeight: 1.6
        }}>
          We couldn't generate preview images for this presentation.
          <br />
          Please download the original file to view it.
        </div>
        {metadata && (
          <div style={{
            padding: 16,
            background: '#F9FAFB',
            borderRadius: 8,
            fontSize: 14,
            color: '#6C6C6C',
            fontFamily: 'Plus Jakarta Sans',
            textAlign: 'left',
            marginTop: 24
          }}>
            <div><strong>{t('pptxPreview.title')}:</strong> {metadata.title || t('common.notAvailable')}</div>
            <div><strong>{t('pptxPreview.slideCount')}:</strong> {metadata.slide_count || slides.length}</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{
      width: '100%',
      maxWidth: '1200px',
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
      transform: `scale(${zoom / 100})`,
      transformOrigin: 'top center',
      transition: 'transform 0.2s ease'
    }}>
      {/* Main Slide Display */}
      <div style={{
        background: 'white',
        borderRadius: 12,
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        overflow: 'hidden'
      }}>
        {/* Slide Header */}
        <div style={{
          padding: 16,
          background: '#F5F5F5',
          borderBottom: '1px solid #E6E6EC',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{
            fontSize: 14,
            fontWeight: '600',
            color: '#32302C',
            fontFamily: 'Plus Jakarta Sans'
          }}>
            {previewCount?.label || ''}
          </div>
          {metadata && metadata.title && (
            <div style={{
              fontSize: 12,
              color: '#6C6B6E',
              fontFamily: 'Plus Jakarta Sans'
            }}>
              {metadata.title}
            </div>
          )}
        </div>

        {/* Slide Content */}
        <div style={{
          padding: 20,
          minHeight: 400,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#F9FAFB',
          gap: 16
        }}>
          {/* Show processing status */}
          {metadata?.slideGenerationStatus === 'processing' && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              padding: 20,
              background: '#FFF7ED',
              borderRadius: 8,
              border: '1px solid #FED7AA'
            }}>
              <div className="preview-modal-loading-spinner" style={{
                borderColor: '#FED7AA',
                borderTopColor: '#FB923C'
              }} />
              <div style={{
                fontSize: 14,
                fontWeight: '600',
                color: '#EA580C',
                fontFamily: 'Plus Jakarta Sans'
              }}>
                {t('pptxPreview.generatingSlideImages')}
              </div>
              <div style={{
                fontSize: 12,
                color: '#9A3412',
                fontFamily: 'Plus Jakarta Sans',
                textAlign: 'center'
              }}>
                {t('pptxPreview.mayTakeMinute')}
              </div>
            </div>
          )}

          {/* ✅ FIX: Show error status with retry */}
          {metadata?.slideGenerationStatus === 'failed' && !currentSlide?.imageUrl && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              padding: 20,
              background: '#FEE2E2',
              borderRadius: 8,
              border: '1px solid #FECACA'
            }}>
              <div style={{
                fontSize: 14,
                fontWeight: '600',
                color: '#DC2626',
                fontFamily: 'Plus Jakarta Sans'
              }}>
                {t('pptxPreview.failedToGenerateImages')}
              </div>
              <div style={{
                fontSize: 12,
                color: '#991B1B',
                fontFamily: 'Plus Jakarta Sans',
                textAlign: 'center'
              }}>
                {metadata.slideGenerationError || 'Unknown error'}
              </div>
              <button
                onClick={() => {
                  // TODO: Implement retry logic
                  console.log('Retry slide generation');
                }}
                style={{
                  padding: '8px 16px',
                  background: '#DC2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: '600',
                  cursor: 'pointer',
                  fontFamily: 'Plus Jakarta Sans'
                }}
              >
                {t('pptxPreview.retryGeneration')}
              </button>
            </div>
          )}

          {/* Loading spinner when fetching next page */}
          {isFetchingPage && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              padding: 20
            }}>
              <div className="preview-modal-loading-spinner" />
              <div style={{
                fontSize: 14,
                color: '#6C6B6E',
                fontFamily: 'Plus Jakarta Sans'
              }}>
                {t('pptxPreview.loadingPresentation')}
              </div>
            </div>
          )}

          {/* ✅ HARDENED: Show slide image only if hasImage is true */}
          {!isFetchingPage && currentSlide && currentSlide.hasImage && currentSlide.imageUrl ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, width: '100%' }}>
              <img
                src={currentSlide.imageUrl}
                alt={`Slide ${currentSlideIndex + 1}`}
                style={{
                  maxWidth: '100%',
                  maxHeight: '600px',
                  width: 'auto',
                  height: 'auto',
                  borderRadius: 8,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  display: imageLoadFailed ? 'none' : 'block'
                }}
                onError={(e) => {
                  console.error('❌ [PPTX_PREVIEW] Failed to load slide image:', currentSlide.imageUrl);
                  setImageLoadFailed(true);
                }}
                onLoad={() => {
                  console.log('✅ [PPTX_PREVIEW] Slide image loaded successfully');
                  setImageLoadFailed(false);
                }}
              />

              {/* Retry button when image fails to load */}
              {imageLoadFailed && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 12,
                  padding: 20,
                  background: '#FEE2E2',
                  borderRadius: 8,
                  border: '1px solid #FECACA',
                  width: '100%',
                  maxWidth: 600
                }}>
                  <div style={{
                    fontSize: 14,
                    fontWeight: '600',
                    color: '#DC2626',
                    fontFamily: 'Plus Jakarta Sans'
                  }}>
                    Failed to load slide image
                  </div>
                  <button
                    onClick={() => retrySlideImage(currentSlide.slideNumber)}
                    disabled={retryingSlide === currentSlide.slideNumber}
                    style={{
                      padding: '8px 16px',
                      background: retryingSlide === currentSlide.slideNumber ? '#9CA3AF' : '#DC2626',
                      color: 'white',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: '600',
                      cursor: retryingSlide === currentSlide.slideNumber ? 'not-allowed' : 'pointer',
                      fontFamily: 'Plus Jakarta Sans'
                    }}
                  >
                    {retryingSlide === currentSlide.slideNumber ? 'Retrying...' : 'Retry Image'}
                  </button>
                </div>
              )}
            </div>
          ) : !isFetchingPage && currentSlide && currentSlide.content ? (
            <pre style={{
              margin: 0,
              fontSize: 16,
              fontFamily: 'Plus Jakarta Sans',
              lineHeight: 1.8,
              color: '#32302C',
              whiteSpace: 'pre-wrap',
              wordWrap: 'break-word',
              maxWidth: '100%',
              padding: 20
            }}>
              {currentSlide.content}
            </pre>
          ) : !isFetchingPage ? (
            <div style={{
              textAlign: 'center',
              color: '#6C6B6E',
              fontSize: 14,
              fontFamily: 'Plus Jakarta Sans',
              padding: 40
            }}>
              {t('pptxPreview.slideEmpty')}
            </div>
          ) : null}
        </div>

        {/* Navigation Controls */}
        <div style={{
          padding: 16,
          background: '#F5F5F5',
          borderTop: '1px solid #E6E6EC',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 16
        }}>
          <button
            onClick={goToPreviousSlide}
            disabled={currentSlideIndex === 0}
            style={{
              width: 40,
              height: 40,
              background: currentSlideIndex === 0 ? '#E6E6EC' : 'white',
              border: 'none',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: currentSlideIndex === 0 ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: currentSlideIndex === 0 ? 'none' : '0 2px 4px rgba(0,0,0,0.1)'
            }}
            onMouseEnter={(e) => {
              if (currentSlideIndex > 0) {
                e.currentTarget.style.background = '#F5F5F5';
              }
            }}
            onMouseLeave={(e) => {
              if (currentSlideIndex > 0) {
                e.currentTarget.style.background = 'white';
              }
            }}
          >
            <ArrowLeftIcon style={{
              width: 20,
              height: 20,
              stroke: currentSlideIndex === 0 ? '#A0A0A0' : '#32302C'
            }} />
          </button>

          <input
            type="number"
            min="1"
            max={slides.length}
            value={currentSlideIndex + 1}
            onChange={(e) => {
              const slideNum = parseInt(e.target.value);
              if (slideNum >= 1 && slideNum <= slides.length) {
                goToSlide(slideNum - 1);
              }
            }}
            style={{
              width: 60,
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid #E6E6EC',
              fontSize: 14,
              fontWeight: '600',
              fontFamily: 'Plus Jakarta Sans',
              textAlign: 'center',
              outline: 'none'
            }}
          />

          <div style={{
            fontSize: 14,
            color: '#6C6B6E',
            fontFamily: 'Plus Jakarta Sans'
          }}>
            / {slides.length}
          </div>

          <button
            onClick={goToNextSlide}
            disabled={currentSlideIndex === slides.length - 1}
            style={{
              width: 40,
              height: 40,
              background: currentSlideIndex === slides.length - 1 ? '#E6E6EC' : 'white',
              border: 'none',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: currentSlideIndex === slides.length - 1 ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: currentSlideIndex === slides.length - 1 ? 'none' : '0 2px 4px rgba(0,0,0,0.1)'
            }}
            onMouseEnter={(e) => {
              if (currentSlideIndex < slides.length - 1) {
                e.currentTarget.style.background = '#F5F5F5';
              }
            }}
            onMouseLeave={(e) => {
              if (currentSlideIndex < slides.length - 1) {
                e.currentTarget.style.background = 'white';
              }
            }}
          >
            <ArrowRightIcon style={{
              width: 20,
              height: 20,
              stroke: currentSlideIndex === slides.length - 1 ? '#A0A0A0' : '#32302C'
            }} />
          </button>
        </div>
      </div>

      {/* Thumbnail Navigation */}
      <div style={{
        background: 'white',
        borderRadius: 12,
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        padding: 16
      }}>
        <div style={{
          fontSize: 14,
          fontWeight: '600',
          color: '#32302C',
          fontFamily: 'Plus Jakarta Sans',
          marginBottom: 12
        }}>
          {t('pptxPreview.allSlides')}
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: 12,
          maxHeight: 200,
          overflow: 'auto'
        }}>
          {slides.map((slide, index) => (
            <div
              key={index}
              onClick={() => goToSlide(index)}
              style={{
                padding: 8,
                background: index === currentSlideIndex ? '#F5F5F5' : 'white',
                border: index === currentSlideIndex ? '2px solid #181818' : '1px solid #E6E6EC',
                borderRadius: 8,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                overflow: 'hidden'
              }}
              onMouseEnter={(e) => {
                if (index !== currentSlideIndex) {
                  e.currentTarget.style.background = '#F9FAFB';
                  e.currentTarget.style.borderColor = '#D1D5DB';
                }
              }}
              onMouseLeave={(e) => {
                if (index !== currentSlideIndex) {
                  e.currentTarget.style.background = 'white';
                  e.currentTarget.style.borderColor = '#E6E6EC';
                }
              }}
            >
              <div style={{
                fontSize: 12,
                fontWeight: '600',
                color: '#32302C',
                fontFamily: 'Plus Jakarta Sans'
              }}>
                {t('pptxPreview.slideNumber', { number: index + 1 })}
              </div>
              {slide.imageUrl ? (
                <div style={{
                  width: '100%',
                  height: 80,
                  background: '#F9FAFB',
                  borderRadius: 4,
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <img
                    src={slide.imageUrl}
                    alt={`Slide ${index + 1} thumbnail`}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain'
                    }}
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                </div>
              ) : (
                <div style={{
                  fontSize: 11,
                  color: '#6C6B6E',
                  fontFamily: 'Plus Jakarta Sans',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {slide.content ? slide.content.substring(0, 30) + '...' : t('pptxPreview.emptySlide')}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Metadata Info */}
      {metadata && (
        <div style={{
          background: 'white',
          borderRadius: 12,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          padding: 16
        }}>
          <div style={{
            fontSize: 14,
            fontWeight: '600',
            color: '#32302C',
            fontFamily: 'Plus Jakarta Sans',
            marginBottom: 12
          }}>
            {t('pptxPreview.presentationInfo')}
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 12,
            fontSize: 13,
            fontFamily: 'Plus Jakarta Sans',
            color: '#6C6B6E'
          }}>
            {metadata.title && (
              <div>
                <strong>{t('pptxPreview.title')}:</strong> {metadata.title}
              </div>
            )}
            {metadata.author && (
              <div>
                <strong>{t('pptxPreview.author')}:</strong> {metadata.author}
              </div>
            )}
            {metadata.subject && (
              <div>
                <strong>{t('pptxPreview.subject')}:</strong> {metadata.subject}
              </div>
            )}
            <div>
              <strong>{t('pptxPreview.totalSlides')}:</strong> {slides.length}
            </div>
            {metadata.created && (
              <div>
                <strong>{t('pptxPreview.created')}:</strong> {new Date(metadata.created).toLocaleDateString()}
              </div>
            )}
            {metadata.modified && (
              <div>
                <strong>{t('pptxPreview.modified')}:</strong> {new Date(metadata.modified).toLocaleDateString()}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PPTXPreview;
