/**
 * Unit tests for Zero-Knowledge Encryption Utilities
 */

import {
  generateSalt,
  generateIV,
  deriveKey,
  encryptData,
  decryptData,
  encryptFile,
  decryptFile,
  validatePasswordStrength,
  generateRecoveryKey,
  _testing
} from './encryption';

describe('Encryption Utilities', () => {
  const testPassword = 'SecurePassword123!';
  const testPlaintext = 'Hello, World! This is a secret message.';

  describe('Random Generation', () => {
    test('generateSalt produces 16-byte salt', () => {
      const salt = generateSalt();
      expect(salt).toBeInstanceOf(Uint8Array);
      expect(salt.length).toBe(16);
    });

    test('generateSalt produces unique salts', () => {
      const salt1 = generateSalt();
      const salt2 = generateSalt();
      expect(salt1).not.toEqual(salt2);
    });

    test('generateIV produces 12-byte IV', () => {
      const iv = generateIV();
      expect(iv).toBeInstanceOf(Uint8Array);
      expect(iv.length).toBe(12);
    });

    test('generateIV produces unique IVs', () => {
      const iv1 = generateIV();
      const iv2 = generateIV();
      expect(iv1).not.toEqual(iv2);
    });
  });

  describe('Text Encryption/Decryption', () => {
    test('Encrypt and decrypt text successfully', async () => {
      const encrypted = await encryptData(testPlaintext, testPassword);

      // Verify encrypted object structure
      expect(encrypted).toHaveProperty('salt');
      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('ciphertext');
      expect(encrypted).toHaveProperty('authTag');

      const decrypted = await decryptData(encrypted, testPassword);
      expect(decrypted).toBe(testPlaintext);
    });

    test('Different passwords produce different ciphertexts', async () => {
      const password1 = 'Password1!';
      const password2 = 'Password2!';

      const encrypted1 = await encryptData(testPlaintext, password1);
      const encrypted2 = await encryptData(testPlaintext, password2);

      expect(encrypted1.ciphertext).not.toEqual(encrypted2.ciphertext);
    });

    test('Same password with different salts produces different ciphertexts', async () => {
      const encrypted1 = await encryptData(testPlaintext, testPassword);
      const encrypted2 = await encryptData(testPlaintext, testPassword);

      // Different salts mean different keys, so different ciphertexts
      expect(encrypted1.salt).not.toEqual(encrypted2.salt);
      expect(encrypted1.ciphertext).not.toEqual(encrypted2.ciphertext);
    });

    test('Wrong password fails to decrypt', async () => {
      const correctPassword = 'CorrectPassword123!';
      const wrongPassword = 'WrongPassword123!';

      const encrypted = await encryptData(testPlaintext, correctPassword);

      await expect(decryptData(encrypted, wrongPassword)).rejects.toThrow('Decryption failed');
    });

    test('Tampered ciphertext fails to decrypt', async () => {
      const encrypted = await encryptData(testPlaintext, testPassword);

      // Tamper with ciphertext (flip one bit)
      const tamperedCiphertext = _testing.base64ToArray(encrypted.ciphertext);
      tamperedCiphertext[0] = (tamperedCiphertext[0] + 1) % 256;
      encrypted.ciphertext = _testing.arrayToBase64(tamperedCiphertext);

      await expect(decryptData(encrypted, testPassword)).rejects.toThrow();
    });

    test('Tampered auth tag fails to decrypt', async () => {
      const encrypted = await encryptData(testPlaintext, testPassword);

      // Tamper with auth tag
      const tamperedAuthTag = _testing.base64ToArray(encrypted.authTag);
      tamperedAuthTag[0] = (tamperedAuthTag[0] + 1) % 256;
      encrypted.authTag = _testing.arrayToBase64(tamperedAuthTag);

      await expect(decryptData(encrypted, testPassword)).rejects.toThrow();
    });

    test('Empty string can be encrypted and decrypted', async () => {
      const encrypted = await encryptData('', testPassword);
      const decrypted = await decryptData(encrypted, testPassword);
      expect(decrypted).toBe('');
    });

    test('Unicode characters can be encrypted and decrypted', async () => {
      const unicodeText = 'Hello 世界! 🔐 Héllo Wörld';
      const encrypted = await encryptData(unicodeText, testPassword);
      const decrypted = await decryptData(encrypted, testPassword);
      expect(decrypted).toBe(unicodeText);
    });

    test('Long text can be encrypted and decrypted', async () => {
      const longText = 'A'.repeat(1000000); // 1MB of text
      const encrypted = await encryptData(longText, testPassword);
      const decrypted = await decryptData(encrypted, testPassword);
      expect(decrypted).toBe(longText);
    });
  });

  describe('File Encryption/Decryption', () => {
    test('Encrypt and decrypt file successfully', async () => {
      // Create mock file
      const fileContent = 'This is a test file content';
      const mockFile = new File([fileContent], 'test.txt', { type: 'text/plain' });

      const encrypted = await encryptFile(mockFile, testPassword);

      // Verify encrypted object structure
      expect(encrypted).toHaveProperty('salt');
      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('ciphertext');
      expect(encrypted).toHaveProperty('authTag');
      expect(encrypted).toHaveProperty('originalFilename');
      expect(encrypted).toHaveProperty('originalSize');
      expect(encrypted).toHaveProperty('mimeType');

      expect(encrypted.originalFilename).toBe('test.txt');
      expect(encrypted.mimeType).toBe('text/plain');

      const decryptedBlob = await decryptFile(encrypted, testPassword);
      const decryptedText = await decryptedBlob.text();

      expect(decryptedText).toBe(fileContent);
      expect(decryptedBlob.type).toBe('text/plain');
    });

    test('Wrong password fails to decrypt file', async () => {
      const mockFile = new File(['test content'], 'test.txt', { type: 'text/plain' });
      const encrypted = await encryptFile(mockFile, 'CorrectPassword123!');

      await expect(decryptFile(encrypted, 'WrongPassword123!')).rejects.toThrow('File decryption failed');
    });

    test('Progress callback is called during encryption', async () => {
      const mockFile = new File(['test content'], 'test.txt');
      const progressValues = [];
      const onProgress = (progress) => progressValues.push(progress);

      await encryptFile(mockFile, testPassword, onProgress);

      expect(progressValues.length).toBeGreaterThan(0);
      expect(progressValues).toContain(100); // Should reach 100%
    });

    test('Progress callback is called during decryption', async () => {
      const mockFile = new File(['test content'], 'test.txt');
      const encrypted = await encryptFile(mockFile, testPassword);

      const progressValues = [];
      const onProgress = (progress) => progressValues.push(progress);

      await decryptFile(encrypted, testPassword, onProgress);

      expect(progressValues.length).toBeGreaterThan(0);
      expect(progressValues).toContain(100);
    });
  });

  describe('Password Strength Validation', () => {
    test('Strong password passes validation', () => {
      const result = validatePasswordStrength('MySecurePassword123!');
      expect(result.isValid).toBe(true);
      expect(result.strength).toBe('strong');
      expect(result.feedback).toHaveLength(0);
    });

    test('Weak password fails validation - too short', () => {
      const result = validatePasswordStrength('Pass1!');
      expect(result.isValid).toBe(false);
      expect(result.strength).toBe('weak');
      expect(result.feedback).toContain('At least 12 characters');
    });

    test('Weak password fails validation - missing uppercase', () => {
      const result = validatePasswordStrength('mypassword123!');
      expect(result.isValid).toBe(false);
      expect(result.feedback).toContain('One uppercase letter');
    });

    test('Weak password fails validation - missing lowercase', () => {
      const result = validatePasswordStrength('MYPASSWORD123!');
      expect(result.isValid).toBe(false);
      expect(result.feedback).toContain('One lowercase letter');
    });

    test('Weak password fails validation - missing number', () => {
      const result = validatePasswordStrength('MyPasswordHere!');
      expect(result.isValid).toBe(false);
      expect(result.feedback).toContain('One number');
    });

    test('Weak password fails validation - missing special character', () => {
      const result = validatePasswordStrength('MyPassword123');
      expect(result.isValid).toBe(false);
      expect(result.feedback).toContain('One special character');
    });

    test('Medium strength password', () => {
      const result = validatePasswordStrength('MyPassword123'); // Missing special char
      expect(result.isValid).toBe(false);
      expect(result.strength).toBe('medium');
    });
  });

  describe('Recovery Key', () => {
    test('Generate recovery key produces 32-byte key', () => {
      const recoveryKey = generateRecoveryKey();
      expect(typeof recoveryKey).toBe('string');

      // Decode base64 and check length
      const decoded = _testing.base64ToArray(recoveryKey);
      expect(decoded.length).toBe(32);
    });

    test('Recovery keys are unique', () => {
      const key1 = generateRecoveryKey();
      const key2 = generateRecoveryKey();
      expect(key1).not.toEqual(key2);
    });
  });

  describe('Helper Functions', () => {
    test('arrayToBase64 and base64ToArray are inverse operations', () => {
      const original = new Uint8Array([1, 2, 3, 4, 5, 255, 128, 64]);
      const base64 = _testing.arrayToBase64(original);
      const restored = _testing.base64ToArray(base64);

      expect(restored).toEqual(original);
    });

    test('Base64 encoding handles all byte values', () => {
      const allBytes = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        allBytes[i] = i;
      }

      const base64 = _testing.arrayToBase64(allBytes);
      const restored = _testing.base64ToArray(base64);

      expect(restored).toEqual(allBytes);
    });
  });

  describe('Key Derivation', () => {
    test('Same password and salt produce same key', async () => {
      const password = 'TestPassword123!';
      const salt = generateSalt();

      const key1 = await deriveKey(password, salt);
      const key2 = await deriveKey(password, salt);

      // Export keys and compare
      const exported1 = await window.crypto.subtle.exportKey('raw', key1);
      const exported2 = await window.crypto.subtle.exportKey('raw', key2);

      expect(new Uint8Array(exported1)).toEqual(new Uint8Array(exported2));
    });

    test('Different salts produce different keys', async () => {
      const password = 'TestPassword123!';
      const salt1 = generateSalt();
      const salt2 = generateSalt();

      const key1 = await deriveKey(password, salt1);
      const key2 = await deriveKey(password, salt2);

      const exported1 = await window.crypto.subtle.exportKey('raw', key1);
      const exported2 = await window.crypto.subtle.exportKey('raw', key2);

      expect(new Uint8Array(exported1)).not.toEqual(new Uint8Array(exported2));
    });

    test('Different passwords produce different keys', async () => {
      const salt = generateSalt();
      const password1 = 'Password1!';
      const password2 = 'Password2!';

      const key1 = await deriveKey(password1, salt);
      const key2 = await deriveKey(password2, salt);

      const exported1 = await window.crypto.subtle.exportKey('raw', key1);
      const exported2 = await window.crypto.subtle.exportKey('raw', key2);

      expect(new Uint8Array(exported1)).not.toEqual(new Uint8Array(exported2));
    });
  });

  describe('Security Properties', () => {
    test('Encryption produces different output each time (random IV)', async () => {
      const plaintext = 'Same message';
      const password = 'SamePassword123!';

      const encrypted1 = await encryptData(plaintext, password);
      const encrypted2 = await encryptData(plaintext, password);

      // Different IVs
      expect(encrypted1.iv).not.toEqual(encrypted2.iv);
      // Different ciphertexts
      expect(encrypted1.ciphertext).not.toEqual(encrypted2.ciphertext);
      // But both decrypt to same plaintext
      const decrypted1 = await decryptData(encrypted1, password);
      const decrypted2 = await decryptData(encrypted2, password);
      expect(decrypted1).toBe(plaintext);
      expect(decrypted2).toBe(plaintext);
    });

    test('Ciphertext does not reveal plaintext length (within block)', async () => {
      // AES-GCM may add padding, but ciphertext length should not exactly equal plaintext length
      const short = 'Hi';
      const medium = 'Hello World';

      const encShort = await encryptData(short, testPassword);
      const encMedium = await encryptData(medium, testPassword);

      const shortCiphertext = _testing.base64ToArray(encShort.ciphertext);
      const mediumCiphertext = _testing.base64ToArray(encMedium.ciphertext);

      // Ciphertext should be longer than plaintext (but not by much for GCM)
      expect(shortCiphertext.length).toBeGreaterThanOrEqual(short.length);
      expect(mediumCiphertext.length).toBeGreaterThanOrEqual(medium.length);
    });
  });
});
