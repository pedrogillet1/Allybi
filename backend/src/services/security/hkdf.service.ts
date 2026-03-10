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
 *
 * @param salt - Random salt for strongest derivation. When omitted (legacy callers),
 *               an empty buffer is used — this is safe ONLY when `info` is globally
 *               unique per derivation (e.g., "download:{userId}:{documentId}").
 *               New callers SHOULD use generateHkdfSalt() and store the salt.
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

/**
 * HKDF-SHA256 with mandatory salt — use this for new encryption workflows.
 */
export function hkdf32WithSalt(masterKey: Buffer, info: string, salt: Buffer): Buffer {
  if (salt.length < 16) throw new Error("hkdf32WithSalt requires at least 16-byte salt");
  return hkdf32(masterKey, info, salt);
}
