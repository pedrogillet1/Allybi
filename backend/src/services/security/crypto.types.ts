export type AesGcmEncryptedPayloadV1 = {
  v: 1;
  alg: "AES-256-GCM";
  ivB64: string;
  tagB64: string;
  ctB64: string;
  aadB64?: string;
  kv?: number;
};

export type EncryptedPayload = AesGcmEncryptedPayloadV1;

export type KeyProvider = "local" | "gcp_kms";

export type TenantKeyEnvelope = {
  provider: KeyProvider;
  encryptedKey: string;
  meta?: Record<string, any>;
};
