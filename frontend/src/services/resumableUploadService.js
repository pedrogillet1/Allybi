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
 */

import api from './api';
import axios from 'axios';
import { 
  UPLOAD_CONFIG, 
  calculateRetryDelay, 
  isPermanentError 
} from '../config/upload.config';

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
 */
export async function uploadLargeFile(file, folderId, onProgress, abortController = null) {
  const uploadId = `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const controller = abortController || new AbortController();

  activeUploads.set(uploadId, {
    file,
    controller,
    startTime: Date.now(),
  });

  let s3UploadId = null;
  let storageKey = null;
  let documentId = null;

  try {
    onProgress?.({ stage: 'initializing', message: 'Initializing upload...', percentage: 0 });

    const initResponse = await initializeUpload(file, folderId);
    s3UploadId = initResponse.uploadId;
    storageKey = initResponse.storageKey;
    documentId = initResponse.documentId;

    // Use chunk size from backend (may differ from our preference)
    const chunkSize = initResponse.chunkSize || UPLOAD_CONFIG.CHUNK_SIZE_BYTES;
    const { presignedUrls, totalParts } = initResponse;

    console.log(`📤 [Resumable] Initialized: ${documentId} (${totalParts} parts, ${(chunkSize / 1024 / 1024).toFixed(1)}MB chunks)`);

    onProgress?.({ stage: 'uploading', message: 'Uploading...', percentage: 5 });

    const completedParts = [];
    const chunkProgress = new Array(totalParts).fill(0);
    let completedChunks = 0;

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

export default {
  uploadLargeFile,
  abortUpload,
  getActiveUploads,
};
