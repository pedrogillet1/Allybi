/**
 * Upload Configuration
 * Centralized configuration for file uploads
 * Mirrors backend/src/config/upload.config.ts
 */

export const UPLOAD_CONFIG = {
  // Resumable upload threshold (20MB) - files larger than this use multipart upload
  RESUMABLE_UPLOAD_THRESHOLD_BYTES: 20 * 1024 * 1024,

  // Chunk size for multipart uploads (5MB - S3 minimum)
  CHUNK_SIZE_BYTES: 5 * 1024 * 1024,

  // Max file size (500MB)
  MAX_FILE_SIZE_BYTES: 500 * 1024 * 1024,

  // Max concurrent uploads
  MAX_CONCURRENT_UPLOADS: 6,

  // Max concurrent chunk uploads (for multipart)
  MAX_CONCURRENT_CHUNKS: 4,

  // Max retry attempts
  MAX_RETRIES: 3,

  // Retry delay base (ms) - exponential backoff
  RETRY_DELAY_BASE: 1000,

  // Presigned URL expiration buffer (fetch new URL if less than this remaining)
  URL_EXPIRATION_BUFFER_MS: 60 * 1000, // 1 minute

  // File filtering patterns (hidden/system files)
  HIDDEN_FILE_PATTERNS: [
    '.DS_Store',
    '.localized',
    '__MACOSX',
    'Thumbs.db',
    'desktop.ini',
    '.gitignore',
    '.git',
    '.svn',
    '.hg',
  ],

  // Allowed file extensions (matches backend)
  ALLOWED_EXTENSIONS: [
    // Documents
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.html', '.htm', '.rtf', '.csv',
    // Images
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.tiff', '.tif', '.bmp', '.svg', '.ico',
    // Design files
    '.psd', '.ai', '.sketch', '.fig', '.xd',
    // Video files
    '.mp4', '.webm', '.ogg', '.mov', '.avi', '.mpeg', '.mpg',
    // Audio files
    '.mp3', '.wav', '.weba', '.oga', '.m4a',
  ],
};

/**
 * Check if a file should use resumable (multipart) upload
 * @param {number} fileSize - File size in bytes
 * @returns {boolean} True if file should use multipart upload
 */
export const shouldUseResumableUpload = (fileSize) => {
  return fileSize >= UPLOAD_CONFIG.RESUMABLE_UPLOAD_THRESHOLD_BYTES;
};

/**
 * Calculate number of chunks for a file
 * @param {number} fileSize - File size in bytes
 * @returns {number} Number of chunks
 */
export const calculateChunkCount = (fileSize) => {
  return Math.ceil(fileSize / UPLOAD_CONFIG.CHUNK_SIZE_BYTES);
};

/**
 * Check if a file is hidden/system file
 * @param {string} filename - File name
 * @returns {boolean} True if file should be skipped
 */
export const isHiddenFile = (filename) => {
  if (!filename) return true;
  if (filename.startsWith('.')) return true;
  return UPLOAD_CONFIG.HIDDEN_FILE_PATTERNS.some(pattern => filename.includes(pattern));
};

/**
 * Check if a file has an allowed extension
 * @param {string} filename - File name
 * @returns {boolean} True if file type is allowed
 */
export const isAllowedFile = (filename) => {
  if (!filename) return false;
  const ext = '.' + filename.split('.').pop().toLowerCase();
  return UPLOAD_CONFIG.ALLOWED_EXTENSIONS.includes(ext);
};

export default UPLOAD_CONFIG;
