import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import { Document, Page } from 'react-pdf';
import { useTranslation } from 'react-i18next';
import MobilePreviewShell from '../MobilePreviewShell';

/* ────────────────────────── constants ────────────────────────── */
const ZOOM_STEPS = [50, 75, 100, 125, 150, 200, 300];
const GUTTER = 12;
const PAGE_GAP = 10;
const DOUBLE_TAP_MS = 300;
const ZOOM_TOGGLE_PCT = 200;

const DEFAULT_PAGE_W = 612;
const DEFAULT_PAGE_H = 792;

const DPR = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;

const mobileBtnStyle = {
  width: 44, height: 44, minWidth: 44, minHeight: 44,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'none', border: 'none', borderRadius: 10,
  cursor: 'pointer', padding: 0, color: '#32302C', flexShrink: 0,
  WebkitTapHighlightColor: 'transparent',
};

/* ────────────────────────── component ────────────────────────── */

/**
 * MobilePdfViewer — mobile PDF reader using MobilePreviewShell.
 *
 * Adds PDF-specific logic on top of the shared shell:
 *  - Lazy page rendering (IntersectionObserver)
 *  - Fit-width zoom (ResizeObserver on scroll container)
 *  - Page navigation + zoom toolbar
 *  - Rotation, double-tap zoom
 */
