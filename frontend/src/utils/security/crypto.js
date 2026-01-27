/**
 * Calculate SHA-256 hash of a file
 * @param {File} file - The file to hash
 * @returns {Promise<string>} - Hex string of the hash
 */
export const calculateFileHash = async (file) => {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
};

/**
 * Encrypt file data using AES-256-GCM
 * NOTE: For now, this is a placeholder. In production, you would:
 * 1. Generate or retrieve an encryption key
 * 2. Encrypt the file buffer with AES-256-GCM
 * 3. Return encrypted buffer
 *
 * For Phase 3, we'll implement basic encryption. Full end-to-end encryption
 * comes in Phase 11 according to the project plan.
 *
 * @param {File} file - The file to encrypt
 * @param {string} encryptionKey - The encryption key (hex string)
 * @returns {Promise<{encryptedBuffer: ArrayBuffer, iv: string}>}
 */
export const encryptFile = async (file, encryptionKey) => {
  // For now, return the file as-is
  // TODO: Implement actual encryption in Phase 11
  const arrayBuffer = await file.arrayBuffer();

  return {
    encryptedBuffer: arrayBuffer,
    iv: null, // Initialization vector for AES-GCM
  };
};

/**
 * Format file size to human-readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} - Formatted file size
 */
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

/**
 * Get file extension
 * @param {string} filename - The filename
 * @returns {string} - The file extension (lowercase)
 */
export const getFileExtension = (filename) => {
  return filename.split('.').pop().toLowerCase();
};

/**
 * Determine file type category
 * @param {string} filename - The filename
 * @returns {string} - 'pdf', 'jpg', 'doc', or 'other'
 */
export const getFileTypeCategory = (filename) => {
  const extension = getFileExtension(filename);

  if (extension === 'pdf') {
    return 'pdf';
  } else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension)) {
    return 'jpg';
  } else if (['doc', 'docx', 'txt', 'rtf'].includes(extension)) {
    return 'doc';
  }

  return 'doc'; // default
};
