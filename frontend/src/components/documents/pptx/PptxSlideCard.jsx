import React, { useState } from 'react';

const ASPECT = 9 / 16; // 16:9 default

/**
 * Renders a single slide as a card with shadow, aspect ratio, and slide number badge.
 *
 * @param {object}  slide       — { slideNumber, hasImage, imageUrl, content }
 * @param {number}  slideNumber — 1-indexed
 * @param {number}  width       — rendered card width in px
 * @param {function} onImageLoad — called with { naturalWidth, naturalHeight } on first load
 */
export default function PptxSlideCard({ slide, slideNumber, width, onImageLoad }) {
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  const height = Math.round(width * ASPECT);

  const hasImage = slide?.hasImage && slide?.imageUrl && !imgError;

  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        background: '#FFFFFF',
        borderRadius: 6,
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Slide number badge */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          zIndex: 2,
          background: 'rgba(0,0,0,0.55)',
          color: '#FFFFFF',
          fontSize: 11,
          fontWeight: 700,
          fontFamily: 'Plus Jakarta Sans, sans-serif',
          padding: '2px 7px',
          borderRadius: 4,
          lineHeight: '16px',
          pointerEvents: 'none',
        }}
      >
        {slideNumber}
      </div>

      {hasImage ? (
        <>
          <img
            src={slide.imageUrl}
            alt={`Slide ${slideNumber}`}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: imgLoaded ? 'block' : 'none',
            }}
            onLoad={(e) => {
              setImgLoaded(true);
              if (e.target.naturalWidth && e.target.naturalHeight) {
                onImageLoad?.({
                  naturalWidth: e.target.naturalWidth,
                  naturalHeight: e.target.naturalHeight,
                });
              }
            }}
            onError={() => setImgError(true)}
          />
          {/* Skeleton while loading */}
          {!imgLoaded && (
            <div
              style={{
                width: '100%',
                height: '100%',
                background: 'linear-gradient(110deg, #F5F5F5 30%, #EBEBEB 50%, #F5F5F5 70%)',
                backgroundSize: '200% 100%',
                animation: 'pptxShimmer 1.5s ease-in-out infinite',
              }}
            />
          )}
        </>
      ) : slide?.content ? (
        /* Text fallback */
        <div
          style={{
            width: '100%',
            height: '100%',
            padding: 24,
            display: 'flex',
            alignItems: 'flex-start',
            overflow: 'hidden',
          }}
        >
          <pre
            style={{
              margin: 0,
              fontSize: 13,
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              lineHeight: 1.6,
              color: '#32302C',
              whiteSpace: 'pre-wrap',
              wordWrap: 'break-word',
              overflow: 'hidden',
            }}
          >
            {slide.content}
          </pre>
        </div>
      ) : (
        /* Empty / generating placeholder */
        <div
          style={{
            width: '100%',
            height: '100%',
            background: '#FAFAFA',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#9CA3AF',
            fontSize: 13,
            fontWeight: 600,
            fontFamily: 'Plus Jakarta Sans, sans-serif',
          }}
        >
          {imgError ? 'Image failed to load' : 'Generating…'}
        </div>
      )}

      {/* Shimmer keyframes */}
      <style>{`
        @keyframes pptxShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
