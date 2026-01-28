import { EncryptionService } from "./encryption.service";
import { KeyProvider, TenantKeyEnvelope } from "./crypto.types";

export interface IKeyManager {
  provider: KeyProvider;
  generateTenantKey(): Promise<{ plaintextKey: Buffer; envelope: TenantKeyEnvelope }>;
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
    const b64 = this.enc.decryptStringFromJson(envelope.encryptedKey, this.masterKey, "tenantKey");
    return Buffer.from(b64, "base64");
  }
}

export class AwsKmsKeyManager implements IKeyManager {
  provider: KeyProvider = "aws_kms";
  private kmsKeyId: string;

  constructor() {
    const kmsKeyId = process.env.KODA_KMS_KEY_ID || "";
    if (!kmsKeyId) throw new Error("KODA_KMS_KEY_ID required for aws_kms");
    this.kmsKeyId = kmsKeyId;
  }

  async generateTenantKey() {
    // @ts-ignore - @aws-sdk/client-kms is only installed in production
    const { KMSClient, GenerateDataKeyCommand } = await import("@aws-sdk/client-kms");
    const region = process.env.AWS_REGION || "us-east-1";
    const client = new KMSClient({ region });

    const res = await client.send(
      new GenerateDataKeyCommand({ KeyId: this.kmsKeyId, KeySpec: "AES_256" }),
    );
    if (!res.Plaintext || !res.CiphertextBlob) throw new Error("KMS GenerateDataKey failed");

    const plaintextKey = Buffer.from(res.Plaintext);
    const encryptedKey = Buffer.from(res.CiphertextBlob).toString("base64");

    return {
      plaintextKey,
      envelope: {
        provider: "aws_kms" as const,
        encryptedKey,
        meta: { kmsKeyId: this.kmsKeyId },
      },
    };
  }

  async decryptTenantKey(envelope: TenantKeyEnvelope): Promise<Buffer> {
    // @ts-ignore - @aws-sdk/client-kms is only installed in production
    const { KMSClient, DecryptCommand } = await import("@aws-sdk/client-kms");
    const region = process.env.AWS_REGION || "us-east-1";
    const client = new KMSClient({ region });

    const res = await client.send(
      new DecryptCommand({
        CiphertextBlob: Buffer.from(envelope.encryptedKey, "base64"),
      }),
    );
    if (!res.Plaintext) throw new Error("KMS Decrypt failed");
    return Buffer.from(res.Plaintext);
  }
}

export function buildKeyManager(enc: EncryptionService): IKeyManager {
  const provider = (process.env.KODA_KEY_PROVIDER || "local") as KeyProvider;
  if (provider === "aws_kms") return new AwsKmsKeyManager();
  return new LocalKeyManager(enc);
}