export default function MobilePdfViewer({
  fileConfig,
  pdfOptions,
  filename = 'Document',
  initialPage = 1,
  onClose,
  onDownload,
  onShare,
  onDocumentLoadSuccess: parentOnLoad,
}) {
  const { t } = useTranslation();

  /* ── core state ─────────────────────────────────── */
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [rotation, setRotation] = useState(0);
  const [zoomPct, setZoomPct] = useState(0); // 0 = fit-width
  const [pageNaturalW, setPageNaturalW] = useState(DEFAULT_PAGE_W);
  const [pageNaturalH, setPageNaturalH] = useState(DEFAULT_PAGE_H);
  const [containerW, setContainerW] = useState(window.innerWidth);
  const [visiblePages, setVisiblePages] = useState(new Set());
  const [menuOpen, setMenuOpen] = useState(false);

  const lastTapRef = useRef(0);
  const scrollRef = useRef(null);
  const pageRefs = useRef({});

  /* ── derived values ─────────────────────────────── */
  const isRotated = rotation === 90 || rotation === 270;
  const effectiveW = isRotated ? pageNaturalH : pageNaturalW;
  const effectiveH = isRotated ? pageNaturalW : pageNaturalH;

  const fitWidthScale = useMemo(() => {
    if (!containerW || !effectiveW) return 1;
    return Math.max(0.25, (containerW - GUTTER * 2) / effectiveW);
  }, [containerW, effectiveW]);

  const scale = zoomPct === 0 ? fitWidthScale : zoomPct / 100;
  const displayZoom = Math.round(scale * 100);
  const renderedPageWidth = Math.round(effectiveW * scale);
  const placeholderH = Math.round(effectiveH * scale);
  const hasPages = Number.isFinite(numPages) && numPages > 0;

  /* ── measure scroll container ───────────────────── */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setContainerW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const handler = () => {
      if (scrollRef.current) setContainerW(scrollRef.current.clientWidth);
    };
    window.addEventListener('orientationchange', handler);
    return () => window.removeEventListener('orientationchange', handler);
  }, []);

  /* ── Document load ──────────────────────────────── */
  const handleDocLoad = useCallback(({ numPages: n }) => {
    setNumPages(n);
    setCurrentPage(Math.max(1, Math.min(initialPage, n)));
    parentOnLoad?.({ numPages: n });
  }, [initialPage, parentOnLoad]);

  const handleFirstPageRender = useCallback((page) => {
    if (page?.originalWidth && page?.originalHeight) {
      setPageNaturalW(page.originalWidth);
      setPageNaturalH(page.originalHeight);
    }
  }, []);

  /* ── IntersectionObserver ───────────────────────── */
  useEffect(() => {
    if (!numPages) return;
    const root = scrollRef.current;
    if (!root) return;

    const visObs = new IntersectionObserver(
      (entries) => {
        setVisiblePages((prev) => {
          const next = new Set(prev);
          entries.forEach((e) => {
            const pg = parseInt(e.target.getAttribute('data-page-number'), 10);
            if (!pg) return;
            e.isIntersecting ? next.add(pg) : next.delete(pg);
          });
          return next;
        });
      },
      { root, rootMargin: '300px 0px', threshold: 0 },
    );
    const curObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const pg = parseInt(e.target.getAttribute('data-page-number'), 10);
            if (pg) setCurrentPage(pg);
          }
        });
      },
      { root, rootMargin: '-45% 0px -45% 0px', threshold: 0 },
    );

    Object.values(pageRefs.current).forEach((el) => {
      if (el) { visObs.observe(el); curObs.observe(el); }
    });
    return () => { visObs.disconnect(); curObs.disconnect(); };
  }, [numPages, renderedPageWidth, rotation]);

  const pagesToRender = useMemo(() => {
    const s = new Set();
    visiblePages.forEach((pg) => {
      for (let d = -2; d <= 2; d++) {
        const p = pg + d;
        if (p >= 1 && p <= numPages) s.add(p);
      }
    });
    if (s.size === 0 && numPages > 0) s.add(1);
    return s;
  }, [visiblePages, numPages]);

  /* ── navigation ─────────────────────────────────── */
  const scrollToPage = useCallback((pg) => {
    const el = pageRefs.current[pg];
    if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, []);

  const handlePageChange = useCallback((pg) => {
    if (pg < 1 || pg > numPages) return;
    setCurrentPage(pg);
    scrollToPage(pg);
  }, [numPages, scrollToPage]);

  /* ── zoom ───────────────────────────────────────── */
  const stepZoom = useCallback((dir) => {
    const cur = displayZoom;
    if (dir > 0) {
      setZoomPct(ZOOM_STEPS.find((s) => s > cur) || ZOOM_STEPS[ZOOM_STEPS.length - 1]);
    } else {
      setZoomPct([...ZOOM_STEPS].reverse().find((s) => s < cur) || ZOOM_STEPS[0]);
    }
  }, [displayZoom]);

  const handleZoomIn = useCallback(() => stepZoom(1), [stepZoom]);
  const handleZoomOut = useCallback(() => stepZoom(-1), [stepZoom]);
  const handleFitWidth = useCallback(() => setZoomPct(0), []);
  const handleRotateRight = useCallback(() => setRotation((r) => (r + 90) % 360), []);

  const handleShare = useCallback(async () => {
    if (navigator.share) {
      try { await navigator.share({ title: filename, text: filename }); } catch {}
    } else if (onShare) { onShare(); }
    else if (onDownload) { onDownload(); }
  }, [filename, onShare, onDownload]);

  /* ── double-tap zoom ────────────────────────────── */
  const handleContentTap = useCallback((e) => {
    if (e.target.closest('button')) return;
    const now = Date.now();
    const dt = now - lastTapRef.current;
    lastTapRef.current = now;
    if (dt < DOUBLE_TAP_MS) {
      lastTapRef.current = 0;
      setZoomPct((prev) => prev === 0 ? ZOOM_TOGGLE_PCT : 0);
    }
  }, []);

  /* ── PDF toolbar (passed to shell) ──────────────── */
  const pdfToolbar = (
    <div style={{
      height: 52,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 4px',
    }}>
      <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage <= 1}
        aria-label="Previous page" style={{ ...mobileBtnStyle, opacity: currentPage <= 1 ? 0.3 : 1 }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      <span style={{ fontSize: 13, fontWeight: 700, color: '#32302C', minWidth: 48, textAlign: 'center', userSelect: 'none' }}>
        {currentPage} / {numPages || '–'}
      </span>

      <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage >= numPages}
        aria-label="Next page" style={{ ...mobileBtnStyle, opacity: currentPage >= numPages ? 0.3 : 1 }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M7.5 5L12.5 10L7.5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      <div style={{ width: 1, height: 20, background: '#E6E6EC', flexShrink: 0 }} />

      <button onClick={handleZoomOut} disabled={displayZoom <= ZOOM_STEPS[0]}
        aria-label="Zoom out" style={{ ...mobileBtnStyle, opacity: displayZoom <= ZOOM_STEPS[0] ? 0.3 : 1 }}>
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
          <path d="M4 8H12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </button>

      <button onClick={handleFitWidth} aria-label="Fit width" style={{
        ...mobileBtnStyle,
        background: zoomPct === 0 ? '#111827' : 'transparent',
        color: zoomPct === 0 ? '#FFFFFF' : '#32302C',
        borderRadius: 8, fontSize: 11, fontWeight: 700, minWidth: 44,
      }}>
        {zoomPct === 0 ? 'FIT' : `${displayZoom}%`}
      </button>

      <button onClick={handleZoomIn} disabled={displayZoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
        aria-label="Zoom in" style={{ ...mobileBtnStyle, opacity: displayZoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1] ? 0.3 : 1 }}>
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
          <path d="M8 4V12M4 8H12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </button>

      <div style={{ width: 1, height: 20, background: '#E6E6EC', flexShrink: 0 }} />

      {/* Overflow menu */}
      <div style={{ position: 'relative' }}>
        <button onClick={() => setMenuOpen((o) => !o)} aria-label="More options" style={mobileBtnStyle}>
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="3" r="1.5" fill="#32302C"/><circle cx="8" cy="8" r="1.5" fill="#32302C"/><circle cx="8" cy="13" r="1.5" fill="#32302C"/>
          </svg>
        </button>
        {menuOpen && (
          <>
            <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
            <div style={{
              position: 'absolute', bottom: '100%', right: 0, marginBottom: 8,
              background: '#FFFFFF', borderRadius: 12, minWidth: 180, zIndex: 31, overflow: 'hidden',
              boxShadow: '0 4px 16px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)',
            }}>
              {onDownload && <MenuRow label={t('common.download')} icon={<DownloadIcon />} onClick={() => { setMenuOpen(false); onDownload(); }} />}
              {navigator.share && <MenuRow label="Share" icon={<ShareIcon />} onClick={() => { setMenuOpen(false); handleShare(); }} />}
              <MenuRow label="Rotate" icon={<RotateIcon />} onClick={() => { setMenuOpen(false); handleRotateRight(); }} />
            </div>
          </>
        )}
      </div>
    </div>
  );

  /* ── render ─────────────────────────────────────── */
  return (
    <MobilePreviewShell
      filename={filename}
      onClose={onClose}
      onDownload={onDownload}
      statusText={hasPages ? `${numPages} ${numPages === 1 ? 'page' : 'pages'}` : undefined}
      toolbar={pdfToolbar}
    >
      {/* Custom scrollable body — we need our own ref for IntersectionObserver + ResizeObserver */}
      <div
        ref={scrollRef}
        onClick={handleContentTap}
        style={{
          position: 'absolute',
          inset: 0,
          overflowY: 'auto',
          overflowX: zoomPct !== 0 ? 'auto' : 'hidden',
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
        }}
      >
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: `24px ${GUTTER}px ${GUTTER}px`,
          minHeight: '100%',
        }}>
          {fileConfig ? (
            <Document
              key={fileConfig?.url || 'pdf'}
              file={fileConfig}
              onLoadSuccess={handleDocLoad}
              options={pdfOptions}
              loading={<div style={{ padding: 48, fontWeight: 700, color: '#6B7280', textAlign: 'center', fontSize: 14 }}>Loading PDF…</div>}
              error={<div style={{ padding: 48, fontWeight: 700, color: '#991B1B', textAlign: 'center', fontSize: 14 }}>Failed to load PDF.</div>}
              onLoadError={() => {}}
            >
              {hasPages
                ? Array.from({ length: numPages }, (_, i) => {
                    const pg = i + 1;
                    const shouldRender = pagesToRender.has(pg);
                    return (
                      <div key={`page_${pg}`} data-page-number={pg} ref={(el) => { pageRefs.current[pg] = el; }}
                        style={{ marginBottom: PAGE_GAP, background: '#FFFFFF', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                        {shouldRender ? (
                          <Page pageNumber={pg} width={renderedPageWidth} rotate={rotation}
                            renderTextLayer renderAnnotationLayer devicePixelRatio={DPR}
                            onRenderSuccess={pg === 1 ? handleFirstPageRender : undefined}
                            loading={
                              <div style={{ width: renderedPageWidth, height: placeholderH, background: '#FAFAFA',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: 13, fontWeight: 600 }}>
                                {pg === 1 ? 'Loading…' : ''}
                              </div>
                            }
                          />
                        ) : (
                          <div style={{ width: renderedPageWidth, height: placeholderH, background: '#FAFAFA' }} />
                        )}
                      </div>
                    );
                  })
                : null}
            </Document>
          ) : null}
        </div>
      </div>
    </MobilePreviewShell>
  );
}

