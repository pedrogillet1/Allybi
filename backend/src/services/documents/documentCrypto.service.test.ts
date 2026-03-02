import { describe, expect, test } from "@jest/globals";
import crypto from "crypto";
import { EncryptionService } from "../security/encryption.service";
import { DocumentCryptoService } from "./documentCrypto.service";

const enc = new EncryptionService();
const docCrypto = new DocumentCryptoService(enc);
const dk = crypto.randomBytes(32); // document key
const userId = "user-1";
const documentId = "doc-1";

describe("DocumentCryptoService", () => {
  test("filename encrypt/decrypt roundtrip", () => {
    const original = "quarterly-report-2026.pdf";
    const cipher = docCrypto.encryptFilename(userId, documentId, original, dk);
    const plain = docCrypto.decryptFilename(userId, documentId, cipher, dk);
    expect(plain).toBe(original);
  });

  test("extractedText encrypt/decrypt roundtrip", () => {
    const original = "The quick brown fox jumps over the lazy dog.";
    const cipher = docCrypto.encryptExtractedText(userId, documentId, original, dk);
    const plain = docCrypto.decryptExtractedText(userId, documentId, cipher, dk);
    expect(plain).toBe(original);
  });

  test("previewText encrypt/decrypt roundtrip", () => {
    const original = "First 500 characters of the document preview...";
    const cipher = docCrypto.encryptPreviewText(userId, documentId, original, dk);
    const plain = docCrypto.decryptPreviewText(userId, documentId, cipher, dk);
    expect(plain).toBe(original);
  });

  test("renderableContent encrypt/decrypt roundtrip", () => {
    const original = "<div><h1>Title</h1><p>Body paragraph with <b>bold</b> text.</p></div>";
    const cipher = docCrypto.encryptRenderableContent(userId, documentId, original, dk);
    const plain = docCrypto.decryptRenderableContent(userId, documentId, cipher, dk);
    expect(plain).toBe(original);
  });

  test("displayTitle encrypt/decrypt roundtrip", () => {
    const original = "Q1 2026 Financial Summary";
    const cipher = docCrypto.encryptDisplayTitle(userId, documentId, original, dk);
    const plain = docCrypto.decryptDisplayTitle(userId, documentId, cipher, dk);
    expect(plain).toBe(original);
  });

  test("chunkText encrypt/decrypt roundtrip", () => {
    const chunkId = "chunk-42";
    const original = "This is the text content of chunk 42 within the document.";
    const cipher = docCrypto.encryptChunkText(userId, documentId, chunkId, original, dk);
    const plain = docCrypto.decryptChunkText(userId, documentId, chunkId, cipher, dk);
    expect(plain).toBe(original);
  });

  test("AAD binding — different userId throws on decrypt", () => {
    const cipher = docCrypto.encryptFilename("user-a", documentId, "secret.pdf", dk);
    expect(() =>
      docCrypto.decryptFilename("user-b", documentId, cipher, dk),
    ).toThrow();
  });

  test("AAD binding — different documentId throws on decrypt", () => {
    const cipher = docCrypto.encryptFilename(userId, "doc-d1", "secret.pdf", dk);
    expect(() =>
      docCrypto.decryptFilename(userId, "doc-d2", cipher, dk),
    ).toThrow();
  });

  test("wrong key throws on decrypt", () => {
    const dk2 = crypto.randomBytes(32);
    const cipher = docCrypto.encryptFilename(userId, documentId, "secret.pdf", dk);
    expect(() =>
      docCrypto.decryptFilename(userId, documentId, cipher, dk2),
    ).toThrow();
  });
});
