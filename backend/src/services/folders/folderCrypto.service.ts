/**
 * Folder Crypto Service
 *
 * Encrypts folder fields with AAD bound to userId and folderId.
 * The userId binding prevents cross-user ciphertext substitution attacks.
 */

import { EncryptionService } from "../security/encryption.service";
import { hkdf32 } from "../security/hkdf.service";

export class FolderCryptoService {
  constructor(private enc: EncryptionService) {}

  private keyFor(fk: Buffer, purpose: string) {
    return hkdf32(fk, `koda:folder:${purpose}:v1`);
  }

  /**
   * Build AAD string with userId binding for cross-user attack mitigation
   */
  private aad(userId: string, folderId: string, field: string): string {
    return `folder:${userId}:${folderId}:${field}`;
  }

  encryptName(userId: string, folderId: string, name: string, fk: Buffer): string {
    const key = this.keyFor(fk, "name");
    return this.enc.encryptStringToJson(name, key, this.aad(userId, folderId, "name"));
  }

  decryptName(userId: string, folderId: string, payloadJson: string, fk: Buffer): string {
    const key = this.keyFor(fk, "name");
    return this.enc.decryptStringFromJson(payloadJson, key, this.aad(userId, folderId, "name"));
  }

  encryptDescription(userId: string, folderId: string, description: string, fk: Buffer): string {
    const key = this.keyFor(fk, "description");
    return this.enc.encryptStringToJson(description, key, this.aad(userId, folderId, "description"));
  }

  decryptDescription(userId: string, folderId: string, payloadJson: string, fk: Buffer): string {
    const key = this.keyFor(fk, "description");
    return this.enc.decryptStringFromJson(payloadJson, key, this.aad(userId, folderId, "description"));
  }
}
