/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DocumentScanner - Apple Notes-style Document Scanner (Web)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * A mobile-only document scanner with:
 * - Live camera with edge detection overlay
 * - Auto/manual capture modes
 * - Corner adjustment with magnifier loupe
 * - Multi-page scanning with thumbnail tray
 * - Filters (Color, Grayscale, B&W)
 * - PDF generation and upload integration
 *
 * MOBILE ONLY: This component should only be rendered on mobile devices.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  loadOpenCV,
  isOpenCVReady,
  detectDocumentEdges,
  warpPerspective,
  applyImageFilter,
  rotateCanvas,
  captureVideoFrame,
  captureScaledFrame,
  smoothCorners,
  calculateStabilityScore,
  orderCorners,
  getGuidanceText,
  createThumbnail,
  canvasToBlob,
  triggerHaptic,
  SCANNER_CONFIG,
  FILTER_TYPES
} from './scannerUtils';
import { generatePDF, generateScanFilename, formatFileSize, estimatePDFSize } from './pdfGenerator';

// ═══════════════════════════════════════════════════════════════════════════════
// SCANNER STATES
// ═══════════════════════════════════════════════════════════════════════════════

const SCANNER_STATES = {
  INITIALIZING: 'initializing',
  CAMERA_READY: 'camera_ready',
  CAPTURING: 'capturing',
  REVIEWING: 'reviewing',
  ADJUSTING: 'adjusting',
  GENERATING_PDF: 'generating_pdf',
  ERROR: 'error'
};

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: '#000',
    zIndex: 10001,
    display: 'flex',
    flexDirection: 'column',
    touchAction: 'none'
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    padding: 'calc(env(safe-area-inset-top, 0px) + 16px) 16px 16px 16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
    background: 'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)'
  },
  headerButton: {
    padding: '8px 16px',
    background: 'rgba(255,255,255,0.2)',
    backdropFilter: 'blur(10px)',
    border: 'none',
    borderRadius: 20,
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  },
  headerButtonActive: {
    background: 'rgba(255,255,255,0.9)',
    color: '#000'
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  video: {
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  },
  overlayCanvas: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none'
  },
  guidanceText: {
    position: 'absolute',
    top: 'calc(env(safe-area-inset-top, 0px) + 80px)',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '8px 16px',
    background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(10px)',
    borderRadius: 20,
    color: '#fff',
    fontSize: 14,
    fontWeight: 500,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    whiteSpace: 'nowrap',
    zIndex: 5
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: '16px 16px calc(env(safe-area-inset-bottom, 0px) + 24px) 16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)',
    zIndex: 10
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: '50%',
    border: '4px solid #fff',
    background: 'transparent',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease'
  },
  captureButtonInner: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    background: '#fff',
    transition: 'transform 0.15s ease'
  },
  stabilityRing: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: '50%',
    border: '3px solid transparent',
    borderTopColor: '#4CD964',
    transition: 'all 0.3s ease'
  },
  thumbnailTray: {
    display: 'flex',
    gap: 8,
    overflowX: 'auto',
    padding: '8px 0',
    maxWidth: '100%',
    scrollbarWidth: 'none',
    msOverflowStyle: 'none'
  },
  thumbnail: {
    width: 48,
    height: 64,
    borderRadius: 6,
    overflow: 'hidden',
    flexShrink: 0,
    border: '2px solid transparent',
    cursor: 'pointer',
    position: 'relative'
  },
  thumbnailActive: {
    border: '2px solid #fff'
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  },
  pageCount: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    background: 'rgba(0,0,0,0.7)',
    color: '#fff',
    fontSize: 10,
    padding: '2px 4px',
    borderRadius: 4,
    fontWeight: 600
  },
  // Review screen styles
  reviewContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    background: '#1a1a1a'
  },
  reviewImage: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    position: 'relative'
  },
  reviewCanvas: {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
    borderRadius: 8
  },
  filterBar: {
    display: 'flex',
    justifyContent: 'center',
    gap: 12,
    padding: '12px 16px'
  },
  filterButton: {
    padding: '8px 16px',
    background: 'rgba(255,255,255,0.1)',
    border: 'none',
    borderRadius: 20,
    color: '#fff',
    fontSize: 13,
    fontWeight: 500,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  },
  filterButtonActive: {
    background: '#fff',
    color: '#000'
  },
  actionBar: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    padding: '16px',
    paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)'
  },
  actionButton: {
    flex: 1,
    padding: '14px 20px',
    borderRadius: 12,
    border: 'none',
    fontSize: 15,
    fontWeight: 600,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  },
  // Corner adjustment styles
  cornerHandle: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: '50%',
    border: '3px solid #4CD964',
    background: 'rgba(76, 217, 100, 0.3)',
    transform: 'translate(-50%, -50%)',
    cursor: 'grab',
    touchAction: 'none',
    zIndex: 20
  },
  magnifier: {
    position: 'fixed',
    width: 100,
    height: 100,
    borderRadius: '50%',
    border: '3px solid #fff',
    background: '#000',
    overflow: 'hidden',
    pointerEvents: 'none',
    zIndex: 1000,
    boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
  },
  magnifierCanvas: {
    width: 200,
    height: 200,
    transform: 'translate(-50px, -50px)'
  },
  crosshair: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: 20,
    height: 20,
    pointerEvents: 'none'
  },
  // Error state
  errorContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    textAlign: 'center',
    color: '#fff'
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 12,
    fontFamily: "'Plus Jakarta Sans', sans-serif"
  },
  errorMessage: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 24,
    lineHeight: 1.5,
    fontFamily: "'Plus Jakarta Sans', sans-serif"
  },
  // Loading state
  loadingContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff'
  },
  spinner: {
    width: 40,
    height: 40,
    border: '3px solid rgba(255,255,255,0.2)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

const DocumentScanner = ({
  isOpen,
  onClose,
  onScanComplete,
  folderId = null
}) => {
  const { t } = useTranslation();

  // ─────────────────────────────────────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────────────────────────────────────

  const [state, setState] = useState(SCANNER_STATES.INITIALIZING);
  const [error, setError] = useState(null);
  const [isAutoMode, setIsAutoMode] = useState(true);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [guidanceText, setGuidanceText] = useState('Initializing...');

  // Detection state
  const [detectedCorners, setDetectedCorners] = useState(null);
  const [stabilityProgress, setStabilityProgress] = useState(0);

  // Pages state
  const [pages, setPages] = useState([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(-1);
  const [currentFilter, setCurrentFilter] = useState(FILTER_TYPES.COLOR);

  // Corner adjustment state
  const [adjustedCorners, setAdjustedCorners] = useState(null);
  const [draggingCorner, setDraggingCorner] = useState(null);
  const [magnifierPos, setMagnifierPos] = useState(null);

  // ─────────────────────────────────────────────────────────────────────────────
  // REFS
  // ─────────────────────────────────────────────────────────────────────────────

  const videoRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const detectionLoopRef = useRef(null);
  const smoothedCornersRef = useRef(null);
  const stableFrameCountRef = useRef(0);
  const autoCaptureTimeoutRef = useRef(null);
  const capturedFrameRef = useRef(null);
  const reviewCanvasRef = useRef(null);
  const imageContainerRef = useRef(null);
  const initTimeoutRef = useRef(null);

  const clearInitTimeout = useCallback(() => {
    if (initTimeoutRef.current) {
      clearTimeout(initTimeoutRef.current);
      initTimeoutRef.current = null;
    }
  }, []);

  const stopActiveStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // CAMERA INITIALIZATION
  // ─────────────────────────────────────────────────────────────────────────────

  const initializeCamera = useCallback(async () => {
    const INIT_TIMEOUT_MS = 10000;
    const withTimeout = (promise, message) =>
      Promise.race([
        promise,
        new Promise((_, reject) => {
          initTimeoutRef.current = setTimeout(() => reject(new Error(message)), INIT_TIMEOUT_MS);
        })
      ]);

    const logFailure = (step, err) => {
      console.error('[Scanner] Camera initialization error:', {
        step,
        name: err?.name,
        message: err?.message,
        isSecureContext: !!window.isSecureContext,
        hasMediaDevices: !!navigator.mediaDevices,
        hasGetUserMedia: !!navigator.mediaDevices?.getUserMedia,
        userAgent: navigator.userAgent,
      });
    };

    try {
      clearInitTimeout();
      setError(null);
      setTorchSupported(false);
      setTorchOn(false);
      setState(SCANNER_STATES.INITIALIZING);
      setGuidanceText('Initializing camera...');
      stopActiveStream();

      // Check for secure context
      if (!window.isSecureContext) {
        throw new Error('Camera requires HTTPS. Please use a secure connection.');
      }

      // Check for getUserMedia support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera not supported in this browser.');
      }

      // Load OpenCV in parallel
      loadOpenCV().catch(err => {
        console.warn('[Scanner] OpenCV failed to load, edge detection disabled:', err);
      });

      setGuidanceText('Requesting camera access...');
      const primaryConstraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      };
      const fallbackConstraints = { video: true, audio: false };

      let stream = null;
      try {
        stream = await withTimeout(
          navigator.mediaDevices.getUserMedia(primaryConstraints),
          'Camera initialization timed out. Please try again.'
        );
      } catch (primaryErr) {
        console.warn('[Scanner] Primary constraints failed, retrying with fallback constraints.', primaryErr);
        stream = await withTimeout(
          navigator.mediaDevices.getUserMedia(fallbackConstraints),
          'Camera initialization timed out. Please try again.'
        );
      }
      clearInitTimeout();
      streamRef.current = stream;

      // Check torch support
      const track = stream.getVideoTracks()[0];
      if (track) {
        const capabilities = track.getCapabilities?.();
        if (capabilities?.torch) {
          setTorchSupported(true);
        }
      }

      // Set video source — video element is always in DOM now
      const video = videoRef.current;
      if (!video) {
        throw new Error('Video element not available. Please try again.');
      }

      setGuidanceText('Starting camera preview...');
      video.srcObject = stream;

      // Wait for video metadata to load
      await withTimeout(new Promise((resolve) => {
        if (video.readyState >= 2) return resolve();
        const onReady = () => {
          video.removeEventListener('loadedmetadata', onReady);
          video.removeEventListener('canplay', onReady);
          resolve();
        };
        video.addEventListener('loadedmetadata', onReady, { once: true });
        video.addEventListener('canplay', onReady, { once: true });
      }), 'Camera preview failed to load. Please try again.');

      // Play with retry — iOS Safari sometimes needs a second attempt
      try {
        await withTimeout(video.play(), 'Camera preview failed to start.');
      } catch (playErr) {
        console.warn('[Scanner] First play() failed, retrying after delay:', playErr?.name);
        await new Promise((resolve) => setTimeout(resolve, 200));
        await withTimeout(video.play(), 'Camera preview failed to start after retry.');
      }
      clearInitTimeout();

      setState(SCANNER_STATES.CAMERA_READY);
      setGuidanceText('Searching for document...');

    } catch (err) {
      clearInitTimeout();
      stopActiveStream();
      logFailure('initialize', err);

      let errorMessage = err.message;
      if (err.name === 'NotAllowedError') {
        errorMessage = 'Camera permission denied. Please allow camera access in your browser settings.';
      } else if (err.name === 'NotFoundError') {
        errorMessage = 'No camera found. Please connect a camera and try again.';
      } else if (err.name === 'NotReadableError') {
        errorMessage = 'Camera is in use by another app. Please close other apps using the camera.';
      } else if (String(err.message || '').toLowerCase().includes('timed out')) {
        errorMessage = 'Camera initialization timed out. Please try again.';
      }

      setError(errorMessage);
      setState(SCANNER_STATES.ERROR);
    }
  }, [clearInitTimeout, stopActiveStream]);

  // ─────────────────────────────────────────────────────────────────────────────
  // TORCH CONTROL
  // ─────────────────────────────────────────────────────────────────────────────

  const toggleTorch = useCallback(async () => {
    if (!streamRef.current || !torchSupported) return;

    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;

    try {
      await track.applyConstraints({
        advanced: [{ torch: !torchOn }]
      });
      setTorchOn(!torchOn);
    } catch (err) {
      console.error('[Scanner] Torch toggle failed:', err);
    }
  }, [torchOn, torchSupported]);

  // ─────────────────────────────────────────────────────────────────────────────
  // EDGE DETECTION LOOP
  // ─────────────────────────────────────────────────────────────────────────────

  const runDetectionLoop = useCallback(() => {
    if (state !== SCANNER_STATES.CAMERA_READY) return;
    if (!videoRef.current || !overlayCanvasRef.current) return;

    const video = videoRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    const ctx = overlayCanvas.getContext('2d');

    // Match canvas size to video display
    const rect = video.getBoundingClientRect();
    if (overlayCanvas.width !== rect.width || overlayCanvas.height !== rect.height) {
      overlayCanvas.width = rect.width;
      overlayCanvas.height = rect.height;
    }

    // Clear overlay
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    // Only detect if OpenCV is ready
    if (isOpenCVReady()) {
      // Capture scaled frame for detection
      const scaledCanvas = captureScaledFrame(video);
      const detection = detectDocumentEdges(
        scaledCanvas,
        video.videoWidth,
        video.videoHeight
      );

      if (detection && detection.corners) {
        // Scale corners to overlay size
        const scaleX = rect.width / video.videoWidth;
        const scaleY = rect.height / video.videoHeight;
        const scaledCorners = detection.corners.map(c => ({
          x: c.x * scaleX,
          y: c.y * scaleY
        }));

        // Smooth corners
        smoothedCornersRef.current = smoothCorners(
          smoothedCornersRef.current,
          scaledCorners
        );

        // Calculate stability
        const stability = calculateStabilityScore(
          smoothedCornersRef.current,
          scaledCorners
        );

        // Update detected corners for drawing
        setDetectedCorners(smoothedCornersRef.current);

        // Update guidance based on state
        const frameArea = rect.width * rect.height;
        const docArea = detection.area * scaleX * scaleY;
        setGuidanceText(getGuidanceText({
          hasDetection: true,
          confidence: detection.confidence,
          stabilityScore: stability,
          frameArea,
          detectedArea: docArea
        }));

        // Check stability for auto-capture
        if (stability < SCANNER_CONFIG.STABILITY_THRESHOLD) {
          stableFrameCountRef.current++;
          const progress = Math.min(100, (stableFrameCountRef.current / SCANNER_CONFIG.STABILITY_FRAMES) * 100);
          setStabilityProgress(progress);

          // Auto-capture if stable enough and in auto mode
          if (isAutoMode && stableFrameCountRef.current >= SCANNER_CONFIG.AUTO_CAPTURE_STABILITY_FRAMES) {
            if (!autoCaptureTimeoutRef.current) {
              autoCaptureTimeoutRef.current = setTimeout(() => {
                captureDocument();
                autoCaptureTimeoutRef.current = null;
              }, SCANNER_CONFIG.AUTO_CAPTURE_HOLD_MS);
            }
          }
        } else {
          stableFrameCountRef.current = Math.max(0, stableFrameCountRef.current - 2);
          setStabilityProgress(0);

          if (autoCaptureTimeoutRef.current) {
            clearTimeout(autoCaptureTimeoutRef.current);
            autoCaptureTimeoutRef.current = null;
          }
        }

        // Draw detected quad
        drawQuadOverlay(ctx, smoothedCornersRef.current, detection.confidence);

      } else {
        // No detection
        smoothedCornersRef.current = null;
        stableFrameCountRef.current = 0;
        setDetectedCorners(null);
        setStabilityProgress(0);
        setGuidanceText('Searching for document...');

        if (autoCaptureTimeoutRef.current) {
          clearTimeout(autoCaptureTimeoutRef.current);
          autoCaptureTimeoutRef.current = null;
        }
      }
    } else {
      // OpenCV not ready - show guidance
      setGuidanceText('Edge detection loading...');
    }

    // Continue loop
    detectionLoopRef.current = requestAnimationFrame(runDetectionLoop);
  }, [state, isAutoMode]);

  // ─────────────────────────────────────────────────────────────────────────────
  // DRAW OVERLAY
  // ─────────────────────────────────────────────────────────────────────────────

  const drawQuadOverlay = (ctx, corners, confidence) => {
    if (!corners || corners.length !== 4) return;

    // Darken area outside quad
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // Clear inside quad
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 4; i++) {
      ctx.lineTo(corners[i].x, corners[i].y);
    }
    ctx.closePath();
    ctx.clip();
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();

    // Draw quad border
    const color = confidence > 0.7 ? '#4CD964' : '#FFD60A';
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 4; i++) {
      ctx.lineTo(corners[i].x, corners[i].y);
    }
    ctx.closePath();
    ctx.stroke();

    // Draw corner circles
    ctx.fillStyle = color;
    corners.forEach(corner => {
      ctx.beginPath();
      ctx.arc(corner.x, corner.y, 8, 0, Math.PI * 2);
      ctx.fill();
    });
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // CAPTURE
  // ─────────────────────────────────────────────────────────────────────────────

  const captureDocument = useCallback(() => {
    if (!videoRef.current) return;

    triggerHaptic('medium');
    setState(SCANNER_STATES.CAPTURING);

    // Capture full-resolution frame
    const fullFrame = captureVideoFrame(videoRef.current);
    capturedFrameRef.current = fullFrame;

    // Get corners at original video resolution
    let corners = null;
    if (smoothedCornersRef.current) {
      const video = videoRef.current;
      const rect = video.getBoundingClientRect();
      const scaleX = video.videoWidth / rect.width;
      const scaleY = video.videoHeight / rect.height;

      corners = smoothedCornersRef.current.map(c => ({
        x: c.x * scaleX,
        y: c.y * scaleY
      }));
    }

    // If we have corners, warp the image
    let processedCanvas = fullFrame;
    if (corners && isOpenCVReady()) {
      const warped = warpPerspective(fullFrame, corners);
      if (warped) {
        processedCanvas = warped;
      }
    }

    // Apply current filter
    const filteredCanvas = applyImageFilter(processedCanvas, currentFilter);

    // Create thumbnail
    const thumbnail = createThumbnail(filteredCanvas);
    const thumbnailUrl = thumbnail.toDataURL('image/jpeg', 0.7);

    // Add page
    const newPage = {
      id: Date.now(),
      canvas: filteredCanvas,
      originalCanvas: fullFrame,
      corners: corners,
      thumbnailUrl,
      filter: currentFilter,
      rotation: 0
    };

    setPages(prev => [...prev, newPage]);
    setCurrentPageIndex(pages.length);

    // Go to review state
    setState(SCANNER_STATES.REVIEWING);

  }, [currentFilter, pages.length]);

  // ─────────────────────────────────────────────────────────────────────────────
  // PAGE OPERATIONS
  // ─────────────────────────────────────────────────────────────────────────────

  const retakePage = useCallback(() => {
    // Remove current page and go back to camera
    setPages(prev => prev.filter((_, i) => i !== currentPageIndex));
    setCurrentPageIndex(-1);
    setState(SCANNER_STATES.CAMERA_READY);
  }, [currentPageIndex]);

  const keepScan = useCallback(() => {
    // Keep current page and return to camera for next page
    setCurrentPageIndex(-1);
    setState(SCANNER_STATES.CAMERA_READY);
  }, []);

  const selectPage = useCallback((index) => {
    setCurrentPageIndex(index);
    setState(SCANNER_STATES.REVIEWING);
  }, []);

  const deletePage = useCallback((index) => {
    setPages(prev => prev.filter((_, i) => i !== index));
    if (currentPageIndex >= pages.length - 1) {
      setCurrentPageIndex(Math.max(0, pages.length - 2));
    }
    if (pages.length === 1) {
      setState(SCANNER_STATES.CAMERA_READY);
      setCurrentPageIndex(-1);
    }
  }, [currentPageIndex, pages.length]);

  const rotatePage = useCallback(() => {
    if (currentPageIndex < 0 || currentPageIndex >= pages.length) return;

    setPages(prev => prev.map((page, i) => {
      if (i !== currentPageIndex) return page;

      const rotatedCanvas = rotateCanvas(page.canvas, 1);
      const thumbnail = createThumbnail(rotatedCanvas);

      return {
        ...page,
        canvas: rotatedCanvas,
        thumbnailUrl: thumbnail.toDataURL('image/jpeg', 0.7),
        rotation: (page.rotation + 90) % 360
      };
    }));

    triggerHaptic('light');
  }, [currentPageIndex, pages.length]);

  const changeFilter = useCallback((filterType) => {
    if (currentPageIndex < 0 || currentPageIndex >= pages.length) return;

    const page = pages[currentPageIndex];
    let sourceCanvas = page.originalCanvas;

    // Re-warp if we have corners
    if (page.corners && isOpenCVReady()) {
      const warped = warpPerspective(page.originalCanvas, page.corners);
      if (warped) sourceCanvas = warped;
    }

    // Apply rotation
    if (page.rotation > 0) {
      sourceCanvas = rotateCanvas(sourceCanvas, page.rotation / 90);
    }

    // Apply new filter
    const filteredCanvas = applyImageFilter(sourceCanvas, filterType);
    const thumbnail = createThumbnail(filteredCanvas);

    setPages(prev => prev.map((p, i) => {
      if (i !== currentPageIndex) return p;
      return {
        ...p,
        canvas: filteredCanvas,
        thumbnailUrl: thumbnail.toDataURL('image/jpeg', 0.7),
        filter: filterType
      };
    }));

    setCurrentFilter(filterType);
  }, [currentPageIndex, pages]);

  // ─────────────────────────────────────────────────────────────────────────────
  // CORNER ADJUSTMENT
  // ─────────────────────────────────────────────────────────────────────────────

  const startAdjustment = useCallback(() => {
    if (currentPageIndex < 0) return;
    const page = pages[currentPageIndex];
    if (!page.corners) return;

    // Initialize adjusted corners
    setAdjustedCorners([...page.corners]);
    setState(SCANNER_STATES.ADJUSTING);
  }, [currentPageIndex, pages]);

  const handleCornerDragStart = useCallback((cornerIndex, e) => {
    e.preventDefault();
    setDraggingCorner(cornerIndex);

    const touch = e.touches?.[0] || e;
    setMagnifierPos({
      x: touch.clientX,
      y: touch.clientY - 120 // Above finger
    });
  }, []);

  const handleCornerDragMove = useCallback((e) => {
    if (draggingCorner === null || !adjustedCorners) return;

    const touch = e.touches?.[0] || e;
    const container = imageContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const page = pages[currentPageIndex];
    if (!page?.originalCanvas) return;

    // Calculate position relative to original image
    const x = ((touch.clientX - rect.left) / rect.width) * page.originalCanvas.width;
    const y = ((touch.clientY - rect.top) / rect.height) * page.originalCanvas.height;

    // Clamp to image bounds
    const clampedX = Math.max(0, Math.min(page.originalCanvas.width, x));
    const clampedY = Math.max(0, Math.min(page.originalCanvas.height, y));

    // Update corner
    setAdjustedCorners(prev => {
      const updated = [...prev];
      updated[draggingCorner] = { x: clampedX, y: clampedY };
      return updated;
    });

    // Update magnifier position
    setMagnifierPos({
      x: touch.clientX,
      y: touch.clientY - 120
    });
  }, [draggingCorner, adjustedCorners, currentPageIndex, pages]);

  const handleCornerDragEnd = useCallback(() => {
    setDraggingCorner(null);
    setMagnifierPos(null);
  }, []);

  const applyAdjustment = useCallback(() => {
    if (!adjustedCorners || currentPageIndex < 0) return;

    const page = pages[currentPageIndex];

    // Re-order corners to ensure correct orientation
    const ordered = orderCorners(adjustedCorners);

    // Warp with new corners
    let processedCanvas = page.originalCanvas;
    if (isOpenCVReady()) {
      const warped = warpPerspective(page.originalCanvas, ordered);
      if (warped) processedCanvas = warped;
    }

    // Apply rotation
    if (page.rotation > 0) {
      processedCanvas = rotateCanvas(processedCanvas, page.rotation / 90);
    }

    // Apply filter
    const filteredCanvas = applyImageFilter(processedCanvas, page.filter);
    const thumbnail = createThumbnail(filteredCanvas);

    setPages(prev => prev.map((p, i) => {
      if (i !== currentPageIndex) return p;
      return {
        ...p,
        canvas: filteredCanvas,
        corners: ordered,
        thumbnailUrl: thumbnail.toDataURL('image/jpeg', 0.7)
      };
    }));

    setAdjustedCorners(null);
    setState(SCANNER_STATES.REVIEWING);
    triggerHaptic('light');
  }, [adjustedCorners, currentPageIndex, pages]);

  const resetCorners = useCallback(() => {
    if (currentPageIndex < 0) return;
    const page = pages[currentPageIndex];
    if (page.corners) {
      setAdjustedCorners([...page.corners]);
    }
  }, [currentPageIndex, pages]);

  // ─────────────────────────────────────────────────────────────────────────────
  // SAVE / CANCEL
  // ─────────────────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (pages.length === 0) return;

    setState(SCANNER_STATES.GENERATING_PDF);
    triggerHaptic('medium');

    try {
      const pdfFile = await generatePDF(pages);
      onScanComplete?.(pdfFile, folderId);
      handleClose();
    } catch (err) {
      console.error('[Scanner] PDF generation failed:', err);
      setError('Failed to generate PDF. Please try again.');
      setState(SCANNER_STATES.ERROR);
    }
  }, [pages, folderId, onScanComplete]);

  const handleClose = useCallback(() => {
    // Confirm if pages exist
    if (pages.length > 0 && state !== SCANNER_STATES.GENERATING_PDF) {
      if (!window.confirm('Discard scanned pages?')) {
        return;
      }
    }

    // Cleanup
    clearInitTimeout();
    stopActiveStream();
    if (detectionLoopRef.current) {
      cancelAnimationFrame(detectionLoopRef.current);
      detectionLoopRef.current = null;
    }
    if (autoCaptureTimeoutRef.current) {
      clearTimeout(autoCaptureTimeoutRef.current);
      autoCaptureTimeoutRef.current = null;
    }

    // Reset state
    setPages([]);
    setCurrentPageIndex(-1);
    setDetectedCorners(null);
    setError(null);
    setState(SCANNER_STATES.INITIALIZING);

    onClose?.();
  }, [pages.length, state, onClose, clearInitTimeout, stopActiveStream]);

  // ─────────────────────────────────────────────────────────────────────────────
  // EFFECTS
  // ─────────────────────────────────────────────────────────────────────────────

  // Initialize camera when opened
  useEffect(() => {
    if (isOpen) {
      initializeCamera();
    }

    return () => {
      clearInitTimeout();
      stopActiveStream();
      if (detectionLoopRef.current) {
        cancelAnimationFrame(detectionLoopRef.current);
      }
    };
  }, [isOpen, initializeCamera, clearInitTimeout, stopActiveStream]);

  // Start detection loop when camera ready
  useEffect(() => {
    if (state === SCANNER_STATES.CAMERA_READY) {
      detectionLoopRef.current = requestAnimationFrame(runDetectionLoop);
    }

    return () => {
      if (detectionLoopRef.current) {
        cancelAnimationFrame(detectionLoopRef.current);
      }
    };
  }, [state, runDetectionLoop]);

  // Handle corner drag events
  useEffect(() => {
    if (state !== SCANNER_STATES.ADJUSTING) return;

    const handleMove = (e) => handleCornerDragMove(e);
    const handleEnd = () => handleCornerDragEnd();

    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);

    return () => {
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
    };
  }, [state, handleCornerDragMove, handleCornerDragEnd]);

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  if (!isOpen) return null;

  const currentPage = currentPageIndex >= 0 ? pages[currentPageIndex] : null;

  const content = (
    <div style={styles.overlay}>
      {/* Keyframe animations */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      {/* ERROR STATE */}
      {state === SCANNER_STATES.ERROR && (
        <>
          <div style={styles.header}>
            <button style={styles.headerButton} onClick={handleClose}>
              Cancel
            </button>
          </div>
          <div style={styles.errorContainer}>
            <div style={styles.errorTitle}>Camera Error</div>
            <div style={styles.errorMessage}>{error}</div>
            <button
              style={{
                ...styles.actionButton,
                background: '#fff',
                color: '#000',
                maxWidth: 200
              }}
              onClick={initializeCamera}
            >
              Try Again
            </button>
          </div>
        </>
      )}

      {/*
        Video element is ALWAYS in the DOM so videoRef is available during
        initializeCamera(). iOS Safari deactivates streams not immediately
        attached to a visible <video>, so it must exist before getUserMedia resolves.
      */}
      <div style={{
        ...styles.cameraContainer,
        // Behind the loading overlay during init; visible once camera is ready
        opacity: (state === SCANNER_STATES.CAMERA_READY || state === SCANNER_STATES.CAPTURING) ? 1 : 0,
        pointerEvents: (state === SCANNER_STATES.CAMERA_READY || state === SCANNER_STATES.CAPTURING) ? 'auto' : 'none',
      }}>
        <video
          ref={videoRef}
          style={styles.video}
          autoPlay
          playsInline
          muted
        />
        <canvas ref={overlayCanvasRef} style={styles.overlayCanvas} />
      </div>

      {/* LOADING STATE */}
      {state === SCANNER_STATES.INITIALIZING && (
        <div style={styles.loadingContainer}>
          <div style={styles.spinner} />
          <div style={{ marginTop: 16, fontSize: 14 }}>{guidanceText}</div>
        </div>
      )}

      {/* CAMERA VIEW */}
      {(state === SCANNER_STATES.CAMERA_READY || state === SCANNER_STATES.CAPTURING) && (
        <>
          {/* Header */}
          <div style={styles.header}>
            <button style={styles.headerButton} onClick={handleClose}>
              Cancel
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              {torchSupported && (
                <button
                  style={{
                    ...styles.headerButton,
                    ...(torchOn ? styles.headerButtonActive : {})
                  }}
                  onClick={toggleTorch}
                >
                  {torchOn ? 'Flash On' : 'Flash Off'}
                </button>
              )}
              <button
                style={{
                  ...styles.headerButton,
                  ...(isAutoMode ? styles.headerButtonActive : {})
                }}
                onClick={() => setIsAutoMode(!isAutoMode)}
              >
                {isAutoMode ? 'Auto' : 'Manual'}
              </button>
            </div>
          </div>

          {/* Guidance text */}
          <div style={styles.guidanceText}>{guidanceText}</div>

          {/* Footer */}
          <div style={styles.footer}>
            {/* Thumbnail tray */}
            {pages.length > 0 && (
              <div style={styles.thumbnailTray}>
                {pages.map((page, index) => (
                  <div
                    key={page.id}
                    style={{
                      ...styles.thumbnail,
                      ...(index === currentPageIndex ? styles.thumbnailActive : {})
                    }}
                    onClick={() => selectPage(index)}
                  >
                    <img src={page.thumbnailUrl} alt="" style={styles.thumbnailImage} />
                    <div style={styles.pageCount}>{index + 1}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Capture button */}
            <div style={{ position: 'relative' }}>
              {isAutoMode && stabilityProgress > 0 && (
                <div
                  style={{
                    ...styles.stabilityRing,
                    transform: `rotate(${-90 + (stabilityProgress * 3.6)}deg)`,
                    borderTopColor: stabilityProgress > 80 ? '#4CD964' : '#FFD60A'
                  }}
                />
              )}
              <button
                style={styles.captureButton}
                onClick={captureDocument}
                disabled={state === SCANNER_STATES.CAPTURING}
              >
                <div
                  style={{
                    ...styles.captureButtonInner,
                    transform: state === SCANNER_STATES.CAPTURING ? 'scale(0.9)' : 'scale(1)'
                  }}
                />
              </button>
            </div>

            {/* Save button (if pages exist) */}
            {pages.length > 0 && (
              <button
                style={{
                  ...styles.headerButton,
                  background: '#4CD964',
                  color: '#fff'
                }}
                onClick={handleSave}
              >
                Save ({pages.length} {pages.length === 1 ? 'page' : 'pages'})
              </button>
            )}
          </div>
        </>
      )}

      {/* REVIEW STATE */}
      {state === SCANNER_STATES.REVIEWING && currentPage && (
        <div style={styles.reviewContainer}>
          {/* Header */}
          <div style={styles.header}>
            <button style={styles.headerButton} onClick={retakePage}>
              Retake
            </button>
            <button
              style={{ ...styles.headerButton, background: '#4CD964', color: '#fff' }}
              onClick={keepScan}
            >
              Keep Scan
            </button>
          </div>

          {/* Image */}
          <div style={styles.reviewImage} ref={imageContainerRef}>
            <img
              src={currentPage.canvas.toDataURL('image/jpeg', 0.9)}
              alt="Scanned document"
              style={styles.reviewCanvas}
            />
          </div>

          {/* Filter bar */}
          <div style={styles.filterBar}>
            {Object.values(FILTER_TYPES).map((filter) => (
              <button
                key={filter}
                style={{
                  ...styles.filterButton,
                  ...(currentPage.filter === filter ? styles.filterButtonActive : {})
                }}
                onClick={() => changeFilter(filter)}
              >
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div style={styles.actionBar}>
            <button
              style={{
                ...styles.actionButton,
                background: 'rgba(255,255,255,0.1)',
                color: '#fff'
              }}
              onClick={rotatePage}
            >
              Rotate
            </button>
            {currentPage.corners && (
              <button
                style={{
                  ...styles.actionButton,
                  background: 'rgba(255,255,255,0.1)',
                  color: '#fff'
                }}
                onClick={startAdjustment}
              >
                Adjust
              </button>
            )}
            {pages.length > 1 && (
              <button
                style={{
                  ...styles.actionButton,
                  background: 'rgba(255,60,60,0.2)',
                  color: '#ff3c3c'
                }}
                onClick={() => deletePage(currentPageIndex)}
              >
                Delete
              </button>
            )}
          </div>

          {/* Thumbnail tray */}
          {pages.length > 1 && (
            <div style={{
              ...styles.thumbnailTray,
              padding: '8px 16px',
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)'
            }}>
              {pages.map((page, index) => (
                <div
                  key={page.id}
                  style={{
                    ...styles.thumbnail,
                    ...(index === currentPageIndex ? styles.thumbnailActive : {})
                  }}
                  onClick={() => selectPage(index)}
                >
                  <img src={page.thumbnailUrl} alt="" style={styles.thumbnailImage} />
                  <div style={styles.pageCount}>{index + 1}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ADJUSTING STATE */}
      {state === SCANNER_STATES.ADJUSTING && currentPage && adjustedCorners && (
        <div style={styles.reviewContainer}>
          {/* Header */}
          <div style={styles.header}>
            <button
              style={styles.headerButton}
              onClick={() => {
                setAdjustedCorners(null);
                setState(SCANNER_STATES.REVIEWING);
              }}
            >
              Cancel
            </button>
            <button style={styles.headerButton} onClick={resetCorners}>
              Reset
            </button>
            <button
              style={{ ...styles.headerButton, background: '#4CD964', color: '#fff' }}
              onClick={applyAdjustment}
            >
              Apply
            </button>
          </div>

          {/* Image with corner handles */}
          <div style={styles.reviewImage} ref={imageContainerRef}>
            <img
              src={currentPage.originalCanvas.toDataURL('image/jpeg', 0.9)}
              alt="Adjust corners"
              style={{ ...styles.reviewCanvas, opacity: 0.8 }}
            />

            {/* Corner handles */}
            {adjustedCorners.map((corner, index) => {
              const container = imageContainerRef.current;
              if (!container) return null;

              const rect = container.getBoundingClientRect();
              const imgRect = container.querySelector('img')?.getBoundingClientRect();
              if (!imgRect) return null;

              const x = imgRect.left - rect.left + (corner.x / currentPage.originalCanvas.width) * imgRect.width;
              const y = imgRect.top - rect.top + (corner.y / currentPage.originalCanvas.height) * imgRect.height;

              return (
                <div
                  key={index}
                  style={{
                    ...styles.cornerHandle,
                    left: x,
                    top: y,
                    cursor: draggingCorner === index ? 'grabbing' : 'grab'
                  }}
                  onTouchStart={(e) => handleCornerDragStart(index, e)}
                  onMouseDown={(e) => handleCornerDragStart(index, e)}
                />
              );
            })}
          </div>

          {/* Magnifier */}
          {magnifierPos && draggingCorner !== null && currentPage && (
            <div
              style={{
                ...styles.magnifier,
                left: magnifierPos.x - 50,
                top: Math.max(100, magnifierPos.y)
              }}
            >
              <MagnifierContent
                canvas={currentPage.originalCanvas}
                corner={adjustedCorners[draggingCorner]}
              />
            </div>
          )}
        </div>
      )}

      {/* GENERATING PDF STATE */}
      {state === SCANNER_STATES.GENERATING_PDF && (
        <div style={styles.loadingContainer}>
          <div style={styles.spinner} />
          <div style={{ marginTop: 16, fontSize: 14 }}>Generating PDF...</div>
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
            {pages.length} {pages.length === 1 ? 'page' : 'pages'}
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(content, document.body);
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAGNIFIER CONTENT COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

const MagnifierContent = ({ canvas, corner }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !canvas || !corner) return;

    const ctx = canvasRef.current.getContext('2d');
    const zoom = 2;
    const size = 100;

    ctx.clearRect(0, 0, 200, 200);

    // Draw zoomed portion centered on corner
    ctx.drawImage(
      canvas,
      corner.x - size / zoom / 2,
      corner.y - size / zoom / 2,
      size / zoom,
      size / zoom,
      0,
      0,
      200,
      200
    );
  }, [canvas, corner]);

  return (
    <>
      <canvas ref={canvasRef} width={200} height={200} style={styles.magnifierCanvas} />
      <svg style={styles.crosshair} viewBox="0 0 20 20">
        <line x1="10" y1="0" x2="10" y2="20" stroke="#4CD964" strokeWidth="1" />
        <line x1="0" y1="10" x2="20" y2="10" stroke="#4CD964" strokeWidth="1" />
      </svg>
    </>
  );
};

export default DocumentScanner;
