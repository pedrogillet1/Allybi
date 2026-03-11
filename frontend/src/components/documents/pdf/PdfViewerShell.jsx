import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import { Document, Page } from 'react-pdf';
import PdfFloatingControls from './PdfFloatingControls';
import PdfSidebar from './PdfSidebar';
import MobilePdfViewer from './MobilePdfViewer';
import { useIsMobile } from '../../../hooks/useIsMobile';

/* ────────────────────────── constants ────────────────────────── */
const ZOOM_STEPS = [25, 33, 50, 67, 75, 100, 125, 150, 200, 300, 400, 500];
const PAGE_GAP = 12; // px between pages
const VIEWPORT_PAD_X = 32;
const VIEWPORT_PAD_Y = 32;

/* intrinsic PDF page size (Letter) — used as placeholder until first page measures */
const DEFAULT_PAGE_W = 612; // 8.5in * 72dpi
const DEFAULT_PAGE_H = 792; // 11in * 72dpi

/**
 * PdfViewerShell — full-featured PDF viewer.
 *
 * Responsibilities:
 *  - Lazy page rendering (only mount <Page> for visible/near-visible pages)
 *  - Fit-width default zoom
 *  - Floating controls (zoom, page nav, fit modes, rotate, fullscreen)
 *  - Collapsible thumbnail sidebar
 *  - Keyboard shortcuts
 *  - Wheel-to-zoom (Ctrl + wheel)
 *
 * Props from DocumentViewer:
 *  @param {object}  fileConfig   — react-pdf file prop ({ url, httpHeaders? })
 *  @param {object}  pdfOptions   — react-pdf options (cMap, Safari tweaks, etc.)
 *  @param {function} onDocumentLoadSuccess — callback({ numPages })
 *  @param {number}  initialPage  — jump-to page on mount
 */
