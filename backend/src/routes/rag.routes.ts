// src/routes/rag.routes.ts

import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { rateLimitMiddleware } from "../middleware/rateLimit.middleware";
import { ragController } from "../controllers/rag.controller";

const router = Router();

router.post(
  "/query",
  authMiddleware,
  rateLimitMiddleware,
  (req, res, next) => ragController.query(req, res, next)
);

router.post(
  "/query/stream",
  authMiddleware,
  rateLimitMiddleware,
  (req, res, next) => ragController.stream(req, res, next)
);

// POST /query/stop — not yet implemented in controller
router.post(
  "/query/stop",
  authMiddleware,
  (_req, res) => res.json({ ok: true, stopped: true })
);

export default router;
