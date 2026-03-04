import React, { forwardRef, useCallback, useEffect, useRef } from 'react';

/**
 * PAGE_CONTENT_HEIGHT = page height (1056 px) minus vertical margins (96 × 2 = 192 px).
 * Used for page-number estimation from scroll position.
 */
const PAGE_CONTENT_HEIGHT = 864;

/**
 * Scrollable gray canvas that contains the paper.
 * Applies zoom via CSS transform (same approach as the existing viewer).
 */
const DocViewport = forwardRef(function DocViewport(
  { zoom, onPageChange, onScroll: externalOnScroll, children },
  ref,
) {
  const innerRef = useRef(null);
  const contentRef = useRef(null);

  // Expose the scroll element via forwarded ref
  const scrollEl = (el) => {
    innerRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };

  const computePageInfo = useCallback(() => {
    const el = innerRef.current;
    const content = contentRef.current;
    if (!el || !content) return;

    const scrollTop = el.scrollTop;
    const contentHeight = content.scrollHeight;

    const total = Math.max(1, Math.ceil(contentHeight / PAGE_CONTENT_HEIGHT));
    const current = Math.min(total, Math.floor(scrollTop / PAGE_CONTENT_HEIGHT) + 1);
    onPageChange?.(current, total);
  }, [onPageChange]);

  // Track content size changes for total page count
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const ro = new ResizeObserver(() => computePageInfo());
    ro.observe(content);
    return () => ro.disconnect();
  }, [computePageInfo]);

  const handleScroll = useCallback((e) => {
    computePageInfo();
    externalOnScroll?.(e);
  }, [computePageInfo, externalOnScroll]);

  const scale = Math.max(0.5, Math.min(2, Number(zoom || 100) / 100));

  return (
    <div
      ref={scrollEl}
      onScroll={handleScroll}
      style={{
        width: '100%',
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: '#F1F0EF',
        padding: '48px 24px',
        position: 'relative',
        WebkitOverflowScrolling: 'touch',
        scrollbarGutter: 'stable',
        borderTop: '1px solid #E6E6EC',
      }}
    >
      <div
        ref={contentRef}
        style={{
          width: `${100 / scale}%`,
          maxWidth: `${816 / scale + 48}px`,
          transform: `scale(${scale})`,
          transformOrigin: 'top center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        {children}
      </div>
    </div>
  );
});

export default DocViewport;
