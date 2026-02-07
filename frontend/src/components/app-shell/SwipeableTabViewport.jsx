/**
 * SwipeableTabViewport
 *
 * A viewport component that enables native-feeling swipe navigation between tabs.
 * Uses a "peek" approach - during swipe, shows a visual preview of adjacent tab.
 *
 * Architecture:
 * - Current tab content is rendered normally via React Router
 * - During swipe, the viewport transforms and shows a gradient/preview of the next tab
 * - On navigation complete, React Router renders the new content
 *
 * This approach avoids:
 * - Double-rendering full tab components
 * - Complex route state management
 * - Memory issues from keeping multiple heavy tabs mounted
 */

import React, { useRef, useEffect, useCallback, useState, memo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useTabSwipeNavigation, SWIPE_CONFIG } from '../../hooks/useTabSwipeNavigation';
import {
  getTabIndexFromPath,
  getTabByIndex,
  isTabRoot,
  FIRST_TAB_INDEX,
  LAST_TAB_INDEX,
} from '../../config/tabConfig';

// Scroll position storage (persists per tab)
const scrollPositions = new Map();

/**
 * Save scroll position for current tab
 */
function saveScrollPosition(tabIndex) {
  if (tabIndex === -1) return;

  // Find the main scrollable element
  const scrollEl = document.querySelector('[data-scroll-container]') ||
                   document.querySelector('.page-content') ||
                   document.scrollingElement;

  if (scrollEl) {
    const scrollTop = scrollEl === document.scrollingElement
      ? window.scrollY
      : scrollEl.scrollTop;
    scrollPositions.set(tabIndex, scrollTop);
  }
}

/**
 * Restore scroll position for a tab
 */
function restoreScrollPosition(tabIndex) {
  if (tabIndex === -1) return;

  const savedPosition = scrollPositions.get(tabIndex) ?? 0;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const scrollEl = document.querySelector('[data-scroll-container]') ||
                       document.querySelector('.page-content') ||
                       document.scrollingElement;

      if (scrollEl) {
        if (scrollEl === document.scrollingElement) {
          window.scrollTo({ top: savedPosition, behavior: 'instant' });
        } else {
          scrollEl.scrollTop = savedPosition;
        }
      }
    });
  });
}

/**
 * Tab preview panel - shows a hint of adjacent content
 */
const TabPreviewPanel = memo(function TabPreviewPanel({ tabConfig, position, opacity }) {
  if (!tabConfig) return null;

  return (
    <div
      className="swipe-tab-preview"
      style={{
        position: 'absolute',
        top: 0,
        [position]: 0,
        width: '100%',
        height: '100%',
        backgroundColor: '#121212',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: Math.min(opacity, 0.95),
        pointerEvents: 'none',
        zIndex: 1,
      }}
    >
      {/* Subtle loading indicator */}
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          border: '2px solid rgba(255,255,255,0.15)',
          borderTopColor: 'rgba(255,255,255,0.5)',
          animation: opacity > 0.3 ? 'swipe-spinner 0.8s linear infinite' : 'none',
        }}
      />
      <div
        style={{
          marginTop: 12,
          fontSize: 13,
          color: 'rgba(255,255,255,0.6)',
          fontWeight: 500,
        }}
      >
        {tabConfig.id.charAt(0).toUpperCase() + tabConfig.id.slice(1)}
      </div>
    </div>
  );
});

/**
 * Main SwipeableTabViewport component
 */
