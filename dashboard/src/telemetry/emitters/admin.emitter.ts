/* eslint-disable @typescript-eslint/no-explicit-any */

import { emit } from "../index";
import { TELEMETRY_CATEGORY, TELEMETRY_EVENT, TELEMETRY_SEVERITY } from "../constants";
import type { TelemetryContext } from "../context";

/**
 * Admin Telemetry Emitter (Koda-native)
 * ------------------------------------
 * Emits read-only admin activity and admin API usage events.
 *
 * Rules:
 *  - Never include secrets or raw credentials.
 *  - Admin events must be minimal but traceable (correlationId/requestId).
 *  - Prefer resource IDs over content.
 */

export interface AdminEventPayload {
  action:
    | "admin_view"
    | "admin_search"
    | "admin_export"
    | "admin_impersonation_attempt"
    | "admin_impersonation_success"
    | "admin_impersonation_denied"
    | "admin_config_change"
    | "admin_debug_toggle";

  resource?: "overview" | "users" | "files" | "queries" | "answer_quality" | "llm_cost" | "reliability" | "security" | "live";
  targetUserId?: string;
  targetDocumentId?: string;
  targetConversationId?: string;
  query?: string; // keep short; do not store sensitive content
  resultCount?: number;
  exportFormat?: "csv" | "json";
  success?: boolean;
  reason?: string;

  // minimal error (no stack)
  error?: { code?: string; message: string; where?: string; meta?: Record<string, any> };
}

function base(ctx: TelemetryContext) {
  return {
    category: TELEMETRY_CATEGORY.ADMIN,
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

function sanitize(payload: AdminEventPayload): AdminEventPayload {
  const out: any = { ...(payload || {}) };

  // Hard remove obvious secret fields if passed accidentally
  delete out.token;
  delete out.accessToken;
  delete out.refreshToken;
  delete out.authorization;
  delete out.password;
  delete out.secret;
  delete out.key;

  // Keep query short to avoid sensitive leakage
  if (typeof out.query === "string" && out.query.length > 180) {
    out.query = out.query.slice(0, 179) + "\u2026";
  }

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

export const adminEmitter = {
  async viewed(ctx: TelemetryContext, payload: Omit<AdminEventPayload, "action"> & { resource: AdminEventPayload["resource"] }) {
    return emit(TELEMETRY_EVENT.ADMIN_VIEWED, {
      ...base(ctx),
      severity: TELEMETRY_SEVERITY.INFO,
      payload: sanitize({ action: "admin_view", ...payload }),
    } as any);
  },

  async searched(ctx: TelemetryContext, payload: Omit<AdminEventPayload, "action"> & { query?: string }) {
    return emit(TELEMETRY_EVENT.ADMIN_SEARCHED, {
      ...base(ctx),
      severity: TELEMETRY_SEVERITY.INFO,
      payload: sanitize({ action: "admin_search", ...payload }),
    } as any);
  },

  async exported(ctx: TelemetryContext, payload: Omit<AdminEventPayload, "action"> & { exportFormat: "csv" | "json" }) {
    return emit(TELEMETRY_EVENT.ADMIN_EXPORTED, {
      ...base(ctx),
      severity: TELEMETRY_SEVERITY.INFO,
      payload: sanitize({ action: "admin_export", ...payload }),
    } as any);
  },

  async impersonationAttempt(ctx: TelemetryContext, payload: Omit<AdminEventPayload, "action"> & { targetUserId: string }) {
    return emit(TELEMETRY_EVENT.ADMIN_IMPERSONATION_ATTEMPT, {
      ...base(ctx),
      severity: TELEMETRY_SEVERITY.WARN,
      payload: sanitize({ action: "admin_impersonation_attempt", ...payload }),
    } as any);
  },

  async impersonationSuccess(ctx: TelemetryContext, payload: Omit<AdminEventPayload, "action"> & { targetUserId: string }) {
    return emit(TELEMETRY_EVENT.ADMIN_IMPERSONATION_SUCCESS, {
      ...base(ctx),
      severity: TELEMETRY_SEVERITY.INFO,
      payload: sanitize({ action: "admin_impersonation_success", ...payload, success: true }),
    } as any);
  },

  async impersonationDenied(ctx: TelemetryContext, payload: Omit<AdminEventPayload, "action"> & { targetUserId?: string; reason?: string }) {
    return emit(TELEMETRY_EVENT.ADMIN_IMPERSONATION_DENIED, {
      ...base(ctx),
      severity: TELEMETRY_SEVERITY.WARN,
      payload: sanitize({ action: "admin_impersonation_denied", ...payload, success: false }),
    } as any);
  },
};

export default adminEmitter;
