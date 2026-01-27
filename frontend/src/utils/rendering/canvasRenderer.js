/**
 * Universal Canvas Renderer for Safari, Chrome, Firefox
 * Handles PDF rendering, image rendering, and canvas operations
 * with browser-specific optimizations for maximum compatibility
 */

import { isSafari, isMacOS, isIOS, getOptimalCanvasSize, safeCanvasOperation } from './browserUtils';

export class CanvasRenderer {
  constructor(options = {}) {
    this.safari = isSafari();
    this.macOS = isMacOS();
    this.iOS = isIOS();

    this.options = {
      scale: options.scale || (this.safari ? 1.5 : 2.0),
      // Safari has lower canvas size limits (4096x4096 vs 16384x16384)
      maxCanvasSize: this.safari ? 4096 : 16384,
      quality: options.quality || (this.safari ? 0.85 : 0.92),
      enableWebGL: options.enableWebGL !== false && !this.safari, // Safari has WebGL issues
      ...options
    };

    console.log(`🎨 [CanvasRenderer] Initialized for ${this.safari ? 'Safari' : 'Chrome/Firefox'} on ${this.macOS ? 'macOS' : 'Other'}`);
  }

  /**
   * Render PDF page to canvas with Safari optimizations
   * @param {PDFPageProxy} page - PDF.js page object
   * @param {HTMLCanvasElement} canvas - Target canvas element
   * @param {Object} options - Rendering options
   */
  async renderPDFPage(page, canvas, options = {}) {
    try {
      console.log(`📄 [CanvasRenderer] Rendering PDF page ${page.pageNumber}`);

      // Calculate viewport with scale
      let viewport = page.getViewport({ scale: options.scale || this.options.scale });

      // Safari: Check and enforce canvas size limits
      if (this.safari) {
        const maxSize = this.options.maxCanvasSize;
        if (viewport.width > maxSize || viewport.height > maxSize) {
          console.warn(`⚠️  [Safari] Canvas size ${viewport.width}x${viewport.height} exceeds limit, scaling down`);
          const scale = Math.min(maxSize / viewport.width, maxSize / viewport.height);
          viewport = page.getViewport({
            scale: (options.scale || this.options.scale) * scale
          });
        }
      }

      // Set canvas dimensions
      const { width, height } = getOptimalCanvasSize(
        viewport.width,
        viewport.height,
        this.options.maxCanvasSize
      );

      canvas.width = width;
      canvas.height = height;

      // Get context with optimized settings
      const context = canvas.getContext('2d', {
        alpha: false, // Better performance, PDFs don't need transparency
        desynchronized: !this.safari, // Safari has issues with desynchronized
        willReadFrequently: false // Optimize for rendering, not reading
      });

      if (!context) {
        throw new Error('Failed to get canvas context');
      }

      // Safari-specific rendering optimizations
      if (this.safari) {
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
      }

      // Render the PDF page
      const renderContext = {
        canvasContext: context,
        viewport: viewport,
        intent: 'display',
        enableWebGL: this.options.enableWebGL,
        renderInteractiveForms: true,
        // Safari: Use simpler rendering mode
        renderMode: this.safari ? 'svg' : 'canvas'
      };

      await page.render(renderContext).promise;

      console.log(`✅ [CanvasRenderer] PDF page ${page.pageNumber} rendered successfully`);

      return {
        width: canvas.width,
        height: canvas.height,
        scale: viewport.scale
      };

    } catch (error) {
      console.error('❌ [CanvasRenderer] PDF rendering failed:', error);

      // Safari fallback: Try rendering at lower quality
      if (this.safari && options.scale !== 1.0) {
        console.log('🔄 [Safari] Retrying at lower quality...');
        return await this.renderPDFPage(page, canvas, { ...options, scale: 1.0 });
      }

      throw error;
    }
  }

