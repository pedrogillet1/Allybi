import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import {
  collectReadiness,
  collectRetrievalHealth,
  type ReadinessChecks,
} from "../../../services/health/healthReadiness.service";

const router = Router();

router.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    ok: true,
    status: "alive",
    ts: new Date().toISOString(),
  });
});

router.get("/ready", async (_req: Request, res: Response) => {
  const env = String(process.env.NODE_ENV || "development").toLowerCase();
  const strict = env === "production" || env === "staging";
  const { checks, details } = await collectReadiness();

  const requiredChecks: Array<keyof ReadinessChecks> = strict
    ? [
        "server",
        "db",
        "banks",
        "retrievalStorage",
        "retrievalEngineLoaded",
        "answerEngineLoaded",
      ]
    : ["server", "db", "banks"];

  const ok = requiredChecks.every((key) => checks[key]);

  res.status(ok ? 200 : 503).json({
    ok,
    status: ok ? "ready" : "degraded",
    env,
    strict,
    checks,
    details,
    requiredChecks,
    ts: new Date().toISOString(),
  });
});

router.get("/health/retrieval", async (_req: Request, res: Response) => {
  const payload = await collectRetrievalHealth();
  const status = payload.ok === true ? 200 : 503;
  res.status(status).json({
    ...payload,
    ts: new Date().toISOString(),
  });
});

router.get("/health/queue", async (_req: Request, res: Response) => {
  try {
    const { getQueueStats } = await import("../../../queues/document.queue");
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

router.get("/version", (_req: Request, res: Response) => {
  res.status(200).json({
    name: "koda",
    version: process.env.APP_VERSION || "dev",
    commit: process.env.GIT_COMMIT || null,
    env: process.env.NODE_ENV || "development",
    ts: new Date().toISOString(),
  });
});

router.use(
  (err: unknown, _req: Request, _res: Response, next: NextFunction) => {
    next(err);
  },
);

export default router;
