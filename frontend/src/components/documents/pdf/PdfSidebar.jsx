import React, { useRef, useEffect } from 'react';
import { Document, Page } from 'react-pdf';

const THUMB_W = 120;

/**
 * Collapsible thumbnail sidebar for the PDF viewer.
 *
 * Renders mini <Page> thumbnails for every page.  The currently-visible page
 * is highlighted and auto-scrolled into view.
 */
export default function PdfSidebar({
  open,
  numPages,
  currentPage,
  onPageClick,
  fileConfig,
  pdfOptions,
}) {
  const listRef = useRef(null);

  // Auto-scroll the active thumbnail into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-thumb="${currentPage}"]`);
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentPage, open]);

  if (!open) return null;

  return (
    <div
      style={{
        width: 164,
        minWidth: 164,
        height: '100%',
        background: '#FFFFFF',
        borderRight: '1px solid #E6E6EC',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 14px 8px',
          fontSize: 11,
          fontWeight: 700,
          color: '#6C6B6E',
          fontFamily: 'Plus Jakarta Sans, sans-serif',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        Pages
      </div>

      {/* Thumbnail list */}
      <div
        ref={listRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '0 14px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {fileConfig ? (
          <Document
            file={fileConfig}
            options={pdfOptions}
            loading={null}
            error={null}
            onLoadError={() => {}}
          >
            {Array.from({ length: numPages || 0 }, (_, i) => {
              const pg = i + 1;
              const isActive = pg === currentPage;
              return (
                <button
                  key={pg}
                  type="button"
                  data-thumb={pg}
                  onClick={() => onPageClick?.(pg)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  <div
                    style={{
                      borderRadius: 4,
                      overflow: 'hidden',
                      border: isActive ? '2px solid #111827' : '1px solid #E6E6EC',
                      boxShadow: isActive
                        ? '0 0 0 2px rgba(17,24,39,0.12)'
                        : '0 1px 3px rgba(0,0,0,0.06)',
                      background: '#FFFFFF',
                      transition: 'border-color 120ms, box-shadow 120ms',
                    }}
                  >
                    <Page
                      pageNumber={pg}
                      width={THUMB_W}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                      loading={
                        <div
                          style={{
                            width: THUMB_W,
                            height: Math.round(THUMB_W * 1.294),
                            background: '#F5F5F5',
                          }}
                        />
                      }
                    />
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? '#111827' : '#6C6B6E',
                      fontFamily: 'Plus Jakarta Sans, sans-serif',
                    }}
                  >
                    {pg}
                  </span>
                </button>
              );
            })}
          </Document>
        ) : null}
      </div>
    </div>
  );
}
