// ═══════════════════════════════════════════════════════════════════════════
// ✅ FIX #7: Upload Progress Persistence
// ═══════════════════════════════════════════════════════════════════════════
// REASON: Allow users to resume uploads after page refresh
// WHY: Large file uploads (100MB+) can take 5-10 minutes, easy to lose progress
// HOW: Save progress to localStorage, use S3 multipart upload for resumption
// IMPACT: No wasted bandwidth, better UX for large files
//
// ARCHITECTURE:
// - localStorage: Store upload progress (uploadId, progress, parts)
// - S3 Multipart Upload: Split large files into parts, upload independently
// - Resume Logic: Skip already-uploaded parts, continue from last part
//
// STORAGE FORMAT:
// {
//   uploadId: "uuid-1234",
//   filename: "large-file.pdf",
//   fileSize: 524288000, // 500MB
//   fileHash: "sha256-hash",
//   mimeType: "application/pdf",
//   folderId: "folder-uuid",
//   uploadKey: "s3-key",
//   multipartUploadId: "s3-multipart-upload-id",
//   parts: [
//     { partNumber: 1, etag: "etag-1", uploaded: true },
//     { partNumber: 2, etag: "etag-2", uploaded: true },
//     { partNumber: 3, etag: null, uploaded: false },
//   ],
//   progress: 0.35, // 35%
//   uploadedBytes: 175000000,
//   createdAt: 1700000000000,
//   expiresAt: 1700086400000, // 24 hours later
// }

const STORAGE_KEY_PREFIX = 'koda_upload_';
const PART_SIZE = 50 * 1024 * 1024; // 50MB per part (S3 minimum: 5MB)
const MAX_STORAGE_TIME = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Save upload progress to localStorage
 * @param {Object} uploadData - Upload progress data
 */
export function saveUploadProgress(uploadData) {
  const key = `${STORAGE_KEY_PREFIX}${uploadData.uploadId}`;
  const data = {
    ...uploadData,
    updatedAt: Date.now(),
  };

  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {

    // localStorage full - clear old uploads
    clearExpiredUploads();
  }
}

/**
 * Load upload progress from localStorage
 * @param {string} uploadId - Upload ID
 * @returns {Object|null} - Upload progress data or null
 */
export function loadUploadProgress(uploadId) {
  const key = `${STORAGE_KEY_PREFIX}${uploadId}`;

  try {
    const data = localStorage.getItem(key);
    if (!data) return null;

    const uploadData = JSON.parse(data);

    // Check if expired
    if (Date.now() > uploadData.expiresAt) {

      clearUploadProgress(uploadId);
      return null;
    }
    return uploadData;

  } catch (error) {

    return null;
  }
}

/**
 * Clear upload progress from localStorage
 * @param {string} uploadId - Upload ID
 */
export function clearUploadProgress(uploadId) {
  const key = `${STORAGE_KEY_PREFIX}${uploadId}`;
  localStorage.removeItem(key);

}

/**
 * Get all pending uploads from localStorage
 * @returns {Array} - Array of pending upload data
 */
export function getAllPendingUploads() {
  const uploads = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
      try {
        const data = JSON.parse(localStorage.getItem(key));

        // Skip expired uploads
        if (Date.now() > data.expiresAt) {
          localStorage.removeItem(key);
          continue;
        }

        // Skip completed uploads
        if (data.progress >= 1.0) {
          localStorage.removeItem(key);
          continue;
        }

        uploads.push(data);
      } catch (error) {

      }
    }
  }

  return uploads.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Clear expired uploads from localStorage
 */
export function clearExpiredUploads() {
  let cleared = 0;

  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
      try {
        const data = JSON.parse(localStorage.getItem(key));
        if (Date.now() > data.expiresAt) {
          localStorage.removeItem(key);
          cleared++;
        }
      } catch (error) {
        // Invalid data, remove it
        localStorage.removeItem(key);
        cleared++;
      }
    }
  }

  if (cleared > 0) {

  }
}

/**
 * Calculate number of parts for multipart upload
 * @param {number} fileSize - File size in bytes
 * @returns {number} - Number of parts
 */
export function calculatePartCount(fileSize) {
  return Math.ceil(fileSize / PART_SIZE);
}

/**
 * Get part range for a specific part number
 * @param {number} partNumber - Part number (1-indexed)
 * @param {number} fileSize - Total file size
 * @returns {Object} - { start, end, size }
 */
export function getPartRange(partNumber, fileSize) {
  const start = (partNumber - 1) * PART_SIZE;
  const end = Math.min(start + PART_SIZE, fileSize);
  return { start, end, size: end - start };
}

/**
 * Check if file should use multipart upload
 * @param {number} fileSize - File size in bytes
 * @returns {boolean} - True if multipart should be used
 */
export function shouldUseMultipart(fileSize) {
  // Use multipart for files > 100MB
  return fileSize > 100 * 1024 * 1024;
}

/**
 * Get part size constant
 * @returns {number} - Part size in bytes
 */
export function getPartSize() {
  return PART_SIZE;
}

/**
 * Find existing upload for a file
 * @param {string} filename - File name
 * @param {number} fileSize - File size
 * @param {string|null} folderId - Folder ID
 * @returns {Object|null} - Existing upload data or null
 */
export function findExistingUpload(filename, fileSize, folderId) {
  const pendingUploads = getAllPendingUploads();
  return pendingUploads.find(u =>
    u.filename === filename &&
    u.fileSize === fileSize &&
    u.folderId === folderId
  ) || null;
}

/**
 * Create initial upload data structure
 * @param {Object} params - Upload parameters
 * @returns {Object} - Upload data structure
 */
export function createUploadData({
  uploadId,
  filename,
  fileSize,
  mimeType,
  folderId,
  uploadKey,
  multipartUploadId,
  documentId,
  partCount
}) {
  return {
    uploadId,
    filename,
    fileSize,
    mimeType,
    folderId,
    uploadKey,
    multipartUploadId,
    documentId, // Added for resume verification
    parts: Array.from({ length: partCount }, (_, i) => ({
      partNumber: i + 1,
      etag: null,
      uploaded: false,
    })),
    progress: 0,
    uploadedBytes: 0,
    createdAt: Date.now(),
    expiresAt: Date.now() + MAX_STORAGE_TIME,
  };
}

/**
 * Update part status in upload data
 * @param {Object} uploadData - Upload data
 * @param {number} partIndex - Part index (0-indexed)
 * @param {string} etag - ETag from S3
 * @param {number} partSize - Size of uploaded part
 */
export function updatePartStatus(uploadData, partIndex, etag, partSize) {
  uploadData.parts[partIndex].etag = etag;
  uploadData.parts[partIndex].uploaded = true;
  uploadData.uploadedBytes += partSize;
  uploadData.progress = uploadData.uploadedBytes / uploadData.fileSize;
  saveUploadProgress(uploadData);
}
