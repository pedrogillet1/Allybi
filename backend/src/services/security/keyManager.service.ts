import { EncryptionService } from "./encryption.service";
import { KeyProvider, TenantKeyEnvelope } from "./crypto.types";

export interface IKeyManager {
  provider: KeyProvider;
  generateTenantKey(): Promise<{
    plaintextKey: Buffer;
    envelope: TenantKeyEnvelope;
  }>;
  decryptTenantKey(envelope: TenantKeyEnvelope): Promise<Buffer>;
}

export class LocalKeyManager implements IKeyManager {
  provider: KeyProvider = "local";
  private masterKey: Buffer;
  private enc: EncryptionService;

  constructor(enc: EncryptionService) {
    this.enc = enc;
    const mkB64 = process.env.KODA_MASTER_KEY_BASE64 || "";
    this.masterKey = Buffer.from(mkB64, "base64");
    if (this.masterKey.length !== 32) {
      throw new Error("KODA_MASTER_KEY_BASE64 must be a 32-byte base64 value");
    }
  }

  async generateTenantKey() {
    const plaintextKey = this.enc.randomKey32();
    const wrappedJson = this.enc.encryptStringToJson(
      plaintextKey.toString("base64"),
      this.masterKey,
      "tenantKey",
    );
    return {
      plaintextKey,
      envelope: {
        provider: "local" as const,
        encryptedKey: wrappedJson,
        meta: { v: 1 },
      },
    };
  }

  async decryptTenantKey(envelope: TenantKeyEnvelope): Promise<Buffer> {
    const b64 = this.enc.decryptStringFromJson(
      envelope.encryptedKey,
      this.masterKey,
      "tenantKey",
    );
    return Buffer.from(b64, "base64");
  }
}

export function buildKeyManager(enc: EncryptionService): IKeyManager {
  return new LocalKeyManager(enc);
}
