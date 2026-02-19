// src/routes/history.routes.ts

import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { rateLimitMiddleware } from "../middleware/rateLimit.middleware";
import { historyController } from "../controllers/history.controller";

const router = Router();

router.get(
  "/conversations",
  authMiddleware,
  rateLimitMiddleware,
  (req, res, next) => historyController.listConversations(req, res, next),
);

router.get(
  "/conversations/:id/summary",
  authMiddleware,
  rateLimitMiddleware,
  (req, res, next) => {
    // Map :id → :conversationId for controller
    (req.params as any).conversationId = req.params.id;
    historyController.getConversation(req, res, next);
  },
);

router.get(
  "/conversations/:id/messages",
  authMiddleware,
  rateLimitMiddleware,
  (req, res, next) => {
    // Return the full conversation (includes messages)
    (req.params as any).conversationId = req.params.id;
    historyController.getConversation(req, res, next);
  },
);

router.delete(
  "/conversations/:id",
  authMiddleware,
  rateLimitMiddleware,
  (req, res, next) => {
    (req.params as any).conversationId = req.params.id;
    historyController.deleteConversation(req, res, next);
  },
);

router.post(
  "/conversations/:id/restore",
  authMiddleware,
  rateLimitMiddleware,
  (req, res, next) => {
    (req.params as any).conversationId = req.params.id;
    req.body = { ...req.body, visibility: "active" };
    historyController.updateConversation(req, res, next);
  },
);

export default router;
