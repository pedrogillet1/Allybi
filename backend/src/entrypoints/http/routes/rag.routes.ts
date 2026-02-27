import { Router } from "express";
import { authMiddleware } from "../../../middleware/auth.middleware";
import { authorizeByMethod } from "../../../middleware/authorize.middleware";
import { rateLimitMiddleware } from "../../../middleware/rateLimit.middleware";
import { ragController } from "../../../controllers/rag.controller";
import { validate } from "../../../middleware/validate.middleware";
import { ragQuerySchema } from "../../../schemas/request.schemas";

const router = Router();
const authorizeRag = authorizeByMethod("rag");

router.post(
  "/query",
  authMiddleware,
  authorizeRag,
  rateLimitMiddleware,
  validate(ragQuerySchema),
  (req, res, next) => ragController.query(req, res, next),
);

router.post(
  "/query/stream",
  authMiddleware,
  authorizeRag,
  rateLimitMiddleware,
  validate(ragQuerySchema),
  (req, res, next) => ragController.stream(req, res, next),
);

router.post("/query/stop", authMiddleware, authorizeRag, (_req, res) =>
  res.json({ ok: true, stopped: true }),
);

export default router;
