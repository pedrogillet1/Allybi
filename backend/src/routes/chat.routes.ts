/**
 * Chat Routes V1
 *
 * Clean REST API routes for chat functionality
 */

import { Router } from 'express';
import * as chatController from '../controllers/chat.controller';
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

// Utility routes
router.post('/regenerate-titles', chatController.regenerateTitles);

export default router;