  /**
   * Render image to canvas with Safari compatibility
   * @param {string} imageUrl - Image URL or data URL
   * @param {HTMLCanvasElement} canvas - Target canvas element
   * @param {Object} options - Rendering options
   */
  async renderImage(imageUrl, canvas, options = {}) {
    return new Promise((resolve, reject) => {
      console.log(`🖼️  [CanvasRenderer] Loading image: ${imageUrl.substring(0, 50)}...`);

      const img = new Image();

      // Safari: CORS handling for cross-origin images
      if (this.safari) {
        img.crossOrigin = 'anonymous';
      }

      img.onload = () => {
        try {
          console.log(`✅ [CanvasRenderer] Image loaded: ${img.width}x${img.height}`);

          // Calculate dimensions with Safari size limits
          let width = img.width;
          let height = img.height;

          // Apply max size if specified
          if (options.maxWidth && width > options.maxWidth) {
            const ratio = options.maxWidth / width;
            width = options.maxWidth;
            height = Math.round(height * ratio);
          }

          if (options.maxHeight && height > options.maxHeight) {
            const ratio = options.maxHeight / height;
            height = options.maxHeight;
            width = Math.round(width * ratio);
          }

          // Safari: Respect canvas size limits
          if (this.safari) {
            const maxSize = this.options.maxCanvasSize;
            if (width > maxSize || height > maxSize) {
              console.warn(`⚠️  [Safari] Image size ${width}x${height} exceeds limit, scaling down`);
              const scale = Math.min(maxSize / width, maxSize / height);
              width = Math.round(width * scale);
              height = Math.round(height * scale);
            }
          }

          // Set canvas size
          canvas.width = width;
          canvas.height = height;

          // Get context with optimizations
          const context = canvas.getContext('2d', {
            alpha: true,
            desynchronized: !this.safari,
            willReadFrequently: false
          });

          if (!context) {
            reject(new Error('Failed to get canvas context'));
            return;
          }

          // Safari: Enable image smoothing
          if (this.safari) {
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = 'high';
          }

          // Draw image
          context.drawImage(img, 0, 0, width, height);

          console.log(`✅ [CanvasRenderer] Image rendered: ${width}x${height}`);

          resolve({
            width,
            height,
            originalWidth: img.width,
            originalHeight: img.height
          });

        } catch (error) {
          console.error('❌ [CanvasRenderer] Image rendering failed:', error);
          reject(error);
        }
      };

      img.onerror = (error) => {
        console.error('❌ [CanvasRenderer] Image loading failed:', error);
        reject(new Error('Failed to load image'));
      };

      img.src = imageUrl;
    });
  }

