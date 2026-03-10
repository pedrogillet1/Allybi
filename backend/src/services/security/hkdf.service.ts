import crypto from "crypto";

const HKDF_SALT_LEN = 16;

/**
 * Generate a random 16-byte salt for HKDF key derivation.
 * Store this salt alongside the derived key so you can re-derive later.
 */
export function generateHkdfSalt(): Buffer {
  return crypto.randomBytes(HKDF_SALT_LEN);
}

/**
 * HKDF-SHA256 derive 32-byte subkeys from a master key.
 * Prevents reuse of the same key for different purposes (messages vs titles vs doc text).
 *
 * @param salt - REQUIRED for new keys. Pass stored salt for re-derivation.
 *               Empty buffer is accepted for backward compat with legacy keys.
 */
export function hkdf32(masterKey: Buffer, info: string, salt?: Buffer): Buffer {
  if (masterKey.length !== 32)
    throw new Error("hkdf32 masterKey must be 32 bytes");
  const out = crypto.hkdfSync(
    "sha256",
    masterKey,
    salt ?? Buffer.alloc(0),
    Buffer.from(info, "utf8"),
    32,
  );
  return Buffer.from(out);
}
