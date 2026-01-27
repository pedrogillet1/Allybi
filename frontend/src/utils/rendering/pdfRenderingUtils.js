/**
 * PDF Rendering Utilities
 * Cross-platform PDF width and scale calculations
 * Fixes Mac vs Windows rendering differences
 */

/**
 * Get scrollbar width for current browser/platform
 * Returns 0 for overlay scrollbars (Mac Safari), 15-17 for traditional (Windows)
 */
export const getScrollbarWidth = () => {
  // Create a temporary element to measure scrollbar width
  const outer = document.createElement('div');
  outer.style.visibility = 'hidden';
  outer.style.overflow = 'scroll'; // Force scrollbar
  outer.style.msOverflowStyle = 'scrollbar'; // Force scrollbar for IE
  document.body.appendChild(outer);

  const inner = document.createElement('div');
  outer.appendChild(inner);

  const scrollbarWidth = outer.offsetWidth - inner.offsetWidth;
  outer.parentNode.removeChild(outer);

  return scrollbarWidth;
};

/**
 * Calculate optimal PDF width based on container and viewport
 * Accounts for scrollbars and platform differences
 */
export const getOptimalPDFWidth = (containerWidth, zoom = 100, isMobile = false) => {
  // Get scrollbar width (accounts for overlay vs traditional scrollbars)
  const scrollbarWidth = getScrollbarWidth();

  // Calculate available width with padding
  const padding = isMobile ? 16 : 40; // 8px each side on mobile, 20px each side on desktop
  const availableWidth = containerWidth - scrollbarWidth - padding;

  // Default max width for readability
  const maxWidth = 900;

  // Use the smaller of available width or max width
  const optimalWidth = Math.min(availableWidth, maxWidth);

  // Apply zoom
  return Math.max(300, optimalWidth * (zoom / 100)); // Min 300px for readability
};

/**
 * Get optimal PDF container width
 * Ensures PDF fits without horizontal scrolling
 */
export const getOptimalContainerWidth = (sidebarWidth = 84) => {
  const windowWidth = window.innerWidth;
  const scrollbarWidth = getScrollbarWidth();

  // Account for sidebar (84px on desktop, 0 on mobile)
  const effectiveSidebarWidth = window.innerWidth > 768 ? sidebarWidth : 0;

  // Account for container padding
  const containerPadding = 40; // 20px on each side

  return windowWidth - effectiveSidebarWidth - containerPadding - scrollbarWidth;
};

/**
 * Detect if running on macOS
 */
export const isMacOS = () => {
  return navigator.platform.toUpperCase().indexOf('MAC') >= 0 ||
         navigator.userAgent.toUpperCase().indexOf('MAC') >= 0;
};

/**
 * Detect if running Safari browser
 */
export const isSafariBrowser = () => {
  const ua = navigator.userAgent.toLowerCase();
  return ua.indexOf('safari') !== -1 && ua.indexOf('chrome') === -1;
};

/**
 * Get optimal PDF scale for current device/browser
 * Improved version that accounts for Mac rendering issues
 */
export const getOptimalPDFScaleNew = (isSafari = false, isMac = false) => {
  const pixelRatio = window.devicePixelRatio || 1;

  if (isSafari && isMac) {
    // Safari on Mac: Use lower scale to prevent rendering issues
    // Scale and width interact, so lower scale helps with overflow
    return Math.min(pixelRatio, 1.2);
  }

  if (isSafari) {
    // Safari on other platforms
    return Math.min(pixelRatio, 1.5);
  }

  // Chrome/Firefox on Mac
  if (isMac) {
    return Math.min(pixelRatio, 1.8);
  }

  // Windows/Linux
  return Math.min(pixelRatio, 2);
};
