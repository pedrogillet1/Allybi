/**
 * Resumable Upload Service (GCS native)
 * Handles Google Cloud Storage resumable uploads for large files (>20MB)
 *
 * Notes:
 * - GCS resumable uploads are sequential per session URL (no parallel chunks).
 * - Resume is done by querying the session URL for the last received byte range.
 */

import api from './api';
import axios from 'axios';
import { UPLOAD_CONFIG, calculateRetryDelay, isPermanentError } from '../config/upload.config';
import {
  saveUploadProgress,
  loadUploadProgress,
  clearUploadProgress,
  getAllPendingUploads,
  createUploadData,
  updateUploadedBytes,
} from './uploadProgressPersistence';

const activeUploads = new Map();

function parseLastReceivedByte(rangeHeader) {
  // GCS returns: "bytes=0-12345"
  if (!rangeHeader || typeof rangeHeader !== 'string') return -1;
  const m = rangeHeader.match(/bytes=(\d+)-(\d+)/i);
  if (!m) return -1;
  const end = parseInt(m[2], 10);
  return Number.isFinite(end) ? end : -1;
}

async function queryResumableStatus(uploadUrl, totalSize, signal) {
  // Query current state: PUT with Content-Range: bytes */total
  const res = await axios.put(uploadUrl, null, {
    headers: {
      'Content-Range': `bytes */${totalSize}`,
    },
    signal,
    validateStatus: (s) => s === 308 || (s >= 200 && s < 300),
  });

  const range = res.headers?.range || res.headers?.Range;
  const lastByte = parseLastReceivedByte(range);
  return Math.max(-1, lastByte);
}

async function initializeUpload(file, folderId = null) {
  const response = await api.post('/api/multipart-upload/init', {
    fileName: file.name.normalize('NFC'),
    fileSize: file.size,
    mimeType: file.type || 'application/octet-stream',
    folderId,
    preferredChunkSize: UPLOAD_CONFIG.CHUNK_SIZE_BYTES,
  });
  return response.data;
}

async function uploadChunkToGcs(uploadUrl, chunk, startByte, totalSize, signal, onProgress) {
  const endByte = startByte + chunk.size - 1;

  const res = await axios.put(uploadUrl, chunk, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Range': `bytes ${startByte}-${endByte}/${totalSize}`,
    },
    signal,
    onUploadProgress: (evt) => {
      if (!onProgress || !evt.total) return;
      const pct = (evt.loaded / evt.total) * 100;
      onProgress(pct);
    },
    validateStatus: (s) => s === 308 || (s >= 200 && s < 300),
  });

  return res.status;
}

