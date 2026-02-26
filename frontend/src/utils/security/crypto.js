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
 *
 * @param {File} file - The file to encrypt
 * @param {string} encryptionKey - The encryption key (hex string)
 * @returns {Promise<{encryptedBuffer: ArrayBuffer, iv: string}>}
 */
const hexToBytes = (hex) => {
  if (typeof hex !== 'string' || !/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error('Invalid encryption key format');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
};

const bytesToHex = (bytes) => Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');

export const encryptFile = async (file, encryptionKey) => {
  if (!encryptionKey) {
    throw new Error('Missing encryption key');
  }
  const keyBytes = hexToBytes(encryptionKey);
  if (keyBytes.length !== 32) {
    throw new Error('Encryption key must be 32 bytes (64 hex chars)');
  }
  const arrayBuffer = await file.arrayBuffer();
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    arrayBuffer
  );

  return {
    encryptedBuffer,
    iv: bytesToHex(iv),
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
