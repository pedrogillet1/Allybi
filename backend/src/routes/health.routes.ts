// src/routes/health.routes.ts
//
// Clean health/readiness routes for Koda (Express).
// - No auth required
// - No heavy work
// - Deterministic JSON shapes (good for uptime monitors)
// - Optional deeper readiness checks (LLM, storage, vector db) via injected services

import { Router } from "express";
import type { Request, Response, NextFunction } from "express";

const router = Router();

/**
 * Liveness: process is up.
 */
router.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    ok: true,
    status: "alive",
    ts: new Date().toISOString(),
  });
});

/**
 * Readiness: basic dependencies available.
 * Keep checks lightweight; avoid calling external LLMs here.
 * If you want deeper checks, wire them into a service and return boolean flags.
 */
router.get("/ready", async (_req: Request, res: Response) => {
  // Example placeholders; replace with real checks if you have them:
  const checks = {
    server: true,
    // db: await db.ping(),
    // storage: await storage.ping(),
    // vector: await vector.ping(),
    // cache: await cache.ping(),
  };

  const ok = Object.values(checks).every(Boolean);

  res.status(ok ? 200 : 503).json({
    ok,
    status: ok ? "ready" : "degraded",
    checks,
    ts: new Date().toISOString(),
  });
});

/**
 * Queue health: document processing queue stats.
 */
router.get("/health/queue", async (_req: Request, res: Response) => {
  try {
    const { getQueueStats } = await import("../queues/document.queue");
    const stats = await getQueueStats();
    res.status(200).json({
      ok: true,
      ...stats,
      ts: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(503).json({
      ok: false,
      error: err.message || "Queue stats unavailable",
      ts: new Date().toISOString(),
    });
  }
});

/**
 * Version / build info (optional but useful).
 * Populate via env vars in your deploy pipeline.
 */
router.get("/version", (_req: Request, res: Response) => {
  res.status(200).json({
    name: "koda",
    version: process.env.APP_VERSION || "dev",
    commit: process.env.GIT_COMMIT || null,
    env: process.env.NODE_ENV || "development",
    ts: new Date().toISOString(),
  });
});

/**
 * Error boundary (router-level)
 */
router.use(
  (err: unknown, _req: Request, _res: Response, next: NextFunction) => {
    next(err);
  },
);

export default router;
