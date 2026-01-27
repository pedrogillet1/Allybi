/**
 * Browser Detection and Feature Support Utilities
 * Optimized for Safari and Chrome on macOS
 */

/**
 * Detect if the browser is Safari
 */
export const isSafari = () => {
  const ua = navigator.userAgent.toLowerCase();
  // Check for Safari but not Chrome (Chrome also contains Safari in UA)
  return ua.indexOf('safari') !== -1 && ua.indexOf('chrome') === -1;
};

/**
 * Detect if running on macOS
 */
export const isMacOS = () => {
  return navigator.platform.toUpperCase().indexOf('MAC') >= 0;
};

/**
 * Detect if running on iOS
 */
export const isIOS = () => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
};

/**
 * Detect if running on mobile device
 */
export const isMobile = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

/**
 * Check if canvas is supported and working
 */
export const hasCanvasSupport = () => {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext && canvas.getContext('2d'));
  } catch (e) {
    return false;
  }
};

/**
 * Check if Blob is supported
 */
export const hasBlobSupport = () => {
  try {
    return new Blob(['test']).size === 4;
  } catch (e) {
    return false;
  }
};

/**
 * Check if URL.createObjectURL is supported
 */
export const hasObjectURLSupport = () => {
  return typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';
};

/**
 * Check if download attribute is supported
 */
export const hasDownloadAttributeSupport = () => {
  return 'download' in document.createElement('a');
};

/**
 * Check if running in Private/Incognito mode (best effort)
 * Note: This is not 100% accurate but covers most cases
 */
export const isPrivateMode = async () => {
  try {
    // Safari detection
    if (isSafari()) {
      try {
        window.openDatabase(null, null, null, null);
        return false;
      } catch (e) {
        return true;
      }
    }

    // Chrome detection
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const { quota } = await navigator.storage.estimate();
      return quota < 120000000; // Less than ~120MB indicates private mode
    }

    return false;
  } catch (e) {
    return false;
  }
};

/**
 * Get optimal PDF scale for current device
 * Mac-specific optimization to prevent text squishing
 */
export const getOptimalPDFScale = () => {
  const pixelRatio = window.devicePixelRatio || 1;
  const macOS = isMacOS();
  const safari = isSafari();

  // Mac Safari: Use higher scale for better text rendering
  if (macOS && safari) {
    return Math.min(pixelRatio * 1.2, 2);
  }

  // Safari on other platforms
  if (safari) {
    return Math.min(pixelRatio, 1.5);
  }

  // Mac Chrome/Firefox: Slight boost for text clarity
  if (macOS) {
    return Math.min(pixelRatio * 1.1, 2.5);
  }

  if (isMobile()) {
    // Mobile devices need lower scale
    return Math.min(pixelRatio, 2);
  }

  // Desktop Chrome/Firefox on Windows/Linux
  return Math.min(pixelRatio, 3);
};

/**
 * Download file with browser-specific handling
 * Safari doesn't properly support download attribute
 */
export const downloadFile = (url, filename, openInNewTab = false) => {
  const safariOrIOS = isSafari() || isIOS();

  // For PDF files on Safari/iOS, open in new tab for viewing
  if (safariOrIOS && filename.toLowerCase().endsWith('.pdf')) {
    window.open(url, '_blank');
    return;
  }

  // For iOS, always open in new tab (no download support)
  if (isIOS()) {
    window.open(url, '_blank');
    return;
  }

  // Standard download for other browsers
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();

    // Clean up
    setTimeout(() => {
      document.body.removeChild(link);
    }, 100);
  } catch (e) {
    console.error('Download failed, opening in new tab:', e);
    window.open(url, '_blank');
  }
};

/**
 * Create blob URL with Safari-specific handling
 * Safari has shorter blob URL lifetime
 */
export const createBlobURL = (blob) => {
  if (!hasObjectURLSupport() || !hasBlobSupport()) {
    throw new Error('Blob or ObjectURL not supported');
  }

  const url = URL.createObjectURL(blob);

  // Safari: Keep track of URL for cleanup
  if (isSafari()) {
    // Store in window for potential cleanup
    window._safariBlobs = window._safariBlobs || [];
    window._safariBlobs.push(url);
  }

  return url;
};

/**
 * Revoke blob URL with proper cleanup
 */
export const revokeBlobURL = (url) => {
  try {
    URL.revokeObjectURL(url);

    // Safari: Remove from tracking
    if (isSafari() && window._safariBlobs) {
      window._safariBlobs = window._safariBlobs.filter(u => u !== url);
    }
  } catch (e) {
    console.warn('Failed to revoke blob URL:', e);
  }
};

/**
 * Get optimal image rendering settings
 */
export const getImageRenderingCSS = () => {
  if (isSafari()) {
    return {
      imageRendering: 'high-quality',
      WebkitFontSmoothing: 'antialiased',
    };
  }

  return {
    imageRendering: 'high-quality',
    fontSmooth: 'antialiased',
  };
};

/**
 * Check if WebP is supported
 */
export const hasWebPSupport = () => {
  const elem = document.createElement('canvas');
  if (elem.getContext && elem.getContext('2d')) {
    return elem.toDataURL('image/webp').indexOf('data:image/webp') === 0;
  }
  return false;
};

/**
 * Get browser info for debugging
 */
export const getBrowserInfo = () => {
  return {
    userAgent: navigator.userAgent,
    isSafari: isSafari(),
    isMacOS: isMacOS(),
    isIOS: isIOS(),
    isMobile: isMobile(),
    hasCanvas: hasCanvasSupport(),
    hasBlob: hasBlobSupport(),
    hasObjectURL: hasObjectURLSupport(),
    hasDownload: hasDownloadAttributeSupport(),
    hasWebP: hasWebPSupport(),
    pixelRatio: window.devicePixelRatio || 1,
    optimalPDFScale: getOptimalPDFScale(),
  };
};

/**
 * Log browser info to console (for debugging)
 */
export const logBrowserInfo = () => {
  const info = getBrowserInfo();
  console.group('🔍 Browser Information');
  console.table(info);
  console.groupEnd();
};

/**
 * Safari-optimized canvas operations
 */
export const safeCanvasOperation = (canvas, operation) => {
  if (!hasCanvasSupport()) {
    console.warn('Canvas not supported');
    return null;
  }

  try {
    const context = canvas.getContext('2d', {
      // Safari optimization
      alpha: true,
      desynchronized: isSafari() ? false : true, // Safari has issues with desynchronized
      willReadFrequently: true,
    });

    if (!context) {
      console.warn('Failed to get canvas context');
      return null;
    }

    return operation(context);
  } catch (e) {
    console.error('Canvas operation failed:', e);
    return null;
  }
};

/**
 * Get optimal canvas size for current device
 */
export const getOptimalCanvasSize = (width, height, maxDimension = 2000) => {
  const scale = isSafari() ? 1 : (window.devicePixelRatio || 1);

  let optimalWidth = width * scale;
  let optimalHeight = height * scale;

  // Limit maximum dimension to prevent memory issues
  if (optimalWidth > maxDimension || optimalHeight > maxDimension) {
    const ratio = Math.min(maxDimension / optimalWidth, maxDimension / optimalHeight);
    optimalWidth *= ratio;
    optimalHeight *= ratio;
  }

  return {
    width: Math.floor(optimalWidth),
    height: Math.floor(optimalHeight),
    scale
  };
};
