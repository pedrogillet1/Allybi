/**
 * Resumable Upload Service
 * Handles S3 multipart uploads for large files (>20MB)
 *
 * Features:
 * - Chunked uploads (5MB chunks)
 * - Parallel chunk uploads
 * - Automatic retry with exponential backoff
 * - Progress tracking per chunk and overall
 * - Abort/cancel support
 */

import api from './api';
import axios from 'axios';
import { UPLOAD_CONFIG } from '../config/upload.config';

/**
 * Upload state for tracking in-progress uploads
 */
const activeUploads = new Map();

/**
 * Initialize a multipart upload
 * @param {File} file - File to upload
 * @param {string|null} folderId - Target folder ID
 * @returns {Promise<Object>} Upload session details
 */
async function initializeUpload(file, folderId = null) {
  const response = await api.post('/api/multipart-upload/init', {
    fileName: file.name.normalize('NFC'),
    fileSize: file.size,
    mimeType: file.type || 'application/octet-stream',
    folderId,
  });

  return response.data;
}

/**
 * Upload a single chunk with retry
 * @param {Blob} chunk - Chunk data
 * @param {string} presignedUrl - Presigned URL for this chunk
 * @param {number} partNumber - Part number (1-indexed)
 * @param {function} onProgress - Progress callback
 * @param {AbortSignal} signal - Abort signal
 * @returns {Promise<Object>} Completed part info (ETag, PartNumber)
 */
