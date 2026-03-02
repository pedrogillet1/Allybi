import { describe, expect, test, jest, beforeEach } from "@jest/globals";
import crypto from "crypto";
import { EncryptionService } from "./encryption.service";
import { LocalKeyManager } from "./keyManager.service";

const validMasterKey = crypto.randomBytes(32).toString("base64");

describe("LocalKeyManager", () => {
  beforeEach(() => {
    process.env.KODA_MASTER_KEY_BASE64 = validMasterKey;
  });

  test("generate + decrypt roundtrip returns the same plaintext key", async () => {
    const enc = new EncryptionService();
    const km = new LocalKeyManager(enc);

    const { plaintextKey, envelope } = await km.generateTenantKey();
    const decrypted = await km.decryptTenantKey(envelope);

    expect(decrypted).toEqual(plaintextKey);
    expect(decrypted.length).toBe(32);
  });

  test("envelope has provider 'local' and meta.v = 1", async () => {
    const enc = new EncryptionService();
    const km = new LocalKeyManager(enc);

    const { envelope } = await km.generateTenantKey();

    expect(envelope.provider).toBe("local");
    expect(envelope.meta).toEqual({ v: 1 });
  });

  test("constructor throws when KODA_MASTER_KEY_BASE64 is missing", () => {
    delete process.env.KODA_MASTER_KEY_BASE64;
    const enc = new EncryptionService();

    expect(() => new LocalKeyManager(enc)).toThrow(
      "KODA_MASTER_KEY_BASE64 must be a 32-byte base64 value",
    );
  });

  test("constructor throws when KODA_MASTER_KEY_BASE64 is not 32 bytes", () => {
    process.env.KODA_MASTER_KEY_BASE64 = crypto
      .randomBytes(16)
      .toString("base64");
    const enc = new EncryptionService();

    expect(() => new LocalKeyManager(enc)).toThrow(
      "KODA_MASTER_KEY_BASE64 must be a 32-byte base64 value",
    );
  });
});
