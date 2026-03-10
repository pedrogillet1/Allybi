import crypto from "crypto";
import { EncryptedPayload } from "./crypto.types";

const ALG = "aes-256-gcm";
const IV_LEN = 12;

const b64 = (buf: Buffer) => buf.toString("base64");
const unb64 = (s: string) => Buffer.from(s, "base64");

export class EncryptionService {
  randomKey32(): Buffer {
    return crypto.randomBytes(32);
  }

  encryptStringToJson(plaintext: string, key: Buffer, aad: string): string {
    const payload = this.encryptBuffer(
      Buffer.from(plaintext, "utf8"),
      key,
      aad,
    );
    return JSON.stringify(payload);
  }

  decryptStringFromJson(
    payloadJson: string,
    key: Buffer,
    aad: string,
  ): string {
    const payload = JSON.parse(payloadJson) as EncryptedPayload;
    const pt = this.decryptBuffer(payload, key, aad);
    return pt.toString("utf8");
  }

  encryptJsonToJson(obj: unknown, key: Buffer, aad: string): string {
    return this.encryptStringToJson(JSON.stringify(obj), key, aad);
  }

  decryptJsonFromJson<T>(payloadJson: string, key: Buffer, aad: string): T {
    const s = this.decryptStringFromJson(payloadJson, key, aad);
    return JSON.parse(s) as T;
  }

  encryptBuffer(
    plaintext: Buffer,
    key: Buffer,
    aad: string,
  ): EncryptedPayload {
    if (key.length !== 32) throw new Error("AES-256-GCM key must be 32 bytes");
    const iv = crypto.randomBytes(IV_LEN);
    const cipher = crypto.createCipheriv(ALG, key, iv);

    const aadBuf = Buffer.from(aad, "utf8");
    cipher.setAAD(aadBuf);

    const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      v: 1,
      alg: "AES-256-GCM",
      ivB64: b64(iv),
      tagB64: b64(tag),
      ctB64: b64(ct),
      aadB64: b64(aadBuf),
    };
  }

  decryptBuffer(payload: EncryptedPayload, key: Buffer, aad: string): Buffer {
    if (key.length !== 32) throw new Error("AES-256-GCM key must be 32 bytes");
    if (payload.v !== 1 || payload.alg !== "AES-256-GCM")
      throw new Error("Unsupported payload");

    const iv = unb64(payload.ivB64);
    const tag = unb64(payload.tagB64);
    const ct = unb64(payload.ctB64);

    const decipher = crypto.createDecipheriv(ALG, key, iv);
    const aadBuf = Buffer.from(aad, "utf8");
    decipher.setAAD(aadBuf);

    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  }
}
