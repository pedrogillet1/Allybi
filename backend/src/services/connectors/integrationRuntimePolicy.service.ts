import { createHash, createHmac } from "crypto";

export interface OAuthCompletionPayload {
  type: "koda_oauth_done";
  provider: string;
  ok: boolean;
  t: number;
  sig: string | null;
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
