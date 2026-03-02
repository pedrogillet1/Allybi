import crypto from "crypto";
import { describe, expect, test } from "@jest/globals";

import { EncryptionService } from "./encryption.service";

const svc = new EncryptionService();

describe("EncryptionService", () => {
  describe("randomKey32", () => {
    test("returns a 32-byte buffer", () => {
      const key = svc.randomKey32();
      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.length).toBe(32);
    });
  });

  describe("encryptStringToJson / decryptStringFromJson", () => {
    test("roundtrip preserves plaintext", () => {
      const key = svc.randomKey32();
      const plaintext = "hello, world!";
      const json = svc.encryptStringToJson(plaintext, key);
      const recovered = svc.decryptStringFromJson(json, key);
      expect(recovered).toBe(plaintext);
    });

    test("wrong key fails decryption", () => {
      const key = svc.randomKey32();
      const wrongKey = svc.randomKey32();
      const json = svc.encryptStringToJson("secret", key);
      expect(() => svc.decryptStringFromJson(json, wrongKey)).toThrow();
    });

    test("tampered ciphertext fails", () => {
      const key = svc.randomKey32();
      const json = svc.encryptStringToJson("secret", key);
      const payload = JSON.parse(json);
      // Flip a character in the ciphertext base64
      const ct = Buffer.from(payload.ctB64, "base64");
      ct[0] ^= 0xff;
      payload.ctB64 = ct.toString("base64");
      expect(() =>
        svc.decryptStringFromJson(JSON.stringify(payload), key),
      ).toThrow();
    });

    test("AAD mismatch fails", () => {
      const key = svc.randomKey32();
      const json = svc.encryptStringToJson("secret", key, "a");
      expect(() => svc.decryptStringFromJson(json, key, "b")).toThrow();
    });
  });

  describe("key length validation", () => {
    test("16-byte key throws for encrypt", () => {
      const shortKey = crypto.randomBytes(16);
      expect(() =>
        svc.encryptStringToJson("hello", shortKey),
      ).toThrow("AES-256-GCM key must be 32 bytes");
    });

    test("16-byte key throws for decrypt", () => {
      const key = svc.randomKey32();
      const json = svc.encryptStringToJson("hello", key);
      const shortKey = crypto.randomBytes(16);
      expect(() =>
        svc.decryptStringFromJson(json, shortKey),
      ).toThrow("AES-256-GCM key must be 32 bytes");
    });
  });

  describe("encryptJsonToJson / decryptJsonFromJson", () => {
    test("roundtrip preserves object", () => {
      const key = svc.randomKey32();
      const obj = { foo: "bar", n: 42, nested: { arr: [1, 2, 3] } };
      const json = svc.encryptJsonToJson(obj, key);
      const recovered = svc.decryptJsonFromJson<typeof obj>(json, key);
      expect(recovered).toEqual(obj);
    });
  });

  describe("encryptBuffer / decryptBuffer", () => {
    test("roundtrip preserves binary data", () => {
      const key = svc.randomKey32();
      const data = crypto.randomBytes(256);
      const payload = svc.encryptBuffer(data, key);
      const recovered = svc.decryptBuffer(payload, key);
      expect(recovered.equals(data)).toBe(true);
    });

    test("roundtrip with AAD", () => {
      const key = svc.randomKey32();
      const data = Buffer.from("some data", "utf8");
      const aad = "context-string";
      const payload = svc.encryptBuffer(data, key, aad);
      const recovered = svc.decryptBuffer(payload, key, aad);
      expect(recovered.equals(data)).toBe(true);
    });
  });
});
