import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Document, Page, pdfjs } from 'react-pdf';
import api from '../services/api';
import { ReactComponent as ArrowLeftIcon } from '../assets/arrow-narrow-left.svg';
import { ReactComponent as ArrowRightIcon } from '../assets/arrow-narrow-right.svg';
import '../styles/PreviewModalBase.css';

// Set up the worker for pdf.js
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/**
 * PPTX Preview Component
 * Displays PowerPoint presentations with slide navigation
 * Now supports PDF preview when LibreOffice conversion is available
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

  // PDF options for react-pdf
  const pdfOptions = useMemo(() => ({
    cMapUrl: 'https://unpkg.com/pdfjs-dist@' + pdfjs.version + '/cmaps/',
    cMapPacked: true,
    withCredentials: false,
    isEvalSupported: false,
  }), []);

  useEffect(() => {
    const fetchPreview = async () => {
      try {
        setLoading(true);
        setError(null);

        // First, check the preview endpoint to see if PDF is available
        const previewResponse = await api.get(`/api/documents/${pptxDocument.id}/preview`);

        if (previewResponse.data.previewType === 'pptx-pdf') {
          // PDF conversion is available - use PDF viewer
          console.log('📊 [PPTXPreview] PDF conversion available, using PDF viewer');
          setPdfMode(true);

          // Fetch the PDF blob
          const pdfResponse = await api.get(`/api/documents/${pptxDocument.id}/preview-pdf`, {
            responseType: 'blob'
          });
          const pdfBlob = pdfResponse.data;
          const url = URL.createObjectURL(pdfBlob);
          setPdfUrl(url);
          setLoading(false);
          return;
        }

        // Fall back to slides endpoint
        const response = await api.get(`/api/documents/${pptxDocument.id}/slides`);

        if (response.data.success) {
          let slideData = response.data.slides || [];

          // If no slides but we have metadata with extractedText, try to parse it
          if (slideData.length === 0 && pptxDocument.metadata?.extractedText) {
            console.log('No slides found, parsing from extractedText');
            slideData = parseExtractedText(pptxDocument.metadata.extractedText);
          }

          setSlides(slideData);
          setMetadata(response.data.metadata || {});

          if (slideData.length === 0) {
            setError(response.data.message || 'No slides available');
          }
        } else {
          setError('Failed to load slides');
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

    // Cleanup blob URL on unmount
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pptxDocument]);

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

  const goToNextSlide = () => {
    if (currentSlideIndex < slides.length - 1) {
      setCurrentSlideIndex(currentSlideIndex + 1);
    }
  };

  const goToPreviousSlide = () => {
    if (currentSlideIndex > 0) {
      setCurrentSlideIndex(currentSlideIndex - 1);
    }
  };

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
            {t('pptxPreview.slideOf', { current: currentPage, total: numPages || '?' })}
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
            {t('pptxPreview.slideOf', { current: currentSlideIndex + 1, total: slides.length })}
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

          {/* Show slide image */}
          {currentSlide && currentSlide.imageUrl ? (
            <img
              src={currentSlide.imageUrl}
              alt={`Slide ${currentSlideIndex + 1}`}
              style={{
                maxWidth: '100%',
                maxHeight: '600px',
                width: 'auto',
                height: 'auto',
                borderRadius: 8,
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
              }}
              onError={(e) => {
                console.error('Failed to load slide image:', currentSlide.imageUrl);
                // ✅ FIX: Show text content as fallback
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : currentSlide && currentSlide.content ? (
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
          ) : (
            <div style={{
              textAlign: 'center',
              color: '#6C6B6E',
              fontSize: 14,
              fontFamily: 'Plus Jakarta Sans',
              padding: 40
            }}>
              {t('pptxPreview.slideEmpty')}
            </div>
          )}
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
