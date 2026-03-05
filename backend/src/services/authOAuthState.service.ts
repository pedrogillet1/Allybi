import crypto from "crypto";

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const MAX_STATE_LENGTH = 4096;

export interface GoogleOAuthStatePayload {
  v: 1;
  provider: "google_auth";
  nonce: string;
  iat: number;
}

export type GoogleOAuthStateVerification =
  | { ok: true; payload: GoogleOAuthStatePayload }
  | { ok: false; reason: string };

interface IssueGoogleOAuthStateInput {
  secret: string;
  nowMs?: number;
  nonce?: string;
}

interface VerifyGoogleOAuthStateInput {
  state: string;
  secret: string;
  nowMs?: number;
  ttlMs?: number;
}

function base64urlEncode(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function base64urlDecode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function signPayload(encodedPayload: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");
}

export function timingSafeEqualString(a: string, b: string): boolean {
  const aBuf = Buffer.from(String(a || ""), "utf8");
  const bBuf = Buffer.from(String(b || ""), "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function issueGoogleOAuthState(
  input: IssueGoogleOAuthStateInput,
): string {
  const secret = String(input.secret || "").trim();
  if (!secret) throw new Error("OAuth state secret is required.");

  const nowMs = Number.isFinite(input.nowMs) ? Number(input.nowMs) : Date.now();
  const nonce = String(input.nonce || crypto.randomUUID()).trim();
  if (!nonce) throw new Error("OAuth state nonce is required.");

  const payload: GoogleOAuthStatePayload = {
    v: 1,
    provider: "google_auth",
    nonce,
    iat: Math.floor(nowMs / 1000),
  };

  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function verifyGoogleOAuthState(
  input: VerifyGoogleOAuthStateInput,
): GoogleOAuthStateVerification {
  const secret = String(input.secret || "").trim();
  if (!secret) return { ok: false, reason: "STATE_SECRET_MISSING" };

  const state = String(input.state || "").trim();
  if (!state || state.length > MAX_STATE_LENGTH) {
    return { ok: false, reason: "STATE_INVALID_FORMAT" };
  }

  const parts = state.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, reason: "STATE_INVALID_FORMAT" };
  }

  const [encodedPayload, providedSignature] = parts;
  const expectedSignature = signPayload(encodedPayload, secret);
  if (!timingSafeEqualString(providedSignature, expectedSignature)) {
    return { ok: false, reason: "STATE_SIGNATURE_MISMATCH" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(base64urlDecode(encodedPayload).toString("utf8"));
  } catch {
    return { ok: false, reason: "STATE_INVALID_PAYLOAD" };
  }

  const payload = parsed as Partial<GoogleOAuthStatePayload>;
  if (
    payload.v !== 1 ||
    payload.provider !== "google_auth" ||
    typeof payload.nonce !== "string" ||
    !payload.nonce.trim() ||
    !Number.isFinite(payload.iat)
  ) {
    return { ok: false, reason: "STATE_INVALID_PAYLOAD" };
  }

  const nowMs = Number.isFinite(input.nowMs) ? Number(input.nowMs) : Date.now();
  const ttlMs =
    Number.isFinite(input.ttlMs) && Number(input.ttlMs) > 0
      ? Number(input.ttlMs)
      : DEFAULT_TTL_MS;
  const issuedAtSeconds = Number(payload.iat);
  const ageMs = nowMs - issuedAtSeconds * 1000;
  if (ageMs < 0 || ageMs > ttlMs) {
    return { ok: false, reason: "STATE_EXPIRED" };
  }

  return { ok: true, payload: payload as GoogleOAuthStatePayload };
}
