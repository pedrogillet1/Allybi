/**
 * useTabSwipeNavigation
 *
 * A high-performance swipe gesture hook for tab navigation.
 * Implements a state machine for gesture handling with proper conflict detection.
 *
 * Features:
 * - True interactive transitions (screen follows finger)
 * - Velocity-aware release detection
 * - Rubber band effect at edges
 * - Proper gesture conflict detection (scroll, inputs, modals, edge zones)
 * - 60fps performance using refs and RAF
 * - Respects prefers-reduced-motion
 */

import { useRef, useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  getTabIndexFromPath,
  getTabPath,
  isTabRoot,
  FIRST_TAB_INDEX,
  LAST_TAB_INDEX,
} from '../config/tabConfig';

// Gesture states
const STATES = {
  IDLE: 'idle',
  TRACKING: 'tracking', // Detected touch, watching direction
  DRAGGING: 'dragging', // Horizontal swipe confirmed
  SETTLING: 'settling', // Animating to final position
};

// Thresholds (tuned for native feel)
const CONFIG = {
  // Distance thresholds
  DIRECTION_LOCK_THRESHOLD: 10, // px before we decide horizontal vs vertical
  SWIPE_THRESHOLD_RATIO: 0.22, // % of screen width to trigger navigation
  MIN_SWIPE_DISTANCE: 50, // Minimum px to trigger (for small screens)

  // Velocity thresholds
  VELOCITY_THRESHOLD: 0.3, // px/ms - flick detection
  FAST_FLICK_THRESHOLD: 0.6, // px/ms - very fast flick needs less distance

  // Edge zones (avoid Safari back gesture)
  EDGE_ZONE_LEFT: 20, // px from left edge
  EDGE_ZONE_RIGHT: 20, // px from right edge

  // Rubber band at edges
  RUBBER_BAND_FACTOR: 0.25, // Resistance when at first/last tab
  MAX_RUBBER_BAND: 80, // Max overscroll in px

  // Animation
  SETTLE_DURATION: 280, // ms for spring animation
};

/**
 * Check if element or ancestors can scroll horizontally
 */
function hasHorizontalScroll(element) {
  let el = element;
  while (el && el !== document.body) {
    const style = window.getComputedStyle(el);
    const overflowX = style.overflowX;

    if (overflowX === 'auto' || overflowX === 'scroll') {
      if (el.scrollWidth > el.clientWidth) {
        return true;
      }
    }

    // Check for horizontal scroll containers (carousels, etc.)
    if (el.hasAttribute('data-horizontal-scroll')) {
      return true;
    }

    el = el.parentElement;
  }
  return false;
}

/**
 * Check if element is an interactive control that shouldn't trigger swipe
 */
function isInteractiveElement(element) {
  const tag = element.tagName?.toLowerCase();

  // Form inputs
  if (['input', 'textarea', 'select'].includes(tag)) {
    return true;
  }

  // Contenteditable
  if (element.isContentEditable) {
    return true;
  }

  // Range sliders, video controls
  if (element.type === 'range') {
    return true;
  }

  // Check for data attribute to mark elements as swipe-blocking
  let el = element;
  while (el && el !== document.body) {
    if (el.hasAttribute('data-swipe-ignore')) {
      return true;
    }
    el = el.parentElement;
  }

  return false;
}

/**
 * Check if any modal/sheet/overlay is open
 */
function isModalOpen() {
  // Check for common modal indicators
  const modalSelectors = [
    '[role="dialog"]',
    '[data-modal-open="true"]',
    '.modal-overlay',
    '.sheet-overlay',
    '[data-radix-dialog-overlay]',
    '[data-state="open"][role="dialog"]',
  ];

  for (const selector of modalSelectors) {
    if (document.querySelector(selector)) {
      return true;
    }
  }

  // Check body for modal-open class
  if (document.body.classList.contains('modal-open')) {
    return true;
  }

  return false;
}

/**
 * Check for reduced motion preference
 */
function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * Main hook
 */
