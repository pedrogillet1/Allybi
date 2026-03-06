import crypto from "crypto";
import jwt from "jsonwebtoken";

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";
const APPLE_JWKS_TTL_MS = 5 * 60 * 1000;

interface AppleJwk extends crypto.JsonWebKey {
  kty: string;
  kid: string;
  use?: string;
  alg?: string;
  n?: string;
  e?: string;
}

interface AppleJwksResponse {
  keys: AppleJwk[];
}

export interface AppleIdTokenClaims extends jwt.JwtPayload {
  iss: string;
  aud: string | string[];
  sub: string;
  email?: string;
  nonce?: string;
}

let jwksCache: { fetchedAtMs: number; keys: AppleJwk[] } | null = null;

function timingSafeEqualString(a: string, b: string): boolean {
  const aBuf = Buffer.from(String(a || ""), "utf8");
  const bBuf = Buffer.from(String(b || ""), "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

async function fetchAppleJwks(fetchImpl: typeof fetch): Promise<AppleJwk[]> {
  if (
    jwksCache &&
    Date.now() - jwksCache.fetchedAtMs < APPLE_JWKS_TTL_MS &&
    jwksCache.keys.length > 0
  ) {
    return jwksCache.keys;
  }

  const response = await fetchImpl(APPLE_JWKS_URL, { method: "GET" });
  if (!response.ok) {
    throw new Error("Apple JWKS fetch failed");
  }

  const json = (await response.json()) as Partial<AppleJwksResponse>;
  const keys = Array.isArray(json.keys) ? json.keys : [];
  if (keys.length === 0) {
    throw new Error("Apple JWKS is empty");
  }

  jwksCache = { fetchedAtMs: Date.now(), keys };
  return keys;
}

function selectAppleJwk(keys: AppleJwk[], kid: string): AppleJwk | null {
  for (const key of keys) {
    if (
      key &&
      key.kid === kid &&
      key.kty === "RSA" &&
      (!key.use || key.use === "sig")
    ) {
      return key;
    }
  }
  return null;
}

export async function verifyAppleIdToken(input: {
  idToken: string;
  clientId: string;
  expectedNonce: string;
  nowMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<AppleIdTokenClaims> {
  const idToken = String(input.idToken || "").trim();
  const clientId = String(input.clientId || "").trim();
  const expectedNonce = String(input.expectedNonce || "").trim();
  const fetchImpl = input.fetchImpl || fetch;

  if (!idToken || !clientId || !expectedNonce) {
    throw new Error("Apple token verification input is invalid");
  }

  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded || typeof decoded === "string" || !decoded.header) {
    throw new Error("Apple id_token is malformed");
  }

  if (decoded.header.alg !== "RS256" || !decoded.header.kid) {
    throw new Error("Apple id_token header is invalid");
  }

  const jwks = await fetchAppleJwks(fetchImpl);
  const jwk = selectAppleJwk(jwks, decoded.header.kid);
  if (!jwk) {
    throw new Error("Apple signing key not found");
  }

  const publicKey = crypto.createPublicKey({
    key: jwk,
    format: "jwk",
  });

  let claims: AppleIdTokenClaims;
  try {
    claims = jwt.verify(idToken, publicKey, {
      algorithms: ["RS256"],
      issuer: APPLE_ISSUER,
      audience: clientId,
      clockTolerance: 5,
    }) as AppleIdTokenClaims;
  } catch {
    throw new Error("Apple id_token verification failed");
  }

  if (!claims || typeof claims.sub !== "string" || !claims.sub.trim()) {
    throw new Error("Apple id_token subject is missing");
  }

  if (typeof claims.nonce !== "string" || !claims.nonce.trim()) {
    throw new Error("Apple id_token nonce is missing");
  }

  if (!timingSafeEqualString(claims.nonce, expectedNonce)) {
    throw new Error("Apple id_token nonce mismatch");
  }

  if (!Number.isFinite(claims.iat)) {
    throw new Error("Apple id_token iat is invalid");
  }

  const nowMs = Number.isFinite(input.nowMs) ? Number(input.nowMs) : Date.now();
  const iatMs = Number(claims.iat) * 1000;
  if (iatMs > nowMs + 60_000) {
    throw new Error("Apple id_token iat is in the future");
  }

  return claims;
}

export function resetAppleJwksCacheForTests(): void {
  jwksCache = null;
}
