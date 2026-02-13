import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { useTranslation } from 'react-i18next';
import { ROUTES } from '../../constants/routes';
import { useAuthModal } from '../../context/AuthModalContext';
import { ReactComponent as CloseIcon } from '../../assets/x-close.svg';
import fileTypesStackIcon from '../../assets/file-types-stack.svg';
import mobileUploadIllustration from '../../assets/file-types-stack.svg';
import { ReactComponent as CheckIcon } from '../../assets/check.svg';
import cleanDocumentName from '../../utils/cleanDocumentName';
// ✅ REFACTORED: Use unified upload service (replaces folderUploadService + presignedUploadService)
import unifiedUploadService from '../../services/unifiedUploadService';
import { shouldUseResumableUpload, UPLOAD_CONFIG } from '../../config/upload.config';
import { DocumentScanner } from '../scanner';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useDocuments } from '../../context/DocumentsContext';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationsStore';
import { analyzeFileBatch, determineNotifications } from '../../utils/files/fileTypeAnalyzer';
import api from '../../services/api';
import pdfIcon from '../../assets/pdf-icon.png';
import docIcon from '../../assets/doc-icon.png';
import txtIcon from '../../assets/txt-icon.png';
import xlsIcon from '../../assets/xls.png';
import pptxIcon from '../../assets/pptx.png';
import jpgIcon from '../../assets/jpg-icon.png';
import pngIcon from '../../assets/png-icon.png';
import movIcon from '../../assets/mov.png';
import mp4Icon from '../../assets/mp4.png';
import mp3Icon from '../../assets/mp3.svg';
import folderIcon from '../../assets/folder_icon.svg';

// ═══════════════════════════════════════════════════════════════════════════════
// PROGRESS INVARIANTS - UI LAYER ENFORCEMENT
// ═══════════════════════════════════════════════════════════════════════════════
// These helpers enforce NON-NEGOTIABLE progress invariants at the UI layer:
// A) Progress must be MONOTONIC: never decreases
// B) Progress must be CLAMPED to [0, 100]
// C) Sizes must always use local File.size (never 0)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Enforce monotonic progress - percentage can only increase, never decrease
 * @param {number} currentProgress - Current progress percentage
 * @param {number} newProgress - New progress percentage
 * @param {string} itemId - Item ID for debugging
 * @returns {number} - Monotonic progress (max of current and new)
 */
function enforceMonotonicProgress(currentProgress, newProgress, itemId = '') {
  // INVARIANT A: Monotonic - never decrease
  const current = currentProgress || 0;
  const next = newProgress || 0;

  // INVARIANT B: Clamp to [0, 100]
  const clamped = Math.max(0, Math.min(100, next));

  // Return maximum (monotonic guarantee)
  const result = Math.max(current, clamped);

  // Debug logging
  if (typeof window !== 'undefined' && window.DEBUG_UPLOAD) {
    if (next < current) {
      console.warn(`[ProgressUI] BLOCKED non-monotonic update for ${itemId}: ${current.toFixed(1)} → ${next.toFixed(1)} (kept ${result.toFixed(1)})`);
    } else if (clamped !== next) {
      console.warn(`[ProgressUI] CLAMPED progress for ${itemId}: ${next.toFixed(1)} → ${clamped.toFixed(1)}`);
    }
  }

  return result;
}

/**
 * Ensure bytes values are never 0 when we have a known file size
 * @param {number} bytesFromService - Bytes value from upload service
 * @param {number} localFileSize - Local file size (File.size)
 * @returns {number} - Non-zero bytes value
 */
function enforceNonZeroBytes(bytesFromService, localFileSize) {
  // INVARIANT C: Size must always be positive from local File.size
  if (bytesFromService > 0) return bytesFromService;
  if (localFileSize > 0) return localFileSize;
  return 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONCURRENCY LIMITER - p-limit style semaphore for controlled parallelism
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Creates a simple concurrency limiter (p-limit style)
 * @param {number} concurrency - Maximum concurrent tasks
 * @returns {function} - Function to limit async tasks
 */
function createLimiter(concurrency) {
  let activeCount = 0;
  const queue = [];

  const next = () => {
    if (queue.length > 0 && activeCount < concurrency) {
      activeCount++;
      const { task, resolve, reject } = queue.shift();
      task().then(resolve).catch(reject).finally(() => {
        activeCount--;
        next();
      });
    }
  };

  return (task) => new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject });
    next();
  });
}

// Maximum concurrent entry-level uploads (folders or individual files)
const MAX_CONCURRENT_ENTRIES = 4;

// ═══════════════════════════════════════════════════════════════════════════════
// UPLOAD PHASES - Explicit state machine for UI clarity
// ═══════════════════════════════════════════════════════════════════════════════
const UPLOAD_PHASES = {
  IDLE: 'idle',
  ANALYZING: 'analyzing',
  UPLOADING: 'uploading',
  FINALIZING: 'finalizing',
  PROCESSING: 'processing',
  DONE: 'done',
  ERROR: 'error'
};

// ═══════════════════════════════════════════════════════════════════════════════
// FINALIZE CONFIGURATION - Hardened timeouts and retries
// ═══════════════════════════════════════════════════════════════════════════════
const FINALIZE_CONFIG = {
  TIMEOUT_MS: 30000,          // 30 second timeout for finalize
  MAX_RETRIES: 3,             // Maximum retry attempts
  RETRY_BASE_DELAY_MS: 2000,  // Exponential backoff base
  POLL_INTERVAL_MS: 3000,     // Backend status polling interval
  POLL_MAX_ATTEMPTS: 20       // Max poll attempts (60s total)
};

// ═══════════════════════════════════════════════════════════════════════════════
// PROCESSING PHASE PROGRESS - Time-based easing for non-byte phases
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Creates a time-based progress animator for FINALIZING/PROCESSING phases
 * Uses easing function to smoothly animate from start to target
 * @param {function} onProgress - Callback with current progress (0-100)
 * @param {number} startPercent - Starting percentage
 * @param {number} targetPercent - Target percentage (never exceeds this until snap)
 * @param {number} durationMs - Animation duration in ms
 * @returns {{ stop: function, snapToTarget: function }} - Control functions
 */
