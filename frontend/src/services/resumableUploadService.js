/**
 * Resumable Upload Service - OPTIMIZED
 * Handles S3 multipart uploads for large files (>20MB)
 *
 * Optimizations:
 * - 8MB chunks (optimal for broadband/4G balance)
 * - Parallel chunk uploads with adaptive concurrency
 * - Exponential backoff with jitter
 * - Smart retry (no retry on permanent errors)
 * - Per-chunk throughput tracking
 * - Progress persistence to localStorage (resume after page refresh)
 */

import api from './api';
import axios from 'axios';
import {
  UPLOAD_CONFIG,
  calculateRetryDelay,
  isPermanentError
} from '../config/upload.config';
import {
  saveUploadProgress,
  loadUploadProgress,
  clearUploadProgress,
  getAllPendingUploads,
  createUploadData,
  updatePartStatus,
} from './uploadProgressPersistence';

const activeUploads = new Map();

/**
 * Initialize a multipart upload
 */
async function initializeUpload(file, folderId = null) {
  const response = await api.post('/api/multipart-upload/init', {
    fileName: file.name.normalize('NFC'),
    fileSize: file.size,
    mimeType: file.type || 'application/octet-stream',
    folderId,
    // Request optimal chunk size from config
    preferredChunkSize: UPLOAD_CONFIG.CHUNK_SIZE_BYTES,
  });

  return response.data;
}

/**
 * Upload a single chunk with smart retry
 * - Retries transient errors with exponential backoff + jitter
 * - Does NOT retry permanent errors (403, 413, etc.)
 */
