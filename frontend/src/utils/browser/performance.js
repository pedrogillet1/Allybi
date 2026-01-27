/**
 * Performance Utilities for Safari and Chrome optimization
 * Debounce, throttle, lazy loading, virtual scrolling, memory management
 */

import { isSafari, isMacOS, isIOS, isMobile } from './browserUtils';

/**
 * Debounce function - prevents excessive function calls
 * Useful for search inputs, resize handlers, etc.
 *
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @param {boolean} immediate - Execute immediately on first call
 */
export function debounce(func, wait = 300, immediate = false) {
  let timeout;

  return function executedFunction(...args) {
    const context = this;

    const later = () => {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };

    const callNow = immediate && !timeout;

    clearTimeout(timeout);
    timeout = setTimeout(later, wait);

    if (callNow) func.apply(context, args);
  };
}

/**
 * Throttle function - limits function call frequency
 * Useful for scroll handlers, mousemove, etc.
 *
 * @param {Function} func - Function to throttle
 * @param {number} limit - Minimum time between calls (ms)
 */
export function throttle(func, limit = 100) {
  let inThrottle;
  let lastResult;

  return function(...args) {
    const context = this;

    if (!inThrottle) {
      lastResult = func.apply(context, args);
      inThrottle = true;

      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }

    return lastResult;
  };
}

/**
 * Request Animation Frame throttle
 * Perfect for scroll/resize handlers
 *
 * @param {Function} callback - Function to call
 */
export function rafThrottle(callback) {
  let requestId = null;
  let lastArgs = null;

  const later = (context) => () => {
    requestId = null;
    callback.apply(context, lastArgs);
  };

  return function(...args) {
    lastArgs = args;

    if (requestId === null) {
      requestId = requestAnimationFrame(later(this));
    }
  };
}

/**
 * Lazy load images with IntersectionObserver
 * Safari-optimized with larger root margin
 *
 * @param {string} selector - CSS selector for lazy images
 * @param {Object} options - IntersectionObserver options
 */
export function lazyLoadImages(selector = 'img.lazy', options = {}) {
  const safari = isSafari();

  const defaultOptions = {
    // Safari: Load images earlier (larger margin)
    rootMargin: safari ? '200px' : '100px',
    threshold: 0.01,
    ...options
  };

  if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          const src = img.dataset.src;

          if (src) {
            img.src = src;
            img.classList.remove('lazy');
            img.classList.add('loaded');

            // Safari: Add loading animation
            if (safari) {
              img.style.opacity = '0';
              setTimeout(() => {
                img.style.transition = 'opacity 0.3s ease';
                img.style.opacity = '1';
              }, 10);
            }

            observer.unobserve(img);
          }
        }
      });
    }, defaultOptions);

    const images = document.querySelectorAll(selector);
    images.forEach(img => imageObserver.observe(img));

    console.log(`🖼️  [Performance] Lazy loading ${images.length} images`);

    return () => {
      imageObserver.disconnect();
    };
  } else {
    // Fallback: Load all images immediately
    console.warn('⚠️  IntersectionObserver not supported, loading all images');
    document.querySelectorAll(selector).forEach(img => {
      if (img.dataset.src) {
        img.src = img.dataset.src;
        img.classList.remove('lazy');
      }
    });
  }
}

/**
 * Virtual Scroller for large lists
 * Safari-optimized with larger buffer
 */
export class VirtualScroller {
  constructor(container, items, renderItem, itemHeight = 50) {
    this.container = container;
    this.items = items;
    this.renderItem = renderItem;
    this.itemHeight = itemHeight;
    this.safari = isSafari();
    this.mobile = isMobile();

    // Safari/mobile: Larger buffer for smoother scrolling
    this.bufferSize = this.safari || this.mobile ? 10 : 5;

    this.init();
  }