function createTimeBasedProgress(onProgress, startPercent, targetPercent, durationMs = 10000) {
  let startTime = Date.now();
  let animationFrame = null;
  let stopped = false;

  // Ease-out cubic for natural deceleration
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  const animate = () => {
    if (stopped) return;

    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / durationMs, 0.95); // Never reach 100% naturally
    const eased = easeOutCubic(progress);
    const currentPercent = startPercent + (targetPercent - startPercent) * eased;

    onProgress(Math.round(currentPercent * 10) / 10); // Round to 1 decimal

    if (progress < 0.95) {
      animationFrame = setTimeout(animate, 100); // Update every 100ms
    }
  };

  animate();

  return {
    stop: () => {
      stopped = true;
      if (animationFrame) clearTimeout(animationFrame);
    },
    snapToTarget: () => {
      stopped = true;
      if (animationFrame) clearTimeout(animationFrame);
      onProgress(targetPercent);
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// RETRY WITH TIMEOUT - Promise wrapper for finalize operations
// ═══════════════════════════════════════════════════════════════════════════════
async function executeWithTimeoutAndRetry(operation, operationName, config = FINALIZE_CONFIG) {
  let lastError = null;

  for (let attempt = 1; attempt <= config.MAX_RETRIES; attempt++) {
    try {
      // Race between operation and timeout
      const result = await Promise.race([
        operation(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`${operationName} timed out after ${config.TIMEOUT_MS}ms`)), config.TIMEOUT_MS)
        )
      ]);
      return { success: true, data: result };
    } catch (error) {
      lastError = error;
      console.warn(`[Finalize] ${operationName} attempt ${attempt}/${config.MAX_RETRIES} failed:`, error.message);

      if (attempt < config.MAX_RETRIES) {
        const delay = config.RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(`[Finalize] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  return { success: false, error: lastError };
}

const UniversalUploadModal = ({ isOpen, onClose, categoryId = null, onUploadComplete, initialFiles = null }) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { showError, addNotification, showFileTypeDetected, showUnsupportedFiles, showLimitedSupportFiles } = useNotifications();
  // ✅ FIX: Get fetchAllData to force refresh all documents after upload
  const { fetchFolders, invalidateCache, fetchAllData } = useDocuments();
  const { isAuthenticated } = useAuth();
  const authModal = useAuthModal();

  const [uploadingFiles, setUploadingFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [folderUploadProgress, setFolderUploadProgress] = useState(null);
  const [showErrorBanner, setShowErrorBanner] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showNotification, setShowNotification] = useState(false);
  const [notificationType, setNotificationType] = useState('success');
  const [uploadedCount, setUploadedCount] = useState(0);
  const folderInputRef = React.useRef(null);

  // Document Scanner state (mobile only)
  const [showScanner, setShowScanner] = useState(false);

  // ═══════════════════════════════════════════════════════════════════════════════
  // FIX #1: Track ACCEPTED files count (post-filtering) for correct denominator
  // ═══════════════════════════════════════════════════════════════════════════════
  const [acceptedFilesCount, setAcceptedFilesCount] = useState(0);

  // ═══════════════════════════════════════════════════════════════════════════════
  // FIX #2: Explicit phase tracking for UI clarity
  // ═══════════════════════════════════════════════════════════════════════════════
  const [uploadPhase, setUploadPhase] = useState(UPLOAD_PHASES.IDLE);
  const [phaseMessage, setPhaseMessage] = useState('');

  // ═══════════════════════════════════════════════════════════════════════════════
  // FIX #3: Use ref to track failures to avoid stale state race condition
  // ═══════════════════════════════════════════════════════════════════════════════
  const failureCountRef = useRef(0);
  const successCountRef = useRef(0);

  // ═══════════════════════════════════════════════════════════════════════════════
  // HARDENING: Additional state for robust completion
  // ═══════════════════════════════════════════════════════════════════════════════
  const [globalProgress, setGlobalProgress] = useState(0);           // Single source of truth for progress bar
  const [finalizeError, setFinalizeError] = useState(null);          // Error state for finalize failures
  const [canRetryFinalize, setCanRetryFinalize] = useState(false);   // Show retry CTA
  const timeBasedProgressRef = useRef(null);                         // Ref to control time-based animator
  const uploadSessionRef = useRef(null);                             // Store session data for retry/polling
  const pollingIntervalRef = useRef(null);                           // Backend polling interval
  const correlationIdRef = useRef(null);                             // Correlation ID for logging

  // 🔧 GOOGLE DRIVE STYLE: Track throughput data for display
  const [throughputData, setThroughputData] = useState({
    throughputMbps: 0,
    bytesUploaded: 0,
    totalBytes: 0,
    etaSeconds: null
  });
  // 🔧 FIX #5: UI resilience - detect stalled progress for shimmer animation (per-item)
  const lastProgressByItemRef = React.useRef(new Map()); // Map<itemId, {progress, timestamp, timerId}>

  // ═══════════════════════════════════════════════════════════════════════════════
  // AUTHORITATIVE COMPLETION FUNCTION - Single source of truth for upload completion
  // ═══════════════════════════════════════════════════════════════════════════════
  const completeUpload = useCallback((successCount, failureCount, correlationId) => {
    console.log(`[UploadModal:${correlationId}] completeUpload() called - FORCING 100%`);

    // Stop any time-based progress animations
    if (timeBasedProgressRef.current) {
      timeBasedProgressRef.current.stop();
      timeBasedProgressRef.current = null;
    }

    // Stop any backend polling
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    // UNCONDITIONALLY set progress to 100%
    setGlobalProgress(100);

    // Set all uploading files to 100% progress
    setUploadingFiles(prev => prev.map(f =>
      f.status === 'uploading' ? { ...f, progress: 100, status: 'completed' } : f
    ));

    // Set phase to DONE
    setUploadPhase(UPLOAD_PHASES.DONE);
    setPhaseMessage(`Upload complete: ${successCount} succeeded${failureCount > 0 ? `, ${failureCount} failed` : ''}`);
    setIsUploading(false);
    setFinalizeError(null);
    setCanRetryFinalize(false);

    console.log(`[UploadModal:${correlationId}] ========== UPLOAD COMPLETE - 100% ==========`);
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════════
  // ERROR STATE FUNCTION - Handle finalize/processing failures
  // ═══════════════════════════════════════════════════════════════════════════════
  const handleFinalizeError = useCallback((error, correlationId) => {
    console.error(`[UploadModal:${correlationId}] Finalize error:`, error);

    // Stop any progress animations
    if (timeBasedProgressRef.current) {
      timeBasedProgressRef.current.stop();
      timeBasedProgressRef.current = null;
    }

    setUploadPhase(UPLOAD_PHASES.ERROR);
    setPhaseMessage(`Finalize failed: ${error.message || 'Unknown error'}`);
    setFinalizeError(error);
    setCanRetryFinalize(true);
    setIsUploading(false);
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════════
  // BACKEND STATUS POLLING - Fallback for socket drops/tab sleep
  // ═══════════════════════════════════════════════════════════════════════════════
  const pollBackendStatus = useCallback(async (documentIds, correlationId) => {
    if (!documentIds || documentIds.length === 0) return { allComplete: true };

    let attempts = 0;
    const maxAttempts = FINALIZE_CONFIG.POLL_MAX_ATTEMPTS;

    return new Promise((resolve) => {
      pollingIntervalRef.current = setInterval(async () => {
        attempts++;
        console.log(`[UploadModal:${correlationId}] Polling backend status (attempt ${attempts}/${maxAttempts})`);

        try {
          // Poll a sample of document IDs (first 5) to check status
          const sampleIds = documentIds.slice(0, 5);
          const statusPromises = sampleIds.map(id =>
            api.get(`/api/documents/${id}/status`).catch(() => ({ data: { status: 'unknown' } }))
          );
          const statuses = await Promise.all(statusPromises);

          // Check if all sampled documents are in a terminal state
          const allTerminal = statuses.every(s =>
            ['available', 'processing', 'completed', 'failed', 'failed_incomplete'].includes(s.data?.status)
          );

          if (allTerminal) {
            console.log(`[UploadModal:${correlationId}] Backend polling: all documents in terminal state`);
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
            resolve({ allComplete: true });
          }
        } catch (error) {
          console.warn(`[UploadModal:${correlationId}] Polling error:`, error.message);
        }

        if (attempts >= maxAttempts) {
          console.warn(`[UploadModal:${correlationId}] Polling max attempts reached, assuming complete`);
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
          resolve({ allComplete: true, timeout: true });
        }
      }, FINALIZE_CONFIG.POLL_INTERVAL_MS);
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clean up stall timers
      lastProgressByItemRef.current.forEach((val) => {
        if (val.timerId) clearTimeout(val.timerId);
      });
      // Clean up time-based progress
      if (timeBasedProgressRef.current) {
        timeBasedProgressRef.current.stop();
      }
      // Clean up polling interval
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // iOS-safe body scroll lock when modal is open (mobile only)
  useEffect(() => {
    if (!isOpen || !isMobile) return;

    // Store current scroll position
    const scrollY = window.scrollY;

    // Lock body scroll (iOS-safe technique)
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.overflow = 'hidden';
    document.body.classList.add('modal-open');

    return () => {
      // Restore body scroll
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.overflow = '';
      document.body.classList.remove('modal-open');

      // Restore scroll position
      window.scrollTo(0, scrollY);
    };
  }, [isOpen, isMobile]);

  const onDrop = useCallback((acceptedFiles) => {
    // Separate folder files from regular files
    const folderFiles = acceptedFiles.filter(file => file.webkitRelativePath);
    const regularFiles = acceptedFiles.filter(file => !file.webkitRelativePath);

    // Filter out empty files (0 bytes) - skip them but DON'T abort the entire upload
    const validFiles = regularFiles.filter(file => file.size > 0);
    const skippedEmptyFiles = regularFiles.filter(file => file.size === 0);

    // Log skipped files but continue with valid ones
    if (skippedEmptyFiles.length > 0) {
      console.log(`⏭️ [Upload] Skipping ${skippedEmptyFiles.length} empty (0-byte) files:`, skippedEmptyFiles.map(f => f.name));
      // Only show error if ALL files are invalid
      if (validFiles.length === 0 && folderFiles.length === 0) {
        showError(t('alerts.folderDragDropNotSupported'));
        return;
      }
    }

    const newEntries = [];

    // Process folder files - group by root folder name
    if (folderFiles.length > 0) {
      const folderGroups = {};

      folderFiles.forEach(file => {
        const folderName = file.webkitRelativePath.split('/')[0];
        if (!folderGroups[folderName]) {
          folderGroups[folderName] = [];
        }
        folderGroups[folderName].push(file);
      });

      // Create a folder entry for each folder
      Object.entries(folderGroups).forEach(([folderName, files]) => {
        if (files.length > UPLOAD_CONFIG.MAX_FOLDER_FILES) {
          showError(`Folder "${folderName}" has ${files.length} files. Maximum is ${UPLOAD_CONFIG.MAX_FOLDER_FILES} files per folder.`);
          return;
        }

        const totalSize = files.reduce((sum, file) => sum + file.size, 0);

        newEntries.push({
          file: files[0], // Store first file as reference
          allFiles: files, // Store all files for upload
          id: Math.random().toString(36).substr(2, 9),
          status: 'pending',
          progress: 0,
          error: null,
          isFolder: true,
          folderName: folderName,
          fileCount: files.length,
          totalSize: totalSize,
          processingStage: null
        });
      });
    }

    // Process valid regular files only (not empty files)
    if (validFiles.length > 0) {
      validFiles.forEach(file => {
        newEntries.push({
          file,
          id: Math.random().toString(36).substr(2, 9),
          status: 'pending',
          progress: 0,
          error: null,
          path: file.path || file.name,
          folderPath: file.path ? file.path.substring(0, file.path.lastIndexOf('/')) : null,
          isFolder: false,
          processingStage: null
        });
      });
    }

    // Add all file entries in a single state update — no loading indicator, no yield
    setUploadingFiles(prev => [...prev, ...newEntries]);
  }, []);

  /**
   * Custom drag and drop handler for folders
   * Uses webkitGetAsEntry() to traverse folder structure
   */
  const handleDragDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const items = Array.from(e.dataTransfer.items);
    // Check if any item is a folder
    const hasFolder = items.some(item => {
      const entry = item.webkitGetAsEntry?.();
      return entry && entry.isDirectory;
    });

    if (!hasFolder) {
      // No folders - let react-dropzone handle it
      return;
    }
    // Process all items (files and folders)
    const allFiles = [];

    for (const item of items) {
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry();
        if (entry) {
          await traverseFileTree(entry, '', allFiles);
        }
      }
    }
    // Pass to existing onDrop function
    if (allFiles.length > 0) {
      onDrop(allFiles);
    }
  }, [onDrop]);

  /**
   * Recursively traverse file tree and collect all files with paths
   * CRITICAL FIX: DirectoryReader.readEntries() returns entries in batches (~100 per call).
   * We MUST keep calling readEntries() until it returns an empty array to get ALL files.
   */
  async function traverseFileTree(item, path, allFiles, skippedFiles = []) {
    return new Promise((resolve) => {
      if (item.isFile) {
        // It's a file - get the File object with error handling
        item.file(
          (file) => {
            // Skip hidden/system files
            const isHidden = file.name.startsWith('.') ||
                            file.name === '.DS_Store' ||
                            file.name === 'Thumbs.db' ||
                            file.name === 'desktop.ini' ||
                            file.name.includes('__MACOSX');

            if (isHidden) {
              console.log(`⏭️ [Upload] Skipping hidden file: ${file.name}`);
              skippedFiles.push({ name: file.name, reason: 'hidden/system file' });
              resolve();
              return;
            }

            // Skip 0-byte files (but don't abort - just skip)
            if (file.size === 0) {
              console.log(`⏭️ [Upload] Skipping 0-byte file: ${file.name}`);
              skippedFiles.push({ name: file.name, reason: '0-byte file' });
              resolve();
              return;
            }

            // Normalize path to NFC for proper Unicode handling
            const relativePath = (path + file.name).normalize('NFC');

            // Create a new File object with webkitRelativePath
            const fileWithPath = new File([file], file.name, {
              type: file.type,
              lastModified: file.lastModified
            });

            // Add webkitRelativePath property
            Object.defineProperty(fileWithPath, 'webkitRelativePath', {
              value: relativePath,
              writable: false
            });

            allFiles.push(fileWithPath);
            resolve();
          },
          (error) => {
            // Error callback - log but don't fail the entire traversal
            console.error(`❌ [Upload] Failed to read file ${item.name}:`, error);
            skippedFiles.push({ name: item.name, reason: `read error: ${error.message || error}` });
            resolve(); // Continue with other files
          }
        );
      } else if (item.isDirectory) {
        // It's a directory - traverse it
        const dirReader = item.createReader();
        const dirPath = (path + item.name + '/').normalize('NFC');

        // CRITICAL FIX: Read ALL entries by calling readEntries repeatedly
        // Browsers return entries in batches of ~100 at a time
        const readAllEntries = async () => {
          const allEntries = [];

          const readBatch = () => {
            return new Promise((res, rej) => {
              dirReader.readEntries(
                (entries) => res(entries),
                (error) => rej(error)
              );
            });
          };

          try {
            let entries = await readBatch();
            while (entries.length > 0) {
              allEntries.push(...entries);
              entries = await readBatch(); // Keep reading until empty
            }
          } catch (error) {
            console.error(`❌ [Upload] Failed to read directory ${item.name}:`, error);
          }

          return allEntries;
        };

        readAllEntries().then(async (entries) => {
          console.log(`📁 [Upload] Directory "${item.name}" contains ${entries.length} entries`);

          // Process all entries sequentially to maintain order
          for (const entry of entries) {
            await traverseFileTree(entry, dirPath, allFiles, skippedFiles);
          }
          resolve();
        }).catch((error) => {
          console.error(`❌ [Upload] Error reading directory ${item.name}:`, error);
          resolve(); // Continue with other directories
        });
      } else {
        resolve(); // Unknown entry type, skip
      }
    });
  }

  // Process initial files when modal opens with dropped files
  useEffect(() => {
    if (isOpen && initialFiles && initialFiles.length > 0) {
      onDrop(initialFiles);
    }
  }, [isOpen, initialFiles, onDrop]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: {
      // Documents
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-powerpoint': ['.ppt'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
      'text/plain': ['.txt'],
      'text/csv': ['.csv'],
      'text/html': ['.html', '.htm'],
      'application/rtf': ['.rtf'],

      // Images
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/gif': ['.gif'],
      'image/webp': ['.webp'],
      'image/tiff': ['.tiff', '.tif'],
      'image/bmp': ['.bmp'],
      'image/svg+xml': ['.svg'],
      'image/x-icon': ['.ico'],

      // Design files
      'image/vnd.adobe.photoshop': ['.psd'],
      'application/photoshop': ['.psd'],
      'application/psd': ['.psd'],

      // Video files
      'video/mp4': ['.mp4'],
      'video/webm': ['.webm'],
      'video/ogg': ['.ogg'],
      'video/quicktime': ['.mov'],
      'video/mpeg': ['.mpeg', '.mpg'],
      'video/x-msvideo': ['.avi'],

      // Audio files
      'audio/mpeg': ['.mp3'],
      'audio/wav': ['.wav'],
      'audio/webm': ['.weba'],
      'audio/ogg': ['.oga'],
      'audio/x-m4a': ['.m4a'],

      // Generic fallback for unknown types
      'application/octet-stream': ['.ai', '.sketch', '.fig', '.xd'],
    },
    maxSize: 500 * 1024 * 1024, // 500MB
    multiple: true,
    noClick: true, // Disable click on root div, we'll use manual button
    noDrag: false, // Enable drag-and-drop
  });

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileIcon = (filename) => {
    if (!filename) return txtIcon;
    const ext = filename.toLowerCase();
    if (ext.match(/\.(pdf)$/)) return pdfIcon;
    if (ext.match(/\.(doc|docx)$/)) return docIcon;
    if (ext.match(/\.(txt|csv|svg|html|htm|json|xml|md|rtf)$/)) return txtIcon;
    if (ext.match(/\.(xls|xlsx)$/)) return xlsIcon;
    if (ext.match(/\.(ppt|pptx)$/)) return pptxIcon;
    if (ext.match(/\.(jpg|jpeg)$/)) return jpgIcon;
    if (ext.match(/\.(png|gif|webp|bmp|tiff|tif|ico)$/)) return pngIcon;
    if (ext.match(/\.(mov)$/)) return movIcon;
    if (ext.match(/\.(mp4|avi|mpeg|mpg|webm)$/)) return mp4Icon;
    if (ext.match(/\.(mp3|wav|m4a|oga|weba)$/)) return mp3Icon;
    return txtIcon; // Default fallback icon for unknown files
  };

  const removeFile = (fileId) => {
    setUploadingFiles(prev => prev.filter(f => f.id !== fileId));
  };

  // ✅ REFACTORED: Use unified upload service for all uploads
  const handleUploadAll = async () => {
    // Auth check: open auth modal if not authenticated
    if (!isAuthenticated) {
      authModal.open({ mode: 'signup', reason: 'upload' });
      return;
    }

    const pendingFiles = uploadingFiles.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) return;

    // ============================================================================
    // 🔍 FILE-TYPE INTELLIGENCE: Analyze batch before upload (A1 requirement)
    // ============================================================================
    const filesToAnalyze = pendingFiles
      .filter(f => !f.isFolder) // Only analyze files, not folders
      .map(f => ({ name: f.file?.name || f.name, size: f.file?.size || f.totalSize }));

    if (filesToAnalyze.length > 0) {
      const analysis = analyzeFileBatch(filesToAnalyze);
      const notifications = determineNotifications(analysis);

      // Show notifications for detected file-type conditions
      notifications.forEach(notif => {
        if (notif.type === 'unsupportedFiles') {
          showUnsupportedFiles(notif.data);
        } else if (notif.type === 'limitedSupportFiles') {
          showLimitedSupportFiles(notif.data);
        } else if (notif.type === 'fileTypeDetected') {
          showFileTypeDetected(notif.data);
        }
      });

      // ⚠️ BLOCK UPLOAD if unsupported files detected
      if (analysis.unsupportedFiles.length > 0) {
        console.warn('❌ Upload blocked: unsupported file types detected', analysis.unsupportedFiles);
        // Mark unsupported files as failed
        setUploadingFiles(prev => prev.map(f => {
          const isUnsupported = analysis.unsupportedFiles.some(uf => uf.name === (f.file?.name || f.name));
          return isUnsupported ? { ...f, status: 'failed', error: 'Unsupported file type' } : f;
        }));
        setIsUploading(false);
        return; // Don't proceed with upload
      }
    }
    // ============================================================================

    // ═══════════════════════════════════════════════════════════════════════════════
    // FIX: Initialize upload state machine with explicit phases
    // ═══════════════════════════════════════════════════════════════════════════════
    setIsUploading(true);
    setUploadPhase(UPLOAD_PHASES.ANALYZING);
    setPhaseMessage('Analyzing files...');

    // ═══════════════════════════════════════════════════════════════════════════════
    // FIX #5: Generate correlationId for telemetry/debugging
    // ═══════════════════════════════════════════════════════════════════════════════
    const correlationId = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    correlationIdRef.current = correlationId; // Store for retry/polling use
    const uploadStartTime = Date.now();
    console.log(`[UploadModal:${correlationId}] ========== UPLOAD SESSION START ==========`);

    // Reset refs for fresh tracking (avoids stale state race condition)
    failureCountRef.current = 0;
    successCountRef.current = 0;

    // Initialize global progress
    setGlobalProgress(0);
    setFinalizeError(null);
    setCanRetryFinalize(false);

    const folderEntries = pendingFiles.filter(f => f.isFolder);
    const fileEntries = pendingFiles.filter(f => !f.isFolder);

    // ═══════════════════════════════════════════════════════════════════════════════
    // FIX #1: Calculate ACCEPTED files count (post-filtering denominator)
    // For folders, we estimate based on fileCount; actual count comes from service
    // ═══════════════════════════════════════════════════════════════════════════════
    const estimatedAcceptedFiles = folderEntries.reduce((sum, f) => sum + (f.fileCount || 0), 0) + fileEntries.length;
    setAcceptedFilesCount(estimatedAcceptedFiles);
    console.log(`[UploadModal:${correlationId}] Starting upload: ${estimatedAcceptedFiles} estimated files (${folderEntries.length} folders, ${fileEntries.length} files)`);

    // Immediately mark ALL pending files as 'uploading' so the UI shows progress instantly
    const pendingIds = new Set(pendingFiles.map(f => f.id));
    setUploadingFiles(prev => prev.map(f =>
      pendingIds.has(f.id) ? {
        ...f,
        status: 'uploading',
        progress: 0,
        bytesUploaded: 0,
        totalBytes: f.isFolder ? (f.totalSize || 0) : (f.file?.size || 0),
        processingStage: 'Preparing...'
      } : f
    ));

    // Track counts across parallel operations using refs to avoid race condition
    let totalSuccessCount = 0;
    let totalFailureCount = 0;

    // ✅ Process folder uploads using unified service
    const processFolder = async (folderEntry) => {
      try {
        // INVARIANT D: Initialize with local file sizes to prevent 0g/0b display
        setUploadingFiles(prev => prev.map(f =>
          f.id === folderEntry.id ? {
            ...f,
            status: 'uploading',
            bytesUploaded: 0,
            totalBytes: folderEntry.totalSize || 0  // Use local totalSize from the start
          } : f
        ));

        // Use unified upload service with presigned URLs
        const results = await unifiedUploadService.uploadFolder(
          folderEntry.allFiles,
          (progress) => {
            const itemId = folderEntry.id;
            const rawPct = progress.percentage || 0;

            // ═══════════════════════════════════════════════════════════════════════════
            // CRITICAL FIX: Enforce monotonicity at UI layer
            // Progress must NEVER decrease - this is a NON-NEGOTIABLE invariant
            // ═══════════════════════════════════════════════════════════════════════════
            setUploadingFiles(prev => {
              const currentItem = prev.find(f => f.id === itemId);
              const currentProgress = currentItem?.progress || 0;

              // INVARIANT A: Monotonic - use enforceMonotonicProgress helper
              const monotonicPct = enforceMonotonicProgress(currentProgress, rawPct, itemId);

              // INVARIANT C: totalBytes must never be 0 if we have local totalSize
              const localTotalSize = folderEntry.totalSize || 0;
              const safeTotalBytes = enforceNonZeroBytes(progress.totalBytes, localTotalSize);
              const safeBytesUploaded = progress.bytesUploaded || 0;

              // 🔧 FIX #5: Per-item stall detection using Map ref
              const now = Date.now();
              const itemState = lastProgressByItemRef.current.get(itemId) || { progress: 0, timestamp: now, timerId: null };

              if (Math.abs(monotonicPct - itemState.progress) < 0.5) {
                // Progress hasn't changed significantly - start stall timer if not already running
                if (!itemState.timerId) {
                  const timerId = setTimeout(() => {
                    // Mark as stalled in state
                    setUploadingFiles(p => p.map(f =>
                      f.id === itemId ? { ...f, isStalled: true } : f
                    ));
                    // Update ref to indicate stalled
                    const current = lastProgressByItemRef.current.get(itemId);
                    if (current) {
                      lastProgressByItemRef.current.set(itemId, { ...current, timerId: null });
                    }
                  }, 1500); // 1.5 seconds
                  lastProgressByItemRef.current.set(itemId, { ...itemState, timerId });
                }
              } else {
                // Progress changed - clear stall timer and state
                if (itemState.timerId) {
                  clearTimeout(itemState.timerId);
                }
                lastProgressByItemRef.current.set(itemId, { progress: monotonicPct, timestamp: now, timerId: null });
              }

              return prev.map(f =>
                f.id === itemId ? {
                  ...f,
                  progress: monotonicPct, // MONOTONIC: Only increases
                  processingStage: progress.message || 'Uploading...',
                  // 🔧 GOOGLE DRIVE STYLE: Store throughput data per entry
                  throughputMbps: progress.throughputMbps,
                  etaSeconds: progress.etaSeconds,
                  bytesUploaded: safeBytesUploaded,
                  // INVARIANT C: Always have valid totalBytes (use local size as fallback)
                  totalBytes: safeTotalBytes,
                  // Per-item stalled state (only clear here if progress changed)
                  ...(Math.abs(monotonicPct - itemState.progress) >= 0.5 && { isStalled: false })
                } : f
              );
            });

            // Update global throughput state
            if (progress.throughputMbps !== undefined) {
              setThroughputData(prev => ({
                throughputMbps: progress.throughputMbps || 0,
                bytesUploaded: progress.bytesUploaded || 0,
                // INVARIANT C: Never let totalBytes go to 0
                totalBytes: progress.totalBytes > 0 ? progress.totalBytes : (prev.totalBytes || folderEntry.totalSize || 0),
                etaSeconds: progress.etaSeconds
              }));
            }

            // ═══════════════════════════════════════════════════════════════════════════
            // FIX #2: Update explicit phase based on progress stage
            // ═══════════════════════════════════════════════════════════════════════════
            if (progress.stage) {
              const stageToPhase = {
                'filtering': UPLOAD_PHASES.ANALYZING,
                'analyzing': UPLOAD_PHASES.ANALYZING,
                'category': UPLOAD_PHASES.ANALYZING,
                'subfolders': UPLOAD_PHASES.ANALYZING,
                'mapping': UPLOAD_PHASES.ANALYZING,
                'preparing': UPLOAD_PHASES.ANALYZING,
                'uploading': UPLOAD_PHASES.UPLOADING,
                'verifying': UPLOAD_PHASES.FINALIZING,
                'reconciling': UPLOAD_PHASES.FINALIZING,
                'processing': UPLOAD_PHASES.PROCESSING,
                'complete': UPLOAD_PHASES.DONE
              };
              const newPhase = stageToPhase[progress.stage] || UPLOAD_PHASES.UPLOADING;
              setUploadPhase(newPhase);
              setPhaseMessage(progress.message || progress.stage);
            }

            // ═══════════════════════════════════════════════════════════════════════════
            // HARDENING: Update global progress during upload phase (capped at 94%)
            // This ensures the progress bar always moves forward during uploads
            // ═══════════════════════════════════════════════════════════════════════════
            if (progress.percentage !== undefined) {
              // Cap at 94% during upload - 95-100 reserved for finalize phase
              const cappedProgress = Math.min(94, progress.percentage);
              setGlobalProgress(prev => Math.max(prev, cappedProgress));
            }

            // ═══════════════════════════════════════════════════════════════════════════
            // FIX #1: Update accepted files count when service reports actual count
            // ═══════════════════════════════════════════════════════════════════════════
            if (progress.successCount !== undefined || progress.failureCount !== undefined) {
              const actualAccepted = (progress.successCount || 0) + (progress.failureCount || 0);
              if (actualAccepted > 0) {
                setAcceptedFilesCount(prev => Math.max(prev, actualAccepted));
              }
            }
          },
          categoryId
        );

        // Clean up stall tracking for this item
        const itemState = lastProgressByItemRef.current.get(folderEntry.id);
        if (itemState?.timerId) clearTimeout(itemState.timerId);
        lastProgressByItemRef.current.delete(folderEntry.id);

        setUploadingFiles(prev => prev.map(f =>
          f.id === folderEntry.id ? { ...f, status: 'completed', progress: 100, processingStage: null, isStalled: false } : f
        ));

        totalSuccessCount += results.successCount;
        totalFailureCount += results.failureCount;
        // FIX #3: Update refs for accurate tracking (avoids stale state)
        successCountRef.current += results.successCount;
        failureCountRef.current += results.failureCount;
      } catch (error) {
        // Clean up stall tracking for this item
        const itemState = lastProgressByItemRef.current.get(folderEntry.id);
        if (itemState?.timerId) clearTimeout(itemState.timerId);
        lastProgressByItemRef.current.delete(folderEntry.id);

        setUploadingFiles(prev => prev.map(f =>
          f.id === folderEntry.id ? { ...f, status: 'failed', error: error.message, isStalled: false } : f
        ));
        totalFailureCount += folderEntry.fileCount;
        // FIX #3: Update ref for accurate tracking
        failureCountRef.current += folderEntry.fileCount;
      }
    };

    // ═══════════════════════════════════════════════════════════════════════════════
    // BATCH PRESIGNED URL PRE-FETCH for individual files
    // Instead of each file making its own /api/presigned-urls/bulk call (N round-trips),
    // fetch ALL presigned URLs in a single batch (1 round-trip).
    // ═══════════════════════════════════════════════════════════════════════════════
    const smallFileEntries = fileEntries.filter(f => !shouldUseResumableUpload(f.file?.size || 0));
    const largeFileEntries = fileEntries.filter(f => shouldUseResumableUpload(f.file?.size || 0));

    // Pre-fetch presigned URLs for all small files in one batch
    let presignedUrlMap = new Map(); // fileEntry.id → { url, documentId, isLocalStorage }
    if (smallFileEntries.length > 0) {
      try {
        const { data } = await api.post('/api/presigned-urls/bulk', {
          files: smallFileEntries.map(entry => ({
            fileName: (entry.file?.name || entry.name || 'unknown').normalize('NFC'),
            fileType: entry.file?.type || 'application/octet-stream',
            fileSize: entry.file?.size || 0,
            folderId: categoryId
          })),
          folderId: categoryId
        });

        const isLocal = data.storageMode === 'local';
        smallFileEntries.forEach((entry, idx) => {
          if (data.presignedUrls[idx] && data.documentIds[idx]) {
            presignedUrlMap.set(entry.id, {
              url: data.presignedUrls[idx],
              documentId: data.documentIds[idx],
              isLocalStorage: isLocal
            });
          }
        });
        console.log(`[UploadModal] Batch pre-fetched ${presignedUrlMap.size} presigned URLs`);
      } catch (err) {
        console.warn('[UploadModal] Batch presigned URL fetch failed, falling back to per-file', err.message);
      }
    }

    // ✅ Process file uploads using unified service with MONOTONIC PROGRESS ENFORCEMENT
    const processFile = async (fileEntry) => {
      const makeProgressHandler = () => (progress) => {
        const itemId = fileEntry.id;
        const rawPct = progress.percentage || 0;

        setUploadingFiles(prev => {
          const currentItem = prev.find(f => f.id === itemId);
          const currentProgress = currentItem?.progress || 0;
          const monotonicPct = enforceMonotonicProgress(currentProgress, rawPct, itemId);
          const localFileSize = fileEntry.file?.size || fileEntry.size || 0;
          const safeTotalBytes = enforceNonZeroBytes(progress.totalBytes, localFileSize);
          const safeBytesUploaded = Math.min(progress.bytesUploaded || 0, safeTotalBytes);

          return prev.map(f =>
            f.id === itemId ? {
              ...f,
              progress: monotonicPct,
              processingStage: progress.message || 'Uploading...',
              bytesUploaded: safeBytesUploaded,
              totalBytes: safeTotalBytes,
              throughputMbps: progress.throughputMbps,
              etaSeconds: progress.etaSeconds
            } : f
          );
        });
      };

      try {
        const prefetched = presignedUrlMap.get(fileEntry.id);

        if (prefetched) {
          // Fast path: use pre-fetched presigned URL (no extra API call)
          await unifiedUploadService.uploadWithPresignedUrl(
            fileEntry.file,
            prefetched.url,
            prefetched.documentId,
            prefetched.isLocalStorage,
            makeProgressHandler()
          );
        } else {
          // Fallback: per-file presigned URL (large files or batch fetch failed)
          await unifiedUploadService.uploadSingleFile(
            fileEntry.file,
            categoryId,
            makeProgressHandler()
          );
        }

        setUploadingFiles(prev => prev.map(f =>
          f.id === fileEntry.id ? { ...f, status: 'completed', progress: 100, processingStage: null } : f
        ));

        totalSuccessCount++;
        successCountRef.current++;
      } catch (error) {
        const message = error.response?.data?.message || error.message || 'Upload failed';
        setUploadingFiles(prev => prev.map(f =>
          f.id === fileEntry.id ? { ...f, status: 'failed', error: message } : f
        ));
        totalFailureCount++;
        failureCountRef.current++;
      }
    };

    // ═══════════════════════════════════════════════════════════════════════════════
    // FIX #2: Transition to UPLOADING phase
    // ═══════════════════════════════════════════════════════════════════════════════
    setUploadPhase(UPLOAD_PHASES.UPLOADING);
    setPhaseMessage(`Uploading ${folderEntries.length + fileEntries.length} items...`);

    // ═══════════════════════════════════════════════════════════════════════════════
    // FIX #4: Use concurrency limiter to prevent overload
    // Instead of launching ALL uploads at once, we limit to MAX_CONCURRENT_ENTRIES
    // ═══════════════════════════════════════════════════════════════════════════════
    const limit = createLimiter(MAX_CONCURRENT_ENTRIES);
    console.log(`[UploadModal] Starting uploads with concurrency limit: ${MAX_CONCURRENT_ENTRIES}`);

    const allPromises = [
      ...folderEntries.map(entry => limit(() => processFolder(entry))),
      ...fileEntries.map(entry => limit(() => processFile(entry)))
    ];
    await Promise.all(allPromises);

    // ═══════════════════════════════════════════════════════════════════════════════
    // HARDENED FINALIZE PHASE - With time-based progress and timeout/retry
    // ═══════════════════════════════════════════════════════════════════════════════
    setUploadPhase(UPLOAD_PHASES.FINALIZING);
    setPhaseMessage('Finalizing uploads...');
    setGlobalProgress(95); // Set to 95% at start of finalize

    // Start time-based progress animation (95 → 99) while finalizing
    timeBasedProgressRef.current = createTimeBasedProgress(
      (percent) => setGlobalProgress(percent),
      95, // start
      99, // target (never 100 until snap)
      15000 // 15 seconds
    );

    console.log(`[UploadModal:${correlationId}] Starting FINALIZE phase with timeout/retry`);

    // ═══════════════════════════════════════════════════════════════════════════════
    // STEP 1: Invalidate cache and refresh data (with timeout/retry)
    // ═══════════════════════════════════════════════════════════════════════════════
    const refreshResult = await executeWithTimeoutAndRetry(
      async () => {
        invalidateCache();
        await fetchAllData(true);
        return { refreshed: true };
      },
      'Data refresh',
      { ...FINALIZE_CONFIG, TIMEOUT_MS: 20000, MAX_RETRIES: 2 }
    );

    if (!refreshResult.success) {
      console.warn(`[UploadModal:${correlationId}] Data refresh failed, continuing...`);
      // Non-blocking - continue with completion
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // STEP 2: Transition to PROCESSING phase with time-based progress
    // ═══════════════════════════════════════════════════════════════════════════════
    setUploadPhase(UPLOAD_PHASES.PROCESSING);
    setPhaseMessage('Processing documents...');

    // Check storage (non-blocking)
    if (totalSuccessCount > 0) {
      try {
        const storageResponse = await api.get('/api/storage');
        const { used, limit: storageLimit } = storageResponse.data;
        const usagePercent = (used / storageLimit) * 100;

        if (usagePercent >= 90) {
          addNotification({
            type: 'error',
            title: t('upload.notifications.storageAlmostFull'),
            text: t('upload.notifications.storageAlmostFullText', { percent: Math.round(usagePercent) }),
            action: { type: 'navigate', target: ROUTES.UPGRADE }
          });
        } else if (usagePercent >= 70) {
          addNotification({
            type: 'warning',
            title: t('upload.notifications.storageRunningLow'),
            text: t('upload.notifications.storageRunningLowText', { percent: Math.round(usagePercent) }),
            action: { type: 'navigate', target: ROUTES.UPGRADE }
          });
        }
      } catch (storageError) {
        console.warn('Failed to check storage:', storageError);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // STEP 3: Show notifications
    // ═══════════════════════════════════════════════════════════════════════════════
    if (totalSuccessCount > 0) {
      setUploadedCount(totalSuccessCount);
      setNotificationType('success');
      setShowNotification(true);
      setTimeout(() => setShowNotification(false), 5000);

      addNotification({
        type: 'info',
        title: t('upload.notifications.uploadComplete'),
        text: t('upload.notifications.uploadCompleteText', { count: totalSuccessCount }),
        action: { type: 'navigate', target: ROUTES.DOCUMENTS }
      });
    }

    if (totalFailureCount > 0 && totalSuccessCount === 0) {
      setNotificationType('error');
      setShowNotification(true);
      setTimeout(() => setShowNotification(false), 5000);

      addNotification({
        type: 'error',
        title: t('upload.notifications.uploadFailed'),
        text: t('upload.notifications.uploadFailedText', { count: totalFailureCount })
      });
    } else if (totalFailureCount > 0 && totalSuccessCount > 0) {
      addNotification({
        type: 'warning',
        title: t('upload.notifications.uploadPartialComplete'),
        text: t('upload.notifications.uploadPartialCompleteText', { success: totalSuccessCount, failed: totalFailureCount }),
        action: { type: 'navigate', target: ROUTES.DOCUMENTS }
      });
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // STEP 4: FORCE COMPLETION - Always reach 100%
    // ═══════════════════════════════════════════════════════════════════════════════
    // Stop time-based progress and snap to 100%
    if (timeBasedProgressRef.current) {
      timeBasedProgressRef.current.snapToTarget();
      timeBasedProgressRef.current = null;
    }

    // Use authoritative completion function
    completeUpload(totalSuccessCount, totalFailureCount, correlationId);

    // Refresh documents list after upload completes
    try {
      console.log(`[UploadModal:${correlationId}] Refreshing documents list...`);
      await fetchAllData();
      console.log(`[UploadModal:${correlationId}] Documents list refreshed`);
    } catch (refreshError) {
      console.error(`[UploadModal:${correlationId}] Error refreshing documents:`, refreshError);
    }

    if (onUploadComplete) {
      onUploadComplete();
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // Final logging and auto-close
    // ═══════════════════════════════════════════════════════════════════════════════
    const hasFailures = failureCountRef.current > 0;
    const uploadDuration = Date.now() - uploadStartTime;
    console.log(`[UploadModal:${correlationId}] ========== UPLOAD SESSION END ==========`);
    console.log(`[UploadModal:${correlationId}] Duration: ${(uploadDuration / 1000).toFixed(1)}s | Success: ${successCountRef.current} | Failures: ${failureCountRef.current}`);

    if (!hasFailures) {
      // Short delay to show success, then close
      setTimeout(() => {
        setUploadingFiles([]);
        setFolderUploadProgress(null);
        setUploadPhase(UPLOAD_PHASES.IDLE);
        setPhaseMessage('');
        setAcceptedFilesCount(0);
        setGlobalProgress(0);
        setFinalizeError(null);
        setCanRetryFinalize(false);
        onClose();
      }, 1000);
    }
  };

  const handleCancel = () => {
    if (!isUploading) {
      // Clean up any active animations/polling
      if (timeBasedProgressRef.current) {
        timeBasedProgressRef.current.stop();
        timeBasedProgressRef.current = null;
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }

      setUploadingFiles([]);
      setFolderUploadProgress(null);
      setShowErrorBanner(false);
      setErrorMessage('');
      setUploadPhase(UPLOAD_PHASES.IDLE);
      setPhaseMessage('');
      setGlobalProgress(0);
      setFinalizeError(null);
      setCanRetryFinalize(false);
      setAcceptedFilesCount(0);
      onClose();
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // RETRY FINALIZE - Handler for retry CTA when finalize fails
  // ═══════════════════════════════════════════════════════════════════════════════
  const handleRetryFinalize = async () => {
    const correlationId = correlationIdRef.current || 'retry';
    console.log(`[UploadModal:${correlationId}] Retrying finalize...`);

    setFinalizeError(null);
    setCanRetryFinalize(false);
    setUploadPhase(UPLOAD_PHASES.FINALIZING);
    setPhaseMessage('Retrying finalize...');

    // Start time-based progress again
    timeBasedProgressRef.current = createTimeBasedProgress(
      (percent) => setGlobalProgress(percent),
      95, 99, 10000
    );

    try {
      // Retry data refresh
      invalidateCache();
      await fetchAllData(true);

      // Complete successfully
      completeUpload(successCountRef.current, failureCountRef.current, correlationId);
    } catch (error) {
      handleFinalizeError(error, correlationId);
    }
  };

  const handleFolderSelect = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) {
      return;
    }

    // Validate that files have webkitRelativePath
    const firstFile = files[0];
    if (!firstFile.webkitRelativePath) {
      showError(t('alerts.folderSelectionFailed'));
      return;
    }

    // ✅ FIX: Wait for browser to populate file sizes (some browsers need this)
    // Without this delay, file.size might be 0 when files are first selected
    await new Promise(resolve => setTimeout(resolve, 50));

    await onDrop(files);

    // Reset the input so the same folder can be selected again
    e.target.value = '';
  };

  // Handle scanned document completion (mobile scanner)
  const handleScanComplete = async (pdfFile) => {
    if (!pdfFile) return;

    // Use the existing onDrop handler to process the scanned PDF
    // This ensures consistent handling with other file uploads
    await onDrop([pdfFile]);
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: isMobile ? 56 : 0,
        left: 0,
        right: 0,
        bottom: isMobile ? 'calc(var(--tabbar-h, 70px) + env(safe-area-inset-bottom))' : 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: 16,
        boxSizing: 'border-box'
      }}
    >
      {/* Global shimmer animation keyframes - injected once at component root */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: isMobile ? 'calc(100% - 32px)' : '100%',
        maxWidth: isMobile ? '100%' : 520,
        maxHeight: isMobile
          ? 'calc(100% - 32px)'
          : 'calc(100vh - 40px)',
        position: 'relative',
        background: 'white',
        borderRadius: isMobile ? 16 : 14,
        border: isMobile ? '2px solid #E6E6EC' : 'none',
        outline: isMobile ? 'none' : '1px #E6E6EC solid',
        outlineOffset: '-1px',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        alignItems: 'center',
        display: 'flex',
        boxShadow: isMobile ? '0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06)' : '0 8px 24px rgba(0, 0, 0, 0.12)',
        overflow: 'hidden'
      }}>
        {/* Fixed Header - Desktop only */}
        {!isMobile && (
          <div style={{
            alignSelf: 'stretch',
            flexShrink: 0,
            paddingTop: 18,
            paddingLeft: 18,
            paddingRight: 18,
            paddingBottom: 12
          }}>
            <div style={{
              color: '#32302C',
              fontSize: 20,
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: '700',
              textTransform: 'capitalize',
              lineHeight: '30px'
            }}>
              {t('upload.uploadDocuments')}
            </div>
          </div>
        )}

        {/* Close button - positioned inside modal on mobile to prevent clipping */}
        <button
          onClick={handleCancel}
          disabled={isUploading}
          style={{
            width: isMobile ? 36 : 32,
            height: isMobile ? 36 : 32,
            minWidth: isMobile ? 36 : 32,
            minHeight: isMobile ? 36 : 32,
            right: isMobile ? 8 : -16,
            top: isMobile ? 8 : -16,
            position: 'absolute',
            background: 'white',
            borderRadius: 100,
            outline: '1px rgba(55, 53, 47, 0.09) solid',
            outlineOffset: '-1px',
            justifyContent: 'center',
            alignItems: 'center',
            display: 'flex',
            border: 'none',
            cursor: isUploading ? 'not-allowed' : 'pointer',
            opacity: isUploading ? 0.5 : 1,
            zIndex: 10,
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
          }}
        >
          <CloseIcon style={{ width: isMobile ? 14 : 12, height: isMobile ? 14 : 12 }} />
        </button>

        {!isMobile && <div style={{ alignSelf: 'stretch', height: 1, background: '#E6E6EC', flexShrink: 0 }} />}

        {/* Scrollable Content Area */}
        <div style={{
          flex: 1,
          alignSelf: 'stretch',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          paddingTop: 12,
          paddingBottom: 12
        }}>

        {/* Drop zone */}
        <div style={{
          alignSelf: 'stretch',
          paddingLeft: isMobile ? 16 : 18,
          paddingRight: isMobile ? 16 : 18,
          paddingTop: isMobile ? 16 : 0,
          paddingBottom: isMobile ? 8 : 0,
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          display: 'flex'
        }}>
          <div
            {...getRootProps({
              onDrop: handleDragDrop
            })}
            style={{
              alignSelf: 'stretch',
              minHeight: isMobile ? 'auto' : 380,
              paddingLeft: isMobile ? 24 : 16,
              paddingRight: isMobile ? 24 : 16,
              paddingTop: isMobile ? 24 : 32,
              paddingBottom: isMobile ? 24 : 32,
              background: isDragActive ? '#EFEFEF' : '#F5F5F5',
              overflow: 'visible',
              borderRadius: isMobile ? 16 : 20,
              outline: '1px #E6E6EC solid',
              outlineOffset: '-1px',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              gap: isMobile ? 8 : 16,
              display: 'flex',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxSizing: 'border-box'
            }}
          >
            <input {...getInputProps()} />

            {/* File Types Stack Icon - use PNG on mobile, SVG on desktop */}
            <img
              src={isMobile ? mobileUploadIllustration : fileTypesStackIcon}
              alt="File Types"
              style={{
                width: isMobile ? 120 : 200,
                maxWidth: isMobile ? 120 : 200,
                height: 'auto',
                display: 'block',
                marginBottom: 8,
                filter: isMobile ? 'brightness(0) invert(0.4)' : 'brightness(0) invert(0.4) drop-shadow(0 8px 16px rgba(0, 0, 0, 0.15))',
                transition: 'transform 0.3s ease, filter 0.3s ease'
              }}
              onMouseEnter={(e) => {
                if (!isMobile) {
                  e.currentTarget.style.transform = 'translateY(-4px) scale(1.02)';
                  e.currentTarget.style.filter = 'brightness(0) invert(0.4) drop-shadow(0 8px 16px rgba(0, 0, 0, 0.15))';
                }
              }}
              onMouseLeave={(e) => {
                if (!isMobile) {
                  e.currentTarget.style.transform = 'translateY(0) scale(1)';
                  e.currentTarget.style.filter = 'brightness(0) invert(0.4) drop-shadow(0 8px 16px rgba(0, 0, 0, 0.15))';
                }
              }}
            />

            <div style={{
              flexDirection: 'column',
              justifyContent: 'flex-start',
              alignItems: 'center',
              gap: 4,
              display: 'flex'
            }}>
              <div style={{
                alignSelf: 'stretch',
                justifyContent: 'center',
                alignItems: 'flex-start',
                gap: 6,
                display: 'flex'
              }}>
                <div style={{
                  color: '#32302C',
                  fontSize: isMobile ? 16 : 20,
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: '600',
                  textTransform: 'capitalize',
                  lineHeight: isMobile ? '24px' : '30px'
                }}>
                  {isDragActive ? t('upload.dropFilesHere') : (isMobile ? t('upload.tapToUpload') : t('upload.uploadOrDragDrop'))}
                </div>
              </div>
              <div style={{
                width: '100%',
                maxWidth: 366,
                textAlign: 'center',
                color: '#6C6B6E',
                fontSize: isMobile ? 13 : 16,
                fontFamily: 'Plus Jakarta Sans',
                fontWeight: '500',
                lineHeight: isMobile ? '20px' : '24px'
              }}>
                {isMobile ? t('upload.allFileTypesSupported') : t('upload.uploadDescription')}
              </div>
            </div>

            {/* Buttons Container */}
            <div style={{
              justifyContent: 'center',
              alignItems: 'center',
              gap: 10,
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              flexWrap: 'wrap',
              width: isMobile ? '100%' : 'auto',
              maxWidth: isMobile ? 200 : 'none'
            }}>
              {/* Select Files button */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  open();
                }}
                style={{
                  width: isMobile ? '100%' : 'auto',
                  minWidth: isMobile ? 'auto' : 120,
                  maxWidth: isMobile ? 'none' : 160,
                  height: isMobile ? 44 : 48,
                  paddingLeft: 16,
                  paddingRight: 16,
                  paddingTop: 10,
                  paddingBottom: 10,
                  background: 'white',
                  borderRadius: 100,
                  outline: '1px #E6E6EC solid',
                  outlineOffset: '-1px',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 8,
                  display: 'flex',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  boxSizing: 'border-box'
                }}
              >
                <div style={{
                  color: '#323232',
                  fontSize: isMobile ? 14 : 15,
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: '600',
                  textTransform: 'capitalize',
                  lineHeight: '24px',
                  textAlign: 'center'
                }}>
                  {t('upload.selectFiles')}
                </div>
              </div>

              {/* Select Folder button - desktop only */}
              {!isMobile && (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    folderInputRef.current?.click();
                  }}
                  style={{
                    flex: '1 1 auto',
                    minWidth: 120,
                    maxWidth: 160,
                    height: 48,
                    paddingLeft: 16,
                    paddingRight: 16,
                    paddingTop: 10,
                    paddingBottom: 10,
                    background: 'white',
                    borderRadius: 100,
                    outline: '1px #E6E6EC solid',
                    outlineOffset: '-1px',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: 8,
                    display: 'flex',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    boxSizing: 'border-box'
                  }}>
                  <div style={{
                    color: '#323232',
                    fontSize: 15,
                    fontFamily: 'Plus Jakarta Sans',
                    fontWeight: '600',
                    textTransform: 'capitalize',
                    lineHeight: '24px',
                    textAlign: 'center'
                  }}>
                    {t('upload.selectFolder')}
                  </div>
                </div>
              )}

              {/* Scan Document button (mobile only) */}
              {isMobile && (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowScanner(true);
                  }}
                  style={{
                    width: '100%',
                    height: 44,
                    paddingLeft: 16,
                    paddingRight: 16,
                    paddingTop: 10,
                    paddingBottom: 10,
                    background: '#181818',
                    borderRadius: 100,
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: 8,
                    display: 'flex',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    boxSizing: 'border-box'
                  }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7V5a2 2 0 0 1 2-2h2" />
                    <path d="M17 3h2a2 2 0 0 1 2 2v2" />
                    <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
                    <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                    <rect x="7" y="7" width="10" height="10" rx="1" />
                  </svg>
                  <div style={{
                    color: 'white',
                    fontSize: 14,
                    fontFamily: 'Plus Jakarta Sans',
                    fontWeight: '600',
                    lineHeight: '24px',
                    textAlign: 'center'
                  }}>
                    {t('upload.scanDocument', 'Scan Document')}
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Document Scanner (mobile only) */}
        <DocumentScanner
          isOpen={showScanner}
          onClose={() => setShowScanner(false)}
          onScanComplete={handleScanComplete}
        />

        {/* Hidden folder input — must be outside dropzone root to avoid open() picking it up */}
        <input
          ref={folderInputRef}
          type="file"
          webkitdirectory=""
          directory=""
          mozdirectory=""
          multiple
          onChange={handleFolderSelect}
          style={{ display: 'none' }}
        />

        {/* Error Banner */}
        {showErrorBanner && (
          <div style={{
            alignSelf: 'stretch',
            paddingLeft: 18,
            paddingRight: 18
          }}>
            <div style={{
              width: '100%',
              padding: 10,
              background: 'rgba(24, 24, 24, 0.90)',
              borderRadius: 100,
              flexDirection: 'row',
              justifyContent: 'flex-start',
              alignItems: 'center',
              gap: 12,
              display: 'flex'
            }}>
              {/* Error Icon */}
              <div style={{ width: 32, height: 32, position: 'relative', flexShrink: 0 }}>
                <div style={{
                  width: 32,
                  height: 32,
                  left: 0,
                  top: 0,
                  position: 'absolute',
                  background: 'rgba(217, 45, 32, 0.60)',
                  borderRadius: 9999
                }} />
                <div style={{
                  width: 26,
                  height: 26,
                  left: 3,
                  top: 3,
                  position: 'absolute',
                  background: 'rgba(217, 45, 32, 0.60)',
                  borderRadius: 9999
                }} />
                <div style={{
                  width: 20,
                  height: 20,
                  left: 6,
                  top: 6,
                  position: 'absolute',
                  background: 'rgba(217, 45, 32, 0.60)',
                  borderRadius: 9999
                }} />
                <div style={{
                  width: 14,
                  height: 14,
                  left: 9,
                  top: 9,
                  position: 'absolute',
                  background: '#D92D20',
                  borderRadius: 9999
                }} />
              </div>
              {/* Error Message */}
              <div style={{
                flex: 1,
                color: 'white',
                fontSize: 14,
                fontFamily: 'Plus Jakarta Sans',
                fontWeight: '500',
                lineHeight: '20px'
              }}>
                {errorMessage || 'Hmm… the upload didn\'t work. Please retry.'}
              </div>
            </div>
          </div>
        )}

        {/* Global upload progress bar removed - progress shown on individual file cards */}

        {/* File list */}
        {uploadingFiles.length > 0 && (
          <div style={{
            alignSelf: 'stretch',
            paddingLeft: isMobile ? 16 : 18,
            paddingRight: isMobile ? 16 : 18,
            paddingBottom: 12,
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 12,
            display: 'flex'
          }}>
            {uploadingFiles.map((item) => (
              // Skip rendering if this is a loading indicator
              item.isLoading ? (
                <div
                  key={item.id}
                  style={{
                    alignSelf: 'stretch',
                    height: 72,
                    padding: 12,
                    background: 'white',
                    borderRadius: 12,
                    outline: '1px #E6E6EC solid',
                    outlineOffset: '-1px',
                    justifyContent: 'center',
                    alignItems: 'center',
                    display: 'flex'
                  }}
                >
                  <div style={{
                    width: 24,
                    height: 24,
                    border: '3px solid #E6E6EC',
                    borderTop: '3px solid #32302C',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite'
                  }} />
                  <span style={{
                    marginLeft: 12,
                    color: '#6C6B6E',
                    fontSize: 14,
                    fontFamily: 'Plus Jakarta Sans',
                    fontWeight: '500'
                  }}>
                    {t('upload.processing')}
                  </span>
                </div>
              ) : (
              <div
                key={item.id}
                style={{
                  alignSelf: 'stretch',
                  height: 72,
                  padding: 12,
                  position: 'relative',
                  background: 'white',
                  borderRadius: 12,
                  outline: item.status === 'failed' ? '2px #EF4444 solid' : '1px #E6E6EC solid',
                  outlineOffset: '-1px',
                  justifyContent: 'flex-start',
                  alignItems: 'center',
                  gap: 12,
                  display: 'flex',
                  overflow: 'hidden'
                }}
              >
                {/* Grey progress fill background with shimmer when stalled */}
                {item.status === 'uploading' && (
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    height: '100%',
                    width: `${Math.min(100, item.progress || 0)}%`,
                    background: item.isStalled
                      ? 'linear-gradient(90deg, rgba(169, 169, 169, 0.12) 25%, rgba(200, 200, 200, 0.25) 50%, rgba(169, 169, 169, 0.12) 75%)'
                      : 'rgba(169, 169, 169, 0.12)',
                    backgroundSize: item.isStalled ? '200% 100%' : 'auto',
                    borderRadius: 12,
                    transition: 'width 0.3s ease-out',
                    zIndex: 0,
                    animation: item.isStalled ? 'shimmer 1.5s infinite' : 'none'
                  }} />
                )}

                <div style={{
                  flex: 1,
                  minWidth: 0,
                  justifyContent: 'flex-start',
                  alignItems: 'center',
                  gap: 12,
                  display: 'flex',
                  position: 'relative',
                  zIndex: 1,
                  background: 'transparent'
                }}>
                  {/* File/Folder icon */}
                  <div style={{
                    width: 48,
                    height: 48,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <img
                      src={item.isFolder ? folderIcon : getFileIcon(item.file.name)}
                      alt={cleanDocumentName(item.isFolder ? item.folderName : item.file.name)}
                      style={{
                        width: 48,
                        height: 48,
                        objectFit: 'contain'
                      }}
                    />
                  </div>

                  <div style={{
                    flex: '1 1 0',
                    flexDirection: 'column',
                    justifyContent: 'flex-start',
                    alignItems: 'flex-start',
                    gap: 6,
                    display: 'flex'
                  }}>
                    <div style={{
                      alignSelf: 'stretch',
                      color: '#32302C',
                      fontSize: 14,
                      fontFamily: 'Plus Jakarta Sans',
                      fontWeight: '600',
                      lineHeight: '20px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {cleanDocumentName(item.isFolder ? item.folderName : item.file.name)}
                    </div>
                    <div style={{
                      alignSelf: 'stretch',
                      color: item.status === 'failed' ? '#EF4444' : '#6B7280',
                      fontSize: 12,
                      fontFamily: 'Plus Jakarta Sans',
                      fontWeight: '500',
                      lineHeight: '16px'
                    }}>
                      {item.isFolder ? (
                        // Folder status display
                        item.status === 'failed'
                          ? 'Upload failed. Try again.'
                          : item.status === 'completed'
                          ? `${formatFileSize(item.totalSize || (item.allFiles?.reduce((sum, f) => sum + (f.size || 0), 0) || 0))} • ${item.fileCount} file${item.fileCount > 1 ? 's' : ''}`
                          : item.status === 'uploading'
                          ? (() => {
                              // 🔧 GOOGLE DRIVE STYLE: Show throughput + bytes + ETA
                              const bytesUploaded = item.bytesUploaded || 0;
                              // INVARIANT D: Compute totalBytes from allFiles if totalSize/totalBytes are 0
                              const computedTotalSize = item.allFiles?.reduce((sum, f) => sum + (f.size || 0), 0) || 0;
                              const totalBytes = (item.totalBytes > 0 ? item.totalBytes : item.totalSize) || computedTotalSize || 0;
                              const throughput = item.throughputMbps || 0;
                              const eta = item.etaSeconds;

                              // Format ETA
                              let etaStr = '';
                              if (eta !== null && eta !== undefined && eta > 0) {
                                if (eta < 60) {
                                  etaStr = `${eta}s left`;
                                } else if (eta < 3600) {
                                  etaStr = `${Math.floor(eta / 60)}m ${eta % 60}s left`;
                                } else {
                                  etaStr = `${Math.floor(eta / 3600)}h ${Math.floor((eta % 3600) / 60)}m left`;
                                }
                              }

                              // Build status string: "12.5 MB / 50 MB • 8.2 Mbps • 4m 30s left"
                              const parts = [];
                              if (totalBytes > 0) {
                                parts.push(`${formatFileSize(bytesUploaded)} / ${formatFileSize(totalBytes)}`);
                              }
                              if (throughput > 0.1) {
                                parts.push(`${throughput.toFixed(1)} Mbps`);
                              }
                              if (etaStr) {
                                parts.push(etaStr);
                              }

                              return parts.length > 0
                                ? parts.join(' • ')
                                : `${formatFileSize(totalBytes || computedTotalSize)} – ${Math.min(100, Math.round(item.progress || 0))}%`;
                            })()
                          : `${formatFileSize(item.totalSize || (item.allFiles?.reduce((sum, f) => sum + (f.size || 0), 0) || 0))} • ${item.fileCount} file${item.fileCount > 1 ? 's' : ''}`
                      ) : (
                        // File status display
                        item.status === 'failed'
                          ? 'Upload failed. Try again.'
                          : item.status === 'completed'
                          ? `${formatFileSize(item.file.size)}`
                          : item.status === 'uploading'
                          ? `${formatFileSize(item.file.size)} – ${Math.min(100, Math.round(item.progress || 0))}%`
                          : `${formatFileSize(item.file.size)}`
                      )}
                    </div>
                  </div>
                </div>

                {/* Remove button */}
                {item.status !== 'uploading' && (
                  <button
                    onClick={() => removeFile(item.id)}
                    style={{
                      width: 24,
                      height: 24,
                      right: -6,
                      top: -6,
                      position: 'absolute',
                      background: 'white',
                      borderRadius: 100,
                      outline: '1px rgba(55, 53, 47, 0.09) solid',
                      outlineOffset: '-1px',
                      justifyContent: 'center',
                      alignItems: 'center',
                      display: 'flex',
                      border: 'none',
                      cursor: 'pointer',
                      zIndex: 2
                    }}
                  >
                    <CloseIcon style={{ width: 12, height: 12 }} />
                  </button>
                )}
              </div>
              )
            ))}
          </div>
        )}

        </div>
        {/* End of Scrollable Content Area */}

        {/* Fixed Footer - Action Buttons */}
        {uploadingFiles.length > 0 && (
          <div style={{
            alignSelf: 'stretch',
            flexShrink: 0,
            borderTop: isMobile ? 'none' : '1px solid #E6E6EC',
            paddingTop: isMobile ? 8 : 18,
            paddingBottom: isMobile ? 16 : 18,
            paddingLeft: isMobile ? 16 : 18,
            paddingRight: isMobile ? 16 : 18
          }}>
            <div style={{
              justifyContent: 'flex-start',
              alignItems: 'flex-start',
              gap: 8,
              display: 'flex'
            }}>
              <button
                onClick={handleCancel}
                disabled={isUploading}
                style={{
                  flex: '1 1 0',
                  height: 52,
                  paddingLeft: 18,
                  paddingRight: 18,
                  paddingTop: 10,
                  paddingBottom: 10,
                  background: '#F5F5F5',
                  borderRadius: 100,
                  outline: '1px #E6E6EC solid',
                  outlineOffset: '-1px',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 8,
                  display: 'flex',
                  border: 'none',
                  cursor: isUploading ? 'not-allowed' : 'pointer',
                  opacity: isUploading ? 0.5 : 1
                }}
              >
                <div style={{
                  color: '#323232',
                  fontSize: 16,
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: '700',
                  textTransform: 'capitalize',
                  lineHeight: '24px'
                }}>
                  {t('upload.cancel')}
                </div>
              </button>

              <button
                onClick={handleUploadAll}
                disabled={isUploading || uploadingFiles.filter(f => f.status === 'pending').length === 0}
                style={{
                  flex: '1 1 0',
                  height: 52,
                  background: (isUploading || uploadingFiles.filter(f => f.status === 'pending').length === 0) ? '#E6E6EC' : '#181818',
                  borderRadius: 100,
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 8,
                  display: 'flex',
                  border: 'none',
                  cursor: (isUploading || uploadingFiles.filter(f => f.status === 'pending').length === 0) ? 'not-allowed' : 'pointer'
                }}
              >
                <div style={{
                  color: (isUploading || uploadingFiles.filter(f => f.status === 'pending').length === 0) ? '#9CA3AF' : 'white',
                  fontSize: 16,
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: '600',
                  textTransform: 'capitalize',
                  lineHeight: '24px'
                }}>
                  {isUploading ? t('upload.uploading') : t('nav.upload')}
                </div>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Success/Error Notification */}
      {showNotification && (uploadedCount > 0 || notificationType === 'error') && (
        <div style={{
          position: 'fixed',
          top: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'calc(100% - 700px)',
          maxWidth: '960px',
          minWidth: '400px',
          zIndex: 99999,
          animation: 'slideDown 0.3s ease-out'
        }}>
          <div style={{
            width: '100%',
            padding: '6px 16px',
            background: 'rgba(24, 24, 24, 0.90)',
            borderRadius: 100,
            justifyContent: 'center',
            alignItems: 'center',
            gap: 10,
            display: 'inline-flex'
          }}>
            {notificationType === 'success' ? (
              <>
                <div style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: '#34A853',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <CheckIcon style={{width: 12, height: 12}} />
                </div>
                <div style={{
                  flex: '1 1 0',
                  color: 'white',
                  fontSize: 13,
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: '400',
                  lineHeight: '18px',
                  wordWrap: 'break-word'
                }}>
                  {uploadedCount} document{uploadedCount > 1 ? 's have' : ' has'} been successfully uploaded.
                </div>
              </>
            ) : (
              <>
                <div style={{width: 24, height: 24, position: 'relative', flexShrink: 0}}>
                  <div style={{width: 20.57, height: 20.57, left: 1.71, top: 1.71, position: 'absolute', background: 'rgba(217, 45, 32, 0.60)', borderRadius: 9999}} />
                  <div style={{width: 24, height: 24, left: 0, top: 0, position: 'absolute', background: 'rgba(217, 45, 32, 0.60)', borderRadius: 9999}} />
                  <div style={{width: 17.14, height: 17.14, left: 3.43, top: 3.43, position: 'absolute', background: '#D92D20', overflow: 'hidden', borderRadius: 8.57, outline: '1.07px #D92D20 solid', outlineOffset: '-1.07px'}}>
                    <div style={{width: 9.33, height: 9.33, left: 3.91, top: 3.91, position: 'absolute'}}>
                      <svg width="9" height="9" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M5.83333 2.5H4.16667V5.83333H5.83333V2.5ZM5.83333 7.5H4.16667V9.16667H5.83333V7.5Z" fill="white"/>
                      </svg>
                    </div>
                  </div>
                </div>
                <div style={{
                  flex: '1 1 0',
                  color: 'white',
                  fontSize: 13,
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: '400',
                  lineHeight: '18px',
                  wordWrap: 'break-word'
                }}>
                  {errorMessage || 'Upload failed. Please try again.'}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Keyframe animation for loading spinner */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes slideDown {
          from { transform: translateX(-50%) translateY(-20px); opacity: 0; }
          to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default UniversalUploadModal;
