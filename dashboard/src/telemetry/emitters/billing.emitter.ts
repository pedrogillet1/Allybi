/* eslint-disable @typescript-eslint/no-explicit-any */

import { emit } from "../index";
import { TELEMETRY_CATEGORY, TELEMETRY_EVENT, TELEMETRY_SEVERITY } from "../constants";
import type { TelemetryContext } from "../context";

/**
 * Billing Telemetry Emitter (Koda-native)
 * --------------------------------------
 * Emits billing + usage accounting signals used by:
 *  - cost dashboards (admin)
 *  - alerts on spikes
 *  - budget enforcement logic (optional)
 *
 * Rules:
 *  - Never log payment instrument data.
 *  - Only log high-level amounts and identifiers.
 */

export interface BillingEventPayload {
  action:
    | "usage_recorded"
    | "quota_warning"
    | "quota_exceeded"
    | "plan_changed"
    | "payment_failed"
    | "payment_succeeded";

  provider?: "stripe" | "internal";
  planId?: string;
  planTier?: string;
  period?: string; // e.g. "2026-01"

  // Usage
  model?: string;
  requestType?: string;
  units?: number; // generic usage unit
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;

  // Money (no PII)
  amountUsd?: number;
  amountBrl?: number;
  currency?: "USD" | "BRL";
  invoiceId?: string;
  chargeId?: string;

  // Outcome
  success?: boolean;
  reason?: string;

  error?: { code?: string; message: string; where?: string; meta?: Record<string, any> };
}

function base(ctx: TelemetryContext) {
  return {
    category: TELEMETRY_CATEGORY.BILLING,
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

function sanitize(payload: BillingEventPayload): BillingEventPayload {
  const out: any = { ...(payload || {}) };

  // Strip any accidental secrets
  delete out.card;
  delete out.cardNumber;
  delete out.cvc;
  delete out.authorization;
  delete out.token;
  delete out.secret;
  delete out.key;

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

export const billingEmitter = {
  async usageRecorded(ctx: TelemetryContext, payload: Omit<BillingEventPayload, "action">) {
    return emit(TELEMETRY_EVENT.BILLING_USAGE_RECORDED, {
      ...base(ctx),
      severity: TELEMETRY_SEVERITY.INFO,
      payload: sanitize({ action: "usage_recorded", ...payload }),
    } as any);
  },

  async quotaWarning(ctx: TelemetryContext, payload: Omit<BillingEventPayload, "action"> & { reason?: string }) {
    return emit(TELEMETRY_EVENT.BILLING_QUOTA_WARNING, {
      ...base(ctx),
      severity: TELEMETRY_SEVERITY.WARN,
      payload: sanitize({ action: "quota_warning", ...payload }),
    } as any);
  },

  async quotaExceeded(ctx: TelemetryContext, payload: Omit<BillingEventPayload, "action"> & { reason?: string }) {
    return emit(TELEMETRY_EVENT.BILLING_QUOTA_EXCEEDED, {
      ...base(ctx),
      severity: TELEMETRY_SEVERITY.ERROR,
      payload: sanitize({ action: "quota_exceeded", ...payload }),
    } as any);
  },

  async planChanged(ctx: TelemetryContext, payload: Omit<BillingEventPayload, "action"> & { planId?: string; planTier?: string }) {
    return emit(TELEMETRY_EVENT.BILLING_PLAN_CHANGED, {
      ...base(ctx),
      severity: TELEMETRY_SEVERITY.INFO,
      payload: sanitize({ action: "plan_changed", ...payload }),
    } as any);
  },

  async paymentSucceeded(ctx: TelemetryContext, payload: Omit<BillingEventPayload, "action"> & { amountUsd?: number; currency?: "USD" | "BRL" }) {
    return emit(TELEMETRY_EVENT.BILLING_PAYMENT_SUCCEEDED, {
      ...base(ctx),
      severity: TELEMETRY_SEVERITY.INFO,
      payload: sanitize({ action: "payment_succeeded", ...payload, success: true }),
    } as any);
  },

  async paymentFailed(ctx: TelemetryContext, payload: Omit<BillingEventPayload, "action"> & { reason?: string }) {
    return emit(TELEMETRY_EVENT.BILLING_PAYMENT_FAILED, {
      ...base(ctx),
      severity: TELEMETRY_SEVERITY.ERROR,
      payload: sanitize({ action: "payment_failed", ...payload, success: false }),
    } as any);
  },
};

export default billingEmitter;
