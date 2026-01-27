/**
 * Chat Routes
 * Clean REST API + SSE streaming for chat functionality.
 */
import { Router } from 'express';
import { ChatController, createChatController } from '../controllers/chat.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { aiLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Lazy controller: resolves ChatService from app.locals on first request
let _ctrl: ChatController | null = null;
function ctrl(req: any): ChatController {
  if (!_ctrl) {
    const svc = req.app?.locals?.services?.chat;
    if (!svc) {
      throw Object.assign(new Error('ChatService not wired'), { statusCode: 503 });
    }
    _ctrl = createChatController(svc);
  }
  return _ctrl;
}

// Conversation list + detail
router.get('/conversations', (req, res) => ctrl(req).listConversations(req, res));
router.get('/conversations/:conversationId/messages', (req, res) => ctrl(req).listMessages(req, res));

// Send message (non-streaming)
router.post('/conversations/:conversationId/messages', aiLimiter, (req, res) => ctrl(req).chat(req, res));

// SSE streaming
router.post('/conversations/:conversationId/messages/adaptive/stream', aiLimiter, (req, res) => ctrl(req).stream(req, res));

// Set/update title
router.patch('/conversations/:conversationId/title', (req, res) => ctrl(req).setTitle(req, res));

export default router;
