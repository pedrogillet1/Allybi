import { describe, expect, test } from "@jest/globals";
import crypto from "crypto";
import { EncryptionService } from "../security/encryption.service";
import { FolderCryptoService } from "./folderCrypto.service";

const enc = new EncryptionService();
const folderCrypto = new FolderCryptoService(enc);
const fk = crypto.randomBytes(32); // folder key
const userId = "user-1";
const folderId = "folder-1";

describe("FolderCryptoService", () => {
  test("name encrypt/decrypt roundtrip", () => {
    const original = "Project Alpha Documents";
    const cipher = folderCrypto.encryptName(userId, folderId, original, fk);
    const plain = folderCrypto.decryptName(userId, folderId, cipher, fk);
    expect(plain).toBe(original);
  });

  test("description encrypt/decrypt roundtrip", () => {
    const original = "Contains all documents related to Project Alpha launch.";
    const cipher = folderCrypto.encryptDescription(userId, folderId, original, fk);
    const plain = folderCrypto.decryptDescription(userId, folderId, cipher, fk);
    expect(plain).toBe(original);
  });

  test("AAD binding — different userId throws on name decrypt", () => {
    const cipher = folderCrypto.encryptName("a", folderId, "secret folder", fk);
    expect(() =>
      folderCrypto.decryptName("b", folderId, cipher, fk),
    ).toThrow();
  });

  test("AAD binding — different folderId throws", () => {
    const cipher = folderCrypto.encryptName(userId, "f1", "secret folder", fk);
    expect(() =>
      folderCrypto.decryptName(userId, "f2", cipher, fk),
    ).toThrow();
  });

  test("wrong folder key throws", () => {
    const fk2 = crypto.randomBytes(32);
    const cipher = folderCrypto.encryptName(userId, folderId, "secret folder", fk);
    expect(() =>
      folderCrypto.decryptName(userId, folderId, cipher, fk2),
    ).toThrow();
  });
});