  init() {
    console.log(`📜 [VirtualScroller] Initializing with ${this.items.length} items`);

    const visibleCount = Math.ceil(this.container.clientHeight / this.itemHeight);
    this.visibleCount = visibleCount + this.bufferSize * 2;
    this.startIndex = 0;

    // Create content wrapper
    this.content = document.createElement('div');
    this.content.style.position = 'relative';
    this.content.style.height = `${this.items.length * this.itemHeight}px`;
    this.container.appendChild(this.content);

    this.render();

    // Safari-optimized scroll handler
    const scrollHandler = this.safari
      ? debounce(() => this.onScroll(), 16)
      : rafThrottle(() => this.onScroll());

    this.container.addEventListener('scroll', scrollHandler);

    console.log(`✅ [VirtualScroller] Initialized (visible: ${this.visibleCount}, buffer: ${this.bufferSize})`);
  }

  onScroll() {
    const scrollTop = this.container.scrollTop;
    const newStartIndex = Math.max(0, Math.floor(scrollTop / this.itemHeight) - this.bufferSize);

    if (newStartIndex !== this.startIndex) {
      this.startIndex = newStartIndex;
      this.render();
    }
  }

  render() {
    const endIndex = Math.min(
      this.startIndex + this.visibleCount,
      this.items.length
    );

    // Clear existing items
    this.content.innerHTML = '';

    // Render visible items
    const fragment = document.createDocumentFragment();

    for (let i = this.startIndex; i < endIndex; i++) {
      const item = this.renderItem(this.items[i], i);
      item.style.position = 'absolute';
      item.style.top = `${i * this.itemHeight}px`;
      item.style.width = '100%';
      fragment.appendChild(item);
    }

    this.content.appendChild(fragment);
  }

  update(newItems) {
    this.items = newItems;
    this.content.style.height = `${this.items.length * this.itemHeight}px`;
    this.render();
  }

  destroy() {
    if (this.content && this.content.parentNode) {
      this.content.parentNode.removeChild(this.content);
    }
  }
}

/**
 * Memory cleanup (Safari-critical)
 * Safari has more aggressive memory management
 */
export function cleanupMemory() {
  const safari = isSafari();

  console.log(`🧹 [Performance] Cleaning up memory (Safari: ${safari})`);

  // Clear expired blob URLs
  if (window._safariBlobs && Array.isArray(window._safariBlobs)) {
    window._safariBlobs.forEach(url => {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
        // Ignore errors
      }
    });
    window._safariBlobs = [];
  }

  // Safari: Aggressive cache cleanup
  if (safari && 'caches' in window) {
    caches.keys().then(names => {
      names.forEach(name => {
        // Clear old/temp caches
        if (name.includes('old') || name.includes('temp') || name.includes('cache')) {
          caches.delete(name);
        }
      });
    }).catch(err => {
      console.warn('Cache cleanup failed:', err);
    });
  }

  // Force garbage collection (dev mode only)
  if (safari && window.gc && process.env.NODE_ENV === 'development') {
    try {
      window.gc();
    } catch (e) {
      // gc() not available
    }
  }

  console.log('✅ [Performance] Memory cleanup complete');
}

/**
 * Preload images
 * @param {string[]} urls - Array of image URLs to preload
 */
export function preloadImages(urls) {
  console.log(`⏳ [Performance] Preloading ${urls.length} images`);

  const promises = urls.map(url => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(url);
      img.onerror = () => reject(url);
      img.src = url;
    });
  });

  return Promise.allSettled(promises).then(results => {
    const loaded = results.filter(r => r.status === 'fulfilled').length;
    console.log(`✅ [Performance] Preloaded ${loaded}/${urls.length} images`);
    return results;
  });
}

/**
 * Measure performance
 * @param {string} name - Performance mark name
 * @param {Function} fn - Function to measure
 */
