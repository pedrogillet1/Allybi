export type AesGcmEncryptedPayloadV1 = {
  v: 1;
  alg: "AES-256-GCM";
  ivB64: string;
  tagB64: string;
  ctB64: string;
  aadB64?: string;
};

export type EncryptedPayload = AesGcmEncryptedPayloadV1;

export type KeyProvider = "local";

export type TenantKeyEnvelope = {
  provider: KeyProvider;
  encryptedKey: string;
  meta?: Record<string, any>;
};
