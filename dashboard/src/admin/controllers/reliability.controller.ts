// backend/src/controllers/reliability.controller.ts
//
// Clean Admin Reliability Controller
// - Thin HTTP layer (no DB logic)
// - Uses app.locals.services.adminTelemetryApp
// - No user-facing microcopy
// - Cache-Control: no-store
//
// Endpoints (suggested):
// - GET /api/admin/reliability/errors?range=7d&limit=50&cursor=...
// - GET /api/admin/reliability/timeseries?metric=llm_errors&range=7d
// - GET /api/admin/reliability/overview?range=7d  (optional)

import type { Request, Response, NextFunction } from "express";

type AdminTelemetryApp = {
  errors: (params: { range: string; limit: number; cursor?: string }) => Promise<any>;
  timeseries: (params: { metric: string; range: string }) => Promise<any>;
  overview?: (params: { range: string }) => Promise<any>;
};

function getAdminTelemetryApp(req: Request): AdminTelemetryApp {
  const svc = (req.app.locals?.services as any)?.adminTelemetryApp;
  if (!svc) {
    const err = new Error("ADMIN_TELEMETRY_APP_NOT_WIRED");
    (err as any).status = 500;
    throw err;
  }
  return svc as AdminTelemetryApp;
}

function parseRange(v: unknown, fallback = "7d"): string {
  const s = String(v ?? "").trim().toLowerCase();
  return /^(24h|7d|30d|90d)$/.test(s) ? s : fallback;
}

function parseLimit(v: unknown, fallback = 50): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.max(Math.floor(n), 1), 200);
}

function optString(v: unknown): string | undefined {
  const s = String(v ?? "").trim();
  return s ? s : undefined;
}

export async function getReliabilityErrors(req: Request, res: Response, next: NextFunction) {
  try {
    res.set("Cache-Control", "no-store");
    const app = getAdminTelemetryApp(req);

    const range = parseRange(req.query.range, "7d");
    const limit = parseLimit(req.query.limit, 50);
    const cursor = optString(req.query.cursor);

    const data = await app.errors({ range, limit, cursor });
    res.json({ ok: true, range, ...data });
  } catch (e) {
    next(e);
  }
}

export async function getReliabilityTimeseries(req: Request, res: Response, next: NextFunction) {
  try {
    res.set("Cache-Control", "no-store");
    const app = getAdminTelemetryApp(req);

    const range = parseRange(req.query.range, "7d");
    const metric = String(req.query.metric ?? "llm_errors").trim();

    const data = await app.timeseries({ metric, range });
    res.json({ ok: true, metric, range, data });
  } catch (e) {
    next(e);
  }
}

export async function getReliabilityOverview(req: Request, res: Response, next: NextFunction) {
  try {
    res.set("Cache-Control", "no-store");
    const app = getAdminTelemetryApp(req);

    if (typeof app.overview !== "function") {
      res.json({ ok: true, range: parseRange(req.query.range, "7d"), data: { kpis: {}, feeds: {} } });
      return;
    }

    const range = parseRange(req.query.range, "7d");
    const data = await app.overview({ range });
    res.json({ ok: true, range, data });
  } catch (e) {
    next(e);
  }
}
