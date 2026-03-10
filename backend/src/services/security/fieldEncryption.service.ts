/**
 * Field-level Encryption Service
 *
 * Reusable field-level encryption with structured AAD.
 * AAD format: "field:{userId}:{entityId}:{fieldName}"
 *
 * Uses the existing EncryptionService (AES-256-GCM) with a master key
 * derived from KODA_MASTER_KEY_BASE64.
 */

import { EncryptionService } from "./encryption.service";

export class FieldEncryptionService {
  private enc: EncryptionService;
  private masterKey: Buffer;

  constructor(keyBase64: string) {
    this.enc = new EncryptionService();
    this.masterKey = Buffer.from(keyBase64, "base64");
    if (this.masterKey.length !== 32) {
      throw new Error(
        `FieldEncryptionService: master key must be 32 bytes (got ${this.masterKey.length}). ` +
          "Ensure KODA_MASTER_KEY_BASE64 is a base64-encoded 32-byte key.",
      );
    }
  }

  /**
   * Encrypt a plaintext field value with structured AAD.
   * Returns a JSON-stringified EncryptedPayload.
   */
  encryptField(
    plaintext: string,
    aad: { userId: string; entityId: string; field: string },
  ): string {
    const aadStr = `field:${aad.userId}:${aad.entityId}:${aad.field}`;
    return this.enc.encryptStringToJson(plaintext, this.masterKey, aadStr);
  }

  /**
   * Decrypt a previously encrypted field value.
   * Input is the JSON string returned by encryptField().
   */
  decryptField(
    encrypted: string,
    aad: { userId: string; entityId: string; field: string },
  ): string {
    const aadStr = `field:${aad.userId}:${aad.entityId}:${aad.field}`;
    return this.enc.decryptStringFromJson(encrypted, this.masterKey, aadStr);
  }
}

// ---------------------------------------------------------------------------
// Singleton accessor
// ---------------------------------------------------------------------------

let _instance: FieldEncryptionService | null = null;

export function getFieldEncryption(): FieldEncryptionService {
  if (!_instance) {
    const key = process.env.KODA_MASTER_KEY_BASE64;
    if (!key) {
      throw new Error(
        "KODA_MASTER_KEY_BASE64 required for field encryption",
      );
    }
    _instance = new FieldEncryptionService(key);
  }
  return _instance;
}
