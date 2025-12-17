import crypto from 'crypto';
import { config } from '../config/env';

/**
 * Field-Level Encryption Service
 *
 * Provides AES-256-GCM encryption for sensitive data fields
 * Features:
 * - Authenticated encryption (prevents tampering)
 * - Unique IV per encryption (prevents pattern analysis)
 * - Key derivation from master key
 * - Support for multiple encryption contexts
 */

interface EncryptedData {
  encrypted: string;
  iv: string;
  authTag: string;
  version: string; // For key rotation support
}

export class EncryptionService {
  private readonly ALGORITHM = 'aes-256-gcm';
  private readonly KEY_LENGTH = 32; // 256 bits
  private readonly IV_LENGTH = 16; // 128 bits
  private readonly AUTH_TAG_LENGTH = 16; // 128 bits
  private readonly CURRENT_VERSION = 'v1';

  /**
   * Get encryption key (derived from master key with context)
   */
  private getEncryptionKey(context: string = 'default'): Buffer {
    const masterKey = config.ENCRYPTION_KEY || this.generateDefaultKey();

    // Derive key using PBKDF2 with context as salt
    const salt = crypto.createHash('sha256').update(context).digest();
    return crypto.pbkdf2Sync(masterKey, salt, 100000, this.KEY_LENGTH, 'sha256');
  }

  /**
   * Generate a default key if none is configured (development only)
   */
  private generateDefaultKey(): string {
    if (config.NODE_ENV === 'production') {
      throw new Error('ENCRYPTION_KEY must be set in production environment');
    }
    console.warn('⚠️  Using auto-generated encryption key (not secure for production)');
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Encrypt a string value
   */
  encrypt(plaintext: string, context: string = 'default'): string {
    try {
      // Generate unique IV for this encryption
      const iv = crypto.randomBytes(this.IV_LENGTH);

      // Get encryption key
      const key = this.getEncryptionKey(context);

      // Create cipher
      const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);

      // Encrypt
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // Get authentication tag
      const authTag = cipher.getAuthTag();

      // Package encrypted data
      const result: EncryptedData = {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        version: this.CURRENT_VERSION,
      };

      // Return as JSON string
      return JSON.stringify(result);
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt a string value
   */
  decrypt(encryptedData: string, context: string = 'default'): string {
    try {
      // Parse encrypted data
      const data: EncryptedData = JSON.parse(encryptedData);

      // Get decryption key (version support for key rotation)
      const key = this.getEncryptionKey(context);

      // Create decipher
      const decipher = crypto.createDecipheriv(
        this.ALGORITHM,
        key,
        Buffer.from(data.iv, 'hex')
      );

      // Set authentication tag
      decipher.setAuthTag(Buffer.from(data.authTag, 'hex'));

      // Decrypt
      let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Failed to decrypt data (data may be corrupted or tampered)');
    }
  }

  /**
   * Encrypt an object (encrypts specific fields)
   */
  encryptObject<T extends Record<string, any>>(
    obj: T,
    fieldsToEncrypt: (keyof T)[],
    context: string = 'default'
  ): T {
    const result = { ...obj };

    for (const field of fieldsToEncrypt) {
      if (result[field] !== undefined && result[field] !== null) {
        const value = String(result[field]);
        result[field] = this.encrypt(value, `${context}.${String(field)}`) as any;
      }
    }

    return result;
  }

  /**
   * Decrypt an object (decrypts specific fields)
   */
  decryptObject<T extends Record<string, any>>(
    obj: T,
    fieldsToDecrypt: (keyof T)[],
    context: string = 'default'
  ): T {
    const result = { ...obj };

    for (const field of fieldsToDecrypt) {
      if (result[field] !== undefined && result[field] !== null) {
        try {
          const value = String(result[field]);
          result[field] = this.decrypt(value, `${context}.${String(field)}`) as any;
        } catch (error) {
          console.error(`Failed to decrypt field ${String(field)}:`, error);
          // Keep encrypted value if decryption fails
        }
      }
    }

    return result;
  }

  /**
   * Hash a value (one-way, for comparison)
   */
  hash(value: string, salt?: string): string {
    const actualSalt = salt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(value, actualSalt, 100000, 64, 'sha512');
    return `${actualSalt}:${hash.toString('hex')}`;
  }

  /**
   * Verify a hashed value
   */
  verifyHash(value: string, hashedValue: string): boolean {
    const [salt, hash] = hashedValue.split(':');
    const computedHash = crypto.pbkdf2Sync(value, salt, 100000, 64, 'sha512');
    return hash === computedHash.toString('hex');
  }

  /**
   * Generate a secure random token
   */
  generateToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Encrypt sensitive user data fields
   */
  encryptUserData(userData: any): any {
    const sensitiveFields = ['phone', 'address', 'ssn', 'dateOfBirth'];
    return this.encryptObject(userData, sensitiveFields, 'user');
  }

  /**
   * Decrypt sensitive user data fields
   */
  decryptUserData(userData: any): any {
    const sensitiveFields = ['phone', 'address', 'ssn', 'dateOfBirth'];
    return this.decryptObject(userData, sensitiveFields, 'user');
  }

  /**
   * Mask sensitive data for display (e.g., **** 1234)
   */
  maskSensitiveData(value: string, visibleChars: number = 4): string {
    if (!value || value.length <= visibleChars) {
      return '****';
    }

    const masked = '*'.repeat(Math.max(0, value.length - visibleChars));
    const visible = value.slice(-visibleChars);
    return `${masked}${visible}`;
  }

  /**
   * Encrypt file data (for document encryption)
   */
  encryptFile(buffer: Buffer, context: string = 'file'): Buffer {
    try {
      const iv = crypto.randomBytes(this.IV_LENGTH);
      const key = this.getEncryptionKey(context);
      const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);

      const encrypted = Buffer.concat([
        cipher.update(buffer),
        cipher.final(),
      ]);

      const authTag = cipher.getAuthTag();

      // Package: IV (16) + AuthTag (16) + Encrypted Data
      return Buffer.concat([iv, authTag, encrypted]);
    } catch (error) {
      console.error('File encryption error:', error);
      throw new Error('Failed to encrypt file');
    }
  }

  /**
   * Decrypt file data
   */
  decryptFile(encryptedBuffer: Buffer, context: string = 'file'): Buffer {
    try {
      // Extract IV, AuthTag, and encrypted data
      const iv = encryptedBuffer.slice(0, this.IV_LENGTH);
      const authTag = encryptedBuffer.slice(this.IV_LENGTH, this.IV_LENGTH + this.AUTH_TAG_LENGTH);
      const encrypted = encryptedBuffer.slice(this.IV_LENGTH + this.AUTH_TAG_LENGTH);

      const key = this.getEncryptionKey(context);
      const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);

      return Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);
    } catch (error) {
      console.error('File decryption error:', error);
      throw new Error('Failed to decrypt file');
    }
  }

  /**
   * Re-encrypt data with a new key (for key rotation)
   */
  reencrypt(encryptedData: string, oldContext: string, newContext: string): string {
    const decrypted = this.decrypt(encryptedData, oldContext);
    return this.encrypt(decrypted, newContext);
  }
}

// Infrastructure singleton - kept for backward compatibility
// Can also be accessed via container.getEncryption()
export default new EncryptionService();
