// backend/src/controllers/queries.controller.ts
//
// Clean Admin Queries Controller
// - Thin HTTP layer (no DB logic)
// - Uses app.locals.services.adminTelemetryApp (your container pattern)
// - No user-facing microcopy
// - Cache-Control: no-store
//
// Endpoints (suggested):
// - GET /api/admin/queries?range=7d&limit=50&cursor=...&domain=...&intent=...&operator=...&keyword=...

import type { Request, Response, NextFunction } from "express";

type AdminTelemetryApp = {
  queries: (params: {
    range: string;
    limit: number;
    cursor?: string;
    domain?: string;
    intent?: string;
    operator?: string;
    keyword?: string;
  }) => Promise<any>;
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

export async function getQueries(req: Request, res: Response, next: NextFunction) {
  try {
    res.set("Cache-Control", "no-store");

    const app = getAdminTelemetryApp(req);

    const range = parseRange(req.query.range, "7d");
    const limit = parseLimit(req.query.limit, 50);
    const cursor = optString(req.query.cursor);

    const domain = optString(req.query.domain);
    const intent = optString(req.query.intent);
    const operator = optString(req.query.operator);
    const keyword = optString(req.query.keyword);

    const data = await app.queries({ range, limit, cursor, domain, intent, operator, keyword });

    // Expect app.queries returns { items, nextCursor, ...optional aggregates }
    res.json({ ok: true, range, ...data });
  } catch (e) {
    next(e);
  }
}
