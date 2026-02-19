import crypto from "crypto";

/**
 * HKDF-SHA256 derive 32-byte subkeys from a master key.
 * Prevents reuse of the same key for different purposes (messages vs titles vs doc text).
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
