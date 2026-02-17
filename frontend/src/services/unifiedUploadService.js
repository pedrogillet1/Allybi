/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * UnifiedUploadService - CANONICAL UPLOAD PIPELINE (OPTIMIZED)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * DEBUG_STALL: Set window.DEBUG_UPLOAD_STALL = true to force a 2.5s stall between
 * presigned URL batches. This allows deterministic testing of shimmer animations.
 *
 * Usage in browser console:
 *   window.DEBUG_UPLOAD_STALL = true;
 *   // Upload a folder - shimmer should appear after 1.5s of stall
 *
 * This is the SINGLE SOURCE OF TRUTH for all file uploads in Koda.
 * All upload entry points (UploadHub, UniversalUploadModal, drag-drop, etc.)
 * MUST use this service.
 *
 * OPTIMIZATIONS:
 * - Adaptive concurrency (4→6, throttle on errors)
 * - Exponential backoff with jitter
 * - Per-file throughput tracking
 * - Explicit confirmed status after DB+storage verification
 * - No silent failures
 *
 * DEPRECATED SERVICES (DO NOT USE):
 * - folderUploadService.js - DEPRECATED, use uploadFolder()
 * - presignedUploadService.js - DEPRECATED, use uploadSingleFile() / uploadFiles()
 *
 * ARCHITECTURE:
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Frontend                                                                    │
 * │  ┌─────────────┐    ┌──────────────────────┐    ┌───────────────────────┐  │
 * │  │ UploadHub   │───▶│ unifiedUploadService │───▶│ resumableUploadService│  │
 * │  │ UploadModal │    │ (this file)          │    │ (large files >20MB)   │  │
 * │  │ Drag-Drop   │    └──────────────────────┘    └───────────────────────┘  │
 * │  └─────────────┘              │                           │                 │
 * └───────────────────────────────┼───────────────────────────┼─────────────────┘
 *                                 │                           │
 *                                 ▼                           ▼
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Backend                                                                     │
 * │  ┌────────────────────────┐    ┌─────────────────────────────────────────┐ │
 * │  │ /api/presigned-urls    │    │ /api/multipart-upload                   │ │
 * │  │ - bulk (presigned URLs)│    │ - init (start multipart)                │ │
 * │  │ - complete/:id (finish)│    │ - urls (get part URLs)                  │ │
 * │  └────────────────────────┘    │ - complete (finalize)                   │ │
 * │                                │ - status/:id (check validity)           │ │
 * │                                └─────────────────────────────────────────┘ │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *                                 │
 *                                 ▼
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Google Cloud Storage (Direct Upload via Signed URLs)                       │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * FEATURES:
 * 1. Signed URLs for direct GCS uploads (bypasses backend file handling)
 * 2. Folder structure preservation for folder uploads
 * 3. True parallel processing (configurable concurrency, no artificial delays)
 * 4. Promise.allSettled for batch resilience (one failure doesn't fail all)
 * 5. Large file support via resumableUploadService (multipart, >20MB)
 * 6. Progress persistence to localStorage (resume after page refresh)
 * 7. Integrity verification (file size check against storage metadata)
 * 8. Hidden file filtering (.DS_Store, Thumbs.db, etc.)
 * 9. Unicode normalization for cross-platform compatibility
 *
 * UPLOAD FLOW:
 * 1. Filter files (remove hidden/system files)
 * 2. Analyze folder structure (if folder upload)
 * 3. Create categories/subfolders (bulk API)
 * 4. Check file sizes - route large files to resumable upload
 * 5. Request presigned URLs for small/medium files (batch of 50)
 * 6. Upload files directly to GCS with adaptive concurrency
 * 7. Verify DB + storage completion
 * 8. Mark as confirmed only after verification
 *
 * ERROR HANDLING:
 * - Individual file failures are tracked and reported
 * - Batch failures don't abort the entire upload
 * - Failed files are reported in the final result with error messages
 * - Users see clear error feedback in the UI
 */

import api from './api';
import axios from 'axios';
import { uploadLargeFile } from './resumableUploadService';
import {
  UPLOAD_CONFIG,
  shouldUseResumableUpload,
  calculateRetryDelay,
  isPermanentError,
  isTransientError
} from '../config/upload.config';

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE FLAGS - Legacy path control
// ═══════════════════════════════════════════════════════════════════════════
// FEATURE_FLAG_IMMEDIATE_ENQUEUE: Set to false to disable legacy per-file completion.
// When false, all uploads use bulk completion via /complete-bulk endpoint.
const FEATURE_FLAG_IMMEDIATE_ENQUEUE = false; // DEPRECATED: Use bulk completion instead

// ═══════════════════════════════════════════════════════════════════════════
// ADAPTIVE CONCURRENCY CONTROLLER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Manages adaptive concurrency based on success/failure rates
 */
class AdaptiveConcurrencyController {
  constructor() {
    this.currentConcurrency = UPLOAD_CONFIG.INITIAL_CONCURRENT_UPLOADS;
    this.recentResults = []; // sliding window of recent results
    this.windowSize = UPLOAD_CONFIG.CONCURRENCY_WINDOW_SIZE;
    this.throttledUntil = 0;
  }

  /**
   * Record a result and adjust concurrency
   * @param {boolean} success - Whether the upload succeeded
   * @param {number|null} errorStatus - HTTP status code if error
   */
  recordResult(success, errorStatus = null) {
    this.recentResults.push({ success, errorStatus, timestamp: Date.now() });

    // Keep only recent results
    if (this.recentResults.length > this.windowSize) {
      this.recentResults.shift();
    }

    // Check for throttling (429) or server errors (5xx)
    if (!success && (errorStatus === 429 || (errorStatus >= 500 && errorStatus < 600))) {
      this.throttle();
      return;
    }

    // Adjust concurrency based on success rate
    this.adjustConcurrency();
  }

  /**
   * Throttle concurrency after rate limiting
   */
  throttle() {
    this.currentConcurrency = Math.max(
      UPLOAD_CONFIG.MIN_CONCURRENT_UPLOADS,
      Math.floor(this.currentConcurrency / 2)
    );
    this.throttledUntil = Date.now() + 5000; // Throttle for 5 seconds
    console.log(`⚠️ [Concurrency] Throttled to ${this.currentConcurrency} concurrent uploads`);
  }

  /**
   * Adjust concurrency based on success rate
   */
  adjustConcurrency() {
    if (this.recentResults.length < this.windowSize) return;
    if (Date.now() < this.throttledUntil) return;

    const successRate = this.recentResults.filter(r => r.success).length / this.recentResults.length;

    if (successRate >= UPLOAD_CONFIG.CONCURRENCY_INCREASE_THRESHOLD) {
      // High success rate - increase concurrency
      if (this.currentConcurrency < UPLOAD_CONFIG.MAX_CONCURRENT_UPLOADS) {
        this.currentConcurrency++;
        console.log(`⬆️ [Concurrency] Increased to ${this.currentConcurrency} (success rate: ${(successRate * 100).toFixed(1)}%)`);
      }
    } else if (successRate < 0.7) {
      // Low success rate - decrease concurrency
      if (this.currentConcurrency > UPLOAD_CONFIG.MIN_CONCURRENT_UPLOADS) {
        this.currentConcurrency--;
        console.log(`⬇️ [Concurrency] Decreased to ${this.currentConcurrency} (success rate: ${(successRate * 100).toFixed(1)}%)`);
      }
    }
  }

  /**
   * Get current concurrency level
   */
  getConcurrency() {
    return this.currentConcurrency;
  }

  /**
   * Reset for new upload session
   */
  reset() {
    this.currentConcurrency = UPLOAD_CONFIG.INITIAL_CONCURRENT_UPLOADS;
    this.recentResults = [];
    this.throttledUntil = 0;
  }
}

// Singleton instance
const concurrencyController = new AdaptiveConcurrencyController();

// ═══════════════════════════════════════════════════════════════════════════
// PROGRESS NORMALIZER - Enforces UX Contracts
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 🔧 PROGRESS NORMALIZER - Single source of truth for progress updates
 *
 * ENFORCES:
 * 1. Monotonicity: percentage NEVER decreases (except for error state)
 * 2. Bounds: percentage always in [0, 100]
 * 3. Size truth: totalBytes NEVER regresses to 0 if previously set
 * 4. Source tracking: logs transitions with source tags for debugging
 *
 * @param {object} prev - Previous progress state { percentage, totalBytes, ... }
 * @param {object} next - New progress update { percentage, totalBytes, stage, message, ... }
 * @param {string} source - Source tag for debugging (e.g., "presignBatch", "uploadBytes")
 * @param {string} sessionId - Upload session ID for tracing
 * @returns {object} Normalized progress that respects UX contracts
 */
function normalizeProgress(prev, next, source = 'unknown', sessionId = '') {
  const DEBUG = typeof window !== 'undefined' && window.DEBUG_UPLOAD_PROGRESS;

  // Extract values with safe defaults
  const prevPct = prev?.percentage ?? 0;
  const nextPct = next?.percentage ?? prevPct;
  const prevBytes = prev?.totalBytes ?? 0;
  const nextBytes = next?.totalBytes ?? 0;

  // Normalize percentage: clamp to [0, 100] and enforce monotonicity
  // EXCEPTION: stage 'error' is allowed to show 0
  let normalizedPct;
  if (next?.stage === 'error') {
    // Error state - don't reset to 0, keep at current percentage
    normalizedPct = prevPct;
  } else {
    // Normal case: enforce monotonicity (never go backwards)
    normalizedPct = Math.max(prevPct, Math.min(100, nextPct));
  }

  // Normalize totalBytes: NEVER allow regression to 0
  // If we had a valid totalBytes before, keep it unless new one is larger
  let normalizedBytes = nextBytes;
  if (prevBytes > 0 && (nextBytes === 0 || nextBytes === undefined)) {
    // Preserve previous totalBytes - don't regress to 0
    normalizedBytes = prevBytes;
  } else if (prevBytes > 0 && nextBytes > 0) {
    // Keep the larger of the two (totalBytes shouldn't shrink)
    normalizedBytes = Math.max(prevBytes, nextBytes);
  }

  // Debug logging
  if (DEBUG) {
    const pctChanged = Math.abs(normalizedPct - prevPct) > 0.1;
    const bytesChanged = normalizedBytes !== prevBytes;
    if (pctChanged || bytesChanged) {
      console.log(`📊 [Progress] [${source}] session=${sessionId.slice(0,8)} | ` +
        `pct: ${prevPct.toFixed(1)}→${normalizedPct.toFixed(1)} | ` +
        `bytes: ${formatFileSize(prevBytes)}→${formatFileSize(normalizedBytes)} | ` +
        `stage: ${next?.stage || 'unknown'} | ` +
        `msg: ${next?.message?.slice(0, 30) || ''}`);
    }
  }

  // Return normalized progress object
  return {
    ...next,
    percentage: normalizedPct,
    totalBytes: normalizedBytes,
    // Include previous bytesUploaded if not provided
    bytesUploaded: next?.bytesUploaded ?? prev?.bytesUploaded ?? 0,
    // Track normalization metadata
    _normalized: true,
    _source: source,
    _prevPct: prevPct,
    _prevBytes: prevBytes,
  };
}

// Session-scoped progress state for normalizer
const sessionProgressState = new Map(); // sessionId -> { percentage, totalBytes, ... }

/**
 * Get or create progress state for a session
 */
function getSessionProgress(sessionId) {
  if (!sessionProgressState.has(sessionId)) {
    sessionProgressState.set(sessionId, { percentage: 0, totalBytes: 0, bytesUploaded: 0 });
  }
  return sessionProgressState.get(sessionId);
}

/**
 * Update session progress with normalization
 */
function updateSessionProgress(sessionId, update, source) {
  const prev = getSessionProgress(sessionId);
  const normalized = normalizeProgress(prev, update, source, sessionId);
  sessionProgressState.set(sessionId, normalized);
  return normalized;
}

/**
 * Clear session progress (call on session end)
 */
function clearSessionProgress(sessionId) {
  sessionProgressState.delete(sessionId);
}

// ═══════════════════════════════════════════════════════════════════════════
// THROUGHPUT MONITOR WITH EWMA SMOOTHING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 🔧 GOOGLE DRIVE STYLE: Tracks upload throughput with EWMA smoothing for stable UI
 * - Uses Exponentially Weighted Moving Average for smooth speed display
 * - Calculates ETA based on remaining bytes and smoothed throughput
 * - Exposes real-time metrics for UI consumption
 */
class ThroughputMonitor {
  constructor() {
    this.startTime = null;
    this.totalBytes = 0;
    this.uploadedBytes = 0;
    this.fileCount = 0;
    this.completedFiles = 0;
    this.samples = [];
    this.lastSampleTime = 0;
    this.lastSampleBytes = 0;
    // EWMA smoothing factor (0.3 = 30% weight to new sample, 70% to history)
    this.ewmaAlpha = 0.3;
    this.ewmaThroughput = 0; // Smoothed throughput in bytes/sec
    this.peakThroughputMbps = 0;
  }

  start(totalBytes, fileCount) {
    this.startTime = Date.now();
    this.totalBytes = totalBytes;
    this.fileCount = fileCount;
    this.uploadedBytes = 0;
    this.completedFiles = 0;
    this.samples = [];
    this.lastSampleTime = this.startTime;
    this.lastSampleBytes = 0;
    this.ewmaThroughput = 0;
    this.peakThroughputMbps = 0;
  }

  recordProgress(bytes) {
    this.uploadedBytes += bytes;
    this.sampleThroughput();
  }

  recordFileComplete(fileSize) {
    this.completedFiles++;
    this.sampleThroughput();
  }

  sampleThroughput() {
    const now = Date.now();
    const interval = now - this.lastSampleTime;

    // Sample at 500ms intervals for smooth updates
    if (interval >= 500) {
      const intervalBytes = this.uploadedBytes - this.lastSampleBytes;
      const intervalSeconds = interval / 1000;
      const instantThroughputBps = intervalBytes / intervalSeconds; // bytes/sec
      const throughputMbps = (instantThroughputBps * 8) / (1024 * 1024);

      // Apply EWMA smoothing
      if (this.ewmaThroughput === 0) {
        this.ewmaThroughput = instantThroughputBps;
      } else {
        this.ewmaThroughput = (this.ewmaAlpha * instantThroughputBps) + ((1 - this.ewmaAlpha) * this.ewmaThroughput);
      }

      // Track peak
      if (throughputMbps > this.peakThroughputMbps) {
        this.peakThroughputMbps = throughputMbps;
      }

      this.samples.push({
        timestamp: now,
        throughputMbps,
        ewmaThroughputMbps: (this.ewmaThroughput * 8) / (1024 * 1024),
        completedFiles: this.completedFiles,
        uploadedBytes: this.uploadedBytes
      });

      if (UPLOAD_CONFIG.ENABLE_THROUGHPUT_LOGGING) {
        const smoothedMbps = (this.ewmaThroughput * 8) / (1024 * 1024);
        console.log(`📊 [Throughput] ${smoothedMbps.toFixed(2)} Mbps (smoothed) | ${this.completedFiles}/${this.fileCount} files | ${((this.uploadedBytes / this.totalBytes) * 100).toFixed(1)}%`);
      }

      this.lastSampleTime = now;
      this.lastSampleBytes = this.uploadedBytes;
    }
  }

  /**
   * Get real-time progress data for UI
   * @returns {Object} Progress data with throughput, bytes, ETA
   */
  getProgress() {
    const remainingBytes = this.totalBytes - this.uploadedBytes;
    const smoothedMbps = (this.ewmaThroughput * 8) / (1024 * 1024);

    // Calculate ETA in seconds
    let etaSeconds = null;
    if (this.ewmaThroughput > 0 && remainingBytes > 0) {
      etaSeconds = Math.ceil(remainingBytes / this.ewmaThroughput);
    }

    return {
      bytesUploaded: this.uploadedBytes,
      totalBytes: this.totalBytes,
      throughputMbps: smoothedMbps,
      peakThroughputMbps: this.peakThroughputMbps,
      etaSeconds,
      completedFiles: this.completedFiles,
      totalFiles: this.fileCount,
      percentage: this.totalBytes > 0 ? (this.uploadedBytes / this.totalBytes) * 100 : 0
    };
  }

  getReport() {
    const duration = Date.now() - this.startTime;
    const avgThroughputMbps = this.samples.length > 0
      ? this.samples.reduce((sum, s) => sum + s.throughputMbps, 0) / this.samples.length
      : (this.uploadedBytes * 8) / (duration * 1024);

    return {
      duration,
      totalBytes: this.totalBytes,
      uploadedBytes: this.uploadedBytes,
      avgThroughputMbps: avgThroughputMbps.toFixed(2),
      peakThroughputMbps: this.peakThroughputMbps.toFixed(2),
      filesPerSecond: (this.completedFiles / (duration / 1000)).toFixed(2)
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
  MAX_CONCURRENT_UPLOADS: UPLOAD_CONFIG.MAX_CONCURRENT_UPLOADS,
  RESUMABLE_THRESHOLD: UPLOAD_CONFIG.RESUMABLE_UPLOAD_THRESHOLD_BYTES,
  MAX_RETRIES: UPLOAD_CONFIG.MAX_RETRIES,
  INITIAL_RETRY_DELAY: UPLOAD_CONFIG.RETRY_DELAY_BASE,
  MAX_CONFIRM_RETRIES: 5,
  HIDDEN_FILE_PATTERNS: UPLOAD_CONFIG.HIDDEN_FILE_PATTERNS,
  ALLOWED_EXTENSIONS: UPLOAD_CONFIG.ALLOWED_EXTENSIONS,
};

// ═══════════════════════════════════════════════════════════════════════════
// UPLOAD SESSION TRACKING & STRUCTURED LOGGING
// ═══════════════════════════════════════════════════════════════════════════

function generateUploadSessionId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return timestamp + '-' + random;
}

let currentUploadSession = null;

function getCurrentSessionId() {
  return currentUploadSession;
}

/**
 * Structured logger for upload operations
 * Prefixes all logs with session ID for easy filtering
 */
function createUploadLogger(sessionId, type = 'Upload') {
  const prefix = `[${type}:${sessionId}]`;

  return {
    info: (message, data = null) => {
      if (data) {
        console.log(`📤 ${prefix} ${message}`, data);
      } else {
        console.log(`📤 ${prefix} ${message}`);
      }
    },
    success: (message, data = null) => {
      if (data) {
        console.log(`✅ ${prefix} ${message}`, data);
      } else {
        console.log(`✅ ${prefix} ${message}`);
      }
    },
    warn: (message, data = null) => {
      if (data) {
        console.warn(`⚠️ ${prefix} ${message}`, data);
      } else {
        console.warn(`⚠️ ${prefix} ${message}`);
      }
    },
    error: (message, error = null) => {
      if (error) {
        console.error(`❌ ${prefix} ${message}`, error);
      } else {
        console.error(`❌ ${prefix} ${message}`);
      }
    },
    progress: (stage, current, total, extra = '') => {
      const percent = total > 0 ? Math.round((current / total) * 100) : 0;
      console.log(`📊 ${prefix} [${stage}] ${current}/${total} (${percent}%)${extra ? ' - ' + extra : ''}`);
    },
    summary: (stats) => {
      console.log(`📋 ${prefix} SUMMARY:`, {
        total: stats.total,
        success: stats.success,
        failed: stats.failed,
        skipped: stats.skipped,
        duration: `${stats.duration}ms`
      });
    },
    sessionId
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// FILE FILTERING
// ═══════════════════════════════════════════════════════════════════════════

function isHiddenFile(filename) {
  if (!filename) return true;
  if (filename.startsWith('.')) return true;
  return CONFIG.HIDDEN_FILE_PATTERNS.some(pattern => filename.includes(pattern));
}

function isAllowedFile(filename) {
  if (!filename) return false;
  const ext = '.' + filename.split('.').pop().toLowerCase();
  return CONFIG.ALLOWED_EXTENSIONS.includes(ext);
}

function filterFiles(files) {
  const validFiles = [];
  const skippedFiles = [];

  files.forEach(file => {
    const filename = file.name || file.webkitRelativePath?.split('/').pop() || '';

    if (isHiddenFile(filename)) {
      skippedFiles.push({ file, reason: 'hidden/system file' });
    } else if (!isAllowedFile(filename)) {
      skippedFiles.push({ file, reason: 'unsupported file type' });
    } else {
      validFiles.push(file);
    }
  });

  return { validFiles, skippedFiles };
}

// ═══════════════════════════════════════════════════════════════════════════
// FOLDER STRUCTURE ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

function analyzeFolderStructure(files) {
  if (files.length === 0) {
    throw new Error('No files provided');
  }

  const firstPath = files[0].webkitRelativePath;
  if (!firstPath) {
    throw new Error('Files must have webkitRelativePath (folder upload required)');
  }

  const rootFolderName = firstPath.split('/')[0].normalize('NFC');

  if (!rootFolderName || rootFolderName.trim() === '') {
    throw new Error('Invalid folder name: folder name cannot be empty');
  }
  if (rootFolderName === '.' || rootFolderName === '..') {
    throw new Error(`Invalid folder name: ${rootFolderName} is not allowed`);
  }

  const subfolderSet = new Set();
  const subfolders = [];
  const fileList = [];

  files.forEach(file => {
    const fullPath = file.webkitRelativePath;
    const pathParts = fullPath.split('/');
    const relativeParts = pathParts.slice(1);

    fileList.push({
      file: file,
      fullPath: fullPath.normalize('NFC'),
      relativePath: relativeParts.join('/').normalize('NFC'),
      fileName: relativeParts[relativeParts.length - 1].normalize('NFC'),
      depth: relativeParts.length - 1,
      folderPath: relativeParts.length > 1 ? relativeParts.slice(0, -1).join('/').normalize('NFC') : null
    });

    for (let i = 0; i < relativeParts.length - 1; i++) {
      const folderPath = relativeParts.slice(0, i + 1).join('/').normalize('NFC');
      const folderName = relativeParts[i].normalize('NFC');
      const parentPath = i > 0 ? relativeParts.slice(0, i).join('/').normalize('NFC') : null;

      if (!subfolderSet.has(folderPath)) {
        subfolderSet.add(folderPath);
        subfolders.push({
          name: folderName,
          path: folderPath,
          parentPath: parentPath,
          depth: i
        });
      }
    }
  });

  subfolders.sort((a, b) => a.depth - b.depth);
  return { rootFolderName, subfolders, files: fileList };
}

// ═══════════════════════════════════════════════════════════════════════════
// FOLDER CREATION
// ═══════════════════════════════════════════════════════════════════════════

async function ensureCategory(categoryName) {
  if (!categoryName || typeof categoryName !== 'string') {
    throw new Error(`Invalid category name: ${JSON.stringify(categoryName)}`);
  }
  const trimmedName = categoryName.trim();
  if (trimmedName === '' || trimmedName === '.' || trimmedName === '..') {
    throw new Error(`Invalid category name: ${categoryName} is not allowed`);
  }

  // Single POST — backend returns existing folder on conflict (upsert behavior)
  const createResponse = await api.post('/api/folders', { name: trimmedName });
  const d = createResponse.data?.data || createResponse.data;
  return d?.id || d?.folder?.id;
}

async function createSubfolders(subfolders, categoryId) {
  if (subfolders.length === 0) return {};

  try {
    const response = await api.post('/api/folders/bulk', {
      folderTree: subfolders,
      defaultEmoji: null,
      parentFolderId: categoryId
    });
    return response.data?.folderMap || {};
  } catch (error) {
    console.error('Failed to create subfolders:', error);
    return {};
  }
}

async function ensureSubfolder(folderName, parentFolderId) {
  const createResponse = await api.post('/api/folders', {
    name: folderName,
    parentId: parentFolderId
  });
  const d = createResponse.data?.data || createResponse.data;
  return d?.id || d?.folder?.id;
}

// ═══════════════════════════════════════════════════════════════════════════
// FILE HASHING
// ═══════════════════════════════════════════════════════════════════════════

function calculateFileHash(file) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/hash.worker.js', import.meta.url));

    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error(`Hash calculation timeout for ${file.name}`));
    }, 60000);

    worker.onmessage = (event) => {
      clearTimeout(timeout);
      if (event.data.error) {
        reject(new Error(event.data.error));
      } else {
        resolve(event.data.hash);
      }
      worker.terminate();
    };

    worker.onerror = (error) => {
      clearTimeout(timeout);
      reject(error);
      worker.terminate();
    };

    worker.postMessage({ file });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PRESIGNED URL UPLOADS WITH SMART RETRY
// ═══════════════════════════════════════════════════════════════════════════

async function requestPresignedUrls(files, folderId, sessionId = null) {
  const urlRequests = files.map(fileInfo => ({
    fileName: (fileInfo.fileName || fileInfo.file.name).normalize('NFC'),
    fileType: resolveUploadMimeType(fileInfo.file),
    fileSize: fileInfo.file.size,
    relativePath: fileInfo.relativePath ? fileInfo.relativePath.normalize('NFC') : null,
    folderId: fileInfo.folderId || folderId
  }));

  const headers = {};
  if (sessionId || currentUploadSession) {
    headers['X-Upload-Session-Id'] = sessionId || currentUploadSession;
  }

  const { data } = await api.post('/api/presigned-urls/bulk', {
    files: urlRequests,
    folderId,
    uploadSessionId: sessionId || currentUploadSession
  }, { headers });

  // Extract storageMode from response (local or gcs)
  return {
    presignedUrls: data.presignedUrls || [],
    documentIds: data.documentIds || [],
    skippedFiles: data.skippedFiles || [],
    storageMode: data.storageMode || 'gcs'
  };
}

/**
 * Request presigned URLs in batches with progress callback
 * Provides incremental progress updates for large folder uploads
 *
 * HARDENED VERSION with:
 * - SessionId threading for request tracing
 * - Timeout per batch (20s default, faster failure detection)
 * - Retry logic (up to 3 attempts per batch)
 * - Structured error handling
 * - ✅ FIX: Progress emitted AFTER batch completion (not before)
 * - ✅ FIX: Progress emitted even on batch failure for user visibility
 *
 * @param {Array} files - Array of file info objects
 * @param {string} folderId - Target folder ID
 * @param {Function} onBatchProgress - Callback with (completed, total) counts
 * @param {string} sessionId - Upload session ID for request tracing
 * @param {number} batchSize - Number of files per batch (default 50)
 */
async function requestPresignedUrlsWithProgress(files, folderId, onBatchProgress, sessionId = null, batchSize = 100) {
  const MAX_RETRIES = 3;
  const BATCH_TIMEOUT_MS = 20000; // ✅ FIX: Reduced from 30s to 20s for faster failure detection

  /**
   * Execute a single batch request with timeout and retry
   */
  async function executeBatchWithRetry(batch, retryCount = 0) {
    try {
      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Batch request timed out after 20s')), BATCH_TIMEOUT_MS);
      });

      // Race between actual request and timeout
      const result = await Promise.race([
        requestPresignedUrls(batch, folderId, sessionId),
        timeoutPromise
      ]);

      return result;
    } catch (error) {
      if (retryCount < MAX_RETRIES - 1) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, retryCount) * 1000;
        console.warn(`[PresignedBatch] Retry ${retryCount + 1}/${MAX_RETRIES} after ${delay}ms: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return executeBatchWithRetry(batch, retryCount + 1);
      }
      throw error;
    }
  }

  // For small numbers of files, use single request
  if (files.length <= batchSize) {
    onBatchProgress?.(0, files.length);
    const result = await executeBatchWithRetry(files);
    onBatchProgress?.(files.length, files.length);
    return result;
  }

  // Process in batches
  const allPresignedUrls = [];
  const allDocumentIds = [];
  const allSkippedFiles = [];
  const errors = [];
  let capturedStorageMode = null;

  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, Math.min(i + batchSize, files.length));
    const batchNumber = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(files.length / batchSize);

    // ✅ FIX: Removed early progress emission - will emit AFTER batch completes
    // This prevents UI getting stuck at intermediate percentage when batch fails

    // DEBUG: Force stall for shimmer testing (set window.DEBUG_UPLOAD_STALL = true in console)
    if (typeof window !== 'undefined' && window.DEBUG_UPLOAD_STALL && batchNumber > 1) {
      console.log('[DEBUG] Forcing 2.5s stall for shimmer testing...');
      await new Promise(resolve => setTimeout(resolve, 2500));
    }

    try {
      console.log(`[PresignedBatch] Processing batch ${batchNumber}/${totalBatches} (${batch.length} files, session: ${sessionId?.slice(0, 8) || 'none'})`);

      const { presignedUrls = [], documentIds = [], skippedFiles = [], storageMode } = await executeBatchWithRetry(batch);

      allPresignedUrls.push(...presignedUrls);
      allDocumentIds.push(...documentIds);
      allSkippedFiles.push(...skippedFiles);
      // Capture storage mode from first batch (all batches use same backend config)
      if (!capturedStorageMode && storageMode) {
        capturedStorageMode = storageMode;
      }

      // ✅ FIX: Emit progress AFTER batch completes successfully
      // This ensures progress only advances when batch is done
      onBatchProgress?.(Math.min(i + batchSize, files.length), files.length);

    } catch (error) {
      console.error(`[PresignedBatch] Batch ${batchNumber}/${totalBatches} failed after ${MAX_RETRIES} retries:`, error.message);
      errors.push({ batchNumber, error: error.message, fileCount: batch.length });

      // ✅ FIX: Emit progress EVEN ON FAILURE to show user we're still making progress
      // Skip the failed batch but show we attempted it
      onBatchProgress?.(Math.min(i + batch.length, files.length), files.length);

      // Continue with next batch - don't fail entire upload
    }
  }

  // Final progress callback (idempotent - safe to call again)
  onBatchProgress?.(files.length, files.length);

  // Log summary if there were errors
  if (errors.length > 0) {
    console.warn(`[PresignedBatch] Completed with ${errors.length} failed batches:`, errors);
  }

  return {
    presignedUrls: allPresignedUrls,
    documentIds: allDocumentIds,
    skippedFiles: allSkippedFiles,
    storageMode: capturedStorageMode || 'gcs',
    batchErrors: errors.length > 0 ? errors : undefined
  };
}

/**
 * Upload single file to signed URL (GCS) or local backend with smart retry policy
 * - Retries transient errors with exponential backoff + jitter
 * - Does NOT retry permanent errors (403, 413, etc.)
 * - Supports local storage mode for fast development uploads
 */
async function uploadFileToSignedUrl(file, presignedUrl, documentId, onProgress, immediateEnqueue = false, throughputMonitor = null, isLocalStorage = false) {
  let retries = 0;
  let lastError = null;

  while (retries <= CONFIG.MAX_RETRIES) {
    try {
      const startTime = Date.now();

      let response;
      if (isLocalStorage) {
        // LOCAL STORAGE: POST to backend endpoint with multipart form data
        const formData = new FormData();
        formData.append('file', file, file.name);

        response = await api.post(presignedUrl, formData, {
          // Let the browser/axios set multipart boundaries
          onUploadProgress: (progressEvent) => {
            if (onProgress && progressEvent.total) {
              const percent = (progressEvent.loaded / progressEvent.total) * 100;
              onProgress(percent);
            }
            if (throughputMonitor && progressEvent.loaded) {
              throughputMonitor.recordProgress(progressEvent.loaded - (progressEvent._lastLoaded || 0));
              progressEvent._lastLoaded = progressEvent.loaded;
            }
          }
        });
      } else {
        // CLOUD STORAGE: PUT directly to signed URL (GCS)
        response = await axios.put(presignedUrl, file, {
          headers: {
            'Content-Type': resolveUploadMimeType(file),
          },
          onUploadProgress: (progressEvent) => {
            if (onProgress && progressEvent.total) {
              const percent = (progressEvent.loaded / progressEvent.total) * 100;
              onProgress(percent);
            }
            // Track throughput
            if (throughputMonitor && progressEvent.loaded) {
              throughputMonitor.recordProgress(progressEvent.loaded - (progressEvent._lastLoaded || 0));
              progressEvent._lastLoaded = progressEvent.loaded;
            }
          }
        });
      }

      if (response.status !== 200 && response.status !== 201) {
        throw new Error(`Upload failed with status ${response.status}`);
      }

      // Record success
      concurrencyController.recordResult(true);
      if (throughputMonitor) {
        throughputMonitor.recordFileComplete(file.size);
      }

      // Log throughput (masked)
      const duration = Date.now() - startTime;
      const throughputMbps = (file.size * 8) / (duration * 1024);
      console.log(`✅ [Upload] ${maskFileName(file.name)} | ${formatFileSize(file.size)} | ${throughputMbps.toFixed(2)} Mbps`);

      // Immediate enqueue for processing
      let immediatelyEnqueued = false;
      if (immediateEnqueue) {
        try {
          // Pass file size for integrity verification against storage metadata
          await completeSingleDocument(documentId, file.size);
          immediatelyEnqueued = true;
          console.log(`⚡ [Upload] Document ${documentId} queued for processing immediately (size verified: ${file.size} bytes)`);
        } catch (enqueueError) {
          console.warn(`⚠️ [Upload] Failed to immediately enqueue ${documentId}, will retry in batch`);
        }
      }

      return {
        success: true,
        documentId,
        immediatelyEnqueued,
        confirmed: false, // Will be set to true after verification
        fileSize: file.size,
        uploadDuration: duration
      };

    } catch (error) {
      lastError = error;
      const status = error?.response?.status || 0;

      // Record failure
      concurrencyController.recordResult(false, status);

      // Check if permanent error - do NOT retry
      if (isPermanentError(error)) {
        console.error(`❌ [Upload] Permanent error for ${maskFileName(file.name)}: ${status} - ${error.message}`);

        // Rollback: Delete orphaned database record
        try {
          await api.delete(`/api/documents/${documentId}`);
        } catch (rollbackError) {
          console.warn(`⚠️ Failed to rollback document ${documentId}`);
        }

        return {
          success: false,
          documentId,
          error: `Permanent error: ${status} - ${getErrorMessage(error)}`,
          errorCode: status,
          permanent: true
        };
      }

      // Transient error - retry with backoff + jitter
      retries++;
      if (retries <= CONFIG.MAX_RETRIES) {
        const delay = calculateRetryDelay(retries - 1);
        console.log(`⚠️ [Upload] Retrying ${maskFileName(file.name)} in ${delay}ms (attempt ${retries}/${CONFIG.MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All retries exhausted
  console.error(`❌ [Upload] Failed after ${CONFIG.MAX_RETRIES} retries: ${maskFileName(file.name)}`);

  // Rollback orphaned record
  try {
    await api.delete(`/api/documents/${documentId}`);
  } catch (rollbackError) {
    console.warn(`⚠️ Failed to rollback document ${documentId}`);
  }

  return {
    success: false,
    documentId,
    error: `Failed after ${CONFIG.MAX_RETRIES} retries: ${getErrorMessage(lastError)}`,
    permanent: false
  };
}

/**
 * Complete a single document upload and immediately enqueue for processing
 * This enables per-file pipeline: upload → process without waiting for other files
 *
 * INTEGRITY VERIFICATION:
 * - Sends fileSize to backend for verification against storage metadata
 * - Backend may compare size/etag to ensure upload integrity
 *
 * @param {string} documentId - The document ID to complete
 * @param {number} fileSize - The original file size in bytes (for integrity verification)
 */
/**
 * Complete a single document upload
 * @deprecated Use completeBulkDocuments instead - disabled via FEATURE_FLAG_IMMEDIATE_ENQUEUE
 */
async function completeSingleDocument(documentId, fileSize = null) {
  // HARD DISABLE: Throw error if this legacy path is ever triggered
  if (!FEATURE_FLAG_IMMEDIATE_ENQUEUE) {
    console.error('[DEPRECATED] completeSingleDocument called but FEATURE_FLAG_IMMEDIATE_ENQUEUE=false');
    throw new Error('Legacy per-file completion is disabled. Use bulk completion.');
  }

  try {
    const response = await api.post(`/api/presigned-urls/complete/${documentId}`, {
      // Send file size for integrity verification
      fileSize: fileSize
    }, {
      timeout: 30000
    });
    return response.data;
  } catch (error) {
    console.error(`❌ Failed to complete document ${documentId}:`, error);
    throw error;
  }
}

/**
 * Complete bulk documents after all direct-to-storage uploads finish.
 * This replaces 600+ individual /complete/:documentId calls with a single batch operation.
 */
async function completeBulkDocuments(documentIds, uploadSessionId) {
  const response = await api.post('/api/presigned-urls/complete-bulk', {
    documentIds,
    uploadSessionId,
    // Backend currently fast-confirms based on DB transition; reserved for future storage verification.
    skipStorageCheck: false
  }, {
    timeout: 120000 // 2 minutes for bulk operation
  });
  return response.data;
}

/**
 * Incremental bulk completion flusher:
 * Start processing as soon as individual files finish uploading, without waiting
 * for the entire folder/session to upload.
 *
 * Design:
 * - Enqueues completed documentIds into a set.
 * - Flushes in micro-batches either:
 *   - when we have enough IDs (minBatchSize), OR
 *   - after a short debounce (flushIntervalMs).
 * - Uses /complete-bulk which is idempotent, so retries/duplicates are safe.
 */
function createIncrementalBulkCompletionFlusher(uploadSessionId, opts = {}) {
  const flushIntervalMs = Number(opts.flushIntervalMs ?? 250);
  const minBatchSize = Number(opts.minBatchSize ?? 25);
  const maxBatchSize = Number(opts.maxBatchSize ?? 200); // matches default PUBSUB_FANOUT_BATCH_SIZE

  const pending = new Set();
  let timer = null;
  let enabled = true;
  let inFlight = Promise.resolve();

  const takeBatch = () => {
    const batch = [];
    for (const id of pending) {
      batch.push(id);
      pending.delete(id);
      if (batch.length >= maxBatchSize) break;
    }
    return batch;
  };

  const flushLoop = async (force) => {
    while (pending.size > 0) {
      if (!force && pending.size < minBatchSize) return;
      const batch = takeBatch();
      if (batch.length === 0) return;
      try {
        await completeBulkDocuments(batch, uploadSessionId);
      } catch (e) {
        // Best-effort: re-queue and let later flushes/final completion reconcile.
        batch.forEach((id) => pending.add(id));
        return;
      }
      force = false;
    }
  };

  const triggerFlush = (force = false) => {
    if (!enabled) return;
    inFlight = inFlight.then(() => flushLoop(force)).catch(() => {});
  };

  const scheduleFlush = () => {
    if (!enabled) return;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      triggerFlush(true);
    }, flushIntervalMs);
  };

  return {
    enqueue(documentId) {
      if (!enabled || !documentId) return;
      pending.add(documentId);
      // Flush quickly once we have a decent batch; otherwise debounce a forced flush.
      if (pending.size >= minBatchSize) triggerFlush(false);
      else scheduleFlush();
    },
    async stopAndFlush() {
      enabled = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }

      // Drain whatever is already in-flight first.
      await inFlight;

      // Best-effort final flush of remaining ids (idempotent).
      if (pending.size > 0) {
        try {
          await completeBulkDocuments(Array.from(pending), uploadSessionId);
        } catch {
          // ignore — final verification/reconciliation will handle stragglers
        } finally {
          pending.clear();
        }
      }
    },
  };
}

