// src/utils/hashing.ts
import crypto from "crypto";

/**
 * hashing.ts (Koda, production-safe)
 * ---------------------------------
 * Central hashing utilities for:
 *  - stable identifiers (content hashes, cache keys)
 *  - security hashes (password + tokens) when paired with proper salt/pepper logic
 *  - integrity checks (sha256)
 *
 * Design:
 *  - Keep this file deterministic and side-effect free.
 *  - Do NOT log secrets or raw inputs.
 *  - Prefer explicit algorithms and encodings.
 */

export type HashAlgo = "sha256" | "sha512";

export interface HashOptions {
  algo?: HashAlgo; // default sha256
  encoding?: "hex" | "base64"; // default hex
  /**
   * If provided, the output is truncated to this many chars (useful for IDs).
   * Truncation happens AFTER encoding.
   */
  truncateTo?: number;
}

const DEFAULTS: Required<Pick<HashOptions, "algo" | "encoding">> = {
  algo: "sha256",
  encoding: "hex",
};

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function safeTruncate(s: string, truncateTo?: number) {
  if (!truncateTo) return s;
  const n = clampInt(truncateTo, 4, 256);
  return s.slice(0, n);
}

/**
 * Hash text/buffer with sha256/sha512.
 */
export function hash(input: string | Buffer, opts: HashOptions = {}): string {
  const algo = opts.algo || DEFAULTS.algo;
  const encoding = opts.encoding || DEFAULTS.encoding;

  const h = crypto.createHash(algo);
  h.update(input);
  const out = h.digest(encoding);

  return safeTruncate(out, opts.truncateTo);
}

/**
 * Convenience: sha256 hex.
 */
export function sha256(input: string | Buffer, truncateTo?: number): string {
  return hash(input, { algo: "sha256", encoding: "hex", truncateTo });
}

/**
 * Convenience: sha512 hex.
 */
export function sha512(input: string | Buffer, truncateTo?: number): string {
  return hash(input, { algo: "sha512", encoding: "hex", truncateTo });
}

/**
 * HMAC (useful for request signing, token hashing with a secret).
 * Never store raw tokens; store HMAC(token).
 */
export function hmacSha256(
  secret: string,
  message: string,
  opts: { encoding?: "hex" | "base64"; truncateTo?: number } = {},
): string {
  const encoding = opts.encoding || "hex";
  const h = crypto.createHmac("sha256", secret);
  h.update(message);
  const out = h.digest(encoding);
  return safeTruncate(out, opts.truncateTo);
}

/**
 * Stable cache key for text + optional salt.
 * - Uses sha256(model:salt:text)
 * - Truncates to 32 chars by default for filesystem friendliness.
 */
export function makeCacheKey(params: {
  text: string;
  salt?: string;
  model?: string;
  truncateTo?: number;
}): string {
  const model = params.model || "default";
  const salt = params.salt || "";
  const text = params.text || "";
  const raw = `${model}:${salt}:${text}`;
  return sha256(raw, params.truncateTo ?? 32);
}

/**
 * Compare two hashes in constant time to avoid timing leaks.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(String(a), "hex");
    const bb = Buffer.from(String(b), "hex");
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export default {
  hash,
  sha256,
  sha512,
  hmacSha256,
  makeCacheKey,
  timingSafeEqualHex,
};
