/* eslint-disable @typescript-eslint/no-explicit-any */

import { emit } from "../index";
import { TELEMETRY_CATEGORY, TELEMETRY_EVENT, TELEMETRY_SEVERITY } from "../constants";
import type { TelemetryContext } from "../context";
import type { AuthEventPayload } from "../types";

/**
 * Auth Telemetry Emitter (Koda)
 * -----------------------------
 * Thin, typed wrappers around telemetry.emit() for auth-related events.
 *
 * Rules:
 *  - Never include secrets (passwords, tokens, TOTP secrets, recovery keys)
 *  - Keep payload small and JSON-serializable
 *  - Always pass TelemetryContext (correlationId/requestId)
 */

function base(ctx: TelemetryContext) {
  return {
    category: TELEMETRY_CATEGORY.AUTH,
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

export const authEmitter = {
  async loginSuccess(ctx: TelemetryContext, payload: AuthEventPayload = {}) {
    return emit(TELEMETRY_EVENT.AUTH_LOGIN_SUCCESS, {
      ...base(ctx),
      severity: TELEMETRY_SEVERITY.INFO,
      payload: sanitizeAuthPayload(payload),
    });
  },

  async loginFailed(ctx: TelemetryContext, payload: AuthEventPayload = {}) {
    return emit(TELEMETRY_EVENT.AUTH_LOGIN_FAILED, {
      ...base(ctx),
      severity: TELEMETRY_SEVERITY.WARN,
      payload: sanitizeAuthPayload(payload),
    });
  },

  async logout(ctx: TelemetryContext, payload: AuthEventPayload = {}) {
    return emit(TELEMETRY_EVENT.AUTH_LOGOUT, {
      ...base(ctx),
      severity: TELEMETRY_SEVERITY.INFO,
      payload: sanitizeAuthPayload(payload),
    });
  },

  async register(ctx: TelemetryContext, payload: AuthEventPayload = {}) {
    return emit(TELEMETRY_EVENT.AUTH_REGISTER, {
      ...base(ctx),
      severity: TELEMETRY_SEVERITY.INFO,
      payload: sanitizeAuthPayload(payload),
    });
  },

  async sessionCreated(ctx: TelemetryContext, payload: AuthEventPayload = {}) {
    return emit(TELEMETRY_EVENT.AUTH_SESSION_CREATED, {
      ...base(ctx),
      severity: TELEMETRY_SEVERITY.INFO,
      payload: sanitizeAuthPayload(payload),
    });
  },

  async sessionRevoked(ctx: TelemetryContext, payload: AuthEventPayload = {}) {
    return emit(TELEMETRY_EVENT.AUTH_SESSION_REVOKED, {
      ...base(ctx),
      severity: TELEMETRY_SEVERITY.INFO,
      payload: sanitizeAuthPayload(payload),
    });
  },

  async twoFactorSetupStarted(ctx: TelemetryContext, payload: AuthEventPayload = {}) {
    return emit(TELEMETRY_EVENT.AUTH_2FA_SETUP_STARTED, {
      ...base(ctx),
      severity: TELEMETRY_SEVERITY.INFO,
      payload: sanitizeAuthPayload(payload),
    });
  },

  async twoFactorSetupEnabled(ctx: TelemetryContext, payload: AuthEventPayload = {}) {
    return emit(TELEMETRY_EVENT.AUTH_2FA_SETUP_ENABLED, {
      ...base(ctx),
      severity: TELEMETRY_SEVERITY.INFO,
      payload: sanitizeAuthPayload(payload),
    });
  },

  async twoFactorChallengeFailed(ctx: TelemetryContext, payload: AuthEventPayload = {}) {
    return emit(TELEMETRY_EVENT.AUTH_2FA_CHALLENGE_FAILED, {
      ...base(ctx),
      severity: TELEMETRY_SEVERITY.WARN,
      payload: sanitizeAuthPayload(payload),
    });
  },

  async twoFactorChallengePassed(ctx: TelemetryContext, payload: AuthEventPayload = {}) {
    return emit(TELEMETRY_EVENT.AUTH_2FA_CHALLENGE_PASSED, {
      ...base(ctx),
      severity: TELEMETRY_SEVERITY.INFO,
      payload: sanitizeAuthPayload(payload),
    });
  },
};

function sanitizeAuthPayload(payload: AuthEventPayload): AuthEventPayload {
  // Ensure we never accidentally pass sensitive fields
  const out: any = { ...(payload || {}) };
  // Strip obvious sensitive keys if someone passed them
  delete out.password;
  delete out.passwordHash;
  delete out.token;
  delete out.accessToken;
  delete out.refreshToken;
  delete out.secret;
  delete out.totpSecret;
  delete out.recoveryKey;
  delete out.masterKey;
  return out;
}

export default authEmitter;