async function uploadChunk(chunk, presignedUrl, partNumber, onProgress, signal) {
  let lastError = null;

  for (let attempt = 0; attempt < UPLOAD_CONFIG.MAX_RETRIES; attempt++) {
    try {
      const startTime = Date.now();

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

      const etag = response.headers.etag || response.headers['etag'];

      if (!etag) {
        throw new Error('No ETag returned from S3');
      }

      // Log chunk throughput
      const duration = Date.now() - startTime;
      const throughputMbps = (chunk.size * 8) / (duration * 1024);
      console.log(`✅ [Chunk ${partNumber}] ${(chunk.size / 1024 / 1024).toFixed(1)}MB | ${throughputMbps.toFixed(2)} Mbps`);

      return {
        ETag: etag,
        PartNumber: partNumber,
      };
    } catch (error) {
      lastError = error;

      // Don't retry if aborted
      if (axios.isCancel(error) || signal?.aborted) {
        throw error;
      }

      // Check for permanent error - do NOT retry
      if (isPermanentError(error)) {
        const status = error?.response?.status || 0;
        console.error(`❌ [Chunk ${partNumber}] Permanent error: ${status}`);
        throw error;
      }

      // Transient error - retry with backoff + jitter
      if (attempt < UPLOAD_CONFIG.MAX_RETRIES - 1) {
        const delay = calculateRetryDelay(attempt);
        console.log(`⚠️ [Chunk ${partNumber}] Failed (attempt ${attempt + 1}), retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Upload a large file using S3 multipart upload
 * Supports resumption after page refresh via localStorage persistence
 *
 * @param {File} file - File to upload
 * @param {string|null} folderId - Target folder ID
 * @param {function} onProgress - Progress callback ({ stage, message, percentage, chunkProgress })
 * @param {AbortController} abortController - Optional abort controller
 * @param {Object} resumeData - Optional resume data from getPendingUploads()
 * @returns {Promise<Object>} Upload result
 */
export async function uploadLargeFile(file, folderId, onProgress, abortController = null, resumeData = null) {
  const uploadId = resumeData?.uploadId || `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const controller = abortController || new AbortController();

  activeUploads.set(uploadId, {
    file,
    controller,
    startTime: Date.now(),
  });

  // Track S3 upload info for cleanup on error
  let s3UploadId = resumeData?.multipartUploadId || null;
  let storageKey = resumeData?.uploadKey || null;
  let documentId = resumeData?.documentId || null;
  let persistedData = resumeData;

  try {
    let presignedUrls, totalParts, chunkSize;
    let alreadyUploadedParts = [];

    // Check if we're resuming an existing upload
    if (resumeData && resumeData.multipartUploadId) {
      console.log(`🔄 [Resumable] Resuming upload: ${uploadId}`);
      onProgress?.({ stage: 'resuming', message: 'Resuming upload...', percentage: resumeData.progress * 100 || 0 });

      // Verify the upload session is still valid on backend
      try {
        const statusResponse = await api.get(`/api/multipart-upload/status/${resumeData.documentId}`);
        if (statusResponse.data.status !== 'uploading') {
          console.log(`⚠️ [Resumable] Upload session expired or completed, starting fresh`);
          resumeData = null;
          persistedData = null;
        } else {
          // Get presigned URLs for remaining parts
          s3UploadId = resumeData.multipartUploadId;
          storageKey = resumeData.uploadKey;
          documentId = resumeData.documentId;
          totalParts = resumeData.parts.length;
          chunkSize = UPLOAD_CONFIG.CHUNK_SIZE_BYTES;

          // Find already uploaded parts
          alreadyUploadedParts = resumeData.parts
            .filter(p => p.uploaded && p.etag)
            .map(p => ({ PartNumber: p.partNumber, ETag: p.etag }));

          // Get presigned URLs for remaining parts
          const remainingPartNumbers = resumeData.parts
            .filter(p => !p.uploaded)
            .map(p => p.partNumber);

          if (remainingPartNumbers.length > 0) {
            const urlsResponse = await api.post('/api/multipart-upload/urls', {
              storageKey,
              uploadId: s3UploadId,
              partNumbers: remainingPartNumbers,
            });
            // Create a sparse array with presigned URLs at correct indices
            presignedUrls = new Array(totalParts).fill(null);
            urlsResponse.data.presignedUrls.forEach((url, i) => {
              presignedUrls[remainingPartNumbers[i] - 1] = url;
            });
          } else {
            // All parts already uploaded, just complete
            presignedUrls = new Array(totalParts).fill(null);
          }

          console.log(`🔄 [Resumable] Resuming with ${alreadyUploadedParts.length}/${totalParts} parts already uploaded`);
        }
      } catch (statusError) {
        console.log(`⚠️ [Resumable] Could not verify upload session, starting fresh:`, statusError.message);
        resumeData = null;
        persistedData = null;
      }
    }

    // Initialize new upload if not resuming
    if (!resumeData) {
      onProgress?.({ stage: 'initializing', message: 'Initializing upload...', percentage: 0 });

      const initResponse = await initializeUpload(file, folderId);
      s3UploadId = initResponse.uploadId;
      storageKey = initResponse.storageKey;
      documentId = initResponse.documentId;
      presignedUrls = initResponse.presignedUrls;
      totalParts = initResponse.totalParts;
      chunkSize = initResponse.chunkSize || UPLOAD_CONFIG.CHUNK_SIZE_BYTES;

      // Create persistence data for resume capability
      persistedData = createUploadData({
        uploadId,
        filename: file.name,
        fileSize: file.size,
        mimeType: file.type || 'application/octet-stream',
        folderId,
        uploadKey: storageKey,
        multipartUploadId: s3UploadId,
        documentId,
        partCount: totalParts,
      });
      saveUploadProgress(persistedData);
    }

    console.log(`📤 [Resumable] Initialized: ${documentId} (${totalParts} parts, ${(chunkSize / 1024 / 1024).toFixed(1)}MB chunks)`);

    // Step 2: Upload chunks in parallel with concurrency limit
    // Calculate initial progress based on already uploaded parts
    const initialProgress = alreadyUploadedParts.length / totalParts;
    onProgress?.({ stage: 'uploading', message: 'Uploading...', percentage: 5 + (initialProgress * 90) });

    const completedParts = [...alreadyUploadedParts]; // Start with already uploaded parts
    const chunkProgress = new Array(totalParts).fill(0);
    let completedChunks = alreadyUploadedParts.length;

    // Mark already uploaded chunks as complete in progress tracking
    alreadyUploadedParts.forEach(part => {
      chunkProgress[part.PartNumber - 1] = 100;
    });

    const updateOverallProgress = () => {
      const totalProgress = chunkProgress.reduce((sum, p) => sum + p, 0) / totalParts;
      const percentage = 5 + (totalProgress * 0.9);
      onProgress?.({
        stage: 'uploading',
        message: `Uploading... (${completedChunks}/${totalParts} chunks)`,
        percentage,
        chunkProgress: [...chunkProgress],
      });
    };

    // Create chunk upload tasks - SKIP already uploaded parts
    const uploadTasks = presignedUrls
      .map((url, index) => {
        // Skip if no URL (already uploaded) or if part is marked as complete
        if (!url) return null;

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

          // ✅ PERSISTENCE: Save progress after each successful chunk
          if (persistedData) {
            updatePartStatus(persistedData, partNumber - 1, result.ETag, end - start);
          }

          return result;
        };
      })
      .filter(Boolean); // Remove null entries (already uploaded parts)

    // Execute with concurrency limit
    if (uploadTasks.length > 0) {
      const results = await executeWithConcurrency(
        uploadTasks,
        UPLOAD_CONFIG.MAX_CONCURRENT_CHUNKS
      );
      completedParts.push(...results);
    }

    // Sort parts by part number (required for S3 CompleteMultipartUpload)
    completedParts.sort((a, b) => a.PartNumber - b.PartNumber);

    onProgress?.({ stage: 'finalizing', message: 'Finalizing upload...', percentage: 95 });

    await api.post('/api/multipart-upload/complete', {
      documentId,
      uploadId: s3UploadId,
      storageKey,
      parts: completedParts,
    });

    // Log total throughput
    const duration = Date.now() - activeUploads.get(uploadId).startTime;
    const throughputMbps = (file.size * 8) / (duration * 1024);
    console.log(`✅ [Resumable] Complete: ${documentId} | ${(file.size / 1024 / 1024).toFixed(2)}MB | ${throughputMbps.toFixed(2)} Mbps | ${(duration / 1000).toFixed(1)}s`);

    onProgress?.({ stage: 'complete', message: 'Upload complete!', percentage: 100 });

    // ✅ PERSISTENCE: Clear progress on successful completion
    if (persistedData) {
      clearUploadProgress(uploadId);
    }

    // Cleanup
    activeUploads.delete(uploadId);

    return {
      success: true,
      documentId,
      fileName: file.name,
      confirmed: true,
      fileSize: file.size,
      uploadDuration: duration,
    };
  } catch (error) {
    console.error('❌ [Resumable] Upload failed:', error);

    activeUploads.delete(uploadId);

    // Abort multipart upload on S3 to clean up
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
 */
export function getActiveUploads() {
  return Array.from(activeUploads.entries()).map(([id, upload]) => ({
    id,
    fileName: upload.file.name,
    fileSize: upload.file.size,
    startTime: upload.startTime,
  }));
}

/**
 * Get all pending uploads that can be resumed
 * @returns {Array} Pending upload data from localStorage
 */
export function getPendingUploads() {
  return getAllPendingUploads();
}

/**
 * Resume a pending upload
 * @param {Object} pendingUpload - Pending upload data from getPendingUploads()
 * @param {File} file - The file to resume uploading (must match filename/size)
 * @param {function} onProgress - Progress callback
 * @param {AbortController} abortController - Optional abort controller
 * @returns {Promise<Object>} Upload result
 */
export async function resumeUpload(pendingUpload, file, onProgress, abortController = null) {
  // Validate file matches the pending upload
  if (file.name !== pendingUpload.filename || file.size !== pendingUpload.fileSize) {
    throw new Error('File does not match pending upload');
  }

  return uploadLargeFile(file, pendingUpload.folderId, onProgress, abortController, pendingUpload);
}

/**
 * Cancel and clear a pending upload
 * @param {string} uploadId - Upload ID to cancel
 */
export function cancelPendingUpload(uploadId) {
  clearUploadProgress(uploadId);
  console.log(`🗑️ [Resumable] Cleared pending upload: ${uploadId}`);
}

export default {
  uploadLargeFile,
  abortUpload,
  getActiveUploads,
  getPendingUploads,
  resumeUpload,
  cancelPendingUpload,
};
