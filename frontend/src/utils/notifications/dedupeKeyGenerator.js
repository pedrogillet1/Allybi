/**
 * Dedupe Key Generator
 *
 * Generates stable, content-based dedupe keys for notifications
 * to prevent duplicate notifications without relying on timestamps.
 *
 * IMPORTANT: Never include timestamps in dedupeKeys - they defeat deduplication!
 */

/**
 * Simple hash function (FNV-1a) for generating stable keys
 * @param {string} str - String to hash
 * @returns {string} - 8-character hex hash
 */
function simpleHash(str) {
  let hash = 0x811c9dc5; // FNV offset basis

  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }

  // Convert to unsigned 32-bit integer and then to hex
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Build dedupe key for file-type notifications
 * @param {string} eventKey - Event key (e.g., 'upload.unsupportedFiles')
 * @param {Array} files - Array of file objects with extension
 * @param {object} options - Optional metadata (batchId, counts)
 * @returns {string} - Stable dedupe key
 */
export function buildFileTypeDedupeKey(eventKey, files = [], options = {}) {
  // Sort extensions alphabetically for stable ordering
  const sortedExtensions = files
    .map(f => f.extension || '')
    .filter(Boolean)
    .sort()
    .join(',');

  // Build key components
  const components = [
    eventKey,
    sortedExtensions,
  ];

  // Add optional metadata
  if (options.batchId) {
    components.push(`batch:${options.batchId}`);
  }

  if (options.totalCount !== undefined) {
    components.push(`count:${options.totalCount}`);
  }

  // Generate stable hash from components
  const keyString = components.join('|');
  const hash = simpleHash(keyString);

  return `${eventKey}.${hash}`;
}

/**
 * Build dedupe key for upload success notifications
 * @param {string} eventKey - Event key (e.g., 'upload.success')
 * @param {number} totalCount - Total files uploaded
 * @param {string} uploadSessionId - Upload session ID (optional)
 * @returns {string} - Stable dedupe key
 */
export function buildUploadSuccessDedupeKey(eventKey, totalCount, uploadSessionId = null) {
  const components = [eventKey, `count:${totalCount}`];

  if (uploadSessionId) {
    components.push(`session:${uploadSessionId}`);
  }

  const keyString = components.join('|');
  const hash = simpleHash(keyString);

  return `${eventKey}.${hash}`;
}

/**
 * Build dedupe key for generic errors
 * @param {string} eventKey - Event key (e.g., 'upload.error')
 * @param {string} errorCode - Error code or category
 * @param {object} context - Optional context (route, component, userId)
 * @returns {string} - Stable dedupe key
 */
export function buildErrorDedupeKey(eventKey, errorCode, context = {}) {
  const components = [eventKey, errorCode];

  if (context.route) {
    components.push(`route:${context.route}`);
  }

  if (context.component) {
    components.push(`component:${context.component}`);
  }

  // Note: Do NOT include userId unless you want per-user deduplication
  // (usually errors should dedupe globally to avoid spam)

  const keyString = components.join('|');
  const hash = simpleHash(keyString);

  return `${eventKey}.${hash}`;
}

/**
 * Build dedupe key for file type detection
 * @param {Array} typeGroups - Array of {type, count, extensions}
 * @returns {string} - Stable dedupe key
 */
export function buildFileTypeDetectedDedupeKey(typeGroups = []) {
  // Sort type groups by type name for stable ordering
  const sorted = [...typeGroups].sort((a, b) => a.type.localeCompare(b.type));

  // Build fingerprint from types and extensions
  const fingerprint = sorted
    .map(g => `${g.type}:${g.extensions.sort().join(',')}`)
    .join('|');

  const hash = simpleHash(fingerprint);

  return `upload.fileTypeDetected.${hash}`;
}

/**
 * Build dedupe key for batch operations (upload, delete, move)
 * @param {string} operation - Operation type (upload, delete, move)
 * @param {number} count - Number of items
 * @param {string} batchId - Optional batch identifier
 * @returns {string} - Stable dedupe key
 */
export function buildBatchOperationDedupeKey(operation, count, batchId = null) {
  const components = [operation, `count:${count}`];

  if (batchId) {
    components.push(`batch:${batchId}`);
  }

  const keyString = components.join('|');
  const hash = simpleHash(keyString);

  return `batch.${operation}.${hash}`;
}

export default {
  buildFileTypeDedupeKey,
  buildUploadSuccessDedupeKey,
  buildErrorDedupeKey,
  buildFileTypeDetectedDedupeKey,
  buildBatchOperationDedupeKey,
  simpleHash,
};
