import { describe, expect, test } from "@jest/globals";
import crypto from "crypto";
import { EncryptionService } from "../security/encryption.service";
import { ChatCryptoService } from "./chatCrypto.service";

const enc = new EncryptionService();
const chatCrypto = new ChatCryptoService(enc);
const conversationKey = crypto.randomBytes(32);

describe("ChatCryptoService", () => {
  const userId = "user-1";
  const conversationId = "conv-1";
  const messageId = "msg-1";
  const role = "user";

  test("message encrypt/decrypt roundtrip", () => {
    const plaintext = "Hello, this is a secret message.";
    const payload = chatCrypto.encryptMessage(
      userId,
      conversationId,
      messageId,
      role,
      plaintext,
      conversationKey,
    );
    const decrypted = chatCrypto.decryptMessage(
      userId,
      conversationId,
      messageId,
      role,
      payload,
      conversationKey,
    );
    expect(decrypted).toBe(plaintext);
  });

  test("title encrypt/decrypt roundtrip", () => {
    const title = "My important conversation";
    const payload = chatCrypto.encryptTitle(
      userId,
      conversationId,
      title,
      conversationKey,
    );
    const decrypted = chatCrypto.decryptTitle(
      userId,
      conversationId,
      payload,
      conversationKey,
    );
    expect(decrypted).toBe(title);
  });

  test("AAD binding — different userId throws on message decrypt", () => {
    const plaintext = "bound to user-a";
    const payload = chatCrypto.encryptMessage(
      "a",
      conversationId,
      messageId,
      role,
      plaintext,
      conversationKey,
    );
    expect(() =>
      chatCrypto.decryptMessage(
        "b",
        conversationId,
        messageId,
        role,
        payload,
        conversationKey,
      ),
    ).toThrow();
  });

  test("AAD binding — different messageId throws", () => {
    const plaintext = "bound to m1";
    const payload = chatCrypto.encryptMessage(
      userId,
      conversationId,
      "m1",
      role,
      plaintext,
      conversationKey,
    );
    expect(() =>
      chatCrypto.decryptMessage(
        userId,
        conversationId,
        "m2",
        role,
        payload,
        conversationKey,
      ),
    ).toThrow();
  });

  test("AAD binding — different role throws", () => {
    const plaintext = "bound to user role";
    const payload = chatCrypto.encryptMessage(
      userId,
      conversationId,
      messageId,
      "user",
      plaintext,
      conversationKey,
    );
    expect(() =>
      chatCrypto.decryptMessage(
        userId,
        conversationId,
        messageId,
        "assistant",
        payload,
        conversationKey,
      ),
    ).toThrow();
  });

  test("title AAD binding — different userId throws", () => {
    const title = "bound to user-a";
    const payload = chatCrypto.encryptTitle(
      "a",
      conversationId,
      title,
      conversationKey,
    );
    expect(() =>
      chatCrypto.decryptTitle("b", conversationId, payload, conversationKey),
    ).toThrow();
  });

  test("wrong conversation key throws", () => {
    const plaintext = "key-bound content";
    const ck1 = crypto.randomBytes(32);
    const ck2 = crypto.randomBytes(32);
    const payload = chatCrypto.encryptMessage(
      userId,
      conversationId,
      messageId,
      role,
      plaintext,
      ck1,
    );
    expect(() =>
      chatCrypto.decryptMessage(
        userId,
        conversationId,
        messageId,
        role,
        payload,
        ck2,
      ),
    ).toThrow();
  });

  test("unicode content roundtrip", () => {
    const plaintext = "Hello world! Привет мир! こんにちは世界!";
    const payload = chatCrypto.encryptMessage(
      userId,
      conversationId,
      messageId,
      role,
      plaintext,
      conversationKey,
    );
    const decrypted = chatCrypto.decryptMessage(
      userId,
      conversationId,
      messageId,
      role,
      payload,
      conversationKey,
    );
    expect(decrypted).toBe(plaintext);
  });
});