export default function PdfViewerShell({
  fileConfig,
  pdfOptions,
  onDocumentLoadSuccess: parentOnLoad,
  initialPage = 1,
}) {
  const isMobile = useIsMobile();

  /* ── core state ─────────────────────────────────────── */
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [rotation, setRotation] = useState(0);      // 0 | 90 | 180 | 270
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [isFullscreen, setIsFullscreen] = useState(false);

  /* zoom: 0 = "fit width" sentinel, >0 = percentage */
  const [zoomPct, setZoomPct] = useState(0);

  /* intrinsic dimensions of the first page (measured once on load) */
  const [pageNaturalW, setPageNaturalW] = useState(DEFAULT_PAGE_W);
  const [pageNaturalH, setPageNaturalH] = useState(DEFAULT_PAGE_H);

  /* viewport dimensions */
  const [viewportW, setViewportW] = useState(0);
  const [viewportH, setViewportH] = useState(0);

  /* lazy rendering: track which pages are visible */
  const [visiblePages, setVisiblePages] = useState(new Set());

  /* refs */
  const shellRef = useRef(null);
  const viewportRef = useRef(null);
  const pageRefs = useRef({});

  /* ── derived values ─────────────────────────────────── */

  // Effective page dimensions (accounting for rotation)
  const isRotated = rotation === 90 || rotation === 270;
  const effectiveW = isRotated ? pageNaturalH : pageNaturalW;
  const effectiveH = isRotated ? pageNaturalW : pageNaturalH;

  // Fit-width scale
  const fitWidthScale = useMemo(() => {
    if (!viewportW || !effectiveW) return 1;
    const avail = viewportW - VIEWPORT_PAD_X * 2;
    return Math.max(0.25, avail / effectiveW);
  }, [viewportW, effectiveW]);

  // Fit-page scale
  const fitPageScale = useMemo(() => {
    if (!viewportW || !viewportH || !effectiveW || !effectiveH) return 1;
    const availW = viewportW - VIEWPORT_PAD_X * 2;
    const availH = viewportH - VIEWPORT_PAD_Y * 2;
    return Math.max(0.25, Math.min(availW / effectiveW, availH / effectiveH));
  }, [viewportW, viewportH, effectiveW, effectiveH]);

  // Actual scale applied
  const scale = zoomPct === 0 ? fitWidthScale : zoomPct / 100;

  // Fit mode (for button highlighting)
  const fitMode = useMemo(() => {
    if (zoomPct === 0) return 'width';
    const pct = zoomPct / 100;
    if (Math.abs(pct - fitPageScale) < 0.01) return 'page';
    if (Math.abs(pct - 1) < 0.01) return 'actual';
    return null;
  }, [zoomPct, fitPageScale]);

  // Display zoom percentage
  const displayZoom = Math.round(scale * 100);

  // Rendered page width passed to react-pdf <Page>
  const renderedPageWidth = Math.round(effectiveW * scale);

  /* ── viewport measurement ───────────────────────────── */
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const ro = new ResizeObserver(([entry]) => {
      setViewportW(entry.contentRect.width);
      setViewportH(entry.contentRect.height);
    });
    ro.observe(vp);
    return () => ro.disconnect();
  }, []);

  /* ── Document load ──────────────────────────────────── */
  const handleDocLoad = useCallback(({ numPages: n }) => {
    setNumPages(n);
    const page = Math.max(1, Math.min(initialPage, n));
    setCurrentPage(page);
    parentOnLoad?.({ numPages: n });
  }, [initialPage, parentOnLoad]);

  /* Measure first page to get intrinsic dimensions */
  const handleFirstPageRender = useCallback((page) => {
    if (page?.originalWidth && page?.originalHeight) {
      setPageNaturalW(page.originalWidth);
      setPageNaturalH(page.originalHeight);
    }
  }, []);

  /* ── IntersectionObserver for current-page tracking + lazy rendering ── */
  useEffect(() => {
    if (!numPages) return;
    const vp = viewportRef.current;
    if (!vp) return;

    // Visibility observer: which pages are on screen (for lazy rendering)
    const visObs = new IntersectionObserver(
      (entries) => {
        setVisiblePages((prev) => {
          const next = new Set(prev);
          entries.forEach((e) => {
            const pg = parseInt(e.target.getAttribute('data-page-number'), 10);
            if (!pg) return;
            if (e.isIntersecting) next.add(pg);
            else next.delete(pg);
          });
          return next;
        });
      },
      { root: vp, rootMargin: '200px 0px', threshold: 0 },
    );

    // Current-page observer: which page is in the center
    const curObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const pg = parseInt(e.target.getAttribute('data-page-number'), 10);
            if (pg) setCurrentPage(pg);
          }
        });
      },
      { root: vp, rootMargin: '-50% 0px -50% 0px', threshold: 0 },
    );

    Object.values(pageRefs.current).forEach((el) => {
      if (el) { visObs.observe(el); curObs.observe(el); }
    });

    return () => { visObs.disconnect(); curObs.disconnect(); };
  }, [numPages, renderedPageWidth, rotation]);

  /* ── scroll-to-page ─────────────────────────────────── */
  const scrollToPage = useCallback((pg) => {
    const el = pageRefs.current[pg];
    if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, []);

  const handlePageChange = useCallback((pg) => {
    if (pg < 1 || pg > numPages) return;
    setCurrentPage(pg);
    scrollToPage(pg);
  }, [numPages, scrollToPage]);

  /* ── zoom helpers ───────────────────────────────────── */
  const stepZoom = useCallback((dir) => {
    const cur = displayZoom;
    if (dir > 0) {
      const next = ZOOM_STEPS.find((s) => s > cur);
      setZoomPct(next || ZOOM_STEPS[ZOOM_STEPS.length - 1]);
    } else {
      const next = [...ZOOM_STEPS].reverse().find((s) => s < cur);
      setZoomPct(next || ZOOM_STEPS[0]);
    }
  }, [displayZoom]);

  const handleZoomIn = useCallback(() => stepZoom(1), [stepZoom]);
  const handleZoomOut = useCallback(() => stepZoom(-1), [stepZoom]);
  const handleFitWidth = useCallback(() => setZoomPct(0), []);
  const handleFitPage = useCallback(() => setZoomPct(Math.round(fitPageScale * 100)), [fitPageScale]);
  const handleActualSize = useCallback(() => setZoomPct(100), []);

  /* ── rotate ─────────────────────────────────────────── */
  const handleRotateLeft = useCallback(() => setRotation((r) => (r + 270) % 360), []);
  const handleRotateRight = useCallback(() => setRotation((r) => (r + 90) % 360), []);

  /* ── fullscreen ─────────────────────────────────────── */
  const handleToggleFullscreen = useCallback(() => {
    const el = shellRef.current;
    if (!el) return;
    if (!window.document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {});
    } else {
      window.document.exitFullscreen?.();
    }
  }, []);

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!window.document.fullscreenElement);
    window.document.addEventListener('fullscreenchange', onFs);
    return () => window.document.removeEventListener('fullscreenchange', onFs);
  }, []);

  /* ── keyboard shortcuts ─────────────────────────────── */
  useEffect(() => {
    const handler = (e) => {
      const mod = e.ctrlKey || e.metaKey;

      // Ctrl/Cmd + scroll shortcuts
      if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); handleZoomIn(); }
      if (mod && e.key === '-') { e.preventDefault(); handleZoomOut(); }
      if (mod && e.key === '0') { e.preventDefault(); handleFitWidth(); }

      // Page navigation
      if (e.key === 'PageDown' || (e.key === 'ArrowDown' && mod)) {
        e.preventDefault(); handlePageChange(currentPage + 1);
      }
      if (e.key === 'PageUp' || (e.key === 'ArrowUp' && mod)) {
        e.preventDefault(); handlePageChange(currentPage - 1);
      }
      if (e.key === 'Home' && mod) { e.preventDefault(); handlePageChange(1); }
      if (e.key === 'End' && mod) { e.preventDefault(); handlePageChange(numPages); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleZoomIn, handleZoomOut, handleFitWidth, handlePageChange, currentPage, numPages]);

  /* ── Ctrl + wheel zoom ──────────────────────────────── */
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const handler = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      if (e.deltaY < 0) handleZoomIn();
      else handleZoomOut();
    };
    vp.addEventListener('wheel', handler, { passive: false });
    return () => vp.removeEventListener('wheel', handler);
  }, [handleZoomIn, handleZoomOut]);

  /* ── decide which pages to render (visible + buffer of 2) ── */
  const pagesToRender = useMemo(() => {
    const s = new Set();
    visiblePages.forEach((pg) => {
      for (let d = -2; d <= 2; d++) {
        const p = pg + d;
        if (p >= 1 && p <= numPages) s.add(p);
      }
    });
    // Always render at least page 1 at startup
    if (s.size === 0 && numPages > 0) s.add(1);
    return s;
  }, [visiblePages, numPages]);

  /* ── placeholder height for un-rendered pages ───────── */
  const placeholderH = useMemo(() => {
    return Math.round(effectiveH * scale);
  }, [effectiveH, scale]);

  /* ── render ─────────────────────────────────────────── */
  const hasPages = Number.isFinite(numPages) && numPages > 0;

  /* ── Mobile: delegate to MobilePdfViewer ─────────── */
  if (isMobile) {
    return (
      <MobilePdfViewer
        fileConfig={fileConfig}
        pdfOptions={pdfOptions}
        initialPage={initialPage}
        onDocumentLoadSuccess={parentOnLoad}
        onClose={() => window.history.back()}
      />
    );
  }

  /* ── Desktop: original layout ────────────────────── */
  return (
    <div
      ref={shellRef}
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        minHeight: 0,
        minWidth: 0,
        position: 'relative',
        background: '#F1F0EF',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
      }}
    >
      {/* Sidebar */}
      {hasPages && (
        <PdfSidebar
          open={sidebarOpen}
          numPages={numPages}
          currentPage={currentPage}
          onPageClick={handlePageChange}
          fileConfig={fileConfig}
          pdfOptions={pdfOptions}
        />
      )}

      {/* Viewport */}
      <div
        ref={viewportRef}
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'auto',
          position: 'relative',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {/* Floating controls */}
        {hasPages && (
          <PdfFloatingControls
            currentPage={currentPage}
            numPages={numPages}
            zoom={scale}
            fitMode={fitMode}
            onPageChange={handlePageChange}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onFitWidth={handleFitWidth}
            onFitPage={handleFitPage}
            onActualSize={handleActualSize}
            onRotateLeft={handleRotateLeft}
            onRotateRight={handleRotateRight}
            onToggleFullscreen={handleToggleFullscreen}
            onToggleSidebar={() => setSidebarOpen((o) => !o)}
            sidebarOpen={sidebarOpen}
          />
        )}

        {/* Document container */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: `${VIEWPORT_PAD_Y}px ${VIEWPORT_PAD_X}px`,
            minHeight: '100%',
          }}
        >
          {fileConfig ? (
            <Document
              key={fileConfig?.url || 'pdf'}
              file={fileConfig}
              onLoadSuccess={handleDocLoad}
              options={pdfOptions}
              loading={
                <div style={{ padding: 48, fontFamily: 'Plus Jakarta Sans', fontWeight: 700, color: '#6B7280', textAlign: 'center' }}>
                  Loading PDF…
                </div>
              }
              error={
                <div style={{ padding: 48, fontFamily: 'Plus Jakarta Sans', fontWeight: 700, color: '#991B1B', textAlign: 'center' }}>
                  Failed to load PDF.
                </div>
              }
              onLoadError={() => {}}
            >
              {hasPages
                ? Array.from({ length: numPages }, (_, i) => {
                    const pg = i + 1;
                    const shouldRender = pagesToRender.has(pg);
                    return (
                      <div
                        key={`page_${pg}`}
                        data-page-number={pg}
                        ref={(el) => { pageRefs.current[pg] = el; }}
                        style={{
                          marginBottom: PAGE_GAP,
                          background: '#FFFFFF',
                          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                          overflow: 'hidden',
                        }}
                      >
                        {shouldRender ? (
                          <Page
                            pageNumber={pg}
                            width={renderedPageWidth}
                            rotate={rotation}
                            renderTextLayer
                            renderAnnotationLayer
                            onRenderSuccess={pg === 1 ? handleFirstPageRender : undefined}
                            loading={
                              <div
                                style={{
                                  width: renderedPageWidth,
                                  height: placeholderH,
                                  background: '#FAFAFA',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#9CA3AF',
                                  fontSize: 13,
                                  fontWeight: 600,
                                }}
                              >
                                Rendering…
                              </div>
                            }
                          />
                        ) : (
                          <div
                            style={{
                              width: renderedPageWidth,
                              height: placeholderH,
                              background: '#FAFAFA',
                            }}
                          />
                        )}
                      </div>
                    );
                  })
                : null}
            </Document>
          ) : null}
        </div>
      </div>
    </div>
  );
}