async function uploadChunk(chunk, presignedUrl, partNumber, onProgress, signal) {
  let lastError = null;

  for (let attempt = 0; attempt < UPLOAD_CONFIG.MAX_RETRIES; attempt++) {
    try {
      const response = await axios.put(presignedUrl, chunk, {
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const percent = (progressEvent.loaded / progressEvent.total) * 100;
            onProgress(partNumber, percent);
          }
        },
        signal,
      });

      // Extract ETag from response headers (required for completing multipart upload)
      const etag = response.headers.etag || response.headers['etag'];

      if (!etag) {
        throw new Error('No ETag returned from S3');
      }

      return {
        ETag: etag, // Keep quotes - S3 CompleteMultipartUpload requires them
        PartNumber: partNumber,
      };
    } catch (error) {
      lastError = error;

      // Don't retry if aborted
      if (axios.isCancel(error) || signal?.aborted) {
        throw error;
      }

      // Exponential backoff
      if (attempt < UPLOAD_CONFIG.MAX_RETRIES - 1) {
        const delay = UPLOAD_CONFIG.RETRY_DELAY_BASE * Math.pow(2, attempt);
        console.log(`⚠️ Chunk ${partNumber} failed (attempt ${attempt + 1}), retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Upload a large file using S3 multipart upload
 * @param {File} file - File to upload
 * @param {string|null} folderId - Target folder ID
 * @param {function} onProgress - Progress callback ({ stage, message, percentage, chunkProgress })
 * @param {AbortController} abortController - Optional abort controller
 * @returns {Promise<Object>} Upload result
 */
export async function uploadLargeFile(file, folderId, onProgress, abortController = null) {
  const uploadId = `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const controller = abortController || new AbortController();

  // Track active upload
  activeUploads.set(uploadId, {
    file,
    controller,
    startTime: Date.now(),
  });

  // Track S3 upload info for cleanup on error
  let s3UploadId = null;
  let storageKey = null;
  let documentId = null;

  try {
    // Step 1: Initialize multipart upload
    onProgress?.({ stage: 'initializing', message: 'Initializing upload...', percentage: 0 });

    const initResponse = await initializeUpload(file, folderId);
    // Store for cleanup in case of error
    s3UploadId = initResponse.uploadId;
    storageKey = initResponse.storageKey;
    documentId = initResponse.documentId;

    const { presignedUrls, totalParts, chunkSize } = initResponse;

    console.log(`📤 [Resumable] Initialized upload: ${documentId} (${totalParts} parts, ${(chunkSize / 1024 / 1024).toFixed(1)}MB chunks)`);

    // Step 2: Upload chunks in parallel with concurrency limit
    onProgress?.({ stage: 'uploading', message: 'Uploading...', percentage: 5 });

    const completedParts = [];
    const chunkProgress = new Array(totalParts).fill(0);
    let completedChunks = 0;

    // Track overall progress
    const updateOverallProgress = () => {
      const totalProgress = chunkProgress.reduce((sum, p) => sum + p, 0) / totalParts;
      const percentage = 5 + (totalProgress * 0.9); // 5-95% range for upload
      onProgress?.({
        stage: 'uploading',
        message: `Uploading... (${completedChunks}/${totalParts} chunks)`,
        percentage,
        chunkProgress: [...chunkProgress],
      });
    };

    // Create chunk upload tasks
    const uploadTasks = presignedUrls.map((url, index) => {
      const partNumber = index + 1;
      const start = index * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.slice(start, end);

      return async () => {
        const result = await uploadChunk(
          chunk,
          url,
          partNumber,
          (part, progress) => {
            chunkProgress[part - 1] = progress;
            updateOverallProgress();
          },
          controller.signal
        );

        completedChunks++;
        chunkProgress[partNumber - 1] = 100;
        updateOverallProgress();

        return result;
      };
    });

    // Execute with concurrency limit
    const results = await executeWithConcurrency(
      uploadTasks,
      UPLOAD_CONFIG.MAX_CONCURRENT_CHUNKS
    );

    completedParts.push(...results);

    // Step 3: Complete multipart upload
    onProgress?.({ stage: 'finalizing', message: 'Finalizing upload...', percentage: 95 });

    await api.post('/api/multipart-upload/complete', {
      documentId,
      uploadId: s3UploadId,
      storageKey,
      parts: completedParts,
    });

    console.log(`✅ [Resumable] Upload completed: ${documentId}`);

    onProgress?.({ stage: 'complete', message: 'Upload complete!', percentage: 100 });

    // Cleanup
    activeUploads.delete(uploadId);

    return {
      success: true,
      documentId,
      fileName: file.name,
    };
  } catch (error) {
    console.error('❌ [Resumable] Upload failed:', error);

    // Cleanup on error
    activeUploads.delete(uploadId);

    // If we have an s3UploadId, try to abort the multipart upload to clean up S3
    if (s3UploadId && storageKey) {
      try {
        await api.post('/api/multipart-upload/abort', {
          documentId,
          uploadId: s3UploadId,
          storageKey,
        });
        console.log('✅ [Resumable] Aborted failed upload on S3');
      } catch (abortError) {
        console.error('❌ [Resumable] Failed to abort upload:', abortError);
      }
    }

    throw error;
  }
}

/**
 * Execute tasks with concurrency limit
 * @param {Array<Function>} tasks - Array of async task functions
 * @param {number} concurrency - Max concurrent tasks
 * @returns {Promise<Array>} Results
 */
async function executeWithConcurrency(tasks, concurrency) {
  const results = [];
  const executing = new Set();

  for (const task of tasks) {
    const promise = task().then(result => {
      executing.delete(promise);
      return result;
    });

    executing.add(promise);
    results.push(promise);

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  return Promise.all(results);
}

/**
 * Abort an active upload
 * @param {string} uploadId - Upload ID to abort
 */
export function abortUpload(uploadId) {
  const upload = activeUploads.get(uploadId);
  if (upload) {
    upload.controller.abort();
    activeUploads.delete(uploadId);
    console.log(`🛑 [Resumable] Upload aborted: ${uploadId}`);
  }
}

/**
 * Get list of active uploads
 * @returns {Array} Active upload info
 */
export function getActiveUploads() {
  return Array.from(activeUploads.entries()).map(([id, upload]) => ({
    id,
    fileName: upload.file.name,
    fileSize: upload.file.size,
    startTime: upload.startTime,
  }));
}

export default {
  uploadLargeFile,
  abortUpload,
  getActiveUploads,
};
