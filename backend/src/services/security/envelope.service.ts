import { EncryptionService } from "./encryption.service";

/**
 * Wrap/unwrap "record keys" (conversation keys, document keys) using the tenant key.
 * This avoids calling KMS for every message/chunk.
 */
export class EnvelopeService {
  constructor(private enc: EncryptionService) {}

  wrapRecordKey(recordKey: Buffer, tenantKey: Buffer, aad: string): string {
    return this.enc.encryptStringToJson(
      recordKey.toString("base64"),
      tenantKey,
      aad,
    );
  }

  unwrapRecordKey(wrappedJson: string, tenantKey: Buffer, aad: string): Buffer {
    const b64 = this.enc.decryptStringFromJson(wrappedJson, tenantKey, aad);
    return Buffer.from(b64, "base64");
  }
}