export async function uploadLargeFile(file, folderId, onProgress, abortController = null, resumeData = null) {
  const uploadId = resumeData?.uploadId || `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const controller = abortController || new AbortController();

  activeUploads.set(uploadId, { file, controller, startTime: Date.now() });

  let documentId = resumeData?.documentId || null;
  let storageKey = resumeData?.uploadKey || null;
  let uploadUrl = resumeData?.uploadUrl || null;
  let persisted = resumeData || null;

  try {
    // Init if needed
    if (!uploadUrl || !documentId || !storageKey) {
      onProgress?.({ stage: 'initializing', message: 'Initializing upload...', percentage: 0 });
      const init = await initializeUpload(file, folderId);
      documentId = init.documentId;
      storageKey = init.storageKey;
      uploadUrl = init.uploadUrl;

      const chunkSize = init.chunkSize || UPLOAD_CONFIG.CHUNK_SIZE_BYTES;
      const totalParts = init.totalParts || Math.ceil(file.size / chunkSize);

      persisted = createUploadData({
        uploadId,
        filename: file.name,
        fileSize: file.size,
        mimeType: file.type || 'application/octet-stream',
        folderId,
        uploadKey: storageKey,
        uploadUrl,
        documentId,
        partCount: totalParts,
      });

      saveUploadProgress(persisted);
    } else {
      onProgress?.({ stage: 'resuming', message: 'Resuming upload...', percentage: (resumeData?.progress || 0) * 100 });
    }

    // Determine where to resume (server truth)
    const lastByte = await queryResumableStatus(uploadUrl, file.size, controller.signal);
    const startAt = lastByte >= 0 ? lastByte + 1 : 0;

    updateUploadedBytes(persisted, startAt);
    onProgress?.({ stage: 'uploading', message: 'Uploading...', percentage: 5 + (persisted.progress * 90) });

    const chunkSize = UPLOAD_CONFIG.CHUNK_SIZE_BYTES;
    let offset = startAt;

    while (offset < file.size) {
      // Abort check
      if (controller.signal.aborted) throw new Error('Upload aborted');

      const nextEndExclusive = Math.min(offset + chunkSize, file.size);
      const chunk = file.slice(offset, nextEndExclusive);
      const chunkStart = offset;

      let attempt = 0;
      // Retry loop per chunk
      while (true) {
        try {
          await uploadChunkToGcs(
            uploadUrl,
            chunk,
            chunkStart,
            file.size,
            controller.signal,
            (pct) => {
              // Report chunk progress as a fraction of overall file.
              const bytesInChunk = Math.round((pct / 100) * chunk.size);
              const uploadedBytes = chunkStart + bytesInChunk;
              updateUploadedBytes(persisted, uploadedBytes);
              onProgress?.({
                stage: 'uploading',
                message: `Uploading... ${Math.round(persisted.progress * 100)}%`,
                percentage: 5 + (persisted.progress * 90),
              });
            }
          );
          break; // chunk success
        } catch (err) {
          if (controller.signal.aborted) throw err;
          if (isPermanentError(err) || attempt >= UPLOAD_CONFIG.MAX_RETRIES - 1) throw err;
          const delay = calculateRetryDelay(attempt);
          await new Promise((r) => setTimeout(r, delay));
          attempt++;
        }
      }

      // Chunk committed by server; move offset forward and persist.
      offset = nextEndExclusive;
      updateUploadedBytes(persisted, offset);
    }

    onProgress?.({ stage: 'finalizing', message: 'Finalizing...', percentage: 96 });
    await api.post('/api/multipart-upload/complete', {
      documentId,
      storageKey,
      expectedSize: file.size,
    });

    updateUploadedBytes(persisted, file.size);
    clearUploadProgress(uploadId);

    onProgress?.({ stage: 'complete', message: 'Complete!', percentage: 100 });
    return { success: true, documentId, storageKey };
  } catch (error) {
    // Best-effort cleanup on backend
    try {
      await api.post('/api/multipart-upload/abort', { documentId, storageKey });
    } catch {
      // ignore
    }
    throw error;
  } finally {
    activeUploads.delete(uploadId);
  }
}

export async function abortUpload(uploadId) {
  const upload = activeUploads.get(uploadId);
  if (upload?.controller) upload.controller.abort();
  const persisted = loadUploadProgress(uploadId);
  if (persisted?.documentId || persisted?.uploadKey) {
    try {
      await api.post('/api/multipart-upload/abort', { documentId: persisted.documentId, storageKey: persisted.uploadKey });
    } catch {
      // ignore
    }
  }
  clearUploadProgress(uploadId);
  activeUploads.delete(uploadId);
}

export function getActiveUploads() {
  return Array.from(activeUploads.keys());
}

export function getPendingUploads() {
  return getAllPendingUploads();
}

// Backward-compat wrapper. Preferred call: resumeUpload({ file, pendingUpload, onProgress, abortController }).
export async function resumeUpload(arg1, arg2, arg3 = null) {
  // Old signature: (pendingUpload, onProgress, abortController)
  if (arg1 && !arg1.file && arg1.uploadId) {
    throw new Error('Resuming a large upload requires the original File object (re-select the file).');
  }

  // New signature: ({ file, pendingUpload, onProgress, abortController })
  const { file, pendingUpload, onProgress, abortController } = arg1 || {};
  if (!file || !pendingUpload) {
    throw new Error('resumeUpload requires { file, pendingUpload }.');
  }

  return uploadLargeFile(file, pendingUpload.folderId, onProgress, abortController || null, pendingUpload);
}

export function cancelPendingUpload(uploadId) {
  clearUploadProgress(uploadId);
}
