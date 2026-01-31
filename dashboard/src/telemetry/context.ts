/**
 * telemetry/context.ts (Koda)
 * ---------------------------
 * Request-scoped telemetry context helpers:
 *  - correlationId: stable across a request + downstream services
 *  - requestId: unique per request attempt
 *  - sessionId: auth/session linkage when available
 *
 * Design goals:
 *  - Works with Express middleware (attach to req)
 *  - Works without Express (manual passing for jobs/workers)
 *  - Avoids global mutable state across concurrent requests
 *
 * Usage (Express):
 *  - middleware sets: req.telemetry = makeTelemetryContext(...)
 *  - later: getTelemetryContext(req) or req.telemetry
 *
 * Usage (jobs):
 *  - const ctx = makeTelemetryContext({ correlationId, userId, ... })
 *  - emit(..., { ...ctx, category, severity, payload })
 */

import crypto from "crypto";

export interface TelemetryContext {
  correlationId: string;
  requestId: string;
  sessionId?: string;

  userId?: string;
  ip?: string;
  userAgent?: string;

  conversationId?: string;
  messageId?: string;
  documentId?: string;
  folderId?: string;

  // Optional: service name or subsystem for debugging
  service?: string;
}

export interface TelemetryContextInput extends Partial<TelemetryContext> {
  correlationId?: string;
  requestId?: string;
}

/**
 * Generate a short readable id (stable enough for logs, not secrets).
 */
function shortId(prefix: string) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

export function newCorrelationId() {
  return shortId("corr");
}

export function newRequestId() {
  return shortId("req");
}

/**
 * Create a telemetry context.
 * If correlationId/requestId are not provided, they are generated.
 */
export function makeTelemetryContext(input: TelemetryContextInput = {}): TelemetryContext {
  return {
    correlationId: input.correlationId || newCorrelationId(),
    requestId: input.requestId || newRequestId(),
    sessionId: input.sessionId,

    userId: input.userId,
    ip: input.ip,
    userAgent: input.userAgent,

    conversationId: input.conversationId,
    messageId: input.messageId,
    documentId: input.documentId,
    folderId: input.folderId,

    service: input.service,
  };
}

/**
 * Merge two contexts (child overrides parent).
 * Useful when:
 *  - a request context exists
 *  - a specific action adds documentId/conversationId/etc.
 */
export function mergeTelemetryContext(base: TelemetryContext, patch: Partial<TelemetryContext>): TelemetryContext {
  return {
    ...base,
    ...patch,
    correlationId: patch.correlationId || base.correlationId,
    requestId: patch.requestId || base.requestId,
  };
}

/**
 * Extract a context from an Express request-like object.
 * Your middleware can set req.telemetry = TelemetryContext.
 */
export function getTelemetryContext(req: any): TelemetryContext {
  // If middleware set req.telemetry, trust it
  if (req?.telemetry?.correlationId && req?.telemetry?.requestId) {
    return req.telemetry as TelemetryContext;
  }

  // Otherwise build a best-effort context from common req fields
  const headers = req?.headers || {};
  const correlationId =
    headers["x-correlation-id"] ||
    headers["x-request-id"] ||
    headers["x-trace-id"] ||
    undefined;

  const requestId = headers["x-request-id"] || undefined;

  const ip =
    req?.ip ||
    headers["x-forwarded-for"]?.split(",")?.[0]?.trim() ||
    headers["x-real-ip"] ||
    undefined;

  const userAgent = headers["user-agent"] || undefined;

  const userId = req?.user?.id || req?.userId || undefined;

  return makeTelemetryContext({
    correlationId: typeof correlationId === "string" ? correlationId : undefined,
    requestId: typeof requestId === "string" ? requestId : undefined,
    userId: typeof userId === "string" ? userId : undefined,
    ip: typeof ip === "string" ? ip : undefined,
    userAgent: typeof userAgent === "string" ? userAgent : undefined,
  });
}

/**
 * Attach a telemetry context to a req object (Express middleware helper).
 */
export function attachTelemetryContext(req: any, ctx: TelemetryContext) {
  req.telemetry = ctx;
  // Also expose headers if you want downstream propagation
  req.headers = req.headers || {};
  req.headers["x-correlation-id"] = ctx.correlationId;
  req.headers["x-request-id"] = ctx.requestId;
}
