// src/routes/health.routes.ts
//
// Clean health/readiness routes for Koda (Express).
// - No auth required
// - No heavy work
// - Deterministic JSON shapes (good for uptime monitors)
// - Optional deeper readiness checks (LLM, storage, vector db) via injected services

import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import prisma from "../config/database";
import { getBankLoaderInstance } from "../services/core/banks/bankLoader.service";
import { getContainer } from "../bootstrap/container";

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
  const env = String(process.env.NODE_ENV || "development").toLowerCase();
  const strict = env === "production" || env === "staging";

  const checks: Record<string, boolean> = {
    server: true,
    db: false,
    banks: false,
    retrievalStorage: false,
    retrievalEngineLoaded: false,
    answerEngineLoaded: false,
  };
  const details: Record<string, unknown> = {};

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = true;
  } catch (error: unknown) {
    details.dbError = error instanceof Error ? error.message : "db_ping_failed";
  }

  try {
    const bankLoader = getBankLoaderInstance();
    const bankHealth = bankLoader.health();
    checks.banks = Boolean(bankHealth.ok);
    details.bankHealth = bankHealth;
  } catch (error: unknown) {
    details.bankError =
      error instanceof Error ? error.message : "bank_health_failed";
  }

  try {
    await prisma.$queryRaw`SELECT 1 FROM "document_chunks" LIMIT 1`;
    checks.retrievalStorage = true;
  } catch (error: unknown) {
    details.retrievalStorageError =
      error instanceof Error ? error.message : "retrieval_storage_unavailable";
  }

  try {
    const container = getContainer();
    checks.retrievalEngineLoaded = Boolean(container.getRetrievalEngine());
    checks.answerEngineLoaded = Boolean(container.getAnswerEngine());
  } catch (error: unknown) {
    details.containerError =
      error instanceof Error ? error.message : "container_not_ready";
  }

  const requiredChecks = strict
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
  const payload: Record<string, unknown> = {
    ok: true,
    ts: new Date().toISOString(),
  };

  try {
    const bankLoader = getBankLoaderInstance();
    payload.bankHealth = bankLoader.health();
  } catch (error: unknown) {
    payload.ok = false;
    payload.bankError =
      error instanceof Error ? error.message : "bank_health_failed";
  }

  try {
    await prisma.$queryRaw`SELECT COUNT(*)::int AS total FROM "document_chunks"`;
    payload.retrievalStorage = "ok";
  } catch (error: unknown) {
    payload.ok = false;
    payload.retrievalStorageError =
      error instanceof Error ? error.message : "retrieval_storage_unavailable";
  }

  const status = payload.ok === true ? 200 : 503;
  res.status(status).json(payload);
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
