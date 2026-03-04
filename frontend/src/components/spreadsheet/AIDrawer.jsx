import React, { useState, useRef, useCallback, useEffect } from 'react';

const MIN_WIDTH = 320;
const MAX_WIDTH = 520;
const DEFAULT_WIDTH = 380;
const STORAGE_KEY = 'koda_spreadsheet_ai_width';

function getStoredWidth() {
  try {
    const v = Number(localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(v) && v >= MIN_WIDTH && v <= MAX_WIDTH) return v;
  } catch {}
  return DEFAULT_WIDTH;
}

function AIDrawer({ open, width: controlledWidth, onWidthChange, onClose, children, overlayMode = false }) {
  const [localWidth] = useState(getStoredWidth);
  const width = controlledWidth ?? localWidth;
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(width);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    draggingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = width;

    const handleMouseMove = (ev) => {
      if (!draggingRef.current) return;
      const delta = startXRef.current - ev.clientX;
      const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidthRef.current + delta));
      onWidthChange?.(next);
    };

    const handleMouseUp = () => {
      draggingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      try {
        localStorage.setItem(STORAGE_KEY, String(width));
      } catch {}
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [width, onWidthChange]);

  // Persist width changes
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, String(width)); } catch {}
  }, [width]);

  if (!open) return null;

  // Overlay mode for narrow viewports
  if (overlayMode) {
    return (
      <div
        id="ai-drawer"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          maxWidth: MAX_WIDTH,
          background: 'rgba(255,255,255,0.98)',
          zIndex: 2000,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.12)',
        }}
      >
        <div style={{ flex: 1, minHeight: 0 }}>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      id="ai-drawer"
      style={{
        width,
        minWidth: MIN_WIDTH,
        maxWidth: MAX_WIDTH,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderLeft: '1px solid #E6E6EC',
        background: 'rgba(255,255,255,0.96)',
        position: 'relative',
        transition: draggingRef.current ? 'none' : 'width 250ms ease-out',
        flexShrink: 0,
      }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          position: 'absolute',
          top: 0,
          left: -2,
          bottom: 0,
          width: 4,
          cursor: 'col-resize',
          zIndex: 10,
          background: 'transparent',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(37, 99, 235, 0.3)'; }}
        onMouseLeave={(e) => { if (!draggingRef.current) e.currentTarget.style.background = 'transparent'; }}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize AI panel"
      />
      <div style={{ flex: 1, minHeight: 0 }}>
        {children}
      </div>
    </div>
  );
}

export default AIDrawer;
