/**
 * Two-Factor Authentication Crypto Service
 *
 * Encrypts TOTP secrets and backup codes with AAD bound to userId.
 * Uses per-user tenant key for encryption.
 */

import { EncryptionService } from "./encryption.service";
import { hkdf32 } from "./hkdf.service";

export class TwoFactorCryptoService {
  constructor(private enc: EncryptionService) {}

  private keyFor(tenantKey: Buffer, purpose: string) {
    return hkdf32(tenantKey, `koda:2fa:${purpose}:v1`);
  }

  /**
   * Encrypt TOTP secret with AAD bound to userId
   */
  encryptSecret(userId: string, secret: string, tenantKey: Buffer): string {
    const key = this.keyFor(tenantKey, "secret");
    return this.enc.encryptStringToJson(secret, key, `2fa:${userId}:secret`);
  }

  decryptSecret(userId: string, payloadJson: string, tenantKey: Buffer): string {
    const key = this.keyFor(tenantKey, "secret");
    return this.enc.decryptStringFromJson(payloadJson, key, `2fa:${userId}:secret`);
  }

  /**
   * Encrypt backup codes with AAD bound to userId
   */
  encryptBackupCodes(userId: string, codes: string, tenantKey: Buffer): string {
    const key = this.keyFor(tenantKey, "backupCodes");
    return this.enc.encryptStringToJson(codes, key, `2fa:${userId}:backupCodes`);
  }

  decryptBackupCodes(userId: string, payloadJson: string, tenantKey: Buffer): string {
    const key = this.keyFor(tenantKey, "backupCodes");
    return this.enc.decryptStringFromJson(payloadJson, key, `2fa:${userId}:backupCodes`);
  }
}
