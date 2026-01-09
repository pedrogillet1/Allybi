/**
 * Upload Configuration - OPTIMIZED
 * Centralized configuration for file uploads
 * 
 * Performance tuning for:
 * - Typical broadband (50-100 Mbps)
 * - 4G mobile (~20-50 Mbps)
 * - 600+ file batches without UI freezes
 * - No S3 throttling
 */

export const UPLOAD_CONFIG = {
  // ═══════════════════════════════════════════════════════════════════════════
  // ADAPTIVE CONCURRENCY
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Initial concurrent uploads - conservative start
  INITIAL_CONCURRENT_UPLOADS: 4,
  
  // Maximum concurrent uploads - ramp up if success rate is high
  MAX_CONCURRENT_UPLOADS: 6,
  
  // Minimum concurrent uploads - throttle down on errors
  MIN_CONCURRENT_UPLOADS: 2,
  
  // Success rate threshold to increase concurrency (90%)
  CONCURRENCY_INCREASE_THRESHOLD: 0.9,
  
  // Window size for calculating success rate
  CONCURRENCY_WINDOW_SIZE: 10,
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MULTIPART UPLOAD SETTINGS
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Resumable upload threshold (20MB) - files larger than this use multipart upload
  RESUMABLE_UPLOAD_THRESHOLD_BYTES: 20 * 1024 * 1024,
  
  // Chunk size for multipart uploads (8MB - optimal for broadband/4G balance)
  // S3 minimum is 5MB, but 8MB reduces overhead while staying memory-efficient
  CHUNK_SIZE_BYTES: 8 * 1024 * 1024,
  
  // Max concurrent chunk uploads (for multipart)
  MAX_CONCURRENT_CHUNKS: 4,
  
  // ═══════════════════════════════════════════════════════════════════════════
  // FILE SIZE LIMITS
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Max file size (500MB)
  MAX_FILE_SIZE_BYTES: 500 * 1024 * 1024,
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RETRY & BACKOFF SETTINGS
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Max retry attempts for transient errors
  MAX_RETRIES: 3,
  
  // Initial retry delay (ms) - exponential backoff base
  RETRY_DELAY_BASE: 1000,
  
  // Maximum retry delay (ms)
  MAX_RETRY_DELAY: 30000,
  
  // Jitter factor (0-1) - randomize retry delay to prevent thundering herd
  RETRY_JITTER_FACTOR: 0.3,
  
  // HTTP status codes that are permanent (do not retry)
  PERMANENT_ERROR_CODES: [
    400, // Bad Request (invalid input)
    401, // Unauthorized (auth failed)
    403, // Forbidden (invalid signature, ACL denied)
    404, // Not Found (resource doesn't exist)
    413, // Payload Too Large (file too big)
    415, // Unsupported Media Type
    422, // Unprocessable Entity
  ],
  
  // HTTP status codes that are transient (retry with backoff)
  TRANSIENT_ERROR_CODES: [
    408, // Request Timeout
    429, // Too Many Requests (throttling)
    500, // Internal Server Error
    502, // Bad Gateway
    503, // Service Unavailable
    504, // Gateway Timeout
  ],
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PRESIGNED URL SETTINGS
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Presigned URL expiration buffer (fetch new URL if less than this remaining)
  URL_EXPIRATION_BUFFER_MS: 60 * 1000, // 1 minute
  
  // ═══════════════════════════════════════════════════════════════════════════
  // THROUGHPUT MONITORING
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Enable throughput logging
  ENABLE_THROUGHPUT_LOGGING: true,
  
  // Throughput sample interval (ms)
  THROUGHPUT_SAMPLE_INTERVAL: 5000,
  
  // ═══════════════════════════════════════════════════════════════════════════
  // FILE FILTERING
  // ═══════════════════════════════════════════════════════════════════════════
  
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
    '._',  // macOS resource forks
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

/**
 * Calculate retry delay with exponential backoff and jitter
 * @param {number} attempt - Current attempt number (0-indexed)
 * @returns {number} Delay in milliseconds
 */
export const calculateRetryDelay = (attempt) => {
  const baseDelay = UPLOAD_CONFIG.RETRY_DELAY_BASE * Math.pow(2, attempt);
  const cappedDelay = Math.min(baseDelay, UPLOAD_CONFIG.MAX_RETRY_DELAY);
  // Add jitter: delay * (1 - jitter/2 + random * jitter)
  const jitter = UPLOAD_CONFIG.RETRY_JITTER_FACTOR;
  const jitterMultiplier = 1 - jitter / 2 + Math.random() * jitter;
  return Math.round(cappedDelay * jitterMultiplier);
};

/**
 * Check if an error is permanent (should not retry)
 * @param {Error|Object} error - The error object
 * @returns {boolean} True if error is permanent
 */
export const isPermanentError = (error) => {
  const status = error?.response?.status || error?.status || 0;
  return UPLOAD_CONFIG.PERMANENT_ERROR_CODES.includes(status);
};

/**
 * Check if an error is transient (should retry)
 * @param {Error|Object} error - The error object
 * @returns {boolean} True if error is transient
 */
export const isTransientError = (error) => {
  const status = error?.response?.status || error?.status || 0;
  // Transient if explicitly listed OR if it's a network error (no status)
  return UPLOAD_CONFIG.TRANSIENT_ERROR_CODES.includes(status) || 
         error?.code === 'ECONNABORTED' ||
         error?.code === 'ETIMEDOUT' ||
         error?.code === 'ECONNRESET' ||
         status === 0; // Network failure
};

export default UPLOAD_CONFIG;
