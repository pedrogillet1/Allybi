import { useEffect, useCallback, useRef, useState } from 'react';

/**
 * Hook to sync CSS custom properties with visual viewport dimensions
 * Handles iOS Safari dynamic toolbars and on-screen keyboard
 *
 * Sets the following CSS variables on document.documentElement:
 * - --app-height: Actual visible viewport height
 * - --keyboard-height: Height of on-screen keyboard (0 when hidden)
 * - --viewport-offset-top: Distance from top of layout viewport to visual viewport
 * - --bottom-nav-height: Height of bottom navigation (constant)
 *
 * @param {Object} options
 * @param {boolean} options.enabled - Whether to enable viewport tracking (default: true on mobile)
 */
export const useVisualViewportVars = ({ enabled = true } = {}) => {
  const rafRef = useRef(null);
  const initialHeightRef = useRef(null);

  const updateVars = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = requestAnimationFrame(() => {
      const vv = window.visualViewport;
      const root = document.documentElement;

      if (!vv) {
        // Fallback for browsers without visualViewport API
        root.style.setProperty('--app-height', `${window.innerHeight}px`);
        root.style.setProperty('--vvh', `${window.innerHeight}px`);
        root.style.setProperty('--vvw', `${window.innerWidth}px`);
        root.style.setProperty('--keyboard-height', '0px');
        root.style.setProperty('--keyboard', '0px');
        root.style.setProperty('--viewport-offset-top', '0px');
        root.style.setProperty('--vvoffsetTop', '0px');
        root.style.setProperty('--tabbar-h', '70px');
        document.body.classList.remove('keyboard-visible');
        return;
      }

      // Store initial height on first call (before keyboard opens)
      if (initialHeightRef.current === null) {
        initialHeightRef.current = vv.height;
      }

      // Calculate keyboard height
      // When keyboard opens, visualViewport.height decreases
      const keyboardHeight = Math.max(0, initialHeightRef.current - vv.height - vv.offsetTop);
      const isKeyboardOpen = keyboardHeight > 100; // 100px threshold

      // Update CSS variables
      root.style.setProperty('--app-height', `${vv.height}px`);
      root.style.setProperty('--vvh', `${vv.height}px`);
      root.style.setProperty('--vvw', `${vv.width}px`);
      root.style.setProperty('--keyboard-height', `${keyboardHeight}px`);
      root.style.setProperty('--keyboard', `${keyboardHeight}px`);
      root.style.setProperty('--viewport-offset-top', `${vv.offsetTop}px`);
      root.style.setProperty('--vvoffsetTop', `${vv.offsetTop}px`);

      // Set bottom nav height - 0 when keyboard is open, 70px otherwise (includes padding)
      // --tabbar-h is the total tab bar height including safe area
      root.style.setProperty('--bottom-nav-height', isKeyboardOpen ? '0px' : '56px');
      root.style.setProperty('--tabbar-h', isKeyboardOpen ? '0px' : '70px');

      // Add/remove body class for CSS hooks
      if (isKeyboardOpen) {
        document.body.classList.add('keyboard-visible');
      } else {
        document.body.classList.remove('keyboard-visible');
      }
    });
  }, []);

  useEffect(() => {
    // Only run on mobile or when explicitly enabled
    const isMobile = window.innerWidth <= 768;
    if (!enabled || !isMobile) return;

    // Initial update
    updateVars();

    const vv = window.visualViewport;

    if (vv) {
      vv.addEventListener('resize', updateVars);
      vv.addEventListener('scroll', updateVars);
    }

    // Also listen for orientation changes
    const handleOrientationChange = () => {
      // Reset initial height on orientation change
      initialHeightRef.current = null;
      setTimeout(updateVars, 100);
    };

    window.addEventListener('orientationchange', handleOrientationChange);

    // Listen for resize (fallback)
    window.addEventListener('resize', updateVars);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      if (vv) {
        vv.removeEventListener('resize', updateVars);
        vv.removeEventListener('scroll', updateVars);
      }
      window.removeEventListener('orientationchange', handleOrientationChange);
      window.removeEventListener('resize', updateVars);
    };
  }, [enabled, updateVars]);
};

/**
 * Hook to detect if keyboard is currently visible
 * Uses visualViewport API for accurate detection
 */
export const useIsKeyboardVisible = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const isMobile = window.innerWidth <= 768;
    if (!isMobile) return;

    const vv = window.visualViewport;
    if (!vv) return;

    let initialHeight = vv.height;

    const handleResize = () => {
      const heightDiff = initialHeight - vv.height;
      setIsVisible(heightDiff > 100);
    };

    const handleOrientationChange = () => {
      setTimeout(() => {
        initialHeight = vv.height;
      }, 100);
    };

    vv.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientationChange);

    return () => {
      vv.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, []);

  return isVisible;
};

export default useVisualViewportVars;
