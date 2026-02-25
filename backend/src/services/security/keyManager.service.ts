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

type KmsEncryptResponse = {
  ciphertext?: Uint8Array | Buffer | null;
};

type KmsDecryptResponse = {
  plaintext?: Uint8Array | Buffer | null;
};

type KmsClientShape = {
  cryptoKeyPath: (
    projectId: string,
    location: string,
    keyRing: string,
    key: string,
  ) => string;
  encrypt: (input: {
    name: string;
    plaintext: Uint8Array | Buffer;
  }) => Promise<[KmsEncryptResponse]>;
  decrypt: (input: {
    name: string;
    ciphertext: Uint8Array | Buffer;
  }) => Promise<[KmsDecryptResponse]>;
};

function toBool(value: unknown): boolean {
  return (
    String(value || "")
      .trim()
      .toLowerCase() === "true"
  );
}

export class GcpKmsKeyManager implements IKeyManager {
  provider: KeyProvider = "gcp_kms";
  private client: KmsClientShape;
  private keyName: string;
  private enc: EncryptionService;

  constructor(enc: EncryptionService) {
    this.enc = enc;
    const projectId = String(process.env.KODA_KMS_PROJECT_ID || "").trim();
    const location = String(process.env.KODA_KMS_LOCATION || "").trim();
    const keyRing = String(process.env.KODA_KMS_KEY_RING || "").trim();
    const cryptoKey = String(process.env.KODA_KMS_KEY || "").trim();

    if (!projectId || !location || !keyRing || !cryptoKey) {
      throw new Error(
        "GCP KMS configuration missing. Set KODA_KMS_PROJECT_ID, KODA_KMS_LOCATION, KODA_KMS_KEY_RING, and KODA_KMS_KEY.",
      );
    }

    let KeyManagementServiceClient: any;
    try {
      // Lazy require keeps local/dev installs working without forcing KMS package.
      ({ KeyManagementServiceClient } = require("@google-cloud/kms"));
    } catch {
      throw new Error(
        "Missing @google-cloud/kms package. Install it to enable KMS-backed tenant keys.",
      );
    }

    const client = new KeyManagementServiceClient();
    this.client = client as KmsClientShape;
    this.keyName = this.client.cryptoKeyPath(
      projectId,
      location,
      keyRing,
      cryptoKey,
    );
  }

  async generateTenantKey() {
    const plaintextKey = this.enc.randomKey32();
    const [response] = await this.client.encrypt({
      name: this.keyName,
      plaintext: plaintextKey,
    });
    const ciphertext = Buffer.from(response?.ciphertext || []).toString(
      "base64",
    );
    if (!ciphertext) {
      throw new Error(
        "GCP KMS failed to return ciphertext while wrapping key.",
      );
    }

    return {
      plaintextKey,
      envelope: {
        provider: this.provider,
        encryptedKey: ciphertext,
        meta: { v: 1, keyName: this.keyName },
      },
    };
  }

  async decryptTenantKey(envelope: TenantKeyEnvelope): Promise<Buffer> {
    const keyNameFromMeta =
      typeof envelope.meta?.keyName === "string"
        ? envelope.meta.keyName
        : this.keyName;

    const [response] = await this.client.decrypt({
      name: keyNameFromMeta,
      ciphertext: Buffer.from(envelope.encryptedKey, "base64"),
    });
    const plaintext = Buffer.from(response?.plaintext || []);
    if (plaintext.length !== 32) {
      throw new Error("Invalid tenant key length returned from GCP KMS.");
    }
    return plaintext;
  }
}

export function buildKeyManager(enc: EncryptionService): IKeyManager {
  if (toBool(process.env.KODA_USE_GCP_KMS)) {
    return new GcpKmsKeyManager(enc);
  }
  return new LocalKeyManager(enc);
}
