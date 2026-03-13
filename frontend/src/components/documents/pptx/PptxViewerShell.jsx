import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import PptxFloatingControls from './PptxFloatingControls';
import PptxSidebar from './PptxSidebar';
import PptxSlideCard from './PptxSlideCard';
import usePptxSlides from './usePptxSlides';
import { useIsMobile } from '../../../hooks/useIsMobile';
import MobilePptxViewer from './MobilePptxViewer';

/* ────────────────────────── constants ────────────────────────── */
const ZOOM_STEPS = [25, 33, 50, 67, 75, 100, 125, 150, 200, 300, 400, 500];
const SLIDE_GAP = 28;       // px between slides in document mode
const VIEWPORT_PAD_X = 32;
const VIEWPORT_PAD_Y = 32;
const SLIDE_ASPECT = 9 / 16; // 16:9

/**
 * PptxViewerShell — full-featured PPTX viewer.
 *
 * Two view modes:
 *  - Document: vertical stack of slides (scrollable)
 *  - Single:  one slide at a time with prev/next
 *
 * @param {object}  document — the document record (needs .id)
 * @param {number}  version  — bumped on edit to refetch slides
 */
export default function PptxViewerShell({ document: doc, version = 0 }) {
  const isMobile = useIsMobile();
  const { slides, totalSlides, loading, error, refetch } = usePptxSlides(doc?.id, version);

  /* ── core state ─────────────────────────────────────── */
  const [currentSlide, setCurrentSlide] = useState(1);
  const [viewMode, setViewMode] = useState('document'); // 'document' | 'single'
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [isFullscreen, setIsFullscreen] = useState(false);

  /* zoom: 0 = "fit width" sentinel */
  const [zoomPct, setZoomPct] = useState(0);

  /* viewport dimensions */
  const [viewportW, setViewportW] = useState(0);
  const [viewportH, setViewportH] = useState(0);

  /* lazy rendering tracking */
  const [visibleSlides, setVisibleSlides] = useState(new Set());

  /* refs */
  const shellRef = useRef(null);
  const viewportRef = useRef(null);
  const slideRefs = useRef({});

  /* ── derived values ─────────────────────────────────── */

  // Natural slide width (assume ~960px for 16:9 presentation at 1x)
  const naturalSlideW = 960;

  // Fit-width scale
  const fitWidthScale = useMemo(() => {
    if (!viewportW) return 1;
    const avail = viewportW - VIEWPORT_PAD_X * 2;
    return Math.max(0.25, avail / naturalSlideW);
  }, [viewportW]);

  // Fit-slide scale (fit entire slide in viewport)
  const fitSlideScale = useMemo(() => {
    if (!viewportW || !viewportH) return 1;
    const availW = viewportW - VIEWPORT_PAD_X * 2;
    const availH = viewportH - VIEWPORT_PAD_Y * 2;
    const slideH = naturalSlideW * SLIDE_ASPECT;
    return Math.max(0.25, Math.min(availW / naturalSlideW, availH / slideH));
  }, [viewportW, viewportH]);

  // Actual scale
  const scale = zoomPct === 0 ? fitWidthScale : zoomPct / 100;

  // Fit mode label
  const fitMode = useMemo(() => {
    if (zoomPct === 0) return 'width';
    const pct = zoomPct / 100;
    if (Math.abs(pct - fitSlideScale) < 0.01) return 'slide';
    if (Math.abs(pct - 1) < 0.01) return 'actual';
    return null;
  }, [zoomPct, fitSlideScale]);

  // Display zoom %
  const displayZoom = Math.round(scale * 100);

  // Rendered slide width
  const renderedSlideW = Math.round(naturalSlideW * scale);

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

  /* ── IntersectionObserver for document mode ──────────── */
  useEffect(() => {
    if (viewMode !== 'document' || !slides.length) return;
    const vp = viewportRef.current;
    if (!vp) return;

    // Current slide tracking
    const curObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const n = parseInt(e.target.getAttribute('data-slide-number'), 10);
            if (n) setCurrentSlide(n);
          }
        });
      },
      { root: vp, rootMargin: '-50% 0px -50% 0px', threshold: 0 },
    );

    // Visibility tracking for lazy rendering
    const visObs = new IntersectionObserver(
      (entries) => {
        setVisibleSlides((prev) => {
          const next = new Set(prev);
          entries.forEach((e) => {
            const n = parseInt(e.target.getAttribute('data-slide-number'), 10);
            if (!n) return;
            if (e.isIntersecting) next.add(n);
            else next.delete(n);
          });
          return next;
        });
      },
      { root: vp, rootMargin: '300px 0px', threshold: 0 },
    );

    Object.values(slideRefs.current).forEach((el) => {
      if (el) { curObs.observe(el); visObs.observe(el); }
    });

    return () => { curObs.disconnect(); visObs.disconnect(); };
  }, [viewMode, slides.length, renderedSlideW]);

  /* ── scroll-to-slide ────────────────────────────────── */
  const scrollToSlide = useCallback((n) => {
    const el = slideRefs.current[n];
    if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, []);

  const handleSlideChange = useCallback((n) => {
    if (n < 1 || n > (totalSlides || slides.length)) return;
    setCurrentSlide(n);
    if (viewMode === 'document') scrollToSlide(n);
  }, [totalSlides, slides.length, viewMode, scrollToSlide]);

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
  const handleFitSlide = useCallback(() => setZoomPct(Math.round(fitSlideScale * 100)), [fitSlideScale]);
  const handleActualSize = useCallback(() => setZoomPct(100), []);

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

      if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); handleZoomIn(); }
      if (mod && e.key === '-') { e.preventDefault(); handleZoomOut(); }
      if (mod && e.key === '0') { e.preventDefault(); handleFitWidth(); }

      if (viewMode === 'single') {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault(); handleSlideChange(currentSlide + 1);
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault(); handleSlideChange(currentSlide - 1);
        }
      }

      if (e.key === 'PageDown') { e.preventDefault(); handleSlideChange(currentSlide + 1); }
      if (e.key === 'PageUp') { e.preventDefault(); handleSlideChange(currentSlide - 1); }
      if (e.key === 'Home' && mod) { e.preventDefault(); handleSlideChange(1); }
      if (e.key === 'End' && mod) { e.preventDefault(); handleSlideChange(totalSlides || slides.length); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleZoomIn, handleZoomOut, handleFitWidth, handleSlideChange, currentSlide, viewMode, totalSlides, slides.length]);

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

  /* ── lazy rendering set ─────────────────────────────── */
  const slidesToRender = useMemo(() => {
    if (viewMode === 'single') return new Set([currentSlide]);
    const s = new Set();
    visibleSlides.forEach((n) => {
      for (let d = -2; d <= 2; d++) {
        const p = n + d;
        if (p >= 1 && p <= slides.length) s.add(p);
      }
    });
    if (s.size === 0 && slides.length > 0) s.add(1);
    return s;
  }, [visibleSlides, slides.length, viewMode, currentSlide]);

  /* ── placeholder height ─────────────────────────────── */
  const placeholderH = Math.round(renderedSlideW * SLIDE_ASPECT);

  const hasSlides = slides.length > 0;

  /* ── Mobile: delegate to MobilePptxViewer ─────────── */
  if (isMobile) {
    return (
      <MobilePptxViewer
        document={doc}
        version={version}
        filename={doc?.filename}
        onClose={() => window.history.back()}
      />
    );
  }

  /* ── render ─────────────────────────────────────────── */
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
      {hasSlides && (
        <PptxSidebar
          open={sidebarOpen}
          slides={slides}
          currentSlide={currentSlide}
          onSlideClick={handleSlideChange}
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
        {hasSlides && (
          <PptxFloatingControls
            currentSlide={currentSlide}
            totalSlides={totalSlides || slides.length}
            zoom={scale}
            fitMode={fitMode}
            viewMode={viewMode}
            onSlideChange={handleSlideChange}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onFitWidth={handleFitWidth}
            onFitSlide={handleFitSlide}
            onActualSize={handleActualSize}
            onToggleViewMode={setViewMode}
            onToggleFullscreen={handleToggleFullscreen}
            onToggleSidebar={() => setSidebarOpen((o) => !o)}
            sidebarOpen={sidebarOpen}
          />
        )}

        {/* Loading state */}
        {loading && !hasSlides && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: `${VIEWPORT_PAD_Y}px ${VIEWPORT_PAD_X}px`, gap: SLIDE_GAP,
            minHeight: '100%',
          }}>
            {Array.from({ length: 3 }, (_, i) => (
              <div
                key={i}
                style={{
                  width: Math.min(renderedSlideW, viewportW ? viewportW - VIEWPORT_PAD_X * 2 : 800),
                  height: placeholderH || 450,
                  background: 'linear-gradient(110deg, #E8E8E8 30%, #DFDFDF 50%, #E8E8E8 70%)',
                  backgroundSize: '200% 100%',
                  animation: 'pptxShellShimmer 1.5s ease-in-out infinite',
                  borderRadius: 6,
                }}
              />
            ))}
            <style>{`
              @keyframes pptxShellShimmer {
                0% { background-position: 200% 0; }
                100% { background-position: -200% 0; }
              }
            `}</style>
          </div>
        )}

        {/* Error state */}
        {error && !hasSlides && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', minHeight: '100%', gap: 16, padding: 40,
          }}>
            <div style={{ fontSize: 48 }}>📊</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#32302C' }}>
              Preview unavailable
            </div>
            <div style={{ fontSize: 13, color: '#6C6B6E', textAlign: 'center', maxWidth: 320 }}>
              {error}
            </div>
            <button
              onClick={refetch}
              style={{
                padding: '8px 20px', background: '#111827', color: 'white',
                borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Document mode: vertical stack */}
        {hasSlides && viewMode === 'document' && (
          <div
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              padding: `${VIEWPORT_PAD_Y}px ${VIEWPORT_PAD_X}px`,
              gap: SLIDE_GAP, minHeight: '100%',
            }}
          >
            {slides.map((slide, i) => {
              const n = i + 1;
              const shouldRender = slidesToRender.has(n);
              return (
                <div
                  key={n}
                  data-slide-number={n}
                  ref={(el) => { slideRefs.current[n] = el; }}
                >
                  {shouldRender ? (
                    <PptxSlideCard
                      slide={slide}
                      slideNumber={n}
                      width={renderedSlideW}
                    />
                  ) : (
                    <div
                      style={{
                        width: renderedSlideW,
                        height: placeholderH,
                        background: '#FAFAFA',
                        borderRadius: 6,
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Single mode: one slide centered */}
        {hasSlides && viewMode === 'single' && (
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              minHeight: '100%', padding: VIEWPORT_PAD_Y,
            }}
          >
            {slides[currentSlide - 1] ? (
              <PptxSlideCard
                slide={slides[currentSlide - 1]}
                slideNumber={currentSlide}
                width={renderedSlideW}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
