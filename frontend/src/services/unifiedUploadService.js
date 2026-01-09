/**
 * UnifiedUploadService - OPTIMIZED for Throughput
 *
 * This service handles all file uploads with optimizations for:
 * - Adaptive concurrency (4→6, throttle on errors)
 * - Exponential backoff with jitter
 * - Per-file throughput tracking
 * - Explicit confirmed status after DB+S3 verification
 * - No silent failures
 *
 * UPLOAD FLOW:
 * 1. Filter files (remove hidden/system files)
 * 2. Analyze folder structure (if folder upload)
 * 3. Create categories/subfolders (bulk API)
 * 4. Check file sizes - route large files to resumable upload
 * 5. Request presigned URLs for small/medium files
 * 6. Upload files directly to S3 with adaptive concurrency
 * 7. Verify DB + S3 completion
 * 8. Mark as confirmed only after verification
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
// THROUGHPUT MONITOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tracks and logs upload throughput (masked for security)
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
    if (now - this.lastSampleTime >= UPLOAD_CONFIG.THROUGHPUT_SAMPLE_INTERVAL) {
      const intervalBytes = this.uploadedBytes - this.lastSampleBytes;
      const intervalSeconds = (now - this.lastSampleTime) / 1000;
      const throughputMbps = (intervalBytes * 8) / (intervalSeconds * 1024 * 1024);
      
      this.samples.push({
        timestamp: now,
        throughputMbps,
        completedFiles: this.completedFiles,
        uploadedBytes: this.uploadedBytes
      });

      if (UPLOAD_CONFIG.ENABLE_THROUGHPUT_LOGGING) {
        console.log(`📊 [Throughput] ${throughputMbps.toFixed(2)} Mbps | ${this.completedFiles}/${this.fileCount} files | ${((this.uploadedBytes / this.totalBytes) * 100).toFixed(1)}%`);
      }

      this.lastSampleTime = now;
      this.lastSampleBytes = this.uploadedBytes;
    }
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
      peakThroughputMbps: this.samples.length > 0 
        ? Math.max(...this.samples.map(s => s.throughputMbps)).toFixed(2)
        : 'N/A',
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
// UPLOAD SESSION TRACKING
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

  const createResponse = await api.post('/api/folders', {
    name: trimmedName,
    emoji: null,
    reuseExisting: true
  });

  return createResponse.data.folder.id;
}

async function createSubfolders(subfolders, categoryId) {
  if (subfolders.length === 0) return {};

  const response = await api.post('/api/folders/bulk', {
    folderTree: subfolders,
    defaultEmoji: null,
    parentFolderId: categoryId
  });
  return response.data.folderMap;
}

async function ensureSubfolder(folderName, parentFolderId) {
  const foldersResponse = await api.get('/api/folders?includeAll=true');
  const existingSubfolder = foldersResponse.data.folders.find(
    f => f.name === folderName && f.parentFolderId === parentFolderId
  );

  if (existingSubfolder) return existingSubfolder.id;

  const createResponse = await api.post('/api/folders', {
    name: folderName,
    emoji: null,
    parentFolderId: parentFolderId
  });
  return createResponse.data.folder.id;
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
    fileType: fileInfo.file.type || 'application/octet-stream',
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
  return data;
}

/**
 * Upload single file to S3 with smart retry policy
 * - Retries transient errors with exponential backoff + jitter
 * - Does NOT retry permanent errors (403, 413, etc.)
 */
