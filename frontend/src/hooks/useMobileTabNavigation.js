import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ROUTES } from '../constants/routes';

/**
 * Mobile Tab Navigation Hook
 * Provides native-feeling tab switching with:
 * - Directional transitions (left/right based on tab order)
 * - Swipe gesture navigation between tabs
 * - Scroll position preservation per tab
 *
 * Tab order: Home (0) → Upload (1) → Chat (2) → Settings (3)
 */

// Define tab order for determining transition direction
const TAB_ORDER = [
  { path: ROUTES.HOME, index: 0 },
  { path: ROUTES.UPLOAD_HUB, index: 1 },
  { path: ROUTES.CHAT, index: 2 },
  { path: '/', index: 2 }, // Root also maps to chat
  { path: ROUTES.SETTINGS, index: 3 },
];

// Get tab index from path
function getTabIndex(pathname) {
  const match = TAB_ORDER.find(tab => pathname.startsWith(tab.path));
  return match?.index ?? -1;
}

// Get path for tab index
function getTabPath(index) {
  const tab = TAB_ORDER.find(t => t.index === index);
  return tab?.path;
}

export const useMobileTabNavigation = ({ enabled = true } = {}) => {
  const location = useLocation();
  const navigate = useNavigate();

  // Track previous tab index for transition direction
  const prevIndexRef = useRef(getTabIndex(location.pathname));
  const [transitionDirection, setTransitionDirection] = useState(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Scroll position preservation per tab
  const scrollPositionsRef = useRef({});

  // Swipe gesture state
  const swipeStartRef = useRef({ x: 0, y: 0, time: 0 });
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  // Current tab index
  const currentIndex = getTabIndex(location.pathname);

  // Update transition direction when route changes
  useEffect(() => {
    if (!enabled) return;

    const newIndex = getTabIndex(location.pathname);
    const prevIndex = prevIndexRef.current;

    if (newIndex !== -1 && prevIndex !== -1 && newIndex !== prevIndex) {
      setTransitionDirection(newIndex > prevIndex ? 'left' : 'right');
      setIsTransitioning(true);

      // Clear transitioning state after animation
      const timer = setTimeout(() => {
        setIsTransitioning(false);
        setTransitionDirection(null);
      }, 250);

      prevIndexRef.current = newIndex;
      return () => clearTimeout(timer);
    }

    prevIndexRef.current = newIndex;
  }, [location.pathname, enabled]);

  // Save scroll position before navigating away
  const saveScrollPosition = useCallback(() => {
    const index = getTabIndex(location.pathname);
    if (index !== -1) {
      scrollPositionsRef.current[index] = window.scrollY;
    }
  }, [location.pathname]);

  // Restore scroll position after navigation
  const restoreScrollPosition = useCallback(() => {
    const index = getTabIndex(location.pathname);
    if (index !== -1 && scrollPositionsRef.current[index] !== undefined) {
      requestAnimationFrame(() => {
        window.scrollTo(0, scrollPositionsRef.current[index]);
      });
    }
  }, [location.pathname]);

  // Navigate to adjacent tab
  const navigateToTab = useCallback((direction) => {
    const newIndex = currentIndex + direction;
    if (newIndex >= 0 && newIndex <= 3) {
      const path = getTabPath(newIndex);
      if (path) {
        saveScrollPosition();
        navigate(path);
      }
    }
  }, [currentIndex, navigate, saveScrollPosition]);

  // Touch handlers for swipe navigation
  const handleTouchStart = useCallback((e) => {
    if (!enabled) return;

    const touch = e.touches[0];
    // Don't capture if starting from edge (Safari back gesture)
    if (touch.clientX < 20 || touch.clientX > window.innerWidth - 20) return;

    swipeStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now()
    };
    setIsSwiping(false);
    setSwipeOffset(0);
  }, [enabled]);

  const handleTouchMove = useCallback((e) => {
    if (!enabled || !swipeStartRef.current.time) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - swipeStartRef.current.x;
    const deltaY = Math.abs(touch.clientY - swipeStartRef.current.y);

    // Only consider horizontal swipes
    if (Math.abs(deltaX) > 15 && Math.abs(deltaX) > deltaY * 1.5) {
      setIsSwiping(true);

      // Limit swipe offset with resistance at edges
      const canSwipeLeft = currentIndex < 3;
      const canSwipeRight = currentIndex > 0;

      let offset = deltaX;
      if (deltaX < 0 && !canSwipeLeft) {
        offset = deltaX * 0.2; // Resistance
      } else if (deltaX > 0 && !canSwipeRight) {
        offset = deltaX * 0.2; // Resistance
      }

      setSwipeOffset(Math.max(-150, Math.min(150, offset)));
    }
  }, [enabled, currentIndex]);

  const handleTouchEnd = useCallback(() => {
    if (!enabled || !isSwiping) {
      setSwipeOffset(0);
      setIsSwiping(false);
      swipeStartRef.current = { x: 0, y: 0, time: 0 };
      return;
    }

    const elapsed = Date.now() - swipeStartRef.current.time;
    const velocity = Math.abs(swipeOffset) / elapsed;

    // Navigate if swiped far enough or fast enough
    const threshold = velocity > 0.5 ? 30 : 80;

    if (swipeOffset > threshold && currentIndex > 0) {
      navigateToTab(-1); // Swipe right = go to previous tab
    } else if (swipeOffset < -threshold && currentIndex < 3) {
      navigateToTab(1); // Swipe left = go to next tab
    }

    setSwipeOffset(0);
    setIsSwiping(false);
    swipeStartRef.current = { x: 0, y: 0, time: 0 };
  }, [enabled, isSwiping, swipeOffset, currentIndex, navigateToTab]);

  // Attach/detach touch listeners
  useEffect(() => {
    if (!enabled) return;

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [enabled, handleTouchStart, handleTouchMove, handleTouchEnd]);

  // Restore scroll on mount
  useEffect(() => {
    restoreScrollPosition();
  }, [restoreScrollPosition]);

  return {
    // Current state
    currentIndex,
    transitionDirection,
    isTransitioning,
    isSwiping,
    swipeOffset,

    // Navigation helpers
    navigateToTab,
    saveScrollPosition,
    restoreScrollPosition,

    // CSS classes/styles for transitions
    getTransitionStyle: () => {
      if (isSwiping) {
        return {
          transform: `translateX(${swipeOffset}px)`,
          transition: 'none',
        };
      }

      if (isTransitioning) {
        return {
          animation: `tabSlide${transitionDirection === 'left' ? 'Left' : 'Right'} 0.25s cubic-bezier(0.32, 0.72, 0, 1) forwards`,
        };
      }

      return {};
    },
  };
};

export default useMobileTabNavigation;
