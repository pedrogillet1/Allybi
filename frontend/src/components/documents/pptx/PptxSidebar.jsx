import React, { useRef, useEffect } from 'react';

const THUMB_W = 120;
const THUMB_ASPECT = 9 / 16;

/**
 * Collapsible thumbnail sidebar for the PPTX viewer.
 *
 * Shows slide image thumbnails (or gray placeholders).
 * Highlights the current slide and auto-scrolls it into view.
 */
export default function PptxSidebar({
  open,
  slides,
  currentSlide,
  onSlideClick,
}) {
  const listRef = useRef(null);

  // Auto-scroll active thumbnail into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-thumb="${currentSlide}"]`);
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentSlide, open]);

  if (!open) return null;

  const thumbH = Math.round(THUMB_W * THUMB_ASPECT);

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
        Slides
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
        {(slides || []).map((slide, i) => {
          const pg = i + 1;
          const isActive = pg === currentSlide;
          const hasImage = slide?.hasImage && slide?.imageUrl;

          return (
            <button
              key={pg}
              type="button"
              data-thumb={pg}
              onClick={() => onSlideClick?.(pg)}
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
                  width: THUMB_W,
                  height: thumbH,
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
                {hasImage ? (
                  <img
                    src={slide.imageUrl}
                    alt={`Slide ${pg}`}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      display: 'block',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      background: '#F5F5F5',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#9CA3AF',
                      fontSize: 10,
                      fontWeight: 600,
                    }}
                  >
                    {pg}
                  </div>
                )}
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
      </div>
    </div>
  );
}