/**
 * Notify backend of completed uploads with retry
 */
async function notifyCompletionWithRetry(documentIds) {
  let lastError = null;

  for (let attempt = 1; attempt <= CONFIG.MAX_CONFIRM_RETRIES; attempt++) {
    try {
      const response = await api.post('/api/presigned-urls/complete', {
        documentIds
      }, {
        timeout: 60000
      });
      return response.data;
    } catch (error) {
      lastError = error;

      if (isPermanentError(error)) throw error;

      if (attempt < CONFIG.MAX_CONFIRM_RETRIES) {
        const delay = calculateRetryDelay(attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

/**
 * Verify uploads are confirmed (DB record + storage object exist)
 */
async function verifyUploadsConfirmed(documentIds) {
  try {
    const response = await api.post('/api/documents/verify-uploads', {
      documentIds
    }, { timeout: 30000 });
    return response.data;
  } catch (error) {
    console.warn('⚠️ [Upload] Verification endpoint not available, skipping');
    // If endpoint doesn't exist, assume verified
    return { verified: documentIds, missing: [] };
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * POST-SESSION RECONCILIATION
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * INVARIANT ENFORCED:
 * After an upload session ends, NO documents remain in 'uploading' status.
 * Every attempted file ends as: confirmed, failed_incomplete, failed, or skipped.
 *
 * This function calls the backend to:
 * 1. HEAD-check storage for each attempted document still in 'uploading' status
 * 2. Mark documents with missing storage as 'failed_incomplete'
 * 3. Mark documents with storage present as 'available'
 *
 * @param {string} sessionId - Upload session ID
 * @param {Array<{documentId: string, fileName: string, fileSize: number}>} attemptedDocs - Documents that were attempted
 * @returns {Promise<{orphanedCount: number, verifiedCount: number, orphanedDocuments: string[], verifiedDocuments: string[]}>}
 */
async function reconcileUploadSession(sessionId, attemptedDocs) {
  if (!attemptedDocs || attemptedDocs.length === 0) {
    console.log(`🔍 [Reconciliation] No documents to reconcile for session ${sessionId}`);
    return { orphanedCount: 0, verifiedCount: 0, orphanedDocuments: [], verifiedDocuments: [] };
  }

  const documentIds = attemptedDocs.map(d => d.documentId).filter(Boolean);
  if (documentIds.length === 0) {
    console.log(`🔍 [Reconciliation] No document IDs to reconcile`);
    return { orphanedCount: 0, verifiedCount: 0, orphanedDocuments: [], verifiedDocuments: [] };
  }

  console.log(`🔍 [Reconciliation] Starting reconciliation for ${documentIds.length} documents (session: ${sessionId})`);

  try {
    const response = await api.post('/api/presigned-urls/reconcile', {
      documentIds,
      sessionId
    }, { timeout: 60000 });

    const result = response.data;
    console.log(`✅ [Reconciliation] Complete: ${result.orphanedCount} failed_incomplete, ${result.verifiedCount} verified`);

    return {
      orphanedCount: result.orphanedCount || 0,
      verifiedCount: result.verifiedCount || 0,
      orphanedDocuments: result.orphanedDocuments || [],
      verifiedDocuments: result.verifiedDocuments || []
    };
  } catch (error) {
    console.error(`❌ [Reconciliation] Failed: ${error.message}`);
    // Non-blocking - don't fail the whole upload if reconciliation fails
    return { orphanedCount: 0, verifiedCount: 0, orphanedDocuments: [], verifiedDocuments: [], error: error.message };
  }
}

/**
 * Enforce the upload session invariant and return validated results
 *
 * INVARIANT: discovered = confirmed + failed + skipped
 *
 * @param {object} results - Raw upload results
 * @param {number} discovered - Total files discovered
 * @param {object} reconciliation - Reconciliation results
 * @returns {object} - Validated results with invariant check
 */
function enforceSessionInvariant(results, discovered, reconciliation, opts = {}) {
  const pending = Number(opts.pending || 0);
  const succeeded = results.filter(r => r.success && !r.skipped);
  const skipped = results.filter(r => r.skipped);
  const failed = results.filter(r => !r.success);

  // Count confirmed (success + storage verified)
  const confirmed = succeeded.filter(r => r.confirmed).length;
  const confirmedDocIds = new Set(
    succeeded.filter(r => r.confirmed && r.documentId).map(r => r.documentId)
  );

  // Add reconciliation results — only count docs NOT already confirmed to avoid double-counting
  const failedIncomplete = reconciliation.orphanedCount || 0;
  const lateVerified = (reconciliation.verifiedDocuments || [])
    .filter(id => !confirmedDocIds.has(id)).length;

  // Final counts (confirmed excludes pending uploads still in "uploading" status)
  const totalConfirmed = confirmed + lateVerified;
  const totalFailed = failed.length + failedIncomplete;
  const totalSkipped = skipped.length;

  // Validate invariant
  // Strict invariant: discovered = confirmed + failed + skipped (requires pending=0)
  // Relaxed invariant: discovered = confirmed + pending + failed + skipped
  const strictInvariantCheck = totalConfirmed + totalFailed + totalSkipped;
  const strictInvariantValid = strictInvariantCheck === discovered;

  const relaxedInvariantCheck = totalConfirmed + pending + totalFailed + totalSkipped;
  const relaxedInvariantValid = relaxedInvariantCheck === discovered;

  if (!strictInvariantValid && pending === 0) {
    console.error(`❌ [Invariant] VIOLATED: discovered(${discovered}) != confirmed(${totalConfirmed}) + failed(${totalFailed}) + skipped(${totalSkipped}) = ${strictInvariantCheck}`);
  } else if (!relaxedInvariantValid) {
    console.error(`❌ [Invariant] VIOLATED: discovered(${discovered}) != confirmed(${totalConfirmed}) + pending(${pending}) + failed(${totalFailed}) + skipped(${totalSkipped}) = ${relaxedInvariantCheck}`);
  } else {
    const expr = pending > 0
      ? `${discovered} = ${totalConfirmed} + ${pending} + ${totalFailed} + ${totalSkipped}`
      : `${discovered} = ${totalConfirmed} + ${totalFailed} + ${totalSkipped}`;
    console.log(`✅ [Invariant] VALID: ${expr}`);
  }

  return {
    discovered,
    confirmed: totalConfirmed,
    pending,
    failed: totalFailed,
    failedIncomplete,
    skipped: totalSkipped,
    invariantValid: pending > 0 ? relaxedInvariantValid : strictInvariantValid,
    strictInvariantValid,
    relaxedInvariantValid,
    invariantExpression: pending > 0
      ? `${discovered} = ${totalConfirmed} + ${pending} + ${totalFailed} + ${totalSkipped}`
      : `${discovered} = ${totalConfirmed} + ${totalFailed} + ${totalSkipped}`
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ADAPTIVE PARALLEL UPLOAD ENGINE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Process uploads with adaptive concurrency
 */
async function processUploadsAdaptively(uploadTasks, onBatchProgress) {
  const results = [];
  let activeCount = 0;
  let completedCount = 0;
  let taskIndex = 0;

  // Reset concurrency controller for new session
  concurrencyController.reset();

  return new Promise((resolve) => {
    const processNext = async () => {
      // Get current concurrency limit
      const maxConcurrent = concurrencyController.getConcurrency();

      // Start new tasks if we have capacity
      while (activeCount < maxConcurrent && taskIndex < uploadTasks.length) {
        const currentIndex = taskIndex++;
        activeCount++;

        uploadTasks[currentIndex]()
          .then(result => {
            results[currentIndex] = result;
            activeCount--;
            completedCount++;
            onBatchProgress?.(completedCount, uploadTasks.length);
            processNext();
          })
          .catch(error => {
            results[currentIndex] = { success: false, error: error.message };
            activeCount--;
            completedCount++;
            onBatchProgress?.(completedCount, uploadTasks.length);
            processNext();
          });
      }

      // Check if all done
      if (completedCount === uploadTasks.length) {
        resolve(results);
      }
    };

    // Start initial batch
    processNext();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function maskFileName(name) {
  if (!name || name.length <= 10) return name;
  return name.substring(0, 5) + '...' + name.substring(name.length - 5);
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function inferMimeTypeFromFilename(filename = '') {
  const ext = String(filename).split('.').pop()?.toLowerCase() || '';
  const map = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain',
    csv: 'text/csv',
    html: 'text/html',
    htm: 'text/html',
    rtf: 'application/rtf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    tif: 'image/tiff',
    tiff: 'image/tiff',
  };
  return map[ext] || 'application/octet-stream';
}

function resolveUploadMimeType(file) {
  const browserMime = String(file?.type || '').trim();
  if (browserMime && browserMime !== 'application/octet-stream') return browserMime;
  return inferMimeTypeFromFilename(file?.name || '');
}

function getErrorMessage(error) {
  if (error?.response?.data?.message) return error.response.data.message;
  if (error?.message) return error.message;
  return String(error);
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN UPLOAD FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Upload multiple files with adaptive concurrency and throughput monitoring
 */
async function uploadFiles(files, folderId, onProgress) {
  const startTime = Date.now();
  const sessionId = generateUploadSessionId();
  currentUploadSession = sessionId;
  const log = createUploadLogger(sessionId, 'Files');

  log.info(`Starting upload session`, { totalFiles: files.length, folderId });

  // Filter files
  const { validFiles, skippedFiles } = filterFiles(files);

  if (skippedFiles.length > 0) {
    log.warn(`Filtered out ${skippedFiles.length} files`, skippedFiles.slice(0, 5).map(f => ({ name: f.file?.name, reason: f.reason })));
  }

  if (validFiles.length === 0) {
    log.error('No valid files to upload');
    throw new Error('No valid files to upload');
  }

  // Separate large files from small files
  const largeFiles = validFiles.filter(f => shouldUseResumableUpload(f.size));
  const smallFiles = validFiles.filter(f => !shouldUseResumableUpload(f.size));

  log.info(`Processing ${validFiles.length} files`, { small: smallFiles.length, large: largeFiles.length });

  // Initialize throughput monitor
  const totalBytes = validFiles.reduce((sum, f) => sum + f.size, 0);
  const throughputMonitor = new ThroughputMonitor();
  throughputMonitor.start(totalBytes, validFiles.length);

  const results = [];
  let completedCount = 0;

  // Upload large files first (one at a time)
  if (largeFiles.length > 0) {
    onProgress?.({ stage: 'uploading', message: `Uploading large files (0/${largeFiles.length})...`, percentage: 5 });

    for (const file of largeFiles) {
      try {
        const result = await uploadLargeFile(file, folderId, (progress) => {
          const largeFileProgress = (completedCount / validFiles.length) * 100;
          const currentProgress = progress.percentage / 100 / validFiles.length * 100;
          onProgress?.({
            stage: 'uploading',
            message: `Uploading large file: ${maskFileName(file.name)}`,
            percentage: 5 + (largeFileProgress + currentProgress) * 0.85
          });
        });
        results.push({ ...result, confirmed: true });
        completedCount++;
        throughputMonitor.recordFileComplete(file.size);
      } catch (error) {
        results.push({ success: false, fileName: file.name, error: error?.message || String(error), confirmed: false });
        completedCount++;
      }
    }
  }

  // Upload small files using presigned URLs with adaptive concurrency
  if (smallFiles.length > 0) {
    const fileInfos = smallFiles.map(file => ({
      file,
      fileName: file.name.normalize('NFC'),
      folderId
    }));

    onProgress?.({ stage: 'preparing', message: 'Preparing upload...', percentage: 5 + (completedCount / validFiles.length) * 85 });
    const { presignedUrls, documentIds, skippedFiles: skippedByBackend = [], storageMode } = await requestPresignedUrls(fileInfos, folderId);
    const isLocalStorage = storageMode === 'local';
    const completionFlusher = createIncrementalBulkCompletionFlusher(sessionId);

    // Handle skipped files - match by webkitRelativePath (folder uploads) or name
    // Backend now returns relativePath when available to avoid same-name collisions
    const skippedSet = new Set(skippedByBackend.map(f => f.normalize('NFC')));
    const filesToUpload = smallFiles.filter(f => {
      const matchKey = (f.webkitRelativePath || f.name).normalize('NFC');
      return !skippedSet.has(matchKey);
    });

    if (skippedByBackend.length > 0) {
      log.info(`${skippedByBackend.length} files skipped (already exist)`);
      for (const skippedName of skippedByBackend) {
        results.push({ success: true, fileName: skippedName, skipped: true, confirmed: true });
        completedCount++;
      }
    }

    onProgress?.({ stage: 'uploading', message: 'Uploading files...', percentage: 10 + (completedCount / validFiles.length) * 85 });

    // Build upload tasks
    const uploadProgressByFile = new Map();
    const uploadTasks = filesToUpload.map((file, idx) => {
      const docId = documentIds[idx];
      return async () => {
        const result = await uploadFileToSignedUrl(
          file,
          presignedUrls[idx],
          docId,
          (percent) => {
            uploadProgressByFile.set(docId, percent);
            const totalProgress = Array.from(uploadProgressByFile.values()).reduce((sum, p) => sum + p, 0);
            const avgProgress = totalProgress / filesToUpload.length;
            const overallPct = 10 + ((completedCount / validFiles.length) * 85) + (avgProgress / validFiles.length * 0.85);
            onProgress?.({
              stage: 'uploading',
              message: `Uploading ${maskFileName(file.name)}... ${Math.round(percent)}%`,
              percentage: Math.min(95, overallPct)
            });
          },
          false, // bulk completion handles this
          throughputMonitor,
          isLocalStorage
        );
        if (result?.success && docId) completionFlusher.enqueue(docId);
        uploadProgressByFile.set(docId, 100);
        completedCount++;
        return { ...result, fileName: file.name };
      };
    });

    // Process with adaptive concurrency
    const uploadResults = await processUploadsAdaptively(
      uploadTasks,
      (completed, total) => {
        const pct = 10 + ((completedCount / validFiles.length) * 85);
        onProgress?.({
          stage: 'uploading',
          message: `Uploaded ${completed}/${total} files...`,
          percentage: Math.min(95, pct)
        });
      }
    );

    results.push(...uploadResults);

    // Flush any remaining completions (processing should already be in-flight).
    // This prevents leaving docs stuck in "uploading" when the last batch is small.
    onProgress?.({ stage: 'finalizing', message: 'Starting processing...', percentage: 95 });
    await completionFlusher.stopAndFlush();
  }

  // Verify uploads are confirmed
  onProgress?.({ stage: 'verifying', message: 'Verifying uploads...', percentage: 95 });
  const successfulDocIds = results.filter(r => r.success && r.documentId).map(r => r.documentId);
  let pendingDocIds = [];
  if (successfulDocIds.length > 0) {
    const verification = await verifyUploadsConfirmed(successfulDocIds);
    // Mark verified uploads as confirmed
    const verifiedSet = new Set(verification.verified || successfulDocIds);
    pendingDocIds = Array.isArray(verification.pending) ? verification.pending : [];
    results.forEach(r => {
      if (r.documentId && verifiedSet.has(r.documentId)) {
        r.confirmed = true;
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // POST-SESSION RECONCILIATION - Enforce the "no orphan" invariant
  // ═══════════════════════════════════════════════════════════════════════════════
  // Reconcile ONLY documents that are still "uploading" in the DB (pending).
  // This keeps reconciliation fast for large folders and prevents the UI from
  // feeling "stuck on the last file".
  let reconciliation = { orphanedCount: 0, verifiedCount: 0, orphanedDocuments: [], verifiedDocuments: [] };
  if (pendingDocIds.length > 0) {
    const pendingSet = new Set(pendingDocIds);
    const attemptedDocs = results
      .filter(r => r.documentId && pendingSet.has(r.documentId))
      .map(r => ({
        documentId: r.documentId,
        fileName: r.fileName,
        fileSize: r.fileSize
      }));

    // Fire-and-forget reconciliation so the UI isn't gated on housekeeping.
    // Any orphaned docs will be marked failed server-side.
    void reconcileUploadSession(sessionId, attemptedDocs).then((r) => {
      if (r?.error) {
        console.warn(`⚠️ [Reconciliation] Background reconcile returned error: ${r.error}`);
      } else {
        console.log(`✅ [Reconciliation] Background reconcile done: ${r.orphanedCount || 0} orphaned, ${r.verifiedCount || 0} verified`);
      }
    });
  }

  // Generate final report
  const duration = Date.now() - startTime;
  const throughputReport = throughputMonitor.getReport();

  console.log(`📊 [Upload Complete] ${throughputReport.avgThroughputMbps} Mbps avg | ${throughputReport.filesPerSecond} files/sec | ${(duration / 1000).toFixed(1)}s total`);

  onProgress?.({ stage: 'complete', message: 'Upload complete!', percentage: 100 });

  const failedResults = results.filter(r => !r.success);
  const skippedResults = results.filter(r => r.skipped);
  const succeededResults = results.filter(r => r.success && !r.skipped);
  const confirmedResults = results.filter(r => r.confirmed);

  // Enforce invariant: discovered = confirmed + failed + skipped
  // discovered counts only files that entered the upload pipeline (not client-side filtered files)
  const discovered = validFiles.length;
  const invariant = enforceSessionInvariant(results, discovered, reconciliation, { pending: pendingDocIds.length });

  return {
    uploadSessionId: sessionId,
    discovered,
    queued: validFiles.length,
    uploaded: succeededResults.length,
    confirmed: invariant.confirmed,
    pending: invariant.pending,
    successCount: succeededResults.length,
    failureCount: invariant.failed,
    failedIncomplete: reconciliation.orphanedCount || 0,
    totalFiles: validFiles.length,
    skippedFiles: skippedFiles.length,
    succeeded: succeededResults.map(r => ({ fileName: r.fileName, documentId: r.documentId, confirmed: r.confirmed })),
    failed: failedResults.map(r => ({ fileName: r.fileName, error: r.error, permanent: r.permanent })),
    skipped: [...skippedFiles.map(f => ({ fileName: f.file?.name || 'unknown', reason: f.reason })),
              ...skippedResults.map(r => ({ fileName: r.fileName, reason: 'already exists' }))],
    results,
    duration,
    throughput: throughputReport,
    reconciliation,
    invariant
  };
}

/**
 * Upload a folder with structure preservation
 */
async function uploadFolder(files, onProgress, existingCategoryId = null) {
  const startTime = Date.now();
  const sessionId = generateUploadSessionId();
  currentUploadSession = sessionId;
  const log = createUploadLogger(sessionId, 'Folder');
  const completionFlusher = createIncrementalBulkCompletionFlusher(sessionId);

  log.info(`Starting folder upload session`, { totalFiles: files.length, existingCategoryId });

  // ═══════════════════════════════════════════════════════════════════════════
  // FIX: Create normalized progress emitter that enforces UX contracts
  // All progress updates go through this wrapper to ensure:
  // 1. Monotonicity (percentage never decreases)
  // 2. Size truth (totalBytes never regresses to 0)
  // ═══════════════════════════════════════════════════════════════════════════
  const emitProgress = (update, source = 'generic') => {
    const normalized = updateSessionProgress(sessionId, update, source);
    onProgress?.(normalized);
  };

  try {
    emitProgress({ stage: 'filtering', message: 'Preparing files...', percentage: 1 }, 'filtering');
    const { validFiles, skippedFiles } = filterFiles(Array.from(files));

    if (skippedFiles.length > 0) {
      log.warn(`Filtered out ${skippedFiles.length} files`, skippedFiles.slice(0, 10).map(f => ({ name: f.file?.name, reason: f.reason })));
    }

    if (validFiles.length === 0) {
      const skippedReasons = skippedFiles.slice(0, 5).map(f => {
        const fileName = f.file?.name || f.file?.webkitRelativePath?.split('/').pop() || 'unknown';
        return `${fileName} (${f.reason || 'filtered'})`;
      }).join(', ');
      const extraCount = skippedFiles.length > 5 ? ` and ${skippedFiles.length - 5} more` : '';
      log.error(`No valid files to upload`, { skippedReasons });
      throw new Error(`No valid files to upload. Skipped: ${skippedReasons}${extraCount}`);
    }

    log.info(`${validFiles.length} files passed filtering`);

    // Step 1: Analyze folder structure
    emitProgress({ stage: 'analyzing', message: 'Analyzing folder structure...', percentage: 2 }, 'analyzing');
    const structure = analyzeFolderStructure(validFiles);

    log.info(`Folder structure analyzed`, {
      rootFolder: structure.rootFolderName,
      subfolders: structure.subfolders.length,
      files: structure.files.length
    });

    // Step 2: Create category/subfolder
    let categoryId;
    let categoryName;

    if (!existingCategoryId) {
      emitProgress({ stage: 'category', message: `Creating category ${structure.rootFolderName}...`, percentage: 3 }, 'createCategory');
      categoryId = await ensureCategory(structure.rootFolderName);
      categoryName = structure.rootFolderName;
    } else {
      emitProgress({ stage: 'category', message: `Creating folder ${structure.rootFolderName}...`, percentage: 3 }, 'createFolder');
      categoryId = await ensureSubfolder(structure.rootFolderName, existingCategoryId);
      categoryName = structure.rootFolderName;
    }

    let folderMap = {};
    if (structure.subfolders.length > 0) {
      emitProgress({ stage: 'subfolders', message: `Creating ${structure.subfolders.length} subfolders...`, percentage: 4 }, 'createSubfolders');
      folderMap = await createSubfolders(structure.subfolders, categoryId);
    }

    emitProgress({ stage: 'mapping', message: 'Preparing files...', percentage: 5 }, 'mapping');

    const fileInfos = structure.files.map(fileInfo => {
      let targetFolderId;
      if (fileInfo.depth === 0) {
        targetFolderId = categoryId;
      } else {
        targetFolderId = folderMap[fileInfo.folderPath];
      }
      return {
        file: fileInfo.file,
        fileName: fileInfo.fileName,
        relativePath: fileInfo.relativePath,
        folderId: targetFolderId
      };
    });

    const largeFileInfos = fileInfos.filter(fi => shouldUseResumableUpload(fi.file.size));
    const smallFileInfos = fileInfos.filter(fi => !shouldUseResumableUpload(fi.file.size));

    log.info(`Processing ${fileInfos.length} files`, { small: smallFileInfos.length, large: largeFileInfos.length });

    // Initialize throughput monitor
    const totalBytes = fileInfos.reduce((sum, fi) => sum + fi.file.size, 0);
    const throughputMonitor = new ThroughputMonitor();
    throughputMonitor.start(totalBytes, fileInfos.length);

    let completedCount = 0;
    const results = [];

    // ═══════════════════════════════════════════════════════════════════════════════
    // Unified byte-based progress: tracks bytes across BOTH large and small files
    // Upload phase: 8-95% (87 percentage points)
    // Progress = 8 + (uploadedBytesTotal / effectiveTotalBytes) * 87
    // ═══════════════════════════════════════════════════════════════════════════════
    let uploadedBytesTotal = 0;
    let effectiveTotalBytes = totalBytes;
    const uploadedBytesByFile = new Map();

    const emitByteProgress = (message, source) => {
      const ratio = effectiveTotalBytes > 0 ? uploadedBytesTotal / effectiveTotalBytes : 0;
      const pct = 8 + (ratio * 87);
      emitProgress({
        stage: 'uploading',
        message,
        percentage: Math.min(95, pct),
        bytesUploaded: uploadedBytesTotal,
        totalBytes: effectiveTotalBytes,
      }, source);
    };

    // Upload large files first (resumable)
    if (largeFileInfos.length > 0) {
      emitByteProgress(`Uploading large files (0/${largeFileInfos.length})...`, 'largeFilesStart');

      for (const fileInfo of largeFileInfos) {
        const largeFileSize = fileInfo.file.size;
        const largeFileId = `large_${completedCount}`;
        try {
          const result = await uploadLargeFile(fileInfo.file, fileInfo.folderId, (progress) => {
            // Track bytes for this large file
            const bytesForThisFile = Math.round((progress.percentage / 100) * largeFileSize);
            const prevBytes = uploadedBytesByFile.get(largeFileId) || 0;
            uploadedBytesByFile.set(largeFileId, bytesForThisFile);
            uploadedBytesTotal += (bytesForThisFile - prevBytes);
            emitByteProgress(`Uploading: ${maskFileName(fileInfo.fileName)}`, 'largeFileProgress');
          });
          // Ensure full size is counted
          const prevBytes = uploadedBytesByFile.get(largeFileId) || 0;
          uploadedBytesByFile.set(largeFileId, largeFileSize);
          uploadedBytesTotal += (largeFileSize - prevBytes);
          results.push({ ...result, fileName: fileInfo.fileName, confirmed: true });
          completedCount++;
          throughputMonitor.recordFileComplete(fileInfo.file.size);
        } catch (error) {
          log.error(`Failed to upload large file ${fileInfo.fileName}`, error);
          results.push({ success: false, fileName: fileInfo.fileName, error: error?.message || String(error), confirmed: false });
          completedCount++;
        }
      }
    }

    // Upload small files with adaptive concurrency
    if (smallFileInfos.length > 0) {
      // Presigned URL acquisition — emit progress above current level so normalizer doesn't suppress
      const presignStartTime = Date.now();
      log.info(`[Phase:PresignedURLs] Starting URL generation for ${smallFileInfos.length} files`, {
        sessionId,
        fileCount: smallFileInfos.length,
        categoryId
      });

      const { presignedUrls, documentIds, skippedFiles: skippedByBackend = [], storageMode } = await requestPresignedUrlsWithProgress(
        smallFileInfos,
        categoryId,
        (completed, total) => {
          // During presigned URL generation, emit at current byte progress + tiny increment
          // so the normalizer doesn't suppress (always moves forward)
          const ratio = effectiveTotalBytes > 0 ? uploadedBytesTotal / effectiveTotalBytes : 0;
          const currentPct = 8 + (ratio * 87);
          const urlBump = total > 0 ? (completed / total) * 2 : 0; // up to 2% bump
          const percentage = Math.max(currentPct, 8) + urlBump;

          if (completed === 0 || completed === total || (completed % 10 === 0)) {
            log.info(`[Phase:PresignedURLs] Progress: ${completed}/${total} files (${percentage.toFixed(1)}%)`, {
              sessionId, completed, total, percentage: percentage.toFixed(2), phase: 'preparing'
            });
          }

          emitProgress({
            stage: 'preparing',
            message: `Preparing files (${completed}/${total})...`,
            percentage,
            totalBytes: effectiveTotalBytes
          }, 'presignBatch');
        },
        sessionId
      );
      const isLocalStorage = storageMode === 'local';

      const presignDuration = Date.now() - presignStartTime;
      log.success(`[Phase:PresignedURLs] Generated ${presignedUrls.length} URLs in ${presignDuration}ms`, {
        sessionId,
        urlCount: presignedUrls.length,
        documentCount: documentIds.length,
        skippedCount: skippedByBackend.length,
        durationMs: presignDuration,
        avgTimePerUrl: (presignDuration / Math.max(presignedUrls.length, 1)).toFixed(2) + 'ms'
      });

      // Match skipped files by relativePath (preferred) or fileName
      // Backend now returns relativePath when available to avoid collisions with same-name files
      const skippedSet = new Set(skippedByBackend.map(f => f.normalize('NFC')));
      const fileInfosToUpload = smallFileInfos.filter(fi => {
        const matchKey = (fi.relativePath || fi.fileName).normalize('NFC');
        return !skippedSet.has(matchKey);
      });

      // Handle skipped files — reduce effective total and count their bytes as uploaded
      let skippedBytes = 0;
      if (skippedByBackend.length > 0) {
        log.info(`${skippedByBackend.length} files skipped (validation failed)`, skippedByBackend);
        for (const skippedKey of skippedByBackend) {
          // Match by relativePath or fileName (backend now returns relativePath when available)
          const normalizedKey = skippedKey.normalize('NFC');
          const skippedFileInfo = smallFileInfos.find(fi => {
            const matchKey = (fi.relativePath || fi.fileName).normalize('NFC');
            return matchKey === normalizedKey;
          });
          if (skippedFileInfo) {
            skippedBytes += skippedFileInfo.file.size;
          }
          // Extract just the filename for the result (user-facing)
          const displayName = skippedKey.includes('/') ? skippedKey.split('/').pop() : skippedKey;
          results.push({ success: true, fileName: displayName, skipped: true, confirmed: true });
          completedCount++;
        }
        log.info(`Skipped ${skippedByBackend.length} files (${formatFileSize(skippedBytes)})`);
        // Count skipped bytes as "uploaded" for progress
        uploadedBytesTotal += skippedBytes;
      }

      // Start small file upload phase
      emitByteProgress('Uploading files...', 'uploadStart');

      const uploadTasks = fileInfosToUpload.map((fileInfo, idx) => {
        const docId = documentIds[idx];
        const fileSize = fileInfo.file.size;
        return async () => {
          const result = await uploadFileToSignedUrl(
            fileInfo.file,
            presignedUrls[idx],
            docId,
            (percent) => {
              // Track bytes uploaded for this file
              const bytesForThisFile = Math.round((percent / 100) * fileSize);
              const prevBytes = uploadedBytesByFile.get(docId) || 0;
              uploadedBytesByFile.set(docId, bytesForThisFile);

              // Update total uploaded bytes
              uploadedBytesTotal += (bytesForThisFile - prevBytes);

              // Bytes-based progress calculation
              // Upload phase is 8-95% (87 percentage points)
              const uploadProgressRatio = effectiveTotalBytes > 0 ? uploadedBytesTotal / effectiveTotalBytes : 0;
              const overallPct = 8 + (uploadProgressRatio * 87);

              // Get throughput data
              const progressData = throughputMonitor.getProgress();
              emitProgress({
                stage: 'uploading',
                message: `Uploading ${maskFileName(fileInfo.fileName)}... ${Math.round(percent)}%`,
                percentage: Math.min(95, overallPct),  // Cap at 95% for finalizing
                bytesUploaded: uploadedBytesTotal,
                totalBytes: effectiveTotalBytes,
                ...progressData
              }, 'uploadBytes');
            },
            false, // bulk completion handles this
            throughputMonitor,
            isLocalStorage
          );
          if (result?.success && docId) completionFlusher.enqueue(docId);
          // Ensure final bytes are recorded (same pattern as large files)
          const prevFinalBytes = uploadedBytesByFile.get(docId) || 0;
          uploadedBytesByFile.set(docId, fileSize);
          uploadedBytesTotal += (fileSize - prevFinalBytes);
          completedCount++;
          return { ...result, fileName: fileInfo.fileName };
        };
      });

      const uploadResults = await processUploadsAdaptively(
        uploadTasks,
        (completed, total) => {
          // Bytes-based progress for batch updates too
          const uploadProgressRatio = effectiveTotalBytes > 0 ? uploadedBytesTotal / effectiveTotalBytes : 0;
          const pct = 8 + (uploadProgressRatio * 87);
          const progressData = throughputMonitor.getProgress();
          emitProgress({
            stage: 'uploading',
            message: `Uploaded ${completed}/${total} files...`,
            percentage: Math.min(95, pct),
            bytesUploaded: uploadedBytesTotal,
            totalBytes: effectiveTotalBytes,
            ...progressData
          }, 'uploadBatch');
        }
      );

      results.push(...uploadResults);

      // Ensure any remaining small-batch completions are flushed so documents
      // don't sit in "uploading" waiting for the session to end.
      await completionFlusher.stopAndFlush();
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // All files uploaded — emit 100% immediately so UI shows completion.
    // Verify/reconcile run afterward as backend housekeeping (non-blocking for UI).
    // ═══════════════════════════════════════════════════════════════════════════════
    const successfulUploads = results.filter(r => r.success);
    const successCount = successfulUploads.length;
    const failureCount = fileInfos.length - successCount;

    emitProgress({
      stage: 'complete',
      message: `${successCount} file${successCount !== 1 ? 's' : ''} uploaded`,
      percentage: 100,
      successCount,
      failureCount
    }, 'complete');

    // Clean up session progress state
    clearSessionProgress(sessionId);

    const duration = Date.now() - startTime;
    const throughputReport = throughputMonitor.getReport();

    // Log final summary
    log.summary({
      total: fileInfos.length,
      success: successCount,
      failed: failureCount,
      skipped: skippedFiles.length,
      duration
    });

    console.log(`📊 [Folder Upload Complete] ${throughputReport.avgThroughputMbps} Mbps avg | ${throughputReport.filesPerSecond} files/sec | ${(duration / 1000).toFixed(1)}s total`);

    // Verify uploads (fast DB check) so returned results are stable.
    // Reconciliation runs in the background and should not block the UI.
    let reconciliation = { orphanedCount: 0, verifiedCount: 0, orphanedDocuments: [], verifiedDocuments: [] };
    let pendingDocIds = [];
    const successfulDocIds = results.filter(r => r.success && r.documentId).map(r => r.documentId);
    if (successfulDocIds.length > 0) {
      try {
        const verification = await verifyUploadsConfirmed(successfulDocIds);
        const verifiedSet = new Set(verification.verified || successfulDocIds);
        pendingDocIds = Array.isArray(verification.pending) ? verification.pending : [];
        results.forEach(r => {
          if (r.documentId && verifiedSet.has(r.documentId)) {
            r.confirmed = true;
          }
        });
      } catch (housekeepingError) {
        log.error('Post-upload verification failed (non-blocking)', housekeepingError);
      }
    }

    if (pendingDocIds.length > 0) {
      const pendingSet = new Set(pendingDocIds);
      const attemptedDocs = results
        .filter(r => r.documentId && pendingSet.has(r.documentId))
        .map(r => ({
          documentId: r.documentId,
          fileName: r.fileName,
          fileSize: r.fileSize
        }));

      void reconcileUploadSession(sessionId, attemptedDocs).then((r) => {
        if (r?.error) {
          log.warn(`Background reconcile returned error`, { error: r.error });
        } else {
          log.info(`Background reconcile done`, { orphanedCount: r.orphanedCount || 0, verifiedCount: r.verifiedCount || 0 });
        }
      });
    }

    const failedResults = results.filter(r => !r.success);
    const skippedResults = results.filter(r => r.skipped);
    const succeededResults = results.filter(r => r.success && !r.skipped);
    const confirmedResults = results.filter(r => r.confirmed);

    // Enforce invariant: discovered = confirmed + failed + skipped
    // discovered counts only files that entered the upload pipeline (not client-side filtered files)
    const discovered = fileInfos.length;
    const invariant = enforceSessionInvariant(results, discovered, reconciliation, { pending: pendingDocIds.length });

    return {
      uploadSessionId: sessionId,
      discovered,
      queued: fileInfos.length,
      uploaded: succeededResults.length,
      confirmed: invariant.confirmed,
      pending: invariant.pending,
      successCount: succeededResults.length,
      failureCount: invariant.failed,
      failedIncomplete: reconciliation.orphanedCount || 0,
      totalFiles: fileInfos.length,
      skippedFiles: skippedFiles.length,
      succeeded: succeededResults.map(r => ({ fileName: r.fileName, documentId: r.documentId, confirmed: r.confirmed })),
      failed: failedResults.map(r => ({ fileName: r.fileName, error: r.error, permanent: r.permanent })),
      skipped: [...skippedFiles.map(f => ({ fileName: f.file?.name || 'unknown', reason: f.reason })),
                ...skippedResults.map(r => ({ fileName: r.fileName, reason: 'already exists' }))],
      categoryId,
      categoryName,
      results,
      duration,
      throughput: throughputReport,
      reconciliation,
      invariant,
      errors: failedResults.map(r => ({ fileName: r.fileName, error: r.error, permanent: r.permanent }))
    };
  } catch (error) {
    // FIX: Don't reset percentage to 0 on error - normalizer will preserve current progress
    emitProgress({ stage: 'error', message: error.message }, 'error');
    clearSessionProgress(sessionId);
    throw error;
  }
}

/**
 * Upload a single file
 */
async function uploadSingleFile(file, folderId, onProgress) {
  if (isHiddenFile(file.name)) {
    throw new Error(`Cannot upload hidden/system file: ${file.name}`);
  }
  if (!isAllowedFile(file.name)) {
    throw new Error(`Unsupported file type: ${file.name}`);
  }

  try {
    if (shouldUseResumableUpload(file.size)) {
      console.log(`📤 [Upload] Using resumable upload for large file: ${maskFileName(file.name)} (${formatFileSize(file.size)})`);
      return await uploadLargeFile(file, folderId, onProgress);
    }

    onProgress?.({ stage: 'preparing', message: 'Preparing...', percentage: 5 });

    const { data } = await api.post('/api/presigned-urls/bulk', {
      files: [{
        fileName: file.name.normalize('NFC'),
        fileType: resolveUploadMimeType(file),
        fileSize: file.size,
        folderId
      }],
      folderId
    });

    const presignedUrl = data.presignedUrls[0];
    const documentId = data.documentIds[0];
    const isLocalStorage = data.storageMode === 'local';

    onProgress?.({ stage: 'uploading', message: 'Uploading...', percentage: 10 });

    const result = await uploadFileToSignedUrl(
      file,
      presignedUrl,
      documentId,
      (percent) => {
        onProgress?.({
          stage: 'uploading',
          message: `Uploading... ${Math.round(percent)}%`,
          percentage: 10 + (percent * 0.8)
        });
      },
      false, // immediateEnqueue
      null, // throughputMonitor
      isLocalStorage
    );

    if (!result.success) {
      throw new Error(result.error || 'Upload failed');
    }

    onProgress?.({ stage: 'finalizing', message: 'Finalizing...', percentage: 95 });
    await notifyCompletionWithRetry([documentId]);

    onProgress?.({ stage: 'complete', message: 'Complete!', percentage: 100 });

    return {
      success: true,
      documentId,
      fileName: file.name,
      confirmed: true
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Upload a single file with a pre-fetched presigned URL (skips the /bulk API call).
 * Used by the modal when it batch-fetches presigned URLs for all files at once.
 */
async function uploadWithPresignedUrl(file, presignedUrl, documentId, isLocalStorage, onProgress) {
  try {
    onProgress?.({ stage: 'uploading', message: 'Uploading...', percentage: 10 });

    const result = await uploadFileToSignedUrl(
      file,
      presignedUrl,
      documentId,
      (percent) => {
        onProgress?.({
          stage: 'uploading',
          message: `Uploading... ${Math.round(percent)}%`,
          percentage: 10 + (percent * 0.8)
        });
      },
      false, // immediateEnqueue
      null, // throughputMonitor
      isLocalStorage
    );

    if (!result.success) {
      throw new Error(result.error || 'Upload failed');
    }

    onProgress?.({ stage: 'finalizing', message: 'Finalizing...', percentage: 95 });
    await notifyCompletionWithRetry([documentId]);

    onProgress?.({ stage: 'complete', message: 'Complete!', percentage: 100 });

    return {
      success: true,
      documentId,
      fileName: file.name,
      confirmed: true
    };
  } catch (error) {
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

const unifiedUploadService = {
  uploadFiles,
  uploadFolder,
  uploadSingleFile,
  uploadWithPresignedUrl,
  getCurrentSessionId,
  generateUploadSessionId,
  filterFiles,
  isHiddenFile,
  isAllowedFile,
  analyzeFolderStructure,
  calculateFileHash,
  ensureCategory,
  ensureSubfolder,
  createSubfolders,
  reconcileUploadSession,
  enforceSessionInvariant,
  CONFIG
};

export default unifiedUploadService;

export {
  uploadFiles,
  uploadFolder,
  uploadSingleFile,
  filterFiles,
  isHiddenFile,
  isAllowedFile,
  analyzeFolderStructure,
  calculateFileHash,
  reconcileUploadSession,
  enforceSessionInvariant,
  CONFIG
};
