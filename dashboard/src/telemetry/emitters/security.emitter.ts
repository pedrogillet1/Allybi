/* eslint-disable @typescript-eslint/no-explicit-any */

import { emit } from "../index";
import { TELEMETRY_CATEGORY, TELEMETRY_EVENT, TELEMETRY_SEVERITY } from "../constants";
import type { TelemetryContext } from "../context";

/**
 * Security Telemetry Emitter (Koda-native)
 * ---------------------------------------
 * Emits security-relevant events in a privacy-safe way.
 *
 * Rules:
 *  - Never emit raw tokens, secrets, passwords, recovery phrases, or MFA secrets.
 *  - Prefer hashes over raw identifiers when possible.
 *  - In production, avoid raw IP/email; use partial redaction.
 */

export interface SecurityEventPayload {
  action?: "rate_limit" | "suspicious_session" | "access_denied" | "auth_failure" | "auth_success";
  reason?: string;
  route?: string;
  method?: string;
  statusCode?: number;

  // Optional identifiers (redacted)
  email?: string;
  ip?: string;

  // Optional risk signals
  isSuspicious?: boolean;
  riskScore?: number; // 0..1
  flags?: string[];

  // Minimal error shape (no stack)
  error?: { code?: string; message: string; where?: string; meta?: Record<string, any> };
}

function base(ctx: TelemetryContext) {
  return {
    category: TELEMETRY_CATEGORY.SECURITY,
    correlationId: ctx.correlationId,
    requestId: ctx.requestId,
    sessionId: ctx.sessionId,
    userId: ctx.userId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    conversationId: ctx.conversationId,
    messageId: ctx.messageId,
    documentId: ctx.documentId,
    folderId: ctx.folderId,
  };
}

// Very light redaction helpers
function maskEmail(email?: string) {
  if (!email) return undefined;
  const [u, d] = email.split("@");
  if (!u || !d) return "[redacted]";
  if (u.length <= 2) return `**@${d}`;
  return `${u.slice(0, 2)}***@${d}`;
}

function maskIp(ip?: string) {
  if (!ip) return undefined;
  // ipv4 only simple masking
  const parts = ip.split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.x.x`;
  return "[redacted]";
}

function sanitize(payload: SecurityEventPayload): SecurityEventPayload {
  const out: any = { ...(payload || {}) };

  // Hard remove secrets if someone passes them accidentally
  delete out.password;
  delete out.passwordHash;
  delete out.refreshToken;
  delete out.accessToken;
  delete out.token;
  delete out.secret;
  delete out.totpSecret;
  delete out.recoveryKey;
  delete out.masterKey;
  delete out.authorization;

  // Redact identifiers by default
  if (out.email) out.email = maskEmail(out.email);
  if (out.ip) out.ip = maskIp(out.ip);

  // Ensure error is safe
  if (out.error) {
    const e: any = out.error;
    out.error = {
      code: e.code,
      message: e.message || "error",
      where: e.where,
      meta: e.meta,
    };
  }

  return out;
}

export const securityEmitter = {
  async rateLimit(ctx: TelemetryContext, payload: SecurityEventPayload = {}) {
    return emit(TELEMETRY_EVENT.SECURITY_RATE_LIMIT, {
      ...base(ctx),
      severity: TELEMETRY_SEVERITY.WARN,
      payload: sanitize({ action: "rate_limit", ...(payload || {}) }),
    });
  },

  async suspiciousSession(ctx: TelemetryContext, payload: SecurityEventPayload = {}) {
    return emit(TELEMETRY_EVENT.SECURITY_SUSPICIOUS_SESSION, {
      ...base(ctx),
      severity: TELEMETRY_SEVERITY.WARN,
      payload: sanitize({ action: "suspicious_session", ...(payload || {}) }),
    });
  },

  async accessDenied(ctx: TelemetryContext, payload: SecurityEventPayload = {}) {
    return emit(TELEMETRY_EVENT.SECURITY_ACCESS_DENIED, {
      ...base(ctx),
      severity: TELEMETRY_SEVERITY.WARN,
      payload: sanitize({ action: "access_denied", ...(payload || {}) }),
    });
  },

  /**
   * Optional: use this for successful auth events if you want security timeline parity.
   * (Keeps security feed cohesive.)
   */
  async authSuccess(ctx: TelemetryContext, payload: SecurityEventPayload = {}) {
    return emit(TELEMETRY_EVENT.AUTH_LOGIN_SUCCESS, {
      ...base(ctx),
      // category must remain security for the security feed; but event name is auth.*
      // If you prefer strict category/name alignment, create TELEMETRY_EVENT.SECURITY_AUTH_SUCCESS.
      category: TELEMETRY_CATEGORY.SECURITY,
      severity: TELEMETRY_SEVERITY.INFO,
      payload: sanitize({ action: "auth_success", ...(payload || {}) }),
    } as any);
  },

  async authFailure(ctx: TelemetryContext, payload: SecurityEventPayload = {}) {
    return emit(TELEMETRY_EVENT.AUTH_LOGIN_FAILED, {
      ...base(ctx),
      category: TELEMETRY_CATEGORY.SECURITY,
      severity: TELEMETRY_SEVERITY.WARN,
      payload: sanitize({ action: "auth_failure", ...(payload || {}) }),
    } as any);
  },
};

export default securityEmitter;
