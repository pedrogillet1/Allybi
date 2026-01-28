/**
 * Document Metadata Crypto Service
 *
 * Encrypts DocumentMetadata sensitive fields (extractedText, entities, classification)
 * with AAD bound to userId and documentId.
 */

import { EncryptionService } from "../security/encryption.service";
import { hkdf32 } from "../security/hkdf.service";

export class MetadataCryptoService {
  constructor(private enc: EncryptionService) {}

  private keyFor(dk: Buffer, purpose: string) {
    return hkdf32(dk, `koda:meta:${purpose}:v1`);
  }

  /**
   * Encrypt extracted text with AAD bound to userId and documentId
   */
  encryptExtractedText(userId: string, documentId: string, text: string, dk: Buffer): string {
    const key = this.keyFor(dk, "extractedText");
    return this.enc.encryptStringToJson(text, key, `meta:${userId}:${documentId}:extractedText`);
  }

  decryptExtractedText(userId: string, documentId: string, payloadJson: string, dk: Buffer): string {
    const key = this.keyFor(dk, "extractedText");
    return this.enc.decryptStringFromJson(payloadJson, key, `meta:${userId}:${documentId}:extractedText`);
  }

  /**
   * Encrypt entities JSON with AAD bound to userId and documentId
   */
  encryptEntities(userId: string, documentId: string, entities: string, dk: Buffer): string {
    const key = this.keyFor(dk, "entities");
    return this.enc.encryptStringToJson(entities, key, `meta:${userId}:${documentId}:entities`);
  }

  decryptEntities(userId: string, documentId: string, payloadJson: string, dk: Buffer): string {
    const key = this.keyFor(dk, "entities");
    return this.enc.decryptStringFromJson(payloadJson, key, `meta:${userId}:${documentId}:entities`);
  }

  /**
   * Encrypt classification with AAD bound to userId and documentId
   */
  encryptClassification(userId: string, documentId: string, classification: string, dk: Buffer): string {
    const key = this.keyFor(dk, "classification");
    return this.enc.encryptStringToJson(classification, key, `meta:${userId}:${documentId}:classification`);
  }

  decryptClassification(userId: string, documentId: string, payloadJson: string, dk: Buffer): string {
    const key = this.keyFor(dk, "classification");
    return this.enc.decryptStringFromJson(payloadJson, key, `meta:${userId}:${documentId}:classification`);
  }
}
