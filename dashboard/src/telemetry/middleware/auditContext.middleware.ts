import type { Request, Response, NextFunction } from "express";
import { attachTelemetryContext, getTelemetryContext, makeTelemetryContext } from "../context";

/**
 * auditContext.middleware.ts (Koda)
 * ---------------------------------
 * Attaches safe request context for telemetry/audit:
 *  - correlationId / requestId
 *  - userId (if authenticated)
 *  - ip + user-agent (safe defaults)
 *  - sessionId (if available)
 *
 * This middleware does NOT emit events — it only enriches context.
 * Emission happens in endpoint code (controllers/services) and latency middleware.
 */

export interface AuditContextOptions {
  trustProxy?: boolean; // default true in prod
}

function pickFirstForwardedFor(xff: any): string | undefined {
  if (!xff) return undefined;
  const s = Array.isArray(xff) ? xff.join(",") : String(xff);
  return s.split(",")[0]?.trim() || undefined;
}

export function auditContextMiddleware(opts: AuditContextOptions = {}) {
  const trustProxy = opts.trustProxy !== false;

  return function auditContext(req: Request, _res: Response, next: NextFunction) {
    // Ensure base telemetry context exists
    const existing = (req as any).telemetry;
    const ctx = existing?.correlationId && existing?.requestId ? existing : makeTelemetryContext();

    // Attach actor context
    const userId = (req as any).user?.id || (req as any).userId || undefined;
    const sessionId =
      (req as any).session?.id ||
      (req as any).sessionId ||
      (req as any).authSessionId ||
      undefined;

    const ua = String(req.headers["user-agent"] || "");
    const ip =
      trustProxy
        ? pickFirstForwardedFor(req.headers["x-forwarded-for"]) || (req.headers["x-real-ip"] as string) || req.ip
        : req.ip;

    attachTelemetryContext(req as any, {
      ...ctx,
      userId: typeof userId === "string" ? userId : undefined,
      sessionId: typeof sessionId === "string" ? sessionId : undefined,
      ip: typeof ip === "string" ? ip : undefined,
      userAgent: ua || undefined,
    });

    next();
  };
}

export default auditContextMiddleware;
