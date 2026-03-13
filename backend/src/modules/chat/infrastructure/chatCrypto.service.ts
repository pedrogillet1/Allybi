/**
 * Chat Crypto Service
 *
 * Encrypts message content and conversation titles with AAD bound to userId.
 * The userId binding prevents cross-user ciphertext substitution attacks.
 */

import { EncryptionService } from "../../../services/security/encryption.service";
import { hkdf32 } from "../../../services/security/hkdf.service";

export class ChatCryptoService {
  constructor(private enc: EncryptionService) {}

  private msgKey(conversationKey: Buffer) {
    return hkdf32(conversationKey, "koda:chat:message:v1");
  }

  /**
   * Encrypt message content with AAD bound to userId
   */
  encryptMessage(
    userId: string,
    conversationId: string,
    messageId: string,
    role: string,
    plaintext: string,
    conversationKey: Buffer,
  ): string {
    const key = this.msgKey(conversationKey);
    const aad = `msg:${userId}:${conversationId}:${messageId}:${role}`;
    return this.enc.encryptStringToJson(plaintext, key, aad);
  }

  decryptMessage(
    userId: string,
    conversationId: string,
    messageId: string,
    role: string,
    payloadJson: string,
    conversationKey: Buffer,
  ): string {
    const key = this.msgKey(conversationKey);
    const aad = `msg:${userId}:${conversationId}:${messageId}:${role}`;
    return this.enc.decryptStringFromJson(payloadJson, key, aad);
  }

  /**
   * Encrypt conversation title with AAD bound to userId
   */
  encryptTitle(
    userId: string,
    conversationId: string,
    plaintextTitle: string,
    conversationKey: Buffer,
  ): string {
    const key = hkdf32(conversationKey, "koda:chat:title:v1");
    const aad = `title:${userId}:${conversationId}`;
    return this.enc.encryptStringToJson(plaintextTitle, key, aad);
  }

  decryptTitle(
    userId: string,
    conversationId: string,
    payloadJson: string,
    conversationKey: Buffer,
  ): string {
    const key = hkdf32(conversationKey, "koda:chat:title:v1");
    const aad = `title:${userId}:${conversationId}`;
    return this.enc.decryptStringFromJson(payloadJson, key, aad);
  }
}
