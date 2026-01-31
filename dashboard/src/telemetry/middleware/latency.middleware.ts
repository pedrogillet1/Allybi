import type { Request, Response, NextFunction } from "express";
import { attachTelemetryContext, getTelemetryContext, makeTelemetryContext } from "../context";
import { emit } from "../index";
import { TELEMETRY_CATEGORY, TELEMETRY_EVENT, TELEMETRY_SEVERITY } from "../constants";

/**
 * latency.middleware.ts (Koda)
 * ----------------------------
 * Measures endpoint latency and emits a lightweight telemetry event.
 *
 * Goals:
 *  - Always attach a telemetry context (correlationId/requestId)
 *  - Emit duration for every request (sampled if needed)
 *  - Never block or crash the request path
 *
 * Usage:
 *  app.use(latencyMiddleware({ sampleRate: 1 }))
 */

export interface LatencyMiddlewareOptions {
  sampleRate?: number; // 0..1 (default 1)
  includeRoutePattern?: boolean; // default true
  includeQueryString?: boolean; // default false (avoid logging PII)
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 1;
  return Math.max(0, Math.min(1, x));
}

function shouldSample(rate: number) {
  return Math.random() <= rate;
}

export function latencyMiddleware(opts: LatencyMiddlewareOptions = {}) {
  const sampleRate = clamp01(opts.sampleRate ?? 1);
  const includeRoutePattern = opts.includeRoutePattern !== false;
  const includeQueryString = opts.includeQueryString === true;

  return function latency(req: Request, res: Response, next: NextFunction) {
    // Ensure telemetry context exists
    const existing = (req as any).telemetry;
    if (!existing) {
      attachTelemetryContext(req as any, makeTelemetryContext());
    }

    const started = process.hrtime.bigint();

    // Emit when response finishes
    res.on("finish", async () => {
      if (!shouldSample(sampleRate)) return;

      const ended = process.hrtime.bigint();
      const ms = Number(ended - started) / 1_000_000;

      const ctx = getTelemetryContext(req as any);

      const routePattern =
        includeRoutePattern && (req.route?.path || (req as any).originalUrl || req.path)
          ? String(req.route?.path || req.path)
          : undefined;

      // Avoid query-string logging unless explicitly allowed
      const path = includeQueryString ? String(req.originalUrl || req.url) : String(req.path);

      const payload = {
        route: routePattern,
        path,
        method: req.method,
        statusCode: res.statusCode,
        durationMs: Math.round(ms),
      };

      // Severity: warn on slow endpoints (tunable)
      const severity =
        ms >= 20000 ? TELEMETRY_SEVERITY.ERROR : ms >= 5000 ? TELEMETRY_SEVERITY.WARN : TELEMETRY_SEVERITY.INFO;

      await emit(TELEMETRY_EVENT.SYSTEM_QUEUE_HEALTH ?? "system.api.latency", {
        category: TELEMETRY_CATEGORY.SYSTEM,
        severity,
        ...ctx,
        payload,
      } as any);
    });

    next();
  };
}

export default latencyMiddleware;
