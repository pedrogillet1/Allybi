import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Document, Page, pdfjs } from 'react-pdf';
import api from '../services/api';
import { ReactComponent as ArrowLeftIcon } from '../assets/arrow-narrow-left.svg';
import { ReactComponent as ArrowRightIcon } from '../assets/arrow-narrow-right.svg';
import '../styles/PreviewModalBase.css';

// Set up the worker for pdf.js
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const ExcelPreview = ({ document, zoom }) => {
  const { t } = useTranslation();
  const [htmlContent, setHtmlContent] = useState('');
  const [sheetCount, setSheetCount] = useState(0);
  const [sheets, setSheets] = useState([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const contentRef = useRef(null);

  // PDF preview state (for LibreOffice conversion)
  const [pdfMode, setPdfMode] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  // PDF options for react-pdf
  const pdfOptions = useMemo(() => ({
    cMapUrl: 'https://unpkg.com/pdfjs-dist@' + pdfjs.version + '/cmaps/',
    cMapPacked: true,
    withCredentials: false,
    isEvalSupported: false,
  }), []);

  useEffect(() => {
    const fetchExcelPreview = async () => {
      if (!document || !document.id) {
        setError(t('excelPreview.documentNotAvailable'));
        setLoading(false);
        return;
      }

      try {
        const response = await api.get(`/api/documents/${document.id}/preview`);

        // Check for PDF mode (LibreOffice conversion available)
        if (response.data.previewType === 'excel-pdf') {
          console.log('📊 [ExcelPreview] PDF conversion available, using PDF viewer');
          setPdfMode(true);

          // Fetch the PDF blob
          const pdfResponse = await api.get(`/api/documents/${document.id}/preview-pdf`, {
            responseType: 'blob'
          });
          const pdfBlob = pdfResponse.data;
          const url = URL.createObjectURL(pdfBlob);
          setPdfUrl(url);
          setLoading(false);
          return;
        }

        if (response.data.previewType === 'excel') {
          // Check if HTML content was generated successfully
          if (response.data.htmlContent) {
            setHtmlContent(response.data.htmlContent);
            setSheetCount(response.data.sheetCount || 0);
            setSheets(response.data.sheets || []);
          } else if (response.data.error) {
            // Backend reported an error but provided fallback
            console.warn('Excel preview generation failed:', response.data.error);
            setError(response.data.error);
          }
          // Always capture download URL for fallback
          setDownloadUrl(response.data.downloadUrl);
          setLoading(false);
        } else {
          setError(t('excelPreview.invalidPreviewType'));
          setLoading(false);
        }
      } catch (err) {
        console.error('Error loading Excel preview:', err);
        setError(err.response?.data?.error || t('excelPreview.failedToLoad'));
        setLoading(false);
      }
    };

    fetchExcelPreview();

    // Cleanup blob URL on unmount
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [document, t]);

  // PDF load success handler
  const onPdfLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
    setCurrentPage(1);
  };

  // Show/hide sheets based on active selection
  useEffect(() => {
    if (contentRef.current && sheetCount > 1) {
      const sheetContainers = contentRef.current.querySelectorAll('.sheet-container');
      sheetContainers.forEach((container, index) => {
        container.style.display = index === activeSheet ? 'block' : 'none';
      });
    }
  }, [activeSheet, htmlContent, sheetCount]);

  if (loading) {
    return (
      <div className="preview-modal-loading">
        <div className="preview-modal-loading-spinner" />
        <div>{t('excelPreview.loading')}</div>
      </div>
    );
  }

  // PDF Mode - render using react-pdf when LibreOffice conversion is available
  if (pdfMode && pdfUrl) {
    const scale = zoom / 100;
    return (
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'white',
        borderRadius: 8,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* PDF Navigation Header */}
        <div style={{
          background: '#F5F5F5',
          borderBottom: '1px solid #E6E6EC',
          padding: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          flexShrink: 0
        }}>
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            style={{
              width: 36,
              height: 36,
              background: currentPage <= 1 ? '#E6E6EC' : 'white',
              border: '1px solid #E6E6EC',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: currentPage <= 1 ? 'not-allowed' : 'pointer'
            }}
          >
            <ArrowLeftIcon style={{ width: 18, height: 18, stroke: currentPage <= 1 ? '#A0A0A0' : '#32302C' }} />
          </button>
          <div style={{
            fontSize: 14,
            fontWeight: '600',
            color: '#32302C',
            fontFamily: 'Plus Jakarta Sans'
          }}>
            {t('excelPreview.pageOf', { current: currentPage, total: numPages || '?' })}
          </div>
          <button
            onClick={() => setCurrentPage(p => Math.min(numPages || 1, p + 1))}
            disabled={currentPage >= (numPages || 1)}
            style={{
              width: 36,
              height: 36,
              background: currentPage >= (numPages || 1) ? '#E6E6EC' : 'white',
              border: '1px solid #E6E6EC',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: currentPage >= (numPages || 1) ? 'not-allowed' : 'pointer'
            }}
          >
            <ArrowRightIcon style={{ width: 18, height: 18, stroke: currentPage >= (numPages || 1) ? '#A0A0A0' : '#32302C' }} />
          </button>
        </div>

        {/* PDF Document - Scrollable container */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          justifyContent: 'center',
          padding: 20,
          background: '#FAFAFA'
        }}>
          <div style={{
            transform: `scale(${scale})`,
            transformOrigin: 'top center',
            transition: 'transform 0.2s ease'
          }}>
            <Document
              file={{ url: pdfUrl }}
              onLoadSuccess={onPdfLoadSuccess}
              onLoadError={(error) => {
                console.error('PDF load error:', error);
                setError('Failed to load Excel PDF preview');
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
                  {t('excelPreview.loading')}
                </div>
              }
            >
              <Page
                pageNumber={currentPage}
                width={Math.min(900, window.innerWidth - 80)}
                renderTextLayer={true}
                renderAnnotationLayer={true}
              />
            </Document>
          </div>
        </div>

        {/* Page Thumbnails - Only show if multiple pages */}
        {numPages && numPages > 1 && (
          <div style={{
            background: '#F5F5F5',
            borderTop: '1px solid #E6E6EC',
            padding: 12,
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            {Array.from({ length: Math.min(numPages, 20) }, (_, i) => (
              <button
                key={i}
                onClick={() => setCurrentPage(i + 1)}
                style={{
                  padding: '6px 12px',
                  background: currentPage === i + 1 ? '#181818' : 'white',
                  color: currentPage === i + 1 ? 'white' : '#32302C',
                  border: currentPage === i + 1 ? '1px solid #181818' : '1px solid #E6E6EC',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: '600',
                  fontFamily: 'Plus Jakarta Sans',
                  minWidth: 40
                }}
              >
                {i + 1}
              </button>
            ))}
            {numPages > 20 && (
              <span style={{ fontSize: 12, color: '#6C6B6E', alignSelf: 'center' }}>
                ...+{numPages - 20}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  if (error && !htmlContent) {
    return (
      <div className="preview-modal-error">
        <div className="preview-modal-error-icon">📊</div>
        <div className="preview-modal-error-title">{t('excelPreview.previewNotAvailable')}</div>
        <div className="preview-modal-error-filename">{document.filename}</div>
        <div className="preview-modal-error-message">{error}</div>
        {downloadUrl && (
          <a
            href={downloadUrl}
            download={document.filename}
            className="preview-modal-btn-primary"
            style={{ textDecoration: 'none', marginTop: 8 }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M14 10V12.6667C14 13.4 13.4 14 12.6667 14H3.33333C2.6 14 2 13.4 2 12.6667V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M4.66602 6.66667L7.99935 10L11.3327 6.66667" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M8 10V2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {t('common.download')}
          </a>
        )}
      </div>
    );
  }

  // Extract just the body content from the full HTML document
  const extractBodyContent = (html) => {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    return bodyMatch ? bodyMatch[1] : html;
  };

  const scale = zoom / 100;

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'white',
      borderRadius: 8,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* Sheet Tabs - Only show if multiple sheets */}
      {sheetCount > 1 && (
        <div style={{
          display: 'flex',
          gap: 0,
          background: '#F5F5F5',
          borderBottom: '1px solid #E6E6EC',
          overflowX: 'auto',
          flexShrink: 0
        }}>
          {sheets.map((sheet, index) => (
            <button
              key={index}
              onClick={() => setActiveSheet(index)}
              style={{
                padding: '10px 20px',
                background: activeSheet === index ? 'white' : 'transparent',
                border: 'none',
                borderBottom: activeSheet === index ? '2px solid #181818' : '2px solid transparent',
                cursor: 'pointer',
                fontSize: 13,
                fontFamily: 'Plus Jakarta Sans',
                fontWeight: activeSheet === index ? '600' : '400',
                color: activeSheet === index ? '#181818' : '#6C6B6E',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s ease'
              }}
            >
              {sheet.name}
            </button>
          ))}
        </div>
      )}

      {/* Excel Content - Scrollable container with shift+scroll for horizontal */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          background: 'white'
        }}
        onWheel={(e) => {
          // Enable horizontal scroll with shift+wheel or trackpad horizontal gesture
          if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
            e.currentTarget.scrollLeft += e.deltaX || e.deltaY;
            if (e.shiftKey) {
              e.preventDefault();
            }
          }
        }}
      >
        <div
          ref={contentRef}
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            width: scale !== 1 ? `${100 / scale}%` : '100%',
            minWidth: 'max-content'
          }}
          dangerouslySetInnerHTML={{ __html: extractBodyContent(htmlContent) }}
        />
      </div>
    </div>
  );
};

export default ExcelPreview;
