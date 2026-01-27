/**
 * Zero-Knowledge Encryption Utilities
 *
 * Provides client-side encryption/decryption using:
 * - AES-256-GCM for encryption (industry standard, hardware-accelerated)
 * - PBKDF2 with SHA-256 for key derivation (NIST recommended, 600,000 iterations)
 * - Web Crypto API (native browser support, cryptographically secure)
 *
 * Based on implementations from Bitwarden, ProtonMail, and industry best practices.
 */

const PBKDF2_ITERATIONS = 600000; // NIST recommended for 2024
const SALT_SIZE = 16; // 128-bit (2^128 combinations)
const IV_SIZE = 12; // 96-bit (NIST recommended for AES-GCM)
const AUTH_TAG_SIZE = 16; // 128-bit authentication tag

/**
 * Generate cryptographically secure random salt
 * @returns {Uint8Array} 16-byte random salt
 */
export function generateSalt() {
  return window.crypto.getRandomValues(new Uint8Array(SALT_SIZE));
}

/**
 * Generate cryptographically secure random initialization vector (IV)
 * @returns {Uint8Array} 12-byte random IV
 */
export function generateIV() {
  return window.crypto.getRandomValues(new Uint8Array(IV_SIZE));
}

/**
 * Derive AES-256 encryption key from password using PBKDF2
 * @param {string} password - User's password
 * @param {Uint8Array} salt - Random salt (16 bytes)
 * @returns {Promise<CryptoKey>} Derived AES-256-GCM key
 */
export async function deriveKey(password, salt) {
  const encodedPassword = new TextEncoder().encode(password);

  // Import password as base key material
  const baseKey = await window.crypto.subtle.importKey(
    "raw",
    encodedPassword,
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  // Derive AES-256-GCM key using PBKDF2
  const derivedKey = await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256"
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  return derivedKey;
}

/**
 * Encrypt text data with AES-256-GCM
 * @param {string} plaintext - Text to encrypt
 * @param {string} password - User's password
 * @returns {Promise<Object>} Encrypted data with metadata
 */
export async function encryptData(plaintext, password) {
  const salt = generateSalt();
  const iv = generateIV();
  const key = await deriveKey(password, salt);

  const encodedData = new TextEncoder().encode(plaintext);

  // Encrypt with AES-GCM (includes authentication tag automatically)
  const encrypted = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
      tagLength: AUTH_TAG_SIZE * 8 // 128 bits
    },
    key,
    encodedData
  );

  // AES-GCM returns ciphertext with auth tag appended
  // Extract ciphertext and auth tag separately for storage
  const encryptedArray = new Uint8Array(encrypted);
  const ciphertext = encryptedArray.slice(0, encryptedArray.length - AUTH_TAG_SIZE);
  const authTag = encryptedArray.slice(encryptedArray.length - AUTH_TAG_SIZE);

  return {
    salt: arrayToBase64(salt),
    iv: arrayToBase64(iv),
    ciphertext: arrayToBase64(ciphertext),
    authTag: arrayToBase64(authTag)
  };
}

/**
 * Decrypt text data with AES-256-GCM
 * @param {Object} encrypted - Encrypted data object
 * @param {string} password - User's password
 * @returns {Promise<string>} Decrypted plaintext
 */
export async function decryptData(encrypted, password) {
  const salt = base64ToArray(encrypted.salt);
  const iv = base64ToArray(encrypted.iv);
  const ciphertext = base64ToArray(encrypted.ciphertext);
  const authTag = base64ToArray(encrypted.authTag);

  const key = await deriveKey(password, salt);

  // Recombine ciphertext and auth tag for AES-GCM decryption
  const encryptedContent = new Uint8Array(ciphertext.length + authTag.length);
  encryptedContent.set(ciphertext, 0);
  encryptedContent.set(authTag, ciphertext.length);

  try {
    // Decrypt with AES-GCM (verifies authentication tag automatically)
    const decrypted = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
        tagLength: AUTH_TAG_SIZE * 8
      },
      key,
      encryptedContent
    );

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    // Decryption fails if password is wrong or data is tampered
    throw new Error('Decryption failed: Invalid password or corrupted data');
  }
}

/**
 * Encrypt file contents
 * @param {File} file - File to encrypt
 * @param {string} password - User's password
 * @param {Function} onProgress - Progress callback (0-100)
 * @returns {Promise<Object>} Encrypted file data with metadata
 */
export async function encryptFile(file, password, onProgress = null) {
  const salt = generateSalt();
  const iv = generateIV();
  const key = await deriveKey(password, salt);

  // Read file as ArrayBuffer
  const fileBuffer = await file.arrayBuffer();

  if (onProgress) onProgress(30); // Key derivation complete

  // Encrypt file contents with AES-GCM
  const encrypted = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
      tagLength: AUTH_TAG_SIZE * 8
    },
    key,
    fileBuffer
  );

  if (onProgress) onProgress(80); // Encryption complete

  // Extract ciphertext and auth tag
  const encryptedArray = new Uint8Array(encrypted);
  const ciphertext = encryptedArray.slice(0, encryptedArray.length - AUTH_TAG_SIZE);
  const authTag = encryptedArray.slice(encryptedArray.length - AUTH_TAG_SIZE);

  if (onProgress) onProgress(100); // Done

  return {
    salt: arrayToBase64(salt),
    iv: arrayToBase64(iv),
    ciphertext: ciphertext, // Keep as Uint8Array for file upload
    authTag: arrayToBase64(authTag),
    originalFilename: file.name,
    originalSize: file.size,
    mimeType: file.type
  };
}

