/**
 * Chat Routes V1
 *
 * Clean REST API routes for chat functionality
 */

import { Router } from 'express';
import * as chatController from '../controllers/chat.controller';
import * as ragController from '../controllers/rag.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { aiLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Conversation routes
router.post('/conversations', chatController.createConversation);
router.get('/conversations', chatController.getConversations);
router.get('/conversations/:conversationId', chatController.getConversation);
router.delete('/conversations/:conversationId', chatController.deleteConversation);
router.delete('/conversations', chatController.deleteAllConversations);

// Message routes
router.post('/conversations/:conversationId/messages', aiLimiter, chatController.sendMessage);
router.get('/conversations/:conversationId/messages', chatController.getMessages);

// Streaming route - Frontend calls this endpoint
// Transforms request format and delegates to RAG streaming
router.post('/conversations/:conversationId/messages/adaptive/stream', aiLimiter, (req, res, next) => {
  // Transform frontend format (content) to RAG format (query, conversationId)
  req.body.query = req.body.content;
  req.body.conversationId = req.params.conversationId;
  next();
}, ragController.queryWithRAGStreaming);

// Utility routes
router.post('/regenerate-titles', chatController.regenerateTitles);

export default router;
