import { createHmac, timingSafeEqual } from "crypto";

import type { ConnectorProvider } from "./connectorsRegistry";

type EmailProvider = Extract<ConnectorProvider, "gmail" | "outlook">;

export interface EmailSendConfirmationPayload {
  v: number;
  t: "email_send";
  userId: string;
  provider: EmailProvider;
  to: string;
  subject: string;
  body: string;
  attachmentDocumentIds: string[];
  iat: number;
  exp: number;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(data: string): Buffer {
  const normalized = String(data || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const pad =
    normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, "base64");
}

function emailSendSecret(): string {
  const s =
    process.env.CONNECTOR_ACTION_SECRET ||
    process.env.KODA_ACTION_SECRET ||
    process.env.JWT_ACCESS_SECRET ||
    process.env.ENCRYPTION_KEY ||
    "";
  if (!s.trim()) {
    throw new Error(
      "Missing CONNECTOR_ACTION_SECRET (or KODA_ACTION_SECRET / JWT_ACCESS_SECRET / ENCRYPTION_KEY).",
    );
  }
  return s;
}

function safePayload(input: any): EmailSendConfirmationPayload {
  if (asString(input?.t) !== "email_send") {
    throw new Error("EMAIL_SEND confirmation payload type is invalid.");
  }
  const provider = asString(input?.provider).toLowerCase();
  if (provider !== "gmail" && provider !== "outlook") {
    throw new Error("EMAIL_SEND confirmation payload provider is invalid.");
  }

  const to = asString(input?.to);
  if (!to)
    throw new Error("EMAIL_SEND confirmation payload recipient is empty.");

  const iat = Number(input?.iat);
  const exp = Number(input?.exp);
  if (!Number.isFinite(iat) || !Number.isFinite(exp) || exp <= iat) {
    throw new Error("EMAIL_SEND confirmation payload timing is invalid.");
  }

  const ids = Array.isArray(input?.attachmentDocumentIds)
    ? input.attachmentDocumentIds
        .filter((x: unknown) => typeof x === "string" && x.trim())
        .map((x: string) => x.trim())
    : [];

  return {
    v: Number(input?.v || 0),
    t: "email_send",
    userId: asString(input?.userId),
    provider,
    to,
    subject: typeof input?.subject === "string" ? input.subject : "",
    body: typeof input?.body === "string" ? input.body : "",
    attachmentDocumentIds: Array.from(new Set(ids)),
    iat,
    exp,
  };
}

export function signEmailSendConfirmationToken(
  payload: EmailSendConfirmationPayload,
): string {
  const normalized = safePayload(payload);
  const encoded = base64UrlEncode(JSON.stringify(normalized));
  const sig = createHmac("sha256", emailSendSecret()).update(encoded).digest();
  const sigUrl = base64UrlEncode(sig);
  return `${encoded}.${sigUrl}`;
}

export function verifyEmailSendConfirmationToken(
  token: string,
): EmailSendConfirmationPayload {
  const parts = String(token || "").split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("EMAIL_SEND confirmation token format is invalid.");
  }

  const [encoded, providedSigB64] = parts;
  const expectedSig = createHmac("sha256", emailSendSecret())
    .update(encoded)
    .digest();
  const providedSig = base64UrlDecode(providedSigB64);

  if (
    providedSig.length !== expectedSig.length ||
    !timingSafeEqual(providedSig, expectedSig)
  ) {
    throw new Error("EMAIL_SEND confirmation token signature mismatch.");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(base64UrlDecode(encoded).toString("utf8"));
  } catch {
    throw new Error("EMAIL_SEND confirmation payload is invalid JSON.");
  }

  const normalized = safePayload(payload);
  if (normalized.t !== "email_send") {
    throw new Error("EMAIL_SEND confirmation token type is invalid.");
  }

  const now = Date.now();
  if (normalized.exp <= now) {
    throw new Error("EMAIL_SEND confirmation token expired.");
  }

  if (normalized.iat > now + 30_000) {
    throw new Error("EMAIL_SEND confirmation token iat is in the future.");
  }

  // Hard upper bound to avoid stale replays if exp is misconfigured.
  if (normalized.exp - normalized.iat > 30 * 60 * 1000) {
    throw new Error("EMAIL_SEND confirmation token ttl is too long.");
  }

  return normalized;
}