/**
 * Decrypt file contents
 * @param {Object} encrypted - Encrypted file data
 * @param {string} password - User's password
 * @param {Function} onProgress - Progress callback (0-100)
 * @returns {Promise<Blob>} Decrypted file as Blob
 */
export async function decryptFile(encrypted, password, onProgress = null) {
  const salt = base64ToArray(encrypted.salt);
  const iv = base64ToArray(encrypted.iv);
  const ciphertext = encrypted.ciphertext instanceof Uint8Array
    ? encrypted.ciphertext
    : base64ToArray(encrypted.ciphertext);
  const authTag = base64ToArray(encrypted.authTag);

  const key = await deriveKey(password, salt);

  if (onProgress) onProgress(30); // Key derivation complete

  // Recombine ciphertext and auth tag
  const encryptedContent = new Uint8Array(ciphertext.length + authTag.length);
  encryptedContent.set(ciphertext, 0);
  encryptedContent.set(authTag, ciphertext.length);

  try {
    // Decrypt with AES-GCM
    const decrypted = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
        tagLength: AUTH_TAG_SIZE * 8
      },
      key,
      encryptedContent
    );

    if (onProgress) onProgress(100); // Done

    // Return as Blob with original mime type
    return new Blob([decrypted], { type: encrypted.mimeType || 'application/octet-stream' });
  } catch (error) {
    throw new Error('File decryption failed: Invalid password or corrupted data');
  }
}

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {Object} Validation result with strength and feedback
 */
export function validatePasswordStrength(password) {
  const minLength = 12;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

  const criteriaMet = [
    password.length >= minLength,
    hasUpperCase,
    hasLowerCase,
    hasNumber,
    hasSpecialChar
  ].filter(Boolean).length;

  const feedback = [];
  if (password.length < minLength) feedback.push(`At least ${minLength} characters`);
  if (!hasUpperCase) feedback.push('One uppercase letter');
  if (!hasLowerCase) feedback.push('One lowercase letter');
  if (!hasNumber) feedback.push('One number');
  if (!hasSpecialChar) feedback.push('One special character (!@#$%^&*...)');

  return {
    isValid: criteriaMet === 5,
    strength: criteriaMet === 5 ? 'strong' : criteriaMet >= 3 ? 'medium' : 'weak',
    feedback: feedback
  };
}

/**
 * Generate recovery key (random 256-bit key)
 * @returns {string} Base64-encoded recovery key
 */
export function generateRecoveryKey() {
  const recoveryKey = window.crypto.getRandomValues(new Uint8Array(32));
  return arrayToBase64(recoveryKey);
}

/**
 * Encrypt user's master key with recovery key
 * @param {string} password - User's password
 * @param {string} recoveryKey - Recovery key (base64)
 * @returns {Promise<Object>} Encrypted master key
 */
export async function encryptMasterKeyWithRecovery(password, recoveryKey) {
  // Derive master key from password
  const salt = generateSalt();
  const masterKey = await deriveKey(password, salt);

  // Export master key as raw bytes
  const exportedKey = await window.crypto.subtle.exportKey("raw", masterKey);

  // Use recovery key as password to encrypt master key
  const encryptedMasterKey = await encryptData(
    arrayToBase64(new Uint8Array(exportedKey)),
    recoveryKey
  );

  return {
    ...encryptedMasterKey,
    masterKeySalt: arrayToBase64(salt)
  };
}

// ===== Helper Functions =====

/**
 * Convert Uint8Array to Base64 string
 * @param {Uint8Array} array - Byte array
 * @returns {string} Base64 string
 */
function arrayToBase64(array) {
  return btoa(String.fromCharCode(...array));
}

/**
 * Convert Base64 string to Uint8Array
 * @param {string} base64 - Base64 string
 * @returns {Uint8Array} Byte array
 */
function base64ToArray(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Estimate encryption/decryption time for progress display
 * @param {number} sizeInBytes - File size in bytes
 * @returns {number} Estimated time in milliseconds
 */
export function estimateEncryptionTime(sizeInBytes) {
  // Rough estimate: 10-50ms per MB on modern hardware
  const mbSize = sizeInBytes / (1024 * 1024);
  return Math.max(100, mbSize * 30); // Minimum 100ms
}

// Export for testing
export const _testing = {
  PBKDF2_ITERATIONS,
  SALT_SIZE,
  IV_SIZE,
  AUTH_TAG_SIZE,
  arrayToBase64,
  base64ToArray
};
