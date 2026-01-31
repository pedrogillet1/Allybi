/* eslint-disable @typescript-eslint/no-explicit-any */

import type { TelemetryEnv, TelemetryEvent } from "../types";

/**
 * sanitizeTelemetry.ts (Koda)
 * ---------------------------
 * Redaction + truncation for telemetry payloads and envelopes.
 *
 * Goals:
 *  - Never store secrets (tokens, passwords, recovery keys, API keys)
 *  - Keep payload sizes bounded (DB + live feed safety)
 *  - Allow stack traces only in dev/local (optional)
 */

export interface SanitizeTelemetryOptions {
  env: TelemetryEnv;
  maxStringLen?: number;      // default 4000
  maxArrayLen?: number;       // default 200
  maxObjectKeys?: number;     // default 200
  allowStacksInProd?: boolean; // default false
  redactIpInProd?: boolean;   // default true
  redactEmailInProd?: boolean; // default true
}

const DEFAULTS: Required<
  Pick<
    SanitizeTelemetryOptions,
    "maxStringLen" | "maxArrayLen" | "maxObjectKeys" | "allowStacksInProd" | "redactIpInProd" | "redactEmailInProd"
  >
> = {
  maxStringLen: 4000,
  maxArrayLen: 200,
  maxObjectKeys: 200,
  allowStacksInProd: false,
  redactIpInProd: true,
  redactEmailInProd: true,
};

const SECRET_KEYWORDS = [
  "password",
  "passphrase",
  "token",
  "access_token",
  "refresh_token",
  "authorization",
  "secret",
  "api_key",
  "apikey",
  "private_key",
  "recovery",
  "masterkey",
  "totp",
  "otp",
];

function isPlainObject(v: any) {
  return v && typeof v === "object" && !Array.isArray(v);
}

function maskEmail(email: string) {
  const [u, d] = String(email).split("@");
  if (!u || !d) return "[redacted]";
  if (u.length <= 2) return `**@${d}`;
  return `${u.slice(0, 2)}***@${d}`;
}

function maskIp(ip: string) {
  const s = String(ip);
  const parts = s.split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.x.x`;
  return "[redacted]";
}

function shouldRedactKey(k: string) {
  const key = k.toLowerCase();
  return SECRET_KEYWORDS.some((w) => key.includes(w));
}

export function sanitizeEvent<T extends TelemetryEvent>(
  event: T,
  options: SanitizeTelemetryOptions
): T {
  const cfg = { ...DEFAULTS, ...(options || {}) };

  const env = cfg.env;
  const isProd = env === "production";

  const safe: any = { ...event };

  // redact envelope identifiers (optional)
  if (isProd && cfg.redactIpInProd && safe.ip) safe.ip = maskIp(safe.ip);
  if (isProd && cfg.redactEmailInProd && safe.payload?.email) safe.payload.email = maskEmail(safe.payload.email);

  // redact stacks in prod by default
  if (isProd && !cfg.allowStacksInProd) {
    if (safe.payload?.error?.stack) safe.payload.error.stack = "[redacted]";
    if (safe.payload?.stack) safe.payload.stack = "[redacted]";
  }

  safe.payload = sanitizeAny(safe.payload, cfg, /*depth*/ 0);

  return safe as T;
}

function sanitizeAny(value: any, cfg: Required<typeof DEFAULTS>, depth: number): any {
  // Avoid deep recursion bombs
  if (depth > 12) return "[truncated]";

  if (value == null) return value;

  if (typeof value === "string") {
    if (value.length > cfg.maxStringLen) return value.slice(0, cfg.maxStringLen - 1) + "\u2026";
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    const out = value.slice(0, cfg.maxArrayLen).map((x) => sanitizeAny(x, cfg, depth + 1));
    return out;
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    const out: any = {};
    for (const [k, v] of entries.slice(0, cfg.maxObjectKeys)) {
      if (shouldRedactKey(k)) {
        out[k] = "[redacted]";
        continue;
      }
      out[k] = sanitizeAny(v, cfg, depth + 1);
    }
    return out;
  }

  // Dates, Buffers, functions, etc.
  try {
    const s = String(value);
    return s.length > cfg.maxStringLen ? s.slice(0, cfg.maxStringLen - 1) + "\u2026" : s;
  } catch {
    return "[unserializable]";
  }
}

export default { sanitizeEvent };