function SwipeableTabViewport({ children }) {
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const viewportRef = useRef(null);
  const contentRef = useRef(null);

  // Track previous tab for scroll restoration
  const prevTabIndexRef = useRef(-1);

  // Get current tab info
  const currentTabIndex = getTabIndexFromPath(location.pathname);
  const onTabRoot = isTabRoot(location.pathname);

  // Get swipe state from hook
  const {
    swipeState,
    prefersReducedMotion,
  } = useTabSwipeNavigation({
    enabled: isMobile && onTabRoot && currentTabIndex !== -1,
    onSwipeStart: useCallback(() => {
      saveScrollPosition(currentTabIndex);
    }, [currentTabIndex]),
    onSwipeEnd: useCallback((targetTabIndex) => {
      if (targetTabIndex !== null) {
        // Delay scroll restoration to after route change
        setTimeout(() => {
          restoreScrollPosition(targetTabIndex);
        }, 100);
      }
    }, []),
  });

  // Handle scroll restoration on route change
  useEffect(() => {
    const prevIndex = prevTabIndexRef.current;
    const newIndex = currentTabIndex;

    if (prevIndex !== newIndex && newIndex !== -1) {
      // Restore scroll for new tab
      restoreScrollPosition(newIndex);
    }

    prevTabIndexRef.current = newIndex;
  }, [currentTabIndex, location.pathname]);

  // Desktop: pass through
  if (!isMobile) {
    return children;
  }

  // Extract state
  const { isActive, offset, direction, targetTabIndex, isSettling } = swipeState;

  // Get adjacent tab info for preview
  const adjacentTab = targetTabIndex !== null ? getTabByIndex(targetTabIndex) : null;

  // Calculate preview opacity based on drag progress
  const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 375;
  const dragProgress = Math.abs(offset) / screenWidth;
  const previewOpacity = Math.min(dragProgress * 2, 1);

  // Calculate transform
  const transform = isActive ? `translate3d(${offset}px, 0, 0)` : 'translate3d(0, 0, 0)';

  // Calculate transition
  const transition = isSettling
    ? `transform ${SWIPE_CONFIG.SETTLE_DURATION}ms cubic-bezier(0.32, 0.72, 0, 1)`
    : isActive
      ? 'none'
      : 'transform 0.15s ease-out';

  return (
    <div
      ref={viewportRef}
      className="swipe-viewport"
      data-swiping={isActive}
      data-settling={isSettling}
      data-reduced-motion={prefersReducedMotion}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        // Prevent iOS rubber banding during swipe
        overscrollBehavior: isActive ? 'none' : 'auto',
      }}
    >
      {/* Adjacent tab preview (behind main content) */}
      {isActive && adjacentTab && (
        <TabPreviewPanel
          tabConfig={adjacentTab}
          position={direction === 'left' ? 'right' : 'left'}
          opacity={previewOpacity}
        />
      )}

      {/* Main content container */}
      <div
        ref={contentRef}
        className="swipe-content"
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          backgroundColor: '#121212', // Match app background
          transform,
          transition,
          willChange: isActive ? 'transform' : 'auto',
          zIndex: 2,
          // Add subtle shadow during swipe
          boxShadow: isActive && Math.abs(offset) > 20
            ? `${offset > 0 ? '' : '-'}8px 0 24px rgba(0,0,0,0.4)`
            : 'none',
        }}
      >
        {children}
      </div>

      {/* Edge indicators (subtle) */}
      {isActive && (
        <>
          {/* Left edge glow when swiping right */}
          {direction === 'right' && offset > 20 && currentTabIndex > FIRST_TAB_INDEX && (
            <div
              className="swipe-edge-indicator left"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: 4,
                height: '100%',
                background: `linear-gradient(to right, rgba(255,255,255,${Math.min(offset / 200, 0.15)}), transparent)`,
                zIndex: 10,
                pointerEvents: 'none',
              }}
            />
          )}

          {/* Right edge glow when swiping left */}
          {direction === 'left' && offset < -20 && currentTabIndex < LAST_TAB_INDEX && (
            <div
              className="swipe-edge-indicator right"
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                width: 4,
                height: '100%',
                background: `linear-gradient(to left, rgba(255,255,255,${Math.min(Math.abs(offset) / 200, 0.15)}), transparent)`,
                zIndex: 10,
                pointerEvents: 'none',
              }}
            />
          )}
        </>
      )}

      {/* Reduced motion indicator */}
      {prefersReducedMotion && isActive && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            padding: '12px 24px',
            backgroundColor: 'rgba(0,0,0,0.8)',
            borderRadius: 8,
            color: 'rgba(255,255,255,0.9)',
            fontSize: 14,
            zIndex: 100,
            pointerEvents: 'none',
          }}
        >
          {direction === 'left' ? '→' : '←'} {adjacentTab?.id}
        </div>
      )}
    </div>
  );
}

export default SwipeableTabViewport;

// Export scroll position management for external use
export { saveScrollPosition, restoreScrollPosition, scrollPositions };