  /**
   * Convert canvas to Blob (Safari-compatible)
   * @param {HTMLCanvasElement} canvas - Source canvas
   * @param {string} mimeType - Output MIME type
   * @param {number} quality - Quality (0-1)
   */
  async canvasToBlob(canvas, mimeType = 'image/png', quality = null) {
    quality = quality || this.options.quality;

    console.log(`💾 [CanvasRenderer] Converting canvas to blob (${mimeType}, quality: ${quality})`);

    return new Promise((resolve, reject) => {
      // Safari fallback: toBlob may not be supported in older versions
      if (this.safari && !canvas.toBlob) {
        console.log('🔄 [Safari] Using toDataURL fallback');
        try {
          const dataURL = canvas.toDataURL(mimeType, quality);
          const blob = this.dataURLToBlob(dataURL);
          resolve(blob);
        } catch (error) {
          console.error('❌ [Safari] toDataURL failed:', error);
          reject(error);
        }
        return;
      }

      // Standard toBlob (Chrome, Firefox, modern Safari)
      try {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              console.log(`✅ [CanvasRenderer] Blob created: ${blob.size} bytes`);
              resolve(blob);
            } else {
              console.error('❌ [CanvasRenderer] Blob creation returned null');
              reject(new Error('Canvas to blob returned null'));
            }
          },
          mimeType,
          quality
        );
      } catch (error) {
        console.error('❌ [CanvasRenderer] toBlob failed:', error);
        reject(error);
      }
    });
  }

  /**
   * Convert data URL to Blob (Safari helper)
   * @param {string} dataURL - Data URL string
   */
  dataURLToBlob(dataURL) {
    console.log('🔄 [CanvasRenderer] Converting data URL to blob');

    const parts = dataURL.split(',');
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);

    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }

    return new Blob([u8arr], { type: mime });
  }

  /**
   * Convert canvas to data URL (Safari-compatible)
   * @param {HTMLCanvasElement} canvas - Source canvas
   * @param {string} mimeType - Output MIME type
   * @param {number} quality - Quality (0-1)
   */
  canvasToDataURL(canvas, mimeType = 'image/png', quality = null) {
    quality = quality || this.options.quality;

    try {
      return canvas.toDataURL(mimeType, quality);
    } catch (error) {
      console.error('❌ [CanvasRenderer] toDataURL failed:', error);

      // Safari fallback: Try without quality parameter
      if (this.safari) {
        return canvas.toDataURL(mimeType);
      }

      throw error;
    }
  }

  /**
   * Clear canvas with proper cleanup (Safari memory management)
   * @param {HTMLCanvasElement} canvas - Canvas to clear
   */
  clearCanvas(canvas) {
    const context = canvas.getContext('2d');

    if (context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
    }

    // Safari: Aggressive memory cleanup
    if (this.safari) {
      // Reset canvas size to free memory
      canvas.width = 0;
      canvas.height = 0;
    }

    console.log('🧹 [CanvasRenderer] Canvas cleared');
  }

  /**
   * Create thumbnail from canvas
   * @param {HTMLCanvasElement} sourceCanvas - Source canvas
   * @param {number} maxWidth - Maximum thumbnail width
   * @param {number} maxHeight - Maximum thumbnail height
   */
  createThumbnail(sourceCanvas, maxWidth = 200, maxHeight = 200) {
    console.log(`🖼️  [CanvasRenderer] Creating thumbnail (${maxWidth}x${maxHeight})`);

    const sourceWidth = sourceCanvas.width;
    const sourceHeight = sourceCanvas.height;

    // Calculate thumbnail dimensions (maintain aspect ratio)
    let thumbWidth, thumbHeight;

    if (sourceWidth > sourceHeight) {
      thumbWidth = Math.min(maxWidth, sourceWidth);
      thumbHeight = Math.round((thumbWidth / sourceWidth) * sourceHeight);
    } else {
      thumbHeight = Math.min(maxHeight, sourceHeight);
      thumbWidth = Math.round((thumbHeight / sourceHeight) * sourceWidth);
    }

    // Create thumbnail canvas
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = thumbWidth;
    thumbCanvas.height = thumbHeight;

    const context = thumbCanvas.getContext('2d', {
      alpha: false,
      desynchronized: !this.safari,
      willReadFrequently: false
    });

    if (!context) {
      throw new Error('Failed to get thumbnail canvas context');
    }

    // Safari: Enable smoothing for better quality
    if (this.safari) {
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
    }

    // Draw thumbnail
    context.drawImage(sourceCanvas, 0, 0, sourceWidth, sourceHeight, 0, 0, thumbWidth, thumbHeight);

    console.log(`✅ [CanvasRenderer] Thumbnail created: ${thumbWidth}x${thumbHeight}`);

    return thumbCanvas;
  }

  /**
   * Check if canvas operations are supported
   */
  static isSupported() {
    try {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      return !!(context && canvas.toDataURL);
    } catch (e) {
      return false;
    }
  }

  /**
   * Get renderer info for debugging
   */
  getInfo() {
    return {
      browser: this.safari ? 'Safari' : 'Other',
      platform: this.macOS ? 'macOS' : (this.iOS ? 'iOS' : 'Other'),
      maxCanvasSize: this.options.maxCanvasSize,
      scale: this.options.scale,
      quality: this.options.quality,
      webGLEnabled: this.options.enableWebGL,
      supported: CanvasRenderer.isSupported()
    };
  }
}

// Export singleton instance
export const canvasRenderer = new CanvasRenderer();
