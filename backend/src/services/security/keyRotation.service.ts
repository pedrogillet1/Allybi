import { EncryptionService } from "./encryption.service";
import { EncryptedPayload } from "./crypto.types";
import { logger } from "../../utils/logger";

export interface KeyVersion {
  version: number;
  keyBase64: string;
  createdAt: Date;
  isActive: boolean;
}

/**
 * Key rotation service.
 * Supports re-encrypting payloads from old key versions to the current version.
 */
export class KeyRotationService {
  private currentVersion: number;
  private keys: Map<number, string> = new Map();

  constructor() {
    this.currentVersion = parseInt(process.env.KODA_KEY_VERSION || "1", 10);

    // Load current key
    const currentKey = process.env.KODA_MASTER_KEY_BASE64;
    if (currentKey) {
      this.keys.set(this.currentVersion, currentKey);
    }

    // Load previous keys (format: KODA_MASTER_KEY_V{n}_BASE64)
    for (let v = this.currentVersion - 1; v >= 0; v--) {
      const prevKey = process.env[`KODA_MASTER_KEY_V${v}_BASE64`];
      if (prevKey) {
        this.keys.set(v, prevKey);
      }
    }
  }

  getCurrentVersion(): number {
    return this.currentVersion;
  }

  getKeyForVersion(version: number): string | undefined {
    return this.keys.get(version);
  }

  /**
   * Re-encrypt a payload from its original key version to the current version.
   * Returns the re-encrypted JSON string, or the original if already current.
   */
  reEncryptPayload(payloadJson: string, aad: string): string {
    const payload: EncryptedPayload = JSON.parse(payloadJson);
    const oldVersion = payload.kv ?? 0;

    if (oldVersion === this.currentVersion) {
      return payloadJson; // Already on current version
    }

    const oldKeyB64 = this.keys.get(oldVersion);
    if (!oldKeyB64) {
      throw new Error(
        `Key version ${oldVersion} not available for re-encryption`,
      );
    }

    const currentKeyB64 = this.keys.get(this.currentVersion);
    if (!currentKeyB64) {
      throw new Error(
        `Current key version ${this.currentVersion} not available`,
      );
    }

    const oldKey = Buffer.from(oldKeyB64, "base64");
    const currentKey = Buffer.from(currentKeyB64, "base64");

    // Decrypt with old key
    const enc = new EncryptionService();
    const plaintext = enc.decryptBuffer(payload, oldKey, aad);

    // Re-encrypt with current key
    const newPayload = enc.encryptBuffer(plaintext, currentKey, aad);

    return JSON.stringify(newPayload);
  }

  /**
   * Check if rotation is overdue (> 90 days since last rotation).
   */
  async isRotationOverdue(): Promise<boolean> {
    const lastRotation = process.env.KODA_LAST_KEY_ROTATION;
    if (!lastRotation) return true;

    const daysSinceRotation =
      (Date.now() - new Date(lastRotation).getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceRotation > 90;
  }
}

let _instance: KeyRotationService | null = null;

export function getKeyRotation(): KeyRotationService {
  if (!_instance) {
    _instance = new KeyRotationService();
  }
  return _instance;
}