export async function measurePerformance(name, fn) {
  const startMark = `${name}-start`;
  const endMark = `${name}-end`;

  if (performance && performance.mark) {
    performance.mark(startMark);
  }

  const startTime = Date.now();

  try {
    const result = await fn();
    const duration = Date.now() - startTime;

    if (performance && performance.mark) {
      performance.mark(endMark);
      performance.measure(name, startMark, endMark);
    }

    console.log(`⏱️  [Performance] ${name}: ${duration}ms`);

    return { result, duration };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ [Performance] ${name} failed after ${duration}ms:`, error);
    throw error;
  }
}

/**
 * Check if page is visible (for pausing background tasks)
 */
export function isPageVisible() {
  return document.visibilityState === 'visible';
}

/**
 * Wait for page to be visible
 */
export function waitForPageVisible() {
  return new Promise(resolve => {
    if (isPageVisible()) {
      resolve();
    } else {
      const handler = () => {
        if (isPageVisible()) {
          document.removeEventListener('visibilitychange', handler);
          resolve();
        }
      };
      document.addEventListener('visibilitychange', handler);
    }
  });
}

/**
 * Idle callback with fallback
 * @param {Function} callback - Function to call when idle
 * @param {Object} options - Options
 */
export function runWhenIdle(callback, options = {}) {
  if ('requestIdleCallback' in window) {
    return window.requestIdleCallback(callback, options);
  } else {
    // Fallback for Safari (doesn't support requestIdleCallback)
    return setTimeout(callback, 1);
  }
}

/**
 * Cancel idle callback
 * @param {number} handle - Idle callback handle
 */
export function cancelIdleCallback(handle) {
  if ('cancelIdleCallback' in window) {
    window.cancelIdleCallback(handle);
  } else {
    clearTimeout(handle);
  }
}

/**
 * Optimize long tasks (Safari-compatible)
 * Breaks long tasks into chunks
 *
 * @param {Array} items - Items to process
 * @param {Function} processor - Function to process each item
 * @param {number} chunkSize - Items per chunk
 */
export async function processInChunks(items, processor, chunkSize = 100) {
  console.log(`⚙️  [Performance] Processing ${items.length} items in chunks of ${chunkSize}`);

  const chunks = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }

  let processed = 0;

  for (const chunk of chunks) {
    // Process chunk
    await Promise.all(chunk.map(processor));
    processed += chunk.length;

    // Yield to browser
    await new Promise(resolve => {
      runWhenIdle(resolve);
    });

    console.log(`⚙️  [Performance] Processed ${processed}/${items.length}`);
  }

  console.log(`✅ [Performance] All items processed`);
}

/**
 * Get performance metrics
 */
export function getPerformanceMetrics() {
  if (!performance || !performance.getEntriesByType) {
    return null;
  }

  const navigation = performance.getEntriesByType('navigation')[0];
  const paint = performance.getEntriesByType('paint');

  return {
    // Page load metrics
    domContentLoaded: navigation ? navigation.domContentLoadedEventEnd - navigation.fetchStart : null,
    loadComplete: navigation ? navigation.loadEventEnd - navigation.fetchStart : null,

    // Paint metrics
    firstPaint: paint.find(p => p.name === 'first-paint')?.startTime || null,
    firstContentfulPaint: paint.find(p => p.name === 'first-contentful-paint')?.startTime || null,

    // Memory (if available)
    memory: performance.memory ? {
      usedJSHeapSize: performance.memory.usedJSHeapSize,
      totalJSHeapSize: performance.memory.totalJSHeapSize,
      jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
    } : null
  };
}

/**
 * Log performance metrics
 */
export function logPerformanceMetrics() {
  const metrics = getPerformanceMetrics();

  if (metrics) {
    console.group('📊 Performance Metrics');
    console.log(`DOM Content Loaded: ${metrics.domContentLoaded}ms`);
    console.log(`Load Complete: ${metrics.loadComplete}ms`);
    console.log(`First Paint: ${metrics.firstPaint}ms`);
    console.log(`First Contentful Paint: ${metrics.firstContentfulPaint}ms`);
    if (metrics.memory) {
      console.log(`Memory Used: ${(metrics.memory.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB`);
    }
    console.groupEnd();
  }
}
