import { createHash, createHmac, timingSafeEqual } from "crypto";

export interface OAuthCompletionPayload {
  type: "koda_oauth_done";
  provider: string;
  ok: boolean;
  t: number;
  sig: string | null;
}

interface OAuthCompletionPayloadLike {
  type?: unknown;
  provider?: unknown;
  ok?: unknown;
  t?: unknown;
  sig?: unknown;
}

function envList(name: string): string[] {
  const raw = String(process.env[name] || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isSupportedHttpOrigin(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function resolveAllowedFrontendOrigins(): string[] {
  const candidates = [
    String(process.env.FRONTEND_URL || "").trim(),
    ...envList("FRONTEND_URLS"),
  ].filter(Boolean);

  const normalized = new Set<string>();
  for (const candidate of candidates) {
    const origin = isSupportedHttpOrigin(candidate);
    if (origin) normalized.add(origin);
  }
  return Array.from(normalized);
}

export function resolveOAuthPostMessageOrigin(): string | null {
  const origins = resolveAllowedFrontendOrigins();
  return origins[0] || null;
}

function resolveOAuthSigningSecret(): string | null {
  const secret = String(
    process.env.CONNECTOR_OAUTH_CALLBACK_SECRET ||
      process.env.CONNECTOR_OAUTH_STATE_SECRET ||
      process.env.ENCRYPTION_KEY ||
      "",
  ).trim();
  return secret || null;
}

export function buildOAuthCompletionPayload(
  provider: string,
  ok: boolean,
  nowMs = Date.now(),
): OAuthCompletionPayload {
  const safeProvider = String(provider || "").trim().toLowerCase();
  const payload: OAuthCompletionPayload = {
    type: "koda_oauth_done",
    provider: safeProvider,
    ok: Boolean(ok),
    t: nowMs,
    sig: null,
  };
  const secret = resolveOAuthSigningSecret();
  if (!secret) return payload;

  const data = `${safeProvider}:${payload.ok ? "1" : "0"}:${nowMs}`;
  payload.sig = createHmac("sha256", secret).update(data).digest("base64url");
  return payload;
}

function safeSignatureEqual(expected: string, provided: string): boolean {
  try {
    const expectedBuf = Buffer.from(expected, "utf8");
    const providedBuf = Buffer.from(provided, "utf8");
    if (expectedBuf.length !== providedBuf.length) return false;
    return timingSafeEqual(expectedBuf, providedBuf);
  } catch {
    return false;
  }
}

export function verifyOAuthCompletionPayload(
  payload: unknown,
  nowMs = Date.now(),
): boolean {
  const record = payload as OAuthCompletionPayloadLike;
  if (!record || typeof record !== "object") return false;
  if (record.type !== "koda_oauth_done") return false;

  const provider = String(record.provider || "").trim().toLowerCase();
  const ok = record.ok;
  const ts = Number(record.t);
  const sig = String(record.sig || "").trim();
  if (!provider || !Number.isFinite(ts) || !sig) return false;
  if (ok !== true && ok !== false) return false;

  const secret = resolveOAuthSigningSecret();
  // Fail closed: if signing secret is absent, callback payload authenticity cannot be verified.
  if (!secret) return false;

  const maxAgeMsRaw = Number(process.env.CONNECTOR_OAUTH_CALLBACK_MAX_AGE_MS);
  const maxAgeMs =
    Number.isFinite(maxAgeMsRaw) && maxAgeMsRaw > 0
      ? Math.min(Math.floor(maxAgeMsRaw), 15 * 60 * 1000)
      : 5 * 60 * 1000;
  // Allow small positive clock skew while rejecting stale/implausible timestamps.
  if (ts > nowMs + 60_000) return false;
  if (nowMs - ts > maxAgeMs) return false;

  const data = `${provider}:${ok ? "1" : "0"}:${ts}`;
  const expected = createHmac("sha256", secret).update(data).digest("base64url");
  return safeSignatureEqual(expected, sig);
}

export function normalizeIntegrationErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error || "unknown_error");
  }
}

export function buildIntegrationErrorRef(seed?: string | null): string {
  const raw =
    (typeof seed === "string" && seed.trim()) ||
    `${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
  return createHash("sha1").update(raw).digest("hex").slice(0, 12);
}

export function clientSafeIntegrationMessage(
  status: number,
  fallback: string,
  detail?: string,
): string {
  if (status >= 500) return fallback;
  return String(detail || fallback || "").trim() || fallback;
}
