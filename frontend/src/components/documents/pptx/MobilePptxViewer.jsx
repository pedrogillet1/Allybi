import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import { useTranslation } from 'react-i18next';
import MobilePreviewShell from '../MobilePreviewShell';
import PptxSlideCard from './PptxSlideCard';
import usePptxSlides from './usePptxSlides';

/* ────────────────────────── constants ────────────────────────── */
const ZOOM_STEPS = [50, 75, 100, 125, 150, 200, 300];
const GUTTER = 12;
const SLIDE_GAP = 10;
const DOUBLE_TAP_MS = 300;
const ZOOM_TOGGLE_PCT = 200;

const mobileBtnStyle = {
  width: 44, height: 44, minWidth: 44, minHeight: 44,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'none', border: 'none', borderRadius: 10,
  cursor: 'pointer', padding: 0, color: '#32302C', flexShrink: 0,
  WebkitTapHighlightColor: 'transparent',
};

/* ────────────────────────── component ────────────────────────── */

/**
 * MobilePptxViewer — mobile PPTX viewer using MobilePreviewShell.
 *
 * Mirrors MobilePdfViewer exactly:
 *  - Same shell (header, body, toolbar)
 *  - Same toolbar layout (slide nav, zoom, overflow menu)
 *  - Same fit-width zoom, double-tap zoom
 *  - Same card styling, spacing, scroll container
 *  - Lazy slide rendering via IntersectionObserver
 */
export default function MobilePptxViewer({
  document: doc,
  version = 0,
  filename = 'Presentation',
  onClose,
  onDownload,
  onShare,
}) {
  const { t } = useTranslation();
  const { slides, totalSlides, loading, error } = usePptxSlides(doc?.id, version);

  /* ── core state ─────────────────────────────────── */
  const [currentSlide, setCurrentSlide] = useState(1);
  const [zoomPct, setZoomPct] = useState(0); // 0 = fit-width
  const [containerW, setContainerW] = useState(window.innerWidth);
  const [visibleSlides, setVisibleSlides] = useState(new Set());
  const [menuOpen, setMenuOpen] = useState(false);

  const lastTapRef = useRef(0);
  const scrollRef = useRef(null);
  const slideRefs = useRef({});

  const numSlides = totalSlides || slides.length;
  const hasSlides = slides.length > 0;

  /* ── derived values ─────────────────────────────── */
  const naturalSlideW = 960;

  const fitWidthScale = useMemo(() => {
    if (!containerW) return 1;
    return Math.max(0.25, (containerW - GUTTER * 2) / naturalSlideW);
  }, [containerW]);

  const scale = zoomPct === 0 ? fitWidthScale : zoomPct / 100;
  const displayZoom = Math.round(scale * 100);
  const renderedSlideW = Math.round(naturalSlideW * scale);

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

  /* ── IntersectionObserver ───────────────────────── */
  useEffect(() => {
    if (!slides.length) return;
    const root = scrollRef.current;
    if (!root) return;

    const visObs = new IntersectionObserver(
      (entries) => {
        setVisibleSlides((prev) => {
          const next = new Set(prev);
          entries.forEach((e) => {
            const n = parseInt(e.target.getAttribute('data-slide-number'), 10);
            if (!n) return;
            e.isIntersecting ? next.add(n) : next.delete(n);
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
            const n = parseInt(e.target.getAttribute('data-slide-number'), 10);
            if (n) setCurrentSlide(n);
          }
        });
      },
      { root, rootMargin: '-45% 0px -45% 0px', threshold: 0 },
    );

    Object.values(slideRefs.current).forEach((el) => {
      if (el) { visObs.observe(el); curObs.observe(el); }
    });
    return () => { visObs.disconnect(); curObs.disconnect(); };
  }, [slides.length, renderedSlideW]);

  const slidesToRender = useMemo(() => {
    const s = new Set();
    visibleSlides.forEach((n) => {
      for (let d = -2; d <= 2; d++) {
        const p = n + d;
        if (p >= 1 && p <= slides.length) s.add(p);
      }
    });
    if (s.size === 0 && slides.length > 0) s.add(1);
    return s;
  }, [visibleSlides, slides.length]);

  /* ── navigation ─────────────────────────────────── */
  const scrollToSlide = useCallback((n) => {
    const el = slideRefs.current[n];
    if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, []);

  const handleSlideChange = useCallback((n) => {
    if (n < 1 || n > numSlides) return;
    setCurrentSlide(n);
    scrollToSlide(n);
  }, [numSlides, scrollToSlide]);

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

  /* ── placeholder height (16:9 aspect) ────────────── */
  const placeholderH = Math.round(renderedSlideW * (9 / 16));

  /* ── toolbar (identical layout to MobilePdfViewer) ── */
  const pptxToolbar = (
    <div style={{
      height: 52,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 4px',
    }}>
      <button onClick={() => handleSlideChange(currentSlide - 1)} disabled={currentSlide <= 1}
        aria-label="Previous slide" style={{ ...mobileBtnStyle, opacity: currentSlide <= 1 ? 0.3 : 1 }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      <span style={{ fontSize: 13, fontWeight: 700, color: '#32302C', minWidth: 48, textAlign: 'center', userSelect: 'none' }}>
        {currentSlide} / {numSlides || '–'}
      </span>

      <button onClick={() => handleSlideChange(currentSlide + 1)} disabled={currentSlide >= numSlides}
        aria-label="Next slide" style={{ ...mobileBtnStyle, opacity: currentSlide >= numSlides ? 0.3 : 1 }}>
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
      statusText={hasSlides ? `${numSlides} ${numSlides === 1 ? 'slide' : 'slides'}` : undefined}
      toolbar={pptxToolbar}
    >
      {/* Custom scrollable body — same structure as MobilePdfViewer */}
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
          {loading && !hasSlides && (
            <div style={{ padding: 48, fontWeight: 700, color: '#6B7280', textAlign: 'center', fontSize: 14 }}>
              Loading slides…
            </div>
          )}
          {error && !hasSlides && (
            <div style={{ padding: 48, fontWeight: 700, color: '#991B1B', textAlign: 'center', fontSize: 14 }}>
              Failed to load presentation.
            </div>
          )}
          {hasSlides && slides.map((slide, i) => {
            const n = i + 1;
            const shouldRender = slidesToRender.has(n);
            return (
              <div
                key={n}
                data-slide-number={n}
                ref={(el) => { slideRefs.current[n] = el; }}
                style={{
                  marginBottom: SLIDE_GAP,
                  background: '#FFFFFF',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                  overflow: 'hidden',
                }}
              >
                {shouldRender ? (
                  <PptxSlideCard
                    slide={slide}
                    slideNumber={n}
                    width={renderedSlideW}
                  />
                ) : (
                  <div style={{
                    width: renderedSlideW,
                    height: placeholderH,
                    background: '#FAFAFA',
                  }} />
                )}
              </div>
            );
          })}
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
