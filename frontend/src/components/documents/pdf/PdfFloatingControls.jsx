import React, { useRef, useState } from 'react';

const btn = (active = false) => ({
  width: 32, height: 32, minWidth: 40, minHeight: 40,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: active ? '#111827' : 'none', color: active ? '#FFFFFF' : '#32302C',
  border: 'none', borderRadius: 6, cursor: 'pointer', padding: 0, flexShrink: 0,
  fontSize: 12, fontWeight: 600, fontFamily: 'Plus Jakarta Sans, sans-serif',
});

const sep = { width: 1, height: 18, background: '#E6E6EC', margin: '0 2px', flexShrink: 0 };

export default function PdfFloatingControls({
  currentPage, numPages,
  zoom, fitMode,
  onPageChange, onZoomIn, onZoomOut, onZoomSet,
  onFitWidth, onFitPage, onActualSize,
  onRotateLeft, onRotateRight,
  onToggleFullscreen, onToggleSidebar,
  sidebarOpen,
}) {
  const [pageInput, setPageInput] = useState('');
  const [editing, setEditing] = useState(false);
  const inputRef = useRef(null);

  const handlePageSubmit = (e) => {
    e.preventDefault();
    const n = parseInt(pageInput, 10);
    if (n >= 1 && n <= numPages) onPageChange?.(n);
    setEditing(false);
    setPageInput('');
  };

  const zoomPct = Math.round(zoom * 100);

  return (
    <div
      style={{
        position: 'absolute', top: 10, right: 14, zIndex: 10,
        display: 'flex', alignItems: 'center', gap: 2,
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        borderRadius: 10, padding: '3px 6px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        userSelect: 'none',
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {/* Sidebar toggle */}
      <button
        type="button" title="Toggle thumbnails" aria-label="Toggle thumbnails"
        style={btn(sidebarOpen)}
        onClick={onToggleSidebar}
        onMouseDown={(e) => e.preventDefault()}
        onMouseEnter={(e) => { if (!sidebarOpen) e.currentTarget.style.background = '#F5F5F5'; }}
        onMouseLeave={(e) => { if (!sidebarOpen) e.currentTarget.style.background = 'none'; }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <rect x="1.5" y="2" width="4" height="12" rx="1" stroke="currentColor" strokeWidth="1.3" fill={sidebarOpen ? 'currentColor' : 'none'} opacity={sidebarOpen ? 0.3 : 1} />
          <rect x="7.5" y="2" width="7" height="12" rx="1" stroke="currentColor" strokeWidth="1.3" fill="none" />
        </svg>
      </button>

      <div style={sep} />

      {/* Page navigation */}
      <button
        type="button" title="Previous page" aria-label="Previous page"
        style={{ ...btn(), opacity: currentPage <= 1 ? 0.3 : 1 }}
        disabled={currentPage <= 1}
        onClick={() => onPageChange?.(currentPage - 1)}
        onMouseDown={(e) => e.preventDefault()}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>

      {editing ? (
        <form onSubmit={handlePageSubmit} style={{ display: 'flex' }}>
          <input
            ref={inputRef}
            type="text"
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ''))}
            onBlur={() => { setEditing(false); setPageInput(''); }}
            autoFocus
            style={{
              width: 36, height: 24, textAlign: 'center',
              border: '1px solid #E6E6EC', borderRadius: 4,
              fontSize: 12, fontWeight: 600, fontFamily: 'Plus Jakarta Sans, sans-serif',
              outline: 'none', padding: 0, background: '#FFFFFF', color: '#32302C',
            }}
          />
        </form>
      ) : (
        <button
          type="button" title="Go to page" aria-label="Go to page"
          onClick={() => { setEditing(true); setPageInput(String(currentPage)); }}
          style={{ ...btn(), minWidth: 'auto', width: 'auto', padding: '0 4px', cursor: 'text' }}
        >
          <span style={{ fontSize: 12, fontWeight: 600 }}>{currentPage}</span>
          <span style={{ fontSize: 11, fontWeight: 400, color: '#9CA3AF', marginLeft: 2 }}>/ {numPages}</span>
        </button>
      )}

      <button
        type="button" title="Next page" aria-label="Next page"
        style={{ ...btn(), opacity: currentPage >= numPages ? 0.3 : 1 }}
        disabled={currentPage >= numPages}
        onClick={() => onPageChange?.(currentPage + 1)}
        onMouseDown={(e) => e.preventDefault()}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>

      <div style={sep} />

      {/* Zoom controls */}
      <button
        type="button" title="Zoom out (Ctrl+-)" aria-label="Zoom out"
        style={{ ...btn(), opacity: zoomPct <= 25 ? 0.3 : 1 }}
        disabled={zoomPct <= 25}
        onClick={onZoomOut} onMouseDown={(e) => e.preventDefault()}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 8H12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      </button>

      <div style={{ minWidth: 40, textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#32302C', cursor: 'default' }}>
        {zoomPct}%
      </div>

      <button
        type="button" title="Zoom in (Ctrl+=)" aria-label="Zoom in"
        style={{ ...btn(), opacity: zoomPct >= 500 ? 0.3 : 1 }}
        disabled={zoomPct >= 500}
        onClick={onZoomIn} onMouseDown={(e) => e.preventDefault()}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 4V12M4 8H12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      </button>

      <div style={sep} />

      {/* Fit modes */}
      <button
        type="button" title="Fit width" aria-label="Fit width"
        style={btn(fitMode === 'width')}
        onClick={onFitWidth} onMouseDown={(e) => e.preventDefault()}
        onMouseEnter={(e) => { if (fitMode !== 'width') e.currentTarget.style.background = '#F5F5F5'; }}
        onMouseLeave={(e) => { if (fitMode !== 'width') e.currentTarget.style.background = 'none'; }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M2 4V12M14 4V12M5 8H11M5 6L3 8L5 10M11 6L13 8L11 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <button
        type="button" title="Fit page" aria-label="Fit page"
        style={btn(fitMode === 'page')}
        onClick={onFitPage} onMouseDown={(e) => e.preventDefault()}
        onMouseEnter={(e) => { if (fitMode !== 'page') e.currentTarget.style.background = '#F5F5F5'; }}
        onMouseLeave={(e) => { if (fitMode !== 'page') e.currentTarget.style.background = 'none'; }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <rect x="3" y="2" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.3" fill="none" />
          <path d="M5 6H11M5 8.5H9" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
        </svg>
      </button>

      <button
        type="button" title="Actual size (100%)" aria-label="Actual size"
        style={btn(fitMode === 'actual')}
        onClick={onActualSize} onMouseDown={(e) => e.preventDefault()}
        onMouseEnter={(e) => { if (fitMode !== 'actual') e.currentTarget.style.background = '#F5F5F5'; }}
        onMouseLeave={(e) => { if (fitMode !== 'actual') e.currentTarget.style.background = 'none'; }}
      >
        1:1
      </button>

      <div style={sep} />

      {/* Rotate */}
      <button
        type="button" title="Rotate left" aria-label="Rotate left"
        style={btn()}
        onClick={onRotateLeft} onMouseDown={(e) => e.preventDefault()}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M2 7C2 4.23858 4.23858 2 7 2H9C11.7614 2 14 4.23858 14 7V9C14 11.7614 11.7614 14 9 14H7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M5 5L2 7L5 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <button
        type="button" title="Rotate right" aria-label="Rotate right"
        style={btn()}
        onClick={onRotateRight} onMouseDown={(e) => e.preventDefault()}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ transform: 'scaleX(-1)' }}>
          <path d="M2 7C2 4.23858 4.23858 2 7 2H9C11.7614 2 14 4.23858 14 7V9C14 11.7614 11.7614 14 9 14H7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M5 5L2 7L5 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div style={sep} />

      {/* Fullscreen */}
      <button
        type="button" title="Fullscreen" aria-label="Fullscreen"
        style={btn()}
        onClick={onToggleFullscreen} onMouseDown={(e) => e.preventDefault()}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M2 5.5V3C2 2.44772 2.44772 2 3 2H5.5M10.5 2H13C13.5523 2 14 2.44772 14 3V5.5M14 10.5V13C14 13.5523 13.5523 14 13 14H10.5M5.5 14H3C2.44772 14 2 13.5523 2 13V10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
