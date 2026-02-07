/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Document Scanner Utilities
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Core utility functions for document scanning:
 * - Edge detection using OpenCV.js
 * - Corner ordering and stabilization
 * - Perspective transformation
 * - Image filters
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

export const SCANNER_CONFIG = {
  // Detection parameters
  DETECTION_SCALE: 0.5, // Scale down for faster processing
  CANNY_THRESHOLD_LOW: 50,
  CANNY_THRESHOLD_HIGH: 150,
  BLUR_KERNEL_SIZE: 5,
  APPROX_POLY_EPSILON: 0.02, // Percentage of contour perimeter
  MIN_CONTOUR_AREA_RATIO: 0.1, // Min area as ratio of frame
  MAX_CONTOUR_AREA_RATIO: 0.95, // Max area as ratio of frame

  // Stability parameters
  STABILITY_THRESHOLD: 15, // Pixel threshold for corner stability
  STABILITY_FRAMES: 8, // Frames needed for stable detection
  SMOOTHING_FACTOR: 0.3, // EMA smoothing factor (0-1, higher = more responsive)

  // Auto-capture parameters
  AUTO_CAPTURE_STABILITY_FRAMES: 12,
  AUTO_CAPTURE_HOLD_MS: 500,

  // Image quality
  OUTPUT_JPEG_QUALITY: 0.85,
  THUMBNAIL_SIZE: 120,

  // Page limits
  MAX_PAGES: 50,
  WARNING_PAGES: 25,
};

// ═══════════════════════════════════════════════════════════════════════════════
// OPENCV LOADER
// ═══════════════════════════════════════════════════════════════════════════════

let cv = null;
let cvLoadPromise = null;

/**
 * Lazily load OpenCV.js (WASM)
 * Only loads when scanner is first opened
 */
