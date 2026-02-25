/**
 * Document Crypto Service
 *
 * Encrypts document fields with AAD bound to userId and documentId.
 * The userId binding prevents cross-user ciphertext substitution attacks.
 */

import { EncryptionService } from "../security/encryption.service";
import { hkdf32 } from "../security/hkdf.service";

export class DocumentCryptoService {
  constructor(private enc: EncryptionService) {}

  private keyFor(dk: Buffer, purpose: string) {
    return hkdf32(dk, `koda:doc:${purpose}:v1`);
  }

  /**
   * Build AAD string with userId binding for cross-user attack mitigation
   */
  private aad(userId: string, documentId: string, field: string): string {
    return `doc:${userId}:${documentId}:${field}`;
  }

  encryptFilename(
    userId: string,
    documentId: string,
    filename: string,
    dk: Buffer,
  ): string {
    const key = this.keyFor(dk, "filename");
    return this.enc.encryptStringToJson(
      filename,
      key,
      this.aad(userId, documentId, "filename"),
    );
  }

  decryptFilename(
    userId: string,
    documentId: string,
    payloadJson: string,
    dk: Buffer,
  ): string {
    const key = this.keyFor(dk, "filename");
    return this.enc.decryptStringFromJson(
      payloadJson,
      key,
      this.aad(userId, documentId, "filename"),
    );
  }

  encryptExtractedText(
    userId: string,
    documentId: string,
    text: string,
    dk: Buffer,
  ): string {
    const key = this.keyFor(dk, "extractedText");
    return this.enc.encryptStringToJson(
      text,
      key,
      this.aad(userId, documentId, "extractedText"),
    );
  }

  decryptExtractedText(
    userId: string,
    documentId: string,
    payloadJson: string,
    dk: Buffer,
  ): string {
    const key = this.keyFor(dk, "extractedText");
    return this.enc.decryptStringFromJson(
      payloadJson,
      key,
      this.aad(userId, documentId, "extractedText"),
    );
  }

  encryptPreviewText(
    userId: string,
    documentId: string,
    text: string,
    dk: Buffer,
  ): string {
    const key = this.keyFor(dk, "previewText");
    return this.enc.encryptStringToJson(
      text,
      key,
      this.aad(userId, documentId, "previewText"),
    );
  }

  decryptPreviewText(
    userId: string,
    documentId: string,
    payloadJson: string,
    dk: Buffer,
  ): string {
    const key = this.keyFor(dk, "previewText");
    return this.enc.decryptStringFromJson(
      payloadJson,
      key,
      this.aad(userId, documentId, "previewText"),
    );
  }

  encryptRenderableContent(
    userId: string,
    documentId: string,
    content: string,
    dk: Buffer,
  ): string {
    const key = this.keyFor(dk, "renderableContent");
    return this.enc.encryptStringToJson(
      content,
      key,
      this.aad(userId, documentId, "renderableContent"),
    );
  }

  decryptRenderableContent(
    userId: string,
    documentId: string,
    payloadJson: string,
    dk: Buffer,
  ): string {
    const key = this.keyFor(dk, "renderableContent");
    return this.enc.decryptStringFromJson(
      payloadJson,
      key,
      this.aad(userId, documentId, "renderableContent"),
    );
  }

  encryptDisplayTitle(
    userId: string,
    documentId: string,
    title: string,
    dk: Buffer,
  ): string {
    const key = this.keyFor(dk, "displayTitle");
    return this.enc.encryptStringToJson(
      title,
      key,
      this.aad(userId, documentId, "displayTitle"),
    );
  }

  decryptDisplayTitle(
    userId: string,
    documentId: string,
    payloadJson: string,
    dk: Buffer,
  ): string {
    const key = this.keyFor(dk, "displayTitle");
    return this.enc.decryptStringFromJson(
      payloadJson,
      key,
      this.aad(userId, documentId, "displayTitle"),
    );
  }

  encryptChunkText(
    userId: string,
    documentId: string,
    chunkId: string,
    text: string,
    dk: Buffer,
  ): string {
    const key = this.keyFor(dk, "chunkText");
    return this.enc.encryptStringToJson(
      text,
      key,
      `doc:${userId}:${documentId}:chunk:${chunkId}`,
    );
  }

  decryptChunkText(
    userId: string,
    documentId: string,
    chunkId: string,
    payloadJson: string,
    dk: Buffer,
  ): string {
    const key = this.keyFor(dk, "chunkText");
    return this.enc.decryptStringFromJson(
      payloadJson,
      key,
      `doc:${userId}:${documentId}:chunk:${chunkId}`,
    );
  }
}
