// src/routes/chat.routes.ts

import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { rateLimitMiddleware } from "../middleware/rateLimit.middleware";
import { ChatController, createChatController } from "../controllers/chat.controller";

const router = Router();

// Lazy controller: resolves ChatService from app.locals on first request
let _ctrl: ChatController | null = null;
function ctrl(req: any): ChatController {
  if (!_ctrl) {
    const svc = req.app?.locals?.services?.chat;
    if (!svc) {
      throw Object.assign(new Error("ChatService not wired"), { statusCode: 503 });
    }
    _ctrl = createChatController(svc);
  }
  return _ctrl;
}

/**
 * Conversations
 */
router.get(
  "/conversations",
  authMiddleware,
  rateLimitMiddleware,
  (req, res) => ctrl(req).listConversations(req, res)
);

router.get(
  "/conversations/:id/messages",
  authMiddleware,
  rateLimitMiddleware,
  (req, res) => ctrl(req).listMessages(req, res)
);

router.patch(
  "/conversations/:conversationId/title",
  authMiddleware,
  rateLimitMiddleware,
  (req, res) => ctrl(req).setTitle(req, res)
);

/**
 * Streaming response (SSE)
 */
router.post(
  "/stream",
  authMiddleware,
  rateLimitMiddleware,
  (req, res) => ctrl(req).stream(req, res)
);

/**
 * Non-streaming chat
 */
router.post(
  "/chat",
  authMiddleware,
  rateLimitMiddleware,
  (req, res) => ctrl(req).chat(req, res)
);

export default router;
