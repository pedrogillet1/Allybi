// backend/src/controllers/security.controller.ts
//
// Clean Admin Security Controller
// - Thin HTTP layer
// - Deterministic empty structures (no fabricated events)
// - Cache-Control: no-store
//
// NOTE:
// Security telemetry is often sensitive; do not expose raw audit logs here unless implemented.
// For now, return stable counters and an empty items list.

import type { Request, Response, NextFunction } from "express";

function parseRange(v: unknown, fallback = "30d"): string {
  const s = String(v ?? "").trim().toLowerCase();
  return /^(24h|7d|30d|90d)$/.test(s) ? s : fallback;
}

export async function getSecurityOverview(req: Request, res: Response, next: NextFunction) {
  try {
    res.set("Cache-Control", "no-store");
    const range = parseRange(req.query.range, "30d");

    // Deterministic placeholder structure WITHOUT fake data
    res.json({
      ok: true,
      range,
      counters: {
        privacyBlocks: 0,
        redactions: 0,
        failedAuth: 0,
        accessDenied: 0,
      },
      items: [],
      nextCursor: undefined,
    });
  } catch (e) {
    next(e);
  }
}