export async function loadOpenCV() {
  if (cv) return cv;

  if (cvLoadPromise) return cvLoadPromise;

  cvLoadPromise = new Promise((resolve, reject) => {
    // Check if already loaded
    if (window.cv && window.cv.Mat) {
      cv = window.cv;
      resolve(cv);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://docs.opencv.org/4.8.0/opencv.js';
    script.async = true;

    script.onload = () => {
      // OpenCV sets window.cv but needs initialization
      if (window.cv) {
        window.cv.onRuntimeInitialized = () => {
          cv = window.cv;
          console.log('[Scanner] OpenCV.js loaded successfully');
          resolve(cv);
        };
      } else {
        reject(new Error('OpenCV failed to initialize'));
      }
    };

    script.onerror = () => {
      cvLoadPromise = null;
      reject(new Error('Failed to load OpenCV.js'));
    };

    document.head.appendChild(script);
  });

  return cvLoadPromise;
}

/**
 * Check if OpenCV is loaded and ready
 */
export function isOpenCVReady() {
  return cv !== null && cv.Mat !== undefined;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CORNER ORDERING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Order corners as [topLeft, topRight, bottomRight, bottomLeft]
 * Works regardless of document orientation
 *
 * @param {Array<{x: number, y: number}>} corners - Unordered corners
 * @returns {Array<{x: number, y: number}>} - Ordered corners [TL, TR, BR, BL]
 */
export function orderCorners(corners) {
  if (!corners || corners.length !== 4) return null;

  // Calculate centroid
  const centroid = {
    x: corners.reduce((sum, c) => sum + c.x, 0) / 4,
    y: corners.reduce((sum, c) => sum + c.y, 0) / 4
  };

  // Sort corners by angle from centroid
  const sorted = corners.map(c => ({
    ...c,
    angle: Math.atan2(c.y - centroid.y, c.x - centroid.x)
  })).sort((a, b) => a.angle - b.angle);

  // Find top-left (smallest x + y sum)
  let topLeftIdx = 0;
  let minSum = Infinity;
  sorted.forEach((c, i) => {
    const sum = c.x + c.y;
    if (sum < minSum) {
      minSum = sum;
      topLeftIdx = i;
    }
  });

  // Rotate array so top-left is first
  const ordered = [];
  for (let i = 0; i < 4; i++) {
    ordered.push(sorted[(topLeftIdx + i) % 4]);
  }

  // Clean up angle property
  return ordered.map(({ x, y }) => ({ x, y }));
}

/**
 * Calculate stability score between two corner sets
 * @param {Array} prevCorners - Previous frame corners
 * @param {Array} currCorners - Current frame corners
 * @returns {number} - Stability score (lower = more stable)
 */
export function calculateStabilityScore(prevCorners, currCorners) {
  if (!prevCorners || !currCorners) return Infinity;
  if (prevCorners.length !== 4 || currCorners.length !== 4) return Infinity;

  let totalDistance = 0;
  for (let i = 0; i < 4; i++) {
    const dx = currCorners[i].x - prevCorners[i].x;
    const dy = currCorners[i].y - prevCorners[i].y;
    totalDistance += Math.sqrt(dx * dx + dy * dy);
  }

  return totalDistance / 4; // Average distance per corner
}

/**
 * Apply exponential moving average smoothing to corners
 * @param {Array} prevCorners - Previous smoothed corners
 * @param {Array} currCorners - Current detected corners
 * @param {number} alpha - Smoothing factor (0-1)
 * @returns {Array} - Smoothed corners
 */
export function smoothCorners(prevCorners, currCorners, alpha = SCANNER_CONFIG.SMOOTHING_FACTOR) {
  if (!prevCorners) return currCorners;
  if (!currCorners) return prevCorners;

  return currCorners.map((curr, i) => ({
    x: prevCorners[i].x + alpha * (curr.x - prevCorners[i].x),
    y: prevCorners[i].y + alpha * (curr.y - prevCorners[i].y)
  }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// EDGE DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Detect document edges in a video frame
 *
 * @param {HTMLCanvasElement} canvas - Canvas with video frame
 * @param {number} originalWidth - Original video width
 * @param {number} originalHeight - Original video height
 * @returns {Object|null} - { corners: [...], confidence: number } or null
 */
export function detectDocumentEdges(canvas, originalWidth, originalHeight) {
  if (!isOpenCVReady()) return null;

  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;

  // Scale factors for mapping back to original size
  const scaleX = originalWidth / width;
  const scaleY = originalHeight / height;

  let src = null;
  let gray = null;
  let blurred = null;
  let edges = null;
  let contours = null;
  let hierarchy = null;

  try {
    // Read image from canvas
    src = cv.imread(canvas);

    // Convert to grayscale
    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // Apply Gaussian blur
    blurred = new cv.Mat();
    const ksize = new cv.Size(
      SCANNER_CONFIG.BLUR_KERNEL_SIZE,
      SCANNER_CONFIG.BLUR_KERNEL_SIZE
    );
    cv.GaussianBlur(gray, blurred, ksize, 0);

    // Edge detection with Canny
    edges = new cv.Mat();
    cv.Canny(
      blurred,
      edges,
      SCANNER_CONFIG.CANNY_THRESHOLD_LOW,
      SCANNER_CONFIG.CANNY_THRESHOLD_HIGH
    );

    // Dilate to close gaps
    const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.dilate(edges, edges, kernel);
    kernel.delete();

    // Find contours
    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(
      edges,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE
    );

    // Find the largest quadrilateral contour
    const frameArea = width * height;
    const minArea = frameArea * SCANNER_CONFIG.MIN_CONTOUR_AREA_RATIO;
    const maxArea = frameArea * SCANNER_CONFIG.MAX_CONTOUR_AREA_RATIO;

    let bestContour = null;
    let bestArea = 0;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);

      if (area < minArea || area > maxArea) continue;

      // Approximate to polygon
      const epsilon = SCANNER_CONFIG.APPROX_POLY_EPSILON * cv.arcLength(contour, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(contour, approx, epsilon, true);

      // Check if quadrilateral
      if (approx.rows === 4 && cv.isContourConvex(approx) && area > bestArea) {
        bestArea = area;
        if (bestContour) bestContour.delete();
        bestContour = approx;
      } else {
        approx.delete();
      }
    }

    if (!bestContour) return null;

    // Extract corners and scale back to original size
    const corners = [];
    for (let i = 0; i < 4; i++) {
      corners.push({
        x: bestContour.data32S[i * 2] * scaleX,
        y: bestContour.data32S[i * 2 + 1] * scaleY
      });
    }

    bestContour.delete();

    // Order corners consistently
    const orderedCorners = orderCorners(corners);

    // Calculate confidence based on area ratio and shape regularity
    const confidence = Math.min(1, bestArea / (frameArea * 0.5));

    return {
      corners: orderedCorners,
      confidence,
      area: bestArea * scaleX * scaleY
    };

  } catch (error) {
    console.error('[Scanner] Edge detection error:', error);
    return null;
  } finally {
    // Clean up OpenCV objects
    if (src) src.delete();
    if (gray) gray.delete();
    if (blurred) blurred.delete();
    if (edges) edges.delete();
    if (contours) contours.delete();
    if (hierarchy) hierarchy.delete();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PERSPECTIVE TRANSFORMATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Apply perspective transformation to extract document
 *
 * @param {HTMLCanvasElement} sourceCanvas - Source canvas with image
 * @param {Array} corners - Ordered corners [TL, TR, BR, BL]
 * @param {number} outputWidth - Desired output width (optional)
 * @param {number} outputHeight - Desired output height (optional)
 * @returns {HTMLCanvasElement} - Canvas with warped document
 */
export function warpPerspective(sourceCanvas, corners, outputWidth = null, outputHeight = null) {
  if (!isOpenCVReady() || !corners || corners.length !== 4) return null;

  let src = null;
  let dst = null;
  let srcMat = null;
  let dstMat = null;
  let M = null;

  try {
    src = cv.imread(sourceCanvas);

    // Calculate output dimensions based on document aspect ratio
    const widthTop = Math.sqrt(
      Math.pow(corners[1].x - corners[0].x, 2) +
      Math.pow(corners[1].y - corners[0].y, 2)
    );
    const widthBottom = Math.sqrt(
      Math.pow(corners[2].x - corners[3].x, 2) +
      Math.pow(corners[2].y - corners[3].y, 2)
    );
    const heightLeft = Math.sqrt(
      Math.pow(corners[3].x - corners[0].x, 2) +
      Math.pow(corners[3].y - corners[0].y, 2)
    );
    const heightRight = Math.sqrt(
      Math.pow(corners[2].x - corners[1].x, 2) +
      Math.pow(corners[2].y - corners[1].y, 2)
    );

    const maxWidth = outputWidth || Math.max(widthTop, widthBottom);
    const maxHeight = outputHeight || Math.max(heightLeft, heightRight);

    // Source points (corners in order: TL, TR, BR, BL)
    srcMat = cv.matFromArray(4, 1, cv.CV_32FC2, [
      corners[0].x, corners[0].y,
      corners[1].x, corners[1].y,
      corners[2].x, corners[2].y,
      corners[3].x, corners[3].y
    ]);

    // Destination points (rectangle)
    dstMat = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0,
      maxWidth - 1, 0,
      maxWidth - 1, maxHeight - 1,
      0, maxHeight - 1
    ]);

    // Get perspective transform matrix
    M = cv.getPerspectiveTransform(srcMat, dstMat);

    // Apply transformation
    dst = new cv.Mat();
    const dsize = new cv.Size(maxWidth, maxHeight);
    cv.warpPerspective(src, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT);

    // Create output canvas
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = maxWidth;
    outputCanvas.height = maxHeight;
    cv.imshow(outputCanvas, dst);

    return outputCanvas;

  } catch (error) {
    console.error('[Scanner] Perspective warp error:', error);
    return null;
  } finally {
    if (src) src.delete();
    if (dst) dst.delete();
    if (srcMat) srcMat.delete();
    if (dstMat) dstMat.delete();
    if (M) M.delete();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// IMAGE FILTERS
// ═══════════════════════════════════════════════════════════════════════════════

export const FILTER_TYPES = {
  COLOR: 'color',
  GRAYSCALE: 'grayscale',
  BW: 'bw', // Adaptive threshold (black & white)
  ORIGINAL: 'original'
};

/**
 * Apply image filter to canvas
 *
 * @param {HTMLCanvasElement} sourceCanvas - Source canvas
 * @param {string} filterType - Filter type from FILTER_TYPES
 * @returns {HTMLCanvasElement} - Filtered canvas
 */
export function applyImageFilter(sourceCanvas, filterType) {
  if (!sourceCanvas) return null;

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = sourceCanvas.width;
  outputCanvas.height = sourceCanvas.height;

  // For original and color, just copy
  if (filterType === FILTER_TYPES.ORIGINAL || filterType === FILTER_TYPES.COLOR) {
    const ctx = outputCanvas.getContext('2d');
    ctx.drawImage(sourceCanvas, 0, 0);
    return outputCanvas;
  }

  // Use OpenCV for grayscale and B&W if available
  if (isOpenCVReady()) {
    return applyFilterWithOpenCV(sourceCanvas, filterType);
  }

  // Fallback to canvas-based filters
  return applyFilterWithCanvas(sourceCanvas, filterType);
}

function applyFilterWithOpenCV(sourceCanvas, filterType) {
  let src = null;
  let gray = null;
  let result = null;

  try {
    src = cv.imread(sourceCanvas);
    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = sourceCanvas.width;
    outputCanvas.height = sourceCanvas.height;

    if (filterType === FILTER_TYPES.GRAYSCALE) {
      cv.imshow(outputCanvas, gray);
    } else if (filterType === FILTER_TYPES.BW) {
      result = new cv.Mat();
      // Adaptive threshold for document-like B&W
      cv.adaptiveThreshold(
        gray,
        result,
        255,
        cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv.THRESH_BINARY,
        21, // Block size
        10  // C constant
      );
      cv.imshow(outputCanvas, result);
    }

    return outputCanvas;

  } catch (error) {
    console.error('[Scanner] Filter error:', error);
    return sourceCanvas;
  } finally {
    if (src) src.delete();
    if (gray) gray.delete();
    if (result) result.delete();
  }
}

function applyFilterWithCanvas(sourceCanvas, filterType) {
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = sourceCanvas.width;
  outputCanvas.height = sourceCanvas.height;
  const ctx = outputCanvas.getContext('2d');

  // Draw source
  ctx.drawImage(sourceCanvas, 0, 0);

  // Get image data
  const imageData = ctx.getImageData(0, 0, outputCanvas.width, outputCanvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Convert to grayscale
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;

    if (filterType === FILTER_TYPES.GRAYSCALE) {
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    } else if (filterType === FILTER_TYPES.BW) {
      // Simple threshold
      const threshold = 128;
      const bw = gray > threshold ? 255 : 0;
      data[i] = bw;
      data[i + 1] = bw;
      data[i + 2] = bw;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return outputCanvas;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROTATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Rotate canvas by 90 degrees
 *
 * @param {HTMLCanvasElement} sourceCanvas - Source canvas
 * @param {number} times - Number of 90-degree rotations (1-3)
 * @returns {HTMLCanvasElement} - Rotated canvas
 */
export function rotateCanvas(sourceCanvas, times = 1) {
  if (!sourceCanvas) return null;

  times = ((times % 4) + 4) % 4; // Normalize to 0-3
  if (times === 0) {
    const copy = document.createElement('canvas');
    copy.width = sourceCanvas.width;
    copy.height = sourceCanvas.height;
    copy.getContext('2d').drawImage(sourceCanvas, 0, 0);
    return copy;
  }

  const outputCanvas = document.createElement('canvas');

  if (times === 2) {
    // 180 degrees - same dimensions
    outputCanvas.width = sourceCanvas.width;
    outputCanvas.height = sourceCanvas.height;
  } else {
    // 90 or 270 degrees - swap dimensions
    outputCanvas.width = sourceCanvas.height;
    outputCanvas.height = sourceCanvas.width;
  }

  const ctx = outputCanvas.getContext('2d');
  ctx.translate(outputCanvas.width / 2, outputCanvas.height / 2);
  ctx.rotate((times * 90 * Math.PI) / 180);
  ctx.drawImage(
    sourceCanvas,
    -sourceCanvas.width / 2,
    -sourceCanvas.height / 2
  );

  return outputCanvas;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CANVAS UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a canvas from video element at full resolution
 *
 * @param {HTMLVideoElement} video - Video element
 * @returns {HTMLCanvasElement} - Canvas with video frame
 */
export function captureVideoFrame(video) {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0);
  return canvas;
}

/**
 * Create a scaled canvas for detection (faster processing)
 *
 * @param {HTMLVideoElement} video - Video element
 * @param {number} scale - Scale factor (0-1)
 * @returns {HTMLCanvasElement} - Scaled canvas
 */
export function captureScaledFrame(video, scale = SCANNER_CONFIG.DETECTION_SCALE) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(video.videoWidth * scale);
  canvas.height = Math.floor(video.videoHeight * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Convert canvas to compressed blob
 *
 * @param {HTMLCanvasElement} canvas - Canvas to convert
 * @param {string} type - MIME type
 * @param {number} quality - Quality (0-1)
 * @returns {Promise<Blob>} - Blob
 */
export function canvasToBlob(canvas, type = 'image/jpeg', quality = SCANNER_CONFIG.OUTPUT_JPEG_QUALITY) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create blob'));
      },
      type,
      quality
    );
  });
}

/**
 * Create thumbnail from canvas
 *
 * @param {HTMLCanvasElement} canvas - Source canvas
 * @param {number} maxSize - Maximum dimension
 * @returns {HTMLCanvasElement} - Thumbnail canvas
 */
export function createThumbnail(canvas, maxSize = SCANNER_CONFIG.THUMBNAIL_SIZE) {
  const aspect = canvas.width / canvas.height;
  let width, height;

  if (aspect > 1) {
    width = maxSize;
    height = Math.round(maxSize / aspect);
  } else {
    height = maxSize;
    width = Math.round(maxSize * aspect);
  }

  const thumbnail = document.createElement('canvas');
  thumbnail.width = width;
  thumbnail.height = height;

  const ctx = thumbnail.getContext('2d');
  ctx.drawImage(canvas, 0, 0, width, height);

  return thumbnail;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HAPTIC FEEDBACK
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Trigger haptic feedback if available
 *
 * @param {string} type - 'light', 'medium', 'heavy'
 */
export function triggerHaptic(type = 'medium') {
  if (!navigator.vibrate) return;

  const patterns = {
    light: [10],
    medium: [30],
    heavy: [50, 30, 50]
  };

  try {
    navigator.vibrate(patterns[type] || patterns.medium);
  } catch (e) {
    // Ignore haptic errors
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GUIDANCE TEXT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get guidance text based on detection state
 *
 * @param {Object} state - Detection state
 * @returns {string} - Guidance text
 */
export function getGuidanceText(state) {
  const { hasDetection, confidence, stabilityScore, frameArea, detectedArea } = state;

  if (!hasDetection) {
    return 'Searching for document...';
  }

  // Check if document is too small
  if (frameArea && detectedArea) {
    const areaRatio = detectedArea / frameArea;
    if (areaRatio < 0.15) {
      return 'Move closer';
    }
  }

  // Check stability
  if (stabilityScore > SCANNER_CONFIG.STABILITY_THRESHOLD * 2) {
    return 'Hold steady';
  }

  if (stabilityScore > SCANNER_CONFIG.STABILITY_THRESHOLD) {
    return 'Almost there...';
  }

  return 'Ready to capture';
}