export function useTabSwipeNavigation({ enabled = true, onSwipeStart, onSwipeEnd } = {}) {
  const location = useLocation();
  const navigate = useNavigate();

  // Current tab info
  const currentTabIndex = getTabIndexFromPath(location.pathname);
  const isOnTabRoot = isTabRoot(location.pathname);

  // Refs for gesture tracking (avoid re-renders during gesture)
  const stateRef = useRef(STATES.IDLE);
  const startRef = useRef({ x: 0, y: 0, time: 0 });
  const currentRef = useRef({ x: 0, time: 0 });
  const velocityRef = useRef(0);
  const directionRef = useRef(null); // 'left' | 'right' | null
  const targetTabRef = useRef(null);

  // State for rendering (only updated when needed)
  const [swipeState, setSwipeState] = useState({
    isActive: false,
    offset: 0,
    direction: null, // 'left' | 'right'
    targetTabIndex: null,
    isSettling: false,
  });

  // RAF handle for cleanup
  const rafRef = useRef(null);

  // Screen width for calculations
  const screenWidthRef = useRef(window.innerWidth);

  // Update screen width on resize
  useEffect(() => {
    const handleResize = () => {
      screenWidthRef.current = window.innerWidth;
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  /**
   * Reset all gesture state
   */
  const resetGesture = useCallback(() => {
    stateRef.current = STATES.IDLE;
    startRef.current = { x: 0, y: 0, time: 0 };
    currentRef.current = { x: 0, time: 0 };
    velocityRef.current = 0;
    directionRef.current = null;
    targetTabRef.current = null;

    setSwipeState({
      isActive: false,
      offset: 0,
      direction: null,
      targetTabIndex: null,
      isSettling: false,
    });

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  /**
   * Calculate offset with rubber banding at edges
   */
  const calculateOffset = useCallback((deltaX) => {
    const canGoLeft = currentTabIndex < LAST_TAB_INDEX; // swipe left = go right in tab order
    const canGoRight = currentTabIndex > FIRST_TAB_INDEX; // swipe right = go left in tab order

    let offset = deltaX;

    // Apply rubber band if at edge
    if (deltaX < 0 && !canGoLeft) {
      // Trying to go right (swipe left) but at last tab
      offset = Math.max(deltaX * CONFIG.RUBBER_BAND_FACTOR, -CONFIG.MAX_RUBBER_BAND);
    } else if (deltaX > 0 && !canGoRight) {
      // Trying to go left (swipe right) but at first tab
      offset = Math.min(deltaX * CONFIG.RUBBER_BAND_FACTOR, CONFIG.MAX_RUBBER_BAND);
    }

    return offset;
  }, [currentTabIndex]);

  /**
   * Touch start handler
   */
  const handleTouchStart = useCallback((e) => {
    // Bail if disabled or not on a tab
    if (!enabled || currentTabIndex === -1 || !isOnTabRoot) {
      return;
    }

    // Bail if reduced motion and we're not doing instant switch
    // (we'll handle reduced motion in the viewport component)

    const touch = e.touches[0];
    const { clientX, clientY } = touch;
    const width = screenWidthRef.current;

    // Check edge zones (Safari back gesture)
    if (clientX < CONFIG.EDGE_ZONE_LEFT || clientX > width - CONFIG.EDGE_ZONE_RIGHT) {
      return;
    }

    // Check if target is interactive
    if (isInteractiveElement(e.target)) {
      return;
    }

    // Check for horizontal scroll containers
    if (hasHorizontalScroll(e.target)) {
      return;
    }

    // Check for open modals
    if (isModalOpen()) {
      return;
    }

    // Start tracking
    stateRef.current = STATES.TRACKING;
    startRef.current = { x: clientX, y: clientY, time: Date.now() };
    currentRef.current = { x: clientX, time: Date.now() };
    directionRef.current = null;

  }, [enabled, currentTabIndex, isOnTabRoot]);

  /**
   * Touch move handler
   */
  const handleTouchMove = useCallback((e) => {
    if (stateRef.current === STATES.IDLE || stateRef.current === STATES.SETTLING) {
      return;
    }

    const touch = e.touches[0];
    const { clientX, clientY } = touch;
    const deltaX = clientX - startRef.current.x;
    const deltaY = clientY - startRef.current.y;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    // TRACKING state: determine if this is horizontal or vertical
    if (stateRef.current === STATES.TRACKING) {
      // Wait until we have enough movement to decide
      if (absDeltaX < CONFIG.DIRECTION_LOCK_THRESHOLD && absDeltaY < CONFIG.DIRECTION_LOCK_THRESHOLD) {
        return;
      }

      // If vertical movement dominates, this is a scroll - bail out
      if (absDeltaY > absDeltaX * 1.2) {
        resetGesture();
        return;
      }

      // Horizontal movement dominates - lock in as swipe
      if (absDeltaX > absDeltaY) {
        stateRef.current = STATES.DRAGGING;

        // Determine direction and target tab
        if (deltaX < 0 && currentTabIndex < LAST_TAB_INDEX) {
          directionRef.current = 'left';
          targetTabRef.current = currentTabIndex + 1;
        } else if (deltaX > 0 && currentTabIndex > FIRST_TAB_INDEX) {
          directionRef.current = 'right';
          targetTabRef.current = currentTabIndex - 1;
        } else {
          // At edge, still allow rubber band
          directionRef.current = deltaX < 0 ? 'left' : 'right';
          targetTabRef.current = null;
        }

        // Notify swipe start
        onSwipeStart?.();

        // Prevent default to avoid scrolling
        e.preventDefault();
      }
    }

    // DRAGGING state: update offset
    if (stateRef.current === STATES.DRAGGING) {
      e.preventDefault();

      // Calculate velocity
      const now = Date.now();
      const timeDelta = now - currentRef.current.time;
      if (timeDelta > 0) {
        velocityRef.current = (clientX - currentRef.current.x) / timeDelta;
      }
      currentRef.current = { x: clientX, time: now };

      // Calculate offset with rubber band
      const offset = calculateOffset(deltaX);

      // Update state (batched via RAF)
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }

      rafRef.current = requestAnimationFrame(() => {
        setSwipeState({
          isActive: true,
          offset,
          direction: directionRef.current,
          targetTabIndex: targetTabRef.current,
          isSettling: false,
        });
      });
    }

  }, [currentTabIndex, calculateOffset, resetGesture, onSwipeStart]);

  /**
   * Touch end handler
   */
  const handleTouchEnd = useCallback(() => {
    if (stateRef.current !== STATES.DRAGGING) {
      resetGesture();
      return;
    }

    const deltaX = currentRef.current.x - startRef.current.x;
    const absDeltaX = Math.abs(deltaX);
    const velocity = velocityRef.current;
    const absVelocity = Math.abs(velocity);
    const screenWidth = screenWidthRef.current;

    // Calculate threshold based on screen size
    const distanceThreshold = Math.max(
      screenWidth * CONFIG.SWIPE_THRESHOLD_RATIO,
      CONFIG.MIN_SWIPE_DISTANCE
    );

    // Determine if we should complete the navigation
    let shouldNavigate = false;

    if (targetTabRef.current !== null) {
      // Check if swiped far enough OR fast enough
      if (absVelocity > CONFIG.FAST_FLICK_THRESHOLD) {
        // Fast flick - navigate if direction matches
        shouldNavigate = (deltaX < 0 && directionRef.current === 'left') ||
                        (deltaX > 0 && directionRef.current === 'right');
      } else if (absVelocity > CONFIG.VELOCITY_THRESHOLD) {
        // Medium velocity - use lower distance threshold
        shouldNavigate = absDeltaX > distanceThreshold * 0.5;
      } else {
        // Normal swipe - use full distance threshold
        shouldNavigate = absDeltaX > distanceThreshold;
      }
    }

    // Start settling animation
    stateRef.current = STATES.SETTLING;

    if (shouldNavigate && targetTabRef.current !== null) {
      const targetPath = getTabPath(targetTabRef.current);

      // Set final offset for animation
      const finalOffset = directionRef.current === 'left' ? -screenWidth : screenWidth;

      setSwipeState({
        isActive: true,
        offset: finalOffset,
        direction: directionRef.current,
        targetTabIndex: targetTabRef.current,
        isSettling: true,
      });

      // Navigate after animation
      setTimeout(() => {
        navigate(targetPath, { replace: true });
        onSwipeEnd?.(targetTabRef.current);
        resetGesture();
      }, CONFIG.SETTLE_DURATION);

    } else {
      // Snap back
      setSwipeState(prev => ({
        ...prev,
        offset: 0,
        isSettling: true,
      }));

      setTimeout(() => {
        onSwipeEnd?.(null);
        resetGesture();
      }, CONFIG.SETTLE_DURATION);
    }

  }, [navigate, resetGesture, onSwipeEnd]);

  /**
   * Touch cancel handler
   */
  const handleTouchCancel = useCallback(() => {
    if (stateRef.current === STATES.DRAGGING) {
      // Snap back on cancel
      setSwipeState(prev => ({
        ...prev,
        offset: 0,
        isSettling: true,
      }));

      setTimeout(() => {
        resetGesture();
      }, CONFIG.SETTLE_DURATION);
    } else {
      resetGesture();
    }
  }, [resetGesture]);

  // Attach event listeners
  useEffect(() => {
    if (!enabled) return;

    // Use passive: false for touchmove to allow preventDefault
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    document.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchCancel);

      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [enabled, handleTouchStart, handleTouchMove, handleTouchEnd, handleTouchCancel]);

  // Reset on route change
  useEffect(() => {
    resetGesture();
  }, [location.pathname, resetGesture]);

  return {
    swipeState,
    currentTabIndex,
    isOnTabRoot,
    prefersReducedMotion: prefersReducedMotion(),
    config: CONFIG,
  };
}

export { CONFIG as SWIPE_CONFIG };
