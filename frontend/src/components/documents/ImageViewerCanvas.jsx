import React, { useCallback, useEffect, useRef, useState } from 'react';

const ZOOM_STEPS = [25, 33, 50, 67, 75, 100, 125, 150, 200, 300, 400, 500];
const MIN_ZOOM = 10;
const MAX_ZOOM = 500;
const WHEEL_FACTOR = 0.002;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function nearestStep(z, dir) {
  if (dir > 0) {
    for (const s of ZOOM_STEPS) { if (s > z + 0.5) return s; }
    return MAX_ZOOM;
  }
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) { if (ZOOM_STEPS[i] < z - 0.5) return ZOOM_STEPS[i]; }
  return MIN_ZOOM;
}

/**
 * Full-featured image viewer with fit-to-screen, zoom, pan, and floating controls.
 *
 * Props:
 *   src, alt, loading, error, onLoad, onError, retryNode, isPng
 */
export default function ImageViewerCanvas({ src, alt, loading, error, onLoad, onError, retryNode, isPng }) {
  const containerRef = useRef(null);
  const imgRef = useRef(null);

  // 0 = "fit to screen" sentinel; positive = explicit zoom %
  const [zoomPct, setZoomPct] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const [naturalSize, setNaturalSize] = useState(null);
  const [checkerboard, setCheckerboard] = useState(false);
  const [hoverControls, setHoverControls] = useState(false);

  // Compute the "fit" zoom level
  const fitZoom = useCallback(() => {
    const c = containerRef.current;
    if (!c || !naturalSize) return 100;
    const pad = 32;
    const cw = c.clientWidth - pad * 2;
    const ch = c.clientHeight - pad * 2;
    if (cw <= 0 || ch <= 0) return 100;
    const scale = Math.min(cw / naturalSize.w, ch / naturalSize.h, 1);
    return Math.round(scale * 100);
  }, [naturalSize]);

  const effectiveZoom = zoomPct === 0 ? fitZoom() : zoomPct;

  // Reset pan when switching to fit mode
  useEffect(() => { if (zoomPct === 0) setPan({ x: 0, y: 0 }); }, [zoomPct]);

  // Recalculate fit on resize
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const ro = new ResizeObserver(() => { if (zoomPct === 0) setPan({ x: 0, y: 0 }); });
    ro.observe(c);
    return () => ro.disconnect();
  }, [zoomPct]);

  const handleImageLoad = useCallback((e) => {
    const img = e.target;
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    onLoad?.(e);
  }, [onLoad]);

  // -- Zoom helpers --
  const zoomTo = useCallback((nextRaw, center) => {
    const next = clamp(Math.round(nextRaw), MIN_ZOOM, MAX_ZOOM);
    const prev = zoomPct === 0 ? fitZoom() : zoomPct;
    if (next === prev && zoomPct !== 0) return;

    // Zoom toward the pointer position
    if (center && containerRef.current && naturalSize) {
      const c = containerRef.current;
      const rect = c.getBoundingClientRect();
      const cx = center.x - rect.left - c.clientWidth / 2;
      const cy = center.y - rect.top - c.clientHeight / 2;
      const ratio = next / prev;
      setPan((p) => ({
        x: cx - ratio * (cx - p.x),
        y: cy - ratio * (cy - p.y),
      }));
    }
    setZoomPct(next);
  }, [zoomPct, fitZoom, naturalSize]);

  const stepZoom = useCallback((dir) => {
    const cur = zoomPct === 0 ? fitZoom() : zoomPct;
    zoomTo(nearestStep(cur, dir));
  }, [zoomPct, fitZoom, zoomTo]);

  const toggleFitActual = useCallback(() => {
    if (zoomPct === 0) {
      zoomTo(100);
    } else {
      setZoomPct(0);
      setPan({ x: 0, y: 0 });
    }
  }, [zoomPct, zoomTo]);

  // -- Wheel zoom --
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const cur = zoomPct === 0 ? fitZoom() : zoomPct;
      const delta = -e.deltaY * WHEEL_FACTOR * cur;
      zoomTo(cur + delta, { x: e.clientX, y: e.clientY });
    };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, [zoomPct, fitZoom, zoomTo]);

  // -- Keyboard shortcuts --
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
      const meta = e.metaKey || e.ctrlKey;
      if (meta && (e.key === '=' || e.key === '+')) { e.preventDefault(); stepZoom(1); }
      else if (meta && e.key === '-') { e.preventDefault(); stepZoom(-1); }
      else if (meta && e.key === '0') { e.preventDefault(); setZoomPct(0); setPan({ x: 0, y: 0 }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stepZoom]);

  // -- Drag to pan --
  const onPointerDown = useCallback((e) => {
    if (zoomPct === 0) return;
    if (e.button !== 0) return;
    e.preventDefault();
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [zoomPct, pan]);

  const onPointerMove = useCallback((e) => {
    if (!dragging) return;
    setPan({
      x: dragStart.current.px + (e.clientX - dragStart.current.x),
      y: dragStart.current.py + (e.clientY - dragStart.current.y),
    });
  }, [dragging]);

  const onPointerUp = useCallback(() => { setDragging(false); }, []);

  // -- Fullscreen --
  const toggleFullscreen = useCallback(() => {
    const c = containerRef.current;
    if (!c) return;
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      c.requestFullscreen?.();
    }
  }, []);

  // -- Render --
  const scale = effectiveZoom / 100;
  const isPannable = zoomPct !== 0;

  const checkerboardBg = 'repeating-conic-gradient(#e0e0e0 0% 25%, transparent 0% 50%) 0 0 / 16px 16px';

  // Floating control button style
  const ctrlBtn = (title, active = false) => ({
    width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: active ? '#111827' : 'none', color: active ? '#FFFFFF' : '#32302C',
    border: 'none', borderRadius: 6, cursor: 'pointer', padding: 0, flexShrink: 0,
    fontSize: 13, fontWeight: 600, fontFamily: 'Plus Jakarta Sans, sans-serif',
  });

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      onDoubleClick={toggleFitActual}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        width: '100%', flex: 1, minHeight: 0, minWidth: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', overflow: 'hidden',
        background: '#F1F0EF',
        cursor: isPannable ? (dragging ? 'grabbing' : 'grab') : 'default',
        outline: 'none',
        borderTop: '1px solid #E6E6EC',
      }}
    >
      {/* Loading placeholder */}
      {loading && !error ? (
        <div style={{ color: '#6C6B6E', fontSize: 14, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          Loading image…
        </div>
      ) : null}

      {/* Error state */}
      {error ? retryNode : null}

      {/* Image */}
      {!error ? (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          onLoad={handleImageLoad}
          onError={onError}
          draggable={false}
          style={{
            position: 'absolute',
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            maxWidth: 'none', maxHeight: 'none',
            borderRadius: zoomPct === 0 ? 4 : 0,
            boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
            background: checkerboard ? checkerboardBg : '#FFFFFF',
            transition: dragging ? 'none' : 'transform 0.15s ease',
            display: loading ? 'none' : 'block',
            userSelect: 'none',
            WebkitUserDrag: 'none',
          }}
        />
      ) : null}

      {/* Floating controls */}
      {!loading && !error && naturalSize ? (
        <div
          onMouseEnter={() => setHoverControls(true)}
          onMouseLeave={() => setHoverControls(false)}
          style={{
            position: 'absolute', top: 12, right: 12,
            display: 'flex', alignItems: 'center', gap: 2,
            background: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
            borderRadius: 10, padding: '4px 6px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)',
            opacity: hoverControls ? 1 : 0.7,
            transition: 'opacity 0.15s ease',
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            userSelect: 'none',
            zIndex: 5,
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {/* Zoom out */}
          <button
            type="button" title="Zoom out (Ctrl+-)" aria-label="Zoom out"
            style={ctrlBtn()} disabled={effectiveZoom <= MIN_ZOOM}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => stepZoom(-1)}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 8H12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>

          {/* Zoom display */}
          <div style={{ minWidth: 44, textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#32302C', cursor: 'default' }}>
            {effectiveZoom}%
          </div>

          {/* Zoom in */}
          <button
            type="button" title="Zoom in (Ctrl+=)" aria-label="Zoom in"
            style={ctrlBtn()} disabled={effectiveZoom >= MAX_ZOOM}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => stepZoom(1)}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 4V12M4 8H12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>

          <div style={{ width: 1, height: 18, background: '#E6E6EC', margin: '0 4px' }} />

          {/* Fit */}
          <button
            type="button" title="Fit to screen (Ctrl+0)" aria-label="Fit to screen"
            style={ctrlBtn('Fit', zoomPct === 0)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setZoomPct(0); setPan({ x: 0, y: 0 }); }}
            onMouseEnter={(e) => { if (zoomPct !== 0) e.currentTarget.style.background = '#F5F5F5'; }}
            onMouseLeave={(e) => { if (zoomPct !== 0) e.currentTarget.style.background = 'none'; }}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <path d="M5 8H11M8 5V11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
            </svg>
          </button>

          {/* 1:1 */}
          <button
            type="button" title="Actual size (100%)" aria-label="Actual size"
            style={ctrlBtn('1:1', zoomPct === 100)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { zoomTo(100); }}
            onMouseEnter={(e) => { if (zoomPct !== 100) e.currentTarget.style.background = '#F5F5F5'; }}
            onMouseLeave={(e) => { if (zoomPct !== 100) e.currentTarget.style.background = 'none'; }}
          >
            1:1
          </button>

          <div style={{ width: 1, height: 18, background: '#E6E6EC', margin: '0 4px' }} />

          {/* Checkerboard toggle (PNG) */}
          {isPng ? (
            <button
              type="button" title="Toggle transparency grid" aria-label="Toggle transparency grid"
              style={ctrlBtn('', checkerboard)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setCheckerboard((v) => !v)}
              onMouseEnter={(e) => { if (!checkerboard) e.currentTarget.style.background = '#F5F5F5'; }}
              onMouseLeave={(e) => { if (!checkerboard) e.currentTarget.style.background = 'none'; }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="1" width="6" height="6" fill={checkerboard ? '#FFFFFF' : '#9CA3AF'} stroke="none" />
                <rect x="7" y="1" width="6" height="6" fill={checkerboard ? '#FFFFFF' : '#D1D5DB'} stroke="none" />
                <rect x="1" y="7" width="6" height="6" fill={checkerboard ? '#FFFFFF' : '#D1D5DB'} stroke="none" />
                <rect x="7" y="7" width="6" height="6" fill={checkerboard ? '#FFFFFF' : '#9CA3AF'} stroke="none" />
                <rect x="1" y="1" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
              </svg>
            </button>
          ) : null}

          {/* Fullscreen */}
          <button
            type="button" title="Fullscreen" aria-label="Toggle fullscreen"
            style={ctrlBtn()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={toggleFullscreen}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 5.5V3C2 2.44772 2.44772 2 3 2H5.5M10.5 2H13C13.5523 2 14 2.44772 14 3V5.5M14 10.5V13C14 13.5523 13.5523 14 13 14H10.5M5.5 14H3C2.44772 14 2 13.5523 2 13V10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ) : null}

      {/* Dimensions badge (bottom-right, subtle) */}
      {!loading && !error && naturalSize ? (
        <div style={{
          position: 'absolute', bottom: 10, right: 12,
          fontSize: 11, fontWeight: 500, color: '#9CA3AF',
          fontFamily: 'Plus Jakarta Sans, sans-serif',
          userSelect: 'none', pointerEvents: 'none',
        }}>
          {naturalSize.w} × {naturalSize.h}
        </div>
      ) : null}
    </div>
  );
}