/* ────────────────────────── helpers ────────────────────────── */

function MenuRow({ label, icon, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '14px 16px',
      background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
      color: '#32302C', fontFamily: 'Plus Jakarta Sans, sans-serif', WebkitTapHighlightColor: 'transparent',
    }}>
      <span style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
      {label}
    </button>
  );
}

function DownloadIcon() {
  return (<svg width="18" height="18" viewBox="0 0 16 16" fill="none">
    <path d="M14 10V12.667C14 13.02 13.86 13.36 13.61 13.61C13.36 13.86 13.02 14 12.667 14H3.333C2.98 14 2.64 13.86 2.39 13.61C2.14 13.36 2 13.02 2 12.667V10" stroke="#32302C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M4.666 6.667L8 10L11.333 6.667" stroke="#32302C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M8 10V2" stroke="#32302C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>);
}

function ShareIcon() {
  return (<svg width="18" height="18" viewBox="0 0 16 16" fill="none">
    <path d="M4 10V12.667C4 13.02 4.14 13.36 4.39 13.61C4.64 13.86 4.98 14 5.333 14H10.667C11.02 14 11.36 13.86 11.61 13.61C11.86 13.36 12 13.02 12 12.667V10" stroke="#32302C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M11.333 5.333L8 2L4.666 5.333" stroke="#32302C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M8 2V10" stroke="#32302C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>);
}

function RotateIcon() {
  return (<svg width="18" height="18" viewBox="0 0 16 16" fill="none" style={{ transform: 'scaleX(-1)' }}>
    <path d="M2 7C2 4.239 4.239 2 7 2H9C11.761 2 14 4.239 14 7V9C14 11.761 11.761 14 9 14H7" stroke="#32302C" strokeWidth="1.4" strokeLinecap="round"/>
    <path d="M5 5L2 7L5 9" stroke="#32302C" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>);
}