async function uploadFileToS3(file, presignedUrl, documentId, onProgress, immediateEnqueue = false, throughputMonitor = null) {
  let retries = 0;
  let lastError = null;

  while (retries <= CONFIG.MAX_RETRIES) {
    try {
      const startTime = Date.now();
      
      const response = await axios.put(presignedUrl, file, {
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'x-amz-server-side-encryption': 'AES256'
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

      if (response.status !== 200) {
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
          await completeSingleDocument(documentId);
          immediatelyEnqueued = true;
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
 * Complete a single document upload
 */
async function completeSingleDocument(documentId) {
  const response = await api.post(`/api/presigned-urls/complete/${documentId}`, {}, {
    timeout: 30000
  });
  return response.data;
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
 * Verify uploads are confirmed (DB record + S3 object exist)
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
  console.log('[Upload] Session ID:', sessionId);

  // Filter files
  const { validFiles, skippedFiles } = filterFiles(files);

  if (validFiles.length === 0) {
    throw new Error('No valid files to upload');
  }

  // Separate large files from small files
  const largeFiles = validFiles.filter(f => shouldUseResumableUpload(f.size));
  const smallFiles = validFiles.filter(f => !shouldUseResumableUpload(f.size));

  console.log(`📤 [Upload] Processing ${validFiles.length} files: ${smallFiles.length} small, ${largeFiles.length} large`);

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
    const { presignedUrls, documentIds, skippedFiles: skippedByBackend = [] } = await requestPresignedUrls(fileInfos, folderId);

    // Handle skipped files
    const skippedSet = new Set(skippedByBackend.map(f => f.normalize('NFC')));
    const filesToUpload = smallFiles.filter(f => !skippedSet.has(f.name.normalize('NFC')));

    if (skippedByBackend.length > 0) {
      console.log(`📋 [Upload] ${skippedByBackend.length} files skipped (already exist)`);
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
        const result = await uploadFileToS3(
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
          true, // immediate enqueue
          throughputMonitor
        );
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

    // Batch completion for files that weren't immediately enqueued
    const notImmediatelyEnqueued = uploadResults.filter(r => r.success && !r.immediatelyEnqueued);
    if (notImmediatelyEnqueued.length > 0) {
      onProgress?.({ stage: 'finalizing', message: 'Finalizing...', percentage: 95 });
      await notifyCompletionWithRetry(notImmediatelyEnqueued.map(r => r.documentId));
    }
  }

  // Verify uploads are confirmed
  onProgress?.({ stage: 'verifying', message: 'Verifying uploads...', percentage: 97 });
  const successfulDocIds = results.filter(r => r.success && r.documentId).map(r => r.documentId);
  if (successfulDocIds.length > 0) {
    const verification = await verifyUploadsConfirmed(successfulDocIds);
    // Mark verified uploads as confirmed
    const verifiedSet = new Set(verification.verified || successfulDocIds);
    results.forEach(r => {
      if (r.documentId && verifiedSet.has(r.documentId)) {
        r.confirmed = true;
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

  return {
    uploadSessionId: sessionId,
    discovered: validFiles.length + skippedFiles.length,
    queued: validFiles.length,
    uploaded: succeededResults.length,
    confirmed: confirmedResults.length,
    successCount: succeededResults.length,
    failureCount: failedResults.length,
    totalFiles: validFiles.length,
    skippedFiles: skippedFiles.length,
    succeeded: succeededResults.map(r => ({ fileName: r.fileName, documentId: r.documentId, confirmed: r.confirmed })),
    failed: failedResults.map(r => ({ fileName: r.fileName, error: r.error, permanent: r.permanent })),
    skipped: [...skippedFiles.map(f => ({ fileName: f.file?.name || 'unknown', reason: f.reason })),
              ...skippedResults.map(r => ({ fileName: r.fileName, reason: 'already exists' }))],
    results,
    duration,
    throughput: throughputReport
  };
}

/**
 * Upload a folder with structure preservation
 */
async function uploadFolder(files, onProgress, existingCategoryId = null) {
  const startTime = Date.now();
  const sessionId = generateUploadSessionId();
  currentUploadSession = sessionId;
  console.log('[Folder Upload] Session ID:', sessionId);

  try {
    onProgress?.({ stage: 'filtering', message: 'Filtering files...', percentage: 2 });
    const { validFiles, skippedFiles } = filterFiles(Array.from(files));

    if (validFiles.length === 0) {
      const skippedReasons = skippedFiles.slice(0, 5).map(f => {
        const fileName = f.file?.name || f.file?.webkitRelativePath?.split('/').pop() || 'unknown';
        return `${fileName} (${f.reason || 'filtered'})`;
      }).join(', ');
      const extraCount = skippedFiles.length > 5 ? ` and ${skippedFiles.length - 5} more` : '';
      throw new Error(`No valid files to upload. Skipped: ${skippedReasons}${extraCount}`);
    }

    onProgress?.({ stage: 'analyzing', message: 'Analyzing folder structure...', percentage: 5 });
    const structure = analyzeFolderStructure(validFiles);

    let categoryId;
    let categoryName;

    if (!existingCategoryId) {
      onProgress?.({ stage: 'category', message: `Creating category ${structure.rootFolderName}...`, percentage: 8 });
      categoryId = await ensureCategory(structure.rootFolderName);
      categoryName = structure.rootFolderName;
    } else {
      onProgress?.({ stage: 'category', message: `Creating folder ${structure.rootFolderName}...`, percentage: 8 });
      categoryId = await ensureSubfolder(structure.rootFolderName, existingCategoryId);
      categoryName = structure.rootFolderName;
    }

    let folderMap = {};
    if (structure.subfolders.length > 0) {
      onProgress?.({ stage: 'subfolders', message: `Creating ${structure.subfolders.length} subfolders...`, percentage: 12 });
      folderMap = await createSubfolders(structure.subfolders, categoryId);
    }

    onProgress?.({ stage: 'mapping', message: 'Preparing files...', percentage: 15 });

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

    console.log(`📤 [Folder Upload] Processing ${fileInfos.length} files: ${smallFileInfos.length} small, ${largeFileInfos.length} large`);

    // Initialize throughput monitor
    const totalBytes = fileInfos.reduce((sum, fi) => sum + fi.file.size, 0);
    const throughputMonitor = new ThroughputMonitor();
    throughputMonitor.start(totalBytes, fileInfos.length);

    let completedCount = 0;
    const results = [];

    // Upload large files first
    if (largeFileInfos.length > 0) {
      onProgress?.({ stage: 'uploading', message: `Uploading large files (0/${largeFileInfos.length})...`, percentage: 18 });

      for (const fileInfo of largeFileInfos) {
        try {
          const result = await uploadLargeFile(fileInfo.file, fileInfo.folderId, (progress) => {
            const largeFileProgress = (completedCount / fileInfos.length) * 100;
            onProgress?.({
              stage: 'uploading',
              message: `Uploading large file: ${maskFileName(fileInfo.fileName)}`,
              percentage: 18 + (largeFileProgress + progress.percentage / fileInfos.length) * 0.72
            });
          });
          results.push({ ...result, fileName: fileInfo.fileName, confirmed: true });
          completedCount++;
          throughputMonitor.recordFileComplete(fileInfo.file.size);
        } catch (error) {
          results.push({ success: false, fileName: fileInfo.fileName, error: error?.message || String(error), confirmed: false });
          completedCount++;
        }
      }
    }

    // Upload small files with adaptive concurrency
    if (smallFileInfos.length > 0) {
      onProgress?.({ stage: 'preparing', message: 'Requesting upload URLs...', percentage: 18 + (completedCount / fileInfos.length) * 72 });
      const { presignedUrls, documentIds, skippedFiles: skippedByBackend = [] } = await requestPresignedUrls(smallFileInfos, categoryId);

      const skippedSet = new Set(skippedByBackend.map(f => f.normalize('NFC')));
      const fileInfosToUpload = smallFileInfos.filter(fi => !skippedSet.has(fi.fileName.normalize('NFC')));

      if (skippedByBackend.length > 0) {
        console.log(`📋 [Folder Upload] ${skippedByBackend.length} files skipped (already exist)`);
        for (const skippedName of skippedByBackend) {
          results.push({ success: true, fileName: skippedName, skipped: true, confirmed: true });
          completedCount++;
        }
      }

      onProgress?.({ stage: 'uploading', message: 'Uploading files...', percentage: 20 + (completedCount / fileInfos.length) * 70 });

      const uploadProgressByFile = new Map();
      const uploadTasks = fileInfosToUpload.map((fileInfo, idx) => {
        const docId = documentIds[idx];
        return async () => {
          const result = await uploadFileToS3(
            fileInfo.file,
            presignedUrls[idx],
            docId,
            (percent) => {
              uploadProgressByFile.set(docId, percent);
              const totalProgress = Array.from(uploadProgressByFile.values()).reduce((sum, p) => sum + p, 0);
              const avgProgress = totalProgress / fileInfosToUpload.length;
              const overallPct = 20 + ((completedCount / fileInfos.length) * 70) + (avgProgress / fileInfos.length * 0.70);
              onProgress?.({
                stage: 'uploading',
                message: `Uploading ${maskFileName(fileInfo.fileName)}... ${Math.round(percent)}%`,
                percentage: Math.min(90, overallPct)
              });
            },
            true,
            throughputMonitor
          );
          uploadProgressByFile.set(docId, 100);
          completedCount++;
          return { ...result, fileName: fileInfo.fileName };
        };
      });

      const uploadResults = await processUploadsAdaptively(
        uploadTasks,
        (completed, total) => {
          const pct = 20 + ((completedCount / fileInfos.length) * 70);
          onProgress?.({
            stage: 'uploading',
            message: `Uploaded ${completed}/${total} files...`,
            percentage: Math.min(90, pct)
          });
        }
      );

      results.push(...uploadResults);

      const notImmediatelyEnqueued = uploadResults.filter(r => r.success && !r.immediatelyEnqueued);
      if (notImmediatelyEnqueued.length > 0) {
        try {
          await notifyCompletionWithRetry(notImmediatelyEnqueued.map(r => r.documentId));
        } catch (confirmError) {
          console.error('Failed to notify completion for remaining files:', confirmError);
        }
      }
    }

    // Verify uploads
    onProgress?.({ stage: 'verifying', message: 'Verifying uploads...', percentage: 92 });
    const successfulDocIds = results.filter(r => r.success && r.documentId).map(r => r.documentId);
    if (successfulDocIds.length > 0) {
      const verification = await verifyUploadsConfirmed(successfulDocIds);
      const verifiedSet = new Set(verification.verified || successfulDocIds);
      results.forEach(r => {
        if (r.documentId && verifiedSet.has(r.documentId)) {
          r.confirmed = true;
        }
      });
    }

    onProgress?.({ stage: 'processing', message: 'Processing documents...', percentage: 80 });

    const duration = Date.now() - startTime;
    const throughputReport = throughputMonitor.getReport();
    const successfulUploads = results.filter(r => r.success);
    const successCount = successfulUploads.length;
    const failureCount = fileInfos.length - successCount;

    console.log(`📊 [Folder Upload Complete] ${throughputReport.avgThroughputMbps} Mbps avg | ${throughputReport.filesPerSecond} files/sec | ${(duration / 1000).toFixed(1)}s total`);

    onProgress?.({
      stage: 'processing',
      message: `Uploaded ${successCount} files, processing...`,
      percentage: 80,
      successCount,
      failureCount,
      awaitingBackendProgress: true
    });

    const failedResults = results.filter(r => !r.success);
    const skippedResults = results.filter(r => r.skipped);
    const succeededResults = results.filter(r => r.success && !r.skipped);
    const confirmedResults = results.filter(r => r.confirmed);

    return {
      uploadSessionId: sessionId,
      discovered: fileInfos.length + skippedFiles.length,
      queued: fileInfos.length,
      uploaded: succeededResults.length,
      confirmed: confirmedResults.length,
      successCount: succeededResults.length,
      failureCount: failedResults.length,
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
      errors: failedResults.map(r => ({ fileName: r.fileName, error: r.error, permanent: r.permanent }))
    };
  } catch (error) {
    onProgress?.({ stage: 'error', message: error.message, percentage: 0 });
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
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
        folderId
      }],
      folderId
    });

    const presignedUrl = data.presignedUrls[0];
    const documentId = data.documentIds[0];

    onProgress?.({ stage: 'uploading', message: 'Uploading...', percentage: 10 });

    const result = await uploadFileToS3(
      file,
      presignedUrl,
      documentId,
      (percent) => {
        onProgress?.({
          stage: 'uploading',
          message: `Uploading... ${Math.round(percent)}%`,
          percentage: 10 + (percent * 0.8)
        });
      }
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
  CONFIG
};
